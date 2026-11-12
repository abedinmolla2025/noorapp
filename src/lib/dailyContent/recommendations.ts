/**
 * Recommendation runs (Phase 7): the client-side shape of a recommendation
 * run — what the admin review UI sends to, and receives from, the
 * `recommend-daily-content` edge function — plus the request builder.
 *
 * The request is built from the Phase 4 calendar engine + the Phase 6
 * chapter mapping, in the browser, so the edge function receives a fully
 * specified, validated context (D-15) and chapter ids (D-18). The edge
 * function re-validates everything server-side; the client shape is a
 * convenience, never a trust boundary.
 */

import { chaptersForEvents } from "./chapterEvents.js";

export type RecommendContext = {
  gregorianKey: string;
  hijri: { year: number; month: number; day: number };
  confirmation: "calculated" | "confirmed";
  activeEventSlugs: string[];
  ramadanStage: "first-ten" | "middle-ten" | "last-ten" | null;
};

export type RecommendationItem = {
  kind: "hadith" | "content";
  ref: string;
  relevance: number;
  reasonBn: string;
  sourceLine: string;
};

export type DroppedItem = {
  ref: string;
  reason: string;
};

export type RecommendationRunStatus = "pending_review" | "approved" | "rejected";

export type RecommendationRun = {
  id: string;
  kolkata_date: string;
  hijri_key: string;
  context: RecommendContext;
  recommendations: RecommendationItem[];
  dropped: DroppedItem[];
  status: RecommendationRunStatus;
  created_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export type RecommendResponse = {
  ok: boolean;
  kolkataDate: string;
  hijriKey: string;
  confirmation: "calculated" | "confirmed";
  candidates: { hadith: number; dua: number; chapterPrefiltered: number };
  recommendations: RecommendationItem[];
  dropped: DroppedItem[];
  warnings: string[];
  persisted: boolean;
  recommendationId: string | null;
};

/**
 * The context shape buildRecommendRequest consumes — a structural subset of
 * the Phase 4 engine's IslamicContext (only the fields this function reads).
 * It is declared here, not imported from the calendar engine, because any
 * import from src/lib/islamicCalendar (even type-only) changes tsc's
 * rootDir inference and breaks the flat scripts/daily-content/.out layout
 * the test harness expects. An IslamicContext is assignable to this type
 * structurally, so the admin UI passes the engine's output directly.
 */
export type RecommendInputContext = {
  gregorianKey: string;
  hijri: { year: number; month: number; day: number };
  confirmation: "calculated" | "confirmed";
  activeEvents: Array<{ event: { slug: string } }>;
  ramadanStage: "first-ten" | "middle-ten" | "last-ten" | null;
};

/**
 * Build the recommend request body for a Kolkata date from an already-
 * computed Islamic context (Phase 4 engine) — the caller (the admin UI)
 * computes the context and passes it in, so this module has no runtime
 * dependency on the calendar engine. The chapter ids come from the Phase 6
 * mapping for the context's active events.
 * Pure + deterministic: the same date + context always yield the same
 * request.
 */
export function buildRecommendRequest(
  kolkataDate: string,
  ctx: RecommendInputContext,
): { kolkataDate: string; context: RecommendContext; chapterIds: number[] } {
  const activeEventSlugs = ctx.activeEvents.map((a) => a.event.slug);
  return {
    kolkataDate,
    context: {
      gregorianKey: ctx.gregorianKey,
      hijri: { year: ctx.hijri.year, month: ctx.hijri.month, day: ctx.hijri.day },
      confirmation: ctx.confirmation,
      activeEventSlugs,
      ramadanStage: ctx.ramadanStage,
    },
    chapterIds: chaptersForEvents(activeEventSlugs),
  };
}
