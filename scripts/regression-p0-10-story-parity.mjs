/**
 * P0-10 regression: story bot/human content parity (TRK2-024).
 *
 * Required invariant: the prerender's /stories/<slug> bot HTML must represent
 * the same canonical story content the SPA serves humans. The SPA
 * (StoryDetailPage via useStories/loadStoriesFromDb) resolves the published
 * DB row first and falls back to the bundled record only when the story is
 * not published in the DB. The prerender must do the same — reading the thin
 * bundled summaries first caused 71/72 pages of bot/human divergence.
 *
 * This test:
 *  1. Statically asserts the story detail branch reads the published DB row
 *     BEFORE the bundled fallback.
 *  2. Invokes the real api/prerender.js handler for 3 DB-published stories
 *     and asserts the FULL DB narrative (the same field the SPA renders by
 *     default) is present in the bot HTML — not the thin bundled summary.
 *  3. Asserts the bundled fallback still works for stories not in the DB.
 *  4. Asserts unpublished/draft and unknown slugs never leak (404/410,
 *     noindex).
 *
 * Usage: node scripts/regression-p0-10-story-parity.mjs
 * Exit 0 = parity holds. Exit 1 = failures listed.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const failures = [];
const fail = (gate, detail) => failures.push(`[${gate}] ${detail}`);
const ok = (gate, detail) => console.log(`PASS  ${gate} — ${detail}`);

// The same read-only anon path the production prerender uses.
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://llicfiepatzgllmjhzbw.supabase.co",
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0"
);

// Mirror of api/prerender.js esc(): bot HTML escapes the narrative.
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// ---- 1. Static: DB published-row read precedes the bundled fallback ----
{
  const src = fs.readFileSync(path.join(ROOT, "api/prerender.js"), "utf8");
  const branchStart = src.indexOf('routePath.startsWith("/stories/")');
  const branchEnd = src.indexOf("// --- Crawlable HTML sitemap ---", branchStart);
  const branch = src.slice(branchStart, branchEnd);
  const dbRead = branch.indexOf('.from("admin_content")');
  const bundledRead = branch.indexOf("findBundledStory(slug)");
  if (branchStart < 0 || dbRead < 0) fail("static-order", "story branch has no published-DB read");
  else if (bundledRead >= 0 && bundledRead < dbRead)
    fail("static-order", "bundled story is resolved BEFORE the published DB row (P0-10 divergence)");
  else if (!/story\s*=\s*data\s*\|\|\s*findBundledStory\(slug\)/.test(branch))
    fail("static-order", "story resolution is not `story = data || findBundledStory(slug)`");
  else ok("static-order", "story detail branch reads published DB row first, bundled fallback second");
  if (!/\.eq\("status",\s*"published"\)/.test(branch))
    fail("static-published", "story DB read is not restricted to status=published");
  else ok("static-published", "story DB read is status=published-gated (drafts never leak)");
}

// ---- 2/3/4. Runtime: invoke the real handler ----
const prerender = await import("../api/prerender.js");
const handler = prerender.default;
const mockRes = () => ({
  statusCode: 200, body: "", headers: {},
  status(c) { this.statusCode = c; return this; },
  setHeader(k, v) { this.headers[k] = v; return this; },
  send(b) { this.body = String(b ?? ""); return this; },
});
const get = async (p) => {
  const res = mockRes();
  await handler({ query: { path: p }, headers: {} }, res);
  return res;
};

// 3 DB-published stories with long narratives (also present, thin, in the bundle).
const PARITY_SLUGS = ["prophet-musa-story-islam", "prophet-yunus-story-islam", "prophet-yusuf-story-islam"];
for (const slug of PARITY_SLUGS) {
  const { data: row, error } = await supabase
    .from("admin_content")
    .select("slug,title,content,content_en,status")
    .eq("slug", slug).eq("content_type", "story").eq("status", "published")
    .maybeSingle();
  if (error || !row) { fail("parity-" + slug, "DB published row missing: " + (error?.message || "no row")); continue; }
  // The SPA renders story.content_bn (= DB `content`) by default; the bot
  // HTML must carry the same full narrative.
  const narrative = row.content || "";
  const res = await get(`/stories/${slug}`);
  if (res.statusCode !== 200) { fail("parity-" + slug, `expected 200, got ${res.statusCode}`); continue; }
  if (!/index,follow/.test(res.headers["X-Robots-Tag"] || "") && !/<meta name="robots" content="index,follow"/.test(res.body))
    fail("parity-" + slug, "expected index,follow robots");
  const expectedHtml = esc(narrative).replace(/\n/g, "<br/>");
  if (!res.body.includes(expectedHtml)) {
    fail("parity-" + slug, `bot HTML is missing the full DB narrative (${narrative.length} chars)`);
    continue;
  }
  // The thin bundled summary must NOT be what the crawler sees.
  const bundled = JSON.parse(fs.readFileSync(path.join(ROOT, "public/stories.json"), "utf8"));
  const bRec = bundled.find((s) => s.slug === slug);
  const bundledLen = (bRec?.content_bn || "").length;
  ok("parity-" + slug,
    `200 index,follow; full DB narrative present (${narrative.length} chars vs bundled ${bundledLen})`);
  // JSON-LD Article headline + self-canonical match the real content.
  if (!res.body.includes(`"@type":"Article"`) || !res.body.includes((row.title || "").slice(0, 40)))
    fail("parity-" + slug, "Article JSON-LD headline missing/mismatched");
  else ok("jsonld-" + slug, "Article JSON-LD headline matches DB title");
  const canon = res.body.match(/<link rel="canonical" href="([^"]+)"/);
  if (!canon || canon[1] !== `https://noorapp.in/stories/${slug}`)
    fail("parity-" + slug, "canonical is not the self story URL");
}

// Bundled fallback: bundled-only stories (not published in DB) still render.
{
  const { data: dbRows } = await supabase.from("admin_content")
    .select("slug").eq("content_type", "story").eq("status", "published").limit(200);
  const dbSlugs = new Set((dbRows || []).map((r) => r.slug));
  const bundled = JSON.parse(fs.readFileSync(path.join(ROOT, "public/stories.json"), "utf8"));
  const bundledOnly = bundled.find((s) => s.slug && !dbSlugs.has(s.slug));
  if (!bundledOnly) {
    ok("bundled-fallback", "SKIP — every bundled story is published in the DB");
  } else {
    const res = await get(`/stories/${bundledOnly.slug}`);
    const expected = esc(bundledOnly.content_bn || "").replace(/\n/g, "<br/>");
    if (res.statusCode !== 200 || !res.body.includes(expected))
      fail("bundled-fallback", `bundled-only story ${bundledOnly.slug} did not render its record`);
    else ok("bundled-fallback", `bundled-only story renders: ${bundledOnly.slug}`);
  }
}

// Unknown + test slugs: 404/410 with noindex (no content leak).
{
  const res404 = await get("/stories/no-such-story");
  if (res404.statusCode !== 404 || !/noindex/.test(res404.body)) fail("no-leak-404", "unknown story slug must 404 + noindex");
  else ok("no-leak-404", "/stories/no-such-story -> 404 noindex");
  const res410 = await get("/stories/test-story-manus");
  if (res410.statusCode !== 410 || !/noindex/.test(res410.body)) fail("no-leak-410", "test-story-manus must 410 + noindex");
  else ok("no-leak-410", "/stories/test-story-manus -> 410 noindex");
}

if (failures.length) {
  console.log(`\nP0-10 REGRESSION: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
console.log("\nP0-10 REGRESSION: PASS — bot HTML carries the same canonical story content as the SPA");
