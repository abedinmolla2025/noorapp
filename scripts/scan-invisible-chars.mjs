#!/usr/bin/env node
/**
 * scan-invisible-chars.mjs
 *
 * Default mode is a dry-run REPORT: for every invisible character found it
 * prints file, detected language/script, ayah reference (for quran data
 * files), and surrounding text. Nothing is modified.
 *
 *   node scripts/scan-invisible-chars.mjs            # dry-run report
 *   node scripts/scan-invisible-chars.mjs --fix      # clean per rules below
 *
 * --fix rules (user-approved 2026-10-15):
 *   - Removes ONLY U+FEFF (BOM) and U+200B (zero-width space),
 *     and ONLY inside translation (non-Arabic-script) strings.
 *   - Inside Arabic-script strings: removes ONLY a BOM at the very start
 *     of the string. U+200B is left untouched in Arabic.
 *   - NEVER auto-removes U+200C (ZWNJ), U+200D (ZWJ), U+2060 (word joiner)
 *     or U+200A — all valid in Bengali/Urdu spelling and Arabic Quran text.
 *   - NEVER applies Unicode normalization to Quran text.
 *   - Every removed character is logged (file, line, char, context).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const FIX = process.argv.includes("--fix");

const TARGETS = { "\uFEFF": "BOM", "\u200B": "ZWSP" };       // fixable
const REPORT_ONLY = { "\u200C": "ZWNJ", "\u200D": "ZWJ", "\u2060": "WJ", "\u200A": "HAIR-SPACE" }; // never auto-removed
const ALL = { ...TARGETS, ...REPORT_ONLY };

const SCAN_DIRS = ["public/data", "src/data", "src/pages", "src/components", "src/hooks", "src/lib", "api", "supabase", "scripts"];
const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "research", "backup", ".backups"]);
const SCAN_EXT = new Set([".json", ".ts", ".tsx", ".js", ".mjs", ".sql", ".html"]);

const ARABIC_RE = /[\u0600-\u06FF]/; // Arabic block (covers Urdu too)
const BENGALI_RE = /[\u0980-\u09FF]/; // Bengali block
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function detectScript(s) {
  if (ARABIC_RE.test(s)) return s.match(/[ٮ-ۿ]/) ? "arabic-script" : "arabic-script";
  if (BENGALI_RE.test(s)) return "bengali";
  if (/[A-Za-z]/.test(s)) return "latin";
  return "other";
}
function isArabicScript(s) { return ARABIC_RE.test(s); }

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (EXCLUDE_DIRS.has(entry)) continue;
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, out);
    else if ([...SCAN_EXT].some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

/** Find the enclosing double-quoted JSON/JS string around index `i`. Returns {start,end,content} or null. */
function enclosingString(text, i) {
  let start = -1;
  for (let j = i - 1; j >= 0; j--) {
    if (text[j] === '"' && text[j - 1] !== "\\") { start = j; break; }
    if (text[j] === "\n") break; // give up across lines (minified JSON is one line — fine)
  }
  if (start < 0) return null;
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '"' && text[j - 1] !== "\\") {
      return { start, end: j, content: text.slice(start + 1, j) };
    }
  }
  return null;
}

function lineOf(text, i) { return text.slice(0, i).split("\n").length; }

/** surah/ayah ref for vendored quran files: public/data/quran/<ed>/surah-<n>.json */
function ayahRef(file, text, i) {
  const m = file.match(/public\/data\/quran\/([^/]+)\/surah-(\d+)\.json$/);
  if (!m) return null;
  const back = text.slice(Math.max(0, i - 400), i);
  const am = back.match(/"numberInSurah"\s*:\s*(\d+)(?!.*"numberInSurah"\s*:\s*\d)/);
  const am2 = [...back.matchAll(/"numberInSurah"\s*:\s*(\d+)/g)].pop();
  return { edition: m[1], surah: Number(m[2]), ayah: am2 ? Number(am2[1]) : null };
}

const files = [];
for (const d of SCAN_DIRS) {
  try { collectFiles(join(ROOT, d), files); } catch { /* missing dir */ }
}

const hits = [];
const removals = [];

for (const f of files.sort()) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const rel = relative(ROOT, f);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const name = ALL[ch];
    if (!name) continue;
    // Legitimate emoji ZWJ sequences are not even reported as hits.
    if (name === "ZWJ") {
      const w = text.slice(Math.max(0, i - 4), i + 5);
      if (EMOJI_RE.test(w)) continue;
    }
    // The sanitizer's own character-class literals are intentional — skip them.
    const lineStart = text.lastIndexOf("\n", i) + 1;
    const lineEnd = text.indexOf("\n", i);
    const lineText = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    if (lineText.includes("INVISIBLE_RE")) continue;
    const str = enclosingString(text, i);
    const content = str ? str.content : text.slice(Math.max(0, i - 30), i + 30);
    const arabic = str ? isArabicScript(str.content) : isArabicScript(content);
    const script = detectScript(content);
    const offsetInString = str ? i - (str.start + 1) : -1;
    hits.push({
      file: rel, line: lineOf(text, i), char: name,
      codepoint: "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"),
      language: arabic ? "arabic" : script,
      ayahRef: ayahRef(rel, text, i),
      context: content.replace(/\n/g, "\\n").slice(0, 120),
    });

    if (FIX && TARGETS[ch]) {
      let remove = false;
      if (name === "BOM") {
        remove = arabic ? offsetInString === 0 : true; // arabic: only string-start BOM
      } else if (name === "ZWSP") {
        remove = !arabic; // translations only
      }
      if (remove) {
        removals.push({ file: rel, line: lineOf(text, i), char: name, offsetInString, context: content.replace(/\n/g, "\\n").slice(0, 80) });
        text = text.slice(0, i) + text.slice(i + 1);
        i--; // re-examine shifted position
        // rewrite at end per file
        f._dirty = true;
      }
    }
  }
  if (FIX && text !== readFileSync(f, "utf8")) {
    writeFileSync(f, text, "utf8");
  }
}

const byFile = {};
for (const h of hits) {
  const k = h.file;
  byFile[k] = byFile[k] || { file: k, hits: 0, byChar: {}, samples: [] };
  byFile[k].hits++;
  byFile[k].byChar[h.char] = (byFile[k].byChar[h.char] || 0) + 1;
  if (byFile[k].samples.length < 3) byFile[k].samples.push(h);
}

console.log(JSON.stringify({
  mode: FIX ? "fix" : "dry-run",
  filesScanned: files.length,
  totalHits: hits.length,
  files: Object.values(byFile),
  removals: FIX ? removals : `${removals.length} (dry-run: nothing removed)`,
  removalCount: removals.length,
}, null, 2));
