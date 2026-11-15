// S-6 opt-out re-check tests — Phase 2 (2026-11-10).
//
// Stages the REAL supabase/functions/daily-content/index.ts (the Phase 2
// worktree copy, base = the dailyauto working-tree file, SHA 9c6a8998…,
// i.e. the v3 daily bundle — NOT the 923-line commit-022fa31 version,
// which lacks the opt-out snapshot/claim code this race applies to)
// with only its two esm.sh imports stubbed, a Deno double, an
// in-memory PostgREST-shaped fake Supabase, and a stubbed web-push
// client. The fake models PostgREST's 1,000-row cap like
// scripts/daily-content/edge-tests.mjs (same lineage, compact fake
// written for this file).
//
// Proves the S-6 candidate: an opt-out landing MID-SEND (the web-push
// stub flips d2 to opted-out while d1's send is in flight) is
// respected before d2's provider call — d2 gets zero sends and its
// delivery row is closed terminally — on BOTH the first-send path
// (sendToTokens) and the retry-tick path (runRetries, {retry_only:true}).
// Also proves the pre-existing snapshot path still works and that a
// clean run is unaffected. The test counts re-check queries (a
// maybeSingle on daily_content_preferences filtered by device_id)
// to prove the re-check actually ran, not just the snapshot.
//
// Run: node scripts/daily-content/s6-optout-recheck.test.mjs
//   (from the worktree root). No Deno, no network, no real DB, no sends.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..", "..");
const CRON = "test-cron-secret";

let passed = 0;
let failed = 0;
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

// ---- stage the real edge (only the two remote imports change) ----
const stageDir = mkdtempSync(join(tmpdir(), "p2-s6-"));
const STUBS = `
export const holder = { svc: null, webpush: null };
export const createClient = () => holder.svc;
const webpush = {
  setVapidDetails() {},
  sendNotification: (...a) => holder.webpush.sendNotification(...a),
};
export default webpush;
`;
writeFileSync(join(stageDir, "stubs.mjs"), STUBS);
const src = readFileSync(join(root, "supabase/functions/daily-content/index.ts"), "utf8");
const rewritten = src
  .replace('from "https://esm.sh/@supabase/supabase-js@2.45.6"', 'from "./stubs.mjs"')
  .replace('from "https://esm.sh/web-push@3.6.7?bundle"', 'from "./stubs.mjs"');
if (rewritten === src) throw new Error("edge import rewrite failed");
writeFileSync(join(stageDir, "edge.ts"), rewritten);

let capturedHandler = null;
globalThis.Deno = {
  env: {
    get: (k) => ({
      SUPABASE_URL: "http://stub",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      WEBPUSH_VAPID_PUBLIC_KEY: "pub",
      WEBPUSH_VAPID_PRIVATE_KEY: "priv",
      DAILY_CONTENT_CRON_SECRET: CRON,
    })[k] ?? "",
  },
  serve: (cb) => { capturedHandler = cb; },
};
const stubs = await import(pathToFileURL(join(stageDir, "stubs.mjs")).href);
await import(pathToFileURL(join(stageDir, "edge.ts")).href);
assert.ok(capturedHandler, "edge handler was not captured");

// ---- in-memory fake Supabase (PostgREST-shaped, thenable builder) ----
const FAKE_MAX_ROWS = 1000;
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
  const stats = { recheckQueries: 0 };
  class Q {
    constructor(table) {
      this.table = table; this.filters = []; this.orderings = [];
      this.limitN = null; this.patch = null; this.inserted = null; this.hasDeviceEq = false;
    }
    select() { return this; }
    eq(col, val) { this.filters.push((r) => r[col] === val); if (this.table === "daily_content_preferences" && col === "device_id") this.hasDeviceEq = true; return this; }
    in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
    gte(col, val) { this.filters.push((r) => r[col] >= val); return this; }
    lte(col, val) { this.filters.push((r) => r[col] <= val); return this; }
    gt(col, val) { this.filters.push((r) => r[col] > val); return this; }
    lt(col, val) { this.filters.push((r) => r[col] < val); return this; }
    is(col, val) { this.filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return this; }
    order(col, opts = {}) {
      this.orderings.push({ col, asc: opts.ascending !== false });
      return this;
    }
    limit(n) { this.limitN = n; return this; }
    rows() {
      let rs = tables[this.table].filter((r) => this.filters.every((f) => f(r)));
      for (const o of this.orderings) {
        rs = [...rs].sort((a, b) => {
          const av = a[o.col]; const bv = b[o.col];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : av > bv ? 1 : 0) * (o.asc ? 1 : -1);
        });
      }
      if (this.limitN != null) rs = rs.slice(0, this.limitN);
      return rs.slice(0, FAKE_MAX_ROWS);
    }
    async maybeSingle() {
      if (this.hasDeviceEq) stats.recheckQueries++;
      const rs = this.rows();
      return { data: rs[0] ?? null, error: null };
    }
    async single() {
      if (this.inserted) return { data: this.inserted[0] ?? null, error: null };
      const rs = this.rows();
      return { data: rs[0] ?? null, error: null };
    }
    insert(row) {
      const rows = Array.isArray(row) ? row : [row];
      this.inserted = rows.map((r) => ({ id: r.id ?? `id-${++seq}`, ...r }));
      tables[this.table].push(...this.inserted);
      return this;
    }
    upsert(row) {
      const rows = Array.isArray(row) ? row : [row];
      this.inserted = rows.map((r) => {
        const key = r.device_id ?? r.id;
        const existing = tables[this.table].find((x) => (x.device_id ?? x.id) === key);
        if (existing) { Object.assign(existing, r); return existing; }
        const nr = { id: r.id ?? `id-${++seq}`, ...r };
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
        resolve({ data: this.inserted ?? this.rows(), error: null });
      } catch (e) { reject(e); }
    }
  }
  return { tables, stats, from: (table) => new Q(table) };
}

function kolkataToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const TODAY = kolkataToday();
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

async function callEdge(body) {
  const req = new Request("http://edge/functions/v1/daily-content", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await capturedHandler(req);
  return { status: res.status, json: await res.json() };
}
function setWebpush(behavior) {
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
const ok201 = () => ({ statusCode: 201 });

await checkAsync("baseline: clean daily run sends to both devices", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2")],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
  assert.equal(svc.tables.daily_content_publications[0].recipients_sent, 2);
  assert.equal(calls.length, 2);
  assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 2);
});

await checkAsync("S-6 first send: opt-out landing mid-send is respected (d2 skipped, row closed, zero sends to d2)", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2")],
  });
  stubs.holder.svc = svc;
  // Flip d2 to opted-out DURING d1's provider call — after the snapshot
  // was taken, before d2's send. Without the re-check d2 would be sent to.
  let flipped = false;
  const calls = setWebpush(() => {
    if (!flipped) {
      flipped = true;
      svc.tables.daily_content_preferences.push({ device_id: "d2", daily_enabled: false });
    }
    return { statusCode: 201 };
  });
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(flipped, true, "the mid-send flip must have run");
  assert.equal(calls.length, 1, "only d1 may be sent to");
  assert.equal(calls[0].sub.endpoint, "https://push.example.com/t1");
  const pub = svc.tables.daily_content_publications[0];
  assert.equal(pub.recipients_sent, 1);
  const d2row = svc.tables.daily_content_deliveries.find((d) => d.device_id === "d2");
  assert.ok(d2row, "d2 must still have a delivery row (closed, not sent)");
  assert.equal(d2row.status, "failed");
  assert.equal(d2row.error, "device opted out of daily content");
  assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 1);
  assert.ok(svc.stats.recheckQueries >= 1, `re-check must have run (got ${svc.stats.recheckQueries})`);
});

await checkAsync("S-6 retry tick: opt-out landing mid-tick is respected (d2 row closed, zero sends to d2)", async () => {
  const pub = { id: "pub-o", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [pub],
    tokens: [token("t1", "d1"), token("t2", "d2")],
    deliveries: [
      { id: "o1", publication_id: "pub-o", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
      { id: "o2", publication_id: "pub-o", token_id: "t2", device_id: "d2", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  let flipped = false;
  const calls = setWebpush(() => {
    if (!flipped) {
      flipped = true;
      svc.tables.daily_content_preferences.push({ device_id: "d2", daily_enabled: false });
    }
    return { statusCode: 201 };
  });
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(flipped, true, "the mid-tick flip must have run");
  assert.equal(calls.length, 1, "only d1 may be retried");
  const o1 = svc.tables.daily_content_deliveries.find((d) => d.id === "o1");
  const o2 = svc.tables.daily_content_deliveries.find((d) => d.id === "o2");
  assert.equal(o1.status, "sent");
  assert.equal(o2.status, "failed");
  assert.equal(o2.error, "device opted out of daily content");
  assert.ok(svc.stats.recheckQueries >= 1, `re-check must have run (got ${svc.stats.recheckQueries})`);
});

await checkAsync("regression: pre-existing opt-out (snapshot path) still respected", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2")],
    prefs: [{ device_id: "d2", daily_enabled: false }],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_deliveries.length, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].device_id, "d1");
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
