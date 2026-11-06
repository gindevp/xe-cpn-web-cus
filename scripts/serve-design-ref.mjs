import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../design-ref/project");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    let u = decodeURIComponent((req.url || "/").split("?")[0]);
    if (u === "/") u = "/ChoBanGiao.dc.html";
    const f = path.join(root, u.replace(/^\//, ""));
    if (!f.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(f, (e, b) => {
      if (e) {
        res.writeHead(404);
        res.end("404");
        return;
      }
      res.writeHead(200, { "Content-Type": mime[path.extname(f)] || "text/plain" });
      res.end(b);
    });
  })
  .listen(7190, "127.0.0.1", () => {
    console.log("design-ref on http://127.0.0.1:7190");
  });
