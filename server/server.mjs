export class Server {
  async serve(req, res) {
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
      res.end(lines.map((path) => baseUrl + path).join("\n"));
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
              `<li><a href="${line}">${line
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

  readAsset(res, path) {
    res.setHeader("cache-control", "max-age=604800");
    res.setHeader("content-type", mime.getType(path));
    createReadStream(join(CWD, "assets", path)).pipe(res);
  }
}

async function readBody(stream) {
  return new Promise((resolve) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
