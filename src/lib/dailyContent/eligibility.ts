import type { ContentRecord, HadithRecord } from "./types.js";

const hasText = (v: string | null | undefined): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * A hadith is eligible ONLY when the record is complete:
 * Arabic text + Bengali translation + integer hadith number + book key + id.
 * There is no grade column in the `hadiths` table, so no grade is required
 * and none is ever asserted. Missing anything => ineligible, never completed.
 */
export function isEligibleHadith(h: HadithRecord): boolean {
  return (
    hasText(h.id) &&
    hasText(h.book_key) &&
    Number.isInteger(h.hadith_number) &&
    h.hadith_number > 0 &&
    hasText(h.arabic) &&
    hasText(h.bengali)
  );
}

export function hadithIneligibilityReasons(h: HadithRecord): string[] {
  const reasons: string[] = [];
  if (!hasText(h.id)) reasons.push("missing id");
  if (!hasText(h.book_key)) reasons.push("missing book_key");
  if (!Number.isInteger(h.hadith_number) || h.hadith_number <= 0)
    reasons.push("missing/invalid hadith_number");
  if (!hasText(h.arabic)) reasons.push("missing arabic");
  if (!hasText(h.bengali)) reasons.push("missing bengali translation");
  return reasons;
}

/**
 * A content record (Dua / Quran-sourced) is eligible ONLY when it carries
 * Arabic text + a Bengali translation + a source reference + a slug.
 * Title falls back to English when Bengali title is absent (display only;
 * the Bengali translation itself is mandatory and never substituted).
 */
export function isEligibleContent(c: ContentRecord): boolean {
  return (
    hasText(c.slug) &&
    hasText(c.arabic) &&
    hasText(c.translation_bn) &&
    hasText(c.reference)
  );
}

export function contentIneligibilityReasons(c: ContentRecord): string[] {
  const reasons: string[] = [];
  if (!hasText(c.slug)) reasons.push("missing slug");
  if (!hasText(c.arabic)) reasons.push("missing arabic");
  if (!hasText(c.translation_bn)) reasons.push("missing bengali translation");
  if (!hasText(c.reference)) reasons.push("missing reference");
  return reasons;
}

/** Caller-supplied exclusion list (pending / unverified / held records). */
export function applyExclusions<T extends { id?: string; slug?: string }>(
  records: T[],
  excluded: ReadonlySet<string>,
): T[] {
  if (excluded.size === 0) return records;
  return records.filter((r) => !excluded.has(r.id ?? "") && !excluded.has(r.slug ?? ""));
}
