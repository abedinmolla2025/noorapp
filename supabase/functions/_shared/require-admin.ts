// P0-1 remediation: shared admin auth gate for Supabase edge functions.
//
// Trust model:
//   1. The caller MUST present a valid Supabase Auth JWT in the
//      `Authorization: Bearer <jwt>` header.
//   2. The JWT is validated with `auth.getClaims` on an *anon* client
//      (never the service-role client) — so a forged/garbage token
//      cannot escalate, and `getClaims` requires the token to be a
//      genuine project-issued JWT (RLS-style validation).
//   3. The resolved `sub` is then checked against the `is_admin`
//      Postgres RPC — the single source of truth for admin status.
//   4. Only AFTER both checks pass may the handler create a
//      service-role client.
//
// Failure semantics (fail closed):
//   - missing / malformed Authorization header -> 401
//   - invalid, expired or forged JWT (getClaims fails) -> 401
//   - valid JWT but user is not an admin (or the is_admin RPC fails) -> 403
//   - server misconfiguration (missing SUPABASE_URL / SUPABASE_ANON_KEY,
//     or missing third-party secret for AI enrichment) -> 500
//
// Usage in a handler:
//
//   import { requireAdmin, httpErrorResponse } from "../_shared/require-admin.ts";
//
//   Deno.serve(async (req) => {
//     if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
//     try {
//       await requireAdmin(req); // throws HttpError(401|403|500) on failure
//       const supabase = createClient(SUPABASE_URL, SERVICE_ROLE); // safe now
//       ...
//     } catch (e) {
//       return httpErrorResponse(e, corsHeaders);
//     }
//   });
//
// Pattern copied from supabase/functions/send-push/index.ts, which already
// gates push dispatch behind exactly this sequence.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AuthDecision =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

export type ClaimsLike = { sub?: unknown } | null | undefined;

// --- NODE_TESTABLE_BEGIN ---
// The block below is extracted verbatim by supabase/functions/_shared/require-admin.test.mjs
// so node can exercise the exact production logic without Deno.
/**
 * Pure decision logic for the admin gate. Kept free of Deno / network /
 * env access so it can be unit-tested in plain Node (see require-admin.test.mjs).
 */
export function decideAuth(opts: {
  authHeader: string | null;
  claims: ClaimsLike;
  claimsError: unknown;
  isAdmin: unknown;
  isAdminError: unknown;
}): AuthDecision {
  const h = opts.authHeader ?? "";
  if (!h.startsWith("Bearer ") || h.length <= "Bearer ".length) {
    return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  }
  if (
    opts.claimsError ||
    typeof opts.claims?.sub !== "string" ||
    !opts.claims.sub
  ) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  if (opts.isAdminError || opts.isAdmin !== true) {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return { ok: true, userId: opts.claims.sub };
}
// --- NODE_TESTABLE_END ---

/**
 * Require an authenticated admin for this request.
 *
 * Returns the admin's user id. Throws HttpError(401) on missing/invalid
 * auth, HttpError(403) when the JWT is valid but the user is not an admin,
 * HttpError(500) when the function is misconfigured (missing env).
 */
export async function requireAdmin(req: Request): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new HttpError(500, "Server auth configuration missing");
  }

  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? null;

  // Early exit on a missing/malformed header only (same direct check as
  // send-push). NOTE: do NOT route this through decideAuth: an early
  // decideAuth call with skipped claims always reports 401, which would
  // reject even valid admins (bug in d06340a, found by handler-level tests
  // 2026-11-07 — decideAuth was only ever unit-tested, never wired).
  // The full decideAuth verdict runs below, after getClaims + is_admin.
  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    authHeader.length <= "Bearer ".length
  ) {
    throw new HttpError(401, "Missing or malformed Authorization header");
  }

  const header = authHeader as string;
  const jwt = header.slice("Bearer ".length);
  const authed = createClient(url, anonKey, {
    global: { headers: { Authorization: header } },
  });

  const { data: claimsData, error: claimsErr } = await authed.auth.getClaims(jwt);
  if (claimsErr) {
    throw new HttpError(401, "Invalid or expired token");
  }
  const userId =
    typeof claimsData?.claims?.sub === "string" ? (claimsData.claims.sub as string) : "";

  const { data: isAdmin, error: isAdminErr } = await authed.rpc("is_admin", {
    _user_id: userId,
  });

  const decision = decideAuth({
    authHeader: header,
    claims: { sub: userId },
    claimsError: null,
    isAdmin,
    isAdminError: isAdminErr,
  });
  if (!decision.ok) {
    throw new HttpError(decision.status, decision.error);
  }
  return decision.userId;
}

/**
 * Convert an HttpError (or any unexpected error) into a JSON error Response.
 * Unexpected errors always map to 500 (fail closed, never leak details).
 */
export function httpErrorResponse(
  err: unknown,
  corsHeaders: Record<string, string> = {},
): Response {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Unknown error";
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Fail-closed secret read for request-time use. Throws HttpError(500) when
 * the env var is missing or empty — callers must use it inside the request
 * handler (never read secrets at module scope with `!`).
 */
export function requireSecret(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) {
    throw new HttpError(500, `${name} is not configured`);
  }
  return v;
}
