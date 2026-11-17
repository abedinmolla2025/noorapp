// daily-content Mode A/B + per-channel switches tests (Phase 6 —
// Admin Panel & autonomous operations, owner-authorized 2026-11-16).
//
// Covers:
//   - modeSettingsFromRow fail-closed defaults (missing/invalid
//     settings -> Mode B, nothing auto-publishes, nothing silently
//     enabled) + validateModeARun (the server-side Mode A gate).
//   - planDay consumes runs by MODE: Mode B approved-only (unchanged);
//     Mode A consumes a pending_review run ONLY when it passes the
//     gate; a failed gate / rejected run / malformed ref falls back
//     to the seeded selection, never partially consumed.
//   - publish_planned per-channel gates: website_auto_publish ===
//     false -> 409 website_paused (row stays planned);
//     push_enabled === false -> flips WITHOUT sending (delivery
//     zeroed, push_paused reported); legacy settings (no new columns)
//     publish exactly as before.
//   - update_settings (admin-JWT gated, audit-logged): 401/403,
//     master `enabled` toggle refused (403), unknown/non-boolean
//     rejected (400), audit row written only for a real admin UUID.
//   - heal-tick Facebook disposition (Phase 4 gap): not_implemented
//     (no Facebook columns), manual (auto-publish off), paused,
//     not_configured (auto-publish on, no token), queued (Mode B,
//     zero Graph calls), published (Mode A, mocked Graph API),
//     failed (Mode A, retryable Graph failure).
//
// Stages the REAL daily-content/index.ts (s6-style stubs: only the two
// esm.sh imports change) with an in-memory fake Supabase + a mocked
// Graph API, following the heal-splitflow / facebook test harness.
//
// Run: node supabase/functions/daily-content/mode-ab.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const CRON = "test-cron-secret";
const ADMIN_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "22222222-2222-4222-8222-222222222222";
const PAGE_ID = "123456789";
const POST_ID = "123456789_987654321";
const PERMALINK = "https://www.facebook.com/123456789/posts/987654321";

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
    daily_content_facebook_posts: seed.fbPosts ?? [],
    admin_audit_log: seed.audit ?? [],
    profiles: seed.profiles ?? [],
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
  const svc = { tables, from: (table) => new Q(table) };
  // Admin-JWT verification (verifyAdmin in the edge code creates an
  // anon client via the same stubbed createClient, so holder.svc
  // carries auth + rpc here).
  svc.auth = {
    getClaims: async (jwt) => {
      if (jwt === "admin-jwt") return { data: { claims: { sub: ADMIN_UUID } }, error: null };
      if (jwt === "display-jwt") return { data: { claims: { sub: "an-admin-display-name" } }, error: null };
      if (jwt === "user-jwt") return { data: { claims: { sub: USER_UUID } }, error: null };
      return { data: null, error: new Error("invalid jwt") };
    },
  };
  svc.rpc = async (fn, args) => {
    if (fn === "is_admin") {
      return { data: args?._user_id === ADMIN_UUID || args?._user_id === "an-admin-display-name", error: null };
    }
    return { data: null, error: new Error("unknown rpc " + fn) };
  };
  return svc;
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
const plannedRow = (over = {}) => ({
  id: "pub-planned", kolkata_date: todayKolkata(), status: "planned",
  hadith_ref: "hadith:h1", hadith_source_line: "Sahih al-Bukhari, Hadith 1",
  cards: [{ kind: "hadith" }], push: pushPayload(), hadith_cycle: 1, card_cycle: 1,
  error: null, poster_qc_status: "passed", poster_url: posterUrlFor(todayKolkata()),
  poster_urls: { portrait: posterUrlFor(todayKolkata()) },
  ...over,
});
const publishedRow = (over = {}) => ({
  id: "pub-fb", kolkata_date: todayKolkata(), status: "published",
  hadith_ref: "hadith:h1", hadith_source_line: "Sahih al-Bukhari, Hadith 1",
  cards: [{
    kind: "hadith",
    bengali: "বাংলা হাদিসের পাঠ — সংক্ষিপ্ত উদ্ধৃতি।",
    sourceLine: "Sahih al-Bukhari, Hadith 1",
    canonicalLink: "/hadith/bukhari/1",
  }],
  push: pushPayload(),
  poster_qc_status: "passed", poster_url: posterUrlFor(todayKolkata()),
  poster_urls: { portrait: posterUrlFor(todayKolkata()) },
  ...over,
});
const runRow = (over = {}) => ({
  id: "run-1", kolkata_date: todayKolkata(), hijri_key: "1447-01-01",
  context: {}, recommendations: [], dropped: [], status: "pending_review",
  created_by: "admin-1", created_at: "2026-11-17T02:00:00.000Z",
  ...over,
});

async function stage(env) {
  const stageDir = mkdtempSync(join(tmpdir(), "p6-daily-mode-"));
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
  const edge = await import(pathToFileURL(join(stageDir, "edge.ts")).href);
  assert.ok(capturedHandler, "edge handler was not captured");
  return { stageDir, stubs, edge, handler: capturedHandler };
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

async function callEdgeAuth(handler, body, authHeader) {
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers.authorization = authHeader;
  const req = new Request("http://edge/functions/v1/daily-content", {
    method: "POST",
    headers,
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

// ---- scripted mock Graph API (photo -> feed -> verify) ----
function makeFetchMock(scenario = {}) {
  const calls = [];
  const graphErr = (e) => new Response(JSON.stringify({
    error: { message: e.message ?? `Graph error ${e.code}`, type: "OAuthException", code: e.code, error_subcode: e.subcode ?? 0, fbtrace_id: "mock" },
  }), { status: e.httpStatus ?? 400, headers: { "Content-Type": "application/json" } });
  const mock = async (url, init = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    calls.push({ url: u, method });
    if (u.includes("graph.facebook.com")) {
      if (u.includes("/photos")) {
        if (scenario.photo) return graphErr(scenario.photo);
        return new Response(JSON.stringify({ id: "photo-111" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (u.includes("/feed")) {
        if (scenario.feed) return graphErr(scenario.feed);
        return new Response(JSON.stringify({ id: POST_ID }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (scenario.verify) return graphErr(scenario.verify);
      return new Response(JSON.stringify({
        id: POST_ID, message: "mock caption", created_time: "2026-11-17T00:00:00+0000",
        permalink_url: PERMALINK, attachments: { data: [{ media_type: "photo" }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (u.includes("daily-content-posters")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  return { mock, calls };
}

const realFetch = globalThis.fetch;
function setFetch(mock) { globalThis.fetch = mock; }
function restoreFetch() { globalThis.fetch = realFetch; }
// A fetch that fails loudly if anything calls it: proves zero Graph calls.
const throwingFetch = async () => { throw new Error("unexpected network call"); };

const ENV = {
  SUPABASE_URL: "http://stub",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "key",
  WEBPUSH_VAPID_PUBLIC_KEY: "pub",
  WEBPUSH_VAPID_PRIVATE_KEY: "priv",
  DAILY_CONTENT_CRON_SECRET: CRON,
};
const ENV_TOKENS = {
  ...ENV,
  FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
  FACEBOOK_APP_ACCESS_TOKEN: "app-token",
};

const baseSeed = () => ({
  settings: [{ id: 1, enabled: true }],
  hadiths: [hadithRow(), hadithRow({ id: "h2", hadith_number: 2, arabic: "ARABIC-H2", bengali: "BENGALI-H2" })],
  duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
  tokens: [token("t1", "d1")],
});
const fbSettings = (over = {}) => ({
  id: 1, enabled: true, facebook_page_id: PAGE_ID,
  facebook_auto_publish_enabled: false, facebook_approval_required: true,
  facebook_posting_enabled: true, ...over,
});
const pendingRun = (over = {}) => runRow({
  recommendations: [
    { kind: "hadith", ref: "hadith:h2", relevance: 0.9, reasonBn: "প্রাসঙ্গিক", sourceLine: "Sahih al-Bukhari, Hadith 2" },
    { kind: "content", ref: "content:s1", relevance: 0.8, reasonBn: "প্রাসঙ্গিক", sourceLine: "TITLE-s1" },
  ],
  ...over,
});

// ---- pure helpers: fail-closed defaults + Mode A gate ----
{
  const { stageDir, stubs, edge } = await stage(ENV);
  void stubs;
  await checkAsync("modeSettingsFromRow(null) -> paused, Mode B, website+push on, FB auto off", async () => {
    const m = edge.modeSettingsFromRow(null);
    assert.equal(m.enabled, false);
    assert.equal(m.approvalRequired, true);
    assert.equal(m.websiteAutoPublish, true);
    assert.equal(m.pushEnabled, true);
    assert.equal(m.facebookAutoPublishEnabled, false);
    assert.equal(m.facebookApprovalRequired, true);
    assert.equal(m.facebookPostingEnabled, true);
  });
  await checkAsync("modeSettingsFromRow(legacy row, no new columns) -> Mode B, website+push on", async () => {
    const m = edge.modeSettingsFromRow({ id: 1, enabled: true });
    assert.equal(m.enabled, true);
    assert.equal(m.approvalRequired, true);
    assert.equal(m.websiteAutoPublish, true);
    assert.equal(m.pushEnabled, true);
    assert.equal(m.facebookAutoPublishEnabled, false);
  });
  await checkAsync("modeSettingsFromRow(invalid values) -> non-boolean approval_required stays Mode B", async () => {
    const m = edge.modeSettingsFromRow({ id: 1, enabled: true, approval_required: "yes", website_auto_publish: "no", push_enabled: 0 });
    assert.equal(m.approvalRequired, true);
    assert.equal(m.websiteAutoPublish, true);
    assert.equal(m.pushEnabled, true);
  });
  await checkAsync("modeSettingsFromRow(explicit values) -> Mode A + all switches respected", async () => {
    const m = edge.modeSettingsFromRow({
      id: 1, enabled: true, approval_required: false, website_auto_publish: false,
      push_enabled: false, facebook_auto_publish_enabled: true,
      facebook_approval_required: false, facebook_posting_enabled: false,
    });
    assert.equal(m.approvalRequired, false);
    assert.equal(m.websiteAutoPublish, false);
    assert.equal(m.pushEnabled, false);
    assert.equal(m.facebookAutoPublishEnabled, true);
    assert.equal(m.facebookApprovalRequired, false);
    assert.equal(m.facebookPostingEnabled, false);
  });
  const hRefs = new Set(["hadith:h1", "hadith:h2"]);
  const cRefs = new Set(["content:s1", "content:s2"]);
  await checkAsync("validateModeARun: valid pending run -> ok", async () => {
    const r = edge.validateModeARun(pendingRun(), hRefs, cRefs);
    assert.equal(r.ok, true);
  });
  await checkAsync("validateModeARun: fabricated hadith ref -> not ok", async () => {
    const r = edge.validateModeARun(pendingRun({
      recommendations: [{ kind: "hadith", ref: "hadith:missing-id" }],
    }), hRefs, cRefs);
    assert.equal(r.ok, false);
    assert.match(r.reason, /not in the eligible pool/);
  });
  await checkAsync("validateModeARun: malformed ref -> not ok", async () => {
    const r = edge.validateModeARun(pendingRun({
      recommendations: [{ kind: "hadith", ref: "bukhari-2" }],
    }), hRefs, cRefs);
    assert.equal(r.ok, false);
    assert.match(r.reason, /malformed/);
  });
  await checkAsync("validateModeARun: two hadiths -> not ok", async () => {
    const r = edge.validateModeARun(pendingRun({
      recommendations: [
        { kind: "hadith", ref: "hadith:h1" },
        { kind: "hadith", ref: "hadith:h2" },
      ],
    }), hRefs, cRefs);
    assert.equal(r.ok, false);
    assert.match(r.reason, /more than one hadith/);
  });
  await checkAsync("validateModeARun: rejected run -> not ok", async () => {
    const r = edge.validateModeARun(pendingRun({ status: "rejected" }), hRefs, cRefs);
    assert.equal(r.ok, false);
    assert.match(r.reason, /never consumed/);
  });
  await checkAsync("validateModeARun: empty recommendations -> not ok", async () => {
    const r = edge.validateModeARun(pendingRun({ recommendations: [] }), hRefs, cRefs);
    assert.equal(r.ok, false);
  });
  rmSync(stageDir, { recursive: true, force: true });
}

// ---- planDay consumes runs by MODE ----
{
  const { stageDir, stubs, handler } = await stage(ENV);

  await checkAsync("Mode B (default): plan consumes the APPROVED run", async () => {
    const svc = makeSvc({ ...baseSeed(), recommendations: [pendingRun({ status: "approved" })] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { dry_run: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.plan.diagnostics.mode, "B");
    assert.equal(res.json.plan.diagnostics.modeAConsumed, false);
    assert.equal(res.json.plan.recommendationId, "run-1");
    assert.equal(res.json.plan.hadith.id, "h2");
    assert.equal(res.json.plan.hadithSource, "approved");
  });

  await checkAsync("Mode B: a pending_review run is ignored (seeded fallback)", async () => {
    const svc = makeSvc({ ...baseSeed(), recommendations: [pendingRun()] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { dry_run: true });
    assert.equal(res.json.plan.diagnostics.mode, "B");
    assert.equal(res.json.plan.recommendationId, null);
    assert.equal(res.json.plan.hadithSource, "seeded");
  });

  await checkAsync("Mode A: plan consumes the pending_review run when the gate passes", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [{ id: 1, enabled: true, approval_required: false }],
      recommendations: [pendingRun()],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { dry_run: true });
    assert.equal(res.json.plan.diagnostics.mode, "A");
    assert.equal(res.json.plan.diagnostics.modeAConsumed, true);
    assert.equal(res.json.plan.diagnostics.modeAGate.ok, true);
    assert.equal(res.json.plan.recommendationId, "run-1");
    assert.equal(res.json.plan.hadith.id, "h2");
    assert.equal(res.json.plan.hadithSource, "approved");
  });

  await checkAsync("Mode A: gate fails on a fabricated ref -> run ignored wholesale, seeded fallback", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [{ id: 1, enabled: true, approval_required: false }],
      recommendations: [pendingRun({
        recommendations: [
          { kind: "hadith", ref: "hadith:fabricated" },
          { kind: "content", ref: "content:s1" },
        ],
      })],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { dry_run: true });
    assert.equal(res.json.plan.diagnostics.mode, "A");
    assert.equal(res.json.plan.diagnostics.modeAConsumed, false);
    assert.equal(res.json.plan.diagnostics.modeAGate.ok, false);
    assert.match(res.json.plan.diagnostics.modeAGate.reason, /not in the eligible pool/);
    assert.equal(res.json.plan.recommendationId, null);
    assert.equal(res.json.plan.hadithSource, "seeded");
  });

  await checkAsync("Mode A: a rejected run is never consumed", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [{ id: 1, enabled: true, approval_required: false }],
      recommendations: [pendingRun({ status: "rejected" })],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { dry_run: true });
    assert.equal(res.json.plan.diagnostics.runStatus, null);
    assert.equal(res.json.plan.recommendationId, null);
    assert.equal(res.json.plan.hadithSource, "seeded");
  });

  await checkAsync("Missing settings row -> plan_only is paused (fail closed)", async () => {
    const svc = makeSvc({ ...baseSeed(), settings: [] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { plan_only: true });
    assert.equal(res.json.ok, false);
    assert.equal(res.json.reason, "paused");
    assert.equal(svc.tables.daily_content_publications.length, 0);
  });

  rmSync(stageDir, { recursive: true, force: true });
}

// ---- publish_planned per-channel gates ----
{
  const { stageDir, stubs, handler } = await stage(ENV);

  await checkAsync("website_auto_publish=false -> 409 website_paused, row stays planned, zero sends", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [{ id: 1, enabled: true, website_auto_publish: false }],
      publications: [plannedRow()],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "website_paused");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0);
  });

  await checkAsync("push_enabled=false -> flips WITHOUT sending (delivery zeroed, push_paused)", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [{ id: 1, enabled: true, push_enabled: false }],
      publications: [plannedRow()],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.delivery.push_paused, true);
    assert.equal(res.json.delivery.sent, 0);
    assert.equal(res.json.delivery.total, 0);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(svc.tables.daily_content_deliveries.length, 0, "no delivery rows when push is paused");
    assert.equal(calls.length, 0);
  });

  await checkAsync("legacy settings (no new columns) -> publish_planned works exactly as before", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [plannedRow()] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.delivery.sent, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1);
    assert.ok(calls[0].payload.includes(posterUrlFor(todayKolkata())), "first send carries the finalized poster image");
  });

  rmSync(stageDir, { recursive: true, force: true });
}

// ---- update_settings: admin-JWT gated, audit-logged ----
{
  const { stageDir, stubs, handler } = await stage(ENV);
  const adminSeed = () => ({
    ...baseSeed(),
    profiles: [{ id: ADMIN_UUID }],
  });

  await checkAsync("update_settings without Authorization -> 401", async () => {
    const svc = makeSvc(adminSeed());
    stubs.holder.svc = svc;
    const res = await callEdgeAuth(handler, { action: "update_settings", settings: { approval_required: false } }, null);
    assert.equal(res.status, 401);
    assert.equal(svc.tables.daily_content_settings[0].approval_required, undefined);
  });

  await checkAsync("update_settings with a CRON Bearer (not a JWT) -> 401", async () => {
    const svc = makeSvc(adminSeed());
    stubs.holder.svc = svc;
    const res = await callEdgeAuth(handler, { action: "update_settings", settings: { approval_required: false } }, `Bearer ${CRON}`);
    assert.equal(res.status, 401);
  });

  await checkAsync("update_settings by a non-admin JWT -> 403", async () => {
    const svc = makeSvc(adminSeed());
    stubs.holder.svc = svc;
    const res = await callEdgeAuth(handler, { action: "update_settings", settings: { approval_required: false } }, "Bearer user-jwt");
    assert.equal(res.status, 403);
    assert.equal(svc.tables.daily_content_settings[0].approval_required, undefined);
  });

  await checkAsync("update_settings by an admin -> 200, row updated, audit row written", async () => {
    const svc = makeSvc(adminSeed());
    stubs.holder.svc = svc;
    const res = await callEdgeAuth(handler, {
      action: "update_settings",
      settings: { approval_required: false, facebook_auto_publish_enabled: true },
    }, "Bearer admin-jwt");
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.admin_audit_log, "written");
    assert.equal(svc.tables.daily_content_settings[0].approval_required, false);
    assert.equal(svc.tables.daily_content_settings[0].facebook_auto_publish_enabled, true);
    assert.equal(svc.tables.admin_audit_log.length, 1);
    assert.equal(svc.tables.admin_audit_log[0].action, "daily_content_settings_update");
    assert.equal(svc.tables.admin_audit_log[0].actor_id, ADMIN_UUID);
    assert.equal(svc.tables.admin_audit_log[0].resource_type, "daily_content_settings");
    assert.equal(svc.tables.admin_audit_log[0].metadata.changed.approval_required.to, false);
  });

  await checkAsync("update_settings: master `enabled` toggle -> 403 (owner-SQL only)", async () => {
    const svc = makeSvc(adminSeed());
    stubs.holder.svc = svc;
    const res = await callEdgeAuth(handler, { action: "update_settings", settings: { enabled: true } }, "Bearer admin-jwt");
    assert.equal(res.status, 403);
    assert.equal(svc.tables.daily_content_settings[0].enabled, true, "the row is untouched");
    assert.equal(svc.tables.admin_audit_log.length, 0);
  });

  await checkAsync("update_settings: unknown key -> 400; non-boolean value -> 400", async () => {
    const svc = makeSvc(adminSeed());
    stubs.holder.svc = svc;
    const bad1 = await callEdgeAuth(handler, { action: "update_settings", settings: { not_a_setting: true } }, "Bearer admin-jwt");
    assert.equal(bad1.status, 400);
    const bad2 = await callEdgeAuth(handler, { action: "update_settings", settings: { approval_required: "yes" } }, "Bearer admin-jwt");
    assert.equal(bad2.status, 400);
    assert.equal(svc.tables.daily_content_settings[0].approval_required, undefined);
    assert.equal(svc.tables.admin_audit_log.length, 0);
  });

  await checkAsync("update_settings: admin sub is not a UUID -> 200 but audit skipped_no_admin_uuid", async () => {
    const svc = makeSvc(adminSeed());
    stubs.holder.svc = svc;
    const res = await callEdgeAuth(handler, { action: "update_settings", settings: { approval_required: false } }, "Bearer display-jwt");
    assert.equal(res.status, 200);
    assert.equal(res.json.admin_audit_log, "skipped_no_admin_uuid");
    assert.equal(svc.tables.daily_content_settings[0].approval_required, false, "the change itself still applies");
    assert.equal(svc.tables.admin_audit_log.length, 0, "no made-up actor_id is ever written");
  });

  rmSync(stageDir, { recursive: true, force: true });
}

// ---- heal-tick Facebook disposition (no Page token in this stage) ----
{
  const { stageDir, stubs, handler } = await stage(ENV);

  await checkAsync("heal on published row, no Facebook columns -> channels.facebook 'not_implemented' (Phase 3 regression)", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [publishedRow()] });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    setFetch(throwingFetch);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.healed, false);
      assert.equal(res.json.channels.website, "published");
      assert.equal(res.json.channels.facebook, "not_implemented");
    } finally { restoreFetch(); }
  });

  await checkAsync("heal on published row, auto-publish off -> channels.facebook 'manual', zero Graph calls", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [fbSettings({ facebook_auto_publish_enabled: false })],
      publications: [publishedRow()],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    setFetch(throwingFetch);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.json.channels.facebook, "manual");
      assert.equal(svc.tables.daily_content_facebook_posts.length, 0, "no log row when auto-publish is off");
    } finally { restoreFetch(); }
  });

  await checkAsync("heal on published row, Facebook paused -> channels.facebook 'paused', zero Graph calls", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [fbSettings({ facebook_auto_publish_enabled: true, facebook_posting_enabled: false })],
      publications: [publishedRow()],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    setFetch(throwingFetch);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.json.channels.facebook, "paused");
      assert.equal(svc.tables.daily_content_facebook_posts.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("heal on published row, auto-publish on but NO token -> 'not_configured', zero Graph calls", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [fbSettings({ facebook_auto_publish_enabled: true, facebook_approval_required: true })],
      publications: [publishedRow()],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    setFetch(throwingFetch);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.json.channels.facebook, "not_configured");
      assert.equal(svc.tables.daily_content_facebook_posts.length, 0, "no log row without a token");
    } finally { restoreFetch(); }
  });

  rmSync(stageDir, { recursive: true, force: true });
}

// ---- heal-tick Facebook disposition (Page token present; mocked Graph API) ----
{
  const { stageDir, stubs, handler } = await stage(ENV_TOKENS);

  await checkAsync("heal on published row, auto-publish on + Mode B -> 'queued', log row staged, zero Graph calls", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [fbSettings({ facebook_auto_publish_enabled: true, facebook_approval_required: true })],
      publications: [publishedRow()],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.json.channels.facebook, "queued");
      assert.equal(calls.length, 0, "Mode B queues with zero Graph calls");
      assert.equal(svc.tables.daily_content_facebook_posts.length, 1);
      assert.equal(svc.tables.daily_content_facebook_posts[0].status, "pending");
      assert.equal(svc.tables.daily_content_facebook_posts[0].approved_at, null);
    } finally { restoreFetch(); }
  });

  await checkAsync("heal on published row, auto-publish on + Mode A -> 'published' (mocked Graph API)", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [fbSettings({ facebook_auto_publish_enabled: true, facebook_approval_required: false })],
      publications: [publishedRow()],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.json.channels.facebook, "published");
      assert.ok(calls.some((c) => c.url.includes("/photos")), "photo upload called");
      assert.ok(calls.some((c) => c.url.includes("/feed")), "feed post called");
      assert.ok(calls.some((c) => c.url.includes(`/v27.0/${POST_ID}`)), "verification read called");
      assert.equal(svc.tables.daily_content_facebook_posts.length, 1);
      assert.equal(svc.tables.daily_content_facebook_posts[0].status, "posted");
      assert.equal(svc.tables.daily_content_facebook_posts[0].post_id, POST_ID);
      assert.equal(svc.tables.daily_content_facebook_posts[0].permalink_url, PERMALINK);
    } finally { restoreFetch(); }
  });

  await checkAsync("heal on published row, auto-publish on + Mode A + retryable Graph failure -> 'failed'", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [fbSettings({ facebook_auto_publish_enabled: true, facebook_approval_required: false })],
      publications: [publishedRow()],
    });
    stubs.holder.svc = svc;
    setWebpush(stubs, () => ({ statusCode: 201 }));
    const { mock } = makeFetchMock({ feed: { code: 4, message: "Application request limit reached" } });
    setFetch(mock);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.json.channels.facebook, "failed");
      assert.equal(svc.tables.daily_content_facebook_posts[0].status, "failed");
      assert.equal(svc.tables.daily_content_facebook_posts[0].error_code, 4);
      assert.ok(svc.tables.daily_content_facebook_posts[0].next_attempt_at, "retryable failure stores a backoff");
      assert.equal(svc.tables.daily_content_publications[0].status, "published", "a Facebook failure never rolls back the website publication");
    } finally { restoreFetch(); }
  });

  await checkAsync("heal publishes a QC-passed row + auto-publish on + Mode B -> healed:true AND facebook 'queued'", async () => {
    const svc = makeSvc({
      ...baseSeed(),
      settings: [fbSettings({ facebook_auto_publish_enabled: true, facebook_approval_required: true })],
      publications: [plannedRow({
        cards: [{
          kind: "hadith",
          bengali: "বাংলা হাদিসের পাঠ — সংক্ষিপ্ত উদ্ধৃতি।",
          sourceLine: "Sahih al-Bukhari, Hadith 1",
          canonicalLink: "/hadith/bukhari/1",
        }],
        hadith_source_line: "Sahih al-Bukhari, Hadith 1",
      })],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const { mock, calls: graphCalls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { retry_only: true, heal: true });
      assert.equal(res.json.healed, true);
      assert.equal(res.json.channels.website, "published");
      assert.equal(res.json.channels.facebook, "queued");
      assert.equal(graphCalls.length, 0, "Mode B queues with zero Graph calls");
      assert.equal(calls.length, 1, "the website push still went out with the poster image");
      assert.ok(calls[0].payload.includes(posterUrlFor(todayKolkata())));
      assert.equal(svc.tables.daily_content_facebook_posts.length, 1);
      assert.equal(svc.tables.daily_content_facebook_posts[0].status, "pending");
    } finally { restoreFetch(); }
  });

  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\nmode-ab tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
