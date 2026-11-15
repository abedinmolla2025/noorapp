// Scheduler-dispatch dual-mode gate tests — Phase 2 (2026-11-10).
//
// Part 1: unit tests of the EXACT production decision logic
// (decideSchedulerAuth / timingSafeEqual / parseSchedulerRequest),
// extracted verbatim from supabase/functions/scheduler-dispatch/index.ts
// between the NODE_TESTABLE markers and imported as .ts (Node 24
// type-strips; no logic is re-implemented here).
//
// Part 2: handler-level tests of the REAL staged index.ts (plus the
// real _shared/require-admin.ts) with a fake Supabase + fake web-push:
// proves the gate is actually wired — unauthenticated requests make
// zero DB calls and zero sends, the cron secret opens bulk only,
// admin JWT opens single + preview, preview never sends.
//
// Run: node supabase/functions/scheduler-dispatch/scheduler-gate.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets:
//   the "cron secret" here is the literal test string 'test-cron-secret'.

import assert from "node:assert/strict";
import { mkdtempSync, cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const funcsRoot = join(here, ".."); // supabase/functions
const CRON = "test-cron-secret";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------- Part 1: unit
const src = readFileSync(join(here, "index.ts"), "utf8");
const begin = "// --- NODE_TESTABLE_BEGIN ---";
const end = "// --- NODE_TESTABLE_END ---";
const bi = src.indexOf(begin);
const ei = src.indexOf(end);
if (bi === -1 || ei === -1 || ei <= bi) throw new Error("NODE_TESTABLE markers not found in scheduler-dispatch/index.ts");
const stageDir = mkdtempSync(join(tmpdir(), "p2-sched-gate-"));
writeFileSync(join(stageDir, "gate-logic.ts"), src.slice(bi + begin.length, ei));
const { decideSchedulerAuth, timingSafeEqual, parseSchedulerRequest } = await import(
  pathToFileURL(join(stageDir, "gate-logic.ts")).href
);

const adminCtx = { claims: { sub: "admin-uuid" }, claimsError: null, isAdmin: true, isAdminError: null };
const userCtx = { claims: { sub: "user-uuid" }, claimsError: null, isAdmin: false, isAdminError: null };
const badCtx = { claims: null, claimsError: new Error("bad token"), isAdmin: null, isAdminError: null };

check("timingSafeEqual: equal strings -> true", () => assert.equal(timingSafeEqual("abc", "abc"), true));
check("timingSafeEqual: different strings -> false", () => assert.equal(timingSafeEqual("abc", "abd"), false));
check("timingSafeEqual: different lengths -> false", () => assert.equal(timingSafeEqual("abc", "abcd"), false));
check("timingSafeEqual: empty vs non-empty -> false", () => assert.equal(timingSafeEqual("", "x"), false));
check("parse: bulk body -> bulk", () => assert.deepEqual(parseSchedulerRequest({}), { mode: "bulk", scheduleId: null }));
check("parse: schedule_id -> single", () => assert.deepEqual(parseSchedulerRequest({ schedule_id: "s1" }), { mode: "single", scheduleId: "s1" }));
check("parse: schedule_id + preview -> preview", () => assert.deepEqual(parseSchedulerRequest({ schedule_id: "s1", preview: true }), { mode: "preview", scheduleId: "s1" }));
check("parse: schedule_id + dry_run -> preview", () => assert.deepEqual(parseSchedulerRequest({ schedule_id: "s1", dry_run: true }), { mode: "preview", scheduleId: "s1" }));
check("parse: preview without schedule_id -> bulk (no single to preview)", () => assert.deepEqual(parseSchedulerRequest({ preview: true }), { mode: "bulk", scheduleId: null }));

const H = (token) => (token === null ? null : `Bearer ${token}`);
check("bulk: no auth -> 401", () => assert.equal(decideSchedulerAuth({ mode: "bulk", authHeader: null, cronSecret: CRON, ...badCtx }).status, 401));
check("bulk: bad cron secret -> 401", () => assert.equal(decideSchedulerAuth({ mode: "bulk", authHeader: H("wrong"), cronSecret: CRON, ...badCtx }).status, 401));
check("bulk: admin JWT, no cron secret -> 401 (admin cannot bulk)", () => {
  const d = decideSchedulerAuth({ mode: "bulk", authHeader: H("valid-admin-jwt"), cronSecret: CRON, ...adminCtx });
  assert.equal(d.ok, false); assert.equal(d.status, 401);
});
check("bulk: service-role-style bearer (not the cron secret) -> 401", () => {
  const d = decideSchedulerAuth({ mode: "bulk", authHeader: H("service-role-token"), cronSecret: CRON, ...badCtx });
  assert.equal(d.ok, false); assert.equal(d.status, 401);
});
check("bulk: valid cron secret -> ok via cron-secret", () => assert.deepEqual(decideSchedulerAuth({ mode: "bulk", authHeader: H(CRON), cronSecret: CRON, ...badCtx }), { ok: true, mode: "bulk", via: "cron-secret" }));
check("bulk: cron secret unconfigured -> 500 fail-closed", () => {
  const d = decideSchedulerAuth({ mode: "bulk", authHeader: H(CRON), cronSecret: "", ...badCtx });
  assert.equal(d.ok, false); assert.equal(d.status, 500);
});
check("single: no auth -> 401", () => assert.equal(decideSchedulerAuth({ mode: "single", authHeader: null, cronSecret: CRON, ...badCtx }).status, 401));
check("single: bad cron + bad JWT -> 401", () => assert.equal(decideSchedulerAuth({ mode: "single", authHeader: H("garbage"), cronSecret: CRON, ...badCtx }).status, 401));
check("single: valid cron secret -> ok via cron-secret", () => assert.deepEqual(decideSchedulerAuth({ mode: "single", authHeader: H(CRON), cronSecret: CRON, ...badCtx }), { ok: true, mode: "single", via: "cron-secret" }));
check("single: valid admin JWT -> ok via admin", () => assert.deepEqual(decideSchedulerAuth({ mode: "single", authHeader: H("valid-admin-jwt"), cronSecret: CRON, ...adminCtx }), { ok: true, mode: "single", via: "admin" }));
check("single: valid non-admin JWT -> 403", () => {
  const d = decideSchedulerAuth({ mode: "single", authHeader: H("valid-user-jwt"), cronSecret: CRON, ...userCtx });
  assert.equal(d.ok, false); assert.equal(d.status, 403);
});
check("preview: cron secret alone -> 401 (cron cannot preview)", () => {
  const d = decideSchedulerAuth({ mode: "preview", authHeader: H(CRON), cronSecret: CRON, ...badCtx });
  assert.equal(d.ok, false); assert.equal(d.status, 401);
});
check("preview: valid admin JWT -> ok via admin", () => assert.deepEqual(decideSchedulerAuth({ mode: "preview", authHeader: H("valid-admin-jwt"), cronSecret: CRON, ...adminCtx }), { ok: true, mode: "preview", via: "admin" }));
check("preview: valid non-admin JWT -> 403", () => {
  const d = decideSchedulerAuth({ mode: "preview", authHeader: H("valid-user-jwt"), cronSecret: CRON, ...userCtx });
  assert.equal(d.ok, false); assert.equal(d.status, 403);
});
check("preview: no auth -> 401", () => assert.equal(decideSchedulerAuth({ mode: "preview", authHeader: null, cronSecret: CRON, ...badCtx }).status, 401));

// ---------------------------------------------------------------- Part 2: handler
const FAKE_SUPABASE = `
export const state = { tables: {}, writes: [] };
export function __reset(seed) { state.tables = JSON.parse(JSON.stringify(seed)); state.writes = []; }
function matches(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    if (f.op === "eq" && v !== f.val) return false;
    if (f.op === "in" && !f.val.includes(v)) return false;
    if (f.op === "gte" && !(v >= f.val)) return false;
    if (f.op === "lte" && !(v <= f.val)) return false;
    if (f.op === "gt" && !(v > f.val)) return false;
    if (f.op === "lt" && !(v < f.val)) return false;
    if (f.op === "is" && f.val === null && v !== null) return false;
  }
  return true;
}
class Builder {
  constructor(table) { this.table = table; this.filters = []; this.limitN = null; this.patch = null; }
  select() { return this; }
  eq(c, v) { this.filters.push({ op: "eq", col: c, val: v }); return this; }
  in(c, v) { this.filters.push({ op: "in", col: c, val: v }); return this; }
  gte(c, v) { this.filters.push({ op: "gte", col: c, val: v }); return this; }
  lte(c, v) { this.filters.push({ op: "lte", col: c, val: v }); return this; }
  gt(c, v) { this.filters.push({ op: "gt", col: c, val: v }); return this; }
  lt(c, v) { this.filters.push({ op: "lt", col: c, val: v }); return this; }
  is(c, v) { this.filters.push({ op: "is", col: c, val: v }); return this; }
  order() { return this; }
  limit(n) { this.limitN = n; return this; }
  rows() { let rs = (state.tables[this.table] ?? []).filter((r) => matches(r, this.filters)); if (this.limitN != null) rs = rs.slice(0, this.limitN); return rs; }
  async maybeSingle() { const rs = this.rows(); return { data: rs[0] ?? null, error: null }; }
  async insert(row) { const rows = Array.isArray(row) ? row : [row]; state.tables[this.table] ??= []; for (const r of rows) { state.tables[this.table].push({ ...r }); state.writes.push({ table: this.table, op: "insert" }); } return { data: rows, error: null }; }
  update(patch) { this.patch = patch; return this; }
  then(resolve, reject) {
    try {
      if (this.patch) { const rs = this.rows(); for (const r of rs) Object.assign(r, this.patch); state.writes.push({ table: this.table, op: "update", count: rs.length }); resolve({ data: rs, error: null }); }
      else resolve({ data: this.rows(), error: null });
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
      if (fn === "scheduler_compute_next_run") return { data: null, error: null };
      return { data: null, error: null };
    },
  };
}
`;

const FAKE_WEBPUSH = `
export const calls = [];
const webpush = {
  setVapidDetails: () => {},
  sendNotification: async () => { calls.push(1); return { statusCode: 201 }; },
};
export default webpush;
`;

const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "scheduler-dispatch"), { recursive: true });
const schedSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2.45.6", "../fake-supabase.mjs")
  .replace("https://esm.sh/web-push@3.6.7?bundle", "../fake-webpush.mjs");
writeFileSync(join(hDir, "scheduler-dispatch", "index.ts"), schedSrc);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
writeFileSync(join(hDir, "fake-supabase.mjs"), FAKE_SUPABASE);
writeFileSync(join(hDir, "fake-webpush.mjs"), FAKE_WEBPUSH);

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  SCHEDULER_CRON_SECRET: CRON,
  WEBPUSH_VAPID_PUBLIC_KEY: "test-public",
  WEBPUSH_VAPID_PRIVATE_KEY: "test-private",
  FCM_SERVICE_ACCOUNT_JSON: "",
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
await import(pathToFileURL(join(hDir, "scheduler-dispatch", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
const fakeWebpush = await import(pathToFileURL(join(hDir, "fake-webpush.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

const PAST = new Date(Date.now() - 60000).toISOString();
function seed() {
  return {
    scheduler_schedules: [{
      id: "sched-1", name: "Morning dua", kind: "daily", time_at: "07:00",
      weekdays: [], day_of_month: null, tz: "Asia/Kolkata", islamic_event: null,
      event_date: null, enabled: true, target: "web",
      title_override: "Test title", body_override: "Test body",
      content_auto: false, content_type: null, content_id: null,
      next_run_at: PAST, last_sent_at: null,
    }],
    scheduler_notification_runs: [],
    admin_content: [],
    app_settings: [],
    device_push_tokens: [],
  };
}
function req(body, authHeader) {
  return {
    method: "POST",
    headers: { get: (n) => (String(n).toLowerCase() === "authorization" ? (authHeader ?? null) : null) },
    json: async () => body,
  };
}
async function call(body, authHeader) {
  const res = await handler(req(body, authHeader));
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

await checkAsync("handler: bulk no-auth -> 401, zero DB writes, zero sends", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.calls.length;
  const r = await call({}, null);
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
  assert.equal(fakeWebpush.calls.length, before);
});
await checkAsync("handler: bulk bad cron secret -> 401, zero DB writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({}, "Bearer wrong-secret");
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("handler: bulk admin JWT only -> 401 (admin cannot bulk)", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({}, "Bearer valid-admin-jwt");
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("handler: bulk valid cron secret -> 200, dispatched 1, run row written, zero webpush sends (no tokens)", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({}, `Bearer ${CRON}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.dispatched, 1);
  assert.equal(fakeSupabase.state.tables.scheduler_notification_runs.length, 1);
  assert.equal(fakeWebpush.calls.length, 0);
});
await checkAsync("handler: bulk cron secret unconfigured -> 500 fail-closed, zero writes", async () => {
  fakeSupabase.__reset(seed());
  env.SCHEDULER_CRON_SECRET = "";
  try {
    const r = await call({}, `Bearer ${CRON}`);
    assert.equal(r.status, 500);
    assert.equal(fakeSupabase.state.writes.length, 0);
  } finally { env.SCHEDULER_CRON_SECRET = CRON; }
});
await checkAsync("handler: single no-auth -> 401, zero writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ schedule_id: "sched-1" }, null);
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("handler: single valid cron secret -> 200, real send path (run row written)", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ schedule_id: "sched-1" }, `Bearer ${CRON}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(fakeSupabase.state.tables.scheduler_notification_runs.length, 1);
});
await checkAsync("handler: single admin JWT -> 200, run row written", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ schedule_id: "sched-1" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(fakeSupabase.state.tables.scheduler_notification_runs.length, 1);
});
await checkAsync("handler: single non-admin JWT -> 403, zero writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ schedule_id: "sched-1" }, "Bearer valid-user-jwt");
  assert.equal(r.status, 403);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("handler: preview admin JWT -> 200 dryRun, copy present, zero sends AND zero run rows", async () => {
  fakeSupabase.__reset(seed());
  const before = fakeWebpush.calls.length;
  const r = await call({ schedule_id: "sched-1", preview: true }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.dryRun, true);
  assert.equal(r.data.copy.title, "Test title");
  assert.equal(r.data.targets, 0);
  assert.equal(fakeSupabase.state.tables.scheduler_notification_runs.length, 0);
  assert.equal(fakeSupabase.state.writes.length, 0);
  assert.equal(fakeWebpush.calls.length, before);
});
await checkAsync("handler: preview with cron secret only -> 401, zero writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ schedule_id: "sched-1", preview: true }, `Bearer ${CRON}`);
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("handler: preview non-admin JWT -> 403", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ schedule_id: "sched-1", preview: true }, "Bearer valid-user-jwt");
  assert.equal(r.status, 403);
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
