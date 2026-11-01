import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(".");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".map": "application/json",
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      file = resolve(
        root,
        "." +
          (pathname === "/"
            ? "/demos/index.html"
            : pathname === "/favicon.ico"
              ? "/docs/assets/branding/favicon.svg"
              : pathname),
      );
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(302, { location: pathname + "/index.html" }).end();
      return;
    }
    const data = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(Number(process.env.PORT ?? 4173), "0.0.0.0", () =>
  console.log("Animatter → http://localhost:4173"),
);
