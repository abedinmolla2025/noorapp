import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import prerenderModule from "../api/prerender.js";
import sitemapModule from "../api/sitemap.js";

const prerender = typeof prerenderModule === "function" ? prerenderModule : prerenderModule.default;
const sitemap = typeof sitemapModule === "function" ? sitemapModule : sitemapModule.default;

function mockRes() {
  return {
    statusCode: 200,
    body: "",
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(body) { this.body = String(body ?? ""); return this; },
  };
}

async function getPrerender(path) {
  const res = mockRes();
  await prerender({ query: { path }, headers: { host: "noorapp.in" } }, res);
  return res;
}

function count(text, regex) {
  return [...text.matchAll(regex)].length;
}

// /search is not a standalone route; it must remain a genuine 404, not a thin 200 shell.
const search = await getPrerender("/search");
assert.equal(search.statusCode, 404);
assert.match(search.body, /name="robots" content="noindex,follow"/);

// Settings and Notifications are client surfaces with consistent, non-personal noindex metadata.
for (const [path, expectedTitle] of [
  ["/settings", "Settings — Noor Islamic App"],
  ["/notifications", "Notifications — Noor Islamic App"],
]) {
  const res = await getPrerender(path);
  assert.equal(res.statusCode, 200, `${path} must return its app shell`);
  assert.equal(count(res.body, /<title>/gi), 1, `${path} should have one title`);
  assert.equal(count(res.body, /<meta name="description"/gi), 1, `${path} should have one description`);
  assert.equal(count(res.body, /<meta name="robots"/gi), 1, `${path} should have one robots tag`);
  assert.equal(count(res.body, /<link rel="canonical"/gi), 1, `${path} should have one canonical`);
  assert.equal(count(res.body, /<meta property="og:url"/gi), 1, `${path} should have one OG URL`);
  assert.match(res.body, new RegExp(`<title>${expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`));
  assert.match(res.body, new RegExp(`<meta name="robots" content="noindex,nofollow"`));
  assert.match(res.body, new RegExp(`<link rel="canonical" href="https://noorapp\\.in${path}"`));
  assert.match(res.body, new RegExp(`<meta property="og:url" content="https://noorapp\\.in${path}"`));
  assert.match(res.body, /<meta property="og:type" content="website"/);
}
const notifications = await getPrerender("/notifications");
assert.match(notifications.body, /View public announcements and important updates from Noor\./);
assert.doesNotMatch(notifications.body, /user-specific|private notification content/i);

// Legacy Names URL and the app shortcut/sitemap agree on the established canonical page.
const names = await getPrerender("/names");
assert.equal(names.statusCode, 301);
assert.equal(names.headers.location, "https://noorapp.in/baby-names");
const babyNames = await getPrerender("/baby-names");
assert.equal(babyNames.statusCode, 200);
assert.equal(count(babyNames.body, /<link rel="canonical"/gi), 1);
assert.match(babyNames.body, /<link rel="canonical" href="https:\/\/noorapp\.in\/baby-names"/);
assert.match(babyNames.body, /<meta name="robots" content="index,follow"/);
const humanSitemap = await getPrerender("/sitemap");
assert.equal(humanSitemap.statusCode, 200);
assert.equal(count(humanSitemap.body, /<meta name="robots"/gi), 1);
assert.match(humanSitemap.body, /<meta name="robots" content="noindex,follow"/);
assert.match(humanSitemap.body, /<link rel="canonical" href="https:\/\/noorapp\.in\/sitemap"/);
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
assert.ok(vercel.redirects.some((r) => r.source === "/names" && r.destination === "/baby-names" && r.statusCode === 301));
const featureIcons = readFileSync("src/components/FeatureIcons.tsx", "utf8");
assert.match(featureIcons, /label: "Names"[\s\S]*?path: "\/baby-names"/);

// Generate the XML sitemap with all fetches mocked; no live API or production data is contacted.
const originalFetch = globalThis.fetch;
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
};
for (const key of Object.keys(originalEnv)) delete process.env[key];
globalThis.fetch = async () => Response.json([]);
try {
  const res = mockRes();
  await sitemap({}, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /application\/xml/);
  assert.match(res.body, /<loc>https:\/\/noorapp\.in\/baby-names<\/loc>/);
  assert.doesNotMatch(res.body, /<loc>https:\/\/noorapp\.in\/names<\/loc>/);
  assert.doesNotMatch(res.body, /<loc>https:\/\/noorapp\.in\/sitemap<\/loc>/);
  const locs = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locs).size, locs.length, "sitemap URLs must remain unique");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

// Source-level consistency checks for the user-facing React SEO output.
const seoHead = readFileSync("src/components/seo/SeoHead.tsx", "utf8");
assert.doesNotMatch(seoHead, /SearchAction|\/search\?q=/);
assert.match(seoHead, /\["\/settings", "\/notifications", "\/sitemap"\]/);
assert.match(seoHead, /noindex,follow/);
assert.match(seoHead, /noindex,nofollow/);
assert.doesNotMatch(readFileSync("src/pages/SettingsPage.tsx", "utf8"), /<Helmet|noindexHelmet/);
assert.doesNotMatch(readFileSync("src/pages/NotificationsPage.tsx", "utf8"), /<Helmet/);
assert.doesNotMatch(readFileSync("src/pages/SitemapPage.tsx", "utf8"), /<Helmet/);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.doesNotMatch(appSource, /path=["']\/search["']/);
assert.match(appSource, /<Route path="\/baby-names" element={<NamesPage \/>} \/>/);
assert.match(appSource, /<Route path="\/names" element={<Navigate to="\/baby-names" replace \/>} \/>/);
assert.doesNotMatch(appSource, /path="\/baby-names\//);

console.log("PASS: /search 404; Settings/Notifications metadata; Names canonical/alias; /sitemap status/noindex; mocked XML sitemap.");
