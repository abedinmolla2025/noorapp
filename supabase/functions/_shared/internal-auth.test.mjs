// Internal HMAC auth unit tests — Phase 2 / S-3 (2026-11-10).
//
// Tests the EXACT production logic from
// supabase/functions/_shared/internal-auth.ts (NODE_TESTABLE block),
// imported as .ts (Node 24 type-strips). Signing cross-checks the
// WebCrypto implementation against Node's crypto.createHmac — the
// receiver (WebCrypto) and the test signer (Node) must agree, or the
// protocol is broken. No real secrets: the test secret is the literal
// string 'test-internal-secret'.
//
// Run: node supabase/functions/_shared/internal-auth.test.mjs
//   (from the worktree root). No Deno, no network.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SECRET = "test-internal-secret";
const NOW = 1794000000000; // fixed "now" for deterministic window tests

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

const src = readFileSync(join(here, "internal-auth.ts"), "utf8");
const begin = "// --- NODE_TESTABLE_BEGIN ---";
const end = "// --- NODE_TESTABLE_END ---";
const bi = src.indexOf(begin);
const ei = src.indexOf(end);
if (bi === -1 || ei === -1 || ei <= bi) throw new Error("NODE_TESTABLE markers not found in internal-auth.ts");
const stageDir = mkdtempSync(join(tmpdir(), "p2-internal-auth-"));
writeFileSync(join(stageDir, "logic.ts"), src.slice(bi + begin.length, ei));
const mod = await import(pathToFileURL(join(stageDir, "logic.ts")).href);
const { canonicalInternalString, signInternalCall, timingSafeEqualHex, decideInternalAuth, decideInternalScope } = mod;

const FIELDS = { timestamp: String(NOW), nonce: "nonce-1", notificationId: "notif-1", deviceId: "device-1" };
function nodeSign(secret, fields) {
  return createHmac("sha256", secret).update(canonicalInternalString(fields)).digest("hex");
}
function headersFor(fields, secret, overrides = {}) {
  return {
    "X-Noor-Internal-Caller": "send-prayer-notifications",
    "X-Noor-Timestamp": fields.timestamp,
    "X-Noor-Nonce": fields.nonce,
    "X-Noor-Signature": nodeSign(secret, fields),
    ...overrides,
  };
}
async function decide(headers, extra = {}) {
  return await decideInternalAuth({
    headers,
    secret: SECRET,
    nowMs: NOW,
    claimedNonces: new Set(),
    notificationId: FIELDS.notificationId,
    deviceId: FIELDS.deviceId,
    ...extra,
  });
}

check("canonical string format is timestamp.nonce.notificationId.deviceId", () => {
  assert.equal(canonicalInternalString(FIELDS), `${NOW}.nonce-1.notif-1.device-1`);
});
await checkAsync("signInternalCall agrees with Node createHmac (cross-implementation)", async () => {
  const sig = await signInternalCall(SECRET, FIELDS);
  assert.equal(sig, nodeSign(SECRET, FIELDS));
});
check("timingSafeEqualHex: equal -> true, one-char diff -> false, bad hex -> false", () => {
  assert.equal(timingSafeEqualHex("aabbcc", "aabbcc"), true);
  assert.equal(timingSafeEqualHex("aabbcc", "aabbcd"), false);
  assert.equal(timingSafeEqualHex("aabbcc", "aabb"), false);
  assert.equal(timingSafeEqualHex("zz", "zz"), false);
});
await checkAsync("valid signed call -> ok", async () => {
  assert.deepEqual(await decide(headersFor(FIELDS, SECRET)), { ok: true });
});
await checkAsync("missing all headers -> 401 missing_headers", async () => {
  const d = await decide({});
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "missing_headers");
});
await checkAsync("partial headers (only signature+nonce) -> 401 partial_headers, no fall-through", async () => {
  const d = await decide({ "X-Noor-Signature": "x", "X-Noor-Nonce": "nonce-1" });
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "partial_headers");
});
await checkAsync("partial headers (missing signature only) -> 401 partial_headers", async () => {
  const h = headersFor(FIELDS, SECRET);
  delete h["X-Noor-Signature"];
  const d = await decide(h);
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "partial_headers");
});
await checkAsync("wrong caller -> 401 bad_caller", async () => {
  const d = await decide(headersFor(FIELDS, SECRET, { "X-Noor-Internal-Caller": "someone-else" }));
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "bad_caller");
});
await checkAsync("bad signature -> 401 bad_signature", async () => {
  const d = await decide(headersFor(FIELDS, "wrong-secret"));
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "bad_signature");
});
await checkAsync("tampered deviceId (signature over another device) -> 401 bad_signature", async () => {
  const d = await decide(headersFor(FIELDS, SECRET), { deviceId: "device-2" });
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "bad_signature");
});
await checkAsync("expired timestamp (301 s old) -> 401 timestamp_expired", async () => {
  const old = { ...FIELDS, timestamp: String(NOW - 301_000) };
  const d = await decide(headersFor(old, SECRET));
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "timestamp_expired");
});
await checkAsync("timestamp at exactly 300 s -> ok (boundary inclusive)", async () => {
  const edge = { ...FIELDS, timestamp: String(NOW - 300_000) };
  const d = await decide(headersFor(edge, SECRET));
  assert.deepEqual(d, { ok: true });
});
await checkAsync("future timestamp beyond window -> 401 timestamp_expired", async () => {
  const fut = { ...FIELDS, timestamp: String(NOW + 301_000) };
  const d = await decide(headersFor(fut, SECRET));
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "timestamp_expired");
});
await checkAsync("replayed nonce (in claimed set) -> 401 replay", async () => {
  const d = await decide(headersFor(FIELDS, SECRET), { claimedNonces: new Set(["nonce-1"]) });
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "replay");
});
await checkAsync("missing secret -> 500 fail-closed", async () => {
  const d = await decideInternalAuth({
    headers: headersFor(FIELDS, SECRET),
    secret: "",
    nowMs: NOW,
    claimedNonces: new Set(),
    notificationId: FIELDS.notificationId,
    deviceId: FIELDS.deviceId,
  });
  assert.equal(d.ok, false); assert.equal(d.status, 500); assert.equal(d.reason, "secret_missing");
});
await checkAsync("non-numeric timestamp -> 401 bad_timestamp", async () => {
  const bad = { ...FIELDS, timestamp: "not-a-time" };
  const d = await decide(headersFor(bad, SECRET));
  assert.equal(d.ok, false); assert.equal(d.status, 401); assert.equal(d.reason, "bad_timestamp");
});

// ---- scope decisions
const freshDraft = { status: "draft", target_platform: "web", created_at: new Date(NOW - 10 * 60_000).toISOString() };
check("scope: valid draft web fresh + deviceId -> ok", () => {
  assert.deepEqual(decideInternalScope({ deviceId: "device-1", notification: freshDraft, nowMs: NOW }), { ok: true });
});
check("scope: missing deviceId -> 400 (broadcast guard)", () => {
  const d = decideInternalScope({ deviceId: "", notification: freshDraft, nowMs: NOW });
  assert.equal(d.ok, false); assert.equal(d.status, 400);
});
check("scope: null deviceId -> 400", () => {
  const d = decideInternalScope({ deviceId: null, notification: freshDraft, nowMs: NOW });
  assert.equal(d.ok, false); assert.equal(d.status, 400);
});
check("scope: notification missing -> 404", () => {
  const d = decideInternalScope({ deviceId: "device-1", notification: null, nowMs: NOW });
  assert.equal(d.ok, false); assert.equal(d.status, 404);
});
check("scope: non-draft (sent) -> 403", () => {
  const d = decideInternalScope({ deviceId: "device-1", notification: { ...freshDraft, status: "sent" }, nowMs: NOW });
  assert.equal(d.ok, false); assert.equal(d.status, 403);
});
check("scope: non-web target (android) -> 403", () => {
  const d = decideInternalScope({ deviceId: "device-1", notification: { ...freshDraft, target_platform: "android" }, nowMs: NOW });
  assert.equal(d.ok, false); assert.equal(d.status, 403);
});
check("scope: notification 61 min old -> 403 too old", () => {
  const d = decideInternalScope({ deviceId: "device-1", notification: { ...freshDraft, created_at: new Date(NOW - 61 * 60_000).toISOString() }, nowMs: NOW });
  assert.equal(d.ok, false); assert.equal(d.status, 403);
});
check("scope: notification exactly 60 min old -> ok (boundary inclusive)", () => {
  const d = decideInternalScope({ deviceId: "device-1", notification: { ...freshDraft, created_at: new Date(NOW - 60 * 60_000).toISOString() }, nowMs: NOW });
  assert.deepEqual(d, { ok: true });
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
