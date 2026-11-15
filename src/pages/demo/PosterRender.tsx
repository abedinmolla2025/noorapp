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
 *  2. Fixture (`?fixture=intentions`, test-only): the app's own rotation
 *     entry from `src/components/DailyHadith.tsx` (Sahih Bukhari,
 *     intentions hadith — verbatim, no number, because that entry
 *     carries none). Used for LOCAL render testing without live
 *     Supabase credentials. Never used by the workflow.
 *
 * Scene selection reuses `assignBackgrounds()` from the same lib the
 * admin preview uses (subject match, deterministic, no repeat inside
 * the batch). Yesterday's scene is read from yesterday's publication
 * row (`poster_scene_id`) when the column exists; if the subject
 * match equals yesterday's scene, the next unused scene is used.
 * The `poster_scene_id` select is tolerant: before the poster
 * migration lands, the column does not exist and the check is skipped
 * (reported in the status JSON as `yesterdayScene: "unknown"`).
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
 * `layout` (legacy|a|b|c, default legacy — a/b/c are the Bengali-first
 * comparison variants; the pronunciation block is omitted for a/b/c and
 * its state is recorded in the status JSON / QC metadata only),
 * `fixture` (test-only, see above).
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OgShareCard } from "@/components/dailyContent/OgShareCard";
import {
  assignBackgrounds,
  backgroundUrl,
  badgeLabelForCard,
  CARD_BACKGROUNDS,
  type BackgroundScene,
} from "@/lib/dailyContent/backgrounds";
import { checkOgCardBatch, checkOgVerbatim, ogExportSize, OG_STAGE_SIZE, parsePosterLayout, type OgFormat, type PosterLayout } from "@/lib/dailyContent/ogQc";
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
  badgeLabel: string | null;
  pronunciationStatus: string | null;
  fitSize: number | null;
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
    badgeLabel: null,
    pronunciationStatus: null,
    fitSize: null,
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
        let verbatimOk: boolean | null = null;
        let yesterdayScene: string | null = null;

        if (fixture === "intentions") {
          payload = fixtureCard();
        } else if (fixture) {
          throw new Error(`unknown_fixture:${fixture}`);
        } else {
          // Live: published publication row for the date (anon-readable).
          const { data: pub, error: pubError } = await supabasePublic
            .from("daily_content_publications" as never)
            .select("id, kolkata_date, hadith_ref, hadith_source_line, cards")
            .eq("kolkata_date", date)
            .eq("status", "published")
            .maybeSingle();
          if (pubError) throw new Error(`publication_read:${pubError.message}`);
          if (!pub) throw new Error(`no_published_publication:${date}`);
          const row = pub as unknown as {
            hadith_ref?: string | null;
            hadith_source_line?: string | null;
            cards?: unknown;
          };
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
          const record = h as unknown as HadithRecord;
          payload = buildHadithCard({
            record,
            sourceLine: hadithSourceLine(record),
            canonicalLink: hadithCanonicalLink(record),
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

          // Yesterday's scene (tolerant: the column does not exist
          // before the poster migration lands).
          try {
            const { data: prev } = await supabasePublic
              .from("daily_content_publications" as never)
              .select("poster_scene_id")
              .eq("kolkata_date", addDays(date, -1))
              .eq("status", "published")
              .maybeSingle();
            const prevRow = prev as unknown as { poster_scene_id?: string | null } | null;
            yesterdayScene = prevRow?.poster_scene_id ?? null;
          } catch {
            yesterdayScene = null;
          }
        }

        if (cancelled) return;
        // Scene: subject match via the shared lib; if it equals
        // yesterday's scene, fall back to the next unused scene.
        let assigned = assignBackgrounds([payload])[0].background;
        if (yesterdayScene && assigned.id === yesterdayScene) {
          assigned = CARD_BACKGROUNDS.find((s) => s.id !== yesterdayScene) ?? assigned;
        }
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
        let fitOverflow = false;
        let fitSize: number | null = null;
        for (;;) {
          const nodes = Array.from(document.querySelectorAll("[data-autofit]"));
          fitOverflow = nodes.some((n) => n.getAttribute("data-fit-overflow") === "true");
          if (fitOverflow) break;
          const allDone = nodes.length === 0 || nodes.every((n) => n.getAttribute("data-fit-done") === "true");
          if (allDone) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            const still = Array.from(document.querySelectorAll("[data-autofit]"));
            fitOverflow = still.some((n) => n.getAttribute("data-fit-overflow") === "true");
            if (fitOverflow) break;
            if (still.length === 0 || still.every((n) => n.getAttribute("data-fit-done") === "true")) {
              fitOk = true;
              const first = still[0];
              fitSize = first ? Number(first.getAttribute("data-fit-size") ?? "") || null : null;
              break;
            }
          }
          if (Date.now() > fitDeadline || cancelled) break;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        if (cancelled) return;
        if (fitOverflow) {
          setStatus((s) => ({ ...s, status: "error", error: "bengali_overflow_at_min: translation does not fit even at minimum font size" }));
          return;
        }
        if (!fitOk) {
          setStatus((s) => ({ ...s, status: "error", error: "autofit_timeout: Bengali fit did not settle" }));
          return;
        }
        // One frame for the centered re-render to paint before the shot.
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        if (cancelled) return;
        setStatus((s) => ({ ...s, status: s.qc && !s.qc.ok ? "error" : "ready", fitSize }));
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
