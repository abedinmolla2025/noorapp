/**
 * Daily Islamic Content Automation — shared types.
 *
 * SAFETY RULE (applies to every builder in this folder):
 * Text is copied VERBATIM from source records. Nothing here invents, completes,
 * paraphrases or grades religious text. A record with a missing required field
 * is INELIGIBLE — it is never "fixed up" with generated text.
 * No grade/authenticity verdict is ever produced: the `hadiths` table carries
 * no grade column, so cards and pushes cite collection + number only.
 */

/** One row of the `hadiths` table (Sahih al-Bukhari dataset). */
export interface HadithRecord {
  id: string;
  book_key: string;
  chapter_id: number;
  hadith_number: number;
  arabic: string;
  bengali: string | null;
  english?: string | null;
}

/** A Dua / Quran-sourced record (bundled duas.json shape, or admin_content). */
export interface ContentRecord {
  slug: string;
  /** "Quran" | "Hadith" | anything else (treated as Dua). */
  source_type?: string | null;
  title_bn?: string | null;
  title_en?: string | null;
  arabic: string;
  translation_bn: string | null;
  reference: string | null;
  category?: string | null;
}

export type CardKind = "quran" | "hadith" | "dua";

export interface CardPayload {
  kind: CardKind;
  /** Stable identity for dedupe: `hadith:<id>` or `content:<slug>`. */
  recordRef: string;
  title: string;
  arabic: string;
  bengali: string;
  /** Verbatim source line, e.g. "Sahih al-Bukhari, Hadith 1" or the dua reference. */
  sourceLine: string;
  /** Canonical in-app link (relative path). */
  canonicalLink: string;
  altText: string;
  caption: string;
}

export interface DailyHadithPick {
  record: HadithRecord;
  /** e.g. "Sahih al-Bukhari, Hadith 1" — collection + number only, never a grade. */
  sourceLine: string;
  canonicalLink: string;
}

export interface PushPayload {
  title: string;
  body: string;
  deepLink: string;
  icon: string;
  badge: string;
  imageUrl: string | null;
  /** `daily:<Asia/Kolkata date>:<deviceId>` — the per-device daily-cap key. */
  capKeyPrefix: string;
}

export interface DayPlan {
  /** Asia/Kolkata date, YYYY-MM-DD. */
  kolkataDate: string;
  hadith: DailyHadithPick | null;
  cards: CardPayload[];
  push: PushPayload | null;
  /** Why the hadith slot is empty, when it is (never a silent skip). */
  hadithEmptyReason: string | null;
  /** Cycle number for the no-repeat rotation (1 = first pass through the pool). */
  hadithCycle: number;
  cardCycle: number;
}

export type RunStatus = "planned" | "published" | "failed";

export interface PublicationRecord {
  kolkataDate: string;
  status: RunStatus;
  hadithRef: string | null;
  hadithSourceLine: string | null;
  cards: CardPayload[];
  push: PushPayload | null;
  createdAt: string;
  error: string | null;
}

export type DeliveryStatus = "sent" | "failed" | "retryable" | "disabled";

export interface DeliveryAttempt {
  deviceId: string;
  platform: string;
  status: DeliveryStatus;
  attempts: number;
  error: string | null;
  capKey: string;
}
