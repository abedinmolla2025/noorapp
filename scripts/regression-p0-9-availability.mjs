/**
 * P0-9 regression: false availability claims for unreleased hadith collections.
 *
 * Source of truth: only Sahih al-Bukhari is browsable on Noor. Every surface
 * (src copy, api/prerender.js, SEO defaults incl. OG metadata) must describe
 * Sahih Muslim, Jami at-Tirmidhi and Sunan Abu Dawud as planned / not yet
 * available — never as readable/browsable/searchable collections.
 *
 * Method: sentence-level scan. A sentence that mentions one of the three
 * unreleased collections FAILS if it matches an availability-claim pattern,
 * unless it first matches the honest-phrasing allowlist. Mention and claim
 * must co-occur in the same sentence, so source citations such as
 * "(Sahih Muslim 597)" or generic quiz advice never trip the gate.
 *
 * Usage: node scripts/regression-p0-9-availability.mjs
 * Exit 0 = no false claims. Exit 1 = failures listed.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

// Files whose user-facing copy + metadata feed crawlers and social previews.
const SCAN_DIRS = ["src", "api"];
const SCAN_EXTS = new Set([".ts", ".tsx", ".js"]);
// api/prerender.js + api/sitemap.js only; api holds edge functions too.
const API_ALLOW = new Set(["api/prerender.js", "api/sitemap.js"]);

const MENTION = /(sahih[-\s]?muslim|abu[-\s]?da['’]?wud|jami['’]?\s*(at|al)[-\s]?tirmidhi|tirmidhi|\/hadith\/(muslim|tirmidhi|abu-dawud))/i;

// Honest phrasing: any sentence containing one of these is compliant.
const ALLOW = /(not yet available|planned for a future release)/i;

// Claim patterns: language that presents the collection as browsable now.
const CLAIMS = [
  /\byou can (read|browse|explore|search)\b/i,
  /\b(read|browse|explor\w+|search)\b[^.!?\n]{0,140}\b(hadith|collection|narration)s?\b/i,
  /free and searchable/i,
  /\bnow available\b/i,
  /\bavailable on noor\b/i,
  /সম্পূর্ণ বিনামূল্যে/, // "completely free" — only honest next to Bukhari
];

// Targeted structural checks:
//  - FORBIDDEN: phrases that must not appear (imply browsability without
//    naming the collection in the same sentence).
//  - REQUIRED: honest phrasing that must be present (non-live book summaries
//    say "Planned for a future release" instead of "Browse by chapter").
const FORBIDDEN = [
  { file: "src/lib/seoDefaults.ts", pattern: /Read Sahih Muslim Hadith|Explore Jami at-Tirmidhi|Read Sunan Abu Dawud/, why: "SEO descriptions must not promise browsable collections" },
];
const REQUIRED = [
  { file: "src/pages/HadithPage.tsx", pattern: /book\.id !== "bukhari"\) return `[^`]*Planned for a future release/, why: "non-live book summaries must say 'Planned for a future release', never 'Browse by chapter'" },
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      yield* walk(p);
    } else if (SCAN_EXTS.has(path.extname(p))) {
      yield p;
    }
  }
}

const failures = [];
let scanned = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (!SCAN_DIRS.some((d) => rel === d || rel.startsWith(d + "/"))) continue;
  if (rel.startsWith("api/") && !API_ALLOW.has(rel)) continue;
  const text = fs.readFileSync(file, "utf8");
  const sentences = text.split(/(?<=[.!?।])\s+|\n/);
  sentences.forEach((sent, i) => {
    if (!MENTION.test(sent)) return;
    if (ALLOW.test(sent)) return;
    for (const re of CLAIMS) {
      if (re.test(sent)) {
        const snippet = sent.replace(/\s+/g, " ").trim().slice(0, 170);
        failures.push(`[${rel}#s${i}] ${re} :: ${snippet}`);
        break;
      }
    }
  });
  scanned++;
}

for (const { file, pattern, why } of FORBIDDEN) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  if (pattern.test(fs.readFileSync(full, "utf8"))) {
    failures.push(`[${file}] forbidden phrase ${pattern} :: ${why}`);
  }
}
for (const { file, pattern, why } of REQUIRED) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) { failures.push(`[${file}] missing file for required check`); continue; }
  if (!pattern.test(fs.readFileSync(full, "utf8"))) {
    failures.push(`[${file}] required honest phrasing missing ${pattern} :: ${why}`);
  }
}

if (failures.length) {
  console.log(`P0-9 REGRESSION: ${failures.length} FALSE AVAILABILITY CLAIM(S) in ${scanned} files`);
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
console.log(`P0-9 REGRESSION: PASS — no false availability claims in ${scanned} scanned files`);
