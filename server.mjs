import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { request } from "node:https";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import mime from "mime";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  createReadStream,
  readdirSync,
  createWriteStream,
} from "fs";

const CWD = process.cwd();
const apiKey = String(process.env.API_KEY);
const bufferMaxLength = Number(process.env.BUFFER_MAX_LENGTH);
const model = String(process.env.API_MODEL);
const useCache = !Boolean(process.env.NO_CACHE);
const useStream = Boolean(process.env.API_STREAM);
const prefix = process.env.PROMPT_PREFIX || "";
const appName = String(process.env.APP_NAME);
const htmlMarker = "<!-- html ready -->";
const contentMarker = "<!--%content%-->";
const manifest = readFileSync("./assets/manifest.json", "utf-8").replace(
  "{name}",
  appName
);
const indexParts = readFileSync("./index.html", "utf8")
  .replace("{name}", appName)
  .split(contentMarker);

const promptText = `Write an article, in markdown text, that matches the following URL path: "${prefix}{urlPath}".
Provide valid sources from where the article was created and be as truthful as possible.
At the end of the article generate at least 3 relative links with further readings relative to the current page`;
const assets = readdirSync(join(CWD, "assets"));

function log(...args) {
  const time = `[${new Date().toISOString().slice(0, 19)}] `;
  if (typeof args[0] === "string") {
    return console.log(time + args[0], ...args.slice(1));
  }

  console.log(time, ...args);
}

async function serve(req, res) {
  const parsedUrl = new URL(req.url, "http://localhost/");
  const urlPath = parsedUrl.pathname;

  if (urlPath === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (urlPath === "/manifest.json") {
    res.end(manifest);
    return;
  }

  if (assets.includes(urlPath.slice(1))) {
    readAsset(res, req.url.slice(1));
    return;
  }

  if (urlPath === "/" || !urlPath.replace("/article/", "")) {
    renderRandomArticle(res);
    return;
  }

  if (urlPath === "/sitemap.txt") {
    const lines = readIndex();
    const domain = req.headers["x-forwarded-for"];
    const proto = req.headers["x-forwarded-proto"];
    const baseUrl = `${proto}://${domain}`;

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(lines.map(({ url }) => String(new URL(url, baseUrl))).join("\n"));
    return;
  }

  if (urlPath === "/@index") {
    const lines = updateIndex();
    const spacer = /_/g;
    const content =
      "<h1>Index</h1><nav><ul>" +
      lines
        .map(
          (line) =>
            `<li><a href="${line.url}">${line.url
              .replace(spacer, " ")
              .replace("/article/", "")}</a></li>`
        )
        .join("") +
      "</ul></nav><!-- html ready -->";

    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(indexParts[0]);
    res.write(content);
    res.write(indexParts[1]);
    res.end();
    return;
  }

  if (urlPath.startsWith("/@suggestion/")) {
    if (!useCache) {
      res.writeHead(201);
      res.end();
      return;
    }

    const suggestion = await readBody(req);
    const suggestionPath = urlPath.replace("/@suggestion", "");

    if (!suggestionPath || !isCached(suggestionPath)) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (String(suggestion).trim().toLowerCase() === "delete it") {
      res.writeHead(204);
      res.end();
      log("delete %s", suggestionPath);
      removeFromCache(suggestionPath);
      updateIndex();
      return;
    }

    res.end();
    log("update %s", suggestionPath);
    log("suggestion: ", suggestion);

    editArticle(suggestionPath, suggestion);
    return;
  }

  if (!urlPath.startsWith("/article/")) {
    res.writeHead(404);
    res.end();
    return;
  }

  streamContent(res, urlPath);
}

function readAsset(res, path) {
  res.setHeader("cache-control", "max-age=604800");
  res.setHeader("content-type", mime.getType(path));
  createReadStream(join(CWD, "assets", path)).pipe(res);
}

async function readBody(stream) {
  return new Promise((resolve) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function streamContent(res, urlPath) {
  res.writeHead(200, { "content-type": "text/html" });
  res.write(indexParts[0]);

  if (useCache && isCached(urlPath)) {
    log("from cache: %s", urlPath);
    res.write(readFromCache(urlPath));
    res.write(indexParts[1]);
    res.end();
    return;
  }

  const stream = createCompletionWithCache(urlPath);
  const buffer = [];
  stream.on("data", (next) => {
    buffer.push(next);

    if (next.includes("\n") || buffer.length > bufferMaxLength) {
      res.write(buffer.join(""));
      buffer.length = 0;
    }
  });
  stream.on("end", () => {
    res.write(buffer.join(""));
    res.end(indexParts[1]);
    updateIndex();
  });
}

function editArticle(urlPath, suggestion) {
  const cachedText = readFromCache(urlPath);
  const remote = request("https://api.openai.com/v1/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  remote.on("response", async (response) => {
    const text = await readBody(response);
    const filePath = getCachePath(urlPath);
    const body = JSON.parse(text);
    let newArticle = body.choices[0].text.trim();

    log("Update article %s", urlPath);
    log(newArticle);

    if (!newArticle) {
      return;
    }

    if (!newArticle.includes(urlPath)) {
      newArticle = createUrlHeader(urlPath) + newArticle;
    }

    writeFileSync(filePath, newArticle);
  });

  const payload = JSON.stringify(
    {
      model: "text-davinci-edit-001",
      input: cachedText,
      instruction: suggestion,
    },
    null,
    2
  );

  log("edit payload: %s", payload);
  remote.end(payload);
}

function createCompletionWithCache(urlPath) {
  const filePath = getCachePath(urlPath);
  const stream = createCompletionRequest(urlPath);

  if (useCache) {
    const fileHandle = createWriteStream(filePath);
    fileHandle.write(createUrlHeader(urlPath));

    stream.on("data", (next) => fileHandle.write(next));
    stream.on("end", () => {
      fileHandle.end();
      renderAndUpdateCache(urlPath);
    });
  }

  return stream;
}

function createUrlHeader(urlPath) {
  return `<!-- ${urlPath} -->\n\n`;
}

function renderAndUpdateCache(urlPath) {
  const remote = request("https://markdown.jsfn.run?html=1", {
    method: "POST",
  });

  remote.on("response", async (response) => {
    if (response.statusCode !== 200) {
      return;
    }

    const header = createUrlHeader(urlPath);
    let html = await readBody(response);

    if (!html.includes(header)) {
      html = header + html;
    }

    writeFileSync(getCachePath(urlPath), html + htmlMarker);
  });

  const cacheContent = readFromCache(urlPath);
  remote.write(cacheContent);
  remote.end();
}

function createCompletionRequest(urlPath) {
  const prompt = promptText.replace(
    "{urlPath}",
    urlPath.replace("/article/", "")
  );

  const body = {
    model,
    stream: useStream,
    messages: [{ role: "user", content: prompt }],
  };

  const stream = request("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
  });

  const output = new EventEmitter();
  stream.on("response", (r) => {
    const chunks = [];

    r.on("data", (event) => {
      if (useStream) {
        event
          .toString("utf8")
          .split("\n\n")
          .map((line) => {
            const next = line.trim().replace("data: ", "").trim();

            if (!next || next === "[DONE]") {
              return;
            }

            const token = JSON.parse(next).choices[0].delta.content;
            if (token) {
              output.emit("data", token);
            }
          });
        return;
      }

      chunks.push(event);
    });

    r.on("end", () => {
      if (useStream) {
        output.emit("end");
        return;
      }

      const json = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      log("completion", json);

      if (json?.choices) {
        output.emit(
          "data",
          String(json.choices.map((c) => c.message.content).join(""))
        );
      }

      output.emit("end");
    });
  });

  const payload = JSON.stringify(body, null, 2);
  log("payload: %s", payload);
  stream.end(payload);

  return output;
}

function getCachePath(url) {
  return join(CWD, "cache", sha256(url));
}

function isCached(url) {
  const filePath = getCachePath(url);

  return existsSync(filePath);
}

function removeFromCache(url) {
  const filePath = getCachePath(url);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

function readFromCache(url) {
  const filePath = getCachePath(url);
  const content = readFileSync(filePath, "utf8");
  return content.slice(content.indexOf("\n\n"));
}

function renderRandomArticle(res) {
  const index = readIndex();
  const id = Math.floor(Math.random() * index.length) % index.length;
  const content = readFromCache(index[id].url);
  const contentAndFooter =
    content.replace(/^<\!--.+?-->/g, "") +
    "\n\n" +
    `<a rel="bookmark" href="${index[id].url}">Link</a>`;

  res.writeHead(200, { "Content-Type": "text/html" });
  res.write(indexParts[0]);
  res.write(contentAndFooter);
  res.write(indexParts[1]);
  res.end();
}

let cachedIndex = [];

function updateIndex() {
  const cacheFiles = readdirSync(join(CWD, "cache"));

  cachedIndex = cacheFiles
    .map((file) => {
      const filePath = join(CWD, "cache", file);
      const sh = spawnSync("head", ["-n1", filePath], {
        encoding: "utf8",
      });

      const url = String(sh.stdout || sh.output)
        .split("\n")
        .filter((s) => Boolean(s.trim()) && s.startsWith("<!--"))
        .map(parseArticleLinkComment)
        .filter(Boolean)[0];

      if (!url) {
        unlinkSync(filePath);
        return null;
      }

      return { file, url };
    })
    .filter(Boolean);

  return cachedIndex;
}

function readIndex() {
  if (!cachedIndex.length) {
    return updateIndex();
  }

  return cachedIndex;
}

function parseArticleLinkComment(text) {
  const start = text.indexOf("<!--");
  const end = text.indexOf("-->");
  const link = text.slice(start + 4, end).trim();

  return link.replace("//", "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

createServer(serve).listen(process.env.PORT);
