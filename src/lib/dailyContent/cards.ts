import type { CardKind, CardPayload, ContentRecord, DailyHadithPick, HadithRecord } from "./types.js";

/**
 * Book-key display names. Only keys the dataset actually uses are mapped;
 * an unknown key is shown verbatim — never dressed up with a nicer name.
 */
const BOOK_NAMES: Record<string, string> = {
  bukhari: "Sahih al-Bukhari",
  muslim: "Sahih Muslim",
};

export function hadithSourceLine(h: HadithRecord): string {
  const book = BOOK_NAMES[h.book_key] ?? h.book_key;
  return `${book}, Hadith ${h.hadith_number}`;
}

/**
 * Canonical link for a hadith record. The `hadiths` table carries no slug,
 * and the deep chapter route needs a chapter slug mapping the table does
 * not provide — so the honest link is the book's Bengali index page, with
 * chapter + number carried in the source line. Never guess a deep URL.
 */
export function hadithCanonicalLink(h: HadithRecord): string {
  if (h.book_key === "bukhari") return "/hadith/sahih-bukhari/bangla";
  return "/hadith";
}

export function hadithPick(h: HadithRecord): DailyHadithPick {
  return {
    record: h,
    sourceLine: hadithSourceLine(h),
    canonicalLink: hadithCanonicalLink(h),
  };
}

export function contentKind(c: ContentRecord): CardKind {
  const st = (c.source_type ?? "").toLowerCase();
  if (st === "quran" || st === "qur'an") return "quran";
  if (st === "hadith") return "hadith";
  return "dua";
}

const KIND_LABEL_BN: Record<CardKind, string> = {
  quran: "কুরআনের আয়াত",
  hadith: "হাদিস",
  dua: "দোয়া",
};

function excerpt(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return clean.slice(0, maxChars - 1).trimEnd() + "…";
}

/**
 * Build a share-card payload from a record, copying every religious field
 * verbatim. Caption and alt text are composed ONLY from the record's own
 * title, Bengali text and reference plus the NoorApp brand suffix — no
 * virtue, benefit or grade wording is ever added (the source records'
 * virtue/benefit fields are deliberately NOT surfaced on cards).
 */
export function buildCard(c: ContentRecord): CardPayload {
  const kind = contentKind(c);
  const title = (c.title_bn ?? "").trim() || (c.title_en ?? "").trim();
  const bengali = (c.translation_bn ?? "").trim();
  const arabic = (c.arabic ?? "").trim();
  const sourceLine = (c.reference ?? "").trim();
  return {
    kind,
    recordRef: `content:${c.slug}`,
    title,
    arabic,
    bengali,
    sourceLine,
    canonicalLink: `/dua/${c.slug}`,
    altText: `${KIND_LABEL_BN[kind]}: ${excerpt(bengali, 80)} — ${sourceLine}`,
    caption: `🤲 ${title}\n${bengali}\n📖 ${sourceLine}\n🔗 https://noorapp.in/dua/${c.slug}\n— NoorApp`,
  };
}

/** Card payload for the Daily Hadith itself (same shape, hadith source line). */
export function buildHadithCard(pick: DailyHadithPick): CardPayload {
  const h = pick.record;
  const bengali = (h.bengali ?? "").trim();
  return {
    kind: "hadith",
    recordRef: `hadith:${h.id}`,
    title: "আজকের হাদিস",
    arabic: h.arabic.trim(),
    bengali,
    sourceLine: pick.sourceLine,
    canonicalLink: pick.canonicalLink,
    altText: `হাদিস: ${excerpt(bengali, 80)} — ${pick.sourceLine}`,
    caption: `🤲 আজকের হাদিস\n${bengali}\n📖 ${pick.sourceLine}\n🔗 https://noorapp.in${pick.canonicalLink}\n— NoorApp`,
  };
}
