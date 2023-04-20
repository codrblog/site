import { createServer } from "http";
import { join } from "path";
import { createHash } from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  createReadStream,
  readdirSync,
} from "fs";
import { Configuration, OpenAIApi } from "openai";
import { spawnSync } from "child_process";

const CWD = process.cwd();
const model = String(process.env.API_MODEL);
const apiKey = String(process.env.API_KEY);
const useCache = !Boolean(process.env.NO_CACHE);
const configuration = new Configuration({ apiKey });
const openai = new OpenAIApi(configuration);

const index = readFileSync("./index.html", "utf8");
const script = readFileSync("./codr.js", "utf8");
const promptText = readFileSync("./prompt.txt", "utf8");
const assets = readdirSync(join(CWD, "assets"));
const recents = [];

async function serve(req, res) {
  if (req.url === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (assets.includes(req.url.slice(1))) {
    createReadStream(join(CWD, "assets", req.url.slice(1))).pipe(res);
    return;
  }

  if (req.url === "/" || !req.url.replace('/article/', '')) {
    return renderContent(res, '');
  }

  if (req.url === "/codr.js") {
    res.end(script);
    return;
  }

  if (req.url === "/@index") {
    const lines = readIndex();

    if (!lines.length) {
      res.end(JSON.stringify(recents));
      return;
    }

    res.end(JSON.stringify(lines));
    return;
  }

  if (req.url === "/@recents") {
    res.end(JSON.stringify(recents));
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

    res.end();
    console.log("suggestion for %s", suggestionPath);
    console.log(suggestion);
    generate(suggestionPath, suggestion);
    return;
  }

  console.log(req.url);
  const urlPath = req.url;
  if (!urlPath.startsWith("/article/")) {
    res.writeHead(404);
    res.end();
    return;
  }

  if (!recents.includes(urlPath)) {
    recents.unshift(urlPath.replace());
  }

  if (recents.length > 100) {
    recents.pop();
  }

  renderContent(res, generate(urlPath));
}

async function renderContent(res, content) {
  res.write(index);

  try {
    const html = await content;
    res.end(`<template id="content">${html}</template>`);
  } catch (error) {
    console.log(error);
    res.end('<template id="tpl">Failed to load article :(</template>');
  }
}

async function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (c) => chunks.push(c));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function generate(urlPath, suggestion) {
  const fromCache = readFromCache(urlPath);

  if (useCache && !suggestion && fromCache) {
    console.log("from cache: %s", urlPath);
    return fromCache;
  }

  let prompt = promptText.replace(
    "{urlPath}",
    urlPath.replace("/article/", "")
  );

  if (suggestion) {
    prompt += "Consider this suggestion for an improved content: " + suggestion.slice(0, 255);
  }

  const options = {
    model,
    messages: [{ role: "user", content: prompt }],
  };

  console.log("from AI start: %s %s", urlPath, new Date().toISOString());
  const completion = await openai.createChatCompletion(options);
  const responses = completion.data.choices
    .map((c) => c.message.content)
    .join("\n");

  console.log("from AI end: %s %s", urlPath, new Date().toISOString());
  const article = `<!-- ${urlPath} -->\n\n${responses}`;

  if (useCache) {
    writeToCache(urlPath, article);
  }

  return article;
}

function writeToCache(url, content) {
  const filePath = join(CWD, "cache", sha256(url));
  writeFileSync(filePath, content);
  console.log("written to cache: %s", url);
}

function readFromCache(url) {
  const filePath = join(CWD, "cache", sha256(url));

  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf8");
  }

  return "";
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
    .trim()
    .split("\n")
    .filter((s) => Boolean(s.trim()) && s.startsWith("<!--"))
    .map((s) => s.replace("<!--", "").replace("-->", "").trim().slice(0, 255));

  return lines;
}

createServer(serve).listen(process.env.PORT);
recents.push(...readIndex());

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
