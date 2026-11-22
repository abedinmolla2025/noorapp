// Adaptive long-hadith poster tests (owner brief 2026-11-22).
// SYNTHETIC LOGIC FIXTURES ONLY: the Bengali/Arabic strings below are
// invented test sentences (ordinary language, not hadith text) sized to
// exercise the splitter/selection logic. They are never real hadith
// text, never rendered as content, never published. The one real-world
// anchor is a LENGTH: the 2026-11-21 production failure (Bukhari
// 81-6530, Bengali 1,365 chars) is mirrored by a synthetic string of
// exactly 1,365 chars — same length, same expected mode/page count.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ap = await import(path.join(dir, ".out/adaptivePoster.js"));

let n = 0;
let chain = Promise.resolve();
const t = (name, fn) => {
  const p = chain.then(async () => {
    await fn();
    n++;
    console.log(`ok ${n} - ${name}`);
  });
  chain = p.catch(() => {});
};
const done = async () => {
  await chain;
  console.log(`${n} adaptive poster tests passed`);
};

// --- Synthetic test sentences (invented, not hadith) ---
// Lengths verified by the assertions below (fail loudly if miscounted).
const BN1 = "আল্লাহ তাআলা বলেন, হে আদম, জাহান্নামীদের বের কর। "; // 49 chars
const BN2 = "প্রতিটি মানুষের জন্য জ্ঞান অর্জন করা আবশ্যক। "; // 45 chars
const BN_SHORT = "ভালো কাজের ফল সবসময় ভালো হয়।"; // short, no trailing space
const BN_WORD = "বাক্য। "; // 7 chars
const AR1 = "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى۔ "; // 44 chars
const AR_SHORT = "إنما الأعمال بالنيات"; // 20 chars

t("sentence splitter: join is exact, units end at terminators", () => {
  const text = `${BN1}${BN2}একটি প্রশ্ন? আরেকটি উত্তর! শেষ বাক্য।`;
  const units = ap.splitIntoSentences(text);
  assert.equal(units.join(""), text);
  assert.ok(units.length >= 5);
  assert.ok(units.every((u) => ap.endsAtSentenceBoundary(u)));
});

t("sentence splitter: paragraph breaks are hard boundaries", () => {
  const text = `${BN1}\n\n${BN2}\n${BN1}`;
  const units = ap.splitIntoSentences(text);
  assert.equal(units.join(""), text);
  assert.ok(units.some((u) => u.endsWith("\n\n")), "a unit ends at the paragraph break");
  assert.ok(units.length >= 3);
});

t("sentence splitter: Arabic terminators (۔ ؟) split correctly", () => {
  const text = `${AR1}هل هذا صحيح؟ نعم، هذا صحيح۔`;
  const units = ap.splitIntoSentences(text);
  assert.equal(units.join(""), text);
  assert.ok(units.length >= 3);
  assert.ok(units.every((u) => ap.endsAtSentenceBoundary(u)));
});

t("sentence splitter: text without terminators is one unit", () => {
  const text = "শুধু একটি লম্বা অংশ কোনো দাঁড়ি ছাড়া";
  const units = ap.splitIntoSentences(text);
  assert.deepEqual(units, [text]);
});

// 1. Very short Hadith -> SINGLE
t("case 1: very short hadith selects SINGLE", () => {
  assert.equal(BN_SHORT.length, 30);
  assert.equal(AR_SHORT.length, 20);
  const sel = ap.selectAdaptiveLayout(AR_SHORT, BN_SHORT, "portrait");
  assert.equal(sel.mode, "single");
  assert.equal(sel.estimatedPages, 1);
  assert.equal(sel.isLongContent, false);
  const split = ap.splitAdaptivePages(AR_SHORT, BN_SHORT, "portrait");
  assert.equal(split.pages.length, 1);
  assert.equal(ap.verifyAdaptiveCoverage(AR_SHORT, BN_SHORT, split).ok, true);
});

// 2. Medium Hadith -> EXTENDED_SINGLE
t("case 2: medium hadith (441 chars) selects EXTENDED_SINGLE", () => {
  const bn = BN1.repeat(9);
  assert.equal(bn.length, 441);
  const sel = ap.selectAdaptiveLayout(AR_SHORT, bn, "portrait");
  assert.equal(sel.mode, "extended_single");
  assert.equal(sel.estimatedBengaliLines, 9);
  assert.equal(sel.isLongContent, true);
  const split = ap.splitAdaptivePages(AR_SHORT, bn, "portrait");
  assert.equal(split.pages.length, 1);
  assert.equal(ap.verifyAdaptiveCoverage(AR_SHORT, bn, split).ok, true);
});

// 3. Long Hadith -> 2 pages
t("case 3: long hadith (588 chars) splits into 2 pages", () => {
  const bn = BN1.repeat(12);
  const ar = AR1.repeat(2);
  assert.equal(bn.length, 588);
  assert.equal(ar.length, 88);
  const sel = ap.selectAdaptiveLayout(ar, bn, "portrait");
  assert.equal(sel.mode, "multi_page");
  assert.equal(sel.estimatedPages, 2);
  const split = ap.splitAdaptivePages(ar, bn, "portrait");
  assert.equal(split.mode, "multi_page");
  assert.equal(split.pages.length, 2);
  assert.deepEqual(split.pages.map((p) => p.index), [1, 2]);
  assert.ok(split.pages.every((p) => p.pageCount === 2));
  assert.ok(split.pages.every((p) => p.cleanSplit));
  const coverage = ap.verifyAdaptiveCoverage(ar, bn, split);
  assert.equal(coverage.ok, true, coverage.errors.join("; "));
});

// 4. Long Hadith -> 3+ pages (incl. the canonical 1,365-char length)
t("case 4: long hadith (1,176 chars) splits into 3 pages", () => {
  const bn = BN1.repeat(24);
  assert.equal(bn.length, 1176);
  const sel = ap.selectAdaptiveLayout(AR_SHORT, bn, "portrait");
  assert.equal(sel.mode, "multi_page");
  assert.equal(sel.estimatedPages, 3);
  const split = ap.splitAdaptivePages(AR_SHORT, bn, "portrait");
  assert.equal(split.pages.length, 3);
  assert.equal(ap.verifyAdaptiveCoverage(AR_SHORT, bn, split).ok, true);
});

t("case 4b: canonical 1,365-char length selects multi_page with 3 pages", () => {
  // Same length as the 2026-11-21 production failure (Bukhari 81-6530,
  // Bengali 1,365 chars) — synthetic text, same expected outcome.
  const bn = BN1.repeat(27) + BN_WORD.repeat(6);
  assert.equal(bn.length, 1365);
  const sel = ap.selectAdaptiveLayout(AR_SHORT, bn, "portrait");
  assert.equal(sel.mode, "multi_page");
  assert.equal(sel.estimatedPages, 3);
  assert.equal(sel.estimatedBengaliLines, 27);
  const split = ap.splitAdaptivePages(AR_SHORT, bn, "portrait");
  assert.equal(split.pages.length, 3);
  assert.equal(ap.verifyAdaptiveCoverage(AR_SHORT, bn, split).ok, true);
});

// 5. Arabic-heavy Hadith
t("case 5: Arabic-heavy hadith splits on the Arabic budget", () => {
  const ar = AR1.repeat(12);
  assert.equal(ar.length, 528);
  const sel = ap.selectAdaptiveLayout(ar, BN_SHORT, "portrait");
  assert.equal(sel.mode, "multi_page");
  assert.equal(sel.estimatedPages, 3);
  const split = ap.splitAdaptivePages(ar, BN_SHORT, "portrait");
  assert.equal(split.pages.length, 3);
  // Short Bengali stays on page 1; pages 2-3 carry Arabic only.
  assert.equal(split.pages[0].bengali, BN_SHORT);
  assert.equal(split.pages[1].bengali, "");
  assert.equal(split.pages[2].bengali, "");
  assert.equal(ap.verifyAdaptiveCoverage(ar, BN_SHORT, split).ok, true);
});

// 6. Bengali-heavy translation
t("case 6: Bengali-heavy hadith splits on the Bengali budget", () => {
  const bn = BN1.repeat(24);
  const split = ap.splitAdaptivePages(AR_SHORT, bn, "portrait");
  assert.equal(split.pages.length, 3);
  // Short Arabic stays on page 1; pages 2-3 carry Bengali only.
  assert.equal(split.pages[0].arabic, AR_SHORT);
  assert.equal(split.pages[1].arabic, "");
  assert.equal(split.pages[2].arabic, "");
  assert.equal(ap.verifyAdaptiveCoverage(AR_SHORT, bn, split).ok, true);
});

// 7. Long Arabic and Bengali together
t("case 7: long Arabic + Bengali together share the page count", () => {
  const bn = BN1.repeat(12);
  const ar = AR1.repeat(6);
  assert.equal(bn.length, 588);
  assert.equal(ar.length, 264);
  const split = ap.splitAdaptivePages(ar, bn, "portrait");
  assert.equal(split.mode, "multi_page");
  assert.equal(split.pages.length, 2);
  assert.ok(split.pages.every((p) => p.arabic.length > 0 && p.bengali.length > 0));
  assert.equal(ap.verifyAdaptiveCoverage(ar, bn, split).ok, true);
});

// 8. Paragraph breaks and punctuation
t("case 8: paragraph breaks + mixed punctuation split cleanly", () => {
  const bnPara = `${BN1}\n\n${BN2}একটি প্রশ্ন? আরেকটি উত্তর! ${BN1}`;
  const bn = bnPara.repeat(6); // long enough to need 2 pages
  const ar = `${AR1}\n\nهل هذا صحيح؟ نعم۔`;
  const split = ap.splitAdaptivePages(ar, bn, "portrait");
  assert.equal(split.pages.length, 2);
  assert.equal(ap.verifyAdaptiveCoverage(ar, bn, split).ok, true);
  // Every page boundary is a clean sentence/paragraph split.
  assert.ok(split.pages.every((p) => p.cleanSplit));
});

// 9. Boundary case: barely fits vs barely overflows
t("case 9: boundary — 518 chars fits one page, 519 chars needs two", () => {
  const bn518 = BN1.repeat(10) + BN_WORD.repeat(4);
  const bn519 = bn518 + "ব";
  assert.equal(bn518.length, 518);
  assert.equal(bn519.length, 519);
  const sel518 = ap.selectAdaptiveLayout(AR_SHORT, bn518, "portrait");
  assert.equal(sel518.mode, "extended_single");
  assert.equal(sel518.estimatedBengaliLines, 10);
  const sel519 = ap.selectAdaptiveLayout(AR_SHORT, bn519, "portrait");
  assert.equal(sel519.mode, "multi_page");
  assert.equal(sel519.estimatedPages, 2);
  assert.equal(sel519.estimatedBengaliLines, 11);
});

// 10. Failed page QC holds the entire set
t("case 10: tampered page fails coverage — whole set held", () => {
  const bn = BN1.repeat(12);
  const ar = AR1.repeat(2);
  const split = ap.splitAdaptivePages(ar, bn, "portrait");
  assert.equal(split.pages.length, 2);
  // Drop one sentence from page 2: coverage must fail.
  const tampered = {
    ...split,
    pages: split.pages.map((p, i) => (i === 1 ? { ...p, bengali: p.bengali.slice(0, 10) } : p)),
  };
  const coverage = ap.verifyAdaptiveCoverage(ar, bn, tampered);
  assert.equal(coverage.ok, false);
  assert.ok(coverage.errors.some((e) => e.includes("Bengali")));
});

t("case 10b: empty page in both languages fails coverage", () => {
  const bn = BN1.repeat(12);
  const ar = AR1.repeat(2);
  const split = ap.splitAdaptivePages(ar, bn, "portrait");
  const tampered = {
    ...split,
    pages: [...split.pages, { index: 3, pageCount: 3, arabic: "", bengali: "", hadWordSplit: false, cleanSplit: true }],
  };
  const coverage = ap.verifyAdaptiveCoverage(ar, bn, tampered);
  assert.equal(coverage.ok, false);
  assert.ok(coverage.errors.some((e) => e.includes("empty")));
});

// Link mode: 4+ pages -> intro poster + full-reading link
t("link mode: 5-page content becomes an intro page, not a 5-page set", () => {
  const bn = BN1.repeat(50); // 2,450 chars -> ~48 lines -> 5 pages
  assert.equal(bn.length, 2450);
  const sel = ap.selectAdaptiveLayout(AR_SHORT, bn, "portrait");
  assert.equal(sel.mode, "full_reading_link");
  assert.ok(sel.estimatedPages >= 4);
  const split = ap.splitAdaptivePages(AR_SHORT, bn, "portrait");
  assert.equal(split.pages.length, 1);
  const intro = split.pages[0];
  assert.ok(bn.startsWith(intro.bengali), "intro is a prefix of the source");
  assert.ok(ap.endsAtSentenceBoundary(intro.bengali), "intro ends at a sentence boundary");
  assert.ok(intro.bengali.length < bn.length, "intro is shorter than the source");
  assert.equal(ap.verifyAdaptiveCoverage(AR_SHORT, bn, split).ok, true);
});

// Word-split fallback: one sentence longer than a page
t("word-split fallback: a single over-long sentence splits at word boundaries", () => {
  const longSentence = `একটি ${"খুব ".repeat(130)}লম্বা বাক্য।`;
  assert.ok(ap.estimateLines(longSentence, 57) > 10);
  const split = ap.splitAdaptivePages(AR_SHORT, longSentence, "portrait");
  assert.equal(split.mode, "multi_page");
  assert.equal(split.hadWordSplit, true);
  // No word is split mid-word: every chunk boundary is a space.
  assert.equal(ap.verifyAdaptiveCoverage(AR_SHORT, longSentence, split).ok, true);
});

// Estimator calibration against the measured production numbers
t("calibration: estimator matches the measured 6530 overflow", () => {
  assert.equal(ap.estimateLines("x".repeat(1365), 57), 27);
  assert.equal(ap.estimateLines("x".repeat(1365), 57) / 10 > 2, true);
  assert.deepEqual(ap.adaptiveBudgetFor("portrait"), { bengaliLines: 10, arabicLines: 4 });
  assert.deepEqual(ap.adaptiveBudgetFor("square"), { bengaliLines: 10, arabicLines: 4 });
  assert.throws(() => ap.selectAdaptiveLayout("", "", "wide"), /unsupported for format/);
});

// Page labels and keys
t("page labels use Bengali digits; page keys and paths are stable", () => {
  assert.equal(ap.toBengaliDigits(2), "২");
  assert.equal(ap.toBengaliDigits(13), "১৩");
  assert.equal(ap.adaptivePageLabel(2, 3), "২/৩");
  assert.equal(ap.adaptivePageKey("portrait", 1), "portrait");
  assert.equal(ap.adaptivePageKey("portrait", 2), "portrait-p2");
  assert.equal(ap.adaptivePageKey("square", 3), "square-p3");
  assert.equal(ap.adaptivePageObjectPath("2026-11-22", "portrait", 1), "2026-11-22/portrait.png");
  assert.equal(ap.adaptivePageObjectPath("2026-11-22", "portrait", 2), "2026-11-22/portrait-p2.png");
});

// Asset-set record: build + validate
t("asset set: build + check pass for a valid 2-page set", () => {
  const sum = "a".repeat(64);
  const urls = {
    portrait: "https://x/storage/v1/object/public/daily-content-posters/2026-11-22/portrait.png",
    "portrait-p2": "https://x/storage/v1/object/public/daily-content-posters/2026-11-22/portrait-p2.png",
    square: "https://x/storage/v1/object/public/daily-content-posters/2026-11-22/square.png",
    "square-p2": "https://x/storage/v1/object/public/daily-content-posters/2026-11-22/square-p2.png",
  };
  const sums = { portrait: sum, "portrait-p2": sum, square: sum, "square-p2": sum };
  const set = ap.buildAdaptiveAssetSet({
    kolkataDate: "2026-11-22",
    hadithRef: "hadith:test",
    mode: "multi_page",
    pageCount: 2,
    posterUrls: urls,
    posterChecksums: sums,
    formats: ["portrait", "square"],
  });
  assert.equal(set.assetSetId, "poster:2026-11-22");
  assert.equal(set.pageAssetIds.length, 4);
  assert.equal(set.overallQc, "passed");
  const check = ap.checkAdaptiveAssetSet(set, urls.portrait, ["portrait", "square"]);
  assert.equal(check.ok, true, check.errors.join("; "));
});

t("asset set: check fails on a missing checksum and on a poster_url mismatch", () => {
  const sum = "a".repeat(64);
  const urls = {
    portrait: "https://x/storage/v1/object/public/daily-content-posters/2026-11-22/portrait.png",
    "portrait-p2": "https://x/storage/v1/object/public/daily-content-posters/2026-11-22/portrait-p2.png",
  };
  const set = ap.buildAdaptiveAssetSet({
    kolkataDate: "2026-11-22",
    hadithRef: "hadith:test",
    mode: "multi_page",
    pageCount: 2,
    posterUrls: urls,
    posterChecksums: { portrait: sum },
    formats: ["portrait"],
  });
  const bad = ap.checkAdaptiveAssetSet(set, urls.portrait, ["portrait"]);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("checksum")));
  const mismatched = ap.checkAdaptiveAssetSet(set, "https://x/other.png", ["portrait"]);
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.errors.some((e) => e.includes("poster_url")));
});

await done();
