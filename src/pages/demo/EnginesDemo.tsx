/**
 * Pronunciation + Semantic Visual Matching engines — local demo.
 *
 * Route: /demo/daily-content/engines (linked from the visuals page).
 *
 * This page is the ADMIN / QA view of the two engines. It shows, for each
 * of the eight real records:
 *  - the pronunciation engine: the field-availability audit, the
 *    documented transliteration convention, the word-by-word verification
 *    (stored value vs the convention candidate, with flags), and a
 *    separate approve/reject for pronunciation;
 *  - the semantic engine: the structured profile, every catalog scene
 *    ranked with its explainable score, a deliberate mismatch vs the
 *    improved match, and a separate approve/reject for the visual.
 *
 * RULE (Part D): pronunciation approval and visual approval are separate.
 * An approved image never approves its pronunciation, and vice versa.
 * Final approval needs both. All approvals here are demo-only local
 * state — nothing is published, nothing is written to any database.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadDemoDatasets, type DemoDatasets } from "./demoData";
import { buildEngineExamples, type VisualExample } from "./visualExamples";
import { PRONUNCIATION_MISSING_TEXT } from "@/lib/dailyContent/transliteration";
import { SEMANTIC_THRESHOLD } from "@/lib/dailyContent/semantic";
import { PRONUNCIATION_AUDIT, type AuditClass } from "@/lib/dailyContent/pronunciationAudit";

const FLAG_LABELS: Record<string, string> = {
  "collapsing-hah": "ح/ه — বাংলায় দুটোই হ (পার্থক্য লেখায় ধরা যায় না)",
  "collapsing-ain": "ع — ' চিহ্ন দিয়ে লেখা (আ থেকে আলাদা)",
  "assimilation-al": "ال + সূর্য অক্ষর — ল বাদ, অক্ষর দ্বিগুণ",
  "assimilation-nun": "নْ + ল/র — ন বাদ, পরের অক্ষর দ্বিগুণ",
  "ghunnah-review": "নْ + য়/ও/ম/ন — ইদগামে গুন্নাহ; পর্যালোচনা প্রয়োজন",
  waqf: "ওয়াকফ — শেষ শব্দে ة → হ, তানউইন বাদ",
  "wasla-elided": "হামযাতুল ওয়াসল বাদ (সংযুক্ত পাঠে)",
  "annotation-stripped": "মুসহাফের চিহ্ন (ۖ ইত্যাদি) সরানো হয়েছে",
  "no-diacritic": "হরকত নেই — ফাতহা ধরে নেওয়া হয়েছে",
  "unhandled-char": "এই অক্ষরের ম্যাপিং নেই — পর্যালোচনা প্রয়োজন",
  "long-word": "লম্বা শব্দ — পোস্টারে জায়গা যাচাই করুন",
};

export default function EnginesDemoPage() {
  const [datasets, setDatasets] = useState<DemoDatasets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const [auditFilter, setAuditFilter] = useState<AuditClass | "All">("All");
  const [auditSelected, setAuditSelected] = useState<string | null>(null);
  const [pronReview, setPronReview] = useState<Record<string, "pending" | "approved" | "rejected">>({});
  const [visualReview, setVisualReview] = useState<Record<string, "pending" | "approved" | "rejected">>({});

  useEffect(() => {
    let cancelled = false;
    loadDemoDatasets()
      .then((d) => { if (!cancelled) setDatasets(d); })
      .catch((e: unknown) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "ডেটাসেট লোড হয়নি"); });
    return () => { cancelled = true; };
  }, []);

  const examples = useMemo(() => (datasets ? buildEngineExamples(datasets) : []), [datasets]);
  const example: VisualExample | null = examples[exampleIdx] ?? null;
  const pronStatus = example ? pronReview[example.ref] ?? "pending" : "pending";
  const visStatus = example ? visualReview[example.ref] ?? "pending" : "pending";
  const finalApproved = pronStatus === "approved" && visStatus === "approved";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
      {/* ---------- Banner ---------- */}
      <Card className="border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span>দুটি ইঞ্জিন — উচ্চারণ + সেমান্টিক ছবি</span>
            <Badge className="bg-emerald-700">LOCAL DEMO</Badge>
            <Badge variant="outline">অ্যাডমিন / QA ভিউ</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            বাংলা উচ্চারণ ইঞ্জিন ও সেমান্টিক ভিজ্যুয়াল ম্যাচিং ইঞ্জিনের পর্যালোচনা প্যানেল।
            উচ্চারণের অনুমোদন ও ছবির অনুমোদন আলাদা — একটি অন্যটিকে অনুমোদন করে না।
            চূড়ান্ত অনুমোদনে দুটোই লাগে। এখানকার সব অনুমোদন ডেমো-মাত্র (এই পেজের state);
            কিছু প্রকাশিত হয়নি, ডাটাবেসে কিছু লেখা হয়নি।
          </p>
          <p className="text-xs">
            <Link to="/demo/daily-content/visuals" className="underline">← ভিজ্যুয়াল ইঞ্জিনে ফিরুন</Link>
            {" · "}
            <Link to="/demo/daily-content" className="underline">Daily Content ডেমো</Link>
            {" · "}
            <Link to="/demo/daily-content/review" className="underline">মানব পর্যালোচনা — সিদ্ধান্ত প্যাকেট →</Link>
          </p>
        </CardContent>
      </Card>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {!datasets && !loadError && <p className="text-sm text-muted-foreground">ডেটাসেট লোড হচ্ছে…</p>}

      {example && (
        <>
          {/* ---------- Record selector ---------- */}
          <Card>
            <CardHeader><CardTitle>রেকর্ড বাছুন (৮টি আসল রেকর্ড)</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {examples.map((ex, i) => (
                <Button key={ex.ref} size="sm" variant={i === exampleIdx ? "default" : "outline"} onClick={() => setExampleIdx(i)}>
                  {ex.card.title}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* ---------- A. Pronunciation engine ---------- */}
          <Card>
            <CardHeader><CardTitle>ক · বাংলা উচ্চারণ ইঞ্জিন — {example.card.title}</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-xl border p-3 space-y-1">
                <p className="font-semibold">ফিল্ড-উপলব্ধতা (অডিট, ২০২৬-১১-০৮ — ২১৮টি রেকর্ড)</p>
                <p>• duas.json (২১৮টি রেকর্ড): <code>pronunciation.bn</code> আছে ১৬০টিতে, <b>খালি ৫৮টিতে (২৭%)</b> — পিতা-মাতার দোয়া (১৭:২৪) সহ। শ্রেণিবিন্যাস: <b>যাচাইকৃত ০ · প্রার্থী — অযাচাইকৃত ১৫৭ · অসম্পূর্ণ ০ · অনুপস্থিত ৫৮ · সন্দেহজনক ভুল ৩</b> (নিচে অডিট টেবিল দেখুন)।</p>
                <p>• সংরক্ষিত মানগুলো অযাচাইকৃত: অনথিভুক্ত, অসামঞ্জস্যপূর্ণ কনভেনশন (ذ → ধ, ط → ত, ق → ক, সংযুক্ত পাঠের ইদগাম নেই), উৎস অজানা (সম্ভবত AI-তৈরি, ungated fix-dua-content এজ দিয়ে)। <b>শব্দ-স্তরের সন্দেহ — ২টি:</b> ৩:১৪৭-এ "আনা" (أَن-এর জায়গায়, أَنَا "আমি"-র বানান) ও ৩:৪৩-এ "মিনা" (مَعَ "সাথে"-র জায়গায়, مِنَ "থেকে"-র বানান) — দুটোই পরিবর্তন করা হয়নি, পর্যালোচনার অপেক্ষায়।</p>
                <p>• <b>সারিবদ্ধকরণ সংশোধন (২০২৬-১১-০৮):</b> সংরক্ষিত মান ও প্রার্থী শব্দ ভাগ করে আলাদাভাবে লেখে (যেমন "ওয়া মা" বনাম "ওয়ামা") — আগের অবস্থান-ভিত্তিক তুলনা প্রথম ভাগের পর প্রতিটি শব্দকে ভুল সঙ্গীর সাথে মেলাত। এখন সিকোয়েন্স সারিবদ্ধকরণে মেলানো হয়: ৭:২৩ "আংশিক ২/১২" ছিল বিভ্রান্তি — সারিবদ্ধভাবে ৩/১২, সংরক্ষিত মানটি মূলত বিশ্বস্ত; ৩:১৪৭ "মেলেনি ০/১৯" ছিল বিভ্রান্তি — সারিবদ্ধভাবে আংশিক ৫/১৯।</p>
                <p>• প্রকাশিত বাংলা উচ্চারণের উৎস (২০২৬-১১-০৮): একাধিক স্বাধীন বাংলা সাইট একমত — সংযুক্ত পাঠের ইদগাম (মিল্লাদুনকা, ইল্লাম) ও সরল অক্ষর (স, গ, ক, য) ব্যবহার করে; তারা পরস্পরের সাথেও দ্বিমত করে (জালামনা বনাম যালামনা, সাগিরা বনাম সগিরা)। কোনো একক কর্তৃত্বপূর্ণ মান নেই — তাই এই পেজের কিছুই "যাচাইকৃত" নয়।</p>
                <p>• হাদিস (৭,২২০টি): <b>কোনো উচ্চারণ ফিল্ড নেই, বাংলা অনুবাদও নেই</b> — শুধু আরবি + ইংরেজি। স্কিমা ও ওয়ার্কফ্লো তৈরি আছে; প্রার্থী আরবি থেকে নিয়মে তৈরি হয়।</p>
                <p>• প্রোডাকশন DB: <code>content_pronunciation</code> (+ _en/_hi/_ur) — DuaDetailPage-এ দেখানো হয়; fix-dua-content এজ AI দিয়ে তৈরি করে (অযাচাইকৃত)।</p>
              </div>

              <div className="rounded-xl border p-3 space-y-1">
                <p className="font-semibold">কনভেনশন (NoorApp — সংক্ষেপ; পূর্ণ বিবরণ transliteration.ts-এ)</p>
                <p>• ত্ব/দ্ব/স্ব/য্ব/ক্ব/গ্ব — জোরালো অক্ষর আলাদা থাকে (ط → ত্ব, ذ → য, ث → ছ)।</p>
                <p>• ح/ه দুটোই হ, ع → ' — বাংলায় পার্থক্য লেখা যায় না; এমন শব্দে ফ্ল্যাগ ওঠে, শিক্ষকের কাছ থেকে শিখতে হয়।</p>
                <p>• শাদ্দাহ = অক্ষর দ্বিগুণ (ব্ব), তানউইন = ান/িন/ুন, ال + সূর্য অক্ষর = ইদগাম, নْ + ল/র = ইদগাম (মিল্লাদুনকা), শেষ শব্দে ওয়াকফ (ة → হ)।</p>
                <p>• এটি উচ্চারণের সহায়ক, তাজউইদের বিকল্প নয়। আরবি লেখা উচ্চারণ সহজ করতে বদলানো হয় না।</p>
              </div>

              <div className="rounded-xl border p-3 space-y-2">
                <p className="font-semibold">শব্দ-ধরে-শব্দ যাচাই — সংরক্ষিত মান বনাম কনভেনশন প্রার্থী</p>
                <p className="text-xs text-muted-foreground">
                  মোট: {example.pronunciation.matched}/{example.pronunciation.total} মিলেছে · সামগ্রিক:{" "}
                  {example.pronunciation.overall === "match" ? "✓ সব মিলেছে" : example.pronunciation.overall === "stored-missing" ? "রেকর্ডে সংরক্ষিত উচ্চারণ নেই — প্রার্থী দেখানো হচ্ছে" : example.pronunciation.overall === "partial" ? "আংশিক মিলেছে — পার্থক্যগুলো নিচে" : "মেলেনি — পার্থক্যগুলো নিচে"}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead><tr className="border-b"><th className="py-1 pr-2">আরবি</th><th className="py-1 pr-2">প্রার্থী</th><th className="py-1 pr-2">সংরক্ষিত</th><th className="py-1 pr-2">অবস্থা</th><th className="py-1">ফ্ল্যাগ</th></tr></thead>
                    <tbody>
                      {example.pronunciation.candidate.words.map((w) => (
                        <tr key={w.index} className="border-b align-top">
                          <td dir="rtl" lang="ar" className="py-1 pr-2 text-base">{w.arabic}</td>
                          <td className="py-1 pr-2">{w.candidate || "—"}</td>
                          <td className="py-1 pr-2">{w.stored ?? "—"}</td>
                          <td className="py-1 pr-2">{w.status === "match" ? "✓" : w.status === "differs" ? "≠" : w.status === "uncertain" ? "~" : "—"}</td>
                          <td className="py-1">{w.flags.map((f) => FLAG_LABELS[f] ?? f).join("; ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {example.pronunciation.extraStoredWords.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    অতিরিক্ত সংরক্ষিত শব্দ (ভাগ করে লেখা — কোনো আরবি শব্দের সাথে এককভাবে জোড়া হয়নি): {example.pronunciation.extraStoredWords.join(" · ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  পোস্টারে দেখানো উচ্চারণ ({example.card.pronunciationStatus === "stored-unverified" ? "সংরক্ষিত, অযাচাইকৃত" : example.card.pronunciationStatus === "candidate" ? "প্রার্থী, যাচাই হয়নি" : example.card.pronunciationStatus}): {example.card.pronunciation ?? "—"}
                  {example.card.pronunciationScope === "matn-only" ? " (শুধু মূল বক্তব্য — পুরো সনদসহ প্রার্থী পর্যালোচনা প্যানেলে আছে)" : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowFallback((v) => !v)}>
                    {showFallback ? "প্রার্থী দেখান" : "ফলব্যাক দেখান (উচ্চারণ লুকান)"}
                  </Button>
                  {showFallback && (
                    <span className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">{PRONUNCIATION_MISSING_TEXT}</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border p-3 space-y-2" data-testid="pronunciation-review">
                <p className="font-semibold">উচ্চারণ পর্যালোচনা (অ্যাডমিন — ডেমো)</p>
                <p>অবস্থা: {pronStatus === "approved" ? "✓ অনুমোদিত (ডেমো)" : pronStatus === "rejected" ? "✗ বাতিল (ডেমো)" : "মুলতুবি"}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setPronReview((r) => ({ ...r, [example.ref]: "approved" }))}>উচ্চারণ অনুমোদন করুন</Button>
                  <Button size="sm" variant="outline" onClick={() => setPronReview((r) => ({ ...r, [example.ref]: "rejected" }))}>বাতিল করুন</Button>
                </div>
                <p className="text-xs text-muted-foreground">প্রার্থী কখনো নিজে থেকে যাচাইকৃত হয় না — অনুমোদন শুধু অ্যাডমিনের সিদ্ধান্তে।</p>
              </div>
            </CardContent>
          </Card>

          {/* ---------- B. Semantic engine ---------- */}
          <Card>
            <CardHeader><CardTitle>খ · সেমান্টিক ভিজ্যুয়াল ম্যাচিং — {example.card.title}</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {example.profile && (
                <div className="rounded-xl border p-3 space-y-1">
                  <p className="font-semibold">সেমান্টিক প্রোফাইল (রেকর্ডের নিজের অর্থ থেকে)</p>
                  <p>বিষয়: {example.profile.subject} · প্রসঙ্গ: {example.profile.topic}</p>
                  <p>অর্থ: {example.profile.meaning}</p>
                  <p>মানুষ: {example.profile.people.join(", ") || "—"} · বস্তু: {example.profile.objects.join(", ") || "—"} · কাজ: {example.profile.actions.join(", ") || "—"}</p>
                  <p>ভাব: {example.profile.tone.join(", ")} · পরিবেশ: {example.profile.environment}</p>
                  <p>রূপক: {example.profile.metaphor}</p>
                  <p>অনুপযুক্ত: {example.profile.unsuitable.join("; ")}</p>
                  <p>জোর দিতে হবে: {example.profile.emphasis}</p>
                </div>
              )}

              <div className="rounded-xl border p-3 space-y-2">
                <p className="font-semibold">সব ছবির র‌্যাঙ্কিং (সেমান্টিক স্কোর, সর্বোচ্চ প্রথমে)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead><tr className="border-b"><th className="py-1 pr-2">ছবি</th><th className="py-1 pr-2">মোট</th><th className="py-1 pr-2">বিষয় /৩০</th><th className="py-1 pr-2">অর্থ /২৫</th><th className="py-1 pr-2">কাজ /২০</th><th className="py-1 pr-2">ভাব /১৫</th><th className="py-1">কম্পোজিশন /১০</th></tr></thead>
                    <tbody>
                      {example.rankedScenes.slice(0, 5).map((s) => (
                        <tr key={s.sceneId} className="border-b">
                          <td className="py-1 pr-2 font-medium">{s.sceneId}{s.sceneId === example.scene?.id ? " ← বর্তমান" : ""}</td>
                          <td className="py-1 pr-2 font-bold">{s.total}{s.passed ? " ✓" : " ✗"}</td>
                          {s.components.map((c) => (<td key={c.key} className="py-1 pr-2">{c.points}</td>))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {example.sceneScore && (
                  <div className="space-y-1" data-testid="semantic-breakdown">
                    <p className="font-semibold">বর্তমান ছবির স্কোরের কারণ ({example.scene?.id} — {example.sceneScore.total}/100):</p>
                    {example.sceneScore.components.map((c) => (
                      <p key={c.key}>{c.label}: {c.points}/{c.max} — {c.reason}</p>
                    ))}
                    <p>{example.sceneScore.verdict}</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-3 space-y-2" data-testid="mismatch-demo">
                <p className="font-semibold">ইচ্ছাকৃত ভুল মিল বনাম উন্নত মিল</p>
                {(() => {
                  const worst = example.rankedScenes[example.rankedScenes.length - 1];
                  const best = example.rankedScenes[0];
                  return (
                    <>
                      <p>✗ ভুল: <b>{worst.sceneId}</b> — {worst.total}/100 — {worst.verdict} (কারণ: {worst.components.filter((c) => c.points === 0).map((c) => c.label).join(", ") || "বিষয় মেলেনি"})</p>
                      <p>✓ উন্নত: <b>{best.sceneId}</b> — {best.total}/100 — {best.verdict}</p>
                    </>
                  );
                })()}
                {!example.sceneScore?.passed && (
                  <p className="text-amber-700 dark:text-amber-300">
                    ⚠ এই রেকর্ডের বর্তমান ছবি {SEMANTIC_THRESHOLD}-এর নিচে — স্বয়ংক্রিয় গ্রহণযোগ্য নয়।
                    আদর্শ ছবি এখনো তৈরি হয়নি; তৈরি হলে স্কোর আবার মাপা হবে।
                  </p>
                )}
              </div>

              <div className="rounded-xl border p-3 space-y-2" data-testid="visual-review">
                <p className="font-semibold">ছবির পর্যালোচনা (অ্যাডমিন — ডেমো)</p>
                <p>অবস্থা: {visStatus === "approved" ? "✓ অনুমোদিত (ডেমো)" : visStatus === "rejected" ? "✗ বাতিল (ডেমো)" : "মুলতুবি"}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setVisualReview((r) => ({ ...r, [example.ref]: "approved" }))}>ছবি অনুমোদন করুন</Button>
                  <Button size="sm" variant="outline" onClick={() => setVisualReview((r) => ({ ...r, [example.ref]: "rejected" }))}>বাতিল করুন</Button>
                </div>
                <p className="text-xs text-muted-foreground">সুন্দর কিন্তু অপ্রাসঙ্গিক ছবি বাতিল করা যায় — স্কোর একা কখনো অনুমোদন দেয় না।</p>
              </div>
            </CardContent>
          </Card>

          {/* ---------- Final approval ---------- */}
          <Card className={finalApproved ? "border-2 border-emerald-600" : ""}>
            <CardHeader><CardTitle>চূড়ান্ত অনুমোদন — {example.card.title}</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>উচ্চারণ: {pronStatus === "approved" ? "✓ অনুমোদিত" : pronStatus === "rejected" ? "✗ বাতিল" : "মুলতুবি"}</p>
              <p>ছবি: {visStatus === "approved" ? "✓ অনুমোদিত" : visStatus === "rejected" ? "✗ বাতিল" : "মুলতুবি"}</p>
              <p className="font-semibold">
                {finalApproved ? "✓ চূড়ান্ত অনুমোদন সম্পূর্ণ (ডেমো) — দুটোই অনুমোদিত।" : "চূড়ান্ত অনুমোদন হয়নি — দুটো আলাদা অনুমোদনই লাগে।"}
              </p>
              <p className="text-xs text-muted-foreground">এই অনুমোদন শুধু এই পেজের state; কিছু প্রকাশিত হয়নি, ডাটাবেসে কিছু লেখা হয়নি।</p>
            </CardContent>
          </Card>

          {/* ---------- C. 218-record audit view ---------- */}
          <Card data-testid="audit-view">
            <CardHeader><CardTitle>গ · ২১৮টি দোয়ার উচ্চারণ অডিট (২০২৬-১১-০৮)</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                শ্রেণিগুলো পর্যালোচনার অবস্থা, রায় নয়। "যাচাইকৃত" মানে সংরক্ষিত মানটি নথিভুক্ত
                কনভেনশনের সাথে হুবহু মিলেছে ও কোনো ফ্ল্যাগ নেই — স্বাধীন উৎসের যাচাই নয়।
                "সন্দেহজনক ভুল" মানে শিথিল তুলনায় সবচেয়ে ভিন্ন তিনটি রেকর্ড — মানুষের
                পর্যালোচনায় নিশ্চিত বা খারিজ করতে হবে। সারি ক্লিক করলে সংরক্ষিত মান ও প্রার্থী দেখা যায়।
              </p>
              <div className="flex flex-wrap gap-2">
                {(["All", "Verified", "Candidate — unverified", "Incomplete", "Missing", "Suspected error"] as const).map((c) => {
                  const count = c === "All" ? PRONUNCIATION_AUDIT.length : PRONUNCIATION_AUDIT.filter((r) => r.class === c).length;
                  return (
                    <Button key={c} size="sm" variant={auditFilter === c ? "default" : "outline"} onClick={() => { setAuditFilter(c); setAuditSelected(null); }}>
                      {c === "All" ? "সব" : c} ({count})
                    </Button>
                  );
                })}
              </div>
              <div className="max-h-96 overflow-y-auto rounded-xl border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-background"><tr className="border-b"><th className="py-1 pr-2">দোয়া</th><th className="py-1 pr-2">সূত্র</th><th className="py-1 pr-2">শ্রেণি</th><th className="py-1 pr-2">মিল</th><th className="py-1">শিথিল মিল</th></tr></thead>
                  <tbody>
                    {PRONUNCIATION_AUDIT.filter((r) => auditFilter === "All" || r.class === auditFilter).map((r) => (
                      <tr key={r.slug} className="border-b align-top cursor-pointer hover:bg-muted/50" onClick={() => setAuditSelected(auditSelected === r.slug ? null : r.slug)}>
                        <td className="py-1 pr-2 font-medium">{r.titleBn || r.slug}</td>
                        <td className="py-1 pr-2">{r.reference || "—"}</td>
                        <td className="py-1 pr-2">{r.class}</td>
                        <td className="py-1 pr-2">{r.storedBn ? `${r.matched}/${r.total}` : "—"}</td>
                        <td className="py-1">{r.looseSim !== null ? r.looseSim.toFixed(2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {auditSelected && (() => {
                const r = PRONUNCIATION_AUDIT.find((x) => x.slug === auditSelected);
                if (!r) return null;
                return (
                  <div className="rounded-xl border p-3 space-y-1" data-testid="audit-detail">
                    <p className="font-semibold">{r.titleBn || r.slug} — {r.reference}</p>
                    <p dir="rtl" lang="ar" className="text-base">{r.arabic}</p>
                    <p>সংরক্ষিত: {r.storedBn ?? "— (নেই)"}</p>
                    <p>প্রার্থী: {r.candidate}</p>
                    <p className="text-xs text-muted-foreground">শ্রেণি: {r.class} · মিল: {r.storedBn ? `${r.matched}/${r.total}` : "—"} · শিথিল মিল: {r.looseSim !== null ? r.looseSim.toFixed(3) : "—"} · ফ্ল্যাগযুক্ত শব্দ: {r.flagCount}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
