// Build the local dry-run fixture from REAL bundled data only.
// - contents: eligible duas from public/data/duas.json (verbatim fields).
// - hadiths: NONE. There is no bundled Bengali hadith dataset in the repo
//   (only EN/UR JSON without Bengali), and the live `hadiths` table is
//   never read by local tooling. The dry-run therefore honestly reports an
//   empty hadith slot; unit tests cover hadith selection with clearly
//   labelled synthetic logic strings (never rendered as content).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const duas = JSON.parse(fs.readFileSync(path.join(root, "public/data/duas.json"), "utf8"));

const eligible = duas.filter(
  (d) =>
    typeof d.slug === "string" && d.slug.trim() &&
    typeof d.arabic === "string" && d.arabic.trim() &&
    typeof d.translation_bn === "string" && d.translation_bn.trim() &&
    typeof d.reference === "string" && d.reference.trim(),
);
// Stride-sample across the whole file so the fixture mixes Quran-sourced,
// Hadith-sourced and general duas (the file is grouped by source otherwise).
const contents = [];
const step = Math.max(1, Math.floor(eligible.length / 40));
for (let i = 0; i < eligible.length && contents.length < 40; i += step) {
  const d = eligible[i];
  contents.push({
    slug: d.slug,
    source_type: d.source_type ?? null,
    title_bn: d.title_bn ?? null,
    title_en: d.title_en ?? null,
    arabic: d.arabic,
    translation_bn: d.translation_bn,
    reference: d.reference,
    category: d.category ?? null,
  });
}

const out = {
  note: "Real bundled dua records (verbatim). No hadith records: see header.",
  contents,
  counts: { duasTotal: duas.length, duasEligible: eligible.length, contentsInFixture: contents.length },
};
const outPath = path.join(root, "scripts/daily-content/fixture.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`fixture: ${contents.length} contents (from ${duas.length} duas, ${eligible.length} eligible) -> ${outPath}`);
