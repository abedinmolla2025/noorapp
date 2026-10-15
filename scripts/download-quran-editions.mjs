#!/usr/bin/env node
/**
 * download-quran-editions.mjs
 *
 * Downloads the Quran dataset ONCE from the AlQuran Cloud API and stores it
 * as static per-surah JSON under public/data/quran/.
 *
 * Layout:
 *   public/data/quran/quran-uthmani/surah-<n>.json   Arabic (Uthmani) text — THE single
 *                                                     Arabic edition for SPA + prerender.
 *                                                     Text is NEVER normalized; only a
 *                                                     leading U+FEFF BOM is stripped.
 *   public/data/quran/audio.json                     {"<surah>:<ayahInSurah>": "<audio url>"}
 *                                                     recitation audio URLs (ar.alafasy)
 *   public/data/quran/<edition>/surah-<n>.json       translations:
 *     bn.bengali (Muhiuddin Khan), en.sahih (Saheeh International),
 *     ur.ahmedali (Ahmed Ali), hi.hindi, id.indonesian.
 *     In translations only U+FEFF and U+200B are stripped. ZWNJ/ZWJ/U+2060
 *     are NEVER touched (valid in Bengali/Urdu orthography).
 *
 * Run: node scripts/download-quran-editions.mjs
 * Re-run only to refresh the dataset; it is committed to the repo.
 */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "data", "quran");

const ARABIC_EDITION = "quran-uthmani";
const AUDIO_EDITION = "ar.alafasy";
const TRANSLATIONS = {
  "bn.bengali": { language: "bengali", translator: "Muhiuddin Khan" },
  "en.sahih": { language: "english", translator: "Saheeh International" },
  "ur.ahmedali": { language: "urdu", translator: "Ahmed Ali" },
  "hi.hindi": { language: "hindi", translator: "Suhel Farooq Khan and Saifur Rahman Nadwi" },
  "id.indonesian": { language: "indonesian", translator: "Translator not named by the source API" },
};

// Translation rule: strip BOM + ZWSP only.
const TRANSLATION_CLEAN_RE = /[﻿​]/g;
// Arabic rule: strip ONLY a leading BOM. No normalization, nothing else.
const stripArabic = (s) => (typeof s === "string" && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const cleanTranslation = (s) => (typeof s === "string" ? s.replace(TRANSLATION_CLEAN_RE, "") : s);

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const summary = {
  downloadedAt: new Date().toISOString(),
  source: "https://api.alquran.cloud/v1/quran/{edition}",
  arabicEdition: ARABIC_EDITION,
  audioEdition: AUDIO_EDITION,
  editions: {},
};

// 1. Arabic text (single edition for SPA + prerender)
console.log(`Downloading ${ARABIC_EDITION} (arabic text) ...`);
{
  const payload = await fetchJson(`https://api.alquran.cloud/v1/quran/${ARABIC_EDITION}`);
  const surahs = payload.data?.surahs;
  if (payload.code !== 200 || !surahs || surahs.length !== 114) throw new Error("Bad arabic payload");
  const dir = join(OUT_DIR, ARABIC_EDITION);
  mkdirSync(dir, { recursive: true });
  let ayahs = 0, boms = 0;
  for (const s of surahs) {
    const out = s.ayahs.map((a) => {
      const text = stripArabic(a.text);
      if (text !== a.text) boms++;
      return { number: a.number, numberInSurah: a.numberInSurah, text };
    });
    ayahs += out.length;
    writeFileSync(join(dir, `surah-${s.number}.json`),
      JSON.stringify({ edition: ARABIC_EDITION, surah: s.number, ayahCount: out.length, ayahs: out }, null, 1) + "\n");
  }
  summary.editions[ARABIC_EDITION] = { language: "arabic", ayahs, leadingBomStripped: boms, normalized: false };
  console.log(`  ${ayahs} ayahs, ${boms} leading BOMs stripped, no normalization`);
}

// 2. Audio URLs only (ar.alafasy) -> single audio.json
console.log(`Downloading ${AUDIO_EDITION} (audio URLs only) ...`);
{
  const payload = await fetchJson(`https://api.alquran.cloud/v1/quran/${AUDIO_EDITION}`);
  const surahs = payload.data?.surahs;
  if (payload.code !== 200 || !surahs || surahs.length !== 114) throw new Error("Bad audio payload");
  const audio = {};
  let n = 0;
  for (const s of surahs) {
    for (const a of s.ayahs) {
      if (a.audio) { audio[`${s.number}:${a.numberInSurah}`] = a.audio; n++; }
    }
  }
  writeFileSync(join(OUT_DIR, "audio.json"), JSON.stringify({ edition: AUDIO_EDITION, count: n, audio }, null, 1) + "\n");
  summary.editions[AUDIO_EDITION] = { role: "audio-urls-only", urls: n };
  console.log(`  ${n} audio URLs`);
}

// 3. Translations
for (const [edition, meta] of Object.entries(TRANSLATIONS)) {
  console.log(`Downloading ${edition} ...`);
  const payload = await fetchJson(`https://api.alquran.cloud/v1/quran/${edition}`);
  const surahs = payload.data?.surahs;
  if (payload.code !== 200 || !surahs || surahs.length !== 114) throw new Error(`Bad payload for ${edition}`);
  const dir = join(OUT_DIR, edition);
  mkdirSync(dir, { recursive: true });
  let ayahs = 0, cleaned = 0;
  for (const s of surahs) {
    const out = s.ayahs.map((a) => {
      const text = cleanTranslation(a.text);
      if (text !== a.text) cleaned += a.text.length - text.length;
      return { number: a.number, numberInSurah: a.numberInSurah, text };
    });
    ayahs += out.length;
    writeFileSync(join(dir, `surah-${s.number}.json`),
      JSON.stringify({ edition, surah: s.number, ayahCount: out.length, ayahs: out }, null, 1) + "\n");
  }
  summary.editions[edition] = { ...meta, ayahs, invisibleCharsStripped: cleaned };
  console.log(`  ${ayahs} ayahs, ${cleaned} BOM/ZWSP chars stripped`);
}

// 4. Remove the old ar.alafasy TEXT tree (superseded by quran-uthmani + audio.json)
rmSync(join(OUT_DIR, AUDIO_EDITION), { recursive: true, force: true });
console.log(`  removed superseded text tree public/data/quran/${AUDIO_EDITION}/`);

writeFileSync(join(OUT_DIR, "editions.json"), JSON.stringify(summary, null, 2) + "\n");
console.log("Done. Summary: public/data/quran/editions.json");
