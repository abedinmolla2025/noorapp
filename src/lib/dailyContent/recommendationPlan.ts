/**
 * Approval-to-plan handoff (Phase 7): convert an APPROVED recommendation run
 * into the daily-content planner's input. Pure + deterministic.
 *
 * The planner needs exactly 1 hadith card + 3-5 content cards
 * (CARD_TARGET_COUNT=4, MIN=3, MAX=5). An approved run that is short on
 * either side is NOT complete: the planner (Phase 9) fills the missing slots
 * from its seeded selection. A run that is not approved yields an empty plan
 * — the planner must never consume a pending or rejected run.
 *
 * This file shapes the data only. It does not read the database, does not
 * call the planner, and does not publish anything.
 */

import type { RecommendationRun } from "./recommendations";

export type PlannedRecommendation = {
  hadithRef: string | null;
  contentRefs: string[];
  complete: boolean;
  missing: string[];
};

export function approvedRunToPlan(run: RecommendationRun): PlannedRecommendation {
  if (run.status !== "approved") {
    return { hadithRef: null, contentRefs: [], complete: false, missing: ["run is not approved"] };
  }
  const recs = run.recommendations ?? [];
  const hadith = recs.find((r) => r.kind === "hadith") ?? null;
  const contentRefs = recs
    .filter((r) => r.kind === "content")
    .map((r) => r.ref)
    .slice(0, 5);
  const missing: string[] = [];
  if (!hadith) missing.push("hadith");
  if (contentRefs.length < 3) {
    missing.push(`content cards: need 3, have ${contentRefs.length}`);
  }
  return {
    hadithRef: hadith?.ref ?? null,
    contentRefs,
    complete: missing.length === 0,
    missing,
  };
}
