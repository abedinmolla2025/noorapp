// daily-content self-healing tick tests (owner-approved 2026-11-16).
//
// The retry tick with { "retry_only": true, "heal": true } runs the
// retry pass unchanged, then runs the daily publication path ONLY when
// today has no publication row or a failed row — so a missed 06:00 run
// no longer means a lost day. A planned row is left to the tick; a
// published row is left alone. The daily path is idempotent, so a race
// with a concurrent daily run can only dedupe or 500 on the H3 flip.
//
// Stages the REAL daily-content/index.ts (s6-style stubs: only the two
// esm.sh imports change) with an in-memory fake Supabase, following the
// vapid-lazy.test.mjs harness. Covers: heal creates exactly one
// publication + one send; second tick creates no duplicate; plain
// retry_only still creates nothing; paused fails closed; failed-row
// repair in place; planned-row left alone; heal+dry_run is 400;
// no-valid-plan records one failed row; the daily path itself is
// unchanged by the publishPlan extraction (publish once, second call
// dedupes).
//
// Run: node supabase/functions/daily-content/heal-mode.test.mjs
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

const todayKolkata = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

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
const pushPayload = () => ({
  title: "TITLE", body: "BODY", deep_link: "/hadith",
  icon: "https://www.noorapp.in/notification-icon.png",
  badge: "https://www.noorapp.in/badge-icon.png", image_url: null,
});

async function stage(env) {
  const stageDir = mkdtempSync(join(tmpdir(), "p2-daily-heal-"));
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

async function callEdge(handler, body, secret = CRON) {
  const req = new Request("http://edge/functions/v1/daily-content", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
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

const ENV = {
  SUPABASE_URL: "http://stub",
  SUPABASE_SERVICE_ROLE_KEY: "key",
  WEBPUSH_VAPID_PUBLIC_KEY: "pub",
  WEBPUSH_VAPID_PRIVATE_KEY: "priv",
  DAILY_CONTENT_CRON_SECRET: CRON,
};

const baseSeed = () => ({
  settings: [{ enabled: true }],
  hadiths: [hadithRow()],
  duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
  tokens: [token("t1", "d1")],
});

// ---- heal tests ----
{
  const { stageDir, stubs, handler } = await stage(ENV);

  await checkAsync("wrong CRON secret -> 401 (auth gate intact)", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true }, "wrong-secret");
    assert.equal(res.status, 401);
    assert.equal(svc.tables.daily_content_publications.length, 0);
  });

  await checkAsync("heal tick with no publication -> creates exactly one, sends once, healed:true", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, true);
    assert.equal(res.json.kolkata_date, todayKolkata());
    assert.ok(res.json.heal?.publication_id, "heal result must carry publication_id");
    assert.equal(res.json.heal.delivery.sent, 1);
    assert.equal(res.json.tick.retried, 0);
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(svc.tables.daily_content_publications[0].kolkata_date, todayKolkata());
    assert.equal(svc.tables.daily_content_publications[0].push.image_url, null, "healed publication is text-only");
    assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 1);
    assert.equal(calls.length, 1, "exactly one provider send");
  });

  await checkAsync("second heal tick -> healed:false, no duplicate publication, no second send", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(first.json.healed, true);
    const second = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(second.status, 200);
    assert.equal(second.json.ok, true);
    assert.equal(second.json.healed, false);
    assert.equal(svc.tables.daily_content_publications.length, 1, "still exactly one publication");
    assert.equal(svc.tables.daily_content_deliveries.length, 1, "still exactly one delivery row");
    assert.equal(calls.length, 1, "no second provider send");
  });

  await checkAsync("plain retry_only (no heal) with no publication -> creates nothing (old behaviour)", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.retried, 0);
    assert.equal("healed" in res.json, false, "plain tick must not report heal");
    assert.equal(svc.tables.daily_content_publications.length, 0);
    assert.equal(calls.length, 0);
  });

  await checkAsync("heal tick while paused -> {ok:false, reason:paused}, nothing created or sent", async () => {
    const svc = makeSvc({ ...baseSeed(), settings: [{ enabled: false }] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.reason, "paused");
    assert.equal(svc.tables.daily_content_publications.length, 0);
    assert.equal(calls.length, 0);
  });

  await checkAsync("heal tick with a failed row -> repairs it in place (same id), publishes, sends once", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      publications: [{
        id: "pub-failed", kolkata_date: todayKolkata(), status: "failed",
        hadith_ref: null, hadith_source_line: null, cards: [], push: null,
        hadith_cycle: 1, card_cycle: 1, error: "No eligible hadith in the pool.",
      }],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.healed, true);
    assert.equal(res.json.heal.publication_id, "pub-failed", "repaired in place, no second row");
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1);
  });

  await checkAsync("heal tick with a planned row -> leaves it planned, tick recovers its deliveries, no re-plan", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      publications: [{
        id: "pub-planned", kolkata_date: todayKolkata(), status: "planned",
        hadith_ref: "hadith:h1", hadith_source_line: "Sahih al-Bukhari, Hadith 1",
        cards: [], push: pushPayload(), hadith_cycle: 1, card_cycle: 1, error: null,
      }],
      deliveries: [{
        id: "del-1", publication_id: "pub-planned", token_id: "t1", device_id: "d1",
        platform: "web", status: "pending", attempts: 0,
        next_attempt_at: "2026-01-01T00:00:00.000Z",
      }],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, false, "planned row is not re-planned by a heal tick");
    assert.equal(res.json.tick.promoted, 1, "tick promoted the stranded pending delivery");
    assert.equal(res.json.tick.sent, 1, "tick sent the promoted delivery");
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "planned", "row stays planned (tick never flips)");
    assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
    assert.equal(calls.length, 1);
  });

  await checkAsync("heal tick with a published row -> healed:false, retries only, no re-send", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      publications: [{
        id: "pub-done", kolkata_date: todayKolkata(), status: "published",
        hadith_ref: "hadith:h1", hadith_source_line: "Sahih al-Bukhari, Hadith 1",
        cards: [], push: pushPayload(), hadith_cycle: 1, card_cycle: 1, error: null,
        recipients_total: 1, recipients_sent: 1, recipients_failed: 0,
      }],
      deliveries: [{
        id: "del-1", publication_id: "pub-done", token_id: "t1", device_id: "d1",
        platform: "web", status: "sent", attempts: 1,
        next_attempt_at: "2026-01-01T00:00:00.000Z",
      }],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.healed, false);
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(calls.length, 0, "no re-send to an already-sent device");
  });

  await checkAsync("heal + dry_run -> 400 (existing rule preserved)", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true, dry_run: true });
    assert.equal(res.status, 400);
    assert.equal(svc.tables.daily_content_publications.length, 0);
  });

  await checkAsync("heal tick with no valid plan -> one failed row, second tick adds no second row", async () => {
    const svc = makeSvc({ ...baseSeed(), hadiths: [] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(first.status, 200);
    assert.equal(first.json.ok, false);
    assert.equal(first.json.healed, false);
    assert.ok(first.json.reason, "failure reason must be reported");
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "failed");
    const second = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(second.json.ok, false);
    assert.equal(svc.tables.daily_content_publications.length, 1, "still exactly one failed row");
  });

  await checkAsync("daily path unchanged by the extraction: publish once, second call dedupes", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, {});
    assert.equal(first.status, 200);
    assert.equal(first.json.ok, true);
    assert.ok(first.json.publication_id);
    assert.equal(first.json.delivery.sent, 1);
    const second = await callEdge(handler, {});
    assert.equal(second.status, 200);
    assert.equal(second.json.ok, true);
    assert.equal(second.json.deduped, true);
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(calls.length, 1, "no second send on a deduped daily run");
  });

  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
