// daily-content split-flow self-healing tick tests (Phase 3 —
// Hold/Quarantine + self-healing, owner-authorized 2026-11-16).
//
// The retry tick with { "retry_only": true, "heal": true } runs the
// retry pass unchanged, then heals ONLY through the split flow — it
// NEVER flips a row to published on its own, EXCEPT the text-only
// fallback (owner decision 2026-11-23): with the text_only_fallback
// setting on, a quarantined row publishes text-only (see
// text-only-fallback.test.mjs). With the flag off (the default in
// these tests) it NEVER sends a text-only push:
//   - no row / failed row  -> plan-only (planned row, no send, no flip)
//   - planned + poster QC-passed -> publishPlanned (first send WITH
//     the poster image — the only send in heal)
//   - planned + poster failed    -> HOLD (poster_failed; poster
//     workflow should retry)
//   - planned + quarantined      -> HOLD (quarantined; no dispatch)
//     when the fallback flag is off; publishes TEXT-ONLY when on
//   - planned + poster pending   -> HOLD (poster_pending; dispatch
//     the poster workflow)
//   - published row              -> healed:false (nothing to do)
//
// The old text-only heal (self-healing branch: publishPlan() with
// image_url null) is SUPERSEDED by this behaviour — the old
// heal-mode.test.mjs assertions (heal creates a PUBLISHED row + sends)
// must NOT be ported; they test the removed behaviour.
//
// Also covers: set_poster quarantine (2nd same-day failure gains the
// `quarantined:` prefix), set_poster passed-after-failed (the E2E
// recovery path), and the publish_planned 409 gate on a held row.
//
// Stages the REAL daily-content/index.ts (s6-style stubs: only the two
// esm.sh imports change) with an in-memory fake Supabase, following
// the vapid-lazy.test.mjs / heal-mode.test.mjs harness.
//
// Run: node supabase/functions/daily-content/heal-splitflow.test.mjs
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
  // Fault injection (tests only): when set, the next publication-flip
  // update (patch status "published") matches zero rows — the
  // concurrency-guard failure a second worker winning the flip
  // produces in production. Fires once, then clears itself.
  const flags = { zeroRowFlip: false };
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
          if (flags.zeroRowFlip && this.table === "daily_content_publications" && this.patch?.status === "published") {
            flags.zeroRowFlip = false;
            resolve({ data: [], error: null }); // success, zero rows — no mutation
            return;
          }
          const rs = this.rows();
          for (const r of rs) Object.assign(r, this.patch);
          resolve({ data: rs, error: null });
          return;
        }
        resolve({ data: this.inserted ?? (this.head ? [] : this.rows()), count: this.rows().length, error: null });
      } catch (e) { reject(e); }
    }
  }
  return { tables, flags, from: (table) => new Q(table) };
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
const posterUrlFor = (date) =>
  `http://stub/storage/v1/object/public/daily-content-posters/${date}/portrait.png`;

async function stage(env) {
  const stageDir = mkdtempSync(join(tmpdir(), "p3-daily-heal-"));
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

const plannedRow = (over = {}) => ({
  id: "pub-planned", kolkata_date: todayKolkata(), status: "planned",
  hadith_ref: "hadith:h1", hadith_source_line: "Sahih al-Bukhari, Hadith 1",
  // The gate (V1/V2/V3) verifies the stored cards against the live
  // rows at publish time, so the fixture row carries a complete,
  // verbatim hadith card for the seeded live hadith h1.
  cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-H", bengali: "BENGALI-H", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
  push: pushPayload(), hadith_cycle: 1, card_cycle: 1,
  error: null, poster_qc_status: null, poster_error: null, poster_url: null,
  ...over,
});

// ---- split-flow heal tests ----
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

  await checkAsync("heal tick with no publication -> exactly one PLANNED row, no send, healed:'planned'", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, "planned");
    assert.equal(res.json.hold, null);
    assert.equal(res.json.kolkata_date, todayKolkata());
    assert.ok(res.json.publication_id, "heal result must carry publication_id");
    assert.equal(res.json.channels.website, "planned");
    assert.equal(res.json.channels.facebook, "not_implemented");
    assert.equal("alert" in res.json, false, "a planned heal is recovery in progress, not an alert");
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "planned", "heal NEVER publishes on its own");
    assert.equal(svc.tables.daily_content_publications[0].kolkata_date, todayKolkata());
    assert.equal(calls.length, 0, "no provider send from a heal-plan");
  });

  await checkAsync("second heal tick on a planned row -> hold:'poster_pending', no send, no re-plan", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(first.json.healed, "planned");
    const second = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(second.status, 200);
    assert.equal(second.json.ok, true);
    assert.equal(second.json.healed, false);
    assert.equal(second.json.hold, "poster_pending");
    assert.equal(svc.tables.daily_content_publications.length, 1, "still exactly one publication");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0, "no send while the poster is pending");
  });

  await checkAsync("heal on a planned row with a failed poster -> hold:'poster_failed' + warn alert, no send, no re-plan", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({ poster_qc_status: "failed", poster_error: "render_or_upload_failed:square" })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, false);
    assert.equal(res.json.hold, "poster_failed");
    assert.equal(res.json.alert.level, "warn");
    assert.equal(res.json.publication_id, "pub-planned");
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "planned", "a held row stays planned");
    assert.deepEqual(svc.tables.daily_content_publications[0].cards, [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-H", bengali: "BENGALI-H", sourceLine: "Sahih al-Bukhari, Hadith 1" }], "the plan is not rewritten");
    assert.equal(calls.length, 0, "a held row is never sent text-only");
  });

  await checkAsync("heal on a quarantined row -> hold:'quarantined' + critical alert, no send", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({ poster_qc_status: "failed", poster_error: "quarantined:render_or_upload_failed:square" })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.healed, false);
    assert.equal(res.json.hold, "quarantined");
    assert.equal(res.json.alert.level, "critical");
    assert.equal(res.json.channels.website, "quarantined");
    assert.equal(calls.length, 0);
  });

  await checkAsync("heal on a planned row with a QC-passed poster -> publishes WITH the image, healed:true", async () => {
    const url = posterUrlFor(todayKolkata());
    // Full poster fields: the gate (V8) re-validates the stored
    // poster at publish time. Scene intention-sunrise: the fixture
    // hadith is chapter 1 -> classified "intentions" (V5).
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({
      poster_qc_status: "passed", poster_url: url,
      poster_urls: { portrait: url },
      poster_asset_id: `poster:${todayKolkata()}`,
      poster_storage_path: `daily-content-posters/${todayKolkata()}/portrait.png`,
      poster_checksum: "a".repeat(64),
      poster_checksums: { portrait: "a".repeat(64) },
      poster_scene_id: "intention-sunrise",
      poster_generated_at: `${todayKolkata()}T02:00:00.000Z`,
    })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, true);
    assert.equal(res.json.hold, null);
    assert.equal(res.json.publication_id, "pub-planned");
    assert.equal(res.json.channels.website, "published");
    assert.equal(res.json.channels.push.sent, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1, "exactly one provider send");
    const sentPayload = typeof calls[0].payload === "string" ? JSON.parse(calls[0].payload) : calls[0].payload;
    assert.equal(sentPayload.image_url, url, "the first send carries the finalized poster image");
    assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 1);
  });

  await checkAsync("heal on a planned row whose content fails the gate -> hold:'gate_hold', zero sends, row stays planned", async () => {
    const url = posterUrlFor(todayKolkata());
    // The poster is QC-passed, but the stored card's Bengali differs
    // from the live hadith — the gate (V3) holds the publication and
    // heal maps it to its own hold state, not publish_failed.
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({
      cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-H", bengali: "BENGALI-CHANGED", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
      poster_qc_status: "passed", poster_url: url,
      poster_urls: { portrait: url },
      poster_asset_id: `poster:${todayKolkata()}`,
      poster_storage_path: `daily-content-posters/${todayKolkata()}/portrait.png`,
      poster_checksum: "a".repeat(64),
      poster_checksums: { portrait: "a".repeat(64) },
      poster_scene_id: "intention-sunrise",
      poster_generated_at: `${todayKolkata()}T02:00:00.000Z`,
    })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, false);
    assert.equal(res.json.hold, "gate_hold");
    assert.ok(res.json.alerts.some((a) => a.reason.includes("bengali_editorial_quality")), "the alert names the failed validation");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(svc.tables.daily_content_publications[0].error, "gate_hold:bengali_editorial_quality");
    assert.equal(calls.length, 0, "a held row sends nothing");
  });

  await checkAsync("heal on a QC-passed row whose publish flip matches zero rows -> hold:'publish_failed' + warn alert, then a second tick recovers without re-sending", async () => {
    // D-P1-7 (was code-reviewed only): the publish_failed hold branch
    // executes when publishPlanned fails for a reason other than a gate
    // hold. The flip fails AFTER the send, so the push went out once
    // and the row stays planned; the next tick publishes it without
    // sending the same device twice.
    const url = posterUrlFor(todayKolkata());
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({
      poster_qc_status: "passed", poster_url: url,
      poster_urls: { portrait: url },
      poster_asset_id: `poster:${todayKolkata()}`,
      poster_storage_path: `daily-content-posters/${todayKolkata()}/portrait.png`,
      poster_checksum: "a".repeat(64),
      poster_checksums: { portrait: "a".repeat(64) },
      poster_scene_id: "intention-sunrise",
      poster_generated_at: `${todayKolkata()}T02:00:00.000Z`,
    })] });
    svc.flags.zeroRowFlip = true; // the publish flip matches zero rows (another worker won)
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, false);
    assert.equal(res.json.hold, "publish_failed");
    assert.equal(res.json.alert.level, "warn");
    assert.match(res.json.alert.reason, /publish_planned failed: Publication flip affected 0 rows/);
    assert.equal(svc.tables.daily_content_publications[0].status, "planned", "a failed flip never marks the row published");
    assert.equal(calls.length, 1, "the send happened before the flip failed — the push went out once");
    assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 1);
    // Second tick: the flag is spent, so the flip succeeds; the
    // already-sent device is skipped, never re-sent.
    const second = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(second.json.ok, true);
    assert.equal(second.json.healed, true);
    assert.equal(second.json.hold, null);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1, "recovery never re-sends the same device");
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

  await checkAsync("heal + dry_run -> 400 (existing rule preserved)", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true, dry_run: true });
    assert.equal(res.status, 400);
    assert.equal(svc.tables.daily_content_publications.length, 0);
  });

  await checkAsync("heal without retry_only -> 400 (must not fall through to the daily branch)", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { heal: true });
    assert.equal(res.status, 400);
    assert.equal(svc.tables.daily_content_publications.length, 0);
    assert.equal(calls.length, 0, "a bare heal must never send");
  });

  await checkAsync("heal + plan_only -> 400 (mutually exclusive)", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true, plan_only: true });
    assert.equal(res.status, 400);
    assert.equal(svc.tables.daily_content_publications.length, 0);
  });

  await checkAsync("heal tick with no valid plan -> one failed row, hold:'no_valid_plan' + critical alert, no second row", async () => {
    const svc = makeSvc({ ...baseSeed(), hadiths: [] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(first.status, 200);
    assert.equal(first.json.ok, false);
    assert.equal(first.json.healed, false);
    assert.equal(first.json.hold, "no_valid_plan");
    assert.equal(first.json.alert.level, "critical");
    assert.ok(first.json.reason, "failure reason must be reported");
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "failed");
    const second = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(second.json.ok, false);
    assert.equal(svc.tables.daily_content_publications.length, 1, "still exactly one failed row");
  });

  await checkAsync("heal tick with a failed row + valid plan -> repairs in place (same id), healed:'planned', no send", async () => {
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
    assert.equal(res.json.healed, "planned");
    assert.equal(res.json.publication_id, "pub-failed", "repaired in place, no second row");
    assert.equal(svc.tables.daily_content_publications.length, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0, "a repaired row is planned, not sent");
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

  await checkAsync("heal on a planned row with a corrupt (null) push + passed poster -> repair, then publish with image", async () => {
    const url = posterUrlFor(todayKolkata());
    // Full poster fields (see the QC-passed test above): the second
    // tick publishes the repaired row through the gate (V8).
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({
      push: null, poster_qc_status: "passed", poster_url: url,
      poster_urls: { portrait: url },
      poster_asset_id: `poster:${todayKolkata()}`,
      poster_storage_path: `daily-content-posters/${todayKolkata()}/portrait.png`,
      poster_checksum: "a".repeat(64),
      poster_checksums: { portrait: "a".repeat(64) },
      poster_scene_id: "intention-sunrise",
      poster_generated_at: `${todayKolkata()}T02:00:00.000Z`,
    })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(first.json.healed, "planned", "corrupt row is repaired in place, not published yet");
    assert.equal(first.json.publication_id, "pub-planned");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.ok(svc.tables.daily_content_publications[0].push, "the repair restores the stored push");
    assert.equal(svc.tables.daily_content_publications[0].poster_qc_status, "passed", "the repair keeps the passed poster");
    assert.equal(calls.length, 0);
    const second = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(second.json.healed, true, "the next tick publishes the repaired row with its poster");
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1);
    const sentPayload = typeof calls[0].payload === "string" ? JSON.parse(calls[0].payload) : calls[0].payload;
    assert.equal(sentPayload.image_url, url);
  });

  await checkAsync("duplicate heal after a plan -> still one row, no sends", async () => {
    const svc = makeSvc(baseSeed());
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(first.json.healed, "planned");
    const second = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(second.json.healed, false);
    assert.equal(second.json.hold, "poster_pending");
    const third = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(third.json.healed, false);
    assert.equal(svc.tables.daily_content_publications.length, 1, "still exactly one publication");
    assert.equal(calls.length, 0, "no send across three heal ticks");
  });

  await checkAsync("set_poster: first failure records the reason, second same-day failure quarantines", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow()] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const first = await callEdge(handler, { action: "set_poster", kolkata_date: todayKolkata(), poster_qc_status: "failed", poster_error: "render_or_upload_failed:square" });
    assert.equal(first.status, 200);
    assert.equal(first.json.ok, true);
    assert.equal(first.json.poster_qc_status, "failed");
    assert.equal("quarantined" in first.json, false, "the first failure is a hold, not a quarantine");
    assert.equal(svc.tables.daily_content_publications[0].poster_error, "render_or_upload_failed:square");
    const second = await callEdge(handler, { action: "set_poster", kolkata_date: todayKolkata(), poster_qc_status: "failed", poster_error: "render_or_upload_failed:square" });
    assert.equal(second.status, 200);
    assert.equal(second.json.ok, true);
    assert.equal(second.json.quarantined, true, "the second same-day failure quarantines the row");
    assert.ok(svc.tables.daily_content_publications[0].poster_error.startsWith("quarantined:"), "the stored error gains the prefix");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned", "quarantine never publishes the row");
  });

  await checkAsync("set_poster passed after a failure clears the error (the E2E recovery path)", async () => {
    const date = todayKolkata();
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({ poster_qc_status: "failed", poster_error: "render_or_upload_failed:square", poster_generated_at: new Date().toISOString() })] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, {
      action: "set_poster", kolkata_date: date, poster_qc_status: "passed",
      poster_asset_id: `poster:${date}`, poster_storage_path: `daily-content-posters/${date}/portrait.png`,
      poster_url: posterUrlFor(date), poster_urls: { portrait: posterUrlFor(date) },
      poster_checksum: "7c7427f4147a86f2adef50e80229a250a036de132ce8b05fa0b734e366c92d52",
      poster_checksums: { portrait: "7c7427f4147a86f2adef50e80229a250a036de132ce8b05fa0b734e366c92d52" },
      poster_scene_id: "library",
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.poster_qc_status, "passed");
    assert.equal(svc.tables.daily_content_publications[0].poster_error, null, "a pass clears the hold");
    assert.equal(svc.tables.daily_content_publications[0].poster_url, posterUrlFor(date));
  });

  await checkAsync("publish_planned on a held row -> 409 poster_not_ready (gate intact)", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow({ poster_qc_status: "failed", poster_error: "render_or_upload_failed:square" })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 409);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.reason, "poster_not_ready");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0, "a held row is never published");
  });

  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
