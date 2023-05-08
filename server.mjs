import { createServer } from "http";
import { request } from "https";
import { join } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import {
  readFileSync,
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
const contentMarker = '<!--%content%-->';
const indexParts = readFileSync("./index.html", "utf8").split(contentMarker);
const promptText = readFileSync("./prompt.txt", "utf8");
const assets = readdirSync(join(CWD, "assets"));

async function serve(req, res) {
  if (req.url === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (assets.includes(req.url.slice(1))) {
    res.setHeader('cache-control', 'max-age=604800');
    createReadStream(join(CWD, "assets", req.url.slice(1))).pipe(res);
    return;
  }

  if (req.url === "/" || !req.url.replace('/article/', '')) {
    res.end(indexParts.join(''));
    return;
  }

  if (req.url === "/@index") {
    const lines = readIndex().sort();
    const spacer = /_/g;
    const content = '<h1>Index</h1><nav><ul>' +
      lines.map(line => `<li><a href="${line}">${line.replace(spacer, ' ').replace("/article/", "")}</a></li>`)
      .join('') + '</ul></nav>';

    res.end(content);
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

    if (String(suggestion).trim().toLowerCase() === 'delete it') {
      removeFromCache(suggestionPath);
      res.writeHead(204);
      res.end();
      return;
    }

    res.end();
    console.log("suggestion for %s", suggestionPath);
    console.log(suggestion);

    generate(suggestionPath, suggestion);
    return;
  }

  const urlPath = req.url;
  if (!urlPath.startsWith("/article/")) {
    res.writeHead(404);
    res.end();
    return;
  }

  console.log(new Date().toISOString(), req.url);
  streamContent(res, urlPath);
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
    console.log("from cache: %s", urlPath);
    res.write(readFromCache(urlPath));
    res.write(indexParts[1]);
    res.end();
    return;
  }

  const filePath = getCachePath(urlPath);
  const fileHandle = useCache ? createWriteStream(filePath) : null;
  fileHandle?.write(`<!-- ${urlPath} -->\n\n`);

  const stream = createCompletion(urlPath, '');
  stream.on('data', (event) => {
    const next = String(event).replace('data:', '').trim();
    if (next !== '[DONE]') {
      fileHandle?.write(next);
      res.write(next);
    }
  });

  stream.on('end', () => {
    fileHandle?.end();
    res.write(indexParts[1]);
    res.end();
  });
}

function createCompletion(urlPath, suggestion) {
  const prompt = promptText.replace(
    "{urlPath}",
    urlPath.replace("/article/", "")
  ) + (suggestion ? "Consider this suggestion for an improved content: " + suggestion.slice(0, 255) : '');

  const body = {
    model,
    stream: true,
    messages: [{ role: "user", content: prompt }],
  };

  const stream = request('https://api.openai.com/v1/chat/completions', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }
  });
  stream.write(JSON.stringify(body));
  stream.end();

  return stream;
}

async function generate(urlPath, suggestion) {
  const filePath = getCachePath(urlPath);
  const fileHandle = createWriteStream(filePath);
  fileHandle.write(`<!-- ${urlPath} -->\n\n`);

  const stream = createCompletion(urlPath, suggestion);
  stream.on('data', (event) => {
    const next = String(event).replace('data:', '').trim();
    fileHandle.write(next);
  });

  stream.on('end', () => {
    fileHandle.end();
  });
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
  return readFileSync(filePath, "utf8");
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

createServer(serve).listen(process.env.PORT);
