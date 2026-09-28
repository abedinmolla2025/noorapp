// P0-6 regression tests: scholar-intro publication boundary.
// Verifies "unpublished == inaccessible" for surah + hadith chapter intros.
//
// Data layer:  src/data/surah-intros.json (104 published) and
//              src/data/hadith-chapter-intros.json (13 published) are the only
//              intro sources. Withheld records (10 class-C surahs, 3 WITHHOLD
//              hadith drafts, 81 unresearched chapters) must have NO entry.
//
// Render layer: prerender HTML must show published intros with source
//              attribution and show nothing (no placeholder, no leaked text)
//              for withheld records; intro text must never appear in JSON-LD
//              or the sitemap.
//
// Usage: node scripts/verify-intro-publication-boundary.mjs
//        (run from the repo root so api/prerender.js loadToolData candidates
//        resolve to public/data and dist/data)
import fs from "node:fs";
import path from "node:path";
import prerenderHandler from "../api/prerender.js";
import sitemapHandler from "../api/sitemap.js";

const root = process.cwd();
const checks = [];
const check = (name, cond, detail = "") => checks.push({ name, pass: !!cond, detail });

// Mirror of api/prerender.js esc() so we can search for intro text as rendered.
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const CAPTION = "Source-verified research";

// ---------------------------------------------------------------- data layer
const surahIntros = JSON.parse(fs.readFileSync(path.join(root, "src/data/surah-intros.json"), "utf8"));
const hadithIntros = JSON.parse(fs.readFileSync(path.join(root, "src/data/hadith-chapter-intros.json"), "utf8"));

const surahNums = surahIntros.map((s) => Number(s.number));
check("surah-intros.json holds exactly 104 entries", surahIntros.length === 104, `found ${surahIntros.length}`);

const EXPECTED_WITHHELD_SURAHS = [55, 60, 76, 83, 97, 98, 99, 107, 112, 113]; // class-C Makki/Madani conflicts
const missingSurahs = [];
for (let n = 1; n <= 114; n++) if (!surahNums.includes(n)) missingSurahs.push(n);
check(
  "surah-intros.json omits exactly the 10 class-C surahs",
  JSON.stringify(missingSurahs) === JSON.stringify(EXPECTED_WITHHELD_SURAHS),
  `missing: [${missingSurahs}]`
);

check(
  "every surah intro has intro_en and >=1 source",
  surahIntros.every((s) => s.intro_en && s.intro_en.trim().length > 0 && Array.isArray(s.sources) && s.sources.length > 0 && s.sources.every((x) => x.name && x.url)),
);

const hadithChapters = hadithIntros.map((i) => Number(i.chapter));
const EXPECTED_LIVE_CHAPTERS = [1, 2, 3, 14, 19, 23, 24, 25, 30, 59, 64, 68, 76];
check(
  "hadith-chapter-intros.json holds exactly the 13 published chapters",
  JSON.stringify([...hadithChapters].sort((a, b) => a - b)) === JSON.stringify(EXPECTED_LIVE_CHAPTERS),
  `found: [${[...hadithChapters].sort((a, b) => a - b)}]`
);
check("withheld hadith chapters 78/80/82 have no entry", ![78, 80, 82].some((c) => hadithChapters.includes(c)));
check(
  "every hadith intro has intro_en and >=1 source",
  hadithIntros.every((i) => i.intro_en && i.intro_en.trim().length > 0 && Array.isArray(i.sources) && i.sources.length > 0 && i.sources.every((x) => x.name && x.url)),
);

// The files the prerender function actually reads must be semantically
// identical to the source of truth (extract-tool-data.mjs writes compact
// JSON; src/data is pretty-printed — byte equality is not expected).
for (const f of ["surah-intros.json", "hadith-chapter-intros.json"]) {
  const src = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "src/data", f), "utf8")));
  for (const dir of ["public/data", "dist/data"]) {
    const p = path.join(root, dir, f);
    if (fs.existsSync(p)) {
      const copy = JSON.stringify(JSON.parse(fs.readFileSync(p, "utf8")));
      check(`${dir}/${f} matches src/data semantically`, copy === src, dir);
    }
  }
}

// No app code reads intro drafts from research/ (research artifacts must
// stay out of the bundle). Flag only actual file references, not prose
// comments mentioning "research".
const appFiles = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!["node_modules", "dist", ".git", ".backups"].includes(e.name)) walk(p); }
    else if (/\.(tsx?|m?js)$/.test(e.name)) appFiles.push(p);
  }
};
walk(path.join(root, "src"));
walk(path.join(root, "api"));
walk(path.join(root, "scripts"));
const researchFileRefs = appFiles
  .filter((f) => !f.endsWith("verify-intro-publication-boundary.mjs"))
  .filter((f) => /research\/[A-Za-z0-9_.\-]+\.(json|csv|md)/.test(fs.readFileSync(f, "utf8")));
check("no src/api/scripts file references research/ intro draft files", researchFileRefs.length === 0, researchFileRefs.join(", "));

// ------------------------------------------------------------- prerender HTML
function makeRes() {
  return {
    statusCode: 200, headers: {}, body: "",
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    send(b) { this.body = String(b ?? ""); return this; },
  };
}
const get = async (routePath) => {
  const req = { query: { path: routePath }, headers: { "user-agent": "Googlebot" } };
  const res = makeRes();
  await prerenderHandler(req, res);
  return { body: res.body, status: res.statusCode };
};
const jsonLdBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const surah2Intro = surahIntros.find((s) => s.number === 2);
const q2 = await get("/quran/2");
check("/quran/2 returns 200", q2.status === 200, `status ${q2.status}`);
check("/quran/2 renders the published surah-2 intro", q2.body.includes(esc(surah2Intro.intro_en)));
check("/quran/2 shows source attribution caption", q2.body.includes(CAPTION));
check("/quran/2 links a source URL", q2.body.includes(esc(surah2Intro.sources[0].url)));

const q60 = await get("/quran/60");
check("/quran/60 returns 200", q60.status === 200, `status ${q60.status}`);
check("/quran/60 renders no intro caption (class-C withheld)", !q60.body.includes(CAPTION));
const anySurahIntroLeak60 = surahIntros.some((s) => q60.body.includes(esc(s.intro_en.slice(0, 60))));
check("/quran/60 contains no surah intro text", !anySurahIntroLeak60);

const ch1Intro = hadithIntros.find((i) => i.chapter === 1);
const ch1 = await get("/hadith/sahih-bukhari/english/chapter-1");
check("chapter-1 page returns 200", ch1.status === 200, `status ${ch1.status}`);
check("chapter-1 renders the published intro", ch1.body.includes(esc(ch1Intro.intro_en.slice(0, 80))));
check("chapter-1 shows source attribution caption", ch1.body.includes(CAPTION));

const ch78 = await get("/hadith/sahih-bukhari/english/chapter-78");
check("chapter-78 page returns 200", ch78.status === 200, `status ${ch78.status}`);
check("chapter-78 renders no intro caption (WITHHOLD)", !ch78.body.includes(CAPTION));
const anyHadithIntroLeak78 = hadithIntros.some((i) => ch78.body.includes(esc(i.intro_en.slice(0, 60))));
check("chapter-78 contains no hadith intro text", !anyHadithIntroLeak78);

// ------------------------------------------------------------------- JSON-LD
const allIntroTexts = [
  ...surahIntros.map((s) => esc(s.intro_en.slice(0, 80))),
  ...hadithIntros.map((i) => esc(i.intro_en.slice(0, 80))),
];
for (const [label, html] of [["/quran/2", q2.body], ["/quran/60", q60.body], ["chapter-1", ch1.body], ["chapter-78", ch78.body]]) {
  const blocks = jsonLdBlocks(html);
  const leak = blocks.some((b) => allIntroTexts.some((t) => b.includes(t)));
  check(`JSON-LD on ${label} carries no intro text`, !leak, `${blocks.length} ld+json block(s)`);
}

// ------------------------------------------------------------------- sitemap
const sitemapRes = makeRes();
await sitemapHandler({ query: {} }, sitemapRes);
check("sitemap returns 200", sitemapRes.statusCode === 200, `status ${sitemapRes.statusCode}`);
const smLeak = allIntroTexts.some((t) => sitemapRes.body.includes(t));
check("sitemap carries no intro text", !smLeak);
check("sitemap still lists /quran/60", sitemapRes.body.includes("<loc>https://noorapp.in/quran/60</loc>"));
check("sitemap still lists chapter-78", sitemapRes.body.includes("<loc>https://noorapp.in/hadith/sahih-bukhari/english/chapter-78</loc>"));

// ------------------------------------------------------------------- summary
let fails = 0;
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? " — " + c.detail : ""}`);
  if (!c.pass) fails++;
}
console.log(fails === 0 ? "ALL INTRO BOUNDARY CHECKS PASSED" : `${fails} CHECKS FAILED`);
process.exit(fails === 0 ? 0 : 1);
