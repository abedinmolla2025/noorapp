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
 * Daily Content admin — LOCAL PREVIEW MODE.
 * Plans the day from the real bundled dua pool + the public hadiths table
 * (when reachable), renders the exact previews, and stores plans locally.
 * This page NEVER publishes, schedules or sends anything: production
 * publication runs in the `daily-content` edge function after a separate
 * launch approval, and reads/writes the `daily_content_*` tables instead.
 */
export default function AdminDailyContent() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [poolNote, setPoolNote] = useState<string | null>(null);
  const [hadiths, setHadiths] = useState<HadithRecord[]>([]);
  const [contents, setContents] = useState<ContentRecord[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryAttempt[]>([]);

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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Daily Content Automation</h1>
        <Badge variant="secondary">Local preview mode — nothing is published or sent</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automation control</CardTitle>
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
