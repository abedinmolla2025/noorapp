// Daily Content trigger — Vercel Cron heartbeat for the `daily-content`
// Supabase Edge Function. Mirrors api/scheduler-tick.ts exactly:
//  - Bearer-authenticated with its own secret (DAILY_CONTENT_CRON_SECRET).
//  - Forwards to the edge function; relays only the downstream STATUS, never
//    downstream bodies (they may contain provider or server-side details).
//  - This endpoint plans/sends NOTHING itself. With ?dry_run=1 it asks the
//    edge function for a dry-run plan (no writes, no sends).
//  - NO cron schedule is registered for this endpoint yet (see
//    docs/daily-content/PRODUCTION-READINESS.md). Registering the 06:00
//    Asia/Kolkata schedule is a separately approved launch step.

const EDGE_URL =
  "https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/daily-content";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type CronRequest = {
  url?: string;
  headers?:
    | { get: (name: string) => string | null }
    | { authorization?: string; Authorization?: string };
};

export default async function handler(req: CronRequest) {
  const secret = process.env.DAILY_CONTENT_CRON_SECRET || "";
  if (!secret) {
    return json(500, { ok: false, error: "Daily content authorization is unavailable." });
  }

  const headers = req?.headers;
  const authorization = typeof headers?.get === "function"
    ? headers.get("authorization")
    : headers?.authorization ?? headers?.Authorization;
  if (authorization !== `Bearer ${secret}`) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const url = new URL(req?.url ?? "http://localhost/api/daily-content-run");
  const dryRun = url.searchParams.get("dry_run") === "1";

  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dry_run: dryRun, dispatch_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(60_000),
    });
    return json(200, { ok: res.ok, status: res.status, dry_run: dryRun });
  } catch {
    return json(502, { ok: false, error: "Daily content dispatch failed." });
  }
}
