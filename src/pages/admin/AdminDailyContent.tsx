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
 */

// Deployed edge function (mission state: ACTIVE, verify_jwt=false).
const EDGE_URL = "https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/daily-content";

interface LiveSettings {
  enabled: boolean;
  updated_at: string;
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
        .select("enabled, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (sErr) throw sErr;
      const { data: p, error: pErr } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("daily_content_publications" as any)
        .select("id, kolkata_date, status, hadith_ref, hadith_source_line, cards, push, recipients_total, recipients_sent, recipients_failed, error, created_at, published_at")
        .order("kolkata_date", { ascending: false })
        .limit(30);
      if (pErr) throw pErr;
      const { data: d, error: dErr } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("daily_content_deliveries" as any)
        .select("id, publication_id, device_id, platform, status, attempts, max_attempts, error, next_attempt_at, created_at")
        .in("status", ["retryable", "failed"])
        .order("next_attempt_at", { ascending: true })
        .limit(50);
      if (dErr) throw dErr;
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

  useEffect(() => {
    if (!adminLoading && isAdmin) void loadLive();
  }, [adminLoading, isAdmin, loadLive]);

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
  const latestPublished = livePublications.find((p) => p.status === "published");
  const latestPush = latestPublished?.push ?? null;
  const pubDateById = new Map(livePublications.map((p) => [p.id, p.kolkata_date]));

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
