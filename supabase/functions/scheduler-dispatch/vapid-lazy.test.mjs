// scheduler-dispatch VAPID lazy-init tests — Phase 2 consolidation (2026-11-11).
//
// Ports the S-9 lazy-init (Option B — the recorded Phase 4 recommendation,
// decision 5) from noorapp-vapid-lazy into the Phase 2 worktree's
// scheduler-dispatch/index.ts. The old module-scope
// `webpush.setVapidDetails(...)` threw at import time when the VAPID keys
// were missing/empty ("No key set vapidDetails.publicKey"), killing the
// whole function at boot. Keys are now read lazily by ensureVapid() on the
// web send path only: a missing/empty pair fails closed per delivery
// (failed count, clear message, never a send, never a boot crash);
// preview/dry-run never touches them.
//
// Stages the REAL scheduler-dispatch/index.ts with a fake Supabase and a
// fake web-push that RECORDS setVapidDetails calls, in two stages: one
// with NO VAPID keys in env, one with keys present. The fake web-push
// does not reproduce the real library's boot-time throw — the import
// test proves the call no longer happens at module scope at all, which
// is the fix.
//
// Run: node supabase/functions/scheduler-dispatch/vapid-lazy.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const funcsRoot = join(here, ".."); // supabase/functions
const CRON = "test-cron-secret";

let passed = 0;
let failed = 0;
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

// ---- fake Supabase (adapted from scheduler-gate.test.mjs) ----
const FAKE_SUPABASE = `
export const state = { tables: {}, writes: [] };
export function __reset(tables) { state.tables = tables; state.writes = []; }
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

// ---- fake web-push: records setVapidDetails + sendNotification calls ----
const FAKE_WEBPUSH = `
export const calls = { vapid: [], sends: [] };
const webpush = {
  setVapidDetails: (...a) => { calls.vapid.push(a); },
  sendNotification: async () => { calls.sends.push(1); return { statusCode: 201 }; },
};
export default webpush;
`;

async function stage(env) {
  const stageDir = mkdtempSync(join(tmpdir(), "p2-sched-vapid-"));
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
  let handler = null;
  globalThis.Deno = {
    env: { get: (k) => (k in env ? env[k] : undefined) },
    serve: (fn) => { handler = fn; },
  };
  await import(pathToFileURL(join(hDir, "scheduler-dispatch", "index.ts")).href);
  const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
  const fakeWebpush = await import(pathToFileURL(join(hDir, "fake-webpush.mjs")).href);
  assert.ok(handler, "Deno.serve handler was not captured");
  return { stageDir, handler, fakeSupabase, fakeWebpush };
}

const PAST = new Date(Date.now() - 60000).toISOString();
function seed(tokens) {
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
    device_push_tokens: tokens,
  };
}
function webToken(id) {
  return { id, token: JSON.stringify({ endpoint: `https://push.example.com/${id}`, keys: { p256dh: "x", auth: "y" } }), platform: "web", enabled: true };
}
function req(body, authHeader) {
  return {
    method: "POST",
    headers: { get: (n) => (String(n).toLowerCase() === "authorization" ? (authHeader ?? null) : null) },
    json: async () => body,
  };
}

// ---- Stage A: NO VAPID keys in env ----
{
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    SCHEDULER_CRON_SECRET: CRON,
    FCM_SERVICE_ACCOUNT_JSON: "",
    // WEBPUSH_VAPID_PUBLIC_KEY / WEBPUSH_VAPID_PRIVATE_KEY deliberately ABSENT
  };
  const { stageDir, handler, fakeSupabase, fakeWebpush } = await stage(env);
  async function call(body, authHeader) {
    const res = await handler(req(body, authHeader));
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  await checkAsync("no keys: module imports without crashing (old code threw at boot)", async () => {
    assert.ok(handler, "handler must exist after import with no VAPID keys");
    assert.equal(fakeWebpush.calls.vapid.length, 0, "setVapidDetails must not run at import");
  });
  await checkAsync("no keys: bulk dispatch with a web token -> 200, failed 1, zero sends, zero setVapidDetails", async () => {
    fakeSupabase.__reset(seed([webToken("t1")]));
    fakeWebpush.calls.vapid.length = 0;
    fakeWebpush.calls.sends.length = 0;
    const r = await call({}, `Bearer ${CRON}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.equal(r.data.dispatched, 1);
    assert.equal(r.data.results[0].total, 1);
    assert.equal(r.data.results[0].sent, 0);
    assert.equal(r.data.results[0].failed, 1);
    assert.equal(fakeWebpush.calls.sends.length, 0, "no send may be attempted without keys");
    assert.equal(fakeWebpush.calls.vapid.length, 0, "ensureVapid throws before setVapidDetails");
  });
  await checkAsync("no keys: admin preview -> 200 dryRun (preview never touches VAPID)", async () => {
    fakeSupabase.__reset(seed([webToken("t1")]));
    const r = await call({ schedule_id: "sched-1", preview: true }, "Bearer valid-admin-jwt");
    assert.equal(r.status, 200);
    assert.equal(r.data.dryRun, true);
    assert.equal(fakeWebpush.calls.sends.length, 0);
  });
  rmSync(stageDir, { recursive: true, force: true });
}

// ---- Stage B: VAPID keys present ----
{
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    SCHEDULER_CRON_SECRET: CRON,
    WEBPUSH_VAPID_PUBLIC_KEY: "test-public",
    WEBPUSH_VAPID_PRIVATE_KEY: "test-private",
    FCM_SERVICE_ACCOUNT_JSON: "",
  };
  const { stageDir, handler, fakeSupabase, fakeWebpush } = await stage(env);
  async function call(body, authHeader) {
    const res = await handler(req(body, authHeader));
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  await checkAsync("keys present: setVapidDetails NOT called at import (lazy)", async () => {
    assert.equal(fakeWebpush.calls.vapid.length, 0, "no VAPID init at import");
  });
  await checkAsync("keys present: bulk dispatch to 2 web tokens -> 200, sent 2, setVapidDetails exactly once", async () => {
    fakeSupabase.__reset(seed([webToken("t1"), webToken("t2")]));
    fakeWebpush.calls.vapid.length = 0;
    fakeWebpush.calls.sends.length = 0;
    const r = await call({}, `Bearer ${CRON}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.dispatched, 1);
    assert.equal(r.data.results[0].total, 2);
    assert.equal(r.data.results[0].sent, 2);
    assert.equal(r.data.results[0].failed, 0);
    assert.equal(fakeWebpush.calls.sends.length, 2);
    assert.equal(fakeWebpush.calls.vapid.length, 1, "ensureVapid runs once per isolate, on first send");
  });
  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
