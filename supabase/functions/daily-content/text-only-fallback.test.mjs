// daily-content text-only fallback tests (owner decision 2026-11-23
// 16:22 IST — "Text-only fallback করে দিন").
//
// Binding rule 1 is AMENDED: poster-first, but when the poster fails /
// quarantines, the day's content publishes text-only (push without
// image) — ONLY for a QUARANTINED row (2nd same-day recorded poster
// failure) AND only when the text_only_fallback setting is on
// (owner-SQL only, default false). The 8-gate still applies: V1/V2/V3/
// V4/V7 run unchanged and must pass; V5/V8 are recorded SKIPPED
// (never claimed as passed); V6 runs its push-text half. A gate_hold
// row NEVER publishes text-only.
//
// Covers:
//   - publish_planned on a quarantined row + flag on -> 200 text-only,
//     fallback:"text_only", image_url null, delivery invariant holds
//   - quarantined row + flag off -> 409 poster_not_ready, zero sends
//   - quarantined row + flag on + gate failing -> 409 gate_hold, zero
//     sends, error recorded
//   - poster-passed row + flag on -> publishes WITH the poster, no
//     fallback marker
//   - held row (1st failure) + flag on -> 409 poster_not_ready
//     (poster retry preserved)
//   - poster-pending row + flag on -> 409 poster_not_ready
//     (unrecorded failures must be recorded before the fallback fires)
//   - heal tick on a quarantined row: flag on -> healed:true,
//     fallback:"text_only"; flag off -> hold:"quarantined", zero sends
//   - heal tick on a quarantined row + flag on + gate failing ->
//     hold:"gate_hold", zero sends
//   - gate verdict shape in fallback mode (direct evaluateAutonomousGate
//     call): 8 results, V5/V8 skipped:true, V6 passes on push text,
//     V1-V4/V7 pass, failed == [], decision == "publish"
//   - V6 fallback: empty push title/body + flag on + quarantined ->
//     gate_hold (V6 fails on the push-text check)
//
// Stages the REAL daily-content/index.ts (s6-style stubs: only the two
// esm.sh imports change) with an in-memory fake Supabase, following
// the heal-splitflow.test.mjs harness.
//
// Run: node supabase/functions/daily-content/text-only-fallback.test.mjs
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
const posterUrlFor = (date) =>
  `http://stub/storage/v1/object/public/daily-content-posters/${date}/portrait.png`;

async function stage(env) {
  const stageDir = mkdtempSync(join(tmpdir(), "tof-daily-"));
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
const flagSeed = () => ({
  ...baseSeed(),
  settings: [{ enabled: true, text_only_fallback: true }],
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
const quarantinedRow = (over = {}) => plannedRow({
  poster_qc_status: "failed", poster_error: "quarantined:render_or_upload_failed:square",
  ...over,
});
const passedPosterRow = (over = {}) => {
  const url = posterUrlFor(todayKolkata());
  return plannedRow({
    poster_qc_status: "passed", poster_url: url,
    poster_urls: { portrait: url },
    poster_asset_id: `poster:${todayKolkata()}`,
    poster_storage_path: `daily-content-posters/${todayKolkata()}/portrait.png`,
    poster_checksum: "a".repeat(64),
    poster_checksums: { portrait: "a".repeat(64) },
    poster_scene_id: "intention-sunrise",
    poster_generated_at: `${todayKolkata()}T02:00:00.000Z`,
    ...over,
  });
};

// ---- text-only fallback tests ----
{
  const { stageDir, stubs, edge, handler } = await stage(ENV);

  await checkAsync("publish_planned on a quarantined row + flag on -> 200 text-only, fallback marker, image_url null, invariant holds", async () => {
    const svc = makeSvc({ ...flagSeed(), publications: [quarantinedRow()] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.fallback, "text_only");
    assert.equal(res.json.publication_id, "pub-planned");
    const d = res.json.delivery;
    assert.equal(d.total, d.sent + d.failed + d.skipped, "delivery invariant: total == sent + failed + skipped");
    assert.equal(d.sent, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1, "exactly one provider send");
    const sentPayload = typeof calls[0].payload === "string" ? JSON.parse(calls[0].payload) : calls[0].payload;
    assert.equal(sentPayload.image_url, null, "the fallback send carries no poster image");
    assert.equal(svc.tables.daily_content_deliveries.filter((x) => x.status === "sent").length, 1);
  });

  await checkAsync("publish_planned on a quarantined row + flag off -> 409 poster_not_ready, row stays planned, zero sends", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [quarantinedRow()] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 409);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.reason, "poster_not_ready");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0, "a quarantined row with the flag off is never published");
  });

  await checkAsync("publish_planned on a quarantined row + flag on + gate failing -> 409 gate_hold, row stays planned, zero sends", async () => {
    // The stored card's Bengali differs from the live hadith — the
    // gate (V3) holds the publication even in fallback mode.
    const svc = makeSvc({ ...flagSeed(), publications: [quarantinedRow({
      cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-H", bengali: "BENGALI-CHANGED", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
    })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 409);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.reason, "gate_hold");
    assert.deepEqual(res.json.failed, ["bengali_editorial_quality"]);
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(svc.tables.daily_content_publications[0].error, "gate_hold:bengali_editorial_quality");
    assert.equal(calls.length, 0, "a gate-held row sends nothing");
  });

  await checkAsync("publish_planned on a poster-passed row + flag on -> publishes WITH the poster, no fallback marker", async () => {
    const url = posterUrlFor(todayKolkata());
    const svc = makeSvc({ ...flagSeed(), publications: [passedPosterRow()] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal("fallback" in res.json, false, "a poster publish carries no fallback marker");
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1);
    const sentPayload = typeof calls[0].payload === "string" ? JSON.parse(calls[0].payload) : calls[0].payload;
    assert.equal(sentPayload.image_url, url, "the first send carries the finalized poster image");
  });

  await checkAsync("publish_planned on a held row (1st failure) + flag on -> 409 poster_not_ready (poster retry preserved)", async () => {
    const svc = makeSvc({ ...flagSeed(), publications: [plannedRow({ poster_qc_status: "failed", poster_error: "render_or_upload_failed:square" })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 409);
    assert.equal(res.json.reason, "poster_not_ready");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0, "a held row is never published text-only");
  });

  await checkAsync("publish_planned on a poster-pending row + flag on -> 409 poster_not_ready", async () => {
    const svc = makeSvc({ ...flagSeed(), publications: [plannedRow()] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 409);
    assert.equal(res.json.reason, "poster_not_ready");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0, "unrecorded failures must be recorded before the fallback can fire");
  });

  await checkAsync("heal tick on a quarantined row + flag on -> healed:true, fallback:'text_only', delivery present", async () => {
    const svc = makeSvc({ ...flagSeed(), publications: [quarantinedRow()] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, true);
    assert.equal(res.json.fallback, "text_only");
    assert.equal(res.json.hold, null);
    assert.equal(res.json.publication_id, "pub-planned");
    assert.equal(res.json.channels.website, "published");
    assert.equal(res.json.channels.push.sent, 1);
    assert.equal(svc.tables.daily_content_publications[0].status, "published");
    assert.equal(calls.length, 1, "exactly one provider send");
    const sentPayload = typeof calls[0].payload === "string" ? JSON.parse(calls[0].payload) : calls[0].payload;
    assert.equal(sentPayload.image_url, null, "the heal fallback send carries no poster image");
  });

  await checkAsync("heal tick on a quarantined row + flag off -> hold:'quarantined', healed:false, zero sends", async () => {
    const svc = makeSvc({ ...baseSeed(), publications: [quarantinedRow()] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { retry_only: true, heal: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.healed, false);
    assert.equal(res.json.hold, "quarantined");
    assert.equal(res.json.alert.level, "critical");
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0);
  });

  await checkAsync("heal tick on a quarantined row + flag on + gate failing -> hold:'gate_hold', nothing published, zero sends", async () => {
    const svc = makeSvc({ ...flagSeed(), publications: [quarantinedRow({
      cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-H", bengali: "BENGALI-CHANGED", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
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
    assert.equal(calls.length, 0, "a gate-held row sends nothing");
  });

  await checkAsync("gate verdict shape in fallback mode: 8 results, V5/V8 skipped, V6 passes on push text, failed == [], decision == 'publish'", async () => {
    const verdict = edge.evaluateAutonomousGate({
      kolkataDate: todayKolkata(),
      hadithRef: "hadith:h1",
      hadithSourceLine: "Sahih al-Bukhari, Hadith 1",
      cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-H", bengali: "BENGALI-H", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
      push: { title: "TITLE", body: "BODY" },
      poster: { url: null, urls: null, assetId: null, storagePath: null, checksum: null, checksums: null, sceneId: null, qcStatus: "failed", generatedAt: null },
      liveHadith: { id: "h1", book_key: "bukhari", chapter_id: 1, hadith_number: 1, arabic: "ARABIC-H", bengali: "BENGALI-H", english: null },
      liveDuas: {},
      history: [],
      historyRecords: new Map(),
      hadithCycle: 1,
      cardCycle: 1,
      textOnlyFallback: true,
    });
    assert.equal(verdict.decision, "publish");
    assert.equal(verdict.results.length, 8);
    assert.deepEqual(verdict.failed, []);
    for (const id of ["source_reference_integrity", "arabic_integrity", "bengali_editorial_quality", "fabricated_claims_detection", "duplicate_prevention"]) {
      assert.equal(verdict.results.find((v) => v.id === id).pass, true, `${id} must pass`);
    }
    assert.equal(verdict.results.find((v) => v.id === "content_visual_consistency").skipped, true, "V5 is skipped, never claimed as passed");
    assert.equal(verdict.results.find((v) => v.id === "finalized_asset_integrity").skipped, true, "V8 is skipped, never claimed as passed");
    assert.equal(verdict.results.find((v) => v.id === "bengali_readability_image_quality").pass, true, "V6 passes on the push text");
  });

  await checkAsync("V6 fallback: empty push title/body + flag on + quarantined -> gate_hold", async () => {
    const svc = makeSvc({ ...flagSeed(), publications: [quarantinedRow({
      push: { ...pushPayload(), title: "", body: "" },
    })] });
    stubs.holder.svc = svc;
    const calls = setWebpush(stubs, () => ({ statusCode: 201 }));
    const res = await callEdge(handler, { publish_planned: true });
    assert.equal(res.status, 409);
    assert.equal(res.json.reason, "gate_hold");
    assert.deepEqual(res.json.failed, ["bengali_readability_image_quality"]);
    assert.equal(svc.tables.daily_content_publications[0].status, "planned");
    assert.equal(calls.length, 0, "a row with no readable push text sends nothing");
  });

  rmSync(stageDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
