/**
 * Local demo preview for the Noor App AI Daily Content automation.
 *
 * LOCAL ONLY — this page never contacts Supabase or any production service:
 * it loads the bundled datasets (duas.json + sahih_bukhari_en.json) from
 * this server, runs the real calendar engine + chapter mapping + eligibility
 * + seeded selection in the browser, and ranks with a deterministic MOCK
 * (see mockRecommend.ts) instead of the Lovable AI gateway. Runs live only
 * in React state; nothing is published, sent, scheduled, or written.
 *
 * The preview build is also sandboxed at the app level: it is built with a
 * dummy Supabase URL (http://127.0.0.1:1), so even the app shell's own
 * Supabase calls cannot reach production. The page shows that URL live.
 *
 * What the owner can inspect here:
 * 1. The real Islamic context for 10 scenarios (real calendar engine).
 * 2. How the recommendation changes with the context (MOCK ranking).
 * 3. The real DailyHadith card in loading / published / contextual /
 *    rotation states, with verbatim Arabic + Bengali (duas) text.
 * 4. The admin approve/reject workflow (demo-mode mirror of
 *    RecommendationReview — same labels, same rules, local state only).
 * 5. The planner output (real approvedRunToPlan + seeded fill) and a
 *    publication + push preview (simulated — nothing is published).
 * 6. Loading / empty / invalid / AI-failure states.
 *
 * Known honest gap: local hadiths have Arabic + English but NO Bengali
 * translation (Bengali lives only in the production database). The card
 * shows a Bengali-gap notice instead of invented text.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import DailyHadith, { type PublishedDailyHadith } from "@/components/DailyHadith";
import {
  getIslamicContextForKey,
  activeEventSlugs,
  HIJRI_MONTHS_BN,
  getBengaliNumber,
} from "@/lib/islamicCalendar";
import { CHAPTER_EVENT_MAP } from "@/lib/dailyContent/chapterEvents";
import { buildRecommendRequest } from "@/lib/dailyContent/recommendations";
import { resolvePublishedRecord } from "@/lib/dailyContent/containerState";
import type {
  RecommendationRun,
  RecommendResponse,
} from "@/lib/dailyContent/recommendations";
import { loadDemoDatasets, type DemoDatasets } from "./demoData";
import {
  DEMO_SCENARIOS,
  eventNameBn,
  chapterTitleEn,
  mockRecommend,
  buildDemoPlan,
  demoHadithCardRecord,
  type DemoPlan,
} from "./mockRecommend";

type StateMode = "normal" | "loading" | "empty" | "invalid" | "ai-failure";

const STATE_MODES: { id: StateMode; labelBn: string; labelEn: string }[] = [
  { id: "normal", labelBn: "সাধারণ", labelEn: "Normal" },
  { id: "loading", labelBn: "লোডিং", labelEn: "Loading" },
  { id: "empty", labelBn: "খালি পুল", labelEn: "Empty" },
  { id: "invalid", labelBn: "ত্রুটিপূর্ণ রেফ", labelEn: "Invalid" },
  { id: "ai-failure", labelBn: "AI ব্যর্থতা", labelEn: "AI failure" },
];

const SUPABASE_URL_IN_BUILD =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "(not set)";

function hijriBn(year: number, month: number, day: number): string {
  return `${getBengaliNumber(day)} ${HIJRI_MONTHS_BN[month - 1] ?? ""} ${getBengaliNumber(year)}`;
}

export default function DemoDailyContentPage() {
  const [datasets, setDatasets] = useState<DemoDatasets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState("ramadan");
  const [customDate, setCustomDate] = useState("");
  const [stateMode, setStateMode] = useState<StateMode>("normal");
  const [runs, setRuns] = useState<RecommendationRun[]>([]);
  const [lastResponse, setLastResponse] = useState<RecommendResponse | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [prevTopRef, setPrevTopRef] = useState<string | null>(null);

  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId) ?? DEMO_SCENARIOS[0];
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(customDate) ? customDate : scenario.gregorianKey;

  const context = useMemo(() => {
    try {
      return getIslamicContextForKey(effectiveDate);
    } catch {
      return null;
    }
  }, [effectiveDate]);
  const slugs = useMemo(() => (context ? activeEventSlugs(context) : []), [context]);
  const chapterIds = useMemo(
    () => (context ? buildRecommendRequest(effectiveDate, context).chapterIds : []),
    [context, effectiveDate],
  );

  const latestRun = runs[0] ?? null;
  const plan: DemoPlan | null = useMemo(
    () => (datasets && latestRun ? buildDemoPlan(latestRun, datasets, effectiveDate) : null),
    [datasets, latestRun, effectiveDate],
  );

  useEffect(() => {
    let cancelled = false;
    loadDemoDatasets()
      .then((d) => { if (!cancelled) setDatasets(d); })
      .catch((e: unknown) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "ডেটাসেট লোড হয়নি"); });
    return () => { cancelled = true; };
  }, []);

  const generate = useCallback(() => {
    if (!datasets) return;
    if (stateMode === "loading") return; // loading state is held for inspection
    setGenerating(true);
    setGenError(null);
    try {
      const { response, run } = mockRecommend(datasets, effectiveDate, {
        forceEmpty: stateMode === "empty",
        forceAiFailure: stateMode === "ai-failure",
      });
      // The mock is deterministic per date, so the run id must be unique
      // per generation — otherwise two runs for one date share an id and
      // an approve/reject decision would update both.
      run.id = `${run.id}-${Date.now().toString(36)}`;
      const prevTop = runs[0]?.recommendations[0]?.ref ?? null;
      const newTop = run.recommendations[0]?.ref ?? null;
      setPrevTopRef(prevTop && prevTop !== newTop ? prevTop : null);
      setLastResponse(response);
      setRuns((cur) => [run, ...cur].slice(0, 5));
      setExpandedId(run.id);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "পরামর্শ তৈরি হয়নি");
      setLastResponse(null);
    } finally {
      setGenerating(false);
    }
  }, [datasets, effectiveDate, stateMode, runs]);

  // Auto-generate when the scenario/date changes (normal mode only).
  useEffect(() => {
    if (!datasets || stateMode === "loading") return;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, effectiveDate, stateMode]);

  const decide = useCallback((run: RecommendationRun, action: "approve" | "reject") => {
    const now = new Date().toISOString();
    setRuns((cur) =>
      cur.map((r) =>
        r.id === run.id
          ? {
              ...r,
              status: action === "approve" ? "approved" : "rejected",
              reviewed_at: now,
              reviewed_by: "demo-admin",
              review_note: action === "reject" ? rejectReason.trim() || null : null,
            }
          : r,
      ),
    );
    setReviewMsg(
      action === "approve"
        ? "অনুমোদিত হয়েছে (ডেমো) — পরিকল্পনা প্রস্তুত হয়েছে; প্রকাশনা হয়নি, কিছু পাঠানো হয়নি।"
        : "বাতিল হয়েছে (ডেমো) — এই পরামর্শ-সেটটি আর পরিকল্পনায় যাবে না।",
    );
    setRejectReason("");
    setExpandedId(null);
  }, [rejectReason]);

  const recordText = useCallback((ref: string): { arabic: string; bengali: string; note?: string } | null => {
    if (!datasets) return null;
    if (ref.startsWith("hadith:")) {
      const h = datasets.allHadiths.find((x) => x.id === ref.slice("hadith:".length));
      if (!h) return null;
      return {
        arabic: h.arabic,
        bengali: h.english ?? "",
        note: "English (স্থানীয় ডেটাসেট থেকে, হুবহু) · বাংলা অনুবাদ ডেমোতে নেই — উপরে সীমাবদ্ধতার নোট দেখুন।",
      };
    }
    if (ref.startsWith("content:")) {
      const d = datasets.duas.find((x) => x.slug === ref.slice("content:".length));
      if (!d) return null;
      return { arabic: d.arabic, bengali: d.translation_bn ?? "" };
    }
    return null;
  }, [datasets]);

  // --- Publication preview state (the real container's precedence) ---
  const approvedRun = runs.find((r) => r.status === "approved") ?? null;
  const cardState: "loading" | "published" | "rotation" = stateMode === "loading"
    ? "loading"
    : approvedRun && plan?.hadithPick
      ? "published"
      : "rotation";
  const rotationReason = stateMode === "invalid" ? "invalid-content" as const : "no-publication" as const;
  const publishedRecord: PublishedDailyHadith | null =
    cardState === "published" && plan?.hadithPick ? demoHadithCardRecord(plan.hadithPick) : null;
  const invalidCheck = useMemo(() => {
    // The invalid state, resolved by the real function: a malformed ref yields null.
    if (stateMode !== "invalid") return null;
    return resolvePublishedRecord({ hadith_ref: "hadith:" }, {
      arabic: "x", bengali: "y", book_key: "bukhari", chapter_id: 30, hadith_number: 1,
    });
  }, [stateMode]);
  const contextLabel = context
    ? `${hijriBn(context.hijri.year, context.hijri.month, context.hijri.day)} · ${slugs.map(eventNameBn).join(", ") || "সাধারণ দিন"}`
    : "";

  const pendingRuns = runs.filter((r) => r.status === "pending_review");
  const decidedRuns = runs.filter((r) => r.status !== "pending_review");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
      {/* ---------- Demo banner ---------- */}
      <Card className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span>Daily Content — Local Demo</span>
            <Badge className="bg-amber-600">LOCAL DEMO</Badge>
            <Badge variant="outline">MOCK AI</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            এই প্রিভিউ শুধু এই ডিভাইসে চলে — প্রোডাকশন ডাটাবেস, Supabase বা Lovable-এর
            সাথে কোনো সংযোগ নেই। AI গেটওয়েকে কল করা হয় না; র‍্যাঙ্কিং একটি নির্ধারিত
            নিয়মে হয় (MOCK)। কিছু প্রকাশিত হয় না, কিছু পাঠানো হয় না, কোনো Cron নেই।
          </p>
          <p className="text-xs text-muted-foreground">
            এই বিল্ডের Supabase URL: <code className="break-all">{SUPABASE_URL_IN_BUILD}</code> (অপ্রাপ্য ঠিকানা —
            এই বিল্ড থেকে প্রোডাকশনে কোনো অনুরোধ যেতে পারে না) · সব তারিখ “গণনাকৃত”
            (calculated) — চাঁদ দেখে নিশ্চিত নয়, ডেমোর জন্য সিমুলেটেড।
          </p>
          <p className="text-xs">
            <Link to="/" className="underline">← Noor App হোমপেজে ফিরুন</Link>
          </p>
        </CardContent>
      </Card>

      {/* ---------- Visual engine link ---------- */}
      <Card className="border-2 border-emerald-600">
        <CardContent className="pt-5 text-sm">
          <p className="font-semibold">🎨 প্রিমিয়াম ভিজ্যুয়াল ইঞ্জিন — নতুন</p>
          <p className="text-muted-foreground">
            একই রেকর্ডের OG পোস্টার (১২০০×৬৩০), সোশ্যাল (৪:৫), স্টোরি (৯:১৬), স্কয়ার —
            আসল Dua OG ডিজাইন, ৬টি সৃজনশীল দিকনির্দেশনা, শেয়ার ও ছবিসহ পুশ প্রিভিউ।
          </p>
          <p className="mt-1">
            <Link to="/demo/daily-content/visuals" className="underline font-medium">ভিজ্যুয়াল ইঞ্জিন ডেমো খুলুন →</Link>
          </p>
        </CardContent>
      </Card>

      {/* ---------- Scenario selector ---------- */}
      <Card>
        <CardHeader><CardTitle>১ · প্রসঙ্গ বাছুন (ইসলামিক ক্যালেন্ডার)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {DEMO_SCENARIOS.map((s) => (
              <Button
                key={s.id}
                variant={s.id === scenarioId && !customDate ? "default" : "outline"}
                className="h-auto flex-col items-start gap-0.5 py-2"
                onClick={() => { setCustomDate(""); setScenarioId(s.id); }}
              >
                <span className="text-sm font-semibold">{s.labelBn}</span>
                <span className="text-xs opacity-80">{s.labelEn} · {s.gregorianKey}</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{scenario.noteBn}</p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="demo-date" className="text-sm">নিজের তারিখ (YYYY-MM-DD):</label>
            <Input
              id="demo-date" type="date" value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-44"
            />
            {customDate && <Button variant="outline" size="sm" onClick={() => setCustomDate("")}>সিনারিওতে ফিরুন</Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm self-center">অবস্থা:</span>
            {STATE_MODES.map((m) => (
              <Button
                key={m.id} size="sm"
                variant={stateMode === m.id ? "default" : "outline"}
                onClick={() => setStateMode(m.id)}
              >
                {m.labelBn}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            অবস্থা বদলালে পরামর্শ আবার তৈরি হয়। “লোডিং” অবস্থা ধরে রাখা হয় যাতে
            স্কেলেটন দেখা যায়; অন্য অবস্থায় গেলে তা মিলিয়ে যায়।
          </p>
        </CardContent>
      </Card>

      {/* ---------- Context panel ---------- */}
      <Card>
        <CardHeader><CardTitle>২ · ইসলামিক প্রসঙ্গ (আসল ক্যালেন্ডার ইঞ্জিন)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm" data-testid="context-panel">
          {!datasets && !loadError && <p className="text-muted-foreground">ডেটাসেট লোড হচ্ছে…</p>}
          {loadError && <p className="text-destructive">{loadError}</p>}
          {context ? (
            <>
              <p><span className="font-medium">গ্রেগরিয়ান:</span> {effectiveDate} · <span className="font-medium">হিজরি:</span> {hijriBn(context.hijri.year, context.hijri.month, context.hijri.day)} ({context.hijri.year}-{String(context.hijri.month).padStart(2, "0")}-{String(context.hijri.day).padStart(2, "0")})</p>
              <p><span className="font-medium">সক্রিয় প্রসঙ্গ:</span> {slugs.length > 0 ? slugs.map((s) => `${eventNameBn(s)} (${s})`).join(" · ") : "সাধারণ দিন (কোনো প্রসঙ্গ নেই)"}</p>
              <p><span className="font-medium">রমজানের পর্যায়:</span> {context.ramadanStage ?? "—"} · <span className="font-medium">নিশ্চয়তা:</span> {context.confirmation === "calculated" ? "গণনাকৃত — সিমুলেটেড তারিখ, চাঁদ দেখে নিশ্চিত নয়" : "নিশ্চিত"}</p>
              {slugs.includes("laylatul-qadr") && (
                <p className="rounded-lg bg-muted p-2 text-xs">শবে কদর — রমজানের ২১–৩০ তারিখের মধ্যে একটি রাত; নির্দিষ্ট রাত নির্ধারণ করা হয় না (D-10)।</p>
              )}
              <div className="rounded-lg border p-2 text-xs">
                <p className="font-semibold mb-1">অধ্যায়-ম্যাপিং (Phase 6 — এই প্রসঙ্গের জন্য):</p>
                {CHAPTER_EVENT_MAP.filter((m) => m.events.some((e) => slugs.includes(e))).length > 0 ? (
                  <ul className="list-disc pl-4 space-y-1">
                    {CHAPTER_EVENT_MAP.filter((m) => m.events.some((e) => slugs.includes(e))).map((m) => (
                      <li key={m.chapterId}>অধ্যায় {m.chapterId} — {m.chapterTitleEn} → {m.events.filter((e) => slugs.includes(e)).map(eventNameBn).join(", ")} · <span className="text-muted-foreground">{m.evidence}</span></li>
                    ))}
                  </ul>
                ) : (
                  <p>কোনো অধ্যায় এই প্রসঙ্গের সাথে ম্যাপ করা নেই — সুপারিশে হাদিস থাকবে না।</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Recommend request: chapterIds [{chapterIds.join(", ") || "—"}] · প্রসঙ্গ হিজরি কী: {context.hijri.year}-{String(context.hijri.month).padStart(2, "0")}-{String(context.hijri.day).padStart(2, "0")}
              </p>
            </>
          ) : (
            <p className="text-destructive">তারিখটি বৈধ নয় — YYYY-MM-DD আকারে দিন (যেমন 2026-03-04)।</p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Recommendation panel ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span>৩ · AI পরামর্শ (MOCK)</span>
            <Badge variant="secondary">MOCK — AI কল করা হয়নি</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} disabled={!datasets || generating || stateMode === "loading"}>
              {generating ? "তৈরি হচ্ছে…" : "এই তারিখের পরামর্শ তৈরি করুন"}
            </Button>
            <span className="text-xs text-muted-foreground self-center">একই তারিখে সবসময় একই ফল — নির্ধারিত (seeded) ক্রম।</span>
          </div>
          {genError && <p className="text-sm text-destructive">{genError}</p>}
          {stateMode === "loading" && (
            <div className="space-y-2" aria-busy="true">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <p className="text-xs text-muted-foreground">লোডিং অবস্থা — স্কেলেটন দেখানো হচ্ছে। অন্য অবস্থায় গেলে পরামর্শ ফিরে আসবে।</p>
            </div>
          )}
          {lastResponse && stateMode !== "loading" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                প্রার্থী: হাদিস {lastResponse.candidates.hadith} (prefilter-এর পর {lastResponse.candidates.chapterPrefiltered}) · দোয়া {lastResponse.candidates.dua} · সংরক্ষিত: না (ডেমো — শুধু এই পেজের state)
              </p>
              {prevTopRef && latestRun?.recommendations[0] && prevTopRef !== latestRun.recommendations[0].ref && (
                <p className="text-xs rounded-lg bg-muted p-2">
                  প্রসঙ্গ বদলেছে: আগের শীর্ষ পিক <code>{prevTopRef}</code> → এখন <code>{latestRun.recommendations[0].ref}</code>
                </p>
              )}
              {lastResponse.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো ব্যবহারযোগ্য সুপারিশ পাওয়া যায়নি — বাতিলের তালিকা / সতর্কতা দেখুন।</p>
              ) : (
                lastResponse.recommendations.map((r) => (
                  <div key={r.ref} data-testid="rec-item" className="rounded-xl border p-3 space-y-1 text-sm">
                    <p><span className="font-medium">{r.sourceLine}</span> · {Math.round(r.relevance * 100)}% · <code className="text-xs">{r.ref}</code></p>
                    <p className="text-muted-foreground">পরামর্শের কারণ: {r.reasonBn}</p>
                    {(() => { const t = recordText(r.ref); return t ? (
                      <div className="rounded-lg bg-muted p-2 space-y-1">
                        <p lang="ar" dir="rtl" className="font-arabic text-base">{t.arabic}</p>
                        <p>{t.bengali}</p>
                        {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
                      </div>
                    ) : null; })()}
                  </div>
                ))
              )}
              {lastResponse.dropped.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  বাতিল: {lastResponse.dropped.map((d) => `${d.ref} (${d.reason})`).join("; ")}
                </p>
              )}
              {lastResponse.warnings.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                  {lastResponse.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Homepage card preview ---------- */}
      <Card>
        <CardHeader><CardTitle>৪ · হোমপেজ কার্ড — দর্শক যা দেখবে (আসল DailyHadith কম্পোনেন্ট)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            অবস্থা: <Badge variant="outline">{cardState}</Badge>
            {cardState === "published" && " — অনুমোদিত পরামর্শ থেকে (সিমুলেটেড প্রকাশনা; আসলে কিছু প্রকাশিত হয়নি)"}
            {cardState === "rotation" && (stateMode === "invalid"
              ? " — ত্রুটিপূর্ণ রেফ: আসল যাচাই ফাংশন null দিয়েছে, তাই rotation দেখানো হচ্ছে"
              : " — আজকের প্রকাশনা নেই, তাই দৈনিক rotation দেখানো হচ্ছে")}
            {cardState === "loading" && " — স্কেলেটন"}
          </p>
          {stateMode === "invalid" && (
            <p className="text-xs text-muted-foreground">যাচাই: resolvePublishedRecord({"hadith:"}) → {invalidCheck === null ? "null (সঠিক — ত্রুটিপূর্ণ রেফ বাতিল)" : "অপ্রত্যাশিত মান"}</p>
          )}
          {cardState === "loading" ? (
            <DailyHadith status="loading" />
          ) : publishedRecord ? (
            <>
              <DailyHadith published={publishedRecord} status="published" contextLabel={contextLabel} />
              <p className="text-xs text-muted-foreground">
                উপরে: “Today” ব্যাজ — সিমুলেটেড প্রকাশনা। নিচে: একই রেকর্ডের আসল contextual
                অবস্থা — অনুমোদিত পরামর্শ আছে কিন্তু প্রকাশনা হয়নি (Phase 8)।
              </p>
              <DailyHadith published={publishedRecord} status="contextual" contextLabel={contextLabel} />
            </>
          ) : (
            <DailyHadith status="rotation" rotationReason={rotationReason} />
          )}
          {publishedRecord && plan?.hadithPick?.record.english && (
            <p className="text-sm rounded-lg bg-muted p-2">
              <span className="font-medium">English (স্থানীয় ডেটাসেট, হুবহু):</span> {plan.hadithPick.record.english}
            </p>
          )}
          {plan?.hadithFrom && (
            <p className="text-xs text-muted-foreground">হাদিসের উৎস: {plan.hadithFrom === "run" ? "অনুমোদিত পরামর্শ-সেট" : "প্ল্যানার fill (seeded selection — AI পিক নয়)"}</p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Admin review panel ---------- */}
      <Card>
        <CardHeader><CardTitle>৫ · অ্যাডমিন পর্যালোচনা ও অনুমোদন (ডেমো মোড)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            আসল RecommendationReview-এর মতোই — AI শুধু বিদ্যমান রেকর্ড র‍্যাঙ্ক করে; রেকর্ডের
            লেখা ডেটাসেট থেকে হুবহু দেখানো হয়; অনুমোদন শুধু পরিকল্পনা প্রস্তুত করে, প্রকাশনা নয়।
            এখানে সবকিছু এই পেজের state-এ হয় — কোনো ডাটাবেস নেই।
          </p>
          {reviewMsg && <p className="text-sm rounded-lg bg-muted p-2">{reviewMsg}</p>}
          <p className="text-sm font-semibold">পর্যালোচনার অপেক্ষায় ({pendingRuns.length})</p>
          {pendingRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">পর্যালোচনার অপেক্ষায় কোনো পরামর্শ নেই। উপরে “পরামর্শ তৈরি করুন” চাপুন।</p>
          ) : (
            <ul className="space-y-3">
              {pendingRuns.map((run) => (
                <li key={run.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setExpandedId((cur) => (cur === run.id ? null : run.id))} className="text-sm font-medium underline-offset-2 hover:underline">
                      {run.kolkata_date} · হিজরি {run.hijri_key}
                    </button>
                    <Badge variant="secondary">{run.recommendations.length} সুপারিশ</Badge>
                    <Badge variant="outline">{run.status}</Badge>
                    <Badge variant="outline">MOCK</Badge>
                  </div>
                  {expandedId === run.id && (
                    <div className="space-y-3">
                      {run.recommendations.map((r) => (
                        <div key={r.ref} className="text-sm space-y-1 rounded-lg bg-muted p-2">
                          <p><span className="font-medium">{r.sourceLine}</span> · {Math.round(r.relevance * 100)}%</p>
                          <p className="text-muted-foreground">পরামর্শের কারণ: {r.reasonBn}</p>
                          {(() => { const t = recordText(r.ref); return t ? (
                            <>
                              <p lang="ar" dir="rtl" className="font-arabic">{t.arabic}</p>
                              <p>{t.bengali}</p>
                              {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
                            </>
                          ) : null; })()}
                        </div>
                      ))}
                      {run.dropped.length > 0 && (
                        <p className="text-xs text-muted-foreground">বাতিল: {run.dropped.map((d) => `${d.ref} (${d.reason})`).join("; ")}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => decide(run, "approve")}>অনুমোদন করুন</Button>
                        <Input
                          className="w-56" placeholder="বাতিলের কারণ (ঐচ্ছিক)"
                          value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <Button size="sm" variant="outline" onClick={() => decide(run, "reject")}>বাতিল করুন</Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {decidedRuns.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">সিদ্ধান্ত হয়েছে ({decidedRuns.length})</p>
              <ul className="space-y-1 text-sm">
                {decidedRuns.map((r) => (
                  <li key={r.id} className="rounded-lg border p-2">
                    {r.kolkata_date} · {r.status === "approved" ? "অনুমোদিত" : "বাতিল"}
                    {r.review_note ? ` — কারণ: ${r.review_note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Planner output + publication preview ---------- */}
      <Card>
        <CardHeader><CardTitle>৬ · প্ল্যানার আউটপুট ও প্রকাশনা প্রিভিউ (সিমুলেটেড)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {plan ? (
            <>
              <p>
                পরিকল্পনা: {plan.plan.complete ? "সম্পূর্ণ" : "অসম্পূর্ণ"}
                {plan.plan.missing.length > 0 ? ` — অভাব: ${plan.plan.missing.join("; ")}` : ""}
              </p>
              <p>হাদিস: <code>{plan.plan.hadithRef ?? "—"}</code> {plan.hadithFrom ? `(${plan.hadithFrom})` : ""}</p>
              <p>কার্ড: {plan.cards.length > 0 ? plan.cards.map((c) => c.slug).join(", ") : "—"} ({plan.cardsFrom})</p>
              <div className="space-y-2">
                {plan.cards.map((c) => (
                  <div key={c.slug} className="rounded-xl border p-3 space-y-1">
                    <p className="font-medium">{c.title_bn ?? c.title_en ?? c.slug} · {c.reference ?? ""}</p>
                    <p lang="ar" dir="rtl" className="font-arabic">{c.arabic}</p>
                    <p>{c.translation_bn}</p>
                    <p className="text-xs text-muted-foreground">উৎস: {c.source_type ?? "Dua"} · /dua/{c.slug}</p>
                  </div>
                ))}
              </div>
              {plan.push ? (
                <div className="rounded-xl border p-3 space-y-1">
                  <p className="font-semibold">Push প্রিভিউ (পাঠানো হয়নি)</p>
                  <p><span className="font-medium">Title:</span> {plan.push.title}</p>
                  <p><span className="font-medium">Body:</span> {plan.push.body}</p>
                  <p className="text-xs text-muted-foreground">deepLink: {plan.push.deepLink} · cap: {plan.push.capKeyPrefix}:&lt;device&gt;</p>
                  {plan.pushNote && <p className="text-xs text-muted-foreground">{plan.pushNote}</p>}
                </div>
              ) : (
                <p className="text-muted-foreground">{plan.pushNote ?? "কোনো push নেই।"}</p>
              )}
              <details className="rounded-lg border p-2">
                <summary className="cursor-pointer text-xs font-medium">পরিকল্পনা JSON (আসল approvedRunToPlan আউটপুট)</summary>
                <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(plan.plan, null, 2)}</pre>
              </details>
            </>
          ) : (
            <p className="text-muted-foreground">এখনও কোনো পরিকল্পনা নেই — উপরে একটি পরামর্শ তৈরি করে অনুমোদন করুন।</p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Instructions + limits ---------- */}
      <Card>
        <CardHeader><CardTitle>ডেমো নির্দেশনা ও সীমাবদ্ধতা</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal pl-5 space-y-1">
            <li>উপরে ১০টি প্রসঙ্গের যেকোনোটি চাপুন — প্রসঙ্গ, অধ্যায়-ম্যাপিং, সুপারিশ ও কার্ড একসাথে বদলাবে।</li>
            <li>“শবে বরাত” ও “সাধারণ দিন”-এ হাদিসের সুপারিশ থাকে না — এটা আসল ডিজাইন (অধ্যায়-ম্যাপিং নেই)।</li>
            <li>যেকোনো পরামর্শ খুলে হুবহু আরবি + বাংলা দেখুন, তারপর অনুমোদন/বাতিল করুন — ৬ নম্বর সেকশনে পরিকল্পনা বদলাবে।</li>
            <li>“খালি পুল”, “ত্রুটিপূর্ণ রেফ”, “AI ব্যর্থতা” অবস্থাগুলো চাপলে ব্যর্থতার UI দেখা যাবে।</li>
            <li>নিজের তারিখ বসিয়ে যেকোনো দিনের প্রসঙ্গ দেখা যায় — ডেটা বদলায় না, শুধু তারিখ বদলায়।</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            সীমাবদ্ধতা: (১) হাদিসের বাংলা অনুবাদ ডেমোতে নেই — প্রোডাকশন DB থেকে আসে;
            (২) AI আসল নয় — MOCK র‍্যাঙ্কিং; (৩) প্রকাশনা/push শুধু প্রিভিউ;
            (৪) সব হিজরি তারিখ গণনাকৃত — চাঁদ দেখার ঘোষণা অনুযায়ী ±১ দিন বদলাতে পারে;
            (৫) শবে কদরের নির্দিষ্ট রাত নির্ধারণ করা হয় না।
          </p>
          <p className="text-xs">
            প্রোডাকশন অপরিবর্তিত: এই পেজ কোনো DB লেখে না, কোনো migration চালায় না, কিছু deploy/publish করে না,
            কোনো Cron নিবন্ধন করে না, কোনো নোটিফিকেশন পাঠায় না, daily_content_settings স্পর্শ করে না।
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
