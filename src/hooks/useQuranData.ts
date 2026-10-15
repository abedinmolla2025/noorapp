import { useState, useEffect, useCallback } from "react";
import fallbackSurahs from "@/data/quran_surahs.json";

export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
  audio?: string;
}

export interface SurahData {
  number: number;
  name: string;
  englishName: string;
  ayahs: Ayah[];
}

const EDITIONS = {
  arabic: "quran-uthmani", // single Arabic edition for SPA + prerender (Uthmani text, never normalized)
  bengali: "bn.bengali",
  english: "en.sahih",
  urdu: "ur.ahmedali",
  hindi: "hi.hindi",
  indonesian: "id.indonesian",
};

// Recitation audio URLs live in a separate static file (ar.alafasy edition —
// URLs only, audio files are streamed from the CDN, not vendored).
let audioMapPromise: Promise<Record<string, string>> | null = null;
const loadAudioMap = (): Promise<Record<string, string>> => {
  if (!audioMapPromise) {
    audioMapPromise = fetch("/data/quran/audio.json")
      .then((r) => (r.ok ? r.json() : { audio: {} }))
      .then((j) => j.audio ?? {})
      .catch(() => ({}));
  }
  return audioMapPromise;
};

export type Language = keyof typeof EDITIONS;

export const LANGUAGE_LABELS: Record<Language, string> = {
  arabic: "العربية",
  bengali: "বাংলা",
  english: "English",
  urdu: "اردو",
  hindi: "हिंदी",
  indonesian: "Bahasa",
};

// Translator attribution, verified 2026-09-27 against the AlQuran Cloud
// edition metadata (https://api.alquran.cloud/v1/edition/language/<lang>).
// The app reads these exact editions from its vendored static dataset
// (public/data/quran/<edition>/surah-<n>.json, see ATTRIBUTION.md there),
// so the attribution is evidence-based, not guessed. The Indonesian
// edition's own metadata names no translator, so none is claimed for it.
export const TRANSLATION_ATTRIBUTION: Record<Language, { translator: string; note: string }> = {
  arabic: { translator: "Mishary Rashid Alafasy", note: "Arabic text with Alafasy recitation audio" },
  bengali: { translator: "Muhiuddin Khan", note: "Bengali translation" },
  english: { translator: "Saheeh International", note: "English translation" },
  urdu: { translator: "Ahmed Ali", note: "Urdu translation" },
  hindi: { translator: "Suhel Farooq Khan and Saifur Rahman Nadwi", note: "Hindi translation" },
  indonesian: { translator: "Translator not named by the source API", note: "Indonesian translation" },
};

export const QURAN_SOURCE_NOTE =
  "Quran text and translations are served from Noor App's static dataset (public/data/quran, sourced from the AlQuran Cloud API — see ATTRIBUTION.md).";

// Defense-in-depth: strip invisible Unicode chars (BOM / zero-width) from
// any text that enters the app, even though the vendored dataset is already
// sanitized at download time.
const INVISIBLE_RE = /[\uFEFF\u200B\u200C\u200D\u2060\u180E]/g;
export const sanitizeInvisible = (s: string): string =>
  typeof s === "string" ? s.replace(INVISIBLE_RE, "") : s;

// Timeout helper with AbortController
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs: number = 10000, retries: number = 1) {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);
      lastError = err;
      if (i < retries) {
        console.warn(`Retrying ${url} (${i + 1}/${retries}) due to error:`, err);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw lastError;
}

export const useQuranData = () => {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSurahs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Static dataset: the 114-surah metadata ships with the app bundle.
      // No runtime call to api.alquran.cloud.
      setSurahs(fallbackSurahs as Surah[]);
    } catch (err: any) {
      console.error("Load surahs failed:", err);
      setError("Failed to load surah list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSurahs();
  }, [fetchSurahs]);

  return { surahs, loading, error, retry: fetchSurahs };
};

interface StaticSurahFile {
  edition: string;
  surah: number;
  ayahCount: number;
  ayahs: { number: number; numberInSurah: number; text: string }[];
}

export const useSurahDetail = (surahNumber: number, language: Language = "bengali") => {
  const [arabicData, setArabicData] = useState<SurahData | null>(null);
  const [translationData, setTranslationData] = useState<SurahData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSurahData = useCallback(async () => {
    if (!surahNumber) return;
    setLoading(true);
    setError(null);

    try {
      // Static dataset: per-surah JSON vendored in public/data/quran.
      // No runtime call to api.alquran.cloud.
      const [arabicRes, translationRes, audioMap] = await Promise.all([
        fetchWithTimeout(`/data/quran/${EDITIONS.arabic}/surah-${surahNumber}.json`, {}, 15000, 1),
        fetchWithTimeout(`/data/quran/${EDITIONS[language]}/surah-${surahNumber}.json`, {}, 15000, 1),
        loadAudioMap(),
      ]);

      if (!arabicRes.ok || !translationRes.ok) {
        throw new Error(`Static quran data missing for surah ${surahNumber}`);
      }

      const arabicJson: StaticSurahFile = await arabicRes.json();
      const translationJson: StaticSurahFile = await translationRes.json();

      const meta = (fallbackSurahs as Surah[]).find((s) => s.number === surahNumber);

      const toSurahData = (file: StaticSurahFile, withAudio: boolean): SurahData => ({
        number: file.surah,
        name: meta?.name ?? "",
        englishName: meta?.englishName ?? "",
        ayahs: file.ayahs.map((a) => {
          const audioUrl = withAudio ? audioMap[`${file.surah}:${a.numberInSurah}`] : undefined;
          return {
            number: a.number,
            numberInSurah: a.numberInSurah,
            text: sanitizeInvisible(a.text),
            ...(audioUrl ? { audio: audioUrl } : {}),
          };
        }),
      });

      setArabicData(toSurahData(arabicJson, true));
      setTranslationData(toSurahData(translationJson, false));
    } catch (err: any) {
      setError(`Failed to load surah: ${err.message || "Connection timeout"}`);
      console.error("Load surah detail failed:", err);
    } finally {
      setLoading(false);
    }
  }, [surahNumber, language]);

  useEffect(() => {
    fetchSurahData();
  }, [fetchSurahData]);

  return { arabicData, translationData, loading, error, retry: fetchSurahData };
};
