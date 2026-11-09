// send-contact-email hardened-candidate tests — Phase 2 (2026-11-10).
//
// Part 1: unit tests of validateContactPayload + checkRateLimit,
// extracted verbatim from index.ts (NODE_TESTABLE markers).
// Part 2: handler-level tests of the REAL staged index.ts with a
// stubbed fetch (Resend): proves exactly ONE Resend call per valid
// request, fixed sender/recipient, no fallback double-send, and that
// invalid/oversized/rate-limited requests make ZERO Resend calls.
//
// Run: node supabase/functions/send-contact-email/send-contact-email.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
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

// ---------------------------------------------------------------- Part 1
const src = readFileSync(join(here, "index.ts"), "utf8");
const begin = "// --- NODE_TESTABLE_BEGIN ---";
const end = "// --- NODE_TESTABLE_END ---";
const bi = src.indexOf(begin);
const ei = src.indexOf(end);
if (bi === -1 || ei === -1 || ei <= bi) throw new Error("NODE_TESTABLE markers not found");
const stageDir = mkdtempSync(join(tmpdir(), "p2-contact-"));
writeFileSync(join(stageDir, "logic.ts"), src.slice(bi + begin.length, ei));
const { validateContactPayload, checkRateLimit } = await import(pathToFileURL(join(stageDir, "logic.ts")).href);

const good = { name: "Asha", email: "asha@example.com", subject: "Help", message: "Hello, I need help." };
check("valid payload -> ok, replyEmailValid true", () => {
  const v = validateContactPayload(good, 100);
  assert.equal(v.ok, true);
  if (v.ok) { assert.equal(v.replyEmailValid, true); assert.equal(v.name, "Asha"); }
});
check("missing message -> 400", () => {
  const v = validateContactPayload({ ...good, message: "   " }, 100);
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.status, 400);
});
check("message over 5000 chars -> 400", () => {
  const v = validateContactPayload({ ...good, message: "x".repeat(5001) }, 6000);
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.status, 400);
});
check("name over 100 chars -> 400", () => {
  const v = validateContactPayload({ ...good, name: "x".repeat(101) }, 200);
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.status, 400);
});
check("subject over 200 chars -> 400", () => {
  const v = validateContactPayload({ ...good, subject: "x".repeat(201) }, 300);
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.status, 400);
});
check("email over 254 chars -> 400", () => {
  const v = validateContactPayload({ ...good, email: `${"x".repeat(250)}@example.com` }, 400);
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.status, 400);
});
check("oversized body (65537 bytes) -> 413", () => {
  const v = validateContactPayload(good, 65537);
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.status, 413);
});
check("body exactly 65536 bytes -> not 413", () => {
  const v = validateContactPayload(good, 65536);
  assert.equal(v.ok, true);
});
check("invalid email -> ok but replyEmailValid false (no reply_to)", () => {
  const v = validateContactPayload({ ...good, email: "not-an-email" }, 100);
  assert.equal(v.ok, true); if (v.ok) assert.equal(v.replyEmailValid, false);
});
check("missing email -> ok, replyEmailValid false", () => {
  const v = validateContactPayload({ name: "A", message: "hi" }, 50);
  assert.equal(v.ok, true); if (v.ok) assert.equal(v.replyEmailValid, false);
});
check("rate limit: 5 hits allowed, 6th rejected with Retry-After", () => {
  let hits = [];
  for (let i = 0; i < 5; i++) {
    const r = checkRateLimit(hits, 1000 + i * 1000);
    assert.equal(r.allowed, true);
    hits = r.hits;
  }
  const r6 = checkRateLimit(hits, 6000);
  assert.equal(r6.allowed, false);
  assert.ok(r6.retryAfterSeconds >= 1 && r6.retryAfterSeconds <= 60);
});
check("rate limit: window expiry frees the bucket", () => {
  const r = checkRateLimit([1000, 2000, 3000, 4000, 5000], 1000 + 61000);
  assert.equal(r.allowed, true);
});

// ---------------------------------------------------------------- Part 2
writeFileSync(join(stageDir, "index.ts"), src);
const env = { RESEND_API_KEY: "test-resend-key", RESEND_FROM_EMAIL: "attacker-controlled@example.com" };
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
const fetchCalls = [];
let fetchBehaviour = "ok"; // "ok" | "error"
globalThis.fetch = async (url, opts) => {
  fetchCalls.push({ url, body: JSON.parse(String(opts?.body ?? "{}")), auth: opts?.headers?.Authorization ?? "" });
  if (fetchBehaviour === "error") {
    return { ok: false, status: 400, json: async () => ({ message: "resend boom" }) };
  }
  return { ok: true, status: 200, json: async () => ({ id: "re_test123" }) };
};
await import(pathToFileURL(join(stageDir, "index.ts")).href);
assert.ok(handler, "Deno.serve handler was not captured");

let n = 0;
function req(bodyObj, contentLength) {
  const raw = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
  return {
    method: "POST",
    headers: { get: (k) => (String(k).toLowerCase() === "content-length" ? String(contentLength ?? raw.length) : null) },
    text: async () => raw,
  };
}
async function call(bodyObj, contentLength) {
  const res = await handler(req(bodyObj, contentLength));
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, retryAfter: res.headers.get("Retry-After") };
}

await checkAsync("handler: valid request -> 200, EXACTLY ONE Resend call to fixed recipient/sender", async () => {
  fetchCalls.length = 0;
  const r = await call({ ...good, email: `valid-${++n}@example.com` });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://api.resend.com/emails");
  assert.deepEqual(fetchCalls[0].body.to, ["support@noorapp.in"]);
  assert.equal(fetchCalls[0].body.from, "NoorApp Support <support@noorapp.in>");
  assert.ok(fetchCalls[0].body.reply_to?.includes("@example.com"));
  assert.equal(fetchCalls[0].auth, "Bearer test-resend-key");
  assert.ok(!String(fetchCalls[0].body.html).includes("onboarding@resend.dev"));
});
await checkAsync("handler: RESEND_FROM_EMAIL env is IGNORED (no env sender override)", async () => {
  fetchCalls.length = 0;
  const r = await call({ ...good, email: `env-${++n}@example.com` });
  assert.equal(r.status, 200);
  assert.equal(fetchCalls[0].body.from, "NoorApp Support <support@noorapp.in>");
});
await checkAsync("handler: invalid sender email -> 200, reply_to OMITTED, still one call", async () => {
  fetchCalls.length = 0;
  const r = await call({ ...good, email: "not-an-email" });
  assert.equal(r.status, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal("reply_to" in fetchCalls[0].body, false);
});
await checkAsync("handler: missing message -> 400, ZERO Resend calls", async () => {
  fetchCalls.length = 0;
  const r = await call({ name: "A", email: `m-${++n}@example.com` });
  assert.equal(r.status, 400);
  assert.equal(fetchCalls.length, 0);
});
await checkAsync("handler: message too long -> 400, ZERO Resend calls", async () => {
  fetchCalls.length = 0;
  const r = await call({ ...good, email: `m-${++n}@example.com`, message: "x".repeat(5001) });
  assert.equal(r.status, 400);
  assert.equal(fetchCalls.length, 0);
});
await checkAsync("handler: oversized Content-Length -> 413, ZERO Resend calls", async () => {
  fetchCalls.length = 0;
  const r = await call(good, 70000);
  assert.equal(r.status, 413);
  assert.equal(fetchCalls.length, 0);
});
await checkAsync("handler: missing RESEND_API_KEY -> 500, ZERO Resend calls", async () => {
  fetchCalls.length = 0;
  env.RESEND_API_KEY = "";
  try {
    const r = await call({ ...good, email: `nokey-${++n}@example.com` });
    assert.equal(r.status, 500);
    assert.equal(fetchCalls.length, 0);
  } finally { env.RESEND_API_KEY = "test-resend-key"; }
});
await checkAsync("handler: Resend upstream error -> 500 generic, EXACTLY ONE call (no fallback retry)", async () => {
  fetchCalls.length = 0;
  fetchBehaviour = "error";
  try {
    const r = await call({ ...good, email: `err-${++n}@example.com` });
    assert.equal(r.status, 500);
    assert.equal(r.data.error, "email_delivery_failed");
    assert.equal(fetchCalls.length, 1);
  } finally { fetchBehaviour = "ok"; }
});
await checkAsync("handler: 6 rapid requests from one sender -> 6th is 429 with Retry-After, only 5 Resend calls", async () => {
  fetchCalls.length = 0;
  const email = `ratelimit-${++n}@example.com`;
  let last;
  for (let i = 0; i < 6; i++) last = await call({ ...good, email });
  assert.equal(last.status, 429);
  assert.ok(last.retryAfter !== null);
  assert.equal(fetchCalls.length, 5);
});
await checkAsync("handler: HTML in message is escaped in the sent email (no raw <script>)", async () => {
  fetchCalls.length = 0;
  const r = await call({ ...good, email: `xss-${++n}@example.com`, message: "<script>alert(1)</script>" });
  assert.equal(r.status, 200);
  assert.equal(fetchCalls[0].body.html.includes("<script>"), false);
  assert.ok(fetchCalls[0].body.html.includes("&lt;script&gt;"));
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
