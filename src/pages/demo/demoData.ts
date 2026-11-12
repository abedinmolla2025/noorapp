/**
 * Demo datasets — LOCAL ONLY.
 *
 * The demo loads the app's own bundled data files at runtime (the same
 * `fetch("/data/...")` pattern DuaPage uses) and never touches Supabase:
 * - duas.json (218 records): Arabic + Bengali + reference, verbatim.
 * - sahih_bukhari_en.json: Arabic + English + chapter/number, verbatim.
 *
 * HONEST GAP (shown in the UI, not hidden): the bundled Bukhari file has
 * NO Bengali translation. Bengali hadith text lives only in the production
 * database, which this demo never contacts. Local hadith records therefore
 * carry `bengali: null`, and the real eligibility check
 * (`hadithIneligibilityReasons`) reports exactly that — "missing bengali
 * translation" — for every local hadith. Nothing is invented to fill it.
 */

import type { ContentRecord, HadithRecord } from "@/lib/dailyContent/types";

export type DemoDatasets = {
  duas: ContentRecord[];
  /** Hadiths grouped by chapter id (book_N in the bundled file). */
  hadithsByChapter: Map<number, HadithRecord[]>;
  /** All local hadiths, flat, in file order. */
  allHadiths: HadithRecord[];
};

type BundledHadith = {
  id: string;
  chapter_id: number;
  hadith_number: number;
  arabic: string;
  english?: string | null;
};

export async function loadDemoDatasets(): Promise<DemoDatasets> {
  const [duaRes, bukhariRes] = await Promise.all([
    fetch("/data/duas.json", { cache: "force-cache" }),
    fetch("/data/sahih_bukhari_en.json", { cache: "force-cache" }),
  ]);
  if (!duaRes.ok) throw new Error(`duas.json লোড হয়নি (HTTP ${duaRes.status})`);
  if (!bukhariRes.ok) throw new Error(`sahih_bukhari_en.json লোড হয়নি (HTTP ${bukhariRes.status})`);

  const duas = (await duaRes.json()) as ContentRecord[];
  const bundled = (await bukhariRes.json()) as Record<string, BundledHadith[]>;

  const hadithsByChapter = new Map<number, HadithRecord[]>();
  const allHadiths: HadithRecord[] = [];
  for (const [key, list] of Object.entries(bundled)) {
    const chapterId = Number(key.replace("book_", ""));
    if (!Number.isInteger(chapterId)) continue;
    const rows: HadithRecord[] = (list ?? [])
      .filter((h) => h && typeof h.id === "string" && Number.isInteger(h.hadith_number))
      .map((h) => ({
        id: h.id,
        book_key: "bukhari",
        chapter_id: chapterId,
        hadith_number: h.hadith_number,
        arabic: h.arabic ?? "",
        // NO Bengali in the bundled file — see the header note. Never invented.
        bengali: null,
        english: h.english ?? null,
      }))
      .sort((a, b) => a.hadith_number - b.hadith_number);
    if (rows.length > 0) {
      hadithsByChapter.set(chapterId, rows);
      allHadiths.push(...rows);
    }
  }
  return { duas, hadithsByChapter, allHadiths };
}

/** The notice shown where a Bengali hadith translation would appear. */
export const BENGALI_GAP_NOTICE =
  "বাংলা অনুবাদ — স্থানীয় ডেমো ডেটাসেটে নেই। প্রোডাকশন ডাটাবেসে অনুবাদ আছে; ডেমোতে তা দেখানো হয়নি, বানানোও হয়নি।";
