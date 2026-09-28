// scripts/extract-tool-data.mjs
// Build-time extractor: pulls hardcoded tool content out of the React page
// sources and writes it as JSON under public/data/ so the prerender function
// (api/prerender.js) can server-render the same content for SEO.
// The TSX components remain the single source of truth; this script runs on
// every build (see package.json "build") so dist always matches the UI.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "data");

// Extract a bracket-delimited literal (array/object) starting at the first
// "[" or "{" after `marker`, respecting string literals and escapes.
function extractLiteral(source, marker) {
  const startIdx = source.indexOf(marker);
  if (startIdx === -1) throw new Error(`marker not found: ${marker}`);
  // Start after the assignment "=" so type annotations like `Foo[]` are skipped.
  const eqIdx = source.indexOf("=", startIdx);
  if (eqIdx === -1) throw new Error(`no assignment after marker: ${marker}`);
  let i = source.indexOf("[", eqIdx);
  const objIdx = source.indexOf("{", startIdx);
  let open, close;
  if (objIdx !== -1 && objIdx < i) { i = objIdx; open = "{"; close = "}"; }
  else { open = "["; close = "]"; }
  let depth = 0, quote = null, escaped = false;
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  throw new Error(`unbalanced literal after marker: ${marker}`);
}

function evalLiteral(literal, label) {
  // Source is our own trusted TSX; the extracted literal is plain data
  // (verified: no backticks, template placeholders or JSX inside).
  const value = new Function(`"use strict"; return (${literal});`)();
  if (!Array.isArray(value)) throw new Error(`${label}: expected array`);
  return value;
}

const jobs = [
  {
    src: "src/pages/NamesOfAllahPage.tsx",
    marker: "const namesOfAllah",
    out: "names-of-allah.json",
    expect: 99,
    label: "names of Allah",
  },
  {
    src: "src/pages/PrayerGuidePage.tsx",
    marker: "const PRAYER_STEPS",
    out: "prayer-guide-steps.json",
    expect: 9,
    label: "prayer guide steps",
  },
  {
    src: "src/pages/TasbihPage.tsx",
    marker: "const dhikrList",
    out: "dhikr-list.json",
    expect: 6,
    label: "tasbih dhikr",
  },
  {
    src: "src/pages/IslamicCalendarPage.tsx",
    marker: "const hijriMonths",
    out: "hijri-months.json",
    expect: 12,
    label: "hijri months",
  },
  {
    src: "src/pages/IslamicCalendarPage.tsx",
    marker: "const importantDates",
    out: "islamic-important-dates.json",
    expect: null, // informational list; count may grow
    label: "important Islamic dates",
    min: 1,
  },
];

fs.mkdirSync(outDir, { recursive: true });
for (const job of jobs) {
  const source = fs.readFileSync(path.join(root, job.src), "utf8");
  const value = evalLiteral(extractLiteral(source, job.marker), job.label);
  if (job.expect !== null && value.length !== job.expect) {
    throw new Error(
      `[extract-tool-data] ${job.label}: expected ${job.expect} items, got ${value.length} — refusing to write stale data`
    );
  }
  if (job.min && value.length < job.min) {
    throw new Error(`[extract-tool-data] ${job.label}: expected at least ${job.min} items`);
  }
  fs.writeFileSync(path.join(outDir, job.out), JSON.stringify(value, null, 2) + "\n");
  console.log(`[extract-tool-data] ${job.out}: ${value.length} items`);
}
console.log("[extract-tool-data] done");

// Quran surah metadata (number, names, ayah counts, revelation type) is already
// a JSON source of truth at src/data/quran_surahs.json; copy it verbatim so the
// prerender function can render prev/next-surah navigation and Meccan/Medinan
// badges without inventing data.
{
  const srcFile = path.join(root, "src", "data", "quran_surahs.json");
  const surahs = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  if (!Array.isArray(surahs) || surahs.length !== 114) {
    throw new Error(
      `[extract-tool-data] quran surahs: expected 114 items, got ${Array.isArray(surahs) ? surahs.length : "non-array"} — refusing to write stale data`
    );
  }
  fs.writeFileSync(path.join(outDir, "quran-surahs.json"), JSON.stringify(surahs) + "\n");
  console.log("[extract-tool-data] quran-surahs.json: 114 items");
}

// Surah introductions (evidence-first research, 2026-09-28): only surahs whose
// every published claim reached VERIFIED (>=2 independent reputable sources)
// are included. Copied verbatim so the prerender function can render the
// intro + source attribution without inventing data. Surahs without a verified
// intro are simply absent — no placeholder is rendered.
{
  const srcFile = path.join(root, "src", "data", "surah-intros.json");
  const intros = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  if (!Array.isArray(intros) || intros.length === 0) {
    throw new Error("[extract-tool-data] surah intros: expected non-empty array — refusing to write stale data");
  }
  for (const it of intros) {
    if (!it.number || !it.intro_en || !Array.isArray(it.sources) || it.sources.length === 0) {
      throw new Error("[extract-tool-data] surah intro missing intro_en/sources — refusing");
    }
  }
  const outFile = path.join(outDir, "surah-intros.json");
  fs.writeFileSync(outFile, JSON.stringify(intros));
  console.log(`[extract-tool-data] surah-intros.json: ${intros.length} items`);
}

// Quiz duplicate -> canonical-primary mapping (generated by
// scripts/generate-quiz-canonicals.py from QUIZ_FORENSIC_AUDIT_2026-09-28.md).
// Copied verbatim so api/prerender.js and api/sitemap.js can consolidate
// duplicate quiz URLs via canonical hints without DB changes.
{
  const srcFile = path.join(root, "src", "data", "quiz-duplicate-canonicals.json");
  const doc = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  if (!doc || typeof doc.map !== "object" || Array.isArray(doc.map)) {
    throw new Error("[extract-tool-data] quiz-canonicals: expected { map: { dupId: primaryId } }");
  }
  const entries = Object.entries(doc.map);
  for (const [dup, primary] of entries) {
    if (typeof dup !== "string" || typeof primary !== "string" || !dup || !primary || dup === primary) {
      throw new Error("[extract-tool-data] quiz-canonicals: invalid mapping entry");
    }
  }
  fs.writeFileSync(path.join(outDir, "quiz-canonicals.json"), JSON.stringify(doc) + "\n");
  console.log(`[extract-tool-data] quiz-canonicals.json: ${entries.length} duplicate mappings`);
}
