// Daily Content monitoring — schedule health, alert derivation, and the
// admin dashboard snapshot (Phase 10, 2026-11-17).
//
// CANONICAL SOURCE for the schedule assessment. The edge function
// (supabase/functions/daily-content/index.ts) carries a VERBATIM PORT of
// assessSchedule + the two constants below — Deno edge functions cannot
// import from src/lib (deploy bundles only the function directory), so
// the port is copied by hand. If the logic changes here, update the port
// too, and vice versa.
//
// Schedule (the runbook rule): the daily cron is due 06:00 Asia/Kolkata
// with a 30-minute grace period. A day is:
//   - "ok"     published at or before 06:30 IST, or the window is still
//              open (now < 06:30 IST — nothing to judge yet), or
//              published with no recorded published_at (cannot prove
//              lateness, so never call it late on missing data).
//   - "late"   published, but published_at is after 06:30 IST
//              (2026-11-16 shape: the schedule fired 6h39m late and the
//              row published at 12:39 IST).
//   - "missed" no published row and the grace period has passed
//              (2026-11-17 shape: the schedule missed entirely; the day
//              was recovered only by the authorized manual dispatch).
// IST is UTC+5:30 with no DST, so 06:00 IST is always 00:30 UTC and
// 06:30 IST is always 01:00 UTC — the comparison is done on instants,
// never on wall-clock fields, so it cannot be wrong in another timezone.

export const SCHEDULED_HOUR_IST = 6;
export const SCHEDULE_GRACE_MINUTES = 30;

export type ScheduleStatus = "ok" | "late" | "missed";

export interface ScheduleAssessment {
  status: ScheduleStatus;
  kolkata_date: string;
  checked_at: string;
  expected_at: string;
  grace_until: string;
  published_at: string | null;
  publication_status: string | null;
  window: "open" | "closed";
}

export type PublicationForSchedule = {
  status: string;
  published_at: string | null;
} | null;

export function assessSchedule(
  now: Date,
  kolkataDate: string,
  publication: PublicationForSchedule,
): ScheduleAssessment {
  const [y, m, d] = kolkataDate.split("-").map((p) => Number(p));
  const expectedMs = Date.UTC(y, m - 1, d, 0, 30); // 06:00 IST
  const graceMs = Date.UTC(y, m - 1, d, 1, 0); // 06:30 IST
  const base = {
    kolkata_date: kolkataDate,
    checked_at: now.toISOString(),
    expected_at: new Date(expectedMs).toISOString(),
    grace_until: new Date(graceMs).toISOString(),
    published_at: publication?.published_at ?? null,
    publication_status: publication?.status ?? null,
  };
  if (publication?.status === "published") {
    if (!publication.published_at) return { ...base, status: "ok", window: "closed" };
    return new Date(publication.published_at).getTime() > graceMs
      ? { ...base, status: "late", window: "closed" }
      : { ...base, status: "ok", window: "closed" };
  }
  return now.getTime() < graceMs
    ? { ...base, status: "ok", window: "open" }
    : { ...base, status: "missed", window: "closed" };
}

// ---- alerts ----

export type AlertLevel = "warn" | "critical";

export interface DailyAlert {
  level: AlertLevel;
  reason: string;
  kolkata_date: string;
  publication_id: string | null;
  first_seen: string;
}

/** Dedupe alerts by (kolkata_date, reason), keeping the first-seen. */
export function dedupeAlerts(alerts: readonly DailyAlert[]): DailyAlert[] {
  const seen = new Set<string>();
  const out: DailyAlert[] = [];
  for (const a of alerts) {
    const key = `${a.kolkata_date}|${a.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

export type PublicationForAlerts = {
  id: string;
  kolkata_date: string;
  status: string;
  poster_qc_status: string | null;
  poster_error: string | null;
  error: string | null;
  created_at: string;
};

export type DeliveryForAlerts = {
  publication_id: string;
  status: string;
  error: string | null;
  created_at: string;
};

/**
 * Derive the admin-visible alert list from existing rows only — no new
 * table, no new service. One alert per failure, never one per tick and
 * never one per device: failed deliveries sharing one (publication,
 * error) collapse into a single aggregated alert. A quarantined poster
 * is critical; a failed poster is a warning; a failed publication row
 * is critical. Sorted newest first.
 */
export function deriveAlerts(
  publications: readonly PublicationForAlerts[],
  deliveries: readonly DeliveryForAlerts[],
): DailyAlert[] {
  const alerts: DailyAlert[] = [];
  for (const p of publications) {
    if (p.status === "failed") {
      alerts.push({
        level: "critical",
        reason: `publication failed: ${p.error ?? "unknown"}`,
        kolkata_date: p.kolkata_date,
        publication_id: p.id,
        first_seen: p.created_at,
      });
    }
    if (typeof p.poster_error === "string" && p.poster_error.startsWith("quarantined:")) {
      alerts.push({
        level: "critical",
        reason: p.poster_error,
        kolkata_date: p.kolkata_date,
        publication_id: p.id,
        first_seen: p.created_at,
      });
    } else if (p.poster_qc_status === "failed") {
      alerts.push({
        level: "warn",
        reason: "poster failed; poster workflow retry needed",
        kolkata_date: p.kolkata_date,
        publication_id: p.id,
        first_seen: p.created_at,
      });
    }
  }
  const failedDeliveries = new Map<string, { count: number; firstSeen: string; error: string }>();
  for (const d of deliveries) {
    if (d.status !== "failed") continue;
    const key = `${d.publication_id}|${d.error ?? "unknown"}`;
    const prev = failedDeliveries.get(key);
    if (prev) {
      prev.count += 1;
      if (d.created_at < prev.firstSeen) prev.firstSeen = d.created_at;
    } else {
      failedDeliveries.set(key, { count: 1, firstSeen: d.created_at, error: d.error ?? "unknown" });
    }
  }
  const pubDate = new Map(publications.map((p) => [p.id, p.kolkata_date]));
  for (const [key, v] of failedDeliveries) {
    const publicationId = key.split("|")[0];
    alerts.push({
      level: "warn",
      reason: `push delivery failed for ${v.count} device${v.count === 1 ? "" : "s"}: ${v.error}`,
      kolkata_date: pubDate.get(publicationId) ?? "",
      publication_id: publicationId,
      first_seen: v.firstSeen,
    });
  }
  const deduped = dedupeAlerts(alerts);
  return deduped.sort((a, b) => (a.first_seen < b.first_seen ? 1 : a.first_seen > b.first_seen ? -1 : 0));
}

// ---- dashboard snapshot ----

export type DeliveryForSnapshot = {
  publication_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  error: string | null;
};

export type PublicationForSnapshot = PublicationForAlerts & {
  poster_url: string | null;
  hadith_ref: string | null;
  recipients_total: number;
  recipients_sent: number;
  recipients_failed: number;
  published_at: string | null;
};

export interface MonitoringSnapshot {
  kolkata_date: string;
  schedule: ScheduleAssessment;
  publication: {
    id: string;
    status: string;
    hadith_ref: string | null;
    poster_qc_status: string | null;
    poster_url: string | null;
    error: string | null;
  } | null;
  push: {
    total: number;
    sent: number;
    failed: number;
    retryable: number;
    attempts_remaining: number;
  };
  alerts: DailyAlert[];
  recent_failures: Array<{ kolkata_date: string; status: string; reason: string }>;
  last_activity: string | null;
}

/** Assemble everything the monitoring card needs from the rows the admin
 *  page already loads — no extra queries, no new service. */
export function buildMonitoringSnapshot(
  publications: readonly PublicationForSnapshot[],
  deliveries: readonly DeliveryForSnapshot[],
  now: Date,
): MonitoringSnapshot {
  const kolkataDate = kolkataDateString(now);
  const todayPub = publications.find((p) => p.kolkata_date === kolkataDate) ?? null;
  const schedule = assessSchedule(now, kolkataDate, todayPub);
  const todayDeliveries = todayPub ? deliveries.filter((d) => d.publication_id === todayPub.id) : [];
  let retryable = 0;
  let attemptsRemaining = 0;
  for (const d of todayDeliveries) {
    if (d.status !== "retryable") continue;
    const max = d.max_attempts ?? 4;
    if (d.attempts >= max) continue;
    retryable += 1;
    attemptsRemaining += max - d.attempts;
  }
  const recentFailures = publications
    .filter((p) => p.status === "failed" || p.poster_qc_status === "failed")
    .slice(0, 5)
    .map((p) => ({
      kolkata_date: p.kolkata_date,
      status: p.status,
      reason:
        p.status === "failed"
          ? p.error ?? "unknown"
          : p.poster_error ?? "poster failed",
    }));
  const activityTimes = [
    todayPub?.published_at ?? null,
    todayPub?.created_at ?? null,
    ...todayDeliveries.map((d) => d.created_at),
  ].filter((t): t is string => t !== null);
  return {
    kolkata_date: kolkataDate,
    schedule,
    publication: todayPub
      ? {
          id: todayPub.id,
          status: todayPub.status,
          hadith_ref: todayPub.hadith_ref,
          poster_qc_status: todayPub.poster_qc_status,
          poster_url: todayPub.poster_url,
          error: todayPub.error,
        }
      : null,
    push: {
      total: todayPub?.recipients_total ?? 0,
      sent: todayPub?.recipients_sent ?? 0,
      failed: todayPub?.recipients_failed ?? 0,
      retryable,
      attempts_remaining: attemptsRemaining,
    },
    alerts: deriveAlerts(publications, deliveries),
    recent_failures: recentFailures,
    last_activity: activityTimes.length ? activityTimes.sort().at(-1)! : null,
  };
}

function kolkataDateString(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
