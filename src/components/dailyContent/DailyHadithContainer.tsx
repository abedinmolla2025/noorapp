import { useEffect, useState } from "react";
import DailyHadith, { type PublishedDailyHadith } from "@/components/DailyHadith";
import { DailyNotificationToggle } from "@/components/dailyContent/DailyNotificationToggle";
import { supabase } from "@/integrations/supabase/client";
import { kolkataDateString } from "@/lib/dailyContent/selection";
import {
  getBengaliNumber,
  HIJRI_MONTHS_BN,
  ISLAMIC_EVENTS,
} from "@/lib/islamicCalendar";
import {
  hadithRefFromRun,
  resolveContextualRecord,
  resolvePublishedRecord,
  type ContextualInfo,
  type DailyHadithViewState,
  type RecommendationRunRow,
} from "@/lib/dailyContent/containerState";

/**
 * Homepage wiring for the Daily Content automation (launch step: render
 * this instead of bare <DailyHadith /> in Index.tsx).
 *
 * Precedence (Phase 8): today's PUBLISHED row wins; with no publication,
 * the latest APPROVED recommendation run for the Kolkata date is shown as
 * the contextual plan; otherwise the rotation. Public read of the
 * recommendations table is allowed ONLY for status='approved' rows (see
 * the migration) — pending and rejected runs never reach this page.
 *
 * Phase 6/8 states (the card never breaks, but it always says which state
 * it is in — the rotation is never presented as today's publication, and
 * the contextual plan is never presented as a publication):
 *   loading      — query in flight (skeleton, no hadith text yet).
 *   published    — valid published record for the Kolkata date.
 *   contextual   — valid approved run for the date (hadith + Hijri date +
 *                  active events). Badge "আজকের প্রসঙ্গ".
 *   rotation     — no publication / no approved run / invalid content /
 *                  fetch error, each with its own note on the card.
 */

type RecommendationRow = RecommendationRunRow & {
  hijri_key?: string | null;
  context?: { activeEventSlugs?: string[] } | null;
};

/** Build the context line for the contextual card from an approved run:
 *  Hijri date ("১ রমজান ১৪৪৭") + the Bengali names of its active events. */
function contextualInfoForRun(run: RecommendationRow): ContextualInfo {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(run.hijri_key ?? "");
  let hijriLabel = run.hijri_key ?? "";
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const monthBn = HIJRI_MONTHS_BN[mo - 1] ?? "";
    hijriLabel = `${getBengaliNumber(d)} ${monthBn} ${getBengaliNumber(y)}`.trim();
  }
  const slugs = run.context?.activeEventSlugs ?? [];
  const eventNamesBn = slugs
    .map((s) => ISLAMIC_EVENTS.find((e) => e.slug === s)?.nameBn)
    .filter((n): n is string => !!n);
  return { hijriLabel, eventNamesBn };
}

export function DailyHadithContainer() {
  const [view, setView] = useState<DailyHadithViewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    /** The contextual plan for today, or the rotation state to fall back
     *  to when there is no usable approved run. Never throws. */
    const loadContextual = async (today: string): Promise<DailyHadithViewState> => {
      const { data: run, error: runError } = await supabase
        // New table: not yet in the generated Database types (same
        // `as any` pattern the codebase uses for device_push_tokens).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("daily_content_recommendations" as any)
        .select("hijri_key, context, recommendations, status")
        .eq("kolkata_date", today)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (runError) return { kind: "rotation", reason: "fetch-error" };
      if (!run) return { kind: "rotation", reason: "no-publication" };
      const runRow = run as RecommendationRow;
      const id = hadithRefFromRun(runRow);
      if (!id) return { kind: "rotation", reason: "invalid-content" };
      const { data: h, error: hadithError } = await supabase
        .from("hadiths")
        .select("arabic, bengali, book_key, chapter_id, hadith_number")
        .eq("id", id)
        .maybeSingle();
      if (hadithError) return { kind: "rotation", reason: "fetch-error" };
      const resolved = resolveContextualRecord(
        runRow,
        h as {
          arabic?: string;
          bengali?: string | null;
          book_key?: string;
          chapter_id?: number;
          hadith_number?: number;
        } | null,
        contextualInfoForRun(runRow),
      );
      if (!resolved) return { kind: "rotation", reason: "invalid-content" };
      return { kind: "contextual", record: resolved.record, context: resolved.context };
    };

    const load = async () => {
      try {
        const today = kolkataDateString(new Date());
        const { data: pub, error: pubError } = await supabase
          // New table: not yet in the generated Database types (same
          // `as any` pattern the codebase uses for device_push_tokens).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("daily_content_publications" as any)
          .select("hadith_ref, hadith_source_line")
          .eq("kolkata_date", today)
          .eq("status", "published")
          .maybeSingle();
        if (cancelled) return;
        if (pubError) {
          setView({ kind: "rotation", reason: "fetch-error" });
          return;
        }
        if (!pub) {
          // No publication: try the approved contextual plan for today.
          const contextual = await loadContextual(today);
          if (cancelled) return;
          setView(contextual);
          return;
        }
        const ref = (pub as { hadith_ref?: string | null } | null)?.hadith_ref;
        if (!ref || !ref.startsWith("hadith:")) {
          setView({ kind: "rotation", reason: "invalid-content" });
          return;
        }
        const id = ref.slice("hadith:".length);
        const { data: h, error: hadithError } = await supabase
          .from("hadiths")
          .select("arabic, bengali, book_key, chapter_id, hadith_number")
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        if (hadithError) {
          setView({ kind: "rotation", reason: "fetch-error" });
          return;
        }
        const record = resolvePublishedRecord(
          pub as { hadith_ref?: string | null },
          h as {
            arabic?: string;
            bengali?: string | null;
            book_key?: string;
            chapter_id?: number;
            hadith_number?: number;
          } | null,
        );
        if (!record) {
          setView({ kind: "rotation", reason: "invalid-content" });
          return;
        }
        if (!cancelled) {
          setView({ kind: "published", record: record as PublishedDailyHadith });
        }
      } catch {
        // Never break the homepage: fall through to the rotation and say so.
        if (!cancelled) setView({ kind: "rotation", reason: "fetch-error" });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (view.kind === "loading") {
    return (
      <>
        <DailyHadith status="loading" />
        <DailyNotificationToggle />
      </>
    );
  }
  if (view.kind === "published") {
    return (
      <>
        <DailyHadith published={view.record} status="published" />
        <DailyNotificationToggle />
      </>
    );
  }
  if (view.kind === "contextual") {
    const contextLabel = [view.context.hijriLabel, ...view.context.eventNamesBn]
      .filter(Boolean)
      .join(" · ");
    return (
      <>
        <DailyHadith
          published={view.record}
          status="contextual"
          contextLabel={contextLabel || undefined}
        />
        <DailyNotificationToggle />
      </>
    );
  }
  return (
    <>
      <DailyHadith status="rotation" rotationReason={view.reason} />
      <DailyNotificationToggle />
    </>
  );
}
