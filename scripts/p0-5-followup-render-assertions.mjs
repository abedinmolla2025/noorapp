#!/usr/bin/env node
/**
 * P0-5 follow-up runtime assertions: suppressed vs kept dua render outcomes.
 *
 * Extracts the REAL suppression sets from the two production source files,
 * then simulates the SPA-path (getDuaRich decision logic) and the
 * prerender-path (dua-branch nulling) decision logic over mock rows and
 * asserts:
 *   - suppressed rows -> benefits / explanation variants render nothing
 *   - kept rows      -> benefits / explanation variants still render
 *
 * This tests the actual set membership from source + the decision outcomes;
 * the static structural sweep lives in scripts/p0-5-dua-virtue-leak-sweep.mjs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

const spa = read("src/pages/dua/DuaDetailPage.tsx");
const bot = read("api/prerender.js");

const extractSet = (src, name) => {
  const m = src.match(new RegExp(name + "\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)"));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
};

const spaExpl = extractSet(spa, "EXPLANATION_BN_SUPPRESSED_SLUGS");
const spaBen = extractSet(spa, "BENEFITS_SUPPRESSED_SLUGS");
const botExpl = extractSet(bot, "EXPLANATION_BN_SUPPRESSED_SLUGS");
const botBen = extractSet(bot, "BENEFITS_SUPPRESSED_SLUGS");

// Structural contract: the exact gating expressions must exist in both files
// (verified structurally by the sweep; re-asserted here so this test fails
// if the decision point is ever removed even with the sets intact).
ok(spa.includes("const explanationWithheld = isExplanationBnSuppressed(dua.slug)"), "SPA: explanationWithheld decision point present");
ok(spa.includes("isBenefitsSuppressed(dua.slug)"), "SPA: isBenefitsSuppressed decision point present");
ok(bot.includes("dua.explanation_en = null") && bot.includes("dua.benefits_bn = null"), "prerender: variant/benefits nulling present");

// ---- simulate the SPA-path decision logic (mirrors getDuaRich exactly) ----
const pick = (en, hi, ur, bn, lang) =>
  lang === "english" ? (en ?? bn) : lang === "hindi" ? (hi ?? bn) : lang === "urdu" ? (ur ?? bn) : bn;
const spaRich = (row, lang) => {
  const explanationWithheld = new Set(spaExpl).has(row.slug);
  const explanation = explanationWithheld ? null : pick(row.explanation_en, row.explanation_hi, row.explanation_ur, row.explanation_bn, lang);
  const benefitsRaw = new Set(spaBen).has(row.slug) ? null : (pick(row.benefits_en, row.benefits_hi, row.benefits_ur, row.benefits_bn, lang) ?? null);
  return { explanation, benefits: benefitsRaw && benefitsRaw.length > 0 ? benefitsRaw : null };
};

// ---- simulate the prerender-path decision logic (mirrors dua-branch nulling) ----
const botRow = (row) => {
  const d = { ...row };
  if (d.slug && new Set(botExpl).has(d.slug)) {
    d.explanation_bn = null; d.explanation_en = null; d.explanation_hi = null; d.explanation_ur = null;
  }
  if (d.slug && new Set(botBen).has(d.slug)) {
    d.benefits_bn = null; d.benefits_en = null; d.benefits_hi = null; d.benefits_ur = null;
  }
  return d;
};

// ---- mock rows: the flagged promise rows + representative kept rows ----
const mock = (slug, benefits, explanation) => ({
  slug,
  benefits_bn: benefits, benefits_en: benefits, benefits_hi: null, benefits_ur: null,
  explanation_bn: explanation, explanation_en: explanation, explanation_hi: null, explanation_ur: null,
});
const rows = [
  mock("dua-after-wudu", ["অযুর পর এটি পাঠ করলে জান্নাতের আটটি দরজাই খুলে যায়"], "রাসুলুল্লাহ (সা.) বলেছেন … ৮টি দরজাই খুলে দেওয়া হবে"),
  mock("the-master-of-seeking-forgiveness", ["সে নিশ্চিতভাবেই জান্নাতী হবে"], "সে নিশ্চিতভাবেই জান্নাতী হবে"),
  mock("dua-before-eating", ["খাবারের বরকতের জন্য মনকে কৃতজ্ঞ রাখে"], "ব্যক্তি খাবারের শুরুতে আল্লাহর নাম নেয় না …"),
  mock("ayatul-kursi-2", ["সকাল-সন্ধ্যার আমলে নিয়মিত করা সহজ"], "রাসুলুল্লাহ (সা.) একে কুরআনের শ্রেষ্ঠ আয়াত বলেছেন"),
  // kept rows: descriptive benefits + clean explanations, must still render
  mock("dua-for-guidance-surah-al-faatiha-1-6", ["আখিরাতের কথা মনে রেখে অগ্রাধিকার ঠিক করতে সাহায্য করে।"], "সূরা আল-ফাতিহার এই দোয়ার ব্যাখ্যা।"),
  mock("dua-for-patience-surah-al-baqara-2-250", ["ভয় কমিয়ে দায়িত্বশীল সিদ্ধান্তে স্থির থাকতে সহায়তা করে।"], "ধৈর্যের এই দোয়ার প্রেক্ষাপট ও ব্যাখ্যা।"),
];

for (const lang of ["bengali", "english", "hindi", "urdu"]) {
  for (const row of rows) {
    const rich = spaRich(row, lang);
    const isExplSuppressed = spaExpl.includes(row.slug);
    const isBenSuppressed = spaBen.includes(row.slug);
    ok(rich.explanation === null || !isExplSuppressed, `[SPA/${lang}] ${row.slug}: explanation ${isExplSuppressed ? "withheld" : "rendered"}`);
    ok(rich.explanation === null ? isExplSuppressed || row.explanation_bn === null : true, `[SPA/${lang}] ${row.slug}: no unexpected explanation loss`);
    ok(rich.benefits === null || !isBenSuppressed, `[SPA/${lang}] ${row.slug}: benefits ${isBenSuppressed ? "withheld" : "rendered"}`);
    ok(rich.benefits === null ? isBenSuppressed || row.benefits_bn === null || row.benefits_bn.length === 0 : true, `[SPA/${lang}] ${row.slug}: no unexpected benefits loss`);
  }
}

for (const row of rows) {
  const d = botRow(row);
  const isExplSuppressed = botExpl.includes(row.slug);
  const isBenSuppressed = botBen.includes(row.slug);
  const explGone = d.explanation_bn === null && d.explanation_en === null && d.explanation_hi === null && d.explanation_ur === null;
  const benGone = d.benefits_bn === null && d.benefits_en === null && d.benefits_hi === null && d.benefits_ur === null;
  ok(explGone === isExplSuppressed, `[prerender] ${row.slug}: explanation variants ${isExplSuppressed ? "nulled" : "intact"}`);
  ok(benGone === isBenSuppressed, `[prerender] ${row.slug}: benefits columns ${isBenSuppressed ? "nulled" : "intact"}`);
}

console.log(failures === 0 ? "\nALL RUNTIME ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
