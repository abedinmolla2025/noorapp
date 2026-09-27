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
