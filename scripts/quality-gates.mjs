/**
 * Noor programmatic quality gates (Phase G).
 *
 * Runs the full sitemap through the prerender handler and asserts:
 *  1. Every sitemap URL -> 200 + index,follow + self-canonical + no AdSense
 *  2. Invalid routes -> 404/410 + noindex,follow
 *  3. No duplicate <title> across indexable pages (template-content check)
 *  4. Structured data (JSON-LD) present on key page types
 *  5. No placeholder/leak tokens on indexable pages
 *  6. Hub pages link their children (stories 74/74, quiz 281, dua categories)
 *
 * Usage: node scripts/quality-gates.mjs [--sample N] [--quiet]
 * Exit 0 = all gates pass. Exit 1 = one or more failures (listed).
 */
const args = process.argv.slice(2);
const sampleArg = args.find((a) => a.startsWith("--sample"));
const SAMPLE = sampleArg ? parseInt(sampleArg.split("=")[1], 10) : 0;
const QUIET = args.includes("--quiet");

import fs from "node:fs";

const log = (...a) => { if (!QUIET) console.log(...a); };
const failures = [];
const fail = (gate, detail) => { failures.push(`[${gate}] ${detail}`); };
const pass = (gate, detail) => log(`PASS  ${gate} — ${detail}`);

const prerender = await import("../api/prerender.js");
const sitemapMod = await import("../api/sitemap.js");
const handler = prerender.default;
const sitemapHandler = sitemapMod.default;

function mockRes() {
  return {
    statusCode: 200, body: "", headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    send(b) { this.body = String(b ?? ""); return this; },
  };
}
async function get(path) {
  const res = mockRes();
  await handler({ query: { path }, headers: {} }, res);
  return res;
}

// ---- Gate 1: sitemap integrity ----
// Baseline 1003 minus quiz duplicate URLs excluded by the 2026-09-28
// forensic consolidation (they canonicalize to their primary instead).
const quizDupes = JSON.parse(fs.readFileSync("public/data/quiz-canonicals.json", "utf8"));
const expectedSitemapCount = 1003 - Object.keys(quizDupes.map || {}).length;
const smRes = mockRes();
await sitemapHandler({ headers: {} }, smRes);
const sitemapUrls = [...smRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
const paths = sitemapUrls.map((u) => new URL(u).pathname);
if (sitemapUrls.length !== expectedSitemapCount) fail("sitemap-count", `expected ${expectedSitemapCount} URLs, got ${sitemapUrls.length}`);
else pass("sitemap-count", `${expectedSitemapCount} URLs`);

// ---- Gate 2: every sitemap URL is 200/index/self-canonical/no-ads ----
const checkPaths = SAMPLE > 0 ? paths.filter((_, i) => i % Math.ceil(paths.length / SAMPLE) === 0) : paths;
log(`Checking ${checkPaths.length} sitemap URLs...`);
const titles = new Map();
let ok200 = 0, badStatus = [], badRobots = [], badCanon = [], adsFound = [];
const CONC = 12;
for (let i = 0; i < checkPaths.length; i += CONC) {
  const batch = checkPaths.slice(i, i + CONC);
  const results = await Promise.all(batch.map(async (p) => {
    try { return { p, r: await get(p) }; }
    catch (e) { return { p, err: String(e) }; }
  }));
  for (const { p, r, err } of results) {
    if (err || !r) { badStatus.push(`${p} (threw)`); continue; }
    if (r.statusCode !== 200) { badStatus.push(`${p} -> ${r.statusCode}`); continue; }
    ok200++;
    const robots = (r.body.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || "";
    // /sitemap is intentionally noindex (HTML navigation aid; XML sitemap is canonical)
    const wantRobots = p === "/sitemap" ? "noindex,follow" : "index,follow";
    if (robots !== wantRobots) badRobots.push(`${p} -> ${robots}`);
    const canon = (r.body.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";
    if (canon !== `https://noorapp.in${p}`) badCanon.push(`${p} -> ${canon}`);
    if (/adsbygoogle|pagead2\.googlesyndication|data-ad-client/i.test(r.body)) adsFound.push(p);
    const title = (r.body.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    if (title) {
      if (titles.has(title)) titles.get(title).push(p);
      else titles.set(title, [p]);
    }
  }
}
if (badStatus.length) fail("sitemap-status", `${badStatus.length} bad: ${badStatus.slice(0, 5).join("; ")}`);
else pass("sitemap-status", `${ok200}/${checkPaths.length} return 200`);
if (badRobots.length) fail("sitemap-robots", `${badRobots.length} bad: ${badRobots.slice(0, 5).join("; ")}`);
else pass("sitemap-robots", "all index,follow");
if (badCanon.length) fail("sitemap-canonical", `${badCanon.length} bad: ${badCanon.slice(0, 5).join("; ")}`);
else pass("sitemap-canonical", "all self-canonical");
if (adsFound.length) fail("sitemap-no-ads", `AdSense tokens on: ${adsFound.slice(0, 5).join(", ")}`);
else pass("sitemap-no-ads", "no AdSense tokens in prerender output");

// ---- Gate 3: invalid routes fail closed ----
const invalidCases = [
  ["/quran/999", 404], ["/quran/abc", 404],
  ["/dua/no-such-dua", 404], ["/stories/no-such-story", 404],
  ["/stories/test-story-manus", 410], ["/hadith/sahih-bukhari/bangla/9999", 404],
  ["/quiz/not-a-real-id", 404], ["/totally-bogus-route", 404],
];
for (const [p, want] of invalidCases) {
  const r = await get(p);
  const robots = (r.body.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || "";
  if (r.statusCode !== want) fail("invalid-routes", `${p}: want ${want}, got ${r.statusCode}`);
  else if (!robots.startsWith("noindex")) fail("invalid-routes", `${p}: robots=${robots}`);
  else if (/adsbygoogle|pagead2\.googlesyndication/i.test(r.body)) fail("invalid-routes", `${p}: AdSense on error page`);
}
if (!failures.some((f) => f.startsWith("[invalid-routes]"))) pass("invalid-routes", `${invalidCases.length}/${invalidCases.length} fail closed`);

// ---- Gate 4: no duplicate titles (template-content check) ----
const dupes = [...titles.entries()].filter(([, v]) => v.length > 1);
if (dupes.length) fail("duplicate-titles", `${dupes.length} dupes, e.g. "${dupes[0][0]}" on ${dupes[0][1].slice(0, 3).join(", ")}`);
else pass("duplicate-titles", `${titles.size} unique titles`);

// ---- Gate 5: JSON-LD on key page types ----
const ldChecks = [["/", "WebSite"], ["/stories", "CollectionPage"], ["/dua", "CollectionPage"], ["/quiz", "CollectionPage"]];
for (const [p, want] of ldChecks) {
  const r = await get(p);
  if (!r.body.includes(`"@type": "${want}"`) && !r.body.includes(`"@type":"${want}"`))
    fail("structured-data", `${p}: missing ${want} JSON-LD`);
}
if (!failures.some((f) => f.startsWith("[structured-data]"))) pass("structured-data", "JSON-LD present on key pages");

// ---- Gate 6: no placeholder leaks on indexable pages ----
const leakTokens = ["lorem ipsum", "TODO", "FIXME", "coming soon", "placeholder text", "[object Object]", "undefined"];
const leakPages = ["/", "/about", "/sources", "/contact", "/privacy-policy", "/terms", "/stories", "/dua", "/quiz", "/99-names"];
for (const p of leakPages) {
  const r = await get(p);
  const low = r.body.toLowerCase();
  for (const t of leakTokens) {
    if (low.includes(t)) { fail("placeholder-leaks", `${p}: contains "${t}"`); break; }
  }
}
if (!failures.some((f) => f.startsWith("[placeholder-leaks]"))) pass("placeholder-leaks", "no leak tokens");

// ---- Gate 7: hub completeness ----
const storiesHub = await get("/stories");
const storyLinks = new Set([...storiesHub.body.matchAll(/href="\/stories\/([a-z0-9-]+)"/g)].map((x) => x[1]));
if (storyLinks.size < 74) fail("hub-stories", `only ${storyLinks.size}/74 story links`);
else pass("hub-stories", `${storyLinks.size}/74 stories linked`);
const quizHub = await get("/quiz");
const quizLinks = new Set([...quizHub.body.matchAll(/href="\/quiz\/([a-f0-9-]+)"/g)].map((x) => x[1]));
if (quizLinks.size < 281) fail("hub-quiz", `only ${quizLinks.size}/281 question links`);
else pass("hub-quiz", `${quizLinks.size}/281 questions linked`);

// ---- Gate 8: quiz duplicate consolidation (2026-09-28 forensic) ----
// Every duplicate question URL must 200 + index,follow and canonicalize to its
// primary; primaries stay self-canonical; no duplicate URL may be in the sitemap.
{
  const canonMap = quizDupes.map || {};
  const dupIds = Object.keys(canonMap);
  let okCanon = 0;
  const badDupCanon = [];
  for (let i = 0; i < dupIds.length; i += CONC) {
    const batch = dupIds.slice(i, i + CONC);
    const results = await Promise.all(batch.map(async (id) => {
      try { return { id, r: await get(`/quiz/${id}`) }; }
      catch (e) { return { id, err: String(e) }; }
    }));
    for (const { id, r, err } of results) {
      const want = `https://noorapp.in/quiz/${canonMap[id]}`;
      if (err || !r || r.statusCode !== 200) { badDupCanon.push(`/quiz/${id} -> bad status`); continue; }
      const canon = (r.body.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";
      const robots = (r.body.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || "";
      if (canon !== want) badDupCanon.push(`/quiz/${id.slice(0, 8)} -> ${canon}`);
      else if (robots !== "index,follow") badDupCanon.push(`/quiz/${id.slice(0, 8)} robots=${robots}`);
      else okCanon++;
    }
  }
  // Primaries (a sample) must remain self-canonical.
  const primarySample = [...new Set(Object.values(canonMap))].slice(0, 10);
  for (const id of primarySample) {
    const r = await get(`/quiz/${id}`);
    const canon = (r.body.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";
    if (canon !== `https://noorapp.in/quiz/${id}`) badDupCanon.push(`primary ${id.slice(0, 8)} -> ${canon}`);
  }
  const dupesInSitemap = dupIds.filter((id) => paths.includes(`/quiz/${id}`));
  if (dupesInSitemap.length) badDupCanon.push(`${dupesInSitemap.length} duplicate URLs in sitemap`);
  if (badDupCanon.length) fail("quiz-consolidation", `${badDupCanon.length} bad: ${badDupCanon.slice(0, 5).join("; ")}`);
  else pass("quiz-consolidation", `${okCanon}/${dupIds.length} duplicates -> primary canonical, primaries self-canonical, sitemap clean`);
}

// ---- Report ----
console.log("");
if (failures.length) {
  console.log(`QUALITY GATES: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.log("  " + f);
  process.exit(1);
} else {
  console.log("QUALITY GATES: ALL PASS");
}
