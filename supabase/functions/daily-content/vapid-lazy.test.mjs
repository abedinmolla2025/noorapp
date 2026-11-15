// daily-content VAPID lazy-init tests — Phase 2 consolidation (2026-11-11).
//
// Ports the S-9 lazy-init (Option B — the recorded Phase 4 recommendation,
// decision 5) from noorapp-vapid-lazy into the Phase 2 worktree's
// daily-content/index.ts. The old module-scope reads + setVapidDetails
// call threw at import time when the VAPID keys were missing/empty ("No
// key set vapidDetails.publicKey"), killing the whole function at boot —
// including dry_run. Keys are now read lazily by ensureVapid() on the
// send path only: a missing/empty pair fails closed per delivery
// (retryable, no token disabled, never a send); dry_run never reaches
// it, so it works without keys.
//
// Stages the REAL daily-content/index.ts (s6-style stubs: only the two
// esm.sh imports change) in two stages: one with NO VAPID keys in env,
// one with keys present. The fake web-push RECORDS setVapidDetails calls
// (the real library's boot-time throw is not reproduced — the import
// test proves the call no longer happens at module scope at all, which
// is the fix).
//
// Run: node supabase/functions/daily-content/vapid-lazy.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const CRON = "test-cron-secret";

let passed = 0;
let failed = 0;
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

// ---- stubs: fake Supabase holder + fake web-push with call recording ----
function makeStubs() {
  return `
export const holder = { svc: null, webpush: null };
export const calls = { vapid: [], sends: [] };
export const createClient = () => holder.svc;
const webpush = {
  setVapidDetails: (...a) => { calls.vapid.push(a); },
  sendNotification: (...a) => holder.webpush.sendNotification(...a),
};
export default webpush;
`;
}

// ---- compact in-memory fake Supabase (PostgREST-shaped, thenable) ----
function makeSvc(seed = {}) {
  const tables = {
    daily_content_settings: seed.settings ?? [],
    daily_content_publications: seed.publications ?? [],
    daily_content_deliveries: seed.deliveries ?? [],
    device_push_tokens: seed.tokens ?? [],
    daily_content_preferences: seed.prefs ?? [],
    hadiths: seed.hadiths ?? [],
    admin_content: seed.duas ?? [],
    daily_content_recommendations: seed.recommendations ?? [],
  };
  let seq = 1000;
  class Q {
    constructor(table) {
      this.table = table; this.filters = []; this.orderings = [];
      this.limitN = null; this.patch = null; this.inserted = null; this.head = false;
    }
    select(cols, opts) { this.head = !!opts?.head; return this; }
    eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
    in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
    gte(col, val) { this.filters.push((r) => r[col] >= val); return this; }
    lte(col, val) { this.filters.push((r) => r[col] <= val); return this; }
    gt(col, val) { this.filters.push((r) => r[col] > val); return this; }
    lt(col, val) { this.filters.push((r) => r[col] < val); return this; }
    is(col, val) { this.filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return this; }
    order(col, opts = {}) { this.orderings.push({ col, asc: opts.ascending !== false }); return this; }
    limit(n) { this.limitN = n; return this; }
    rows() {
      let rs = (tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
      for (const o of this.orderings) {
        rs = [...rs].sort((a, b) => {
          if (a[o.col] === b[o.col]) return 0;
          return (a[o.col] < b[o.col] ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      if (this.limitN != null) rs = rs.slice(0, this.limitN);
      return rs;
    }
    async maybeSingle() { const rs = this.rows(); return { data: rs[0] ?? null, error: null }; }
    async single() {
      if (this.inserted) return { data: this.inserted[0] ?? null, error: null };
      const rs = this.rows();
      return { data: rs[0] ?? null, error: null };
    }
    insert(row) {
      const rows = Array.isArray(row) ? row : [row];
      this.inserted = rows.map((r) => ({ id: r.id ?? `row-${++seq}`, ...r }));
      tables[this.table] ??= [];
      tables[this.table].push(...this.inserted);
      return this;
    }
    upsert(row) {
      const rows = Array.isArray(row) ? row : [row];
      this.inserted = rows.map((r) => {
        const key = r.device_id ?? r.id;
        const existing = (tables[this.table] ?? []).find((x) => (x.device_id ?? x.id) === key);
        if (existing) { Object.assign(existing, r); return existing; }
        const nr = { id: r.id ?? `row-${++seq}`, ...r };
        tables[this.table] ??= [];
        tables[this.table].push(nr);
        return nr;
      });
      return this;
    }
    update(patch) { this.patch = patch; return this; }
    then(resolve, reject) {
      try {
        if (this.patch) {
          const rs = this.rows();
          for (const r of rs) Object.assign(r, this.patch);
          resolve({ data: rs, error: null });
          return;
        }
        resolve({ data: this.inserted ?? (this.head ? [] : this.rows()), count: this.rows().length, error: null });
      } catch (e) { reject(e); }
    }
  }
  return { tables, from: (table) => new Q(table) };
}

const hadithRow = (over = {}) => ({ id: "h1", book_key: "bukhari", chapter_id: 1, hadith_number: 1, arabic: "ARABIC-H", bengali: "BENGALI-H", ...over });
const duaRow = (slug, over = {}) => ({
  id: `dua-${slug}`, slug, title: `TITLE-${slug}`, title_en: null,
  content: `BENGALI-${slug}`, content_arabic: `ARABIC-${slug}`,
  metadata: { reference: `REF-${slug}`, source_type: "Dua" },
  status: "published", content_type: "dua", ...over,
});
const token = (id, deviceId) => ({
  id, token: JSON.stringify({ endpoint: `https://push.example.com/${id}` }),
  platform: "web", enabled: true, device_id: deviceId,
});

async function stage(env) {
  const stageDir = mkdtempSync(join(tmpdir(), "p2-daily-vapid-"));
  writeFileSync(join(stageDir, "stubs.mjs"), makeStubs());
  const src = readFileSync(join(root, "supabase/functions/daily-content/index.ts"), "utf8");
  const rewritten = src
    .replace('from "https://esm.sh/@supabase/supabase-js@2.45.6"', 'from "./stubs.mjs"')
    .replace('from "https://esm.sh/web-push@3.6.7?bundle"', 'from "./stubs.mjs"');
  if (rewritten === src) throw new Error("edge import rewrite failed");
  writeFileSync(join(stageDir, "edge.ts"), rewritten);
  let capturedHandler = null;
  globalThis.Deno = {
    env: { get: (k) => (k in env ? env[k] : undefined) },
    serve: (cb) => { capturedHandler = cb; },
  };
  const stubs = await import(pathToFileURL(join(stageDir, "stubs.mjs")).href);
  await import(pathToFileURL(join(stageDir, "edge.ts")).href);
  assert.ok(capturedHandler, "edge handler was not captured");
  return { stageDir, stubs, handler: capturedHandler };
}

async function callEdge(handler, body) {
  const req = new Request("http://edge/functions/v1/daily-content", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function setWebpush(stubs, behavior) {
  const calls = [];
  stubs.holder.webpush = {
    calls,
    sendNotification: async (sub, payload) => {
      calls.push({ sub, payload });
      return behavior(sub, payload);
    },
  };
  return calls;
}

// ---- Stage A: NO VAPID keys in env ----
{
  const env = {
    SUPABASE_URL: "http://stub",
    SUPABASE_SERVICE_ROLE_KEY: "key",
    DAILY_CONTENT_CRON_SECRET: CRON,
    // WEBPUSH_VAPID_PUBLIC_KEY / WEBPUSH_VAPID_PRIVATE_KEY deliberately ABSENT
  };
  const { stageDir, stubs, handler } = await stage(env);

  await checkAsync("no keys: module imports without crashing (old code threw at boot)", async () => {
    assert.ok(handler, "handler must exist after import with no VAPID keys");
    assert.equal(stubs.calls.vapid.length, 0, "setVapidDetails must not run at import");
  });
  await checkAsync("no keys: dry_run -> 200 (planning works without keys)", async () => {
    const svc = makeSvc({ settings: [{ enabled: true }], hadiths: [], duas: [] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.dry_run, true);
    assert.equal(stubs.calls.vapid.length, 0, "dry_run must never touch VAPID");
  });
  rmSync(stageDir, { recursive: true, force: true });
}

// ---- Stage B: VAPID keys present ----
{
  const env = {
    SUPABASE_URL: "http://stub",
    SUPABASE_SERVICE_ROLE_KEY: "key",
    WEBPUSH_VAPID_PUBLIC_KEY: "pub",
    WEBPUSH_VAPID_PRIVATE_KEY: "priv",
    DAILY_CONTENT_CRON_SECRET: CRON,
  };
  const { stageDir, stubs, handler } = await stage(env);

  await checkAsync("keys present: setVapidDetails NOT called at import, NOT called by dry_run (lazy)", async () => {
    assert.equal(stubs.calls.vapid.length, 0, "no VAPID init at import");
    const svc = makeSvc({ settings: [{ enabled: true }], hadiths: [hadithRow()], duas: ["s1"].map((s) => duaRow(s)) });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(stubs.calls.vapid.length, 0, "dry_run must never init VAPID");
  });
  await checkAsync("keys present: full run sends once, setVapidDetails exactly once (lazy, on first send)", async () => {
    const svc = makeSvc({
      settings: [{ enabled: true }],
      hadiths: [hadithRow()],
      duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
      tokens: [token("t1", "d1")],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    stubs.calls.vapid.length = 0;
    const res = await callEdge(handler, {});
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1, "exactly one send to the one token");
    assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 1);
    assert.equal(stubs.calls.vapid.length, 1, "ensureVapid runs once per isolate, on first send");
  });
  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
