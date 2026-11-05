import { applyExclusions, isEligibleContent, isEligibleHadith } from "./eligibility.js";
import { buildCard, buildHadithCard, hadithPick } from "./cards.js";
import { buildDailyPush } from "./push.js";
import { pickCards, pickNext } from "./selection.js";
import type {
  CardPayload,
  ContentRecord,
  DayPlan,
  HadithRecord,
} from "./types.js";
import { contentKind } from "./cards.js";

export const CARD_TARGET_COUNT = 4;
export const CARD_MIN_COUNT = 3;
export const CARD_MAX_COUNT = 5;

export interface PlanHistory {
  /** Refs published in the current hadith cycle (`hadith:<id>`). */
  hadithUsedRefs: string[];
  hadithCycle: number;
  /** Refs published in the current card cycle (`content:<slug>`). */
  cardUsedRefs: string[];
  cardCycle: number;
}

export interface PlanInput {
  kolkataDate: string;
  hadiths: HadithRecord[];
  contents: ContentRecord[];
  history: PlanHistory;
  excludedRefs?: ReadonlySet<string>;
  /** Override for tests / short pools; clamped to 3..5 by the planner. */
  cardCount?: number;
}

export interface PlanResult {
  plan: DayPlan;
  /** Refs to store for the NEXT day's history (cycle-aware). */
  nextHistory: PlanHistory;
  diagnostics: {
    hadithPool: number;
    hadithEligible: number;
    contentPool: number;
    contentEligible: number;
  };
}

/**
 * Plan one day's content. Pure function — no I/O, no sends, no writes.
 * An empty hadith slot is reported via `hadithEmptyReason`, never filled
 * with an ineligible record or generated text.
 */
export function planDay(input: PlanInput): PlanResult {
  const eligibleHadiths = applyExclusions(
    input.hadiths.filter(isEligibleHadith),
    input.excludedRefs ?? new Set(),
  );
  const eligibleContents = applyExclusions(
    input.contents.filter(isEligibleContent),
    input.excludedRefs ?? new Set(),
  );

  const hadithUsed = new Set(input.history.hadithUsedRefs);
  const hadithPickResult = pickNext(
    eligibleHadiths,
    (h) => `hadith:${h.id}`,
    hadithUsed,
  );
  const hadith = hadithPickResult.item ? hadithPick(hadithPickResult.item) : null;
  const hadithCycle = hadithPickResult.wrapped
    ? input.history.hadithCycle + 1
    : input.history.hadithCycle;
  const nextHadithUsed = hadithPickResult.wrapped
    ? (hadith ? [`hadith:${hadith.record.id}`] : [])
    : hadith
      ? [...input.history.hadithUsedRefs, `hadith:${hadith.record.id}`]
      : [...input.history.hadithUsedRefs];

  const cardCount = Math.min(
    CARD_MAX_COUNT,
    Math.max(CARD_MIN_COUNT, input.cardCount ?? CARD_TARGET_COUNT),
  );
  const cardUsed = new Set(input.history.cardUsedRefs);
  // Card cycle: when every eligible record was already used, this day's
  // picks restart the rotation — advance the cycle and reset the used set
  // to just today's picks (same rule as the hadith rotation). The old
  // code picked against the used set first and only advanced when the
  // pick was non-empty — but exhaustion itself makes the pick empty, so
  // the cycle never advanced and the pool stayed empty forever.
  const allCardsUsed =
    eligibleContents.length > 0 &&
    eligibleContents.every((c) => cardUsed.has(`content:${c.slug}`));
  const pickedContents = pickCards(
    eligibleContents,
    (c) => `content:${c.slug}`,
    (c) => contentKind(c),
    allCardsUsed ? new Set<string>() : cardUsed,
    cardCount,
  );
  const cards: CardPayload[] = pickedContents.map(buildCard);
  // The Daily Hadith itself is always offered as a share card too, so the
  // card set always includes the day's hadith when one was picked.
  if (hadith) {
    const hadithCard = buildHadithCard(hadith);
    if (!cards.some((c) => c.recordRef === hadithCard.recordRef)) {
      cards.unshift(hadithCard);
    }
  }
  const trimmedCards = cards.slice(0, CARD_MAX_COUNT);
  const cardCycle = allCardsUsed
    ? input.history.cardCycle + 1
    : input.history.cardCycle;
  const nextCardUsed = allCardsUsed
    ? pickedContents.map((c) => `content:${c.slug}`)
    : [
        ...new Set([
          ...input.history.cardUsedRefs,
          ...pickedContents.map((c) => `content:${c.slug}`),
        ]),
      ];

  const hadithEmptyReason = hadith
    ? null
    : eligibleHadiths.length === 0
      ? "No eligible hadith in the pool (every record is missing Arabic, Bengali translation, hadith number, book key, or is excluded). Nothing was invented to fill the slot."
      : "Hadith selection failed unexpectedly (eligible pool non-empty but no pick).";

  const push = hadith
    ? buildDailyPush(hadith, input.kolkataDate, trimmedCards.length)
    : null;

  return {
    plan: {
      kolkataDate: input.kolkataDate,
      hadith,
      cards: trimmedCards,
      push,
      hadithEmptyReason,
      hadithCycle,
      cardCycle,
    },
    nextHistory: {
      hadithUsedRefs: nextHadithUsed,
      hadithCycle,
      cardUsedRefs: nextCardUsed,
      cardCycle,
    },
    diagnostics: {
      hadithPool: input.hadiths.length,
      hadithEligible: eligibleHadiths.length,
      contentPool: input.contents.length,
      contentEligible: eligibleContents.length,
    },
  };
}
