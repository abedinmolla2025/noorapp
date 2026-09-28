/**
 * hadithChapterTitle.ts — THE single deterministic Sahih al-Bukhari book/chapter
 * title-selection contract.
 *
 * Display contract (fixed 2026-09-28, language-consistency remediation):
 *  - bangla : verified `title_bn` when present, otherwise the verified English
 *             `title` (canonical fallback). NEVER Arabic, NEVER invented.
 *  - english: verified English `title`, always.
 *  - urdu   : verified `title_ar` when present, otherwise the verified English
 *             `title`. (Existing Urdu behavior — Arabic script is readable by
 *             Urdu readers; unchanged by the remediation.)
 *
 * Source of truth for the underlying values is the `hadith_chapters` table
 * (canonical English/Arabic titles from the completed Hadith reconstruction).
 * This module performs SELECTION ONLY — it never invents, rewrites, or
 * translates titles. Chapters whose `title_bn` is NULL are reported via the
 * missing-translation report; they are NOT backfilled here.
 *
 * The server/prerender implementation in `api/prerender.js`
 * (`getHadithChapterName`) MUST remain behaviorally identical to
 * `selectHadithChapterTitle`. The parity test
 * `scripts/verify-hadith-title-consistency.mjs` asserts this over all 97
 * chapters × all 3 language modes on every run.
 */

export type HadithLang = "bangla" | "english" | "urdu";

export interface HadithChapterTitles {
  chapter_number: number;
  /** Verified canonical English title (reconstruction source of truth). */
  title: string;
  /** Verified Bengali title, or NULL when no verified source exists. */
  title_bn: string | null;
  /** Verified Arabic title. */
  title_ar: string | null;
}

/**
 * Verified per-chapter overrides. These predate the reconstruction and are
 * kept ONLY because both values were explicitly verified; they are applied
 * identically in SPA and prerender. No other chapter may gain an override
 * without a verified source.
 */
export const HADITH_CHAPTER_OVERRIDES: Record<
  number,
  Record<HadithLang, string>
> = {
  38: {
    bangla: "হাওয়ালা (ঋণ হস্তান্তর)",
    english: "Transfer of a Debt (Al-Hawaala)",
    urdu: "حوالہ (قرض کی منتقلی)",
  },
  82: {
    bangla: "তাকদির (আল-কদর)",
    english: "Divine Will (Al-Qadar)",
    urdu: "تقدیر (القدر)",
  },
};

const GENERIC_BOOK_LABEL: Record<HadithLang, string> = {
  bangla: "কিতাব",
  english: "Book",
  urdu: "کتاب",
};

/**
 * Deterministic title selection. Pure function: same inputs → same output,
 * on every surface (SPA, prerender, mobile, desktop).
 */
export function selectHadithChapterTitle(
  chapter: HadithChapterTitles | null | undefined,
  lang: HadithLang,
): string {
  if (!chapter) return GENERIC_BOOK_LABEL[lang] ?? GENERIC_BOOK_LABEL.english;
  const override = HADITH_CHAPTER_OVERRIDES[Number(chapter.chapter_number)];
  if (override?.[lang]) return override[lang];
  const title = (chapter.title || "").trim();
  if (lang === "bangla") {
    const bn = (chapter.title_bn || "").trim();
    return bn || title;
  }
  if (lang === "urdu") {
    const ar = (chapter.title_ar || "").trim();
    return ar || title;
  }
  return title;
}
