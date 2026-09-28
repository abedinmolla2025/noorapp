#!/usr/bin/env node
/**
 * P0-5 regression sweep: dua virtue leak channels (TRK4-301, TRK2-001, TRK2-017).
 *
 * Verifies (offline, deterministic):
 *  1. The 11-row explanation_bn suppression list is identical in the SPA
 *     (src/pages/dua/DuaDetailPage.tsx) and the prerender
 *     (api/prerender.js) dua detail branch.
 *  2. The SPA gates every explanation_bn consumer through the suppression.
 *  3. The prerender nulls explanation_bn for suppressed rows BEFORE the meta
 *     description / Article JSON-LD / bot HTML body are built.
 *  4. Tasbih virtue claims are removed from the SPA list, the extracted JSON
 *     (public/data/dhikr-list.json) and the prerender renderer.
 *  5. None of the known-bad texts (8 templated virtue sentences, 6 tasbih
 *     claims, 11 promise signatures) appear in any dua/tasbih render path.
 *
 * Run: node scripts/p0-5-dua-virtue-leak-sweep.mjs
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

// ---------------------------------------------------------------- expected
const EXPECTED_SLUGS = [
  "dua-of-prophet-yunus",
  "dua-after-wudu",
  "al-baqarah-2-285",
  "allahumma-ajirni-minan-naar",
  "al-baqarah-2-286",
  "ইসমে-আযমের-দোয়া-অত্যন্ত-ফজিলতপূর্ণ",
  "dua-before-eating",
  "dua-before-entering-toilet",
  "the-master-of-seeking-forgiveness",
  "dua-when-leaving-home",
  "ayatul-kursi-2",
];

const TEMPLATED_VIRTUE_SENTENCES = [
  "Dua relieves burden by turning the heart fully to Allah.",
  "This dua reconnects the heart to Allah in moments of need and uncertainty.",
  "Sincere reliance on Allah brings protection and tranquility to the heart.",
  "Allah loves those who repent and return to Him sincerely.",
  "Provision is from Allah; dua aligns effort with trust in Him.",
  "Dua in hardship strengthens patience and dependence on Allah.",
  "Night remembrance guards the heart and deepens trust.",
  "Remembering Allah in travel brings safety and gratitude.",
];

const TASBIH_CLAIMS = [
  "Plants a tree in Paradise",
  "Fills the scales of good deeds",
  "Most beloved words to Allah",
  "Best of remembrance",
  "Opens the door of mercy",
  "Sins forgiven even if like sea foam",
];

// Distinctive substrings of the 11 suppressed explanation_bn promise texts.
const PROMISE_SIGNATURES = [
  "রাসুলুল্লাহ (সা.) বলেছেন, কোনো মুসলিম যদি কোনো সমস্যার জন্য এই দোয়া পাঠ করে",
  "তার জন্য জান্নাতের ৮টি দরজাই খুলে দেওয়া হবে",
  "যে ব্যক্তি রাতে এই দুই আয়াত পাঠ করবে, তার জন্য তা যথেষ্ট হয়ে যাবে",
  "ফজর ও মাগরিবের নামাজের পর সাতবার এটি পাঠ করলে",
  "যে ব্যক্তি রাতে এই সূরাটির শেষ দুটি আয়াত পাঠ করবে, তা তার জন্য যথেষ্ট হবে",
  "এতে আল্লাহর সেই মহান নাম রয়েছে যা দ্বারা ডাকলে তিনি সাড়া দেন",
  "ব্যক্তি খাবারের শুরুতে আল্লাহর নাম নেয় না, শয়তান তার খাবারে শরিক হয়",
  "তখন তার এবং জিনের দৃষ্টির মাঝে একটি পর্দা পড়ে যায়",
  "সে নিশ্চিতভাবেই জান্নাতী হবে",
  "তোমার জন্য আল্লাহই যথেষ্ট এবং তোমাকে সঠিক পথ দেখানো হয়েছে",
  "রাসুলুল্লাহ (সা.) একে কুরআনের শ্রেষ্ঠ আয়াত বলেছেন",
];

// ---------------------------------------------------------------- helpers
const extractSlugSet = (src, file) => {
  const m = src.match(/EXPLANATION_BN_SUPPRESSED_SLUGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) {
    ok(false, `${file}: suppression set not found`);
    return null;
  }
  const slugs = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return slugs;
};

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/<!--[\s\S]*?-->/g, "");

// ---------------------------------------------------------------- 1. sets
const spa = read("src/pages/dua/DuaDetailPage.tsx");
const bot = read("api/prerender.js");

const spaSet = extractSlugSet(spa, "DuaDetailPage.tsx");
const botSet = extractSlugSet(bot, "api/prerender.js");
ok(
  !!spaSet && [...spaSet].sort().join("\n") === [...EXPECTED_SLUGS].sort().join("\n"),
  "SPA suppression set = exactly the 11 expected slugs",
);
ok(
  !!botSet && [...botSet].sort().join("\n") === [...EXPECTED_SLUGS].sort().join("\n"),
  "prerender suppression set = exactly the 11 expected slugs",
);
ok(
  !!spaSet && !!botSet && [...spaSet].sort().join("\n") === [...botSet].sort().join("\n"),
  "SPA and prerender suppression sets are identical",
);

// ---------------------------------------------------------------- 2. SPA gating
ok(
  spa.includes("isExplanationBnSuppressed(dua.slug) ? null : dua.explanation_bn"),
  "SPA: getDuaRich gates explanation_bn through the suppression",
);
ok(
  spa.includes("getSuppressedExplanationBn(dua)?.replace"),
  "SPA: meta description uses the suppressed explanation_bn",
);
// Every bare dua.explanation_bn read must be a gated one (or the type decl /
// the column list / the helper definition itself).
const spaBareReads = spa
  .split("\n")
  .map((l, i) => ({ l, i: i + 1 }))
  .filter(({ l }) => l.includes("dua.explanation_bn") && !l.trim().startsWith("//"));
const spaAllowed = spaBareReads.every(({ l }) =>
  l.includes("isExplanationBnSuppressed") ||
  l.includes("getSuppressedExplanationBn") ||
  l.includes("explanation_bn: string | null") ||
  l.includes("explanation_bn, explanation_en"),
);
ok(spaAllowed, `SPA: all explanation_bn reads are gated/typed/fetched (found ${spaBareReads.length} read lines)`);
if (!spaAllowed) spaBareReads.forEach(({ l, i }) => console.log(`    L${i}: ${l.trim().slice(0, 120)}`));

// ---------------------------------------------------------------- 3. prerender ordering
const nullIdx = bot.indexOf("dua.explanation_bn = null");
const descIdx = bot.indexOf("description = dua.explanation_bn");
ok(nullIdx > -1, "prerender: explanation_bn nulling present for suppressed slugs");
ok(descIdx > -1, "prerender: meta description derives from explanation_bn");
ok(
  nullIdx > -1 && descIdx > -1 && nullIdx < descIdx,
  "prerender: suppression nulls explanation_bn BEFORE meta/JSON-LD/body use",
);
ok(
  !stripComments(bot).includes("d.virtue"),
  "prerender: renderDhikrList no longer renders any d.virtue claim",
);

// ---------------------------------------------------------------- 4. tasbih removal
const tasbih = read("src/pages/TasbihPage.tsx");
const tasbihStripped = stripComments(tasbih);
ok(!tasbihStripped.includes("virtue:"), "SPA: dhikrList has no virtue keys");
ok(!tasbihStripped.includes("currentDhikr.virtue"), "SPA: virtue render block removed");
const dhikrJson = JSON.parse(read("public/data/dhikr-list.json"));
ok(
  Array.isArray(dhikrJson) && dhikrJson.length === 6 && dhikrJson.every((d) => !("virtue" in d)),
  "dhikr-list.json: 6 entries, zero virtue keys",
);

// ---------------------------------------------------------------- 5. known-bad-text sweep
const renderFiles = {
  "api/prerender.js": stripComments(bot),
  "src/pages/dua/DuaDetailPage.tsx": stripComments(spa),
  "src/pages/dua/DuaCategoryPage.tsx": stripComments(read("src/pages/dua/DuaCategoryPage.tsx")),
  "src/pages/TasbihPage.tsx": stripComments(tasbih),
  "public/data/dhikr-list.json": read("public/data/dhikr-list.json"),
  "api/sitemap.js": stripComments(read("api/sitemap.js")),
  "api/home.js": stripComments(read("api/home.js")),
  "src/lib/getAllDuas.ts": stripComments(read("src/lib/getAllDuas.ts")),
};
const BAD = [...TEMPLATED_VIRTUE_SENTENCES, ...TASBIH_CLAIMS, ...PROMISE_SIGNATURES];
let badHits = 0;
for (const [file, text] of Object.entries(renderFiles)) {
  for (const needle of BAD) {
    if (text.includes(needle)) {
      console.log(`FAIL  leak: "${needle.slice(0, 60)}…" in ${file}`);
      badHits++;
    }
  }
}
ok(badHits === 0, `sweep: 0 of ${BAD.length} known-bad texts appear in render paths (${Object.keys(renderFiles).length} files)`);

// ---------------------------------------------------------------- 6. virtue render absence
// After comment stripping, `virtue` may only remain as: the DuaRow interface
// type declaration, the Supabase select column list, and the `d.virtue`-free
// guards above. Any `.virtue` property *read* of a dua row is a render leak.
for (const [file, text] of [["api/prerender.js", stripComments(bot)], ["src/pages/dua/DuaDetailPage.tsx", stripComments(spa)]]) {
  const reads = text.match(/\bdua\.virtue(_reference)?\b/g) || [];
  ok(reads.length === 0, `${file}: no dua.virtue(_reference) value reads (found ${reads.length})`);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
