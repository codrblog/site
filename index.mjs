import { createServer } from "http";
import { join } from "path";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, createReadStream } from "fs";
import { Configuration, OpenAIApi } from "openai";
import { spawnSync } from "child_process";

const CWD = process.cwd();
const apiKey = String(process.env.API_KEY);
const useCache = !Boolean(process.env.NO_CACHE);
const configuration = new Configuration({ apiKey });
const openai = new OpenAIApi(configuration);
const index = readFileSync("./index.html", "utf8");
const searchForm = readFileSync("./search.html", "utf8");
const script = readFileSync("./codr.js", "utf8");
const recents = [];
const pageEnd = "</body></html>";

async function serve(req, res) {
  if (req.url === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (req.url === "/favicon.png" || req.url === "/icon.png") {
    createReadStream(join(PWD, "assets", req.url)).pipe(res);
    return;
  }

  if (req.url === "/") {
    return renderContent(res, searchForm);
  }

  if (req.url === "/codr.js") {
    res.end(script);
    return;
  }

  if (req.url === "/@index") {
    const cacheList = spawnSync("head", ["-n1", join(CWD, "cache", "*")]);
    console.log(cacheList.stdout || cacheList.output);
    const list = String(cacheList.stdout || cacheList.output);
    const lines = list
      .trim()
      .split("\n")
      .filter((s) => s && s.startsWith("<!-- "))
      .map((s) => s.replace("<!-- ", "").replace(" -->", "").trim());

    res.end(JSON.stringify(lines));
    return;
  }

  if (req.url === "/@recents") {
    res.end(JSON.stringify(recents));
    return;
  }

  if (req.url.startsWith("/@suggestion")) {
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
    generate(suggestionPath, suggestion);
    return;
  }

  console.log(req.url);
  const urlPath = req.url;
  if (!recents.includes(urlPath)) {
    recents.unshift(urlPath);
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
    res.end(`<template id="content">${html}</template>${pageEnd}`);
  } catch (_e) {
    res.end('<template id="content">Failed to load article</template>');
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
  const hash = sha256(urlPath);
  const cachePath = join(CWD, "cache", hash);

  if (useCache && existsSync(cachePath) && !suggestion) {
    return readFileSync(cachePath, "utf8");
  }

  let prompt = `Create an HTML article that matches the following URL path: "${urlPath}".
Add relative href links in the content that point to related topics or tags.
Use semantic and SEO optimized markup and format it using Tailwind typography styles.
Generate only the content, not the HTML page around it and be very brief about the content, but show coding blocks if needed.
At the end of the article, provide a list with links related to the current page and the sources from where the article was generated
`;

  if (suggestion) {
    prompt += "Consider this suggestion for an improved content: " + suggestion;
  }

  const options = {
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  };

  const completion = await openai.createChatCompletion(options);
  const responses = completion.data.choices
    .map((c) => c.message.content)
    .join("\n");

  const article = `<!-- ${urlPath} -->\n\n${responses}`;

  if (useCache) {
    writeFileSync(cachePath, article);
  }

  return article;
}

createServer(serve).listen(process.env.PORT);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
