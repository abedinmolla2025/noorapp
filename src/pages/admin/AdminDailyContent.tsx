import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import DailyHadith from "@/components/DailyHadith";
import { ExportableOgShareCard } from "@/components/dailyContent/ExportableOgShareCard";
import { assignBackgrounds, backgroundUrl, badgeLabelForCard, CARD_BACKGROUNDS } from "@/lib/dailyContent/backgrounds";
import { checkOgCardBatch } from "@/lib/dailyContent/ogQc";
import { supabase } from "@/integrations/supabase/client";
import RecommendationReview from "@/components/dailyContent/RecommendationReview";
import { useAdmin } from "@/contexts/AdminContext";
import { dailyContentStore } from "@/lib/dailyContent/store";
import { kolkataDateString, nextDailyRunAt } from "@/lib/dailyContent/selection";
import { planDay, type PlanResult } from "@/lib/dailyContent/plan";
import { applyRetry, isFailedJob } from "@/lib/dailyContent/delivery";
import { buildMonitoringSnapshot } from "@/lib/dailyContent/monitoring";
import type {
  ContentRecord,
  DeliveryAttempt,
  HadithRecord,
  PublicationRecord,
} from "@/lib/dailyContent/types";

function formatKolkata(iso: string): string {
  try {
    return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Kolkata" });
  } catch {
    return iso;
  }
}

/**
 * Daily Content admin — live production data + LOCAL PREVIEW MODE.
 * When an admin Supabase session is present, the live cards read the real
 * `daily_content_*` tables through the admin RLS policies (settings,
 * publications, retryable/failed deliveries). The live switch can only pause:
 * enable is disabled while owner enablement approval is pending, and the
 * handler refuses any attempt to set enabled=true.
 * The preview/history/retry sections below remain local-only: they plan from
 * the real bundled dua pool + the public hadiths table (when reachable) and
 * store plans in browser localStorage.
 * This page NEVER publishes, schedules, sends, or triggers a dry run:
 * production publication runs in the `daily-content` edge function, and the
 * browser never calls it with a secret (the status check sends no
 * Authorization header, so the function answers 401 before any logic).
 * Facebook (Phase 4): the card below shows the Page connection, the
 * auto-publish / approval switches, and the `daily_content_facebook_posts`
 * log. Phase 6 wires those switches to real settings writes through the
 * admin-JWT-gated `update_settings` edge action (audit-logged
 * server-side); they stay disabled until the Facebook migration adds
 * the columns. This page never posts to Facebook and never approves a
 * post; posting runs only through the daily-content edge function
 * (CRON-secret gated, Mode B approval required by default). Until the
 * Facebook migration is applied the log query fails honestly with
 * "table not available" instead of inventing rows.
 * Mode A/B + per-channel switches (Phase 6): the Publishing mode card
 * shows the current mode (Mode A automatic vs Mode B admin approval)
 * and the website/push channel switches, all written through the same
 * `update_settings` action. The master `enabled` toggle is NOT wired
 * here — it stays owner-SQL only. The decided-runs card lists
 * approved/rejected recommendation runs (list_decided) and offers a
 * Regenerate button for today (a published day cannot be regenerated).
 */

// Deployed edge function (mission state: ACTIVE, verify_jwt=false).
const EDGE_URL = "https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/daily-content";

interface LiveSettings {
  enabled: boolean;
  updated_at: string;
  // Mode A/B + per-channel switches (Phase 6) — present only after
  // the Mode A/B migration. Absent columns mean legacy behaviour
  // (Mode B, website + push on).
  approval_required?: boolean;
  website_auto_publish?: boolean;
  push_enabled?: boolean;
  // Facebook (Phase 4) — present only after the Facebook migration.
  facebook_auto_publish_enabled?: boolean;
  facebook_approval_required?: boolean;
  facebook_posting_enabled?: boolean;
  facebook_page_id?: string | null;
  facebook_page_name?: string | null;
  facebook_token_health?: string | null;
  facebook_token_checked_at?: string | null;
}

interface DecidedRun {
  id: string;
  kolkata_date: string;
  status: string;
  created_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

interface LivePublication {
  id: string;
  kolkata_date: string;
  status: string;
  hadith_ref: string | null;
  hadith_source_line: string | null;
  cards: unknown;
  push: { title?: string; body?: string; deep_link?: string } | null;
  recipients_total: number;
  recipients_sent: number;
  recipients_failed: number;
  error: string | null;
  created_at: string;
  published_at: string | null;
  // Phase 10: poster columns exist only after migration 202611150001.
  // loadLive tries them first and falls back without them, so these are
  // optional here and normalized to null in the monitoring snapshot.
  poster_qc_status?: string | null;
  poster_error?: string | null;
  poster_url?: string | null;
}

interface LiveDelivery {
  id: string;
  publication_id: string;
  device_id: string | null;
  platform: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
  next_attempt_at: string | null;
  created_at: string;
}

interface LiveFacebookPost {
  id: string;
  publication_id: string;
  page_id: string;
  post_id: string | null;
  asset_id: string;
  poster_url: string;
  status: string;
  attempt: number;
  error_code: number | null;
  error_message: string | null;
  permalink_url: string | null;
  approved_at: string | null;
  approved_by: string | null;
  next_attempt_at: string | null;
  created_at: string;
}
export default function AdminDailyContent() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [poolNote, setPoolNote] = useState<string | null>(null);
  const [hadiths, setHadiths] = useState<HadithRecord[]>([]);
  const [contents, setContents] = useState<ContentRecord[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryAttempt[]>([]);
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [liveSettings, setLiveSettings] = useState<LiveSettings | null>(null);
  const [livePublications, setLivePublications] = useState<LivePublication[]>([]);
  const [liveDeliveries, setLiveDeliveries] = useState<LiveDelivery[]>([]);
  // Phase 10: true when the poster columns (migration 202611150001)
  // were readable; false when loadLive fell back to the base columns.
  const [posterColumnsAvailable, setPosterColumnsAvailable] = useState(false);
  const [liveFacebook, setLiveFacebook] = useState<LiveFacebookPost[] | null>(null);
  const [liveFacebookError, setLiveFacebookError] = useState<string | null>(null);
  const [liveFacebookMessage, setLiveFacebookMessage] = useState<string | null>(null);
  const [decidedRuns, setDecidedRuns] = useState<DecidedRun[] | null>(null);
  const [decidedError, setDecidedError] = useState<string | null>(null);
  const [decidedLoading, setDecidedLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [liveToggling, setLiveToggling] = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<string | null>(null);
  const [edgeChecking, setEdgeChecking] = useState(false);

  useEffect(() => {
    setEnabled(dailyContentStore.getSettings().enabled);
    setPublications(dailyContentStore.getPublications());
    setDeliveries(dailyContentStore.getDeliveries());
  }, []);

  const loadPool = useCallback(async () => {
    setLoading(true);
    setPoolNote(null);
    try {
      const duaRes = await fetch("/data/duas.json");
      const duas = (await duaRes.json()) as ContentRecord[];
      setContents(duas);
      const { data, error } = await supabase
        .from("hadiths")
        .select("id, book_key, chapter_id, hadith_number, arabic, bengali")
        .order("hadith_number", { ascending: true })
        .limit(500);
      if (error || !data) {
        setHadiths([]);
        setPoolNote(
          "Hadith pool unavailable in this environment (database not reachable). " +
            "Dua cards preview normally; the hadith slot reports the empty-pool reason honestly.",
        );
      } else {
        setHadiths(data as unknown as HadithRecord[]);
      }
    } catch {
      setContents([]);
      setHadiths([]);
      setPoolNote("Content pools could not be loaded in this environment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPool();
  }, [loadPool]);

  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const { data: s, error: sErr } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("daily_content_settings" as any)
        // select("*"): the Facebook columns exist only after the
        // Facebook migration; a wildcard returns whatever is present.
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (sErr) throw sErr;
      // Phase 10 — poster columns (migration 202611150001) exist in
      // rehearsal but not yet in production. Try them first; on error
      // fall back to the base columns instead of failing the whole
      // live load. The monitoring card reports the gap honestly.
      const PUB_BASE_COLS =
        "id, kolkata_date, status, hadith_ref, hadith_source_line, cards, push, recipients_total, recipients_sent, recipients_failed, error, created_at, published_at";
      const first = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("daily_content_publications" as any)
        .select(`${PUB_BASE_COLS}, poster_qc_status, poster_error, poster_url`)
        .order("kolkata_date", { ascending: false })
        .limit(30);
      let p = first.data;
      let posterAvailable = !first.error;
      if (first.error) {
        const fallback = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("daily_content_publications" as any)
          .select(PUB_BASE_COLS)
          .order("kolkata_date", { ascending: false })
          .limit(30);
        if (fallback.error) throw fallback.error;
        p = fallback.data;
        posterAvailable = false;
      }
      setPosterColumnsAvailable(posterAvailable);
      const { data: d, error: dErr } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("daily_content_deliveries" as any)
        .select("id, publication_id, device_id, platform, status, attempts, max_attempts, error, next_attempt_at, created_at")
        .in("status", ["retryable", "failed"])
        .order("next_attempt_at", { ascending: true })
        .limit(50);
      if (dErr) throw dErr;
      // Facebook log (Phase 4): read-only, best-effort. Until the
      // Facebook migration is applied this table does not exist — that
      // failure must NOT fail the whole live load; it is reported on
      // the Facebook card instead.
      try {
        const { data: f, error: fErr } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("daily_content_facebook_posts" as any)
          .select("id, publication_id, page_id, post_id, asset_id, poster_url, status, attempt, error_code, error_message, permalink_url, approved_at, approved_by, next_attempt_at, created_at")
          .order("created_at", { ascending: false })
          .limit(10);
        if (fErr) throw fErr;
        setLiveFacebook((f ?? []) as unknown as LiveFacebookPost[]);
        setLiveFacebookError(null);
      } catch (e) {
        setLiveFacebook(null);
        setLiveFacebookError(
          "Facebook log table not available — the Facebook migration has not been applied yet. " +
            (e instanceof Error ? e.message : ""),
        );
      }
      setLiveSettings((s ?? null) as unknown as LiveSettings | null);
      setLivePublications((p ?? []) as unknown as LivePublication[]);
      setLiveDeliveries((d ?? []) as unknown as LiveDelivery[]);
      setLiveAvailable(true);
    } catch (e) {
      setLiveAvailable(false);
      setLiveError(e instanceof Error ? e.message : "Live data could not be loaded.");
    } finally {
      setLiveLoading(false);
    }
  }, []);

  // Phase 6 — decided-runs history (approved + rejected, newest
  // first). Declared before the admin-session effect below because
  // that effect calls it (a later declaration would be a TDZ error).
  const loadDecided = useCallback(async () => {
    setDecidedLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("recommend-daily-content", {
        body: { action: "list_decided" },
      });
      if (error) throw error;
      setDecidedRuns(((data as { items?: DecidedRun[] }).items ?? []) as DecidedRun[]);
      setDecidedError(null);
    } catch (e) {
      setDecidedRuns(null);
      setDecidedError(e instanceof Error ? e.message : "Decided runs could not be loaded.");
    } finally {
      setDecidedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      void loadLive();
      void loadDecided();
    }
  }, [adminLoading, isAdmin, loadLive, loadDecided]);

  const toggleLive = useCallback(
    async (checked: boolean) => {
      // HARDENING (owner enablement approval pending): the frontend must
      // never set enabled=true. The switch is also disabled while paused,
      // so this guard is defense-in-depth for any other call path.
      if (checked) {
        setLiveError("Enable is disabled — awaiting owner approval. No change was made.");
        return;
      }
      if (
        !window.confirm(
          "Pause the live Daily Content automation? This updates the live settings row; already-scheduled triggers will return paused.",
        )
      ) {
        return;
      }
      setLiveToggling(true);
      try {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("daily_content_settings" as any)
          .update({ enabled: checked })
          .eq("id", 1);
        if (error) throw error;
        await loadLive();
      } catch (e) {
        setLiveError(e instanceof Error ? e.message : "Live settings update failed.");
      } finally {
        setLiveToggling(false);
      }
    },
    [loadLive],
  );

  const updateSetting = useCallback(
    async (key: string, checked: boolean) => {
      // Phase 6: real settings writes through the admin-JWT-gated
      // `update_settings` edge action (audit-logged server-side).
      // The master `enabled` toggle is NOT offered here — it stays
      // owner-SQL only (the edge action refuses it with 403). Unlike
      // the local-preview Switch, these controls never write browser
      // localStorage — the setting lives only in the database.
      // Switching Mode B -> Mode A (approval_required off) needs an
      // explicit confirm: recommendations will then be consumed
      // WITHOUT admin approval (all mandatory validations + Image QC
      // stay on, and the switch can be reversed at any time).
      const label =
        key === "approval_required"
          ? "Admin approval required (Mode B)"
          : key === "website_auto_publish"
            ? "Website auto-publish"
            : key === "push_enabled"
              ? "Push enabled"
              : key === "facebook_auto_publish_enabled"
                ? "Facebook auto-publish"
                : key === "facebook_approval_required"
                  ? "Facebook admin approval required (Mode B)"
                  : key === "facebook_posting_enabled"
                    ? "Facebook posting enabled"
                    : key;
      if (key === "approval_required" && !checked) {
        if (
          !window.confirm(
            "Switch to Mode A (automatic)? AI recommendations will be consumed WITHOUT admin approval. All mandatory validations and Image QC stay on. You can switch back to Mode B at any time.",
          )
        ) {
          return;
        }
      } else if (
        !window.confirm(
          `Change "${label}" to ${checked ? "on" : "off"}? This updates the live settings row and is audit-logged.`,
        )
      ) {
        return;
      }
      setLiveToggling(true);
      try {
        const { data, error } = await supabase.functions.invoke("daily-content", {
          body: { action: "update_settings", settings: { [key]: checked } },
        });
        if (error) throw error;
        const d = data as { ok?: boolean; error?: string; detail?: string } | null;
        if (!d?.ok) throw new Error(d?.error ? `${d.error}${d.detail ? ` — ${d.detail}` : ""}` : "Settings update failed.");
        setLiveFacebookMessage(`Updated ${label}.`);
        await loadLive();
      } catch (e) {
        setLiveFacebookMessage(e instanceof Error ? e.message : "Settings update failed.");
      } finally {
        setLiveToggling(false);
      }
    },
    [loadLive],
  );

  const checkEdge = useCallback(async () => {
    setEdgeChecking(true);
    setEdgeStatus(null);
    try {
      // No Authorization header on purpose: without a secret the function
      // answers 401 before any logic. 401 here means "reachable, auth gate
      // responding" — it is NOT a dry run and sends nothing.
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(15000),
      });
      setEdgeStatus(
        res.status === 401
          ? "Reachable — auth gate responding (401 without a secret, as expected)"
          : `Unexpected status ${res.status}`,
      );
    } catch {
      setEdgeStatus("Unreachable — network error or timeout");
    } finally {
      setEdgeChecking(false);
    }
  }, []);

  const today = useMemo(() => kolkataDateString(new Date()), []);
  const nextRun = useMemo(() => nextDailyRunAt(new Date()), []);

  // Phase 6 — regenerate-per-run for today. Creates a fresh
  // pending_review run; it never changes today's planned or published
  // row, and a published day cannot be regenerated (the edge action
  // refuses it with 409).
  const regenerateToday = useCallback(async () => {
    if (
      !window.confirm(
        "Generate a fresh recommendation for today? The new run will be pending review; it does not change today's planned or published row. A published day cannot be regenerated.",
      )
    ) {
      return;
    }
    setRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("recommend-daily-content", {
        body: { action: "regenerate", kolkataDate: today },
      });
      if (error) throw error;
      const d = data as { ok?: boolean; error?: string } | null;
      if (!d?.ok) throw new Error(d?.error ?? "Regenerate failed.");
      setDecidedError(null);
      await loadDecided();
    } catch (e) {
      setDecidedError(e instanceof Error ? e.message : "Regenerate failed.");
    } finally {
      setRegenerating(false);
    }
  }, [today, loadDecided]);

  const preview = useCallback(() => {
    const r = planDay({
      kolkataDate: today,
      hadiths,
      contents,
      history: dailyContentStore.getHistory(),
    });
    setResult(r);
  }, [today, hadiths, contents]);

  const savePlanned = useCallback(() => {
    if (!result) return;
    dailyContentStore.savePublication({
      kolkataDate: result.plan.kolkataDate,
      status: "planned",
      hadithRef: result.plan.hadith ? `hadith:${result.plan.hadith.record.id}` : null,
      hadithSourceLine: result.plan.hadith?.sourceLine ?? null,
      cards: result.plan.cards,
      push: result.plan.push,
      createdAt: new Date().toISOString(),
      error: result.plan.hadithEmptyReason,
    });
    setPublications(dailyContentStore.getPublications());
  }, [result]);

  const retry = useCallback((deviceId: string) => {
    setDeliveries((prev) => {
      const next = prev.map((row) =>
        row.deviceId === deviceId ? applyRetry(row).next : row,
      );
      dailyContentStore.saveDeliveries(next);
      return next;
    });
  }, []);

  const toggleEnabled = useCallback((checked: boolean) => {
    dailyContentStore.setEnabled(checked);
    setEnabled(checked);
  }, []);

  const plan = result?.plan ?? null;
  const todayLive = livePublications.find((p) => p.kolkata_date === today);
  // Phase 10 — monitoring snapshot, assembled from the rows already
  // loaded above (no extra queries). Recomputed when the live rows
  // change; the schedule is assessed against the load time.
  const monitoring = useMemo(() => {
    if (!liveAvailable) return null;
    const pubs = livePublications.map((p) => ({
      ...p,
      poster_qc_status: p.poster_qc_status ?? null,
      poster_error: p.poster_error ?? null,
      poster_url: p.poster_url ?? null,
    }));
    return buildMonitoringSnapshot(pubs, liveDeliveries, new Date());
  }, [liveAvailable, livePublications, liveDeliveries]);
  const latestPublished = livePublications.find((p) => p.status === "published");
  const latestPush = latestPublished?.push ?? null;
  const pubDateById = new Map(livePublications.map((p) => [p.id, p.kolkata_date]));
  // Phase 6: the Mode A/B + Facebook columns exist only after their
  // migrations (select "*" returns whatever is present). Absent
  // columns mean legacy behaviour — the switches stay disabled until
  // the migration is applied instead of erroring on every click.
  const modeColumnsPresent =
    liveSettings !== null &&
    ("approval_required" in liveSettings ||
      "website_auto_publish" in liveSettings ||
      "push_enabled" in liveSettings);
  const facebookColumnsPresent =
    liveSettings !== null &&
    ("facebook_auto_publish_enabled" in liveSettings ||
      "facebook_posting_enabled" in liveSettings ||
      "facebook_page_id" in liveSettings);
  const isModeA = liveSettings?.approval_required === false;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Daily Content Automation</h1>
        <Badge variant="secondary">
          {liveAvailable
            ? "Live production data connected — this page never publishes or sends"
            : "Local preview mode — nothing is published or sent"}
        </Badge>
      </div>

      {liveAvailable && liveSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Live automation state</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={liveSettings.enabled}
                onCheckedChange={(v) => void toggleLive(v)}
                disabled={liveToggling || !liveSettings.enabled}
              />
              <span>{liveSettings.enabled ? "Enabled (live)" : "Paused (live)"}</span>
              <Badge variant={liveSettings.enabled ? "default" : "secondary"}>
                {liveSettings.enabled ? "live enabled" : "live paused"}
              </Badge>
              {!liveSettings.enabled && <Badge variant="outline">Awaiting Owner Approval</Badge>}
            </div>
            {liveError && <p className="text-sm text-destructive">{liveError}</p>}
            <p className="text-sm text-muted-foreground">
              Live settings updated: {formatKolkata(liveSettings.updated_at)}. Enable is
              disabled while owner enablement approval is pending — no frontend interaction
              can set enabled=true. Pause remains available when the automation is enabled.
            </p>
            <p className="text-sm text-muted-foreground">
              Target schedule: daily at 06:00 Asia/Kolkata. Next run (computed):{" "}
              <strong>{formatKolkata(nextRun)}</strong>. The daily trigger runs only after its
              separately approved cron registration.
            </p>
            <p className="text-sm text-muted-foreground">
              Today&apos;s live row:{" "}
              {todayLive ? (
                <>
                  <Badge
                    variant={
                      todayLive.status === "failed"
                        ? "destructive"
                        : todayLive.status === "published"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {todayLive.status}
                  </Badge>{" "}
                  {todayLive.hadith_source_line ?? "no hadith"} ·{" "}
                  {Array.isArray(todayLive.cards) ? todayLive.cards.length : 0} cards
                </>
              ) : (
                "no live publication row for today yet."
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadLive()} disabled={liveLoading}>
                Reload live data
              </Button>
              <Button variant="outline" onClick={() => void checkEdge()} disabled={edgeChecking}>
                Check edge function status
              </Button>
            </div>
            {edgeStatus && (
              <p className="text-sm text-muted-foreground">Edge function daily-content: {edgeStatus}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Edge function: {EDGE_URL} (deployed; this page never calls it with a secret and
              never triggers a dry run).
            </p>
          </CardContent>
        </Card>
      )}

      {liveAvailable && liveSettings && monitoring && (
        <Card>
          <CardHeader>
            <CardTitle>Monitoring — today&apos;s status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold">Schedule: </span>
              <Badge
                variant={monitoring.schedule.status === "missed" ? "destructive" : "default"}
              >
                {monitoring.schedule.status.toUpperCase()}
              </Badge>{" "}
              {monitoring.schedule.status === "ok" && monitoring.schedule.window === "open"
                ? "Window open — due 06:00 IST, grace until 06:30 IST."
                : monitoring.schedule.status === "ok"
                  ? "Published on time (by 06:30 IST)."
                  : monitoring.schedule.status === "late"
                    ? "Published late (after 06:30 IST)."
                    : "No publication by 06:30 IST — the day was missed; the heal tick is the recovery."}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Today&apos;s publication: </span>
              {monitoring.publication ? (
                <>
                  <Badge
                    variant={
                      monitoring.publication.status === "failed"
                        ? "destructive"
                        : monitoring.publication.status === "published"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {monitoring.publication.status}
                  </Badge>{" "}
                  {monitoring.publication.hadith_ref ?? "no hadith"}{" "}
                  {posterColumnsAvailable ? (
                    <>
                      · poster{" "}
                      <Badge variant={monitoring.publication.poster_qc_status === "passed" ? "default" : "secondary"}>
                        {monitoring.publication.poster_qc_status ?? "pending"}
                      </Badge>{" "}
                      {monitoring.publication.poster_url && (
                        <a
                          className="underline"
                          href={monitoring.publication.poster_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          view poster
                        </a>
                      )}
                    </>
                  ) : (
                    "· poster status unavailable (poster migration not applied yet)"
                  )}
                  {monitoring.publication.error && (
                    <span className="text-destructive"> · {monitoring.publication.error}</span>
                  )}
                </>
              ) : (
                "no publication row for today yet."
              )}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Push: </span>
              {monitoring.push.total} total · {monitoring.push.sent} sent ·{" "}
              {monitoring.push.failed} failed · {monitoring.push.retryable} retryable ·{" "}
              {monitoring.push.attempts_remaining} attempts remaining.
            </p>
            <div className="text-sm">
              <span className="font-semibold">Alerts: </span>
              {monitoring.alerts.length === 0 ? (
                "No active alerts."
              ) : (
                <ul className="mt-1 space-y-1">
                  {monitoring.alerts.map((a) => (
                    <li key={`${a.kolkata_date}|${a.reason}`}>
                      <Badge variant={a.level === "critical" ? "destructive" : "secondary"}>
                        {a.level}
                      </Badge>{" "}
                      {a.kolkata_date} — {a.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {monitoring.recent_failures.length > 0 && (
              <div className="text-sm">
                <span className="font-semibold">Recent failures: </span>
                <ul className="mt-1 space-y-1">
                  {monitoring.recent_failures.map((f) => (
                    <li key={`${f.kolkata_date}|${f.reason}`}>
                      {f.kolkata_date} — {f.status} — {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Last recorded activity:{" "}
              {monitoring.last_activity ? formatKolkata(monitoring.last_activity) : "—"}.
              (Newest recorded timestamp, not a tick heartbeat — no heartbeat is stored yet.)
            </p>
            <p className="text-xs text-muted-foreground">
              Read-only: this card never publishes, sends, or retries. A missed schedule is
              noticed here and in the heal-tick response; there is no email/webhook alert
              channel yet — that needs an owner decision (see the Phase 10 report).
            </p>
          </CardContent>
        </Card>
      )}

      {liveAvailable && liveSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Publishing mode (Mode A/B)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold">Current mode: </span>
              <Badge variant={isModeA ? "default" : "secondary"}>
                {isModeA ? "Mode A — automatic" : "Mode B — admin approval"}
              </Badge>{" "}
              {isModeA
                ? "AI recommendations are consumed without admin approval. All mandatory validations and Image QC stay on."
                : "Recommendations wait for admin approval before the planner consumes them."}
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={liveSettings.approval_required ?? true}
                  onCheckedChange={(v) => void updateSetting("approval_required", v)}
                  disabled={liveToggling || !modeColumnsPresent}
                />
                <span className="text-sm">
                  Admin approval required — Mode B{" "}
                  {liveSettings.approval_required === false ? "(off — Mode A)" : "(on)"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={liveSettings.website_auto_publish ?? true}
                  onCheckedChange={(v) => void updateSetting("website_auto_publish", v)}
                  disabled={liveToggling || !modeColumnsPresent}
                />
                <span className="text-sm">
                  Website auto-publish{" "}
                  {liveSettings.website_auto_publish === false ? "(paused)" : "(on)"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={liveSettings.push_enabled ?? true}
                  onCheckedChange={(v) => void updateSetting("push_enabled", v)}
                  disabled={liveToggling || !modeColumnsPresent}
                />
                <span className="text-sm">
                  Push enabled{" "}
                  {liveSettings.push_enabled === false
                    ? "(paused — the website still publishes, no push is sent)"
                    : "(on)"}
                </span>
              </div>
            </div>
            {liveFacebookMessage && (
              <p className="text-sm text-destructive">{liveFacebookMessage}</p>
            )}
            {!modeColumnsPresent && (
              <p className="text-sm text-muted-foreground">
                Mode A/B columns not present — the Mode A/B migration has not been applied yet.
                Switches are disabled until then.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Every change is audit-logged. The master Enabled toggle stays owner-SQL only — it
              is not on this card. A paused channel never blocks the others: pausing push does
              not pause the website, and a Facebook failure never rolls back a website
              publication.
            </p>
          </CardContent>
        </Card>
      )}

      {liveAvailable && (
        <Card>
          <CardHeader>
            <CardTitle>Live publication history</CardTitle>
          </CardHeader>
          <CardContent>
            {livePublications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No live publication rows yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {livePublications.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-2 items-center">
                    <span>{p.kolkata_date}</span>
                    <Badge
                      variant={
                        p.status === "failed"
                          ? "destructive"
                          : p.status === "published"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {p.status}
                    </Badge>
                    <span>{p.hadith_source_line ?? "no hadith"}</span>
                    <span>{Array.isArray(p.cards) ? p.cards.length : 0} cards</span>
                    <span>
                      sent {p.recipients_sent}/{p.recipients_total}, failed {p.recipients_failed}
                    </span>
                    {p.error && <span className="text-destructive">{p.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {liveAvailable && latestPush && (
        <Card>
          <CardHeader>
            <CardTitle>Live push preview (latest published day)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-semibold">Title:</span> {latestPush.title ?? ""}
            </p>
            <p>
              <span className="font-semibold">Body:</span> {latestPush.body ?? ""}
            </p>
            <p>
              <span className="font-semibold">Deep link:</span> {latestPush.deep_link ?? ""}
            </p>
            <p className="text-xs text-muted-foreground">Preview only — this page never sends pushes.</p>
          </CardContent>
        </Card>
      )}

      {liveAvailable && (
        <Card>
          <CardHeader>
            <CardTitle>Live failed jobs &amp; retry</CardTitle>
          </CardHeader>
          <CardContent>
            {liveDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No retryable or failed live deliveries.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {liveDeliveries.map((d) => (
                  <li key={d.id} className="flex flex-wrap gap-2 items-center">
                    <span>{pubDateById.get(d.publication_id) ?? "unknown date"}</span>
                    <span>{d.device_id ?? "no device"}</span>
                    <Badge variant="destructive">{d.status}</Badge>
                    <span>
                      attempts: {d.attempts}/{d.max_attempts}
                    </span>
                    {d.next_attempt_at && <span>next: {formatKolkata(d.next_attempt_at)}</span>}
                    {d.error && <span className="text-destructive">{d.error}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Production retries run through the 15-minute retry trigger after its separate
              approval — this page does not send retries.
            </p>
          </CardContent>
        </Card>
      )}

      {liveAvailable && (
        <Card>
          <CardHeader>
            <CardTitle>Facebook Page publication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-semibold">Page: </span>
                {liveSettings?.facebook_page_name ??
                  liveSettings?.facebook_page_id ??
                  "Not connected — G1 Page authorization pending."}
              </p>
              <p>
                <span className="font-semibold">Token health: </span>
                {liveSettings?.facebook_token_health
                  ? `${liveSettings.facebook_token_health}${liveSettings.facebook_token_checked_at ? ` (checked ${formatKolkata(liveSettings.facebook_token_checked_at)})` : ""}`
                  : "Unknown — G3 token pending."}
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={liveSettings?.facebook_auto_publish_enabled ?? false}
                  onCheckedChange={(v) => void updateSetting("facebook_auto_publish_enabled", v)}
                  disabled={liveToggling || !facebookColumnsPresent}
                />
                <span className="text-sm">
                  Auto-publish to Facebook {liveSettings?.facebook_auto_publish_enabled ? "(on)" : "(off)"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={liveSettings?.facebook_approval_required ?? true}
                  onCheckedChange={(v) => void updateSetting("facebook_approval_required", v)}
                  disabled={liveToggling || !facebookColumnsPresent}
                />
                <span className="text-sm">
                  Admin approval required — Mode B{" "}
                  {liveSettings?.facebook_approval_required === false ? "(off — Mode A)" : "(on)"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={liveSettings?.facebook_posting_enabled ?? true}
                  onCheckedChange={(v) => void updateSetting("facebook_posting_enabled", v)}
                  disabled={liveToggling || !facebookColumnsPresent}
                />
                <span className="text-sm">
                  Facebook posting enabled{" "}
                  {liveSettings?.facebook_posting_enabled === false ? "(paused)" : "(on)"}
                </span>
              </div>
              {liveFacebookMessage && (
                <p className="text-sm text-destructive">{liveFacebookMessage}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Switches are disabled until the Facebook migration adds the columns. Changes are
                audit-logged. Publishing format: portrait (Layout C). Caption is Bengali-first
                with the source line and the website link. The 2026 organic link-post restriction
                is UNVERIFIED — daily link posts are not finalized until tested on the real Page.
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm mb-2">Recent Facebook posts</p>
              {liveFacebookError ? (
                <p className="text-sm text-muted-foreground">{liveFacebookError}</p>
              ) : liveFacebook && liveFacebook.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Facebook posts yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(liveFacebook ?? []).map((f) => (
                    <li key={f.id} className="flex flex-wrap gap-2 items-center">
                      <span>{f.asset_id}</span>
                      <Badge
                        variant={
                          f.status === "posted"
                            ? "default"
                            : f.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {f.status}
                      </Badge>
                      <span>attempts: {f.attempt}</span>
                      {f.permalink_url && (
                        <a className="underline" href={f.permalink_url} target="_blank" rel="noreferrer">
                          View post
                        </a>
                      )}
                      {f.error_message && <span className="text-destructive">{f.error_message}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              This page never posts to Facebook and never approves a post. Posting runs only
              through the daily-content edge function (CRON-secret gated, Mode B approval
              required by default).
            </p>
          </CardContent>
        </Card>
      )}

      {liveAvailable && (
        <Card>
          <CardHeader>
            <CardTitle>Decided recommendation runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadDecided()} disabled={decidedLoading}>
                Reload decided runs
              </Button>
              <Button variant="outline" onClick={() => void regenerateToday()} disabled={regenerating}>
                Regenerate today&apos;s recommendation
              </Button>
            </div>
            {decidedError && <p className="text-sm text-destructive">{decidedError}</p>}
            {decidedRuns === null ? (
              <p className="text-sm text-muted-foreground">Decided runs could not be loaded.</p>
            ) : decidedRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decided runs yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {decidedRuns.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-2 items-center">
                    <span>{r.kolkata_date}</span>
                    <Badge variant={r.status === "approved" ? "default" : "destructive"}>
                      {r.status}
                    </Badge>
                    <span>reviewed {r.reviewed_at ? formatKolkata(r.reviewed_at) : "—"}</span>
                    {r.review_note && (
                      <span className="text-muted-foreground">{r.review_note}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Regenerate creates a fresh pending-review run for today; it does not change
              today&apos;s planned or published row. A published day cannot be regenerated.
            </p>
          </CardContent>
        </Card>
      )}

      <RecommendationReview />

      {!liveAvailable && (
        <p className="text-sm text-muted-foreground">
          {adminLoading
            ? "Checking admin session…"
            : liveError
              ? `Live data unavailable: ${liveError}. Showing local preview below.`
              : "Live data requires an admin Supabase session. Showing local preview below."}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Automation control (local preview)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={toggleEnabled} />
            <span>{enabled ? "Enabled (local flag only)" : "Paused"}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Target schedule: daily at 06:00 Asia/Kolkata. Next run (computed):{" "}
            <strong>{formatKolkata(nextRun)}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Pools: {hadiths.length} hadith rows, {contents.length} content records.
            {poolNote ? ` ${poolNote}` : ""}
          </p>
          <div className="flex gap-2">
            <Button onClick={preview} disabled={loading}>
              Generate preview
            </Button>
            <Button variant="outline" onClick={() => void loadPool()} disabled={loading}>
              Reload pools
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>
              Preview — {plan?.kolkataDate}
              {plan?.hadith ? (
                <Badge className="ml-2">Hadith selected</Badge>
              ) : (
                <Badge variant="destructive" className="ml-2">No hadith</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Eligible: {result.diagnostics.hadithEligible}/{result.diagnostics.hadithPool} hadiths,{" "}
              {result.diagnostics.contentEligible}/{result.diagnostics.contentPool} content records.
              Hadith cycle: {plan?.hadithCycle}, card cycle: {plan?.cardCycle}.
            </p>
            {plan?.hadithEmptyReason && (
              <p className="text-sm text-destructive">{plan.hadithEmptyReason}</p>
            )}
            {plan?.hadith && (
              <DailyHadith
                published={{
                  bengali: plan.hadith.record.bengali ?? "",
                  arabic: plan.hadith.record.arabic,
                  source: plan.hadith.sourceLine,
                  chapter: `Chapter ${plan.hadith.record.chapter_id}`,
                  canonicalLink: plan.hadith.canonicalLink,
                }}
              />
            )}
            {(() => {
              const assigned = plan ? assignBackgrounds(plan.cards) : [];
              const qc = plan
                ? checkOgCardBatch(
                    plan.cards,
                    assigned.map((a) => a.background.id),
                    CARD_BACKGROUNDS.length,
                  )
                : null;
              return (
                <>
                  {qc && (
                    <p className="text-xs text-muted-foreground">
                      Card QC: {qc.ok ? "PASS" : `FAIL — ${qc.errors.join("; ")}`}
                      {qc.warnings.length ? ` · Warnings: ${qc.warnings.join("; ")}` : ""}
                      {plan && plan.cards.length > CARD_BACKGROUNDS.length
                        ? ` · Catalog holds ${CARD_BACKGROUNDS.length} backgrounds for ${plan.cards.length} cards — generate one per new subject before live use.`
                        : ""}
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {assigned.map(({ card, background }) => (
                      <div key={card.recordRef} className="space-y-2">
                        <ExportableOgShareCard
                          card={card}
                          backgroundUrl={backgroundUrl(background)}
                          badgeLabel={badgeLabelForCard(card)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Background: {background.scene} · Alt: {card.altText} · Link: {card.canonicalLink}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            {plan?.push && (
              <div className="rounded-lg border p-4">
                <p className="font-semibold">Push notification preview</p>
                <p className="text-sm">Title: {plan.push.title}</p>
                <p className="text-sm">Body: {plan.push.body}</p>
                <p className="text-sm">Deep link: {plan.push.deepLink}</p>
                <p className="text-xs text-muted-foreground">
                  One per device per day — cap key: {plan.push.capKeyPrefix}:&lt;deviceId&gt;
                </p>
              </div>
            )}
            <Button onClick={savePlanned}>Save as planned (local only)</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Execution history (local)</CardTitle>
        </CardHeader>
        <CardContent>
          {publications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No plans saved yet. Production history lives in `daily_content_publications`.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {publications.map((p) => (
                <li key={p.kolkataDate} className="flex flex-wrap gap-2 items-center">
                  <span>{p.kolkataDate}</span>
                  <Badge variant={p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge>
                  <span>{p.hadithSourceLine ?? "no hadith"}</span>
                  <span>{p.cards.length} cards</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Failed jobs &amp; retry (local rows)</CardTitle>
        </CardHeader>
        <CardContent>
          {deliveries.filter(isFailedJob).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No failed jobs. Production delivery rows live in `daily_content_deliveries`;
              retry there re-attempts bounded sends (max 4 attempts: initial + 3 retries,
              5/15/45 min backoff).
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {deliveries.filter(isFailedJob).map((d) => (
                <li key={d.deviceId} className="flex flex-wrap gap-2 items-center">
                  <span>{d.deviceId}</span>
                  <Badge variant="destructive">{d.status}</Badge>
                  <span>attempts: {d.attempts}</span>
                  <span>{d.error ?? ""}</span>
                  {d.status === "retryable" && (
                    <Button size="sm" variant="outline" onClick={() => retry(d.deviceId)}>
                      Retry
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
