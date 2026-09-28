// verify-hadith-title-consistency.mjs
// PHASE 5 — automated 97/97 assertion for the Hadith language-consistency fix.
//
// Asserts, over all 97 hadith_chapters rows × bangla/english/urdu:
//   1. PARITY: SPA selector (src/lib/hadithChapterTitle.ts) and the prerender
//      mirror (api/prerender.js getHadithChapterName) return IDENTICAL strings.
//   2. CONTRACT: bangla → verified title_bn else verified English title;
//      english → verified English title; urdu → verified title_ar else
//      verified English title; no Arabic script in bangla/english outputs;
//      verified per-chapter overrides (38/82) applied on both sides.
//   3. CANONICAL: chapter 97 resolves to the reconstruction's canonical
//      English title on both sides (proves the stale SPA override is gone).
//
// Data: live hadith_chapters via the public anon REST endpoint (same read the
// SPA/prerender perform). Fails closed (non-zero exit) on any mismatch.
// READ-ONLY: no writes of any kind.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 1. SPA selector (Node ≥22 strips types natively) ─────────────────────────
const spa = await import("../src/lib/hadithChapterTitle.ts");
const { selectHadithChapterTitle, HADITH_CHAPTER_OVERRIDES: SPA_OVERRIDES } = spa;

// ── 2. Prerender mirror, extracted from api/prerender.js and evaluated ───────
const prerenderSrc = readFileSync(join(ROOT, "api/prerender.js"), "utf8");

function extractConst(src, name) {
  const marker = `const ${name} =`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`const ${name} not found in api/prerender.js`);
  let i = start + marker.length;
  while (/\s/.test(src[i])) i++;
  // Arrow function value: skip to the body after `=>`
  if (src[i] === "(" || /^[A-Za-z_$]/.test(src[i])) {
    const arrow = src.indexOf("=>", i);
    if (arrow === -1) throw new Error(`no arrow for ${name}`);
    i = arrow + 2;
    while (/\s/.test(src[i])) i++;
  }
  const open = src[i];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) throw new Error(`unexpected value for ${name}`);
  let depth = 0, inStr = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (c === "\\") { j++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

const sandboxSrc = [
  extractConst(prerenderSrc, "HADITH_CHAPTER_OVERRIDES"),
  extractConst(prerenderSrc, "HADITH_GENERIC_BOOK_LABEL"),
  extractConst(prerenderSrc, "getHadithChapterName"),
  "\nreturn { HADITH_CHAPTER_OVERRIDES, HADITH_GENERIC_BOOK_LABEL, getHadithChapterName };",
].join("\n");
const prerender = new Function(sandboxSrc)();

// ── 3. Override tables must be identical ─────────────────────────────────────
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

check(
  JSON.stringify(prerender.HADITH_CHAPTER_OVERRIDES) === JSON.stringify(SPA_OVERRIDES),
  "override tables differ between src/lib/hadithChapterTitle.ts and api/prerender.js",
);

// ── 4. Load the 97 canonical rows (same anon read as SPA/prerender) ─────────
const SUPABASE_URL = "https://llicfiepatzgllmjhzbw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0";
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/hadith_chapters?book_id=eq.bukhari&select=chapter_number,title,title_bn,title_ar,hadith_count&order=chapter_number`,
  { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
);
if (!res.ok) throw new Error(`hadith_chapters anon read failed: ${res.status}`);
const rows = await res.json();
check(Array.isArray(rows) && rows.length === 97, `expected 97 rows, got ${rows?.length}`);
check(
  rows.every((r, i) => Number(r.chapter_number) === i + 1),
  "chapter_number sequence is not exactly 1..97",
);

const hasArabicScript = (s) => /[\u0600-\u06FF]/.test(s || "");
const hasBengaliScript = (s) => /[\u0980-\u09FF]/.test(s || "");
const LANGS = ["bangla", "english", "urdu"];
let parityChecks = 0;

for (const r of rows) {
  const n = Number(r.chapter_number);
  for (const lang of LANGS) {
    const a = selectHadithChapterTitle(r, lang);
    const b = prerender.getHadithChapterName(r, lang);
    parityChecks++;
    check(a === b, `parity mismatch ch${n}/${lang}: SPA=${JSON.stringify(a)} prerender=${JSON.stringify(b)}`);
    const title = (r.title || "").trim();
    const overridden = SPA_OVERRIDES[n]?.[lang];
    if (overridden) {
      check(a === overridden, `ch${n}/${lang} != verified override: ${JSON.stringify(a)}`);
    } else if (lang === "english") {
      check(a === title, `ch${n}/english != verified title: ${JSON.stringify(a)}`);
      check(!hasArabicScript(a) && !hasBengaliScript(a), `ch${n}/english has non-Latin script`);
    } else if (lang === "bangla") {
      const expected = (r.title_bn || "").trim() || title;
      check(a === expected, `ch${n}/bangla contract: got ${JSON.stringify(a)} want ${JSON.stringify(expected)}`);
      check(!hasArabicScript(a), `ch${n}/bangla output contains Arabic script`);
    } else {
      const expected = (r.title_ar || "").trim() || title;
      check(a === expected, `ch${n}/urdu contract: got ${JSON.stringify(a)} want ${JSON.stringify(expected)}`);
    }
  }
}

// Verified overrides (38/82) on both sides, all langs
for (const n of [38, 82]) {
  for (const lang of LANGS) {
    const want = SPA_OVERRIDES[n][lang];
    check(selectHadithChapterTitle({ chapter_number: n, title: "X", title_bn: "Y", title_ar: "Z" }, lang) === want, `SPA override ch${n}/${lang}`);
    check(prerender.getHadithChapterName({ chapter_number: n, title: "X", title_bn: "Y", title_ar: "Z" }, lang) === want, `prerender override ch${n}/${lang}`);
  }
}

// Chapter 97: canonical reconstruction title, no stale override, no invented BN
const ch97 = rows.find((r) => Number(r.chapter_number) === 97);
check(ch97.title === "Oneness, Uniqueness of Allah (Tawheed)", `ch97 DB title drift: ${JSON.stringify(ch97.title)}`);
check(selectHadithChapterTitle(ch97, "english") === "Oneness, Uniqueness of Allah (Tawheed)", "ch97 SPA english != canonical");
check(prerender.getHadithChapterName(ch97, "english") === "Oneness, Uniqueness of Allah (Tawheed)", "ch97 prerender english != canonical");
check(ch97.title_bn == null, `ch97 title_bn should be NULL (unverified), got ${JSON.stringify(ch97.title_bn)}`);
check(selectHadithChapterTitle(ch97, "bangla") === "Oneness, Uniqueness of Allah (Tawheed)", "ch97 SPA bangla should fall back to verified English");

// Missing-record fallback identical on both sides
for (const lang of LANGS) {
  check(
    selectHadithChapterTitle(null, lang) === prerender.getHadithChapterName(null, lang),
    `null-record fallback parity ${lang}`,
  );
}

// Tally for the report
const bnPresent = rows.filter((r) => (r.title_bn || "").trim()).length;
console.log(`rows=97 parity_checks=${parityChecks} title_bn_present=${bnPresent} title_bn_missing=${97 - bnPresent}`);
if (failures.length) {
  console.error(`FAIL ${failures.length} assertion(s):`);
  for (const f of failures.slice(0, 20)) console.error(" - " + f);
  process.exit(1);
}
console.log("PASS: SPA ≡ prerender title selection for 97/97 chapters × 3 languages; contract holds.");
