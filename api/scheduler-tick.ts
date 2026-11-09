// Vercel Cron heartbeat — calls the scheduler-dispatch Supabase Edge Function
// every minute with the dedicated SCHEDULER_CRON_SECRET. The Edge Function
// selects due schedules, picks content, generates Bengali copy and sends pushes.
//
// PHASE 2 (2026-11-10) — dual-mode gate compatibility (verified, no
// functional change needed here): this route already forwards the
// dedicated secret as `Authorization: Bearer <SCHEDULER_CRON_SECRET>`
// and sends a bulk body ONLY (dispatch_at, never schedule_id), which is
// exactly what the gated bulk path accepts. It does NOT send a
// service-role token (the gated bulk path rejects those with 401) and
// it never sends preview/test bodies. The same secret value must also
// exist as the Supabase edge secret SCHEDULER_CRON_SECRET and in
// vault as 'scheduler_cron_secret' (pg_cron path, migration
// 20261110_001_scheduler_cron_secret.sql). Deploy together with the
// gated Edge Function (see PHASE2-DEPLOYMENT-DEPENDENCY-MAP.md).

const EDGE_URL =
  "https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/scheduler-dispatch";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req: any) {
  const secret = process.env.SCHEDULER_CRON_SECRET || "";
  if (!secret) {
    return json(500, { ok: false, error: "Scheduler authorization is unavailable." });
  }

  const headers = req?.headers;
  const authorization = typeof headers?.get === "function"
    ? headers.get("authorization")
    : headers?.authorization ?? headers?.Authorization;
  if (authorization !== `Bearer ${secret}`) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dispatch_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(60_000),
    });
    // Do not relay downstream error bodies: they may contain provider or
    // server-side details. The status is sufficient for the cron monitor.
    return json(200, { ok: res.ok, status: res.status });
  } catch {
    return json(502, { ok: false, error: "Scheduler dispatch failed." });
  }
}
