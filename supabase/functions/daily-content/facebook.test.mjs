// daily-content Facebook Page publication tests (Phase 4 —
// Facebook Page Automation, owner-authorized 2026-11-16).
//
// The REAL daily-content/index.ts is staged (s6-style stubs: only
// the two esm.sh imports change) with an in-memory fake Supabase and
// a scripted MOCK Graph API — no real Facebook call is ever made
// (no token exists; G1–G3 are owner blockers).
//
// Covered:
//   - publish success path (two-step photo + feed + verification
//     read), caption builder + validator (Bengali-first, source
//     present, no virtue claims), QC gate (no poster -> no publish)
//   - error classification for every code (190 terminal incl.
//     subcodes 463/460/458, 200/10, 368, 100, 506, 4/17/32/613/80001
//     retryable, transport transient, unknown not retryable)
//   - idempotency (second publish dedupes, zero Graph calls),
//     retry bounds (max 4, backoff 5/15/45 min), Mode B approval
//     gate + approve dedupe + admin_audit_log write, token health,
//     per-channel pause, missing log table (fail closed), missing
//     token (fail closed), combo rejections, source fallback.
//
// Run: node supabase/functions/daily-content/facebook.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const CRON = "test-cron-secret";
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
// Same shape as heal-splitflow.test.mjs, plus the Facebook log table,
// admin_audit_log, profiles, and an optional missing-table error for
// daily_content_facebook_posts (seed.fbLogMissing) to prove the
// fail-closed path before the migration exists.
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
    admin_audit_log: seed.auditLog ?? [],
    profiles: seed.profiles ?? [],
  };
  const tableError = seed.fbLogMissing
    ? { daily_content_facebook_posts: { message: "Could not find the table 'public.daily_content_facebook_posts' in the schema cache", code: "PGRST205" } }
    : {};
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
    async maybeSingle() {
      if (tableError[this.table]) return { data: null, error: tableError[this.table] };
      const rs = this.rows(); return { data: rs[0] ?? null, error: null };
    }
    async single() {
      if (tableError[this.table]) return { data: null, error: tableError[this.table] };
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
        if (tableError[this.table]) { resolve({ data: null, error: tableError[this.table] }); return; }
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

const pushPayload = () => ({
  title: "TITLE", body: "BODY", deep_link: "/hadith/bukhari/5022",
  icon: "https://www.noorapp.in/notification-icon.png",
  badge: "https://www.noorapp.in/badge-icon.png", image_url: null,
});
const posterUrlFor = (date, format = "portrait") =>
  `http://stub/storage/v1/object/public/daily-content-posters/${date}/${format}.png`;

async function stage(env) {
  const stageDir = mkdtempSync(join(tmpdir(), "p4-daily-fb-"));
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

const ENV = {
  SUPABASE_URL: "http://stub",
  SUPABASE_SERVICE_ROLE_KEY: "key",
  WEBPUSH_VAPID_PUBLIC_KEY: "pub",
  WEBPUSH_VAPID_PRIVATE_KEY: "priv",
  DAILY_CONTENT_CRON_SECRET: CRON,
  FACEBOOK_PAGE_ACCESS_TOKEN: "fb-page-token",
  FACEBOOK_APP_ACCESS_TOKEN: "fb-app-token",
};

// ---- scripted mock Graph API ----
// scenario: { photo?: {code,subcode,message} | "source-only", feed?: {...}, verify?: {...}, debug?: {...} }
// photo "source-only" fails the url upload (code 100) and succeeds the multipart source upload.
function makeFetchMock(scenario = {}) {
  const calls = [];
  const graphErr = (e) => new Response(JSON.stringify({
    error: { message: e.message ?? `Graph error ${e.code}`, type: "OAuthException", code: e.code, error_subcode: e.subcode ?? 0, fbtrace_id: "mock" },
  }), { status: e.httpStatus ?? 400, headers: { "Content-Type": "application/json" } });
  const mock = async (url, init = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    let bodyText = "";
    if (init.body instanceof URLSearchParams) bodyText = init.body.toString();
    else if (typeof init.body === "string") bodyText = init.body;
    else if (typeof init.body === "object" && init.body !== null && init.body.constructor?.name === "FormData") bodyText = "FORMDATA";
    calls.push({ url: u, method, body: bodyText });
    if (u.includes("graph.facebook.com")) {
      if (u.includes("/debug_token")) {
        if (scenario.debug) return graphErr(scenario.debug);
        return new Response(JSON.stringify({ data: {
          app_id: "999", is_valid: true, type: "PAGE",
          scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
          expires_at: 0, data_access_expires_at: 0, user_id: PAGE_ID,
        } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (u.includes("/photos")) {
        if (bodyText === "FORMDATA") {
          if (scenario.photo === "source-only" || !scenario.photo) {
            return new Response(JSON.stringify({ id: "photo-222" }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return graphErr(scenario.photo);
        }
        if (scenario.photo === "source-only") return graphErr({ code: 100, subcode: 33, message: "Invalid parameter: could not fetch image from URL" });
        if (scenario.photo) return graphErr(scenario.photo);
        return new Response(JSON.stringify({ id: "photo-111" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (u.includes("/feed")) {
        if (scenario.feed) return graphErr(scenario.feed);
        return new Response(JSON.stringify({ id: POST_ID }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // verification read: GET /v27.0/<post-id>
      if (scenario.verify) return graphErr(scenario.verify);
      return new Response(JSON.stringify({
        id: POST_ID, message: "mock caption", created_time: "2026-11-17T00:00:00+0000",
        permalink_url: PERMALINK, attachments: { data: [{ media_type: "photo" }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    // poster binary fetch (source fallback)
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

// ---- seeds ----
const fbSettings = (over = {}) => ({
  enabled: true, facebook_page_id: PAGE_ID, facebook_approval_required: true, ...over,
});
const publishedRow = (over = {}) => ({
  id: "pub-fb", kolkata_date: todayKolkata(), status: "published",
  hadith_ref: "hadith:h1", hadith_source_line: "Sahih al-Bukhari, Hadith 5022",
  cards: [{
    kind: "hadith",
    bengali: "বাংলা হাদিসের পাঠ — সংক্ষিপ্ত উদ্ধৃতি।",
    sourceLine: "Sahih al-Bukhari, Hadith 5022",
    canonicalLink: "/hadith/bukhari/5022",
  }],
  push: pushPayload(),
  poster_qc_status: "passed", poster_url: posterUrlFor(todayKolkata()),
  poster_urls: { portrait: posterUrlFor(todayKolkata()) },
  ...over,
});
const fbLogRow = (over = {}) => ({
  id: "fb-1", publication_id: "pub-fb", page_id: PAGE_ID,
  asset_id: `poster:${todayKolkata()}`, poster_url: posterUrlFor(todayKolkata()),
  caption: "caption", status: "pending", attempt: 0, retry_history: [],
  approved_at: null, approved_by: null, post_id: null, permalink_url: null,
  error_code: null, error_message: null, api_response_status: null, next_attempt_at: null,
  ...over,
});

// ---- publish + caption + QC gate ----
{
  const { stageDir, stubs, edge, handler } = await stage(ENV);
  stubs.holder.webpush = { sendNotification: async () => ({ statusCode: 201 }) };

  await checkAsync("wrong CRON secret -> 401 (auth gate intact)", async () => {
    const svc = makeSvc({ settings: [fbSettings()], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" }, "wrong-secret");
      assert.equal(res.status, 401);
      assert.equal(svc.tables.daily_content_facebook_posts.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("publish happy path (Mode A): two-step photo+feed+verify, post stored, row posted", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, true);
      assert.equal(res.json.post_id, POST_ID);
      assert.equal(res.json.permalink_url, PERMALINK);
      assert.equal(res.json.attempt, 1);
      assert.equal(res.json.attempts, 1);
      assert.equal(calls.length, 3, "exactly three Graph calls: photos, feed, verify");
      assert.ok(calls.every((c) => c.url.includes("/v27.0/")), "every call is versioned v27.0");
      const [photo, feed, verify] = calls;
      assert.ok(photo.url.includes(`/v27.0/${PAGE_ID}/photos`), "photo upload first");
      assert.ok(photo.body.includes("published=false"), "photo is unpublished (published=false)");
      assert.ok(photo.body.includes("url="), "photo uses the url method");
      assert.ok(feed.url.includes(`/v27.0/${PAGE_ID}/feed`), "feed post second");
      assert.ok(feed.body.includes("attached_media="), "feed carries attached_media");
      assert.ok(feed.body.includes("media_fbid"), "feed attaches the uploaded photo id");
      assert.ok(feed.body.includes("link="), "feed carries the website link");
      assert.ok(verify.url.includes(`/v27.0/${POST_ID}`), "verification read third");
      assert.equal(verify.method, "GET");
      const row = svc.tables.daily_content_facebook_posts[0];
      assert.equal(row.status, "posted");
      assert.equal(row.post_id, POST_ID);
      assert.equal(row.permalink_url, PERMALINK);
      assert.equal(row.attempt, 1);
      assert.equal(row.retry_history.length, 1, "retry_history IS the attempt list");
      assert.equal(row.retry_history[0].result, "posted");
      assert.equal(svc.tables.daily_content_publications[0].status, "published", "website publication untouched");
    } finally { restoreFetch(); }
  });

  await checkAsync("caption is Bengali-first with source, link, two hashtags, no virtue claims", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      await callEdge(handler, { action: "facebook_publish" });
      const feed = calls.find((c) => c.url.includes("/feed"));
      const params = new URLSearchParams(feed.body);
      const message = params.get("message");
      assert.ok(message.startsWith("📿 আজকের হাদিস"), "Bengali-first heading");
      assert.ok(message.includes("বাংলা হাদিসের পাঠ"), "Bengali excerpt present");
      assert.ok(message.includes("Sahih al-Bukhari, Hadith 5022"), "source line present");
      assert.equal(params.get("link"), "https://noorapp.in/hadith/bukhari/5022", "canonical website link");
      assert.ok(message.includes("#NoorApp #Hadith"), "two hashtags only");
      assert.ok(!message.includes("যাচাই করা হয়নি"), "no unverified-virtue text");
      assert.ok(!/poster_qc|QC/i.test(message), "no QC text in the caption");
    } finally { restoreFetch(); }
  });

  await checkAsync("QC gate: planned row -> 409 not_published, zero Graph calls", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow({ status: "planned" })] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 409);
      assert.equal(res.json.error, "not_published");
      assert.equal(calls.length, 0);
      assert.equal(svc.tables.daily_content_facebook_posts.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("QC gate: published row with failed poster -> 409 poster_not_ready, zero Graph calls", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow({ poster_qc_status: "failed", poster_url: null })] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 409);
      assert.equal(res.json.error, "poster_not_ready");
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("paused settings -> {ok:false, reason:paused}, zero Graph calls", async () => {
    const svc = makeSvc({ settings: [fbSettings({ enabled: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, false);
      assert.equal(res.json.reason, "paused");
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("per-channel pause (facebook_posting_enabled=false) -> reason facebook_paused", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_posting_enabled: false, facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.json.ok, false);
      assert.equal(res.json.reason, "facebook_paused");
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("missing fb log table -> 500 facebook_log_unavailable, zero Graph calls (fail closed)", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()], fbLogMissing: true });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 500);
      assert.equal(res.json.error, "facebook_log_unavailable");
      assert.equal(calls.length, 0, "no Graph call before the migration exists");
    } finally { restoreFetch(); }
  });

  await checkAsync("idempotency: second publish on a posted row dedupes, zero Graph calls", async () => {
    const svc = makeSvc({
      settings: [fbSettings({ facebook_approval_required: false })],
      publications: [publishedRow()],
      fbPosts: [fbLogRow({ status: "posted", attempt: 1, post_id: POST_ID, permalink_url: PERMALINK, retry_history: [{ attempt: 1, result: "posted" }] })],
    });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, true);
      assert.equal(res.json.deduped, true);
      assert.equal(res.json.post_id, POST_ID);
      assert.equal(calls.length, 0, "no second post");
      assert.equal(svc.tables.daily_content_facebook_posts.length, 1);
    } finally { restoreFetch(); }
  });

  await checkAsync("Mode B: publish without approval queues (row created, no Graph call), approve, then publish succeeds", async () => {
    const svc = makeSvc({ settings: [fbSettings()], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const queued = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(queued.status, 200);
      assert.equal(queued.json.ok, true);
      assert.equal(queued.json.queued, true);
      assert.equal(queued.json.approval_required, true);
      assert.equal(calls.length, 0, "no Graph call before approval");
      assert.equal(svc.tables.daily_content_facebook_posts.length, 1);
      assert.equal(svc.tables.daily_content_facebook_posts[0].status, "pending");
      assert.equal(svc.tables.daily_content_facebook_posts[0].approved_at, null);
      const approved = await callEdge(handler, { action: "facebook_approve", approved_by: "admin-1" });
      assert.equal(approved.status, 200);
      assert.equal(approved.json.ok, true);
      assert.ok(approved.json.approved_at, "approval recorded");
      assert.equal(approved.json.approved_by, "admin-1");
      const published = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(published.status, 200);
      assert.equal(published.json.ok, true);
      assert.equal(published.json.post_id, POST_ID);
      assert.equal(calls.length, 3, "Graph calls only after approval");
    } finally { restoreFetch(); }
  });

  await checkAsync("approve twice -> second dedupes, still one row", async () => {
    const svc = makeSvc({ settings: [fbSettings()], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    setFetch(makeFetchMock().mock);
    try {
      const first = await callEdge(handler, { action: "facebook_approve", approved_by: "admin-1" });
      assert.equal(first.json.ok, true);
      const second = await callEdge(handler, { action: "facebook_approve", approved_by: "admin-2" });
      assert.equal(second.json.ok, true);
      assert.equal(second.json.deduped, true);
      assert.equal(svc.tables.daily_content_facebook_posts.length, 1);
      assert.equal(svc.tables.daily_content_facebook_posts[0].approved_by, "admin-1", "first approver wins");
    } finally { restoreFetch(); }
  });

  await checkAsync("approve validation: empty / overlong approved_by -> 400", async () => {
    const svc = makeSvc({ settings: [fbSettings()], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    setFetch(makeFetchMock().mock);
    try {
      const empty = await callEdge(handler, { action: "facebook_approve", approved_by: "   " });
      assert.equal(empty.status, 400);
      const long = await callEdge(handler, { action: "facebook_approve", approved_by: "x".repeat(129) });
      assert.equal(long.status, 400);
      assert.equal(svc.tables.daily_content_facebook_posts.length, 0, "no row created by a rejected approval");
    } finally { restoreFetch(); }
  });

  await checkAsync("approve with a real admin profile UUID writes admin_audit_log; a display name skips it", async () => {
    const adminId = "11111111-2222-3333-4444-555555555555";
    const svc = makeSvc({
      settings: [fbSettings()], publications: [publishedRow()],
      profiles: [{ id: adminId }],
    });
    stubs.holder.svc = svc;
    setFetch(makeFetchMock().mock);
    try {
      const withUuid = await callEdge(handler, { action: "facebook_approve", approved_by: adminId });
      assert.equal(withUuid.json.ok, true);
      assert.equal(withUuid.json.admin_audit_log, "written");
      assert.equal(svc.tables.admin_audit_log.length, 1);
      assert.equal(svc.tables.admin_audit_log[0].action, "facebook_approve");
      assert.equal(svc.tables.admin_audit_log[0].actor_id, adminId);
      assert.equal(svc.tables.admin_audit_log[0].resource_type, "daily_content_facebook_posts");
      assert.equal(svc.tables.admin_audit_log[0].resource_id, svc.tables.daily_content_facebook_posts[0].id);
    } finally { restoreFetch(); }
    const svc2 = makeSvc({ settings: [fbSettings()], publications: [publishedRow()] });
    stubs.holder.svc = svc2;
    setFetch(makeFetchMock().mock);
    try {
      const withName = await callEdge(handler, { action: "facebook_approve", approved_by: "admin-1" });
      assert.equal(withName.json.ok, true);
      assert.equal(withName.json.admin_audit_log, "skipped_no_admin_uuid");
      assert.equal(svc2.tables.admin_audit_log.length, 0, "no invented actor_id in the audit log");
      assert.equal(svc2.tables.daily_content_facebook_posts[0].approved_by, "admin-1", "the decision is still recorded on the log row");
    } finally { restoreFetch(); }
  });

  await checkAsync("caption builder unit: source missing -> throws; excerpt missing -> throws", async () => {
    const noSource = publishedRow({ hadith_source_line: null, cards: [{ kind: "hadith", bengali: "পাঠ", sourceLine: null }] });
    assert.throws(() => edge.buildFacebookCaption(noSource), /caption_missing_source/);
    const noExcerpt = publishedRow({ cards: [{ kind: "hadith", bengali: null, sourceLine: "Sahih al-Bukhari, Hadith 5022" }] });
    assert.throws(() => edge.buildFacebookCaption(noExcerpt), /caption_missing_excerpt/);
    const built = edge.buildFacebookCaption(publishedRow());
    assert.equal(built.link, "https://noorapp.in/hadith/bukhari/5022");
    assert.equal(built.sourceLine, "Sahih al-Bukhari, Hadith 5022");
    assert.ok(built.excerpt.length > 0);
  });

  await checkAsync("caption validator unit: too long / missing source / unverified claim / QC text rejected", async () => {
    assert.deepEqual(edge.validateFacebookCaption("x".repeat(2001), "Sahih al-Bukhari, Hadith 5022"), { ok: false, error: "caption_too_long" });
    assert.deepEqual(edge.validateFacebookCaption("no source here", "Sahih al-Bukhari, Hadith 5022"), { ok: false, error: "caption_missing_source" });
    assert.deepEqual(edge.validateFacebookCaption("পাঠ যাচাই করা হয়নি — Sahih al-Bukhari, Hadith 5022", "Sahih al-Bukhari, Hadith 5022"), { ok: false, error: "caption_forbidden_unverified_claim" });
    assert.deepEqual(edge.validateFacebookCaption("poster_qc failed — Sahih al-Bukhari, Hadith 5022", "Sahih al-Bukhari, Hadith 5022"), { ok: false, error: "caption_contains_qc_text" });
    assert.deepEqual(edge.validateFacebookCaption("পাঠ — Sahih al-Bukhari, Hadith 5022", "Sahih al-Bukhari, Hadith 5022"), { ok: true });
  });

  await checkAsync("error classification unit: every code maps as the audit requires", async () => {
    const cls = edge.classifyFacebookError;
    const graph = (code, subcode = 0) => cls({ error: { code, error_subcode: subcode, message: `e${code}` } });
    for (const sub of [463, 460, 458]) {
      const c = graph(190, sub);
      assert.equal(c.kind, "terminal_token", `190/${sub}`);
      assert.equal(c.retryable, false);
    }
    assert.deepEqual([graph(200, 10).kind, graph(200, 10).retryable], ["terminal_permission", false]);
    assert.deepEqual([graph(368).kind, graph(368).retryable], ["terminal_policy", false]);
    assert.deepEqual([graph(100).kind, graph(100).retryable], ["invalid_parameter", false]);
    assert.deepEqual([graph(506).kind, graph(506).retryable], ["duplicate", false]);
    for (const code of [4, 17, 32, 613, 80001]) {
      const c = graph(code);
      assert.equal(c.kind, "rate_limit", `code ${code}`);
      assert.equal(c.retryable, true);
    }
    const transient = cls(new Error("fetch failed"));
    assert.equal(transient.kind, "transient");
    assert.equal(transient.retryable, true);
    const unknown = graph(999);
    assert.equal(unknown.kind, "unknown");
    assert.equal(unknown.retryable, false);
    assert.equal(edge.FB_API_VERSION, "v27.0", "API version is pinned");
  });

  await checkAsync("retryable failure (code 4 at photo) -> failed, attempt 1, backoff ~5 min, website still published", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock({ photo: { code: 4, message: "Application request limit reached" } });
    setFetch(mock);
    try {
      const before = Date.now();
      const res = await callEdge(handler, { action: "facebook_publish" });
      const after = Date.now();
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, false);
      assert.equal(res.json.error, "facebook_publish_failed");
      assert.equal(res.json.kind, "rate_limit");
      assert.equal(res.json.retryable, true);
      assert.equal(res.json.attempt, 1);
      assert.equal(res.json.attempts, 1);
      const next = new Date(res.json.next_attempt_at).getTime();
      assert.ok(next >= before + 4 * 60_000 && next <= after + 6 * 60_000, "next attempt ~5 minutes out");
      const row = svc.tables.daily_content_facebook_posts[0];
      assert.equal(row.status, "failed");
      assert.equal(row.attempt, 1);
      assert.equal(row.error_code, 4);
      assert.equal(row.retry_history.length, 1);
      assert.equal(row.retry_history[0].code, 4);
      assert.equal(svc.tables.daily_content_publications[0].status, "published", "Facebook failure never rolls back the website");
      assert.ok(calls.length >= 1, "the photo call was attempted");
    } finally { restoreFetch(); }
  });

  await checkAsync("second attempt after due -> attempt 2, backoff ~15 min", async () => {
    const svc = makeSvc({
      settings: [fbSettings({ facebook_approval_required: false })],
      publications: [publishedRow()],
      fbPosts: [fbLogRow({ status: "failed", attempt: 1, approved_at: "2026-11-17T00:00:00.000Z", error_code: 4, next_attempt_at: "2020-01-01T00:00:00.000Z", retry_history: [{ attempt: 1, result: "rate_limit", code: 4 }] })],
    });
    stubs.holder.svc = svc;
    const { mock } = makeFetchMock({ photo: { code: 4, message: "Application request limit reached" } });
    setFetch(mock);
    try {
      const before = Date.now();
      const res = await callEdge(handler, { action: "facebook_publish" });
      const after = Date.now();
      assert.equal(res.json.attempt, 2);
      const next = new Date(res.json.next_attempt_at).getTime();
      assert.ok(next >= before + 14 * 60_000 && next <= after + 16 * 60_000, "next attempt ~15 minutes out");
      const row = svc.tables.daily_content_facebook_posts[0];
      assert.equal(row.attempt, 2);
      assert.equal(row.retry_history.length, 2, "attempts counted from retry_history");
    } finally { restoreFetch(); }
  });

  await checkAsync("attempt 4 exhausted -> facebook_max_attempts_reached, zero Graph calls", async () => {
    const svc = makeSvc({
      settings: [fbSettings({ facebook_approval_required: false })],
      publications: [publishedRow()],
      fbPosts: [fbLogRow({ status: "failed", attempt: 4, approved_at: "2026-11-17T00:00:00.000Z", error_code: 4, next_attempt_at: "2020-01-01T00:00:00.000Z", retry_history: [{}, {}, {}, {}] })],
    });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.json.ok, false);
      assert.equal(res.json.error, "facebook_max_attempts_reached");
      assert.equal(res.json.attempt, 4);
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("terminal 190 (expired token, subcode 463) -> failed, next_attempt_at null, never retried", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock({ photo: { code: 190, subcode: 463, message: "Error validating access token: Session has expired" } });
    setFetch(mock);
    try {
      const first = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(first.json.ok, false);
      assert.equal(first.json.kind, "terminal_token");
      assert.equal(first.json.retryable, false);
      assert.equal(first.json.next_attempt_at, null);
      const row = svc.tables.daily_content_facebook_posts[0];
      assert.equal(row.status, "failed");
      assert.equal(row.error_code, 190);
      assert.equal(row.next_attempt_at, null, "a terminal row is never due again");
      const callsAfterFirst = calls.length;
      const second = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(second.json.ok, false);
      assert.equal(second.json.error, "facebook_terminal_error");
      assert.equal(second.json.error_code, 190);
      assert.equal(calls.length, callsAfterFirst, "no Graph call for a terminal row");
    } finally { restoreFetch(); }
  });

  await checkAsync("506 duplicate on the feed step -> failed (NOT posted), never retried", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock({ feed: { code: 506, message: "Duplicate post" } });
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.json.ok, false);
      assert.equal(res.json.kind, "duplicate");
      assert.equal(res.json.retryable, false);
      const row = svc.tables.daily_content_facebook_posts[0];
      assert.equal(row.status, "failed", "a 506 carries no post id to verify — never mark posted");
      assert.equal(row.post_id, null);
      assert.equal(row.error_code, 506);
      const callsAfter = calls.length;
      const second = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(second.json.error, "facebook_terminal_error");
      assert.equal(calls.length, callsAfter);
    } finally { restoreFetch(); }
  });

  await checkAsync("not due (failed row, backoff still in future) -> facebook_not_due, zero Graph calls", async () => {
    const svc = makeSvc({
      settings: [fbSettings({ facebook_approval_required: false })],
      publications: [publishedRow()],
      fbPosts: [fbLogRow({ status: "failed", attempt: 1, approved_at: "2026-11-17T00:00:00.000Z", error_code: 4, next_attempt_at: "2999-01-01T00:00:00.000Z", retry_history: [{ attempt: 1 }] })],
    });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.json.ok, false);
      assert.equal(res.json.error, "facebook_not_due");
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("source fallback: url upload fails (code 100) -> multipart source upload rescues the attempt", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock({ photo: "source-only" });
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, true);
      assert.equal(res.json.post_id, POST_ID);
      assert.equal(calls.length, 5, "photos url (fail) + poster binary + photos source + feed + verify");
      assert.ok(calls[0].body.includes("url="), "first attempt is the url method");
      assert.ok(calls[1].url.includes("daily-content-posters"), "the poster binary is fetched for the rescue");
      assert.equal(calls[2].body, "FORMDATA", "second photo attempt is multipart source");
      const feed = calls.find((c) => c.url.includes("/feed"));
      assert.ok(feed.body.includes("photo-222"), "the feed attaches the source-uploaded photo");
    } finally { restoreFetch(); }
  });

  await checkAsync("square format without a square poster -> 409 poster_not_ready; with one -> posts the square asset", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const missing = await callEdge(handler, { action: "facebook_publish", format: "square" });
      assert.equal(missing.status, 409);
      assert.equal(missing.json.error, "poster_not_ready");
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
    const svc2 = makeSvc({
      settings: [fbSettings({ facebook_approval_required: false })],
      publications: [publishedRow({ poster_urls: { portrait: posterUrlFor(todayKolkata()), square: posterUrlFor(todayKolkata(), "square") } })],
    });
    stubs.holder.svc = svc2;
    const { mock: mock2, calls: calls2 } = makeFetchMock();
    setFetch(mock2);
    try {
      const res = await callEdge(handler, { action: "facebook_publish", format: "square" });
      assert.equal(res.json.ok, true);
      assert.equal(res.json.post_id, POST_ID);
      assert.ok(calls2[0].body.includes("square.png"), "the square asset is uploaded, not the portrait");
    } finally { restoreFetch(); }
  });

  await checkAsync("combo rejections: facebook_publish + dry_run / publish_planned / heal -> 400, zero Graph calls", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      for (const combo of [{ dry_run: true }, { publish_planned: true }, { heal: true }, { plan_only: true }, { retry_only: true }]) {
        const res = await callEdge(handler, { action: "facebook_publish", ...combo });
        assert.equal(res.status, 400, JSON.stringify(combo));
      }
      assert.equal(calls.length, 0);
      assert.equal(svc.tables.daily_content_facebook_posts.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("invalid format / kolkata_date / page_id mismatch -> 400, zero Graph calls", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      assert.equal((await callEdge(handler, { action: "facebook_publish", format: "wide" })).status, 400);
      assert.equal((await callEdge(handler, { action: "facebook_publish", kolkata_date: "not-a-date" })).status, 400);
      assert.equal((await callEdge(handler, { action: "facebook_publish", page_id: "999999999" })).status, 400);
      assert.equal((await callEdge(handler, { action: "facebook_publish", page_id: "not-a-page-id" })).status, 400);
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
  });

  await checkAsync("token health: healthy token -> verdict healthy, scopes listed, settings write skipped (columns absent)", async () => {
    const svc = makeSvc({ settings: [fbSettings()], publications: [] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_token_health" });
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, true);
      assert.equal(res.json.healthy, true);
      assert.equal(res.json.verdict, "healthy");
      assert.deepEqual(res.json.reasons, []);
      assert.ok(res.json.scopes.includes("pages_manage_posts"));
      assert.equal(res.json.settings_update, "skipped_missing_columns");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.includes("/debug_token"), "debug_token is the only Graph call");
      assert.ok(calls[0].url.includes("/v27.0/"), "versioned");
    } finally { restoreFetch(); }
  });

  await checkAsync("token health: settings row WITH the facebook columns -> settings updated to healthy", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_token_health: "unknown", facebook_token_checked_at: null })], publications: [] });
    stubs.holder.svc = svc;
    setFetch(makeFetchMock().mock);
    try {
      const res = await callEdge(handler, { action: "facebook_token_health" });
      assert.equal(res.json.healthy, true);
      assert.equal(res.json.settings_update, "updated");
      assert.equal(svc.tables.daily_content_settings[0].facebook_token_health, "healthy");
      assert.ok(svc.tables.daily_content_settings[0].facebook_token_checked_at);
    } finally { restoreFetch(); }
  });

  await checkAsync("token health: invalid token + missing scope -> unhealthy with reasons", async () => {
    const svc = makeSvc({ settings: [fbSettings()], publications: [] });
    stubs.holder.svc = svc;
    const mock = async (url) => {
      const u = String(url);
      if (u.includes("/debug_token")) {
        return new Response(JSON.stringify({ data: {
          app_id: "999", is_valid: false, type: "USER",
          scopes: ["pages_read_engagement"], expires_at: Math.floor(Date.now() / 1000) + 3600,
          data_access_expires_at: 0,
        } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_token_health" });
      assert.equal(res.json.ok, true);
      assert.equal(res.json.healthy, false);
      assert.equal(res.json.verdict, "unhealthy");
      assert.ok(res.json.reasons.includes("token is not valid"));
      assert.ok(res.json.reasons.some((r) => r.includes("pages_manage_posts")));
      assert.ok(res.json.reasons.some((r) => r.includes("PAGE")));
      assert.ok(res.json.reasons.some((r) => r.includes("14 days")));
    } finally { restoreFetch(); }
  });

  rmSync(stageDir, { recursive: true, force: true });
}

// ---- missing-token stages (separate module instances) ----
{
  const envNoTokens = {
    SUPABASE_URL: "http://stub",
    SUPABASE_SERVICE_ROLE_KEY: "key",
    WEBPUSH_VAPID_PUBLIC_KEY: "pub",
    WEBPUSH_VAPID_PRIVATE_KEY: "priv",
    DAILY_CONTENT_CRON_SECRET: CRON,
  };
  const { stageDir, stubs, handler } = await stage(envNoTokens);
  stubs.holder.webpush = { sendNotification: async () => ({ statusCode: 201 }) };

  await checkAsync("missing page token -> 500 naming FACEBOOK_PAGE_ACCESS_TOKEN, zero Graph calls", async () => {
    const svc = makeSvc({ settings: [fbSettings({ facebook_approval_required: false })], publications: [publishedRow()] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_publish" });
      assert.equal(res.status, 500);
      assert.equal(res.json.error, "FACEBOOK_PAGE_ACCESS_TOKEN is not configured");
      assert.equal(calls.length, 0);
      const health = await callEdge(handler, { action: "facebook_token_health" });
      assert.equal(health.status, 500);
      assert.equal(health.json.error, "FACEBOOK_PAGE_ACCESS_TOKEN is not configured");
    } finally { restoreFetch(); }
  });

  rmSync(stageDir, { recursive: true, force: true });
}
{
  const envPageOnly = {
    SUPABASE_URL: "http://stub",
    SUPABASE_SERVICE_ROLE_KEY: "key",
    WEBPUSH_VAPID_PUBLIC_KEY: "pub",
    WEBPUSH_VAPID_PRIVATE_KEY: "priv",
    DAILY_CONTENT_CRON_SECRET: CRON,
    FACEBOOK_PAGE_ACCESS_TOKEN: "fb-page-token",
  };
  const { stageDir, stubs, handler } = await stage(envPageOnly);
  stubs.holder.webpush = { sendNotification: async () => ({ statusCode: 201 }) };

  await checkAsync("missing app token -> token health 500 naming FACEBOOK_APP_ACCESS_TOKEN", async () => {
    const svc = makeSvc({ settings: [fbSettings()], publications: [] });
    stubs.holder.svc = svc;
    const { mock, calls } = makeFetchMock();
    setFetch(mock);
    try {
      const res = await callEdge(handler, { action: "facebook_token_health" });
      assert.equal(res.status, 500);
      assert.equal(res.json.error, "FACEBOOK_APP_ACCESS_TOKEN is not configured");
      assert.equal(calls.length, 0);
    } finally { restoreFetch(); }
  });

  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
