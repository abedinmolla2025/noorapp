// Vercel Cron heartbeat — calls the scheduler-dispatch Supabase Edge Function
// every minute with the shared SCHEDULER_CRON_SECRET. The Edge Function selects
// due schedules, picks content, generates Bengali copy and sends pushes.
//
// P0-2 remediation: this route is gated on the shared secret. Vercel Cron
// hits it as GET on the path configured in vercel.json `crons`:
//   /api/scheduler-tick?key=<SCHEDULER_CRON_SECRET>
// The same secret is also accepted in a JSON body `{ "key": ... }` or as
// `Authorization: Bearer <secret>` (this also covers Vercel's native
// CRON_SECRET header pattern). Anything else -> 401. The secret is never
// logged. Only GET is allowed (Vercel Cron issues GET).

const EDGE_URL =
  "https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/scheduler-dispatch";

/** Constant-time string comparison (no early exit on content). */
export function timingSafeEqual(a: string, b: string): boolean {
  const aLen = a.length;
  const bLen = b.length;
  const len = Math.max(aLen, bLen);
  let diff = aLen ^ bLen;
  for (let i = 0; i < len; i++) {
    const ac = i < aLen ? a.charCodeAt(i) : 0;
    const bc = i < bLen ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

export type TickDecision =
  | { ok: true }
  | { ok: false; status: 401 | 405 | 500; reason: string };

/**
 * Pure gate decision for the tick route. Kept free of env/fetch so it can be
 * unit-tested in plain Node (see scheduler-tick.test.mjs).
 */
export function decideTickAuth(opts: {
  method: string;
  queryKey: string | null;
  bodyKey: string | null;
  authHeader: string | null;
  secret: string;
}): TickDecision {
  if (opts.method !== "GET") {
    return { ok: false, status: 405, reason: "method-not-allowed" };
  }
  const secret = (opts.secret ?? "").trim();
  if (!secret) {
    // Fail closed: without the shared secret this route cannot authenticate
    // to the edge function, so it must not run at all.
    return { ok: false, status: 500, reason: "server-misconfigured" };
  }
  const bearer = /^bearer\s+(.+?)\s*$/i.exec(opts.authHeader ?? "");
  const presented =
    (opts.queryKey ?? "").trim() ||
    (opts.bodyKey ?? "").trim() ||
    (bearer ? bearer[1].trim() : "");
  if (!presented || !timingSafeEqual(presented, secret)) {
    return { ok: false, status: 401, reason: "bad-or-missing-key" };
  }
  return { ok: true };
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request) {
  let queryKey: string | null = null;
  let bodyKey: string | null = null;
  try {
    queryKey = new URL(req.url).searchParams.get("key");
  } catch {
    queryKey = null;
  }
  if (req.method === "GET") {
    // GET bodies are unusual; still honor one if a caller sends it.
    try {
      const text = await req.text();
      if (text.trim()) {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          const k = (parsed as Record<string, unknown>).key;
          if (typeof k === "string") bodyKey = k;
        }
      }
    } catch {
      // Ignore body parse errors on the gate path; a missing key -> 401.
    }
  }

  const decision = decideTickAuth({
    method: req.method,
    queryKey,
    bodyKey,
    authHeader: req.headers.get("authorization"),
    secret: process.env.SCHEDULER_CRON_SECRET || "",
  });

  if (!decision.ok) {
    // Structured deny log: decision metadata only — never the key.
    console.warn(
      "[scheduler-tick] denied",
      JSON.stringify({
        status: decision.status,
        reason: decision.reason,
        method: req.method,
        keyPresent: !!(queryKey || bodyKey || req.headers.get("authorization")),
      })
    );
    const message =
      decision.status === 405
        ? "Method not allowed"
        : decision.status === 500
          ? "Server configuration error"
          : "Unauthorized";
    return json(decision.status, { ok: false, error: message });
  }

  const secret = (process.env.SCHEDULER_CRON_SECRET || "").trim();

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
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return json(200, { ok: res.ok, status: res.status, body: data });
  } catch (e) {
    return json(502, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
