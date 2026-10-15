#!/usr/bin/env node
/**
 * verify-quran-dataset.mjs
 *
 * Validates the vendored Quran dataset (public/data/quran/):
 *   1. Every edition has exactly 114 surah files.
 *   2. Per-surah ayah counts match src/data/quran_surahs.json (total 6236).
 *   3. No empty ayah strings.
 *   4. No invisible characters outside the approved list.
 *      Approved (never auto-removed): U+200C ZWNJ, U+200D ZWJ, U+2060 WJ, U+200A.
 *      Forbidden after cleaning: U+FEFF BOM, U+200B ZWSP, U+180E MVS.
 *      (Arabic files: a leading BOM is stripped at download; translations:
 *      BOM+ZWSP stripped. Anything remaining is a failure.)
 *   5. Writes/validates a sha256 checksum manifest (checksums.json).
 *
 * Usage:
 *   node scripts/verify-quran-dataset.mjs            # verify (+ write manifest if missing)
 *   node scripts/verify-quran-dataset.mjs --write     # (re)write checksum manifest
 *
 * Exit code 0 = all checks pass.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QURAN_DIR = join(ROOT, "public", "data", "quran");
const WRITE = process.argv.includes("--write");

const EDITIONS = ["quran-uthmani", "bn.bengali", "en.sahih", "ur.ahmedali", "hi.hindi", "id.indonesian"];
const FORBIDDEN = { "\uFEFF": "BOM", "\u200B": "ZWSP", "\u180E": "MVS" };

const failures = [];
const fail = (msg) => { failures.push(msg); console.error("FAIL:", msg); };

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// Expected ayah counts from the repo's own surah metadata.
const surahMeta = JSON.parse(readFileSync(join(ROOT, "src", "data", "quran_surahs.json"), "utf8"));
const expectedCounts = new Map(surahMeta.map((s) => [s.number, s.numberOfAyahs]));
const expectedTotal = [...expectedCounts.values()].reduce((a, b) => a + b, 0);

const manifestPath = join(QURAN_DIR, "checksums.json");
const oldManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const newManifest = { generatedAt: new Date().toISOString(), files: {} };

for (const edition of EDITIONS) {
  const dir = join(QURAN_DIR, edition);
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); }
  catch { fail(`${edition}: directory missing`); continue; }

  if (files.length !== 114) fail(`${edition}: expected 114 files, found ${files.length}`);

  let totalAyahs = 0;
  for (const f of files) {
    const m = f.match(/^surah-(\d+)\.json$/);
    if (!m) { fail(`${edition}/${f}: bad filename`); continue; }
    const surahNum = Number(m[1]);
    const full = join(dir, f);
    const raw = readFileSync(full);
    newManifest.files[`quran/${edition}/${f}`] = sha256(raw);

    let doc;
    try { doc = JSON.parse(raw.toString("utf8")); }
    catch (e) { fail(`${edition}/${f}: invalid JSON`); continue; }

    if (doc.edition !== edition) fail(`${edition}/${f}: edition field = ${doc.edition}`);
    if (doc.surah !== surahNum) fail(`${edition}/${f}: surah field = ${doc.surah}`);
    if (!Array.isArray(doc.ayahs)) { fail(`${edition}/${f}: ayahs not an array`); continue; }
    if (doc.ayahs.length !== expectedCounts.get(surahNum)) {
      fail(`${edition}/${f}: ayah count ${doc.ayahs.length} != expected ${expectedCounts.get(surahNum)}`);
    }
    totalAyahs += doc.ayahs.length;

    doc.ayahs.forEach((a, i) => {
      if (typeof a.text !== "string" || a.text.length === 0) {
        fail(`${edition}/${f}: empty ayah text at index ${i} (surah ${surahNum}:${a.numberInSurah})`);
      }
      for (const [ch, name] of Object.entries(FORBIDDEN)) {
        if (a.text.includes(ch)) {
          fail(`${edition}/${f}: forbidden ${name} in surah ${surahNum}:${a.numberInSurah}`);
        }
      }
      if (a.numberInSurah !== i + 1) {
        fail(`${edition}/${f}: numberInSurah out of order at index ${i}`);
      }
    });
  }
  if (totalAyahs !== expectedTotal) {
    fail(`${edition}: total ayahs ${totalAyahs} != expected ${expectedTotal}`);
  } else {
    console.log(`ok: ${edition} — 114 files, ${totalAyahs} ayahs`);
  }
}

// audio.json check
{
  const p = join(QURAN_DIR, "audio.json");
  if (!existsSync(p)) fail("audio.json missing");
  else {
    const raw = readFileSync(p);
    newManifest.files["quran/audio.json"] = sha256(raw);
    const doc = JSON.parse(raw.toString("utf8"));
    const n = Object.keys(doc.audio || {}).length;
    if (n !== expectedTotal) fail(`audio.json: ${n} urls != ${expectedTotal}`);
    else console.log(`ok: audio.json — ${n} urls`);
  }
}

if (WRITE || !oldManifest) {
  writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + "\n");
  console.log("checksums.json written");
} else {
  // compare against committed manifest
  for (const [k, v] of Object.entries(newManifest.files)) {
    if (oldManifest.files[k] !== v) fail(`checksum mismatch: ${k}`);
  }
  console.log("checksums match manifest");
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S)`);
  process.exit(1);
}
console.log("\nAll dataset checks passed.");
