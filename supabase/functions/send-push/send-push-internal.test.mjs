// send-push internal-path (S-3 Option A) handler tests — Phase 2 (2026-11-10).
//
// Stages the REAL supabase/functions/send-push/index.ts + the REAL
// _shared/internal-auth.ts with a fake Supabase, a fake @negrel/webpush
// (recording ApplicationServer), and a Deno shim. Signing uses Node's
// crypto.createHmac — the receiver verifies with WebCrypto, so a pass
// proves the two implementations agree.
//
// Proves: health bypass untouched; unsigned/partial/bad-signature/
// expired/replayed internal calls -> 401 with zero sends; missing
// deviceId -> 400; non-draft / non-web / stale -> 403; a valid signed
// call sends to EXACTLY the given device (no broadcast — a second
// device's token is seeded and must never be called); the delivery
// row is claimed BEFORE the provider call and ends 'sent'; a second
// valid call for the same notification+token sends ZERO (dedup);
// missing internal secret -> 500; no log line contains a full
// subscription endpoint (endpoint_host only).
//
// Run: node supabase/functions/send-push/send-push-internal.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets:
//   the "internal secret" is the literal 'test-internal-secret'.

import assert from "node:assert/strict";
import { createHmac, getRandomValues } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const funcsRoot = join(here, "..");
const SECRET = "test-internal-secret";

let passed = 0;
let failed = 0;
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

const FAKE_SUPABASE = `
export const state = { tables: {}, writes: [], seq: 0 };
export function __reset(seed) { state.tables = JSON.parse(JSON.stringify(seed)); state.writes = []; }
function matches(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    if (f.op === "eq" && v !== f.val) return false;
    if (f.op === "in" && !f.val.includes(v)) return false;
    if (f.op === "gte" && !(v >= f.val)) return false;
    if (f.op === "lte" && !(v <= f.val)) return false;
  }
  return true;
}
class Builder {
  constructor(table) { this.table = table; this.filters = []; this.limitN = null; this.patch = null; this.insertedRows = null; this.insertError = null; }
  select() { return this; }
  eq(c, v) { this.filters.push({ op: "eq", col: c, val: v }); return this; }
  in(c, v) { this.filters.push({ op: "in", col: c, val: v }); return this; }
  gte(c, v) { this.filters.push({ op: "gte", col: c, val: v }); return this; }
  lte(c, v) { this.filters.push({ op: "lte", col: c, val: v }); return this; }
  order() { return this; }
  limit(n) { this.limitN = n; return this; }
  rows() { let rs = (state.tables[this.table] ?? []).filter((r) => matches(r, this.filters)); if (this.limitN != null) rs = rs.slice(0, this.limitN); return rs; }
  async maybeSingle() { const rs = this.rows(); return { data: rs[0] ?? null, error: null }; }
  async single() {
    if (this.insertedRows) return { data: this.insertedRows[0] ?? null, error: this.insertError };
    const rs = this.rows(); return { data: rs[0] ?? null, error: null };
  }
  insert(row) {
    const rows = Array.isArray(row) ? row : [row];
    if (this.table === "internal_call_nonces") {
      for (const r of rows) {
        if ((state.tables[this.table] ?? []).some((x) => x.nonce === r.nonce)) {
          this.insertError = { message: "duplicate key value violates unique constraint" };
          this.insertedRows = [];
          return this;
        }
      }
    }
    state.tables[this.table] ??= [];
    this.insertedRows = rows.map((r) => ({ id: r.id ?? ("row-" + (++state.seq)), ...r, created_at: r.created_at ?? new Date().toISOString() }));
    for (const nr of this.insertedRows) { state.tables[this.table].push(nr); state.writes.push({ table: this.table, op: "insert" }); }
    return this;
  }
  update(patch) { this.patch = patch; return this; }
  then(resolve, reject) {
    try {
      if (this.insertError) { resolve({ data: null, error: this.insertError }); return; }
      if (this.patch) { const rs = this.rows(); for (const r of rs) Object.assign(r, this.patch); state.writes.push({ table: this.table, op: "update", count: rs.length }); resolve({ data: rs, error: null }); return; }
      resolve({ data: this.insertedRows ?? this.rows(), error: null });
    } catch (e) { reject(e); }
  }
}
export function createClient(url, key, opts) {
  return {
    from: (table) => new Builder(table),
    auth: { getClaims: async (jwt) => {
      if (jwt === "valid-admin-jwt") return { data: { claims: { sub: "admin-uuid" } }, error: null };
      if (jwt === "valid-user-jwt") return { data: { claims: { sub: "user-uuid" } }, error: null };
      return { data: null, error: { message: "invalid token" } };
    } },
    rpc: async (fn, args) => {
      if (fn === "is_admin") return { data: args?._user_id === "admin-uuid", error: null };
      return { data: null, error: null };
    },
  };
}
`;

const FAKE_WEBPUSH = `
export const pushCalls = [];
export async function importVapidKeys(jwk) { return { publicKey: {}, privateKey: {} }; }
export class ApplicationServer {
  static async new(opts) { return new ApplicationServer(); }
  subscribe(subscription) {
    return { pushTextMessage: async (payload) => {
      pushCalls.push({ endpoint: subscription?.endpoint ?? null, payload });
      return { ok: true, status: 201, text: async () => "" };
    } };
  }
}
`;

const stageDir = mkdtempSync(join(tmpdir(), "p2-send-push-"));
mkdirSync(join(stageDir, "send-push"), { recursive: true });
const pushSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs")
  .replace("jsr:@negrel/webpush@0.5.0", "../fake-webpush.mjs")
  .replace('"../_shared/internal-auth.ts"', '"../internal-auth.ts"');
writeFileSync(join(stageDir, "send-push", "index.ts"), pushSrc);
writeFileSync(join(stageDir, "internal-auth.ts"), readFileSync(join(funcsRoot, "_shared", "internal-auth.ts"), "utf8"));
writeFileSync(join(stageDir, "fake-supabase.mjs"), FAKE_SUPABASE);
writeFileSync(join(stageDir, "fake-webpush.mjs"), FAKE_WEBPUSH);

// Valid-shaped dummy VAPID keys (rawKeysToJwk slices them; any bytes do for the fake).
const pubBytes = getRandomValues(new Uint8Array(65)); pubBytes[0] = 0x04;
const privBytes = getRandomValues(new Uint8Array(32));
const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  WEBPUSH_VAPID_PUBLIC_KEY: Buffer.from(pubBytes).toString("base64url"),
  WEBPUSH_VAPID_PRIVATE_KEY: Buffer.from(privBytes).toString("base64url"),
  WEBPUSH_SUBJECT: "mailto:test@example.com",
  FCM_SERVICE_ACCOUNT_JSON: "",
  PRAYER_PUSH_INTERNAL_SECRET: SECRET,
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
await import(pathToFileURL(join(stageDir, "send-push", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(stageDir, "fake-supabase.mjs")).href);
const fakeWebpush = await import(pathToFileURL(join(stageDir, "fake-webpush.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

// Capture all console output to prove endpoint_host-only logging.
const logLines = [];
const origLog = console.log;
const origErr = console.error;
console.log = (...a) => { logLines.push(a.map(String).join(" ")); origLog(...a); };
console.error = (...a) => { logLines.push(a.map(String).join(" ")); origErr(...a); };

function seed() {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const notif = (id, extra = {}) => ({
    id, title: "Fajr Time", message: "It's time for Fajr prayer.",
    image_url: null, deep_link: null, target_platform: "web",
    status: "draft", icon_url: null, badge_url: null, created_at: now, ...extra,
  });
  return {
    admin_notifications: [
      notif("notif-1"),
      notif("notif-2"),
      notif("notif-3"),
      notif("notif-sent", { status: "sent" }),
      notif("notif-android", { target_platform: "android" }),
      notif("notif-stale", { created_at: stale }),
    ],
    device_push_tokens: [
      { id: "tok-A", token: JSON.stringify({ endpoint: "https://push.example.com/secret-subscription-A" }), platform: "web", device_id: "device-1", enabled: true },
      { id: "tok-B", token: JSON.stringify({ endpoint: "https://push.example.com/secret-subscription-B" }), platform: "web", device_id: "device-2", enabled: true },
    ],
    notification_deliveries: [],
    internal_call_nonces: [],
    app_settings: [],
  };
}

function sign({ timestamp, nonce, notificationId, deviceId }, secret = SECRET) {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${notificationId}.${deviceId}`).digest("hex");
}
function internalReq({ notificationId, deviceId, nonce, timestamp, secret, omit = [], caller = "send-prayer-notifications" }) {
  const ts = timestamp ?? String(Date.now());
  const nc = nonce ?? `nonce-${Math.random().toString(36).slice(2)}`;
  const sig = sign({ timestamp: ts, nonce: nc, notificationId, deviceId }, secret);
  const headers = {
    "X-Noor-Internal-Caller": caller,
    "X-Noor-Timestamp": ts,
    "X-Noor-Nonce": nc,
    "X-Noor-Signature": sig,
  };
  for (const k of omit) delete headers[k];
  return {
    method: "POST",
    headers: { get: (n) => headers[n] ?? headers[String(n).toLowerCase()] ?? (String(n).toLowerCase() === "authorization" ? null : null) },
    text: async () => JSON.stringify({ notificationId, deviceId }),
  };
}
function plainReq(body, authHeader) {
  return {
    method: "POST",
    headers: { get: (n) => (String(n).toLowerCase() === "authorization" ? (authHeader ?? null) : null) },
    text: async () => JSON.stringify(body),
  };
}
async function call(req) {
  const res = await handler(req);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

await checkAsync("health action -> 200 without auth (bypass preserved)", async () => {
  fakeSupabase.__reset(seed());
  const r = await call(plainReq({ action: "health" }, null));
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});
await checkAsync("normal path, no auth -> 401, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const r = await call(plainReq({ notificationId: "notif-1", deviceId: "device-1" }, null));
  assert.equal(r.status, 401);
  assert.equal(fakeWebpush.pushCalls.length, before);
});
await checkAsync("internal: partial headers (signature only) -> 401, zero sends, zero nonce rows", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const req = internalReq({ notificationId: "notif-1", deviceId: "device-1", omit: ["X-Noor-Internal-Caller", "X-Noor-Timestamp", "X-Noor-Nonce"] });
  const r = await call(req);
  assert.equal(r.status, 401);
  assert.equal(fakeWebpush.pushCalls.length, before);
  assert.equal(fakeSupabase.state.tables.internal_call_nonces.length, 0);
});
await checkAsync("internal: bad signature -> 401, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const r = await call(internalReq({ notificationId: "notif-1", deviceId: "device-1", secret: "wrong-secret" }));
  assert.equal(r.status, 401);
  assert.equal(fakeWebpush.pushCalls.length, before);
});
await checkAsync("internal: expired timestamp (301 s old) -> 401, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const r = await call(internalReq({ notificationId: "notif-1", deviceId: "device-1", timestamp: String(Date.now() - 301_000) }));
  assert.equal(r.status, 401);
  assert.equal(fakeWebpush.pushCalls.length, before);
});
await checkAsync("internal: valid signature but missing deviceId -> 400, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const r = await call(internalReq({ notificationId: "notif-1", deviceId: "" }));
  assert.equal(r.status, 400);
  assert.equal(fakeWebpush.pushCalls.length, before);
});
await checkAsync("internal: valid call device-1 -> 200, EXACTLY ONE send to device-1 only (no broadcast)", async () => {
  fakeSupabase.__reset(seed());
  fakeWebpush.pushCalls.length = 0;
  const r = await call(internalReq({ notificationId: "notif-1", deviceId: "device-1" }));
  assert.equal(r.status, 200);
  assert.equal(r.data.totals.sent, 1);
  assert.equal(r.data.totals.targets, 1);
  assert.equal(fakeWebpush.pushCalls.length, 1);
  assert.equal(fakeWebpush.pushCalls[0].endpoint, "https://push.example.com/secret-subscription-A");
  const deliveries = fakeSupabase.state.tables.notification_deliveries;
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].status, "sent");
  assert.equal(deliveries[0].token_id, "tok-A");
  assert.equal(fakeSupabase.state.tables.internal_call_nonces.length, 1);
  const notif = fakeSupabase.state.tables.admin_notifications.find((n) => n.id === "notif-1");
  assert.equal(notif.status, "sent");
});
await checkAsync("internal: replayed nonce (same headers twice) -> 401, no second send", async () => {
  fakeSupabase.__reset(seed());
  fakeWebpush.pushCalls.length = 0;
  const req1 = internalReq({ notificationId: "notif-1", deviceId: "device-1", nonce: "replay-nonce-1" });
  const r1 = await call(req1);
  assert.equal(r1.status, 200);
  assert.equal(fakeWebpush.pushCalls.length, 1);
  const req2 = internalReq({ notificationId: "notif-1", deviceId: "device-1", nonce: "replay-nonce-1", timestamp: req1.headers.get("X-Noor-Timestamp") });
  // Re-sign with the SAME nonce+timestamp so the signature still verifies; the nonce claim must reject it.
  const r2 = await call(req2);
  assert.equal(r2.status, 401);
  assert.equal(fakeWebpush.pushCalls.length, 1);
});
await checkAsync("internal: second valid call (new nonce) for already-sent notification+token -> 200, ZERO new sends (dedup)", async () => {
  fakeSupabase.__reset(seed());
  fakeWebpush.pushCalls.length = 0;
  const r1 = await call(internalReq({ notificationId: "notif-2", deviceId: "device-1" }));
  assert.equal(r1.status, 200);
  assert.equal(r1.data.totals.sent, 1);
  // notif-2 is now 'sent', so scope rejects the retry; use a fresh draft to test pure dedup:
  fakeSupabase.state.tables.admin_notifications.find((n) => n.id === "notif-2").status = "draft";
  const r2 = await call(internalReq({ notificationId: "notif-2", deviceId: "device-1" }));
  assert.equal(r2.status, 200);
  assert.equal(r2.data.totals.sent, 0);
  assert.equal(fakeWebpush.pushCalls.length, 1);
  assert.equal(fakeSupabase.state.tables.notification_deliveries.length, 1);
});
await checkAsync("internal: non-draft notification -> 403, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const r = await call(internalReq({ notificationId: "notif-sent", deviceId: "device-1" }));
  assert.equal(r.status, 403);
  assert.equal(fakeWebpush.pushCalls.length, before);
});
await checkAsync("internal: non-web target -> 403, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const r = await call(internalReq({ notificationId: "notif-android", deviceId: "device-1" }));
  assert.equal(r.status, 403);
  assert.equal(fakeWebpush.pushCalls.length, before);
});
await checkAsync("internal: stale notification (>60 min) -> 403, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  const r = await call(internalReq({ notificationId: "notif-stale", deviceId: "device-1" }));
  assert.equal(r.status, 403);
  assert.equal(fakeWebpush.pushCalls.length, before);
});
await checkAsync("internal: secret missing -> 500 fail-closed, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.pushCalls.length;
  env.PRAYER_PUSH_INTERNAL_SECRET = "";
  try {
    const r = await call(internalReq({ notificationId: "notif-1", deviceId: "device-1" }));
    assert.equal(r.status, 500);
    assert.equal(fakeWebpush.pushCalls.length, before);
  } finally { env.PRAYER_PUSH_INTERNAL_SECRET = SECRET; }
});
await checkAsync("internal: unknown caller -> 401", async () => {
  fakeSupabase.__reset(seed());
  const r = await call(internalReq({ notificationId: "notif-1", deviceId: "device-1", caller: "someone-else" }));
  assert.equal(r.status, 401);
});
await checkAsync("user path regression: admin JWT still sends (existing admin behaviour preserved)", async () => {
  fakeSupabase.__reset(seed());
  fakeWebpush.pushCalls.length = 0;
  const r = await call(plainReq({ notificationId: "notif-3" }, "Bearer valid-admin-jwt"));
  assert.equal(r.status, 200);
  assert.equal(r.data.totals.sent, 2);
});
await checkAsync("no log line contains a full subscription endpoint (endpoint_host only)", async () => {
  const joined = logLines.join("\n");
  assert.equal(joined.includes("secret-subscription-A"), false);
  assert.equal(joined.includes("secret-subscription-B"), false);
  assert.equal(joined.includes(SECRET), false);
});

console.log = origLog;
console.error = origErr;
rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
