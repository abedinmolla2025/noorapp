/**
 * Local demo preview — Premium Daily Content Visual Engine & Social Distribution.
 *
 * LOCAL ONLY: reuses the existing master design (OgShareCard — the Dua OG
 * poster language), the 7-scene photograph catalog (backgrounds.ts), the
 * real QC gate (ogQc.ts), the real card builders (cards.ts) and the real
 * push builder (push.ts). All religious text comes from the bundled
 * datasets verbatim; backgrounds are text-free photographs; no image model
 * ever writes Arabic or Bengali.
 *
 * MOCK / SIMULATED (labelled): the AI background-generation step (the
 * catalog photos already exist — no generation runs in this preview),
 * admin approve/reject (page state only), share/download actions, push
 * delivery (never sent), and the 7-day visual history (seeded demo data).
 *
 * OWNER DIRECTION (2026-11-03, standing): the master design has NO footer
 * banner — no store badges, no download text, no bottom strip. A later
 * brief asked for a download-promotion footer; that conflicts with the
 * standing direction, so this engine does not add one. Re-adding it is a
 * single owner message away.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { OgShareCard } from "@/components/dailyContent/OgShareCard";
import { useDomToPng } from "@/hooks/useDomToPng";
import {
  OG_STAGE_SIZE,
  ogExportSize,
  checkOgCardBatch,
  type OgFormat,
} from "@/lib/dailyContent/ogQc";
import {
  CARD_BACKGROUNDS,
  backgroundUrl,
  assignBackgrounds,
  badgeLabelForCard,
} from "@/lib/dailyContent/backgrounds";
import {
  CREATIVE_DIRECTIONS,
  directionForId,
  sceneForDirection,
  readyDirections,
  checkVisualSimilarity,
  posterAssetPath,
  demoPosterUrl,
  canonicalContentUrl,
  whatsappShareUrl,
  facebookShareUrl,
  buildImagePush,
  type VisualHistoryEntry,
} from "@/lib/dailyContent/visuals";
import { loadDemoDatasets, type DemoDatasets } from "./demoData";
import { buildVisualExamples, relatedDuas, type VisualExample } from "./visualExamples";

const FORMATS: { id: OgFormat; label: string; px: string }[] = [
  { id: "wide", label: "Website OG", px: "1200×630" },
  { id: "portrait", label: "Social feed", px: "1080×1350 (4:5)" },
  { id: "story", label: "Story / Status", px: "1080×1920 (9:16)" },
  { id: "square", label: "Square", px: "1080×1080" },
];

/** Seeded demo history (labelled as such in the UI — not real usage).
    Six of the seven scenes were used in the last 7 days; guidance-path was
    NOT, so the "children" direction demonstrates the unique (OK) state. */
const SEEDED_HISTORY: VisualHistoryEntry[] = [
  { date: "2026-10-31", contentRef: "content:dua-for-protection-surah-al-falaq-113-4", sceneId: "night-lantern", directionId: "ramadan", format: "portrait" },
  { date: "2026-11-01", contentRef: "content:dua-for-forgiveness-surah-al-araaf-7-23", sceneId: "dawn-forgiveness", directionId: "forgiveness", format: "portrait" },
  { date: "2026-11-02", contentRef: "content:dua-for-patience-surah-aal-i-imraan-3-147", sceneId: "patience-tree", directionId: "patience", format: "square" },
  { date: "2026-11-03", contentRef: "hadith:bukhari-3-75", sceneId: "morning-window", directionId: "knowledge", format: "portrait" },
  { date: "2026-11-04", contentRef: "content:dua-for-parents", sceneId: "parents-hands", directionId: "parents", format: "portrait" },
  { date: "2026-11-05", contentRef: "hadith:bukhari-30-1923", sceneId: "courtyard-prayer", directionId: "ramadan", format: "portrait" },
  { date: "2026-11-06", contentRef: "content:dua-for-parents", sceneId: "parents-hands", directionId: "parents", format: "portrait" },
];

const TODAY = "2026-11-07";

function ScaledPoster({ example, directionId, format, maxWidth = 340 }: {
  example: VisualExample; directionId: string; format: OgFormat; maxWidth?: number;
}) {
  const stage = OG_STAGE_SIZE[format];
  const direction = directionForId(directionId);
  const scene = direction ? sceneForDirection(direction) : null;
  const scale = Math.min(1, maxWidth / stage.width);
  return (
    <div style={{ width: stage.width * scale, height: stage.height * scale, position: "relative", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <OgShareCard
          card={example.card}
          backgroundUrl={scene ? backgroundUrl(scene) : ""}
          badgeLabel={badgeLabelForCard(example.card)}
          format={format}
          composition={direction?.composition ?? "centered"}
        />
      </div>
    </div>
  );
}

export default function VisualEngineDemoPage() {
  const [datasets, setDatasets] = useState<DemoDatasets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [directionId, setDirectionId] = useState("parents");
  const [format, setFormat] = useState<OgFormat>("portrait");
  const [review, setReview] = useState<{ status: "pending" | "approved" | "rejected"; note: string }>({ status: "pending", note: "" });
  const [rejectReason, setRejectReason] = useState("");
  const [history, setHistory] = useState<VisualHistoryEntry[]>(SEEDED_HISTORY);
  const [pushOptIn, setPushOptIn] = useState(true);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [aiFailure, setAiFailure] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  const studioRef = useRef<HTMLDivElement>(null);
  const stage = OG_STAGE_SIZE[format];
  const exp = ogExportSize(format);

  useEffect(() => {
    let cancelled = false;
    loadDemoDatasets()
      .then((d) => { if (!cancelled) setDatasets(d); })
      .catch((e: unknown) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "ডেটাসেট লোড হয়নি"); });
    return () => { cancelled = true; };
  }, []);

  const examples = useMemo(() => (datasets ? buildVisualExamples(datasets) : []), [datasets]);
  const example = examples[exampleIdx] ?? null;
  const direction = directionForId(directionId);
  const scene = direction ? sceneForDirection(direction) : null;

  const { download, isRendering } = useDomToPng(studioRef, {
    fileName: `noorapp-${example ? example.ref.replace(/[^a-z0-9]+/gi, "-") : "poster"}-${format}.png`,
    pixelRatio: 2,
    width: stage.width,
    height: stage.height,
  });

  // Verification: rendered card fields vs the dataset record (live).
  // The pronunciation check compares against the record's STORED bn value
  // when one exists; when the record has none, the card shows a generated
  // candidate (status "candidate") or the missing-data fallback.
  const verification = useMemo(() => {
    if (!datasets || !example) return null;
    let source: { title: string; arabic: string; bengali: string; sourceLine: string; pronunciation: string } | null = null;
    if (example.ref.startsWith("content:")) {
      const rec = datasets.duas.find((d) => `content:${d.slug}` === example.ref);
      if (rec) source = { title: rec.title_bn ?? "", arabic: rec.arabic, bengali: rec.translation_bn ?? "", sourceLine: rec.reference ?? "", pronunciation: (rec.pronunciation?.bn ?? "").trim() };
    } else {
      const rec = datasets.allHadiths.find((h) => `hadith:${h.id}` === example.ref);
      if (rec) source = { title: "আজকের হাদিস", arabic: rec.arabic, bengali: rec.bengali ?? "", sourceLine: `Sahih al-Bukhari, Hadith ${rec.hadith_number}`, pronunciation: "" };
    }
    if (!source) return null;
    const fields = (["title", "arabic", "bengali", "sourceLine"] as const).map((f) => {
      const rendered = example.card[f];
      if (rendered !== source[f]) return { field: f, status: "differs" as const };
      if (source[f] === "") return { field: f, status: "empty-in-record" as const };
      return { field: f, status: "exact" as const };
    });
    const pronStatus =
      source.pronunciation !== "" && example.card.pronunciation === source.pronunciation
        ? "exact" as const
        : source.pronunciation === "" && example.card.pronunciationStatus === "candidate"
          ? "candidate" as const
          : source.pronunciation === "" && example.card.pronunciationStatus === "missing"
            ? "empty-in-record" as const
            : "differs" as const;
    return { fields: [...fields, { field: "pronunciation" as const, status: pronStatus }], allExact: fields.every((f) => f.status === "exact") };
  }, [datasets, example]);

  const batchQc = useMemo(() => {
    if (examples.length === 0) return null;
    const assigned = assignBackgrounds(examples.map((e) => e.card));
    return checkOgCardBatch(
      examples.map((e) => e.card),
      assigned.map((a) => a.background.id),
      CARD_BACKGROUNDS.length,
    );
  }, [examples]);

  const similarity = useMemo(() => {
    if (!scene) return null;
    return checkVisualSimilarity({ sceneId: scene.id, directionId, format }, history, TODAY);
  }, [scene, directionId, format, history]);

  const selectExample = useCallback((idx: number) => {
    setExampleIdx(idx);
    const ex = examples[idx];
    if (ex) setDirectionId(ex.directionId);
    setReview({ status: "pending", note: "" });
  }, [examples]);

  const regenerateVisual = useCallback(() => {
    const ready = readyDirections();
    const cur = ready.findIndex((d) => d.id === directionId);
    const next = ready[(cur + 1) % ready.length];
    setDirectionId(next.id);
    setRegenCount((c) => c + 1);
    setReview((r) => ({ ...r, note: `Visual regenerated (${regenCount + 1}×) — text unchanged, re-verified below.` }));
  }, [directionId, regenCount]);

  const approve = useCallback(() => {
    if (!example || !scene) return;
    setReview({ status: "approved", note: "অনুমোদিত হয়েছে (ডেমো) — শুধু এই পেজের state; কিছু প্রকাশিত হয়নি।" });
    setHistory((h) => [...h, { date: TODAY, contentRef: example.ref, sceneId: scene.id, directionId, format }]);
  }, [example, scene, directionId, format]);

  const reject = useCallback(() => {
    setReview({ status: "rejected", note: `বাতিল হয়েছে (ডেমো)${rejectReason.trim() ? ` — কারণ: ${rejectReason.trim()}` : ""}` });
    setRejectReason("");
  }, [rejectReason]);

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied(`${label} — clipboard উপলভ্য নয় (simulated)`);
    }
    setTimeout(() => setCopied(null), 2500);
  }, []);

  const nativeShare = useCallback(async () => {
    if (!example) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: example.card.title, text: example.card.caption, url: canonicalContentUrl(example.card) });
        setShareMsg("শেয়ার শিট খোলা হয়েছে (ডিভাইসের শেয়ার UI)।");
      } catch {
        setShareMsg("শেয়ার বাতিল করা হয়েছে — কিছু পাঠানো হয়নি।");
      }
    } else {
      setShareMsg("Web Share API এই ব্রাউজারে নেই — Download / Copy ব্যবহার করুন (fallback)।");
    }
  }, [example]);

  const related = useMemo(() => {
    if (!datasets || !example) return [];
    if (example.ref.startsWith("content:")) {
      return relatedDuas(datasets, example.ref.slice("content:".length), 3).map((d) => ({ slug: d.slug, title: d.title_bn ?? d.title_en ?? d.slug, ref: d.reference ?? "" }));
    }
    return datasets.duas.slice(0, 3).map((d) => ({ slug: d.slug, title: d.title_bn ?? d.title_en ?? d.slug, ref: d.reference ?? "" }));
  }, [datasets, example]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
      {/* ---------- Banner ---------- */}
      <Card className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span>Daily Content — Visual Engine</span>
            <Badge className="bg-amber-600">LOCAL DEMO</Badge>
            <Badge variant="outline">MOCK AI</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            প্রিমিয়াম ভিজ্যুয়াল ইঞ্জিনের স্থানীয় প্রিভিউ — আসল Dua OG ডিজাইন
            (OgShareCard), ৭টি ছবির ক্যাটালগ, আসল QC গেট, আসল রেকর্ডের লেখা হুবহু।
            ছবির মডেল কখনো আরবি/বাংলা লেখে না; সব লেখা প্রোগ্রামে বসানো হয়।
          </p>
          <p className="text-xs text-muted-foreground">
            ডিজাইন নোট: মালিকের ২০২৬-১১-০৩ নির্দেশনা অনুযায়ী এই ডিজাইনে কোনো ফুটার
            ব্যানার নেই (স্টোর ব্যাজ, ডাউনলোড লেখা, নিচের স্ট্রিপ নেই)। পরের ব্রিফে
            ডাউনলোড-প্রচারের ফুটার চাওয়া হয়েছিল — সেটি স্থায়ী নির্দেশনার সাথে
            সাংঘর্ষিক, তাই যোগ করা হয়নি; ফুটার ফেরাতে মালিকের একটি বার্তাই যথেষ্ট।
          </p>
          <p className="text-xs">
            <Link to="/demo/daily-content" className="underline">← Daily Content ডেমোতে ফিরুন</Link>
            {" · "}
            <Link to="/demo/daily-content/engines" className="underline font-semibold">উচ্চারণ + সেমান্টিক ইঞ্জিন (অ্যাডমিন পর্যালোচনা) →</Link>
          </p>
        </CardContent>
      </Card>

      {/* ---------- 1. Creative directions ---------- */}
      <Card>
        <CardHeader><CardTitle>১ · সৃজনশীল দিকনির্দেশনা (৮টি — সবগুলো প্রস্তুত)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {CREATIVE_DIRECTIONS.map((d) => {
              const s = sceneForDirection(d);
              return (
                <div key={d.id} className="rounded-xl border overflow-hidden">
                  {s ? (
                    <img src={backgroundUrl(s)} alt={s.scene} className="w-full h-20 object-cover" />
                  ) : (
                    <div className="w-full h-20 bg-muted flex items-center justify-center text-xs text-muted-foreground px-2 text-center">
                      ছবি নেই এখনো — ক্যাটালগ বৃদ্ধির তালিকায়
                    </div>
                  )}
                  <div className="p-2 space-y-1">
                    <p className="text-sm font-semibold">{d.labelBn} <span className="text-xs text-muted-foreground">· {d.labelEn}</span></p>
                    <p className="text-xs text-muted-foreground">{d.subjectsBn}</p>
                    <p className="text-xs">
                      {s ? <><Badge variant="outline">{s.id}</Badge> <span className="text-muted-foreground">{d.composition === "lower-third" ? "নিচের তৃতীয়াংশ" : "কেন্দ্রীভূত"}</span></> : <Badge variant="secondary">ছবি প্রয়োজন</Badge>}
                    </p>
                    {!s && d.pendingPrompt && <p className="text-[11px] text-muted-foreground">প্রম্পট প্রস্তুত: “{d.pendingPrompt.slice(0, 80)}…”</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            দিকনির্দেশনা মানে দৃশ্য + কম্পোজিশন — রঙের থিম নয়। মালিকের নির্দেশনা:
            নির্দিষ্ট সংখ্যক থিম বা এক টেমপ্লেটের রঙের ভিন্নতা নয়; প্রতিটি বিষয়ের
            জন্য আলাদা ছবি, ক্যাটালগ সীমাহীন।
          </p>
        </CardContent>
      </Card>

      {/* ---------- 2. Poster studio ---------- */}
      <Card>
        <CardHeader><CardTitle>২ · পোস্টার স্টুডিও — আসল রেকর্ড, আসল ডিজাইন</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!datasets && !loadError && <p className="text-sm text-muted-foreground">ডেটাসেট লোড হচ্ছে…</p>}
          {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          {example && (
            <>
              <div className="flex flex-wrap gap-2" data-testid="example-picker">
                {examples.map((ex, i) => (
                  <Button key={ex.ref} size="sm" variant={i === exampleIdx ? "default" : "outline"} onClick={() => selectExample(i)}>
                    {directionForId(ex.directionId)?.labelBn ?? ex.directionId}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <Button key={f.id} size="sm" variant={format === f.id ? "default" : "outline"} onClick={() => setFormat(f.id)}>
                    {f.label} {f.px}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm">দিকনির্দেশনা:</span>
                {readyDirections().map((d) => (
                  <Button key={d.id} size="sm" variant={directionId === d.id ? "default" : "outline"} onClick={() => setDirectionId(d.id)}>
                    {d.labelBn}
                  </Button>
                ))}
              </div>

              {/* Scaled preview for the phone screen */}
              <div className="flex justify-center rounded-xl bg-muted/50 p-3 overflow-hidden">
                <ScaledPoster example={example} directionId={directionId} format={format} maxWidth={340} />
              </div>
              {/* Native-size render (exact pixels) — export source */}
              <details className="rounded-lg border p-2">
                <summary className="cursor-pointer text-xs font-medium">
                  আসল আকারে দেখুন ({exp.width}×{exp.height}) — এক্সপোর্টের উৎস
                </summary>
                <div className="mt-2 overflow-auto" data-testid="native-poster">
                  <div ref={studioRef} style={{ width: stage.width, height: stage.height }}>
                    {aiFailure ? (
                      <div style={{ width: stage.width, height: stage.height, background: "#0b1526", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, boxSizing: "border-box", textAlign: "center" }}>
                        <p style={{ fontWeight: 700 }}>ছবি তৈরি হয়নি (সিমুলেটেড AI ব্যর্থতা)</p>
                        <p style={{ fontSize: 14, opacity: 0.8 }}>লেখা অক্ষত আছে — পোস্টারটি পর্যালোচনার জন্য আটকে আছে, প্রকাশ করা হয়নি।</p>
                        <p dir="rtl" lang="ar" style={{ fontSize: 20 }}>{example.card.arabic}</p>
                      </div>
                    ) : (
                      <OgShareCard
                        card={example.card}
                        backgroundUrl={scene ? backgroundUrl(scene) : ""}
                        badgeLabel={badgeLabelForCard(example.card)}
                        format={format}
                        composition={direction?.composition ?? "centered"}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void download()} disabled={isRendering}>
                    {isRendering ? "Rendering…" : `Download PNG (${exp.width}×${exp.height})`}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAiFailure((v) => !v)}>
                    {aiFailure ? "AI ব্যর্থতা বন্ধ করুন" : "AI ব্যর্থতা সিমুলেট করুন"}
                  </Button>
                </div>
              </details>

              {/* Verification panel */}
              <div className="rounded-xl border p-3 space-y-1 text-sm" data-testid="verification-panel">
                <p className="font-semibold">যাচাই — রেন্ডার করা লেখা বনাম ডেটাসেট রেকর্ড ({example.ref})</p>
                {verification ? verification.fields.map((f) => (
                  <p key={f.field}>
                    {f.field}: {f.status === "exact" ? "✓ হুবহু মিলেছে" : f.status === "candidate" ? "⚠ প্রার্থী — আরবি থেকে নিয়মে তৈরি, যাচাই হয়নি (রেকর্ডে সংরক্ষিত উচ্চারণ নেই)" : f.status === "empty-in-record" ? "⚠ রেকর্ডে খালি — দেখানো হয়নি, বানানো হয়নি (অ্যাডমিন পর্যালোচনার জন্য চিহ্নিত)" : "✗ মিলছে না"}
                  </p>
                )) : <p className="text-muted-foreground">যাচাই হচ্ছে…</p>}
                {example.sceneScore && (
                  <p data-testid="semantic-score">
                    সেমান্টিক স্কোর ({example.scene?.id ?? "—"}): <b>{example.sceneScore.total}/100</b> {example.sceneScore.passed ? "✓ ≥৮৫ — স্বয়ংক্রিয় গ্রহণযোগ্য" : "✗ <৮৫ — স্বয়ংক্রিয় গ্রহণযোগ্য নয়; নতুন ছবি বা অ্যাডমিন পর্যালোচনা প্রয়োজন"}
                  </p>
                )}
                {example.bengaliGap && (
                  <p className="text-xs text-muted-foreground">
                    বাংলা অনুবাদ: স্থানীয় ডেটাসেটে নেই (প্রোডাকশন ডাটাবেসে আছে) — হাদিসের
                    পোস্টারে অনুবাদের জায়গা খালি রাখা হয়েছে, বানানো হয়নি।
                  </p>
                )}
              </div>

              {/* QC + similarity */}
              <div className="rounded-xl border p-3 space-y-1 text-sm">
                <p className="font-semibold">QC গেট (আসল ogQc)</p>
                {batchQc && (
                  <p>
                    {batchQc.ok ? "✓ ব্যাচ QC পাস" : "✗ ব্যাচ QC ব্যর্থ"} · {batchQc.errors.length} ত্রুটি · {batchQc.warnings.length} সতর্কতা
                    {batchQc.warnings.length > 0 && <span className="text-muted-foreground"> — {batchQc.warnings.join("; ")}</span>}
                  </p>
                )}
                <p className="font-semibold mt-2">সাদৃশ্য যাচাই (আজ: {TODAY})</p>
                {similarity && (similarity.ok
                  ? <p>✓ এই দৃশ্য গত ৭ দিনে ব্যবহার হয়নি — অনন্য।</p>
                  : <ul className="list-disc pl-4 text-amber-700 dark:text-amber-300">{similarity.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
                )}
                <p className="text-xs text-muted-foreground">
                  স্থিতিশীল পাথ: <code className="break-all">{posterAssetPath(example.ref, format, directionId)}</code>
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- 3. All formats ---------- */}
      <Card>
        <CardHeader><CardTitle>৩ · চারটি ফরম্যাট — একই রেকর্ড, প্রতিটির নিজস্ব কম্পোজিশন</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {example && (
            <>
              <p className="text-xs text-muted-foreground">
                ক্রপ নয় — প্রতিটি আকারের জন্য আলাদা লেআউট: wide (১২০০×৬৩০) অনুভূমিক
                দুই-কলাম; story (১০৮০×১৯২০) লম্বা, বেশি ফাঁকা জায়গা; portrait ও square
                আগের মতোই।
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {FORMATS.map((f) => (
                  <div key={f.id} className="flex-shrink-0 space-y-1">
                    <ScaledPoster example={example} directionId={directionId} format={f.id} maxWidth={f.id === "wide" ? 340 : 220} />
                    <p className="text-xs text-center">{f.label} · {f.px}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- 4. Website page preview ---------- */}
      <Card>
        <CardHeader><CardTitle>৪ · ওয়েবসাইট ডেইলি কনটেন্ট পেজ — প্রিভিউ</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {example && (
            <>
              <div className="flex justify-center rounded-xl bg-muted/50 p-3 overflow-hidden">
                <ScaledPoster example={example} directionId={directionId} format="portrait" maxWidth={340} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{badgeLabelForCard(example.card)}</Badge>
                <Badge variant="outline">{example.card.sourceLine}</Badge>
              </div>
              <p dir="rtl" lang="ar" className="font-arabic text-xl text-right">{example.card.arabic}</p>
              {example.card.pronunciation ? (
                <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    বাংলা উচ্চারণ{example.card.pronunciationScope === "matn-only" ? " (মূল বক্তব্য)" : ""}{" "}
                    <span className="font-normal">— {example.card.pronunciationStatus === "stored-unverified" ? "সংরক্ষিত মান (অযাচাইকৃত)" : example.card.pronunciationStatus === "candidate" ? "প্রার্থী (যাচাই হয়নি)" : "যাচাইকৃত"}</span>
                  </p>
                  <p className="mt-1">{example.card.pronunciation}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">বাংলা উচ্চারণ যাচাই করা হয়নি</p>
              )}
              {example.card.bengali ? (
                <p>{example.card.bengali}</p>
              ) : (
                <p className="text-sm text-muted-foreground">বাংলা অনুবাদ — স্থানীয় ডেটাসেটে নেই (প্রোডাকশন ডাটাবেসে আছে); দেখানো হয়নি, বানানো হয়নি।</p>
              )}
              <p className="text-xs text-muted-foreground">
                ব্যাখ্যা: এই রেকর্ডে অনুমোদিত ব্যাখ্যা নেই — তাই ব্যাখ্যা দেখানো হয়নি,
                বানানো হয়নি। (শুধু অনুমোদিত তথ্য থাকলেই ব্যাখ্যা দেখানো হয়।)
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={saved ? "default" : "outline"} onClick={() => setSaved((v) => !v)}>
                  {saved ? "✓ সংরক্ষিত (ডেমো)" : "সংরক্ষণ করুন"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => document.getElementById("visual-share")?.scrollIntoView({ behavior: "smooth" })}>
                  শেয়ার করুন
                </Button>
                <Button size="sm" variant="outline" onClick={() => void download()} disabled={isRendering}>
                  ছবি ডাউনলোড
                </Button>
              </div>
              <div>
                <p className="text-sm font-semibold mb-2">সম্পর্কিত কনটেন্ট (আসল রেকর্ড)</p>
                <ul className="space-y-1 text-sm">
                  {related.map((r) => (
                    <li key={r.slug} className="rounded-lg border p-2">
                      {r.title} · <span className="text-muted-foreground">{r.ref}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- 5. Social preview + sharing ---------- */}
      <Card id="visual-share">
        <CardHeader><CardTitle>৫ · সোশ্যাল শেয়ারিং — প্রিভিউ ও ইন্টারঅ্যাকশন</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {example && (
            <>
              <div className="flex gap-3 overflow-x-auto pb-2">
                <div className="flex-shrink-0 space-y-1">
                  <div className="rounded-xl border overflow-hidden">
                    <div className="flex items-center gap-2 p-2 border-b">
                      <img src="/assets/logos/logo-1-emerald-gold.svg" alt="NoorApp" className="w-8 h-8 rounded-lg" />
                      <div><p className="text-sm font-semibold">Noor App</p><p className="text-xs text-muted-foreground">noorapp.in · আজ</p></div>
                    </div>
                    <ScaledPoster example={example} directionId={directionId} format="portrait" maxWidth={300} />
                    <p className="text-xs p-2 whitespace-pre-wrap">{example.card.caption}</p>
                  </div>
                  <p className="text-xs text-center">ফিড পোস্ট (৪:৫)</p>
                </div>
                <div className="flex-shrink-0 space-y-1">
                  <div className="rounded-xl border overflow-hidden">
                    <div className="h-1 bg-muted"><div className="h-1 w-1/3 bg-amber-500" /></div>
                    <ScaledPoster example={example} directionId={directionId} format="story" maxWidth={170} />
                  </div>
                  <p className="text-xs text-center">স্টোরি / WhatsApp স্ট্যাটাস (৯:১৬)</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild><a href={whatsappShareUrl(example.card)} target="_blank" rel="noreferrer">WhatsApp-এ শেয়ার</a></Button>
                <Button size="sm" variant="outline" asChild><a href={facebookShareUrl(example.card)} target="_blank" rel="noreferrer">Facebook-এ শেয়ার</a></Button>
                <Button size="sm" variant="outline" onClick={() => void nativeShare()}>Web Share API</Button>
                <Button size="sm" variant="outline" onClick={() => void copyText(example.card.caption, "ক্যাপশন")}>ক্যাপশন কপি</Button>
                <Button size="sm" variant="outline" onClick={() => void copyText(canonicalContentUrl(example.card), "URL")}>URL কপি</Button>
              </div>
              {(shareMsg || copied) && <p className="text-sm rounded-lg bg-muted p-2">{shareMsg ?? copied}</p>}
              <p className="text-xs text-muted-foreground">
                শেয়ার লিংকগুলো আসল URL স্কিম (wa.me / facebook sharer) — ফোনে চাপলে
                আসল অ্যাপ খুলবে। এই প্রিভিউতে কিছু পাঠানো হয় না; Web Share না
                থাকলে ডাউনলোড/কপি ফলব্যাক দেখানো হয়।
              </p>
              <details className="rounded-lg border p-2">
                <summary className="cursor-pointer text-xs font-medium">সোশ্যাল ক্যাপশন (আসল lib — রেকর্ডের লেখা + ব্র্যান্ড)</summary>
                <p className="mt-2 text-xs whitespace-pre-wrap">{example.card.caption}</p>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- 6. Push notification preview ---------- */}
      <Card>
        <CardHeader><CardTitle>৬ · পুশ নোটিফিকেশন — ছবিসহ কার্ড</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {example && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm">অপ্ট-ইন অবস্থা (ডেমো):</span>
                <Button size="sm" variant={pushOptIn ? "default" : "outline"} onClick={() => setPushOptIn(true)}>অপ্ট-ইন</Button>
                <Button size="sm" variant={!pushOptIn ? "default" : "outline"} onClick={() => setPushOptIn(false)}>অপ্ট-আউট</Button>
              </div>
              {pushOptIn ? (
                <>
                  <div className="rounded-2xl border overflow-hidden max-w-sm">
                    <div className="flex items-center gap-2 p-3 pb-2">
                      <img src="/assets/logos/logo-1-emerald-gold.svg" alt="NoorApp" className="w-9 h-9 rounded-xl" />
                      <div className="flex-1"><p className="text-sm font-semibold">NoorApp</p><p className="text-xs text-muted-foreground">এখন · noorapp.in</p></div>
                      <span className="text-xs text-muted-foreground">এখন</span>
                    </div>
                    <div className="px-3 pb-1">
                      <p className="text-sm font-semibold">📿 {example.card.title} — {example.card.sourceLine}</p>
                      <p className="text-sm text-muted-foreground">
                        {example.card.bengali ? `আসসালামু আলাইকুম! ${example.card.bengali.slice(0, 90)}…` : "আসসালামু আলাইকুম! আজকের হাদিস দেখুন।"}
                      </p>
                    </div>
                    <div className="px-3 pb-3">
                      <ScaledPoster example={example} directionId={directionId} format="wide" maxWidth={340} />
                    </div>
                    <p className="text-xs text-muted-foreground px-3 pb-3">টার্গেট: {canonicalContentUrl(example.card)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ছবিসহ Web Push (image ফিল্ড) — যে ব্রাউজার/OS ছবি দেখাতে পারে না,
                    সেখানে নিচের টেক্সট-অনলি ফলব্যাক যায়।
                  </p>
                  <div className="rounded-2xl border max-w-sm p-3">
                    <p className="text-sm font-semibold">NoorApp · টেক্সট-অনলি ফলব্যাক</p>
                    <p className="text-sm">📿 {example.card.title} — {example.card.sourceLine}</p>
                    <p className="text-xs text-muted-foreground">ছবি ছাড়া — একই শিরোনাম ও লিংক।</p>
                  </div>
                  <details className="rounded-lg border p-2">
                    <summary className="cursor-pointer text-xs font-medium">Push পেলোড (আসল buildImagePush — ছবিসহ)</summary>
                    <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(
                      datasets && example.ref.startsWith("hadith:")
                        ? buildImagePush(
                            { record: datasets.allHadiths.find((h) => `hadith:${h.id}` === example.ref)!, sourceLine: example.card.sourceLine, canonicalLink: example.card.canonicalLink },
                            TODAY, 4, demoPosterUrl(example.ref, "wide", directionId),
                          )
                        : { title: `🤲 ${example.card.title}`, body: example.card.bengali.slice(0, 120), image: demoPosterUrl(example.ref, "wide", directionId), deepLink: canonicalContentUrl(example.card) },
                      null, 2,
                    )}</pre>
                  </details>
                </>
              ) : (
                <p className="text-sm rounded-lg bg-muted p-3">
                  অপ্ট-আউট অবস্থা — এই ব্যবহারকারীকে কোনো নোটিফিকেশন যাবে না। (ডেমো:
                  কিছু পাঠানো হয়নি; আসল সিস্টেমে opt-out পছন্দই পাঠানো আটকায়।)
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- 7. Admin review ---------- */}
      <Card>
        <CardHeader><CardTitle>৭ · অ্যাডমিন পর্যালোচনা — সব ফরম্যাট, যাচাই, অনুমোদন</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {example && (
            <>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {FORMATS.map((f) => (
                  <div key={f.id} className="flex-shrink-0 space-y-1">
                    <ScaledPoster example={example} directionId={directionId} format={f.id} maxWidth={f.id === "wide" ? 300 : 150} />
                    <p className="text-xs text-center">{f.label}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border p-3 space-y-1 text-sm">
                <p className="font-semibold">লেখা যাচাই (ডেটাসেটের বিপরীতে)</p>
                {verification && verification.fields.map((f) => (
                  <p key={f.field}>{f.field}: {f.status === "exact" ? "✓ হুবহু" : f.status === "empty-in-record" ? "⚠ রেকর্ডে খালি — দমন করা হয়েছে, অ্যাডমিন পর্যালোচনার জন্য চিহ্নিত" : "✗ অমিল"}</p>
                ))}
                {similarity && !similarity.ok && (
                  <p className="text-amber-700 dark:text-amber-300">⚠ সাদৃশ্য সতর্কতা: {similarity.warnings.join(" ")}</p>
                )}
                <p>অবস্থা: <Badge variant="outline">{review.status}</Badge> {review.note && <span className="text-muted-foreground">{review.note}</span>}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={approve} disabled={review.status === "approved"}>অনুমোদন করুন</Button>
                <Input className="w-56" placeholder="বাতিলের কারণ (ঐচ্ছিক)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                <Button size="sm" variant="outline" onClick={reject}>বাতিল করুন</Button>
                <Button size="sm" variant="outline" onClick={regenerateVisual}>শুধু ভিজ্যুয়াল আবার তৈরি করুন</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ভিজ্যুয়াল আবার তৈরি করলে শুধু দৃশ্য/কম্পোজিশন বদলায় — ধর্মীয় লেখা
                একটুও বদলায় না; অনুমোদনের পর আবার যাচাই চলে।
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- 8. Visual history ---------- */}
      <Card>
        <CardHeader><CardTitle>৮ · ভিজ্যুয়াল ইতিহাস ও ডুপ্লিকেট শনাক্তকরণ</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            গত ৭ দিনের ইতিহাস (সিড করা ডেমো তথ্য — আসল ব্যবহার নয়)। নতুন পিক
            এই ইতিহাসের বিপরীতে যাচাই করা হয়।
          </p>
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.date} className="rounded-lg border p-2 flex flex-wrap gap-2 justify-between">
                <span>{h.date}</span>
                <span className="text-muted-foreground">{h.contentRef}</span>
                <Badge variant="outline">{h.sceneId}</Badge>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border p-3">
            <p className="font-semibold mb-2">এখনই যাচাই করুন — আজকের ({TODAY}) পিক:</p>
            {example && scene && (
              <p>{similarity?.ok ? "✓ অনন্য — এই দৃশ্য গত ৭ দিনে ব্যবহার হয়নি।" : `⚠ সতর্কতা: ${similarity?.warnings.join(" ")}`}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              চেষ্টা করুন: স্টুডিওতে দিকনির্দেশনা “পিতা-মাতা” বেছে নিন — গতকাল
              (২০২৬-১১-০৬) একই দৃশ্য ব্যবহার হয়েছে বলে সতর্কতা দেখাবে। “নেক সন্তান”
              বেছে নিলে অনন্য দেখাবে — সেই দৃশ্য গত ৭ দিনে ব্যবহার হয়নি।
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 9. Failure states ---------- */}
      <Card>
        <CardHeader><CardTitle>৯ · ব্যর্থতার অবস্থা</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-xl border p-3 space-y-1">
            <p className="font-semibold">AI ব্যর্থতা (ছবি তৈরি হয়নি)</p>
            <p>স্টুডিওতে “AI ব্যর্থতা সিমুলেট করুন” চাপলে পোস্টারটি গাঢ় ব্যাকগ্রাউন্ডে
              শুধু লেখা দেখায় — লেখা অক্ষত, পোস্টারটি পর্যালোচনার জন্য আটকে থাকে,
              প্রকাশ হয় না।</p>
          </div>
          <div className="rounded-xl border p-3 space-y-1">
            <p className="font-semibold">অনুপস্থিত তথ্য (হাদিসের বাংলা অনুবাদ নেই)</p>
            <p>
              রমজান ও জ্ঞানের উদাহরণে বাংলা অনুবাদ স্থানীয় ডেটাসেটে নেই — পোস্টারে
              অনুবাদের জায়গা খালি রাখা হয়েছে, যাচাই প্যানেলে “রেকর্ডে খালি” হিসেবে
              চিহ্নিত। অসম্পূর্ণ তথ্য দমন করা হয়েছে, বানানো হয়নি।
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 10. Formats + assets ---------- */}
      <Card>
        <CardHeader><CardTitle>১০ · ফরম্যাট, অপ্টিমাইজেশন ও স্থিতিশীল পাথ</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li>Website OG: 1200×630 PNG/JPEG + WebP/AVIF (ওয়েব ডেলিভারি)</li>
            <li>Social feed: 1080×1350 (4:5) · Story: 1080×1920 (9:16) · Square: 1080×1080</li>
            <li>প্রতিটি ফরম্যাট নিজস্ব কম্পোজিশনে রেন্ডার হয় — ক্রপ নয়।</li>
            <li>স্থিতিশীল পাথ (ডাটাবেসে বাইনারি নয়): <code className="break-all">daily-content/posters/&lt;content-ref&gt;/&lt;format&gt;-&lt;direction&gt;.png</code></li>
            <li>WebP (PIL) ও AVIF (ffmpeg libaom) — রেন্ডার ধাপে তৈরি হয়; ডেমোতে প্রি-রেন্ডার করা ফাইল <code>/demo-posters/</code>-এ পরিবেশিত হয়।</li>
            <li>ডুপ্লিকেট প্রতিরোধ: একই রেফ+ফরম্যাট+দিকনির্দেশনার পাথ নির্ধারিত — আবার রেন্ডার করলে একই ফাইল ওভাররাইট হয়, নতুন কপি জমে না।</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
