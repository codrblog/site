import { EventEmitter } from "events";
import { createServer } from "http";
import { request } from "https";
import { join } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
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
  const pathName = parsedUrl.pathname;

  if (pathName === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (pathName === "/manifest.json") {
    res.end(manifest);
    return;
  }

  if (assets.includes(pathName.slice(1))) {
    readAsset(res, req.url.slice(1));
    return;
  }

  if (pathName === "/" || !pathName.replace("/article/", "")) {
    renderRandomArticle(res);
    return;
  }

  if (pathname === "/sitemap.txt") {
    const lines = readIndex();
    const domain = req.headers["x-forwarded-for"];
    const proto = req.headers["x-forwarded-proto"];
    const baseUrl = `${proto}://${domain}`;

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(lines.map((path) => baseUrl + path).join("\n"));
    return;
  }

  if (pathName === "/@index") {
    const lines = readIndex();
    const spacer = /_/g;
    const content =
      "<!-- html ready --><h1>Index</h1><nav><ul>" +
      lines
        .map(
          (line) =>
            `<li><a href="${line}">${line
              .replace(spacer, " ")
              .replace("/article/", "")}</a></li>`
        )
        .join("") +
      "</ul></nav>";

    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(indexParts[0]);
    res.write(content);
    res.write(indexParts[1]);
    res.end();
    return;
  }

  if (pathName.startsWith("/@suggestion/")) {
    if (!useCache) {
      res.writeHead(201);
      res.end();
      return;
    }

    const suggestion = await readBody(req);
    const suggestionPath = pathName.replace("/@suggestion", "");

    if (!suggestionPath || !isCached(suggestionPath)) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (String(suggestion).trim().toLowerCase() === "delete it") {
      log("delete %s", suggestionPath);
      removeFromCache(suggestionPath);
      res.writeHead(204);
      res.end();
      return;
    }

    res.end();
    log("update %s", suggestionPath);
    log("suggestion: ", suggestion);

    editArticle(suggestionPath, suggestion);
    return;
  }

  if (!pathName.startsWith("/article/")) {
    res.writeHead(404);
    res.end();
    return;
  }

  streamContent(res, pathName);
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

async function streamContent(res, urlPath) {
  res.writeHead(200, { "content-type": "text/html" });
  res.write(indexParts[0]);

  if (useCache && isCached(urlPath)) {
    log("from cache: %s", urlPath);
    res.write(await readFromCache(urlPath));
    res.write(indexParts[1]);
    res.end();
    return;
  }

  const stream = createCompletionWithCache(urlPath, "");
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

async function editArticle(urlPath, suggestion) {
  const cachedText = await readFromCache(urlPath);
  const remote = request("https://api.openai.com/v1/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  remote.on("response", (r) => {
    const chunks = [];
    r.on("data", (c) => chunks.push(c));
    r.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const filePath = getCachePath(urlPath);
      const body = JSON.parse(text);
      const newArticle = body.choices[0].text;

      log("Update article %s", urlPath);
      log(newArticle);

      writeFileSync(filePath, newArticle);
    });
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
    fileHandle.write(`<!-- ${urlPath} -->\n\n`);

    stream.on("data", (next) => fileHandle.write(next));
    stream.on("end", () => {
      fileHandle.end();
      renderAndUpdateCache(urlPath);
    });
  }

  return stream;
}

async function renderAndUpdateCache(urlPath) {
  const remote = request("https://markdown.jsfn.run?html=1", {
    method: "POST",
  });

  remote.on("response", (s) => {
    if (s.statusCode !== 200) {
      return;
    }

    const chunks = [];
    s.on("data", (data) => chunks.push(data));
    s.on("end", () => {
      const html = Buffer.concat(chunks).toString("utf8");
      writeFileSync(getCachePath(urlPath), html + htmlMarker);
    });
  });

  const cacheContent = await readFromCache(urlPath);
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

const htmlMarker = "<!-- html ready -->";

async function readFromCache(url) {
  const filePath = getCachePath(url);
  const content = readFileSync(filePath, "utf8");
  return content.replace(/^<\!--.+?-->/, "");
}

async function renderRandomArticle(res) {
  const index = readIndex();
  const id = Math.floor(Math.random() * index.length) % index.length;
  const content = await readFromCache(index[id]);
  const href = parseArticleLinkComment(content.replace(htmlMarker, ""));
  const footerLink = `\n\n<a href="${href}">Go to article</a>`;

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(indexParts.join(html.replace(/^<\!--.+?-->/g, "") + footerLink));
}

let cachedIndex = [];
function updateIndex() {
  const cacheFiles = readdirSync(join(CWD, "cache"));
  const headers = cacheFiles
    .map((file) =>
      spawnSync("head", ["-n1", join(CWD, "cache", file)], { encoding: "utf8" })
    )
    .map((sh) => String(sh.stdout || sh.output))
    .join("\n");

  cachedIndex = headers
    .split("\n")
    .filter((s) => Boolean(s.trim()) && s.startsWith("<!--"))
    .map(parseArticleLinkComment)
    .filter(Boolean);
}

function readIndex() {
  if (!cachedIndex.length) {
    updateIndex();
  }

  return cachedIndex;
}

function parseArticleLinkComment(text) {
  const start = text.indexOf("<!--");
  const end = text.indexOf("-->");

  return text.slice(start + 4, end).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

createServer(serve).listen(process.env.PORT);
