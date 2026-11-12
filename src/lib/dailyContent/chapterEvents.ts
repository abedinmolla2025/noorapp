/**
 * Sahih al-Bukhari book (chapter) -> Islamic event mapping.
 *
 * Purpose: let the recommendation engine pre-filter hadiths by chapter
 * relevance (Phase 6), instead of ranking only caller-supplied hadith ids.
 * The caller still supplies the chapter ids (computed from the context with
 * chaptersForEvents); the edge function never carries this table, because
 * Deno edge functions cannot import from src/ (see D-18).
 *
 * Evidence (each entry states its own):
 * - Book titles are the CANONICAL English titles from the forensic
 *   reconstruction (research/forensic/NOORAPP-HADITH-CHAPTER-MAPPING-
 *   RECONSTRUCTION.csv, 2026-09-28): 97/97 verified against sunnah.com +
 *   The House of Islam + bundled content. The DB titles are NOT used:
 *   84/97 DB English titles name the wrong book (shift corruption) and
 *   the DB Bengali titles are shifted for 84/97. Bengali titles are
 *   therefore NOT carried here; the corrected Bengali set is the titles
 *   goal's deliverable, not duplicated here.
 * - The Ashura mapping (book 30) is the one content-based entry: the bundled
 *   English data (public/data/sahih_bukhari_en.json) has 17 "Ashura"
 *   mentions in book_30 (Fasting), the most of any book — the Ashura fast
 *   hadiths live there. The Qadr count (14 in book_32, most of any book)
 *   corroborates the title-based mapping for book 32.
 * - Negative results (why the other events have no mapping): a keyword scan
 *   of the same bundled data found no topical home for them — Mi'raj
 *   mentions are diffuse (max 4, in book_63 "Merits of the Helpers",
 *   incidental); Mawlid/birth has 1 mention each in 5 unrelated books;
 *   Shab-e-Barat has ZERO mentions anywhere in Bukhari; Muharram is
 *   diffuse (Tafseer 4, Fasting 3, Helpers 3). Those events are listed in
 *   EVENTS_WITHOUT_CHAPTERS, not silently missing.
 *
 * Rule: a chapter maps to an event only when the book's title names the
 * event's subject (or, for Ashura, when the bundled content proves the
 * event's hadiths live in that book). No guessing, no "probably related".
 * Unmapped chapters are the default, not a gap to fill by inference.
 */

export type ChapterEventMapping = {
  chapterId: number;
  chapterTitleEn: string;
  events: readonly string[];
  evidence: string;
};

export const CHAPTER_EVENT_MAP: readonly ChapterEventMapping[] = [
  {
    chapterId: 13,
    chapterTitleEn: "The Two Festivals (Eids)",
    events: ["eid-fitr", "eid-adha"],
    evidence: "Title names both Eids.",
  },
  {
    chapterId: 25,
    chapterTitleEn: "Hajj (Pilgrimage)",
    events: ["hajj", "arafah", "eid-adha", "first-ten-dhul-hijjah", "dhul-hijjah-month"],
    evidence: "Title: the pilgrimage spans Dhul Hijjah 8-13; Arafah (9th) and Eid al-Adha (10th) are part of it.",
  },
  {
    chapterId: 27,
    chapterTitleEn: "Pilgrims Prevented from Completing the Pilgrimage",
    events: ["hajj"],
    evidence: "Title: pilgrims on Hajj.",
  },
  {
    chapterId: 28,
    chapterTitleEn: "Penalty of Hunting while on Pilgrimage",
    events: ["hajj"],
    evidence: "Title: hunting while on pilgrimage.",
  },
  {
    chapterId: 30,
    chapterTitleEn: "Fasting",
    events: ["ramadan-month", "ramadan-start", "last-ten-nights", "ashura"],
    evidence:
      "Title: fasting — Ramadan is the fasting month. Ashura: bundled English data has 17 'Ashura' mentions in book_30, the most of any book (the Ashura fast hadiths live here).",
  },
  {
    chapterId: 31,
    chapterTitleEn: "Praying at Night in Ramadaan (Taraweeh)",
    events: ["ramadan-month", "last-ten-nights"],
    evidence: "Title names Ramadaan night prayer.",
  },
  {
    chapterId: 32,
    chapterTitleEn: "Virtues of the Night of Qadr",
    events: ["laylatul-qadr", "last-ten-nights"],
    evidence:
      "Title names Qadr; corroborated by 14 'Qadr' mentions in book_32, the most of any book.",
  },
  {
    chapterId: 33,
    chapterTitleEn: "Retiring to a Mosque for Remembrance of Allah (I'tikaf)",
    events: ["ramadan-month", "last-ten-nights"],
    evidence: "Title: i'tikaf — observed in the last ten nights of Ramadan.",
  },
  {
    chapterId: 73,
    chapterTitleEn: "Al-Adha Festival Sacrifice (Adaahi)",
    events: ["eid-adha"],
    evidence: "Title: the Adha sacrifice is the Eid al-Adha rite.",
  },
];

/**
 * Events with no Bukhari book whose title is topically specific to them.
 * Explicit, not silent: the recommendation engine still ranks duas for
 * these events; it just has no chapter prefilter for them.
 */
export const EVENTS_WITHOUT_CHAPTERS: readonly string[] = [
  "islamic-new-year",
  "mawlid",
  "miraj",
  "shabe-barat",
  "rabi-ul-awwal-month",
];

/** Union of chapter ids mapped to any of the given event slugs, sorted. */
export function chaptersForEvents(eventSlugs: readonly string[]): number[] {
  const wanted = new Set(eventSlugs);
  const ids = new Set<number>();
  for (const entry of CHAPTER_EVENT_MAP) {
    if (entry.events.some((e) => wanted.has(e))) ids.add(entry.chapterId);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Event slugs mapped to one chapter (empty when the chapter is unmapped). */
export function eventsForChapter(chapterId: number): string[] {
  const entry = CHAPTER_EVENT_MAP.find((e) => e.chapterId === chapterId);
  return entry ? [...entry.events] : [];
}
