#!/usr/bin/env node
/**
 * scan-invisible-chars.mjs — DRY-RUN ONLY (AdSense-review-safe)
 *
 * Scans the project's Quran/Hadith/Dua datasets for invisible Unicode
 * characters and prints a report. THIS SCRIPT NEVER MODIFIES ANY FILE.
 *
 *   node scripts/scan-invisible-chars.mjs
 *
 * Characters covered:
 *   U+FEFF  BOM                  } --fix candidates (ONLY after owner approval)
 *   U+200B  ZERO WIDTH SPACE     }
 *   U+200C  ZERO WIDTH NON-JOINER } report-only: may be valid in Bengali/Urdu
 *   U+200D  ZERO WIDTH JOINER     } orthography and Arabic Quran text
 *   U+2060  WORD JOINER           }
 *   U+200A  HAIR SPACE            }
 *
 * ZWJ inside emoji sequences (e.g. 👨‍👩‍👧‍👦) is ignored — always legitimate.
 * No Unicode normalization is ever applied to Quran text.
 *
 * Report columns: file, detected language/script, ayah-or-entry reference,
 * character code, surrounding text.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const CHARS = {
  "\uFEFF": { name: "BOM", code: "U+FEFF", fixable: true },
  "\u200B": { name: "ZWSP", code: "U+200B", fixable: true },
  "\u200C": { name: "ZWNJ", code: "U+200C", fixable: false },
  "\u200D": { name: "ZWJ", code: "U+200D", fixable: false },
  "\u2060": { name: "WJ", code: "U+2060", fixable: false },
  "\u200A": { name: "HAIR-SPACE", code: "U+200A", fixable: false },
};

const SCAN_DIRS = ["public/data", "src/data"];
const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "research", "backup", ".backups"]);
const SCAN_EXT = new Set([".json", ".ts", ".tsx", ".js", ".mjs", ".sql"]);

const EMOJI_RE = /[\u0600-\u06FF]/u;

function collectFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (EXCLUDE_DIRS.has(entry)) continue;
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, out);
    else if ([...SCAN_EXT].some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

function detectLanguage(s) {
  if (/[̀-ۿ]/.test(s)) return "arabic-script";
  if (/[\u0980-\u09FF]/.test(s)) return "bengali";
  if (/[A-Za-z]/.test(s)) return "latin";
  return "other";
}

/** Best-effort entry reference: surah:ayah for quran files, else nearby id/number keys. */
function entryRef(file, text, i) {
  const back = text.slice(Math.max(0, i - 500), i);
  const pairs = [...back.matchAll(/"(numberInSurah|ayah|number|id|surah)"\s*:\s*"?([0-9A-Za-z-]+)"?/g)];
  if (!pairs.length) return null;
  const last = pairs[pairs.length - 1];
  const m2 = [...back.matchAll(/"numberInSurah"\s*:\s*(\d+)/g)].pop();
  const sm = file.match(/surah-(\d+)\.json$/);
  if (sm && m2) return `surah ${sm[1]} ayah ${m2[1]}`;
  return `${last[1]}=${last[2]}`;
}

function lineOf(text, i) { return text.slice(0, i).split("\n").length; }

const files = [];
for (const d of SCAN_DIRS) collectFiles(join(ROOT, d), files);

const report = [];
for (const f of files.sort()) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const rel = relative(ROOT, f);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const info = CHARS[ch];
    if (!info) continue;
    if (info.name === "ZWJ") {
      const w = text.slice(Math.max(0, i - 4), i + 5);
      if (EMOJI_RE.test(w)) continue; // legitimate emoji joiner
    }
    const ctx = text.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, "\\n");
    report.push({
      file: rel,
      line: lineOf(text, i),
      language: detectLanguage(ctx),
      entry: entryRef(rel, text, i),
      char: `${info.name} (${info.code})`,
      fixable: info.fixable ? "yes — only with owner approval" : "no (report-only)",
      context: ctx.slice(0, 100),
    });
  }
}

const byFile = {};
for (const h of report) {
  byFile[h.file] = byFile[h.file] || { file: h.file, hits: 0, chars: {} };
  byFile[h.file].hits++;
  const c = h.char;
  byFile[h.file].chars[c] = (byFile[h.file].chars[c] || 0) + 1;
}

console.log(JSON.stringify({
  mode: "dry-run (no files modified)",
  filesScanned: files.length,
  totalHits: report.length,
  summary: Object.values(byFile),
  hits: report,
}, null, 2));
