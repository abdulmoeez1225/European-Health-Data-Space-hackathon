// Serves the static export (out/) and proxies /api to the backend, like FastAPI does in production.
// Usage: npm run preview  (PORT=4173, GATEKEEPER_API=http://localhost:8000)
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "out");
const PORT = Number(process.env.PORT ?? 4173);
const API = new URL(process.env.GATEKEEPER_API ?? "http://localhost:8000");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

async function fileFor(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [join(ROOT, safe), join(ROOT, safe, "index.html"), join(ROOT, `${safe}.html`)]) {
    try {
      if ((await stat(candidate)).isFile() && candidate.startsWith(ROOT)) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function proxy(req, res) {
  const upstream = http.request(
    {
      hostname: API.hostname,
      port: API.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: API.host },
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: `Backend not reachable at ${API.origin}` }));
  });
  req.pipe(upstream);
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname.startsWith("/api/")) return proxy(req, res);
    const file = (await fileFor(pathname)) ?? join(ROOT, "404.html");
    res.writeHead(file.endsWith("404.html") && pathname !== "/404.html" ? 404 : 200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`Gatekeeper preview on http://localhost:${PORT} (API → ${API.origin})`);
  });
