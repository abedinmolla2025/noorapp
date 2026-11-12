/**
 * Phase 6 — pure state resolution for the Daily Hadith homepage card.
 * Phase 8 adds the contextual state (an approved recommendation run for
 * today, shown when no publication exists yet).
 *
 * The container's job is a small state machine; the decisions are pure so
 * they are unit-testable without a DOM or a Supabase client. Precedence:
 *
 *   loading      — the publication query is still in flight.
 *   published    — today's publication exists AND its hadith row is valid.
 *   contextual   — no publication, but an APPROVED recommendation run for
 *                  the Kolkata date exists AND its hadith row is valid.
 *                  The card shows the approved hadith + the Islamic
 *                  context (Hijri date, active events). The approved run
 *                  is never presented as a publication.
 *   rotation     — anything else, with the reason kept so the card can say
 *                  WHY it is showing the rotation instead of today's
 *                  publication. The rotation is never presented as the
 *                  official publication.
 *
 * Reasons:
 *   no-publication  — no published row and no approved run for the date.
 *   invalid-content — a row/run exists but its ref is malformed, its
 *                     hadith row is missing, or its Arabic/Bengali is
 *                     empty; also an approved run with no hadith.
 *   fetch-error     — a Supabase query itself failed.
 *
 * The rotation pick uses the ASIA/KOLKATA date (not the device's local
 * date), so every visitor sees the same rotation item on the same Kolkata
 * day.
 */

/** Structurally identical to DailyHadith's PublishedDailyHadith. */
export interface PublishedHadithRecord {
  bengali: string;
  arabic: string;
  source: string;
  chapter: string;
  canonicalLink: string;
}

export type RotationReason = "no-publication" | "invalid-content" | "fetch-error";

/** The Islamic context the contextual card shows (built by the container
 *  from the approved run: Hijri label + Bengali event names). */
export interface ContextualInfo {
  hijriLabel: string;
  eventNamesBn: string[];
}

export type DailyHadithViewState =
  | { kind: "loading" }
  | { kind: "published"; record: PublishedHadithRecord }
  | { kind: "contextual"; record: PublishedHadithRecord; context: ContextualInfo }
  | { kind: "rotation"; reason: RotationReason };

export interface PublicationRow {
  hadith_ref?: string | null;
}

/** Minimal shape of a recommendation run row for the contextual resolver. */
export interface RecommendationRunRow {
  status?: string | null;
  recommendations?: Array<{ kind?: string | null; ref?: string | null }> | null;
}

export interface HadithRow {
  arabic?: string | null;
  bengali?: string | null;
  book_key?: string | null;
  chapter_id?: number | null;
  hadith_number?: number | null;
}

/**
 * Validate a publication row + its hadith row and build the record the
 * card shows, or null when the content must not be shown as published.
 * Mirrors the container's previous inline checks exactly (ref must start
 * with "hadith:", Arabic and Bengali must be non-empty) so the only
 * change is where the decision lives, not what it decides.
 */
export function resolvePublishedRecord(
  pub: PublicationRow | null,
  row: HadithRow | null,
): PublishedHadithRecord | null {
  const ref = pub?.hadith_ref;
  if (!ref || !ref.startsWith("hadith:")) return null;
  const id = ref.slice("hadith:".length);
  if (!id) return null;
  if (!row?.arabic || !row?.bengali) return null;
  const book = row.book_key === "bukhari" ? "Sahih al-Bukhari" : (row.book_key ?? "");
  return {
    bengali: row.bengali,
    arabic: row.arabic,
    source: `${book}, Hadith ${row.hadith_number}`,
    chapter: `Chapter ${row.chapter_id}`,
    canonicalLink: row.book_key === "bukhari" ? "/hadith/sahih-bukhari/bangla" : "/hadith",
  };
}

/**
 * The hadith id an approved run recommends (first recommendation with
 * kind "hadith" and a well-formed "hadith:<id>" ref), or null. The
 * container uses this to know WHICH hadith row to fetch; the display
 * decision itself lives in resolveContextualRecord below.
 */
export function hadithRefFromRun(run: RecommendationRunRow | null): string | null {
  if (!run || !Array.isArray(run.recommendations)) return null;
  for (const r of run.recommendations) {
    if (r?.kind === "hadith" && typeof r.ref === "string" && r.ref.startsWith("hadith:")) {
      const id = r.ref.slice("hadith:".length);
      if (id) return id;
    }
  }
  return null;
}

/**
 * Validate an approved recommendation run + its hadith row and build the
 * record + context the contextual card shows, or null when the run must
 * not be shown as the contextual plan. The checks mirror
 * resolvePublishedRecord (approved status + well-formed ref + non-empty
 * Arabic and Bengali); the record is built identically, so a published
 * and a contextual card never disagree about what a record looks like.
 */
export function resolveContextualRecord(
  run: RecommendationRunRow | null,
  row: HadithRow | null,
  context: ContextualInfo,
): { record: PublishedHadithRecord; context: ContextualInfo } | null {
  if (run?.status !== "approved") return null;
  const id = hadithRefFromRun(run);
  if (!id) return null;
  if (!row?.arabic || !row?.bengali) return null;
  const record = resolvePublishedRecord({ hadith_ref: `hadith:${id}` }, row);
  if (!record) return null;
  return { record, context };
}

/** Day-of-year (1-based) for a YYYY-MM-DD date, computed in UTC so the
 *  result never depends on the device's timezone. Returns 0 for an
 *  unparseable date (deterministic fallback: the first rotation item). */
export function dayOfYearForDate(kolkataDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(kolkataDate);
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return 0;
  const start = Date.UTC(y, 0, 1);
  const at = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(at) || at < start) return 0;
  // Reject impossible dates (e.g. 2026-02-30 normalizes to March 2).
  const check = new Date(at);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return 0;
  return Math.floor((at - start) / 86_400_000) + 1;
}

/** Rotation index for a Kolkata date: day-of-year modulo the pool size. */
export function rotationIndexForDate(kolkataDate: string, count: number): number {
  if (count <= 0) return 0;
  return dayOfYearForDate(kolkataDate) % count;
}
