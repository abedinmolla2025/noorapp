#!/usr/bin/env node
/**
 * Minimal static server for the built app (dist/).
 *
 * The repo build (`npm run build`) moves `dist/index.html` to
 * `dist/app.html`, so `vite preview` cannot serve it. This server serves
 * files from dist/ and falls back to `app.html` for SPA routes
 * (e.g. /demo/daily-content/poster-render?date=...), so the
 * BrowserRouter route resolves in headless rendering.
 *
 * Usage: node scripts/daily-content/poster/serve-dist.mjs [port]
 * Default port 4173. Logs "READY <port>" on stdout once listening.
 * No dependencies (node:http only).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "dist");
const port = Number(process.argv[2] ?? "4173");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let filePath = path.join(root, decodeURIComponent(url.pathname));
  // Never escape dist/.
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, "app.html");
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`READY ${port}`);
});
