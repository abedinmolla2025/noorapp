// P0-2 remediation: pure auth-gate decision logic for scheduler-dispatch.
//
// Kept free of Deno / network / env access so it can be unit-tested in plain
// Node (see authz.test.mjs). The Deno handler (index.ts) wires this module to
// real JWT verification (getClaims + is_admin RPC) and request-time env reads.
//
// Trust model:
//   1. Vercel cron / server automation: `Authorization: Bearer <secret>`
//      where <secret> timing-safe-equals SCHEDULER_CRON_SECRET. May run bulk
//      dispatch AND single { schedule_id } dispatch.
//   2. Admin panel test/preview (AdminSchedulers.tsx invokes with
//      { schedule_id } under the admin's session JWT): a valid Supabase Auth
//      JWT whose sub passes the is_admin RPC (same getClaims+is_admin pattern
//      as send-push). May run ONLY single { schedule_id } dispatch — never
//      the bulk path (least privilege: the admin UI never bulk-dispatches).
//
// Failure semantics (fail closed):
//   - non-POST (other than CORS preflight, handled by the caller) -> 405
//   - missing/empty SCHEDULER_CRON_SECRET -> the secret path can NEVER match
//     (an empty secret is not equal to anything, not even an empty token)
//   - missing Authorization header -> 401
//   - wrong secret + invalid/expired JWT -> 401
//   - valid JWT, not an admin -> 403
//   - valid admin JWT on the bulk path -> 403 (bulk needs the cron secret)
//   - malformed JSON body -> 400 (never dispatches)

export type AuthKind = "cron-secret" | "admin-jwt";

export type AdminVerdict = "admin" | "not-admin" | "invalid";

export type AuthzResult =
  | { ok: true; kind: AuthKind }
  | { ok: false; status: 401 | 403 | 405; reason: string };

export type BodyParseResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false };

/**
 * Constant-time string comparison. Never early-exits on content; length
 * mismatch is folded in so callers cannot branch on it either.
 */
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

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = /^bearer\s+(.+?)\s*$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1].trim();
  return token ? token : null;
}

/**
 * Parse a request body. Empty body -> {}. Malformed JSON -> { ok: false }.
 * A malformed body must never reach dispatch (caller returns 400).
 */
export function parseJsonBody(text: string): BodyParseResult {
  const t = (text ?? "").trim();
  if (!t) return { ok: true, body: {} };
  try {
    const parsed: unknown = JSON.parse(t);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, body: parsed as Record<string, unknown> };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Pull a non-empty string schedule_id out of a parsed body, else null. */
export function extractScheduleId(body: Record<string, unknown>): string | null {
  const v = body["schedule_id"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export interface AuthorizeOpts {
  method: string;
  authHeader: string | null | undefined;
  /** "" when not configured: fail closed, the secret path can never match. */
  cronSecret: string;
  /** true when the body carries no schedule_id (bulk due-schedule dispatch). */
  wantsBulk: boolean;
  verifyAdminJwt: (token: string) => Promise<AdminVerdict>;
}

/**
 * Decide whether this request may dispatch. Pure apart from the injected
 * async admin-JWT verifier (mocked in tests, real getClaims+is_admin in
 * the Deno handler).
 */
export async function authorizeDispatch(opts: AuthorizeOpts): Promise<AuthzResult> {
  if (opts.method !== "POST") {
    return { ok: false, status: 405, reason: "method-not-allowed" };
  }

  const token = extractBearerToken(opts.authHeader);
  const secret = (opts.cronSecret ?? "").trim();

  // Path 1: shared cron secret. Secret must be non-empty or it never matches
  // (fail closed when the env var is missing).
  if (secret && token && timingSafeEqual(token, secret)) {
    return { ok: true, kind: "cron-secret" };
  }

  // Path 2: admin JWT (test/preview from the admin panel).
  if (!token) {
    return { ok: false, status: 401, reason: "missing-credentials" };
  }
  const verdict = await opts.verifyAdminJwt(token);
  if (verdict === "invalid") {
    return { ok: false, status: 401, reason: "invalid-token" };
  }
  if (verdict === "not-admin") {
    return { ok: false, status: 403, reason: "not-admin" };
  }
  if (opts.wantsBulk) {
    // Authenticated admins may only fire a single schedule (the only path
    // the admin UI uses). Bulk dispatch requires the cron secret.
    return { ok: false, status: 403, reason: "bulk-requires-cron-secret" };
  }
  return { ok: true, kind: "admin-jwt" };
}
