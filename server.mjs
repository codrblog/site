import { EventEmitter } from "events";
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
const useStream = Boolean(process.env.API_STREAM);
const contentMarker = '<!--%content%-->';
const indexParts = readFileSync("./index.html", "utf8").split(contentMarker);
const promptText = readFileSync("./prompt.txt", "utf8");
const assets = readdirSync(join(CWD, "assets"));

function log(...args) {
  const time = `[${new Date().toISOString().slice(0, 19)}] `;
  if (typeof args[0] === 'string') {
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
      log('delete %s', suggestionPath);
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
    res.write(readFromCache(urlPath));
    res.write(indexParts[1]);
    res.end();
    return;
  }

  const stream = createCompletionWithCache(urlPath, '');
  stream.on('data', (next) => res.write(next));
  stream.on('end', () => res.end(indexParts[1]));
}

function createCompletionWithCache(urlPath, suggestion) {
  const filePath = getCachePath(urlPath);
  const stream = createCompletionRequest(urlPath, suggestion);

  if (useCache) {
    const fileHandle = createWriteStream(filePath);
    fileHandle.write(`<!-- ${urlPath} -->\n\n`);
  
    stream.on('data', (next) => fileHandle.write(next));
    stream.on('end', () => fileHandle.end());
  }

  return stream;
}

function createCompletionRequest(urlPath, suggestion) {
  const prompt = promptText.replace(
    "{urlPath}",
    urlPath.replace("/article/", "")
  ) + (suggestion ? "Consider this suggestion for an improved content: " + suggestion.slice(0, 255) : '');

  const body = {
    model,
    stream: useStream,
    messages: [{ role: "user", content: prompt }],
  };

  const stream = request('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    }
  });
  
  const output = new EventEmitter();
  stream.on('response', (r) => {
    const chunks = [];
    
    r.on('data', (event) => {
      if (useStream) {
        event.toString('utf8').split('\n\n').map(line => {
          const next = line.trim().replace('data: ', '').trim();
          
          if (!next || next === '[DONE]') {
            return;
          }
          
          const token = JSON.parse(next).choices[0].delta.content;
          if (token) {
            output.emit('data', token);
          }
        });
        return;
      }

      chunks.push(event);
    });
  
    r.on('end', () => {
      if (useStream) {
        output.emit('end');
        return;
      }

      const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      log('completion', json);
      
      if (json?.choices) {
        output.emit('data', String(json.choices.map((c) => c.message.content).join("")));
      }

      output.emit('end');
    });
  });

  const payload = JSON.stringify(body, null, 2);
  log('payload: %s', payload);
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
