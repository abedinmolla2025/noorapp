// Shared service-to-service (internal) auth for Supabase edge functions.
// Phase 2 / S-3 (2026-11-10): the prayer-push path (Option A).
//
// A dedicated secret (PRAYER_PUSH_INTERNAL_SECRET, owner-created in the
// Dashboard — the agent never handles the value) authenticates
// send-prayer-notifications -> send-push. This is deliberately NOT the
// service-role key: a service-role JWT has no `sub`, so send-push's
// getClaims gate rejects it by design (401), and widening the
// service-role key into an internal auth mechanism was rejected
// (Option B). The dedicated secret is narrowly scoped (one caller,
// one device, draft web notifications only) and revocable on its own.
//
// Protocol (headers on the internal call):
//   X-Noor-Internal-Caller:    "send-prayer-notifications" (exact)
//   X-Noor-Timestamp:          epoch milliseconds at signing
//   X-Noor-Nonce:              crypto.randomUUID() per call
//   X-Noor-Signature:          lowercase hex HMAC-SHA256(secret,
//                              "<timestamp>.<nonce>.<notificationId>.<deviceId>")
// Rules enforced by decideInternalAuth / decideInternalScope:
//   - ANY X-Noor-* header present but the set incomplete -> 401, with
//     NO fall-through to the user-auth path (a half-signed request must
//     never be re-tried as a user call).
//   - Timestamp outside a 300 s window (past or future) -> 401.
//   - Nonce already claimed in internal_call_nonces -> 401 (replay).
//     The claim is the atomic PK insert in the receiver; this pure
//     function takes the already-claimed set as input.
//   - Bad signature (constant-time compare) -> 401.
//   - Missing/empty secret -> 500 (fail closed, never fall back).
//   - deviceId mandatory -> 400 when absent (a missing deviceId would
//     otherwise broadcast to all enabled web tokens).
//   - Notification must exist (404), be status='draft' (403),
//     target_platform='web' (403), and be <= 60 minutes old (403).
// Audit logging (receiver): one line per internal call with caller,
// notification id, device id, outcome — NEVER the secret, the
// signature, or a full subscription endpoint (endpoint_host only).
//
// The secret NAME is PRAYER_PUSH_INTERNAL_SECRET. No secret VALUE
// appears in this file, in any test, or in any log.

// --- NODE_TESTABLE_BEGIN ---
// Extracted verbatim by internal-auth.test.mjs (Node 24 type-strips;
// crypto.subtle is available in both Deno and Node).
export const INTERNAL_CALLER = "send-prayer-notifications";
export const INTERNAL_TIMESTAMP_WINDOW_MS = 300_000; // 300 s
export const INTERNAL_MAX_NOTIFICATION_AGE_MS = 60 * 60_000; // 60 min
export const INTERNAL_HEADER_CALLER = "x-noor-internal-caller";
export const INTERNAL_HEADER_TIMESTAMP = "x-noor-timestamp";
export const INTERNAL_HEADER_NONCE = "x-noor-nonce";
export const INTERNAL_HEADER_SIGNATURE = "x-noor-signature";

export type InternalAuthDecision =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: string; reason: string };

export type InternalScopeDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404; error: string };

/** Canonical signed string. Field order is part of the protocol. */
export function canonicalInternalString(fields: {
  timestamp: string;
  nonce: string;
  notificationId: string;
  deviceId: string;
}): string {
  return `${fields.timestamp}.${fields.nonce}.${fields.notificationId}.${fields.deviceId}`;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** HMAC-SHA256 over the canonical string. Returns lowercase hex. */
export async function signInternalCall(
  secret: string,
  fields: { timestamp: string; nonce: string; notificationId: string; deviceId: string },
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalInternalString(fields)),
  );
  return toHex(new Uint8Array(sig));
}

/** Constant-time hex comparison (length-mismatched inputs still walk the loop). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = fromHex(a);
  const bb = fromHex(b);
  if (!ab || !bb) return false;
  const n = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/**
 * Pure internal-auth decision (the DB nonce lookup is injected as
 * `claimedNonces`; the receiver claims the nonce with an atomic
 * insert AFTER this returns ok). `headers` keys are case-insensitive.
 */
export async function decideInternalAuth(opts: {
  headers: Record<string, string | null | undefined>;
  secret: string;
  nowMs: number;
  claimedNonces: ReadonlySet<string>;
  notificationId: string;
  deviceId: string;
}): Promise<InternalAuthDecision> {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers)) {
    if (typeof v === "string" && v !== "") h[k.toLowerCase()] = v;
  }
  const present = [
    INTERNAL_HEADER_CALLER,
    INTERNAL_HEADER_TIMESTAMP,
    INTERNAL_HEADER_NONCE,
    INTERNAL_HEADER_SIGNATURE,
  ].filter((k) => k in h);
  if (present.length > 0 && present.length < 4) {
    return { ok: false, status: 401, error: "Incomplete internal auth headers", reason: "partial_headers" };
  }
  if (present.length === 0) {
    return { ok: false, status: 401, error: "Missing internal auth headers", reason: "missing_headers" };
  }
  if (!opts.secret) {
    return { ok: false, status: 500, error: "PRAYER_PUSH_INTERNAL_SECRET is not configured", reason: "secret_missing" };
  }
  if (h[INTERNAL_HEADER_CALLER] !== INTERNAL_CALLER) {
    return { ok: false, status: 401, error: "Unknown internal caller", reason: "bad_caller" };
  }
  const ts = Number(h[INTERNAL_HEADER_TIMESTAMP]);
  if (!Number.isFinite(ts)) {
    return { ok: false, status: 401, error: "Invalid internal timestamp", reason: "bad_timestamp" };
  }
  if (Math.abs(opts.nowMs - ts) > INTERNAL_TIMESTAMP_WINDOW_MS) {
    return { ok: false, status: 401, error: "Internal timestamp outside window", reason: "timestamp_expired" };
  }
  const nonce = h[INTERNAL_HEADER_NONCE];
  if (opts.claimedNonces.has(nonce)) {
    return { ok: false, status: 401, error: "Nonce already used", reason: "replay" };
  }
  const expected = await signInternalCall(opts.secret, {
    timestamp: h[INTERNAL_HEADER_TIMESTAMP],
    nonce,
    notificationId: opts.notificationId,
    deviceId: opts.deviceId,
  });
  if (!timingSafeEqualHex(h[INTERNAL_HEADER_SIGNATURE], expected)) {
    return { ok: false, status: 401, error: "Invalid internal signature", reason: "bad_signature" };
  }
  return { ok: true };
}

/** Pure scope decision for an internal send. `createdAtMs` is the notification's created_at. */
export function decideInternalScope(opts: {
  deviceId: string | null | undefined;
  notification: { status?: unknown; target_platform?: unknown; created_at?: unknown } | null;
  nowMs: number;
}): InternalScopeDecision {
  if (!opts.deviceId || typeof opts.deviceId !== "string" || !opts.deviceId.trim()) {
    return { ok: false, status: 400, error: "deviceId is required for internal sends" };
  }
  if (!opts.notification) {
    return { ok: false, status: 404, error: "Notification not found" };
  }
  if (opts.notification.status !== "draft") {
    return { ok: false, status: 403, error: "Internal sends require a draft notification" };
  }
  if (opts.notification.target_platform !== "web") {
    return { ok: false, status: 403, error: "Internal sends are web-only" };
  }
  const created = Date.parse(String(opts.notification.created_at ?? ""));
  if (Number.isFinite(created) && opts.nowMs - created > INTERNAL_MAX_NOTIFICATION_AGE_MS) {
    return { ok: false, status: 403, error: "Notification is too old for internal send" };
  }
  return { ok: true };
}
// --- NODE_TESTABLE_END ---
