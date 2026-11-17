/**
 * Poster render route — demo-gated tool page (VITE_ENABLE_DEMO_ROUTES=true).
 *
 * Renders ONE OgShareCard at exact stage size for headless screenshot
 * (Playwright in the poster-generation workflow). Never linked from the
 * app; never in the production bundle unless the flag is set at build time.
 *
 * Data sources (in order):
 *  1. Live (default): today's PUBLISHED publication row from rehearsal
 *     Supabase (public read — `status='published'` rows are readable by
 *     anon). The hadith card is taken from the row's `cards` jsonb, the
 *     hadith record is re-fetched, and the CardPayload is rebuilt with the
 *     same `buildHadithCard()` the admin preview uses — then the rebuilt
 *     verbatim fields are checked character-for-character against the
 *     stored card (`checkOgVerbatim`). A mismatch aborts the render:
 *     the poster must never disagree with the published text.
 *  1b. Plan (`?plan=1`, split flow, Phase 3): the PLANNED row's cards
 *     from `/poster-plan.json` — written by the poster workflow from an
 *     admin-JWT read of the planned row. Anon RLS ("Public can read
 *     published rows") cannot see a planned row, and the admin policy
 *     ("Admins read publications") already covers the workflow's read,
 *     so no RLS or migration change is needed. The JSON is served only
 *     from the ephemeral workflow runner (never deployed) and holds only
 *     the day's public hadith content — no secrets. The same verbatim
 *     gate applies: the rebuilt card must equal the stored card.
 *  2. Fixture (`?fixture=intentions`, test-only): the app's own rotation
 *     entry from `src/components/DailyHadith.tsx` (Sahih Bukhari,
 *     intentions hadith — verbatim, no number, because that entry
 *     carries none). Used for LOCAL render testing without live
 *     Supabase credentials. Never used by the workflow.
 *
 * Scene selection uses the Visual Concept Engine (`visualSelection.ts`,
 * Phase 2): the hadith is classified (topic/lesson/emotion) and the
 * engine picks a content-matched concept -> scene, filtered by the
 * 14-day scene / 7-day concept history rebuilt from published rows
 * (`poster_scene_id` + stored cards — no new columns). Content-Visual
 * Match QC is mandatory (engine match + semantic score >= 85 +
 * similarity windows + Islamic visual safety); any failure HOLDS the
 * render — there is no fallback scene. Yesterday's scene comes from
 * the same history read. The `poster_scene_id` select is tolerant:
 * before the poster migration lands, the column does not exist and the
 * check is skipped (reported in the status JSON as `yesterdayScene:
 * "unknown"`).
 *
 * Readiness signal (for the screenshot script):
 *  - `document.documentElement.dataset.posterStatus` = "ready" | "error:<code>"
 *  - `#poster-status` div holds a JSON status object (date, format,
 *    recordRef, sourceLine, backgroundId, badgeLabel, qc, exportSize,
 *    error). The script waits for `data-poster-status="ready"` and then
 *    screenshots the `#poster-stage` element.
 *
 * Query params: `date` (YYYY-MM-DD Kolkata, default today),
 * `format` (portrait|square|wide|story, default portrait),
 * `layout` (legacy|a|b|c, default c — Layout C, Bengali Panel +
 * Arabic Footnote, is the standard poster template per the Master
 * Mission Phase 2 decision 2026-11-16; a/b/c are the Bengali-first
 * variants and legacy stays available as an explicit override; the
 * pronunciation block is omitted for a/b/c and its state is recorded
 * in the status JSON / QC metadata only),
 * `plan=1` (split flow: render from the PLANNED row's `/poster-plan.json`
 * instead of the published row — see data source 1b above),
 * `fixture` (test-only, see above).
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OgShareCard } from "@/components/dailyContent/OgShareCard";
import {
  backgroundUrl,
  badgeLabelForCard,
  CARD_BACKGROUNDS,
  type BackgroundScene,
} from "@/lib/dailyContent/backgrounds";
import {
  buildHistoryEntries,
  checkVisualQC,
  selectPosterVisual,
  visualStatusJson,
  type VisualHistoryRow,
  type VisualStatusJson,
} from "@/lib/dailyContent/visualSelection";
import { checkOgCardBatch, checkOgVerbatim, effectiveBengaliFirstLayout, ogExportSize, OG_STAGE_SIZE, parsePosterLayout, type OgFitRecord, type OgFormat, type PosterLayout } from "@/lib/dailyContent/ogQc";
import { buildHadithCard, hadithCanonicalLink, hadithSourceLine } from "@/lib/dailyContent/cards";
import { extractHadithMatn, transliterateArabic } from "@/lib/dailyContent/transliteration";
import type { CardPayload, HadithRecord } from "@/lib/dailyContent/types";
import { supabasePublic } from "@/integrations/supabase/client";

const FORMATS: OgFormat[] = ["portrait", "square", "wide", "story"];

/** Kolkata date (YYYY-MM-DD) for "today" in the renderer's timezone. */
function kolkataToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type PosterStatus = {
  status: "loading" | "ready" | "error";
  kolkataDate: string;
  format: OgFormat;
  layout: PosterLayout;
  source: "live" | "fixture";
  recordRef: string | null;
  sourceLine: string | null;
  backgroundId: string | null;
  backgroundScene: string | null;
  yesterdayScene: string | null;
  /** Visual Intelligence selection (Phase 2) — null until the QC passes. */
  visual: VisualStatusJson | null;
  badgeLabel: string | null;
  pronunciationStatus: string | null;
  fitSize: number | null;
  arabicFitSize: number | null;
  /**
   * Measured fit record (Phase 2): fitted sizes, line counts (Range
   * rects) and spare px for both auto-fit blocks, so a render can be
   * judged from data in the render JSON — not eyeballs alone. Null
   * until the fit settles. The workflow's render-poster.mjs passes it
   * through into its result JSON.
   */
  fit: OgFitRecord | null;
  qc: { ok: boolean; errors: string[]; warnings: string[] } | null;
  verbatimOk: boolean | null;
  exportSize: { width: number; height: number };
  error: string | null;
};

/**
 * Fixture card — verbatim from the app's own rotation entry
 * (`src/components/DailyHadith.tsx`, the intentions hadith). Test-only.
 */
function fixtureCard(): CardPayload {
  const arabic = "إنما الأعمال بالنيات";
  const bengali = "কর্মের ফলাফল নিয়তের উপর নির্ভরশীল।";
  const matn = extractHadithMatn(arabic);
  const pronunciation = matn !== null ? transliterateArabic(matn).candidate : null;
  return {
    kind: "hadith",
    recordRef: "hadith:fixture-intentions",
    title: "আজকের হাদিস",
    arabic,
    bengali,
    sourceLine: "Sahih Bukhari",
    canonicalLink: "/hadith/sahih-bukhari/bangla",
    altText: `হাদিস: ${bengali} — Sahih Bukhari`,
    caption: `🤲 আজকের হাদিস\n${bengali}\n📖 Sahih Bukhari\n🔗 https://noorapp.in/hadith/sahih-bukhari/bangla\n— NoorApp`,
    pronunciation,
    pronunciationStatus: pronunciation !== null ? "candidate" : "missing",
    pronunciationSource: pronunciation !== null ? "generated" : null,
    pronunciationScope: pronunciation !== null ? "matn-only" : null,
  };
}

export default function PosterRender() {
  const [params] = useSearchParams();
  const date = params.get("date") ?? kolkataToday();
  const formatParam = params.get("format") ?? "portrait";
  const format: OgFormat = (FORMATS as string[]).includes(formatParam) ? (formatParam as OgFormat) : "portrait";
  const layout = parsePosterLayout(params.get("layout"));
  const fixture = params.get("fixture");
  const planMode = params.get("plan") === "1";

  const [card, setCard] = useState<CardPayload | null>(null);
  const [background, setBackground] = useState<BackgroundScene | null>(null);
  const [status, setStatus] = useState<PosterStatus>({
    status: "loading",
    kolkataDate: date,
    format,
    layout,
    source: fixture ? "fixture" : "live",
    recordRef: null,
    sourceLine: null,
    backgroundId: null,
    backgroundScene: null,
    yesterdayScene: null,
    visual: null,
    badgeLabel: null,
    pronunciationStatus: null,
    fitSize: null,
    arabicFitSize: null,
    fit: null,
    qc: null,
    verbatimOk: null,
    exportSize: ogExportSize(format),
    error: null,
  });
  const stageRef = useRef<HTMLDivElement>(null);

  // Load the card (live publication or fixture) + pick the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let payload: CardPayload;
        let record: HadithRecord | null = null;
        let verbatimOk: boolean | null = null;
        let yesterdayScene: string | null = null;

        if (fixture === "intentions") {
          payload = fixtureCard();
        } else if (fixture) {
          throw new Error(`unknown_fixture:${fixture}`);
        } else {
          // Live: the publication row for the date.
          //  - Default: the PUBLISHED row (anon-readable).
          //  - `?plan=1`: the PLANNED row's cards from `/poster-plan.json`
          //    (written by the poster workflow from an admin-JWT read —
          //    anon cannot see a planned row; see the header comment).
          //  Either way the cards below go through the same verbatim
          //  gate: the rebuilt card must equal the stored card.
          let row: {
            hadith_ref?: string | null;
            hadith_source_line?: string | null;
            cards?: unknown;
          };
          if (planMode) {
            const planRes = await fetch("/poster-plan.json");
            if (!planRes.ok) throw new Error(`plan_json_missing:${date}`);
            const planJson = (await planRes.json()) as {
              kolkata_date?: string;
              hadith_ref?: string | null;
              hadith_source_line?: string | null;
              cards?: unknown;
            };
            if (planJson.kolkata_date && planJson.kolkata_date !== date) {
              throw new Error(`plan_json_date_mismatch:${planJson.kolkata_date}`);
            }
            row = planJson;
          } else {
            const { data: pub, error: pubError } = await supabasePublic
              .from("daily_content_publications" as never)
              .select("id, kolkata_date, hadith_ref, hadith_source_line, cards")
              .eq("kolkata_date", date)
              .eq("status", "published")
              .maybeSingle();
            if (pubError) throw new Error(`publication_read:${pubError.message}`);
            if (!pub) throw new Error(`no_published_publication:${date}`);
            row = pub as unknown as {
              hadith_ref?: string | null;
              hadith_source_line?: string | null;
              cards?: unknown;
            };
          }
          const cards = Array.isArray(row.cards) ? (row.cards as Record<string, unknown>[]) : [];
          const stored = cards.find((c) => c.kind === "hadith") as
            | { recordRef?: string; title?: string; arabic?: string; bengali?: string; sourceLine?: string }
            | undefined;
          if (!stored || typeof stored.recordRef !== "string" || !stored.recordRef.startsWith("hadith:")) {
            throw new Error("no_hadith_card_in_publication");
          }
          const hadithId = stored.recordRef.slice("hadith:".length);
          const { data: h, error: hadithError } = await supabasePublic
            .from("hadiths")
            .select("id, arabic, bengali, book_key, chapter_id, hadith_number")
            .eq("id", hadithId)
            .maybeSingle();
          if (hadithError) throw new Error(`hadith_read:${hadithError.message}`);
          if (!h) throw new Error(`hadith_not_found:${hadithId}`);
          const rec = h as unknown as HadithRecord;
          record = rec;
          payload = buildHadithCard({
            record: rec,
            sourceLine: hadithSourceLine(rec),
            canonicalLink: hadithCanonicalLink(rec),
          });
          // Verbatim gate: the rebuilt card must equal the published card
          // character-for-character, or the poster must not render.
          const check = checkOgVerbatim(
            {
              title: payload.title,
              arabic: payload.arabic,
              bengali: payload.bengali,
              sourceLine: payload.sourceLine,
              pronunciation: payload.pronunciation ?? "",
            },
            {
              title: stored.title ?? "",
              arabic: stored.arabic ?? "",
              bengali: stored.bengali ?? "",
              sourceLine: stored.sourceLine ?? "",
              pronunciation: "",
            },
          );
          // NOTE: the stored card carries no pronunciation, so the
          // pronunciation field is compared against "" — the rebuilt
          // pronunciation is the lib's matn candidate (never presented
          // as verified). Only the four published text fields gate.
          verbatimOk = check.errors.filter((e) => !e.startsWith("pronunciation")).length === 0;
          if (!verbatimOk) throw new Error(`verbatim_mismatch:${check.errors.join("; ")}`);
        }

        if (cancelled) return;
        // Visual Intelligence (Phase 2): classify the hadith, pick a
        // content-matched concept -> scene with the history windows,
        // then run the mandatory Content-Visual Match QC. Any failure
        // HOLDS the render — there is no fallback scene (the old
        // subject-keyword match + yesterday-fallback is replaced).
        // History is rebuilt from published rows (existing columns
        // only). A history-read failure is a warning, not a hold: the
        // read just succeeded for the card itself, and the window is a
        // repetition rule, not a religious-safety rule — the match,
        // semantic, safety and fit gates below are all computed locally
        // and still hold. The missing history is visible in the status.
        let history: ReturnType<typeof buildHistoryEntries> = [];
        let historyWarning: string | null = null;
        if (!fixture) {
          try {
            const { data: prevRows, error: prevError } = await supabasePublic
              .from("daily_content_publications" as never)
              .select("kolkata_date, hadith_ref, cards, poster_scene_id")
              .eq("status", "published")
              .order("kolkata_date", { ascending: false })
              .limit(30);
            if (prevError) throw new Error(prevError.message);
            const rows = (prevRows ?? []) as unknown as VisualHistoryRow[];
            // Batch-fetch the history rows' hadith records so the topic /
            // concept rebuild classifies with chapter + English, like the
            // live path (card-only classification can differ — see
            // buildHistoryEntries). Failure here is non-fatal: the rebuild
            // falls back to card-only and the 14-day scene window (which
            // reads the DB scene id directly) stays exact.
            let records: Map<string, { chapter_id: number | null; english: string | null }> | undefined;
            try {
              const ids = [...new Set(rows.map((r) => (r.hadith_ref ?? "").replace(/^hadith:/, "")).filter(Boolean))];
              if (ids.length > 0) {
                const { data: hs, error: hError } = await supabasePublic
                  .from("hadiths")
                  .select("id, chapter_id, english")
                  .in("id", ids);
                if (hError) throw new Error(hError.message);
                records = new Map(
                  ((hs ?? []) as unknown as { id: string; chapter_id: number | null; english: string | null }[]).map(
                    (h) => [h.id, { chapter_id: h.chapter_id ?? null, english: h.english ?? null }],
                  ),
                );
              }
            } catch (e) {
              historyWarning = `visual_history_records_unavailable:${e instanceof Error ? e.message : String(e)}`;
            }
            history = buildHistoryEntries(rows, date, records);
          } catch (e) {
            history = [];
            historyWarning = `visual_history_unavailable:${e instanceof Error ? e.message : String(e)}`;
          }
          const yesterday = history.find((h) => h.date === addDays(date, -1));
          yesterdayScene = yesterday?.sceneId ?? null;
        }
        const visual = selectPosterVisual(payload, record, history, date);
        if (visual.hold || !visual.scene || !visual.selection.chosen) {
          throw new Error(`visual_hold:${visual.hold?.reason ?? "unknown"}: ${visual.hold?.detail ?? ""}`);
        }
        const visualQc = checkVisualQC({
          card: payload,
          topicId: visual.selection.topicId,
          concept: visual.selection.chosen,
          scene: visual.scene,
          history,
          today: date,
        });
        if (!visualQc.ok) {
          throw new Error(`visual_qc_fail:${visualQc.failures.join("; ")}`);
        }
        if (historyWarning) visualQc.warnings.push(historyWarning);
        const assigned = visual.scene;
        const visualJson = visualStatusJson(visual.selection, assigned, visualQc);
        const qc = checkOgCardBatch([payload], [assigned.id], CARD_BACKGROUNDS.length, {
          // Bengali-first layouts render no pronunciation block (rule 8):
          // the pronunciation state is QC metadata only (status JSON).
          pronunciationShown: layout === "legacy",
        });
        setCard(payload);
        setBackground(assigned);
        setStatus((s) => ({
          ...s,
          source: fixture ? "fixture" : "live",
          recordRef: payload.recordRef,
          sourceLine: payload.sourceLine,
          backgroundId: assigned.id,
          backgroundScene: assigned.scene,
          yesterdayScene,
          visual: visualJson,
          badgeLabel: badgeLabelForCard(payload),
          pronunciationStatus: payload.pronunciationStatus ?? null,
          qc,
          verbatimOk,
          error: qc.ok ? null : `qc_fail:${qc.errors.join("; ")}`,
        }));
      } catch (e) {
        if (cancelled) return;
        setStatus((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, format, fixture, layout]);

  // Readiness: fonts + all images inside the stage must be loaded.
  useEffect(() => {
    if (!card || !background) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        await Promise.race([
          (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve(),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
        const deadline = Date.now() + 15000;
        for (;;) {
          const imgs = Array.from(stageRef.current?.querySelectorAll("img") ?? []);
          const allLoaded = imgs.every((img) => img.complete && img.naturalWidth > 0);
          if (allLoaded || Date.now() > deadline) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (cancelled) return;
        const imgs = Array.from(stageRef.current?.querySelectorAll("img") ?? []);
        const broken = imgs.filter((img) => !img.complete || img.naturalWidth === 0);
        if (broken.length > 0) {
          setStatus((s) => ({ ...s, status: "error", error: `image_load_failed:${broken.length}` }));
          return;
        }
        // Bengali auto-fit gate (rules 6–7): every [data-autofit] block
        // must report done; a min-size overflow is a hard error — never
        // render a clipped translation. The fit resets when webfonts
        // arrive, so "done" must hold across two polls 200ms apart.
        // (Legacy has no autofit blocks and passes trivially.)
        const fitDeadline = Date.now() + 15000;
        let fitOk = false;
        let fitOverflowKind: "bengali" | "arabic" | null = null;
        let fitSize: number | null = null;
        let arabicFitSize: number | null = null;
        let fitRecord: OgFitRecord | null = null;
        const overflowKindOf = (nodes: Element[]): "bengali" | "arabic" | null => {
          const n = nodes.find((el) => el.getAttribute("data-fit-overflow") === "true");
          if (!n) return null;
          return n.getAttribute("data-fit-kind") === "arabic" ? "arabic" : "bengali";
        };
        const fitSizeOf = (nodes: Element[], kind: string): number | null => {
          const n = nodes.find((el) => el.getAttribute("data-fit-kind") === kind);
          return n ? Number(n.getAttribute("data-fit-size") ?? "") || null : null;
        };
        // Measured fit record for the render JSON: line counts via
        // Range rects (distinct line tops), spare px per auto-fit box,
        // line heights from computed style. Measured at the same moment
        // the fit settles, before the screenshot.
        const measureFit = (nodes: Element[]): OgFitRecord | null => {
          const bn = nodes.find((el) => el.getAttribute("data-fit-kind") === "bengali") as HTMLElement | undefined;
          const ar = nodes.find((el) => el.getAttribute("data-fit-kind") === "arabic") as HTMLElement | undefined;
          if (!bn || !ar) return null;
          const linesOf = (el: HTMLElement): number => {
            const textEl = el.querySelector("div");
            if (!textEl) return 0;
            // Count lines from the TEXT NODE only: the gold quote
            // spans (size+4) sit on the first/last lines with taller
            // rects, and counting their rects invents phantom lines
            // (intentions measured 4 lines instead of 2).
            const textNode = [...textEl.childNodes].find((n) => n.nodeType === 3);
            if (!textNode) return 0;
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const rects = [...range.getClientRects()];
            const tops: number[] = [];
            for (const r of rects) {
              if (!tops.some((t) => Math.abs(t - r.top) < 2)) tops.push(r.top);
            }
            return tops.length;
          };
          const lhOf = (el: HTMLElement): number => {
            const textEl = el.querySelector("div");
            return textEl ? parseFloat(getComputedStyle(textEl).lineHeight) || 0 : 0;
          };
          const bnSize = Number(bn.getAttribute("data-fit-size") ?? "") || 0;
          const arSize = Number(ar.getAttribute("data-fit-size") ?? "") || 0;
          // Floors come from the same effective-layout table the card
          // rendered with — never hardcoded here, so the record and the
          // render can never disagree about what the floor was.
          const eff = layout === "legacy" ? null : effectiveBengaliFirstLayout(layout, format, card?.arabic.length ?? 0, card?.bengali.length ?? 0);
          // Spare px is the TRUE headroom: box height minus text height
          // minus vertical padding. (NOT clientHeight - scrollHeight:
          // for a fitting flex panel Chrome reports scrollHeight ==
          // clientHeight, so that difference reads 0 for ANY fitting
          // content — the Phase 1 audit's "0 px spare" was this quirk,
          // and the real fragility signal was settling AT the floor.
          // The headroom formula below is negative exactly when the
          // text overflows, so it stays a valid overflow signal too.)
          const spareOf = (el: HTMLElement): number => {
            const textEl = el.querySelector("div");
            const cs = getComputedStyle(el);
            const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            const textH = textEl ? textEl.getBoundingClientRect().height : 0;
            return Math.round((el.clientHeight - textH - padV) * 10) / 10;
          };
          return {
            format,
            isLongContent: (card?.arabic.length ?? 0) > 260 || (card?.bengali.length ?? 0) > 380,
            bengaliSize: bnSize,
            bengaliMinSize: eff?.bengaliMinSize ?? 0,
            arabicSize: arSize,
            arabicMinSize: eff?.arabicMinSize ?? 0,
            bengaliLines: linesOf(bn),
            arabicLines: linesOf(ar),
            bengaliSparePx: spareOf(bn),
            arabicSparePx: spareOf(ar),
            bengaliOverflow: bn.getAttribute("data-fit-overflow") === "true",
            arabicOverflow: ar.getAttribute("data-fit-overflow") === "true",
            bengaliLineHeight: lhOf(bn),
            arabicLineHeight: lhOf(ar),
          };
        };
        for (;;) {
          const nodes = Array.from(document.querySelectorAll("[data-autofit]"));
          fitOverflowKind = overflowKindOf(nodes);
          if (fitOverflowKind) break;
          const allDone = nodes.length === 0 || nodes.every((n) => n.getAttribute("data-fit-done") === "true");
          if (allDone) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            const still = Array.from(document.querySelectorAll("[data-autofit]"));
            fitOverflowKind = overflowKindOf(still);
            if (fitOverflowKind) break;
            if (still.length === 0 || still.every((n) => n.getAttribute("data-fit-done") === "true")) {
              fitOk = true;
              fitSize = fitSizeOf(still, "bengali");
              arabicFitSize = fitSizeOf(still, "arabic");
              fitRecord = measureFit(still);
              break;
            }
          }
          if (Date.now() > fitDeadline || cancelled) break;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        if (cancelled) return;
        if (fitOverflowKind) {
          // Distinguish which text overflowed: the Arabic cap can bind
          // first (its box is capped so the Bengali gets room); the
          // error names the block that failed at its minimum size.
          const msg =
            fitOverflowKind === "arabic"
              ? "arabic_overflow_at_min: Arabic does not fit even at minimum font size"
              : "bengali_overflow_at_min: translation does not fit even at minimum font size";
          setStatus((s) => ({ ...s, status: "error", error: msg }));
          return;
        }
        if (!fitOk) {
          setStatus((s) => ({ ...s, status: "error", error: "autofit_timeout: Bengali fit did not settle" }));
          return;
        }
        // One frame for the centered re-render to paint before the shot.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        if (cancelled) return;
        setStatus((s) => ({ ...s, status: s.qc && !s.qc.ok ? "error" : "ready", fitSize, arabicFitSize, fit: fitRecord }));
      } catch (e) {
        if (!cancelled) setStatus((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [card, background]);

  // Expose the status for the screenshot script.
  useEffect(() => {
    document.documentElement.dataset.posterStatus = status.status;
  }, [status.status]);

  const stage = OG_STAGE_SIZE[format];
  return (
    <div style={{ margin: 0, padding: 0, background: "#0b1526", minHeight: "100vh" }}>
      {/* The cookie-consent banner is a fixed overlay that pops in after
          load; Playwright's element screenshot captures fixed elements
          overlapping the stage, so it leaked into poster PNGs. Hide it
          (and only it) on this render route — it has no role here. */}
      <style>{`[data-cookie-consent-banner]{display:none!important;}`}</style>
      <div id="poster-status" style={{ display: "none" }}>
        {JSON.stringify(status)}
      </div>
      {card && background && (
        <div id="poster-stage" ref={stageRef} style={{ width: stage.width, height: stage.height }}>
          <OgShareCard card={card} backgroundUrl={backgroundUrl(background)} badgeLabel={badgeLabelForCard(card)} format={format} layout={layout} />
        </div>
      )}
      {status.status === "error" && (
        <div style={{ color: "#fff", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          Poster render error: {status.error}
        </div>
      )}
    </div>
  );
}
