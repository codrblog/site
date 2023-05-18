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
const model = String(process.env.API_MODEL);
const apiKey = String(process.env.API_KEY);
const useCache = !Boolean(process.env.NO_CACHE);
const useStream = Boolean(process.env.API_STREAM);
const prefix = process.env.PROMPT_PREFIX || "";
const contentMarker = "<!--%content%-->";
const indexParts = readFileSync("./index.html", "utf8").split(contentMarker);
const promptText = `
Create an article, using only markdown format, that matches the following URL path: "${prefix}{urlPath}".
Provide the sources from where the article was created and be as truthful as possible.
Also try to create as much content as possible.
At the end of the article, generate at least 3 relative links with content related to the current page.
`;
const assets = readdirSync(join(CWD, "assets"));

function log(...args) {
  const time = `[${new Date().toISOString().slice(0, 19)}] `;
  if (typeof args[0] === "string") {
    return console.log(time + args[0], ...args.slice(1));
  }

  console.log(time, ...args);
}

async function serve(req, res) {
  if (req.url === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (assets.includes(req.url.slice(1))) {
    readAsset(res, req.url.slice(1));
    return;
  }

  if (req.url === "/" || !req.url.replace("/article/", "")) {
    renderRandomArticle(res);
    return;
  }

  if (req.url === "/@index") {
    const lines = readIndex().sort();
    const spacer = /_/g;
    const content =
      "<!-- html ready --><h1>Index</h1><nav><ul>" +
      lines
        .filter(Boolean)
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

  if (req.url.startsWith("/@suggestion/")) {
    if (!useCache) {
      res.writeHead(201);
      res.end();
      return;
    }

    const suggestion = await readBody(req);
    const suggestionPath = req.url.replace("/@suggestion", "");

    if (!suggestionPath) {
      req.writeHead(400);
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

    createCompletionWithCache(suggestionPath, suggestion);
    return;
  }

  const urlPath = req.url;
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
async function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (c) => chunks.push(c));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function streamContent(res, urlPath) {
  res.writeHead(200);
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

    if (next.includes("\n")) {
      res.write(Buffer.concat(buffer).toString("utf8"));
      buffer.length = 0;
    }
  });
  stream.on("end", () => res.end(indexParts[1]));
}

function createCompletionWithCache(urlPath, suggestion) {
  const filePath = getCachePath(urlPath);
  const stream = createCompletionRequest(urlPath, suggestion);

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

function createCompletionRequest(urlPath, suggestion) {
  const prompt =
    promptText.replace("{urlPath}", urlPath.replace("/article/", "")) +
    (suggestion
      ? "Consider this suggestion for an improved content: " +
        suggestion.slice(0, 255)
      : "");

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
  return content.replace(/^<\!-- .+? -->/, "");
}

function renderRandomArticle(res) {
  const cacheFiles = readdirSync(join(CWD, "cache"));
  const index =
    Math.floor(Math.random() * cacheFiles.length) % cacheFiles.length;
  const filePath = join(CWD, "cache", cacheFiles[index]);
  const content = readFileSync(filePath, "utf8");
  const html = content.replace(htmlMarker, "").replace(/^<\!-- .+? -->/, "");
  const href = parseArticleLinkComment(content);
  const footerLink = `\n\nLink: <a href="${href}">${href}</a>`;

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(indexParts.join(html + footerLink));
}

function readIndex() {
  const cacheFiles = readdirSync(join(CWD, "cache"));
  const headers = cacheFiles
    .map((file) =>
      spawnSync("head", ["-n1", join(CWD, "cache", file)], { encoding: "utf8" })
    )
    .map((sh) => String(sh.stdout || sh.output))
    .join("\n");

  const lines = headers
    .split("\n")
    .filter((s) => Boolean(s.trim()) && s.startsWith("<!--"))
    .map(parseArticleLinkComment);

  return lines;
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
