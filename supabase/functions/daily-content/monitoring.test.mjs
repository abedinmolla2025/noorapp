// daily-content monitoring tests (Phase 10 — autonomous monitoring &
// alerts, owner-authorized 2026-11-16).
//
// The heal/retry tick response now carries Phase 10 observability:
//   - `schedule`: { status: ok|late|missed, expected_at (06:00 IST),
//     grace_until (06:30 IST), published_at, ... } — assessed on the day
//     AS THE TICK FOUND IT (before any healing action), so a missed day
//     that gets healed still reports schedule:"missed".
//   - `retry`: { retryable, attempts_remaining, publication_id } — how
//     many of today's deliveries are still retryable and how many
//     attempts they have left.
//   - `alerts`: deduped [critical|warn] list — the single `alert` object
//     (kept for backward compatibility) plus a schedule_missed alert
//     when the schedule is missed.
//   - The plain retry tick ({ retry_only: true }, no heal) carries
//     `schedule` + `retry` too.
//
// The pure schedule logic is tested exhaustively (deterministic, explicit
// `now`) in the lib suite (scripts/daily-content/tests.mjs — the
// monitoring module). These tests verify the WIRING: the field is
// present in the real handler response and matches the seeded row.
// Time is controlled with a fixed-Date override (restored after each
// case); the staged edge module reads the global Date at call time.
//
// Run: node supabase/functions/daily-content/monitoring.test.mjs
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

const kolkataDateOf = (d) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
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
  const stageDir = mkdtempSync(join(tmpdir(), "p10-daily-monitoring-"));
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
  DAILY_CONTENT_CRON_SECRET: "test-cron-secret",
};

// ---- fixed-time control: the staged edge module reads the global Date
// at call time, so a subclass returning a fixed instant controls both
// kolkataDate and the schedule assessment. Restored after each case.
const RealDate = globalThis.Date;
function fixTime(iso) {
  const fixed = new RealDate(iso).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  }
  globalThis.Date = FixedDate;
}
function restoreTime() { globalThis.Date = RealDate; }

const baseSeed = () => ({
  settings: [{ enabled: true }],
  hadiths: [hadithRow()],
  duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
  tokens: [token("t1", "d1")],
});

const pubRow = (date, over = {}) => ({
  id: "pub-1", kolkata_date: date, status: "published",
  hadith_ref: "hadith:h1", hadith_source_line: "Sahih al-Bukhari, Hadith 1",
  cards: [{ kind: "hadith" }], push: pushPayload(), hadith_cycle: 1, card_cycle: 1,
  error: null, poster_qc_status: "passed", poster_error: null,
  poster_url: `http://stub/storage/v1/object/public/daily-content-posters/${date}/portrait.png`,
  recipients_total: 9, recipients_sent: 9, recipients_failed: 0,
  created_at: `${date}T00:35:00.000Z`, published_at: `${date}T00:35:00.000Z`,
  ...over,
});
const deliveryRow = (over = {}) => ({
  id: "del-1", publication_id: "pub-1", device_id: "d1", token_id: "t1",
  platform: "web", status: "retryable", attempts: 1, max_attempts: 4,
  error: null, next_attempt_at: "2026-11-19T00:00:00.000Z",
  created_at: "2026-11-18T00:40:00.000Z", ...over,
});

// Fixed day for every case: 2026-11-18. 06:05 IST = 00:35 UTC,
// 12:39 IST = 07:09 UTC, 10:00 IST = 04:30 UTC, 05:30 IST = 00:00 UTC.
const DAY = "2026-11-18";
const AT_1000 = "2026-11-18T04:30:00.000Z";
const AT_0530 = "2026-11-18T00:00:00.000Z";
const AT_1300 = "2026-11-18T07:30:00.000Z";

// ---- monitoring wiring tests ----
{
  const { stageDir, stubs, handler } = await stage(ENV);

  await checkAsync("heal, no row at 10:00 IST -> schedule missed, healed planned, schedule_missed alert", async () => {
    fixTime(AT_1000);
    try {
      const svc = makeSvc(baseSeed());
      stubs.holder.svc = svc;
      setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.healed, "planned");
      assert.equal(res.json.schedule.status, "missed");
      assert.equal(res.json.schedule.kolkata_date, DAY);
      assert.equal(res.json.schedule.expected_at, "2026-11-18T00:30:00.000Z");
      assert.equal(res.json.schedule.grace_until, "2026-11-18T01:00:00.000Z");
      assert.equal(res.json.schedule.window, "closed");
      assert.equal(res.json.retry.retryable, 0);
      assert.equal(res.json.retry.attempts_remaining, 0);
      const missed = (res.json.alerts ?? []).find((a) => a.reason.startsWith("schedule_missed:"));
      assert.ok(missed, "schedule_missed alert present");
      assert.equal(missed.level, "critical");
      assert.equal(missed.kolkata_date, DAY);
    } finally { restoreTime(); }
  });

  await checkAsync("heal, published 06:05 IST at 10:00 IST -> schedule ok, healed false, no alerts", async () => {
    fixTime(AT_1000);
    try {
      const svc = makeSvc({ ...baseSeed(), publications: [pubRow(DAY)] });
      stubs.holder.svc = svc;
      setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.healed, false);
      assert.equal(res.json.schedule.status, "ok");
      assert.equal(res.json.schedule.published_at, `${DAY}T00:35:00.000Z`);
      assert.deepEqual(res.json.alerts, []);
      assert.equal(res.json.alert, undefined);
    } finally { restoreTime(); }
  });

  await checkAsync("heal, published 12:39 IST (the 2026-11-16 shape) -> schedule late", async () => {
    fixTime(AT_1300);
    try {
      const svc = makeSvc({ ...baseSeed(), publications: [pubRow(DAY, { published_at: `${DAY}T07:09:00.000Z` })] });
      stubs.holder.svc = svc;
      setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.schedule.status, "late");
      assert.deepEqual(res.json.alerts, []);
    } finally { restoreTime(); }
  });

  await checkAsync("heal, no row at 05:30 IST -> schedule ok (window open), healed planned", async () => {
    fixTime(AT_0530);
    try {
      const svc = makeSvc(baseSeed());
      stubs.holder.svc = svc;
      setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.healed, "planned");
      assert.equal(res.json.schedule.status, "ok");
      assert.equal(res.json.schedule.window, "open");
      assert.deepEqual(res.json.alerts, []);
    } finally { restoreTime(); }
  });

  await checkAsync("heal, published row + 2 leased retryable deliveries -> retry summary 2 / 4 remaining", async () => {
    fixTime(AT_1000);
    try {
      const svc = makeSvc({
        ...baseSeed(),
        publications: [pubRow(DAY)],
        deliveries: [
          deliveryRow({ id: "del-1", attempts: 1, max_attempts: 4 }),
          deliveryRow({ id: "del-2", attempts: 3, max_attempts: 4 }),
          deliveryRow({ id: "del-3", status: "failed", attempts: 4, max_attempts: 4, error: "gone" }),
        ],
      });
      stubs.holder.svc = svc;
      setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.schedule.status, "ok");
      assert.equal(res.json.retry.retryable, 2);
      assert.equal(res.json.retry.attempts_remaining, 4);
      assert.equal(res.json.retry.publication_id, "pub-1");
    } finally { restoreTime(); }
  });

  await checkAsync("plain tick carries schedule + retry (no heal)", async () => {
    fixTime(AT_1000);
    try {
      const svc = makeSvc({
        ...baseSeed(),
        publications: [pubRow(DAY)],
        deliveries: [deliveryRow({ id: "del-1", attempts: 1, max_attempts: 4 })],
      });
      stubs.holder.svc = svc;
      setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, true);
      assert.equal(res.json.schedule.status, "ok");
      assert.equal(res.json.retry.retryable, 1);
      assert.equal(res.json.retry.attempts_remaining, 3);
    } finally { restoreTime(); }
  });

  await checkAsync("quarantined row at 10:00 IST -> alerts has quarantined + schedule_missed, alert kept", async () => {
    fixTime(AT_1000);
    try {
      const svc = makeSvc({
        ...baseSeed(),
        publications: [pubRow(DAY, {
          status: "planned", poster_qc_status: "failed",
          poster_error: "quarantined:bengali_overflow_at_min", poster_url: null,
          published_at: null, recipients_total: 0, recipients_sent: 0, recipients_failed: 0,
        })],
      });
      stubs.holder.svc = svc;
      setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.hold, "quarantined");
      assert.equal(res.json.schedule.status, "missed");
      assert.ok(res.json.alert, "single alert kept for backward compatibility");
      assert.equal(res.json.alert.level, "critical");
      assert.equal((res.json.alerts ?? []).length, 2);
      assert.ok((res.json.alerts ?? []).some((a) => a.reason.startsWith("quarantined:")));
      assert.ok((res.json.alerts ?? []).some((a) => a.reason.startsWith("schedule_missed:")));
    } finally { restoreTime(); }
  });

  await checkAsync("heal behaviour unchanged: planned + failed poster -> hold poster_failed, no send", async () => {
    fixTime(AT_1000);
    try {
      const svc = makeSvc({
        ...baseSeed(),
        publications: [pubRow(DAY, {
          status: "planned", poster_qc_status: "failed", poster_error: "bengali_overflow_at_min",
          poster_url: null, published_at: null,
          recipients_total: 0, recipients_sent: 0, recipients_failed: 0,
        })],
      });
      stubs.holder.svc = svc;
      const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.hold, "poster_failed");
      assert.equal(res.json.healed, false);
      assert.equal(calls.length, 0);
      assert.equal(res.json.schedule.status, "missed");
      assert.equal((res.json.alerts ?? []).length, 2);
    } finally { restoreTime(); }
  });

  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\nmonitoring tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
