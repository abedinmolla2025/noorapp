// Simulates the Vercel prerender handler locally against the current repo.
// Usage: node scripts/simulate-prerender.mjs "/99-names" "/quiz" ...
// Prints: status, robots, canonical, and content checks per route.
import handler from "../api/prerender.js";

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    send(b) { this.body = String(b ?? ""); return this; },
    end(b) { if (b !== undefined) this.body = String(b); return this; },
  };
  return res;
}

const routes = process.argv.slice(2);
if (!routes.length) {
  console.error("Usage: node scripts/simulate-prerender.mjs <path...>");
  process.exit(1);
}

for (const routePath of routes) {
  const req = { query: { path: routePath }, headers: { "user-agent": "Googlebot" } };
  const res = makeRes();
  await handler(req, res);
  const body = res.body;
  const robots = (body.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || "n/a";
  const canonical = (body.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "n/a";
  const title = (body.match(/<title>([^<]*)<\/title>/) || [])[1] || "n/a";
  const hasAdsense = /pagead2\.googlesyndication|adsbygoogle/.test(body);
  console.log(JSON.stringify({ route: routePath, status: res.statusCode, robots, canonical, hasAdsense, titleLen: title.length }));
  // stash body for chained checks
  globalThis.__lastBody = body;
}
