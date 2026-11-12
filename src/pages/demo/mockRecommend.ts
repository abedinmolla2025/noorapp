/**
 * Deterministic MOCK recommender for the local demo.
 *
 * This replaces ONLY the Lovable AI gateway call. Everything else is the
 * real implementation:
 * - context: the real Phase 4 calendar engine (`getIslamicContextForKey`)
 * - request: the real `buildRecommendRequest` (chapter ids from the real
 *   Phase 6 chapter→event mapping)
 * - eligibility: the real `isEligibleContent` / `hadithIneligibilityReasons`
 * - ordering: the real `seededShuffle` / `hashString` (same seed ⇒ same
 *   output, every time)
 * - plan: the real `approvedRunToPlan`
 * - source lines / links: the real `hadithSourceLine` / `hadithCanonicalLink`
 * - push: the real `buildDailyPush`
 *
 * The mock ranks by a stated, deterministic rule — never by a simulated
 * "AI opinion", never with invented virtue/reward/grade text:
 * - hadith: chapters mapped to the active events (first 3 per chapter, the
 *   real prefilter cap), seeded order; top 1 is the pick.
 * - duas: all eligible duas, seeded order; top 4 (5 when no hadith).
 * Every recommendation's `reasonBn` states the rule that ranked it.
 * The response is labelled MOCK in the UI and `persisted` is always false:
 * a demo run lives only in React state — nothing is written anywhere.
 *
 * Faithful limits of the real design, shown as-is:
 * - An ordinary day and Shab-e-Barat have NO mapped chapter, so the
 *   recommendation carries NO hadith — duas only. (The planner below still
 *   picks a hadith by seeded selection; that is the real two-layer design:
 *   the AI recommendation and the daily planner are separate.)
 * - Laylatul Qadr is a WINDOW (Ramadan 21–30), never a fixed night.
 * - Local hadiths fail the real Bengali check; that is reported, not hidden.
 */

import { getIslamicContextForKey, ISLAMIC_EVENTS } from "@/lib/islamicCalendar";
import {
  buildRecommendRequest,
  type RecommendationItem,
  type RecommendationRun,
  type RecommendResponse,
} from "@/lib/dailyContent/recommendations";
import { approvedRunToPlan, type PlannedRecommendation } from "@/lib/dailyContent/recommendationPlan";
import {
  CHAPTER_EVENT_MAP,
  EVENTS_WITHOUT_CHAPTERS,
} from "@/lib/dailyContent/chapterEvents";
import {
  isEligibleContent,
  hadithIneligibilityReasons,
} from "@/lib/dailyContent/eligibility";
import { hashString, seededShuffle, pickNext, pickCards } from "@/lib/dailyContent/selection";
import {
  hadithSourceLine,
  hadithCanonicalLink,
  hadithPick,
  contentKind,
} from "@/lib/dailyContent/cards";
import { buildDailyPush } from "@/lib/dailyContent/push";
import type { ContentRecord, HadithRecord, PushPayload } from "@/lib/dailyContent/types";
import { BENGALI_GAP_NOTICE, type DemoDatasets } from "./demoData";

export type DemoScenario = {
  id: string;
  labelBn: string;
  labelEn: string;
  /** Gregorian date key YYYY-MM-DD (verified against the real engine). */
  gregorianKey: string;
  /** Expected active event slugs, verified with the real engine. */
  expectedEvents: string[];
  noteBn: string;
};

/** Dates verified 2026-11-07 with the real calendar engine (tabular). */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "ordinary", labelBn: "সাধারণ দিন", labelEn: "Ordinary day",
    gregorianKey: "2026-11-07", expectedEvents: [],
    noteBn: "কোনো সক্রিয় প্রসঙ্গ নেই — সুপারিশে হাদিস থাকে না, শুধু দোয়া।",
  },
  {
    id: "ramadan", labelBn: "রমজান", labelEn: "Ramadan",
    gregorianKey: "2026-03-04", expectedEvents: ["ramadan-month"],
    noteBn: "১৪৪৭-০৯-১৫ · রমজানের মধ্য দশ দিন। অধ্যায় ৩০, ৩১, ৩৩।",
  },
  {
    id: "shabe-barat", labelBn: "শবে বরাত", labelEn: "Shab-e-Barat",
    gregorianKey: "2026-02-03", expectedEvents: ["shabe-barat"],
    noteBn: "১৪৪৭-০৮-১৫ · এই প্রসঙ্গের কোনো অধ্যায়-ম্যাপিং নেই — শুধু দোয়া।",
  },
  {
    id: "last-ten", labelBn: "রমজানের শেষ দশ রাত", labelEn: "Last ten nights",
    gregorianKey: "2026-03-14", expectedEvents: ["laylatul-qadr", "ramadan-month", "last-ten-nights"],
    noteBn: "১৪৪৭-০৯-২৫ · অধ্যায় ৩০, ৩১, ৩২, ৩৩।",
  },
  {
    id: "qadr", labelBn: "শবে কদর (২১–৩০ রমজান)", labelEn: "Laylatul Qadr period",
    gregorianKey: "2026-03-16", expectedEvents: ["laylatul-qadr", "ramadan-month", "last-ten-nights"],
    noteBn: "১৪৪৭-০৯-২৭ · কদর একটি সময়সীমা — নির্দিষ্ট রাত নির্ধারণ করা হয় না।",
  },
  {
    id: "eid-fitr", labelBn: "ঈদুল ফিতর", labelEn: "Eid-ul-Fitr",
    gregorianKey: "2026-03-20", expectedEvents: ["eid-fitr"],
    noteBn: "১৪৪৭-১০-০১ · অধ্যায় ১৩।",
  },
  {
    id: "dhul-hijjah", labelBn: "জিলহজ মাস", labelEn: "Dhul Hijjah",
    gregorianKey: "2026-05-20", expectedEvents: ["first-ten-dhul-hijjah", "dhul-hijjah-month"],
    noteBn: "১৪৪৭-১২-০৩ · অধ্যায় ২৫।",
  },
  {
    id: "arafah", labelBn: "আরাফাতের দিন", labelEn: "Arafah",
    gregorianKey: "2026-05-26", expectedEvents: ["arafah", "first-ten-dhul-hijjah", "hajj", "dhul-hijjah-month"],
    noteBn: "১৪৪৭-১২-০৯ · অধ্যায় ২৫, ২৭, ২৮।",
  },
  {
    id: "eid-adha", labelBn: "ঈদুল আযহা", labelEn: "Eid-ul-Adha",
    gregorianKey: "2026-05-27", expectedEvents: ["eid-adha", "first-ten-dhul-hijjah", "hajj", "dhul-hijjah-month"],
    noteBn: "১৪৪৭-১২-১০ · অধ্যায় ১৩, ২৫, ৭৩।",
  },
  {
    id: "ashura", labelBn: "আশুরা", labelEn: "Ashura",
    gregorianKey: "2026-06-26", expectedEvents: ["ashura"],
    noteBn: "১৪৪৮-০১-১০ · অধ্যায় ৩০ (আশুরার রোজার হাদিস এখানে)।",
  },
];

export function eventNameBn(slug: string): string {
  return ISLAMIC_EVENTS.find((e) => e.slug === slug)?.nameBn ?? slug;
}

export function chapterTitleEn(chapterId: number): string {
  return CHAPTER_EVENT_MAP.find((e) => e.chapterId === chapterId)?.chapterTitleEn ?? `Chapter ${chapterId}`;
}

export type MockOptions = {
  /** Simulate an empty eligible pool. */
  forceEmpty?: boolean;
  /** Simulate the AI gateway being unavailable (fail-closed). */
  forceAiFailure?: boolean;
};

export type MockResult = {
  response: RecommendResponse;
  run: RecommendationRun;
  /** Real request object (context + chapter ids) for display. */
  request: ReturnType<typeof buildRecommendRequest>;
};

/**
 * Deterministic mock recommendation. Throws only when `forceAiFailure` is
 * set (the simulated gateway outage); otherwise always returns a result.
 */
export function mockRecommend(
  datasets: DemoDatasets,
  kolkataDate: string,
  opts: MockOptions = {},
): MockResult {
  if (opts.forceAiFailure) {
    throw new Error("AI গেটওয়ে উপলভ্য নয় (সিমুলেটেড ব্যর্থতা) — পরামর্শ তৈরি হয়নি।");
  }
  const ctx = getIslamicContextForKey(kolkataDate);
  const request = buildRecommendRequest(kolkataDate, ctx);
  const seed = hashString(`${kolkataDate}|${request.context.activeEventSlugs.join(",")}`);
  const hijriKey = `${ctx.hijri.year}-${String(ctx.hijri.month).padStart(2, "0")}-${String(ctx.hijri.day).padStart(2, "0")}`;

  const warnings: string[] = [
    "MOCK — Lovable AI গেটওয়েকে কল করা হয়নি; র‍্যাঙ্কিং একটি নির্ধারিত নিয়মে হয়েছে।",
    "স্থানীয় হাদিস ডেটাসেটে বাংলা অনুবাদ নেই — কার্ডে অনুবাদের জায়গায় সীমাবদ্ধতার নোট দেখানো হয়।",
  ];
  const unmappedActive = request.context.activeEventSlugs.filter((s) =>
    EVENTS_WITHOUT_CHAPTERS.includes(s),
  );
  if (unmappedActive.length > 0) {
    warnings.push(
      `এই প্রসঙ্গের (${unmappedActive.map(eventNameBn).join(", ")}) কোনো অধ্যায়-ম্যাপিং নেই — সুপারিশে হাদিস থাকে না, শুধু দোয়া।`,
    );
  }

  if (opts.forceEmpty) {
    const run: RecommendationRun = {
      id: `demo-${kolkataDate}-empty`,
      kolkata_date: kolkataDate,
      hijri_key: hijriKey,
      context: request.context,
      recommendations: [],
      dropped: [],
      status: "pending_review",
      created_by: null,
      created_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
    };
    return {
      response: {
        ok: true, kolkataDate, hijriKey, confirmation: ctx.confirmation,
        candidates: { hadith: 0, dua: 0, chapterPrefiltered: 0 },
        recommendations: [], dropped: [],
        warnings: [...warnings, "(সিমুলেটেড) যোগ্য কনটেন্টের পুল খালি — কোনো সুপারিশ তৈরি হয়নি।"],
        persisted: false, recommendationId: run.id,
      },
      run, request,
    };
  }

  // --- Hadith candidates: mapped chapters, first 3 per chapter (real cap).
  const hadithCandidates: HadithRecord[] = [];
  let hadithPoolTotal = 0;
  const dropped: RecommendResponse["dropped"] = [];
  for (const chapterId of request.chapterIds) {
    const rows = datasets.hadithsByChapter.get(chapterId) ?? [];
    hadithPoolTotal += rows.length;
    const kept = rows.slice(0, 3);
    hadithCandidates.push(...kept);
    const capped = rows.slice(3, 6);
    for (const h of capped) {
      dropped.push({ ref: `hadith:${h.id}`, reason: "chapter prefilter cap — first 3 per chapter" });
    }
    if (rows.length > 6) {
      dropped.push({
        ref: `chapter:${chapterId}`,
        reason: `summary entry (not a record ref): +${rows.length - 6} more beyond the first-3 cap`,
      });
    }
  }
  // The real Bengali check, run on the local records — reported, not hidden.
  const bengaliGap = hadithCandidates.length > 0
    ? hadithIneligibilityReasons(hadithCandidates[0])
    : [];
  if (bengaliGap.length > 0) {
    warnings.push(`হাদিস যোগ্যতা যাচাই (আসল নিয়ম): ${bengaliGap.join("; ")} — স্থানীয় ডেটাসেটে।`);
  }

  // --- Dua candidates: the real eligibility rule, seeded order.
  const eligibleDuas = datasets.duas.filter(isEligibleContent);
  const shuffledDuas = seededShuffle(eligibleDuas, seed);
  const shuffledHadiths = seededShuffle(hadithCandidates, seed);

  const recommendations: RecommendationItem[] = [];
  const activeNames = request.context.activeEventSlugs.map(eventNameBn).join(", ");
  const topHadith = shuffledHadiths[0] ?? null;
  if (topHadith) {
    const mappedEvents = CHAPTER_EVENT_MAP.find((e) => e.chapterId === topHadith.chapter_id)?.events ?? [];
    const matched = mappedEvents.filter((e) => request.context.activeEventSlugs.includes(e));
    recommendations.push({
      kind: "hadith",
      ref: `hadith:${topHadith.id}`,
      relevance: 0.97,
      sourceLine: hadithSourceLine(topHadith),
      reasonBn:
        `অধ্যায় ${topHadith.chapter_id} (${chapterTitleEn(topHadith.chapter_id)}) — ` +
        `${matched.map(eventNameBn).join(", ") || activeNames} প্রসঙ্গের সাথে মিলেছে (Phase 6 ম্যাপিং, MOCK ক্রম)`,
    });
  }
  const duaCount = topHadith ? 4 : 5;
  shuffledDuas.slice(0, duaCount).forEach((d, i) => {
    recommendations.push({
      kind: "content",
      ref: `content:${d.slug}`,
      relevance: 0.95 - i * 0.03,
      sourceLine: d.reference ?? d.slug,
      reasonBn: `MOCK ক্রম — বিভাগ: ${d.category ?? "—"}; AI কল করা হয়নি`,
    });
  });

  const run: RecommendationRun = {
    id: `demo-${kolkataDate}-${seed.toString(36)}`,
    kolkata_date: kolkataDate,
    hijri_key: hijriKey,
    context: request.context,
    recommendations,
    dropped,
    status: "pending_review",
    created_by: null,
    created_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  };
  return {
    response: {
      ok: true, kolkataDate, hijriKey, confirmation: ctx.confirmation,
      candidates: { hadith: hadithPoolTotal, dua: eligibleDuas.length, chapterPrefiltered: hadithCandidates.length },
      recommendations, dropped,
      warnings,
      persisted: false, recommendationId: run.id,
    },
    run, request,
  };
}

export type DemoPlan = {
  plan: PlannedRecommendation;
  /** The hadith pick for the publication preview (run ref, or planner fill). */
  hadithPick: ReturnType<typeof hadithPick> | null;
  hadithFrom: "run" | "planner-fill (seeded selection)" | null;
  cards: ContentRecord[];
  cardsFrom: "run" | "run + planner-fill" | "none";
  push: PushPayload | null;
  pushNote: string | null;
};

/**
 * Demo planner output: the real `approvedRunToPlan`, with the real
 * planner's seeded fill (`pickNext` / `pickCards`) for missing slots.
 * A non-approved run yields an empty plan — exactly like the real one.
 */
export function buildDemoPlan(
  run: RecommendationRun | null,
  datasets: DemoDatasets,
  kolkataDate: string,
): DemoPlan {
  const plan = approvedRunToPlan(run ?? ({ status: "pending_review" } as RecommendationRun));
  if (!run || run.status !== "approved") {
    return {
      plan, hadithPick: null, hadithFrom: null, cards: [], cardsFrom: "none",
      push: null,
      pushNote: run ? "পরামর্শ অনুমোদিত হয়নি — পরিকল্পনা খালি (আসল নিয়ম)।" : "কোনো পরামর্শ-সেট নেই — পরিকল্পনা খালি।",
    };
  }
  const findHadith = (ref: string): HadithRecord | null => {
    const id = ref.startsWith("hadith:") ? ref.slice("hadith:".length) : null;
    if (!id) return null;
    return datasets.allHadiths.find((h) => h.id === id) ?? null;
  };
  const findDua = (ref: string): ContentRecord | null => {
    const slug = ref.startsWith("content:") ? ref.slice("content:".length) : null;
    if (!slug) return null;
    return datasets.duas.find((d) => d.slug === slug) ?? null;
  };

  let hadithPickValue: ReturnType<typeof hadithPick> | null = null;
  let hadithFrom: DemoPlan["hadithFrom"] = null;
  if (plan.hadithRef) {
    const h = findHadith(plan.hadithRef);
    if (h) { hadithPickValue = hadithPick(h); hadithFrom = "run"; }
  }
  if (!hadithPickValue) {
    // Planner fill: seeded selection over the full local hadith pool.
    const picked = pickNext(datasets.allHadiths, (h) => `hadith:${h.id}`, new Set());
    if (picked.item) { hadithPickValue = hadithPick(picked.item); hadithFrom = "planner-fill (seeded selection)"; }
  }

  const cards: ContentRecord[] = [];
  for (const ref of plan.contentRefs) {
    const d = findDua(ref);
    if (d) cards.push(d);
  }
  let cardsFrom: DemoPlan["cardsFrom"] = cards.length > 0 ? "run" : "none";
  if (cards.length < 4) {
    const used = new Set(cards.map((d) => `content:${d.slug}`));
    const filled = pickCards(
      datasets.duas.filter(isEligibleContent),
      (d) => `content:${d.slug}`,
      (d) => contentKind(d),
      used,
      4 - cards.length,
    );
    cards.push(...filled);
    if (filled.length > 0) cardsFrom = "run + planner-fill";
  }

  let push: PushPayload | null = null;
  let pushNote: string | null = null;
  if (hadithPickValue) {
    push = buildDailyPush(hadithPickValue, kolkataDate, cards.length);
    pushNote = "push body-তে বাংলা হাদিসের লাইন ডেমোতে খালি — স্থানীয় ডেটাসেটে বাংলা অনুবাদ নেই (প্রোডাকশনে এখানে অনুবাদ থাকবে)।";
  }
  return { plan, hadithPick: hadithPickValue, hadithFrom, cards, cardsFrom, push, pushNote };
}

/** The record the real DailyHadith card shows for a demo hadith pick. */
export function demoHadithCardRecord(pick: ReturnType<typeof hadithPick>): {
  bengali: string; arabic: string; source: string; chapter: string; canonicalLink: string;
} {
  return {
    bengali: BENGALI_GAP_NOTICE,
    arabic: pick.record.arabic,
    source: pick.sourceLine,
    chapter: `Chapter ${pick.record.chapter_id} · ${chapterTitleEn(pick.record.chapter_id)}`,
    canonicalLink: hadithCanonicalLink(pick.record),
  };
}
