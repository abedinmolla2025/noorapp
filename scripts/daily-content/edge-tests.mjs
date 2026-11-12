// Edge-function regression tests (node, no network, no real DB, no sends).
//
// Loads the REAL supabase/functions/daily-content/index.ts with only its
// external dependencies stubbed: the two esm.sh imports are rewritten to a
// local stub module, and a Deno double captures the Deno.serve handler.
// That handler is then driven against an in-memory fake Supabase
// (PostgREST-shaped query builder) and a stubbed web-push client. Every
// assertion below runs against the actual edge code, not a copy of it.
//
// Covered (brief areas): crash during partial delivery, recovery after a
// partial publication, duplicate-notification prevention, card-cycle
// exhaustion and restart, missing-settings behavior, HTTP 410 / 429 /
// 5xx classification, retry backoff and maximum attempts, and retry-only
// separation (a retry tick never publishes).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..", "..");
const outDir = path.join(dir, ".out");
fs.mkdirSync(outDir, { recursive: true });

// ---- stub module: shared holder, swapped in for the esm.sh imports ----
const STUBS = `
export const holder = { svc: null, webpush: null };
export const createClient = () => holder.svc;
const webpush = {
  setVapidDetails() {},
  sendNotification: (...a) => holder.webpush.sendNotification(...a),
};
export default webpush;
`;
fs.writeFileSync(path.join(outDir, "edge-test-stubs.mjs"), STUBS);

// ---- rewrite the real edge file (only its two remote imports change) ----
const src = fs.readFileSync(
  path.join(root, "supabase/functions/daily-content/index.ts"),
  "utf8",
);
const rewritten = src
  .replace(
    'from "https://esm.sh/@supabase/supabase-js@2.45.6"',
    'from "./edge-test-stubs.mjs"',
  )
  .replace(
    'from "https://esm.sh/web-push@3.6.7?bundle"',
    'from "./edge-test-stubs.mjs"',
  );
if (rewritten === src) throw new Error("edge import rewrite failed");
const edgeTs = path.join(outDir, "edge-under-test.mts");
fs.writeFileSync(edgeTs, rewritten);
// Transpile only: type errors (if any) must not block the emit, and the
// emitted ESM (.mjs) is what the test imports.
try {
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/bin/tsc"),
      edgeTs,
      "--module",
      "nodenext",
      "--target",
      "es2020",
      "--skipLibCheck",
      "--outDir",
      outDir,
    ],
    { stdio: "pipe" },
  );
} catch {
  // tsc exits non-zero on type errors but still emits; proceed if it did.
}
const edgeJs = path.join(outDir, "edge-under-test.mjs");
if (!fs.existsSync(edgeJs)) throw new Error("edge transpile produced no output");

// ---- Deno double: env values + capture the served handler ----
let capturedHandler = null;
// Tests may override single env values per test (e.g. a short push
// timeout) without touching the base map below.
const edgeEnvOverrides = {};
globalThis.Deno = {
  env: {
    get: (k) => edgeEnvOverrides[k] ??
      ({
        SUPABASE_URL: "http://stub",
        SUPABASE_SERVICE_ROLE_KEY: "key",
        WEBPUSH_VAPID_PUBLIC_KEY: "pub",
        WEBPUSH_VAPID_PRIVATE_KEY: "priv",
        DAILY_CONTENT_CRON_SECRET: "test-secret",
      })[k] ?? "",
  },
  serve: (cb) => {
    capturedHandler = cb;
  },
};
const stubs = await import(pathToFileURL(path.join(outDir, "edge-test-stubs.mjs")).href);
// Captured so tests can call exported edge internals (pushTimeoutMs) directly.
const edgeMod = await import(pathToFileURL(path.join(outDir, "edge-under-test.mjs")).href);
if (!capturedHandler) throw new Error("edge handler was not captured");

// Phase 9: the lib's Islamic context (compiled by run.sh before this file
// runs) is the equivalence oracle for the edge's ported context.
const cal = await import(path.join(dir, ".out-cal/context.js"));

// ---- in-memory fake Supabase (PostgREST-shaped, thenable builder) ----
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
  const flags = {
    hideTodayRowOnce: false,
    throwOnDeliveryInsertAt: null,
    throwOnPublicationUpdate: false,
    throwOnPromotionUpdate: false,
    throwOnSupersedeDeliveries: false,
    throwOnSentUpdate: false,
    commitThenThrowSentUpdate: false,
    zeroRowSentUpdateAt: null,
    zeroRowFlip: false,
  };
  const matches = (rows, filters) => rows.filter((r) => filters.every((f) => f(r)));

  // PostgREST's default db-max-rows is 1,000: no query returns more than
  // 1,000 rows unless the project raised it. The fake models that ceiling
  // on EVERY select (explicit limit or not), so a test that fetches a big
  // set without pagination fails here exactly as it would in production.
  // This is what makes the Phase 2 (hadith pool) and Phase 3 (opt-out)
  // pagination tests discriminating: the old uncapped code cannot pass.
  const FAKE_MAX_ROWS = 1000;

  class Q {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.descs = [];
      this.orders = [];
      this.lim = null;
      this.insertRow = null;
      this.patch = null;
      this.upsertRow = null;
    }
    select() {
      return this;
    }
    eq(c, v) {
      this.filters.push((r) => r[c] === v);
      this.descs.push({ c, v });
      return this;
    }
    in(c, vs) {
      this.filters.push((r) => vs.includes(r[c]));
      return this;
    }
    is(c, v) {
      this.filters.push((r) => (v === null ? r[c] == null : r[c] === v));
      return this;
    }
    lt(c, v) {
      this.filters.push((r) => r[c] < v);
      return this;
    }
    lte(c, v) {
      this.filters.push((r) => r[c] <= v);
      return this;
    }
    gt(c, v) {
      this.filters.push((r) => r[c] > v);
      return this;
    }
    gte(c, v) {
      this.filters.push((r) => r[c] >= v);
      return this;
    }
    order(c, { ascending }) {
      this.orders.push([c, ascending]);
      return this;
    }
    limit(n) {
      this.lim = n;
      return this;
    }
    rows() {
      let rs = matches(tables[this.table], this.filters);
      if (
        flags.hideTodayRowOnce &&
        this.table === "daily_content_publications" &&
        this.descs.some((d) => d.c === "kolkata_date")
      ) {
        // Race simulation: today's row exists but this read misses it,
        // so the handler attempts an insert and hits the unique date.
        flags.hideTodayRowOnce = false;
        return [];
      }
      for (const [c, asc] of this.orders) {
        rs = [...rs].sort((a, b) =>
          a[c] < b[c] ? (asc ? -1 : 1) : a[c] > b[c] ? (asc ? 1 : -1) : 0,
        );
      }
      return rs.slice(0, Math.min(this.lim ?? Infinity, FAKE_MAX_ROWS));
    }
    async maybeSingle() {
      const rs = this.rows();
      return { data: rs[0] ?? null, error: null };
    }
    async single() {
      if (this.insertRow) {
        const r = this.doInsert();
        return r.error ? { data: null, error: r.error } : { data: r.data, error: null };
      }
      const rs = this.rows();
      return rs.length === 1
        ? { data: rs[0], error: null }
        : { data: null, error: new Error("single row expected") };
    }
    insert(row) {
      this.insertRow = row;
      return this;
    }
    update(patch) {
      this.patch = patch;
      return this;
    }
    upsert(row) {
      this.upsertRow = row;
      return this;
    }
    doUpsert() {
      const row = { ...this.upsertRow };
      // Conflict key: device_id for preferences, else id. Mirrors
      // PostgREST upsert on the table's primary key.
      const key = row.device_id !== undefined ? "device_id" : row.id !== undefined ? "id" : null;
      if (key) {
        const existing = tables[this.table].find((r) => r[key] === row[key]);
        if (existing) {
          Object.assign(existing, row);
          return { data: existing, error: null };
        }
      }
      if (row.id == null) row.id = `${this.table}-${seq++}`;
      tables[this.table].push(row);
      return { data: row, error: null };
    }
    doInsert() {
      const row = { ...this.insertRow };
      if (this.table === "daily_content_publications") {
        if (tables.daily_content_publications.some((r) => r.kolkata_date === row.kolkata_date)) {
          return { data: null, error: new Error("unique kolkata_date") };
        }
      }
      if (this.table === "daily_content_deliveries") {
        if (flags.throwOnDeliveryInsertAt != null) {
          flags.throwOnDeliveryInsertAt--;
          if (flags.throwOnDeliveryInsertAt === 0) {
            flags.throwOnDeliveryInsertAt = null;
            throw new Error("DB down during delivery insert");
          }
        }
        if (
          row.device_id != null &&
          tables.daily_content_deliveries.some(
            (r) => r.publication_id === row.publication_id && r.device_id === row.device_id,
          )
        ) {
          return { data: null, error: new Error("unique publication/device") };
        }
      }
      if (row.id == null) row.id = `${this.table}-${seq++}`;
      tables[this.table].push(row);
      return { data: row, error: null };
    }
    doUpdate() {
      // Fault-injection flags (tests only; each fires once unless counted).
      if (flags.throwOnSupersedeDeliveries && this.table === "daily_content_deliveries" && this.patch?.status === "failed" && typeof this.patch?.error === "string" && this.patch.error.includes("superseded") && !("attempts" in this.patch)) {
        flags.throwOnSupersedeDeliveries = false;
        throw new Error("DB down during supersede deliveries update");
      }
      if (flags.zeroRowSentUpdateAt != null && this.table === "daily_content_deliveries" && this.patch?.status === "sent") {
        flags.zeroRowSentUpdateAt--;
        if (flags.zeroRowSentUpdateAt === 0) {
          flags.zeroRowSentUpdateAt = null;
          return { data: [], error: null }; // success, zero rows — no mutation
        }
      }
      if (flags.zeroRowFlip && this.table === "daily_content_publications" && this.patch?.status === "published") {
        flags.zeroRowFlip = false;
        return { data: [], error: null }; // success, zero rows — no mutation
      }
      if (flags.throwOnSentUpdate && this.table === "daily_content_deliveries" && this.patch?.status === "sent") {
        flags.throwOnSentUpdate = false;
        throw new Error("DB down during sent update");
      }
      if (flags.commitThenThrowSentUpdate && this.table === "daily_content_deliveries" && this.patch?.status === "sent") {
        flags.commitThenThrowSentUpdate = false;
        // Commit-then-lost-acknowledgement: apply the patch FIRST (the
        // row really becomes sent), then throw as if the response was
        // lost. The catch handler must not resurrect the row.
        const rs = this.rows();
        for (const r of rs) Object.assign(r, this.patch);
        throw new Error("DB ack lost after sent update committed");
      }
      if (flags.throwOnPublicationUpdate && this.table === "daily_content_publications" && this.patch?.status === "published") {
        flags.throwOnPublicationUpdate = false;
        throw new Error("DB down during publication update");
      }
      if (flags.throwOnPromotionUpdate && this.table === "daily_content_deliveries" && this.patch?.status === "retryable" && !("attempts" in this.patch)) {
        flags.throwOnPromotionUpdate = false;
        throw new Error("DB down during promotion update");
      }
      const rs = this.rows();
      for (const r of rs) Object.assign(r, this.patch);
      return { data: rs, error: null };
    }
    then(res, rej) {
      try {
        if (this.upsertRow) return Promise.resolve(this.doUpsert()).then(res, rej);
        if (this.insertRow) return Promise.resolve(this.doInsert()).then(res, rej);
        if (this.patch) return Promise.resolve(this.doUpdate()).then(res, rej);
        return Promise.resolve({ data: this.rows(), error: null }).then(res, rej);
      } catch (e) {
        return Promise.reject(e).then(res, rej);
      }
    }
  }

  return {
    tables,
    flags,
    from: (table) => new Q(table),
  };
}

function kolkataToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const TODAY = kolkataToday();
const YESTERDAY = (() => {
  const d = new Date(Date.now() - 24 * 3600_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
})();
const hadithRow = (over = {}) => ({
  id: "h1",
  book_key: "bukhari",
  chapter_id: 1,
  hadith_number: 1,
  arabic: "ARABIC-H",
  bengali: "BENGALI-H",
  ...over,
});
const duaRow = (slug, over = {}) => ({
  id: `dua-${slug}`,
  slug,
  title: `TITLE-${slug}`,
  title_en: null,
  content: `BENGALI-${slug}`,
  content_arabic: `ARABIC-${slug}`,
  metadata: { reference: `REF-${slug}`, source_type: "Dua" },
  status: "published",
  content_type: "dua",
  ...over,
});
const token = (id, deviceId) => ({
  id,
  token: JSON.stringify({ endpoint: `https://push.example/${id}`, keys: {} }),
  platform: "web",
  enabled: true,
  device_id: deviceId,
});

let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

async function callEdge(body) {
  const req = new Request("http://edge/functions/v1/daily-content", {
    method: "POST",
    headers: {
      authorization: "Bearer test-secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const res = await capturedHandler(req);
  return { status: res.status, json: await res.json() };
}

// Phase 3: the preference endpoint takes no CRON secret — the subscription
// endpoint in the body is its credential — so tests call without auth.
async function callEdgeNoAuth(body) {
  const req = new Request("http://edge/functions/v1/daily-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
const throwWith = (err) => () => {
  throw err;
};

// ---- H2: fresh run publishes only after the send finishes ----
await t("edge H2: fresh run ends published with delivery counts", async () => {
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
  assert.equal(svc.tables.daily_content_publications.length, 1);
  const pub = svc.tables.daily_content_publications[0];
  assert.equal(pub.status, "published");
  assert.equal(pub.recipients_total, 2);
  assert.equal(pub.recipients_sent, 2);
  assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 2);
  assert.equal(calls.length, 2);
});

// ---- Opt-out: a device with daily_enabled=false is never sent ----
await t("edge opt-out: daily_enabled=false device is skipped, no row, no send", async () => {
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
  const pub = svc.tables.daily_content_publications[0];
  assert.equal(pub.status, "published");
  assert.equal(pub.recipients_total, 1);
  assert.equal(pub.recipients_sent, 1);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_deliveries.length, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].device_id, "d1");
});

// ---- N-1: retry path respects opt-outs ----
await t("edge N-1: retry skips opted-out device and closes its row, no send", async () => {
  const pub = { id: "pub-o", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [pub],
    tokens: [token("t1", "d1"), token("t2", "d2")],
    deliveries: [
      { id: "o1", publication_id: "pub-o", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
      { id: "o2", publication_id: "pub-o", token_id: "t2", device_id: "d2", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
    prefs: [{ device_id: "d2", daily_enabled: false }],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 1);
  const o1 = svc.tables.daily_content_deliveries.find((d) => d.id === "o1");
  const o2 = svc.tables.daily_content_deliveries.find((d) => d.id === "o2");
  assert.equal(o1.status, "sent");
  assert.equal(o2.status, "failed");
  assert.equal(o2.error, "device opted out of daily content");
});

// ---- R-5: retry tick landing mid-send must not double-send ----
await t("edge R-5: retry tick during daily send sends nothing extra", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  // Gate the first provider call open: the daily run blocks inside its
  // send while the tick runs, proving the tick cannot re-send the
  // leased row. Without the claim, the tick would promote + send it.
  let releaseGate;
  let markStarted;
  const started = new Promise((r) => { markStarted = r; });
  const gate = new Promise((r) => { releaseGate = r; });
  const calls = [];
  stubs.holder.webpush = {
    calls,
    sendNotification: async (sub, payload) => {
      calls.push({ sub, payload });
      markStarted();
      await gate;
      return { statusCode: 201 };
    },
  };
  const dailyReq = new Request("http://edge/functions/v1/daily-content", {
    method: "POST",
    headers: {
      authorization: "Bearer test-secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const dailyPromise = capturedHandler(dailyReq);
  await started; // daily is inside its provider call, row claimed
  const tick = await callEdge({ retry_only: true });
  assert.equal(tick.json.ok, true);
  assert.equal(tick.json.promoted, 0);
  releaseGate();
  const dailyRes = await dailyPromise;
  const dailyJson = await dailyRes.json();
  assert.equal(dailyJson.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length, 1);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
});

// ---- Strand recovery: tick promotes pending rows of today's published publication ----
await t("edge strand: tick recovers due pending row of today's published publication", async () => {
  const pub = { id: "pub-s", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [pub],
    tokens: [token("t1", "d1")],
    deliveries: [
      { id: "s1", publication_id: "pub-s", token_id: "t1", device_id: "d1", status: "pending", attempts: 0, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(res.json.promoted, 0);
  assert.equal(res.json.promotedPublished, 1);
  const s1 = svc.tables.daily_content_deliveries.find((d) => d.id === "s1");
  assert.equal(s1.status, "sent");
});

await t("edge strand: tick leaves leased pending row of published publication untouched", async () => {
  const pub = { id: "pub-s", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [pub],
    tokens: [token("t1", "d1")],
    deliveries: [
      { id: "s1", publication_id: "pub-s", token_id: "t1", device_id: "d1", status: "pending", attempts: 0, next_attempt_at: "2999-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 0);
  assert.equal(res.json.promotedPublished, 0);
  const s1 = svc.tables.daily_content_deliveries.find((d) => d.id === "s1");
  assert.equal(s1.status, "pending");
});

// ---- Strand scoping: yesterday's published publication is never revived ----
// Phase 7: the stranded pending row is now failed terminally (visible +
// auditable) instead of sitting pending forever. It is still never sent.
await t("edge strand: tick fails (never revives) pending row of yesterday's published publication", async () => {
  const pub = { id: "pub-y", kolkata_date: YESTERDAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [pub],
    tokens: [token("t1", "d1")],
    deliveries: [
      { id: "y1", publication_id: "pub-y", token_id: "t1", device_id: "d1", status: "pending", attempts: 0, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 0);
  assert.equal(res.json.promoted, 0);
  assert.equal(res.json.promotedPublished, 0);
  const y1 = svc.tables.daily_content_deliveries.find((d) => d.id === "y1");
  assert.equal(y1.status, "failed");
  assert.equal(y1.error, "stale: publication date has passed");
});

// ---- NULL retryable: tick selects and sends a retryable row with null next_attempt_at ----
await t("edge NULL retryable: tick sends retryable row with null next_attempt_at", async () => {
  const pub = { id: "pub-n", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [pub],
    tokens: [token("t1", "d1")],
    deliveries: [
      { id: "n1", publication_id: "pub-n", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: null },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 1);
  const n1 = svc.tables.daily_content_deliveries.find((d) => d.id === "n1");
  assert.equal(n1.status, "sent");
});

// ---- Push timeout clamp: at most half the 10-minute lease ----
await t("edge push timeout: DAILY_CONTENT_PUSH_TIMEOUT_MS clamps to 300,000 ms", async () => {
  const prev = edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS;
  try {
    delete edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS;
    assert.equal(edgeMod.pushTimeoutMs(), 30_000);
    edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "abc";
    assert.equal(edgeMod.pushTimeoutMs(), 30_000);
    edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "0";
    assert.equal(edgeMod.pushTimeoutMs(), 30_000);
    edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "-5";
    assert.equal(edgeMod.pushTimeoutMs(), 30_000);
    edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "60000";
    assert.equal(edgeMod.pushTimeoutMs(), 60_000);
    edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "300000";
    assert.equal(edgeMod.pushTimeoutMs(), 300_000);
    edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "600000";
    assert.equal(edgeMod.pushTimeoutMs(), 300_000);
    edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "900000";
    assert.equal(edgeMod.pushTimeoutMs(), 300_000);
  } finally {
    if (prev === undefined) delete edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS;
    else edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = prev;
  }
});

// ---- H2: crash mid-send leaves planned; resume adopts, no duplicates ----
await t("edge H2: crash leaves planned, resume adopts without re-sending", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2")],
  });
  svc.flags.throwOnDeliveryInsertAt = 2; // crash on the 2nd token's insert
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const crashed = await callEdge({});
  assert.equal(crashed.status, 500);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(svc.tables.daily_content_publications[0].status, "planned");
  assert.equal(
    svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length,
    1,
  );
  const resumed = await callEdge({});
  assert.equal(resumed.json.ok, true);
  assert.equal(svc.tables.daily_content_publications.length, 1); // no duplicate row
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
  assert.equal(
    svc.tables.daily_content_deliveries.filter((d) => d.status === "sent").length,
    2,
  );
  assert.equal(calls.length, 2); // t1 sent once, t2 sent once — never twice
});

// ---- H2: stale pending rows are promoted to retryable, not dropped ----
await t("edge H2: stale pending delivery is promoted for the retry tick", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2")],
  });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  // Simulate an older crashed run: a planned row with one pending delivery.
  svc.tables.daily_content_publications.push({
    id: "pub-old",
    kolkata_date: TODAY,
    status: "planned",
    push: { title: "T", body: "B" },
    cards: [],
  });
  svc.tables.daily_content_deliveries.push({
    id: "del-old",
    publication_id: "pub-old",
    token_id: "t2",
    device_id: "d2",
    status: "pending",
    attempts: 0,
  });
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  const promoted = svc.tables.daily_content_deliveries.find((d) => d.id === "del-old");
  assert.equal(promoted.status, "retryable");
  assert.ok(promoted.next_attempt_at);
  // The live run does not re-send a row it did not create this run.
  assert.equal(calls.length, 1); // only t1 (fresh cap row) is sent now
});

// ---- H2: published day dedupes; retry-only never publishes ----
await t("edge H2: published day dedupes with zero sends", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
    publications: [
      { id: "pub-done", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.deduped, true);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(calls.length, 0);
});

// Phase 4: a scheduler that fires twice for the same date (double cron,
// overlapping triggers, manual re-run) must not double-publish or
// double-send. Two sequential LIVE daily calls: the first publishes and
// sends once; the second dedupes with zero additional sends.
await t("edge Phase 4: a second daily trigger for the same date dedupes with zero extra sends", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const first = await callEdge({});
  assert.equal(first.json.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
  const second = await callEdge({});
  assert.equal(second.json.ok, true);
  assert.equal(second.json.deduped, true);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(svc.tables.daily_content_deliveries.length, 1);
});

await t("edge H2: insert race adopts the planned row", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
    publications: [
      { id: "pub-race", kolkata_date: TODAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
  });
  svc.flags.hideTodayRowOnce = true; // first today-row read misses the row
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
  assert.equal(calls.length, 1);
});

await t("edge retry-only: never creates a publication", async () => {
  const svc = makeSvc({ settings: [{ enabled: true }], tokens: [token("t1", "d1")] });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(res.json.retried, 0);
  assert.equal(svc.tables.daily_content_publications.length, 0);
});

// ---- H3: card cycle exhaustion restarts, partial pool does not ----
await t("edge H3: exhausted card pool wraps and advances the cycle", async () => {
  const slugs = ["s1", "s2", "s3"];
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: slugs.map((s) => duaRow(s)),
    tokens: [],
    publications: [
      {
        id: "pub-c1",
        kolkata_date: "2026-01-01",
        status: "published",
        hadith_cycle: 1,
        card_cycle: 1,
        cards: slugs.map((s) => ({ recordRef: `content:${s}` })),
      },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  const pub = svc.tables.daily_content_publications.find((p) => p.id !== "pub-c1");
  assert.ok(pub);
  assert.equal(pub.card_cycle, 2);
  const refs = pub.cards.map((c) => c.recordRef);
  assert.ok(refs.some((r) => r.startsWith("content:")), "wrapped pool yields cards again");
});

await t("edge H3: partial pool keeps its cycle and skips used refs", async () => {
  const slugs = ["s1", "s2", "s3"];
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: slugs.map((s) => duaRow(s)),
    tokens: [],
    publications: [
      {
        id: "pub-c1",
        kolkata_date: "2026-01-01",
        status: "published",
        hadith_cycle: 1,
        card_cycle: 1,
        cards: [{ recordRef: "content:s1" }],
      },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  const pub = svc.tables.daily_content_publications.find((p) => p.id !== "pub-c1");
  assert.equal(pub.card_cycle, 1);
  assert.ok(!pub.cards.map((c) => c.recordRef).includes("content:s1"));
});

// ---- M1: settings gate ----
await t("edge M1: missing or disabled settings pause, enabled proceeds", async () => {
  for (const settings of [[], [{ enabled: false }]]) {
    const svc = makeSvc({ settings, hadiths: [hadithRow()], duas: ["s1"].map((s) => duaRow(s)), tokens: [] });
    stubs.holder.svc = svc;
    setWebpush(ok201);
    const res = await callEdge({});
    assert.equal(res.json.reason, "paused");
    assert.equal(svc.tables.daily_content_publications.length, 0);
  }
  const svc = makeSvc({ settings: [{ enabled: true }], hadiths: [hadithRow()], duas: ["s1"].map((s) => duaRow(s)), tokens: [] });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_publications.length, 1);
});

// ---- M2: structured status classification ----
await t("edge M2: 410 disables even without digits in the message", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  setWebpush(throwWith(Object.assign(new Error("gone"), { statusCode: 410 })));
  await callEdge({});
  assert.equal(svc.tables.device_push_tokens[0].enabled, false);
  // First-send path records the classification itself: 'disabled' is a
  // terminal delivery status (the migration allows it), so the row is
  // never picked up by the retry tick.
  assert.equal(svc.tables.daily_content_deliveries[0].status, "disabled");
});

await t("edge M2: digit-bearing message without a status code stays retryable", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  setWebpush(throwWith(new Error("upstream https://x.example/410 returned html")));
  await callEdge({});
  assert.equal(svc.tables.device_push_tokens[0].enabled, true);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "retryable");
  assert.ok(svc.tables.daily_content_deliveries[0].next_attempt_at);
});

await t("edge M2: 429 and 500 are retryable with a next attempt", async () => {
  for (const code of [429, 500]) {
    const svc = makeSvc({
      settings: [{ enabled: true }],
      hadiths: [hadithRow()],
      duas: ["s1"].map((s) => duaRow(s)),
      tokens: [token("t1", "d1")],
    });
    stubs.holder.svc = svc;
    setWebpush(throwWith(Object.assign(new Error(`HTTP ${code}`), { statusCode: code })));
    await callEdge({});
    assert.equal(svc.tables.daily_content_deliveries[0].status, "retryable");
    assert.ok(svc.tables.daily_content_deliveries[0].next_attempt_at);
    assert.equal(svc.tables.device_push_tokens[0].enabled, true);
  }
});

// ---- Retry backoff, max attempts, and 410-on-retry ----
await t("edge retry: backoff steps, max attempts, 410 disables on retry", async () => {
  const pub = { id: "pub-r", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [pub],
    tokens: [token("t1", "d1"), token("t2", "d2"), token("t3", "d3")],
    deliveries: [
      { id: "r1", publication_id: "pub-r", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
      { id: "r2", publication_id: "pub-r", token_id: "t2", device_id: "d2", status: "retryable", attempts: 3, next_attempt_at: "2000-01-01T00:00:00.000Z" },
      { id: "r3", publication_id: "pub-r", token_id: "t3", device_id: "d3", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(async (sub) => {
    const ep = JSON.parse(typeof sub === "string" ? sub : JSON.stringify(sub)).endpoint ?? "";
    if (ep.endsWith("/t3")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    throw Object.assign(new Error("HTTP 500"), { statusCode: 500 });
  });
  const before = Date.now();
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.retried, 3);
  const r1 = svc.tables.daily_content_deliveries.find((d) => d.id === "r1");
  const r2 = svc.tables.daily_content_deliveries.find((d) => d.id === "r2");
  const r3 = svc.tables.daily_content_deliveries.find((d) => d.id === "r3");
  assert.equal(r1.status, "retryable");
  assert.equal(r1.attempts, 2);
  const delayMin = (new Date(r1.next_attempt_at).getTime() - before) / 60000;
  assert.ok(delayMin >= 14 && delayMin <= 16, `expected ~15min backoff, got ${delayMin}`);
  assert.equal(r2.status, "failed"); // attempts hit the max of 4
  assert.equal(r2.attempts, 4);
  assert.equal(r3.status, "failed");
  assert.equal(svc.tables.device_push_tokens.find((x) => x.id === "t3").enabled, false);
  assert.equal(svc.tables.daily_content_publications.length, 1); // no new publication
});

// ---- H2 remediation: failed rows, corrupt rows, tick recovery, past rows ----
await t("edge H2: same-date rerun repairs a failed no-Hadith publication", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [],
    publications: [
      { id: "pub-fail", kolkata_date: TODAY, status: "failed", error: "No eligible hadith in the pool." },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  const pub = svc.tables.daily_content_publications[0];
  assert.equal(pub.id, "pub-fail"); // repaired in place, not replaced
  assert.equal(pub.status, "published");
  assert.ok(pub.hadith_ref);
});

await t("edge H2: failed row stays failed while the plan is still invalid", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [],
    publications: [
      { id: "pub-fail", kolkata_date: TODAY, status: "failed", error: "No eligible hadith in the pool." },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, false);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(svc.tables.daily_content_publications[0].status, "failed");
});

await t("edge H2: corrupt planned row is repaired in place, never re-inserted", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [],
    publications: [
      { id: "pub-corrupt", kolkata_date: TODAY, status: "planned", push: null, cards: [] },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(svc.tables.daily_content_publications[0].id, "pub-corrupt");
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
});

await t("edge H2: tick recovers today's planned publication without publishing it", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t2", "d2")],
    publications: [
      { id: "pub-plan", kolkata_date: TODAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
    deliveries: [
      { id: "del-p", publication_id: "pub-plan", token_id: "t2", device_id: "d2", status: "pending", attempts: 0 },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(res.json.promoted, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
  assert.equal(calls.length, 1);
  // The tick recovers deliveries; it never flips the row to published.
  assert.equal(svc.tables.daily_content_publications[0].status, "planned");
  assert.equal(svc.tables.daily_content_publications.length, 1);
});

await t("edge H2: tick creates no publication and publishes nothing", async () => {
  const svc = makeSvc({ settings: [{ enabled: true }], tokens: [token("t1", "d1")] });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(res.json.promoted, 0);
  assert.equal(res.json.superseded, 0);
  assert.equal(res.json.publication_id, undefined);
  assert.equal(svc.tables.daily_content_publications.length, 0);
});

await t("edge H2: past-date planned row is superseded, never reused", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("tX", "dX")],
    publications: [
      { id: "pub-old", kolkata_date: YESTERDAY, status: "planned", push: { title: "STALE", body: "STALE" }, cards: [] },
    ],
    deliveries: [
      { id: "del-old", publication_id: "pub-old", token_id: "tX", device_id: "dX", status: "pending", attempts: 0 },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const tick = await callEdge({ retry_only: true });
  assert.equal(tick.json.superseded, 1);
  const stale = svc.tables.daily_content_publications.find((p) => p.id === "pub-old");
  assert.equal(stale.status, "failed");
  assert.match(stale.error, /superseded/);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "failed");
  assert.equal(calls.length, 0); // stale content is never sent
  const daily = await callEdge({});
  assert.equal(daily.json.ok, true);
  assert.equal(svc.tables.daily_content_publications.length, 2);
  const today = svc.tables.daily_content_publications.find((p) => p.kolkata_date === TODAY);
  assert.equal(today.status, "published");
  assert.notEqual(today.push.title, "STALE");
});

await t("edge H1: retryable rows of a superseded publication are never sent", async () => {
  // SUPERSEDES the 4c78eb7 policy ("terminate naturally"): a supersede
  // now fails retryable rows too, and the parent check in runRetries
  // closes any straggler. No stale notification may survive supersede.
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("tX", "dX")],
    publications: [
      { id: "pub-old", kolkata_date: YESTERDAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
    deliveries: [
      { id: "del-r", publication_id: "pub-old", token_id: "tX", device_id: "dX", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.superseded, 1);
  assert.equal(svc.tables.daily_content_publications[0].status, "failed");
  assert.equal(svc.tables.daily_content_deliveries[0].status, "failed");
  assert.equal(calls.length, 0);
});

await t("edge H2: pending row from a post-acceptance crash is re-sent once by the tick (at-least-once window)", async () => {
  // NOTE on simulation: a delivery-update DB error inside sendToTokens is
  // caught per token and degrades to retryable — it cannot crash the run
  // (verified while writing this test). A true process death between
  // provider acceptance and the sent-update therefore cannot be produced
  // in-process; what IS tested here is the resulting state and its
  // recovery, which is the behavior that matters. Simulated post-accept
  // state: the push went out once (priorSends = 1) but its row stayed
  // pending because the process died before the update.
  const priorSends = 1;
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t2", "d2")],
    publications: [
      { id: "pub-plan", kolkata_date: TODAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
    deliveries: [
      { id: "del-p", publication_id: "pub-plan", token_id: "t2", device_id: "d2", status: "pending", attempts: 0 },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const tick = await callEdge({ retry_only: true });
  assert.equal(tick.json.ok, true);
  assert.equal(tick.json.promoted, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
  assert.equal(calls.length, 1);
  // Total sends for this device = prior acceptance + this tick re-send.
  // This single duplicate is the known window where no transaction spans
  // the push provider and the database; systematic duplicates (re-runs,
  // retries, completed rows) stay barred by the cap and the token check.
  assert.equal(priorSends + calls.length, 2);
});

await t("edge H2: publication flip failure recovers without re-sending", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  svc.flags.throwOnPublicationUpdate = true; // flip to published throws after all sends
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const crashed = await callEdge({});
  assert.equal(crashed.status, 500);
  assert.equal(svc.tables.daily_content_publications[0].status, "planned");
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
  const resumed = await callEdge({});
  assert.equal(resumed.json.ok, true);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
  assert.equal(calls.length, 1); // the completed delivery is never sent again
});

await t("edge H2: promotion failure leaves the row planned and recoverable", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t2", "d2")],
    publications: [
      { id: "pub-plan", kolkata_date: TODAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
    deliveries: [
      { id: "del-p", publication_id: "pub-plan", token_id: "t2", device_id: "d2", status: "pending", attempts: 0 },
    ],
  });
  svc.flags.throwOnPromotionUpdate = true;
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const failed = await callEdge({});
  assert.equal(failed.status, 500);
  assert.equal(svc.tables.daily_content_publications[0].status, "planned");
  assert.equal(svc.tables.daily_content_deliveries[0].status, "pending");
  const resumed = await callEdge({});
  assert.equal(resumed.json.ok, true);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
  assert.equal(svc.tables.daily_content_deliveries[0].status, "retryable");
  const tick = await callEdge({ retry_only: true });
  assert.equal(tick.json.ok, true);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
  assert.equal(calls.length, 1);
});

await t("edge mixed: 410, 201 and 429 outcomes in a single run", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2"), token("t3", "d3")],
  });
  stubs.holder.svc = svc;
  setWebpush(async (sub) => {
    const ep = JSON.parse(typeof sub === "string" ? sub : JSON.stringify(sub)).endpoint ?? "";
    if (ep.endsWith("/t1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    if (ep.endsWith("/t3")) throw Object.assign(new Error("HTTP 429"), { statusCode: 429 });
    return { statusCode: 201 };
  });
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.deepEqual(
    { total: res.json.delivery.total, sent: res.json.delivery.sent, failed: res.json.delivery.failed, skipped: res.json.delivery.skipped },
    { total: 3, sent: 1, failed: 2, skipped: 0 },
  );
  assert.equal(svc.tables.device_push_tokens.find((x) => x.id === "t1").enabled, false);
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.device_id === "d1").status, "disabled");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.device_id === "d2").status, "sent");
  const d3 = svc.tables.daily_content_deliveries.find((d) => d.device_id === "d3");
  assert.equal(d3.status, "retryable");
  assert.ok(d3.next_attempt_at);
});

// ---- M3: NULL / empty device handling ----
await t("edge M3: NULL and empty device_ids are skipped, never sent", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", null), token("t3", ""), token("t4", "   ")],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(res.json.delivery.skipped, 3);
  assert.equal(res.json.delivery.total, 1);
  assert.equal(res.json.delivery.sent, 1);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_deliveries.length, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].device_id, "d1");
});

await t("edge M3: NULL devices stay skipped across crash and resume", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", null)],
  });
  svc.flags.throwOnPublicationUpdate = true; // crash after t1's send
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const crashed = await callEdge({});
  assert.equal(crashed.status, 500);
  const resumed = await callEdge({});
  assert.equal(resumed.json.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_deliveries.length, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].device_id, "d1");
  assert.equal(resumed.json.delivery.skipped, 1);
});

await t("edge M3: same token identity is never sent twice, even after a device_id change", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  svc.flags.throwOnPublicationUpdate = true; // crash after t1's send
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const crashed = await callEdge({});
  assert.equal(crashed.status, 500);
  // The token re-registers under a new device_id before the resume.
  svc.tables.device_push_tokens.find((x) => x.id === "t1").device_id = "d2";
  const resumed = await callEdge({});
  assert.equal(resumed.json.ok, true);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
  assert.equal(calls.length, 1); // token pre-check skips the re-registered device
  assert.equal(svc.tables.daily_content_deliveries.length, 1);
});

// ---- Decided owner policies (launch preparation) ----
await t("edge policy: pause stops retry ticks (no promotion, no retry, no send)", async () => {
  // DECIDED POLICY (see edge header): the settings gate applies to the
  // retry branch exactly as to the daily branch. A paused system sends
  // nothing at all — the tick must not promote, supersede, or retry.
  const svc = makeSvc({
    settings: [],
    publications: [
      { id: "pub-r", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
      { id: "pub-p", kolkata_date: YESTERDAY, status: "planned", push: { title: "T", body: "B" } },
    ],
    tokens: [token("t1", "d1")],
    deliveries: [
      { id: "r1", publication_id: "pub-r", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
      { id: "p1", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "pending", attempts: 0, next_attempt_at: null },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, false);
  assert.equal(res.json.reason, "paused");
  assert.equal(calls.length, 0);
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "r1").status, "retryable");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "p1").status, "pending");
  assert.equal(svc.tables.daily_content_publications.find((p) => p.id === "pub-p").status, "planned"); // not superseded while paused
});

await t("edge policy: retry_only + dry_run is rejected and performs nothing", async () => {
  // DECIDED POLICY (see edge header): the combination is a client
  // error at the edge (and at the endpoint, tested in tests.mjs). No
  // planning, publication, or sending may happen.
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [
      { id: "pub-r", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
    tokens: [token("t1", "d1")],
    deliveries: [
      { id: "r1", publication_id: "pub-r", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true, dry_run: true });
  assert.equal(res.status, 400);
  assert.equal(res.json.ok, false);
  assert.equal(calls.length, 0);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "retryable");
  assert.equal(svc.tables.daily_content_publications.length, 1); // no new row
});

// ---- Final remediation: stale block, atomic claim, zero-row protection ----
await t("edge H1: failed parent publication is excluded from retry selection", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t1", "d1")],
    publications: [
      { id: "pub-f", kolkata_date: YESTERDAY, status: "failed", push: { title: "T", body: "B" } },
    ],
    deliveries: [
      { id: "r1", publication_id: "pub-f", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  // The parent check closes the straggler terminally instead of sending it.
  assert.equal(svc.tables.daily_content_deliveries[0].status, "failed");
  assert.equal(calls.length, 0);
});

await t("edge H1: published parent deliveries still retry normally", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t1", "d1")],
    publications: [
      { id: "pub-p", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
    deliveries: [
      { id: "r1", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
  assert.equal(calls.length, 1);
});

await t("edge H1: halfway supersede failure recovers without stale sends", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("tX", "dX")],
    publications: [
      { id: "pub-old", kolkata_date: YESTERDAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
    deliveries: [
      { id: "del-p", publication_id: "pub-old", token_id: "tX", device_id: "dX", status: "pending", attempts: 0 },
      { id: "del-r", publication_id: "pub-old", token_id: "tX", device_id: "dX", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  svc.flags.throwOnSupersedeDeliveries = true; // row fails, deliveries update throws
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const first = await callEdge({ retry_only: true });
  assert.equal(first.status, 500);
  assert.equal(svc.tables.daily_content_publications[0].status, "failed");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "del-p").status, "pending");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "del-r").status, "retryable");
  // Next tick: the row is already failed, so the stale query skips it —
  // but the parent check in runRetries closes both stragglers, unsent.
  const second = await callEdge({ retry_only: true });
  assert.equal(second.json.ok, true);
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "del-p").status, "pending");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "del-r").status, "failed");
  assert.equal(calls.length, 0);
});

await t("edge H2: two overlapping ticks send a retryable delivery exactly once", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t1", "d1")],
    publications: [
      { id: "pub-p", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
    deliveries: [
      { id: "r1", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  // Genuine overlap: both ticks run concurrently against the same store.
  // The atomic claim (one conditional UPDATE) lets exactly one win; the
  // loser matches zero rows and skips without sending.
  const [a, b] = await Promise.all([callEdge({ retry_only: true }), callEdge({ retry_only: true })]);
  assert.equal(a.json.ok, true);
  assert.equal(b.json.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
});

await t("edge H2: claimed row recovers after worker failure, sent row cannot be reclaimed", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t1", "d1")],
    publications: [
      { id: "pub-p", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
    deliveries: [
      // Claimed by a worker that died mid-send: lease still active.
      { id: "r1", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2999-01-01T00:00:00.000Z" },
      { id: "r2", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "sent", attempts: 1 },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const first = await callEdge({ retry_only: true });
  assert.equal(first.json.ok, true);
  assert.equal(calls.length, 0); // active lease: not claimable, not sent
  // Lease expires: the row becomes claimable again and sends exactly once.
  svc.tables.daily_content_deliveries.find((d) => d.id === "r1").next_attempt_at = "2000-01-01T00:00:00.000Z";
  const second = await callEdge({ retry_only: true });
  assert.equal(second.json.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "r1").status, "sent");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.id === "r2").status, "sent");
});

await t("edge H2: 410 on a claimed retry still disables the token", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t1", "d1")],
    publications: [
      { id: "pub-p", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
    deliveries: [
      { id: "r1", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(async () => {
    throw Object.assign(new Error("gone"), { statusCode: 410 });
  });
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.device_push_tokens[0].enabled, false);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "failed");
});

await t("edge H3: zero-row sent update is not counted as success", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2")],
  });
  svc.flags.zeroRowSentUpdateAt = 2; // t2's sent-update succeeds with zero rows
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  // t1 sent normally; t2's push went out but its row never flipped, so
  // it degrades to retryable and is NOT counted sent.
  assert.equal(res.json.delivery.sent, 1);
  assert.equal(res.json.delivery.failed, 1);
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.device_id === "d1").status, "sent");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.device_id === "d2").status, "retryable");
});

await t("edge H3: sent-update database error degrades to retryable, batch continues", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1"), token("t2", "d2")],
  });
  svc.flags.throwOnSentUpdate = true; // t1's sent-update throws
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.device_id === "d1").status, "retryable");
  assert.equal(svc.tables.daily_content_deliveries.find((d) => d.device_id === "d2").status, "sent");
  assert.equal(res.json.delivery.sent, 1);
  assert.equal(res.json.delivery.failed, 1);
});

await t("edge H3: zero-row publication flip is not reported as published", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  svc.flags.zeroRowFlip = true; // flip succeeds with zero rows
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.status, 500);
  assert.equal(svc.tables.daily_content_publications[0].status, "planned");
});

await t("edge H3: tick promotion error fails safely, zero pending promotes zero", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t2", "d2")],
    publications: [
      { id: "pub-plan", kolkata_date: TODAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
    deliveries: [
      { id: "del-p", publication_id: "pub-plan", token_id: "t2", device_id: "d2", status: "pending", attempts: 0 },
    ],
  });
  svc.flags.throwOnPromotionUpdate = true; // tick promotion throws
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const failed = await callEdge({ retry_only: true });
  assert.equal(failed.status, 500);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "pending");
  // Flag spent: the next tick promotes and sends normally.
  const ok = await callEdge({ retry_only: true });
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.promoted, 1);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
  // Zero pending is a normal empty outcome, not an error.
  const svc2 = makeSvc({
    settings: [{ enabled: true }],
    publications: [
      { id: "pub-plan", kolkata_date: TODAY, status: "planned", push: { title: "T", body: "B" }, cards: [] },
    ],
  });
  stubs.holder.svc = svc2;
  const empty = await callEdge({ retry_only: true });
  assert.equal(empty.json.ok, true);
  assert.equal(empty.json.promoted, 0);
});

await t("edge H3: concurrent repair conflict never clobbers a published row", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [],
    publications: [
      { id: "pub-fail", kolkata_date: TODAY, status: "failed", error: "No eligible hadith in the pool." },
    ],
  });
  stubs.holder.svc = svc;
  setWebpush(ok201);
  const [a, b] = await Promise.all([callEdge({}), callEdge({})]);
  // S-5 (2026-11-08): the flip is conditional on status = 'planned',
  // so exactly one run flips the row to published; the other matches
  // zero rows and reports the flip failure instead of silently
  // overwriting the first run's counters. Which run wins is a race.
  const oks = [a.json.ok, b.json.ok].filter(Boolean).length;
  assert.equal(oks, 1);
  const loser = a.json.ok ? b : a;
  assert.match(loser.json.error, /flip affected 0 rows/);
  assert.equal(svc.tables.daily_content_publications.length, 1);
  assert.equal(svc.tables.daily_content_publications[0].status, "published");
});

// ---- Launch hardening A: sent-row resurrection + B: push timeout ----
await t("edge hardening A: first-send sent update commits but ack is lost — row stays sent, no re-send", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  svc.flags.commitThenThrowSentUpdate = true; // commit, then lose the ack
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent"); // catch patch matched zero rows
  assert.equal(calls.length, 1);
  // A later tick must not re-send the same delivery.
  const calls2 = setWebpush(ok201);
  const tick = await callEdge({ retry_only: true });
  assert.equal(tick.json.ok, true);
  assert.equal(calls2.length, 0);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
});

await t("edge hardening A: retry sent update commits but ack is lost — row stays sent, next tick does not re-send", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [
      { id: "pub-p", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
    tokens: [token("t1", "d1")],
    deliveries: [
      { id: "r1", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  svc.flags.commitThenThrowSentUpdate = true; // commit, then lose the ack
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent"); // catch patch matched zero rows
  assert.equal(calls.length, 1);
  const calls2 = setWebpush(ok201);
  const tick2 = await callEdge({ retry_only: true });
  assert.equal(tick2.json.ok, true);
  assert.equal(calls2.length, 0);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
});

await t("edge hardening B: push timeout is retryable and never disables the token", async () => {
  edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "25"; // fast timeout for this test only
  try {
    const svc = makeSvc({
      settings: [{ enabled: true }],
      hadiths: [hadithRow()],
      duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
      tokens: [token("t1", "d1")],
    });
    stubs.holder.svc = svc;
    const calls = setWebpush(() => new Promise(() => {})); // provider never responds
    const res = await callEdge({});
    assert.equal(res.json.ok, true);
    const row = svc.tables.daily_content_deliveries[0];
    assert.equal(row.status, "retryable");
    assert.ok(row.next_attempt_at && new Date(row.next_attempt_at).getTime() > Date.now());
    assert.equal(svc.tables.device_push_tokens[0].enabled, true); // timeout must not disable
    assert.equal(calls.length, 1); // exactly one attempt, no silent in-call retry
  } finally {
    delete edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS;
  }
});

await t("edge hardening B: late provider completion after timeout cannot change the row; next tick re-sends once (at-least-once)", async () => {
  edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS = "25"; // timeout fires first
  try {
    const svc = makeSvc({
      settings: [{ enabled: true }],
      publications: [
        { id: "pub-p", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
      ],
      tokens: [token("t1", "d1")],
      deliveries: [
        { id: "r1", publication_id: "pub-p", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
      ],
    });
    stubs.holder.svc = svc;
    // Provider accepts LATE (100 ms), after the 25 ms timeout already fired.
    const calls = setWebpush(() => new Promise((resolve) => setTimeout(() => resolve({ statusCode: 201 }), 100)));
    const res = await callEdge({ retry_only: true });
    assert.equal(res.json.ok, true);
    assert.equal(svc.tables.daily_content_deliveries[0].status, "retryable"); // timeout path, not sent
    assert.equal(calls.length, 1);
    // Let the late acceptance land: it must not touch the row.
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(svc.tables.daily_content_deliveries[0].status, "retryable");
    // Simulate time passing, then the next tick re-sends (documented
    // at-least-once: the provider accepted once, the retry sends again).
    svc.tables.daily_content_deliveries[0].next_attempt_at = "2000-01-01T00:00:00.000Z";
    delete edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS; // default 30 s, so the re-send succeeds
    const tick2 = await callEdge({ retry_only: true });
    assert.equal(tick2.json.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(svc.tables.daily_content_deliveries[0].status, "sent");
  } finally {
    delete edgeEnvOverrides.DAILY_CONTENT_PUSH_TIMEOUT_MS;
  }
});

// ---- Phase 2: hadith pool pagination past the 5,000-row limit ----
const bigHadiths = (count) =>
  Array.from({ length: count }, (_, i) =>
    hadithRow({ id: `h${i + 1}`, hadith_number: i + 1 }),
  );

await t("edge Phase 2: dry-run plans from the full 7,220-row hadith pool", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: bigHadiths(7220),
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.dry_run, true);
  // Before this fix the pool was capped at 5,000 by .limit(5000); the
  // fake honours limit, so this test FAILS on the old code (pool 5000)
  // and passes only when keyset pagination fetches all 7,220 rows.
  assert.equal(res.json.plan.diagnostics.hadithPool, 7220);
  assert.equal(res.json.plan.diagnostics.hadithEligible, 7220);
  assert.equal(res.json.plan.diagnostics.hadithPoolTruncated, false);
  assert.ok(res.json.plan.hadith);
  // Determinism: the seeded pick is stable across repeated dry-runs
  // (same pool -> same shuffle seed -> same pick).
  const res2 = await callEdge({ dry_run: true });
  assert.equal(res2.json.plan.hadith.id, res.json.plan.hadith.id);
  assert.equal(res2.json.plan.diagnostics.hadithPool, 7220);
});

await t("edge Phase 2: page-boundary pools (1,000 / 1,001 / 2,000 rows) are complete", async () => {
  for (const count of [1000, 1001, 2000]) {
    const svc = makeSvc({
      settings: [{ enabled: true }],
      hadiths: bigHadiths(count),
      duas: [],
      tokens: [],
    });
    stubs.holder.svc = svc;
    const res = await callEdge({ dry_run: true });
    assert.equal(res.json.plan.diagnostics.hadithPool, count, `pool ${count}`);
    assert.equal(res.json.plan.diagnostics.hadithEligible, count, `eligible ${count}`);
    assert.equal(res.json.plan.diagnostics.hadithPoolTruncated, false);
    assert.ok(res.json.plan.hadith, `pick ${count}`);
  }
});

await t("edge Phase 2: decimal hadith numbers paginate in order", async () => {
  // Real data has decimal numbers in the local files (e.g. 690.2); the
  // production column is `integer NOT NULL`, so decimals cannot occur
  // there — but the keyset cursor must still order them numerically,
  // not lexicographically, across page breaks. Note 690.2 is INELIGIBLE
  // by the standing integer rule (edge eligibleHadith + lib
  // eligibility.ts both require Number.isInteger), so the pool is 1503
  // but only 1502 are eligible. That rule is unchanged by this fix.
  const rows = [
    hadithRow({ id: "h-a", hadith_number: 690 }),
    hadithRow({ id: "h-b", hadith_number: 690.2 }),
    hadithRow({ id: "h-c", hadith_number: 691 }),
    ...Array.from({ length: 1500 }, (_, i) =>
      hadithRow({ id: `hx${i + 1}`, hadith_number: 1001 + i }),
    ),
  ];
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: rows,
    duas: [],
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.json.plan.diagnostics.hadithPool, 1503);
  assert.equal(res.json.plan.diagnostics.hadithEligible, 1502);
  assert.equal(res.json.plan.diagnostics.hadithPoolTruncated, false);
  assert.ok(res.json.plan.hadith);
});

await t("edge Phase 2: pool beyond the 50,000-row safety bound fails closed", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: bigHadiths(50000),
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.dry_run, true);
  assert.equal(res.json.plan.diagnostics.hadithPool, 50000);
  assert.equal(res.json.plan.diagnostics.hadithPoolTruncated, true);
  assert.equal(res.json.plan.hadith, null);
  assert.match(res.json.plan.hadithEmptyReason, /50,000-row safety bound/);
  assert.equal(res.json.plan.push, null);
  assert.deepEqual(res.json.plan.cards, []);
});

// ---- Phase 3: opt-out completeness past the 1,000-row PostgREST cap ----
await t("edge Phase 3: an opt-out on the second preferences page is respected on first send", async () => {
  // 1,500 opted-out devices; the token under test is d-1499, whose
  // preference sorts LAST (page 2 of the keyset pagination). Without
  // pagination the fake's 1,000-row PostgREST cap returns only the first
  // 1,000 preferences, d-1499 is missed, and the device is sent to.
  // The token table stays small (6 rows) — the token fetch is not under
  // test here; the opt-out set is.
  const prefs = Array.from({ length: 1500 }, (_, i) => ({
    device_id: `d-${String(i).padStart(4, "0")}`,
    daily_enabled: false,
  }));
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: [],
    tokens: [
      token("t-opt", "d-1499"),
      ...["c-0", "c-1", "c-2", "c-3", "c-4"].map((d, i) => token(`t-clean-${i}`, d)),
    ],
    prefs,
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((c) => c.sub.endpoint.startsWith("https://push.example/t-clean-")));
  assert.equal(svc.tables.daily_content_deliveries.length, 5);
  assert.ok(svc.tables.daily_content_deliveries.every((r) => r.device_id.startsWith("c-")));
});

await t("edge Phase 3: an opt-out on the second preferences page closes a retryable row, never sends", async () => {
  const prefs = Array.from({ length: 1200 }, (_, i) => ({
    device_id: `d-${String(i).padStart(4, "0")}`,
    daily_enabled: false,
  }));
  const svc = makeSvc({
    settings: [{ enabled: true }],
    publications: [
      { id: "pub-p", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } },
    ],
    tokens: [token("t1", "d-1199")],
    deliveries: [
      { id: "r1", publication_id: "pub-p", token_id: "t1", device_id: "d-1199", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
    prefs,
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 0);
  assert.equal(svc.tables.daily_content_deliveries[0].status, "failed");
  assert.equal(svc.tables.daily_content_deliveries[0].error, "device opted out of daily content");
});

// ---- Phase 3: user-facing preference endpoint (no CRON secret) ----
await t("edge Phase 3: opt_out by subscription endpoint writes the preference, no CRON secret needed", async () => {
  const svc = makeSvc({
    settings: [{ enabled: false }],
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  const res = await callEdgeNoAuth({ action: "opt_out", endpoint: "https://push.example/t1" });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.daily_enabled, false);
  assert.equal(res.json.devices, 1);
  assert.equal(svc.tables.daily_content_preferences.length, 1);
  assert.equal(svc.tables.daily_content_preferences[0].device_id, "d1");
  assert.equal(svc.tables.daily_content_preferences[0].daily_enabled, false);
  // Opt-out works while paused and creates no publication or delivery.
  assert.equal(svc.tables.daily_content_publications.length, 0);
  assert.equal(svc.tables.daily_content_deliveries.length, 0);
});

await t("edge Phase 3: opt_in flips the same preference back (upsert, one row)", async () => {
  const svc = makeSvc({
    settings: [{ enabled: false }],
    tokens: [token("t1", "d1")],
    prefs: [{ device_id: "d1", daily_enabled: false }],
  });
  stubs.holder.svc = svc;
  const res = await callEdgeNoAuth({ action: "opt_in", endpoint: "https://push.example/t1" });
  assert.equal(res.status, 200);
  assert.equal(res.json.daily_enabled, true);
  assert.equal(svc.tables.daily_content_preferences.length, 1);
  assert.equal(svc.tables.daily_content_preferences[0].daily_enabled, true);
});

await t("edge Phase 3: preference endpoint rejects unknown endpoint, missing endpoint, bare device_id, http endpoint", async () => {
  const svc = makeSvc({ tokens: [token("t1", "d1")] });
  stubs.holder.svc = svc;
  const unknown = await callEdgeNoAuth({ action: "opt_out", endpoint: "https://push.example/nope" });
  assert.equal(unknown.status, 404);
  const missing = await callEdgeNoAuth({ action: "opt_out" });
  assert.equal(missing.status, 400);
  const bareId = await callEdgeNoAuth({ action: "opt_out", device_id: "d1" });
  assert.equal(bareId.status, 400);
  const http = await callEdgeNoAuth({ action: "opt_out", endpoint: "http://push.example/t1" });
  assert.equal(http.status, 400);
  assert.equal(svc.tables.daily_content_preferences.length, 0);
});

await t("edge Phase 3: duplicate token rows for one device opt out once (devices: 1)", async () => {
  const svc = makeSvc({
    tokens: [token("t1", "d1"), token("t2", "d1")],
  });
  stubs.holder.svc = svc;
  // Production holds 5 duplicate (device_id, platform) groups; both rows
  // carry the same subscription endpoint here, so both resolve to d1.
  svc.tables.device_push_tokens[1].token = svc.tables.device_push_tokens[0].token;
  const res = await callEdgeNoAuth({ action: "opt_out", endpoint: "https://push.example/t1" });
  assert.equal(res.status, 200);
  assert.equal(res.json.devices, 1);
  assert.equal(svc.tables.daily_content_preferences.length, 1);
});

await t("edge Phase 3: automation still requires the CRON secret; preference actions do not", async () => {
  const svc = makeSvc({ settings: [{ enabled: true }], hadiths: [hadithRow()], duas: [] });
  stubs.holder.svc = svc;
  const noAuth = await callEdgeNoAuth({});
  assert.equal(noAuth.status, 401);
  const dryNoAuth = await callEdgeNoAuth({ dry_run: true });
  assert.equal(dryNoAuth.status, 401);
  const retryNoAuth = await callEdgeNoAuth({ retry_only: true });
  assert.equal(retryNoAuth.status, 401);
  // An unknown action is not a preference action, so it falls through to
  // the CRON gate and is 401 without the secret.
  const unknownActionNoAuth = await callEdgeNoAuth({ action: "subscribe", endpoint: "https://push.example/t1" });
  assert.equal(unknownActionNoAuth.status, 401);
});

// ---- Phase 7: token pagination, R-6 stale close, retry ordering, status ----

// Phase 7: the token fetch is keyset-paged. 1,200 tokens cross the 1,000-row
// PostgREST cap the old single `.limit(5000)` query hit: old code sends to
// 1,000 devices, fixed code to all 1,200. Zero-padded ids keep the keyset
// order lexicographic.
await t("edge Phase 7: first send reaches all 1,200 tokens past the 1,000-row cap", async () => {
  const tokens = Array.from({ length: 1200 }, (_, i) =>
    token(`t-${String(i).padStart(4, "0")}`, `d-${String(i).padStart(4, "0")}`));
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens,
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({});
  assert.equal(res.json.ok, true);
  assert.equal(res.json.delivery.total, 1200);
  assert.equal(res.json.delivery.sent, 1200);
  assert.equal(res.json.delivery.tokensTruncated, false);
  assert.equal(calls.length, 1200);
  assert.equal(svc.tables.daily_content_deliveries.length, 1200);
});

// Phase 7 (R-6): a retryable AND a pending delivery for a published
// publication from a past Kolkata date must never send. The tick fails
// them terminally (visible as failed + error) instead of delivering
// yesterday's content late.
await t("edge Phase 7: stale deliveries for a past-date publication fail terminally, zero sends", async () => {
  const pub = { id: "pub-stale", kolkata_date: YESTERDAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t1", "d1"), token("t2", "d2")],
    publications: [pub],
    deliveries: [
      { id: "r1", publication_id: "pub-stale", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
      { id: "p1", publication_id: "pub-stale", token_id: "t2", device_id: "d2", status: "pending", attempts: 0, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.equal(calls.length, 0);
  const rows = svc.tables.daily_content_deliveries;
  assert.equal(rows.find((r) => r.id === "r1").status, "failed");
  assert.equal(rows.find((r) => r.id === "r1").error, "stale: publication date has passed");
  assert.equal(rows.find((r) => r.id === "p1").status, "failed");
  assert.equal(rows.find((r) => r.id === "p1").error, "stale: publication date has passed");
});

// Phase 7: retry backlog is oldest-due first. Seeded in reverse due order
// so the old unordered code would send t3 first; the ordered code sends
// t1 (due 2000-01-01), then t2, then t3.
await t("edge Phase 7: retry tick sends oldest-due retryables first", async () => {
  const pub = { id: "pub-o", kolkata_date: TODAY, status: "published", push: { title: "T", body: "B" } };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    tokens: [token("t1", "d1"), token("t2", "d2"), token("t3", "d3")],
    publications: [pub],
    deliveries: [
      { id: "o3", publication_id: "pub-o", token_id: "t3", device_id: "d3", status: "retryable", attempts: 1, next_attempt_at: "2000-01-03T00:00:00.000Z" },
      { id: "o2", publication_id: "pub-o", token_id: "t2", device_id: "d2", status: "retryable", attempts: 1, next_attempt_at: "2000-01-02T00:00:00.000Z" },
      { id: "o1", publication_id: "pub-o", token_id: "t1", device_id: "d1", status: "retryable", attempts: 1, next_attempt_at: "2000-01-01T00:00:00.000Z" },
    ],
  });
  stubs.holder.svc = svc;
  const calls = setWebpush(ok201);
  const res = await callEdge({ retry_only: true });
  assert.equal(res.json.ok, true);
  assert.deepEqual(calls.map((c) => c.sub.endpoint), [
    "https://push.example/t1",
    "https://push.example/t2",
    "https://push.example/t3",
  ]);
});

// Phase 7: the read-only status action reports this subscription's daily
// preference without the CRON secret, while paused, with no publication
// or delivery created.
await t("edge Phase 7: status returns the server preference without auth, while paused", async () => {
  const svc = makeSvc({
    settings: [{ enabled: false }],
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  const res = await callEdgeNoAuth({ action: "status", endpoint: "https://push.example/t1" });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.action, "status");
  assert.equal(res.json.daily_enabled, true);
  assert.equal(res.json.devices, 1);
  assert.equal(svc.tables.daily_content_publications.length, 0);
  assert.equal(svc.tables.daily_content_deliveries.length, 0);
  assert.equal(svc.tables.daily_content_preferences.length, 0);
});

await t("edge Phase 7: status reflects an opt-out, and rejects unknown/missing endpoints", async () => {
  const svc = makeSvc({
    settings: [{ enabled: false }],
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  const out = await callEdgeNoAuth({ action: "opt_out", endpoint: "https://push.example/t1" });
  assert.equal(out.status, 200);
  const res = await callEdgeNoAuth({ action: "status", endpoint: "https://push.example/t1" });
  assert.equal(res.status, 200);
  assert.equal(res.json.daily_enabled, false);
  const unknown = await callEdgeNoAuth({ action: "status", endpoint: "https://push.example/nope" });
  assert.equal(unknown.status, 404);
  const missing = await callEdgeNoAuth({ action: "status" });
  assert.equal(missing.status, 400);
});

// ---- Phase 9: daily automation consumes approved recommendation runs ----
const approvedRun = (over = {}) => ({
  id: "rec-1",
  kolkata_date: TODAY,
  hijri_key: "1448-05-26",
  context: {
    gregorianKey: TODAY,
    hijri: { year: 1448, month: 5, day: 26 },
    confirmation: "calculated",
    activeEventSlugs: [],
    ramadanStage: null,
  },
  recommendations: [
    { kind: "hadith", ref: "hadith:h-approved", relevance: 0.95, reasonBn: "প্রাসঙ্গিক", sourceLine: "Sahih al-Bukhari, Hadith 534" },
    { kind: "content", ref: "content:s1", relevance: 0.9, reasonBn: "প্রাসঙ্গিক", sourceLine: "REF-s1" },
    { kind: "content", ref: "content:s2", relevance: 0.88, reasonBn: "প্রাসঙ্গিক", sourceLine: "REF-s2" },
    { kind: "content", ref: "content:s3", relevance: 0.85, reasonBn: "প্রাসঙ্গিক", sourceLine: "REF-s3" },
    { kind: "content", ref: "content:s4", relevance: 0.82, reasonBn: "প্রাসঙ্গিক", sourceLine: "REF-s4" },
  ],
  dropped: [],
  status: "approved",
  created_by: "admin-uuid",
  created_at: "2026-11-07T00:00:00Z",
  ...over,
});

await t("edge Phase 9: the ported Islamic context matches the lib over a date sweep", async () => {
  // Any disagreement between the port and the lib is a drift bug: the
  // dates span Ramadan stages, month windows, a leap-year Dhul Hijjah
  // (1447, 30 days) and a non-leap one (1448, 29 days).
  const dates = [
    "2026-11-07", "2026-02-18", "2026-03-04", "2026-03-10", "2026-03-20",
    "2026-05-27", "2026-06-16", "2026-01-15", "2025-06-27", "2024-03-11",
    "2023-03-23", "2026-08-16", "2027-02-07", "2027-06-04", "2027-06-05",
    "2030-12-31",
  ];
  for (const d of dates) {
    const libCtx = cal.getIslamicContextForKey(d);
    const edgeCtx = edgeMod.islamicContextForKolkataDate(d);
    assert.deepEqual(edgeCtx.hijri, libCtx.hijri, `hijri ${d}`);
    assert.equal(edgeCtx.hijriKey, libCtx.hijriKey, `hijriKey ${d}`);
    assert.equal(edgeCtx.confirmation, libCtx.confirmation, `confirmation ${d}`);
    assert.deepEqual(edgeCtx.activeEventSlugs, libCtx.activeEvents.map((e) => e.event.slug), `events ${d}`);
    assert.equal(edgeCtx.ramadanStage, libCtx.ramadanStage, `ramadanStage ${d}`);
  }
});

await t("edge Phase 9: dry-run plans from the approved run when one exists", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [
      hadithRow({ id: "h-approved", hadith_number: 534 }),
      hadithRow({ id: "h-seed", hadith_number: 535 }),
    ],
    duas: ["s1", "s2", "s3", "s4"].map((s) => duaRow(s)),
    recommendations: [approvedRun()],
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.status, 200);
  assert.equal(res.json.plan.source, "approved-recommendation");
  assert.equal(res.json.plan.hadithSource, "approved");
  assert.equal(res.json.plan.cardsSource, "approved");
  assert.equal(res.json.plan.recommendationId, "rec-1");
  assert.equal(res.json.plan.hadith.id, "h-approved");
  assert.equal(res.json.plan.cards[0].recordRef, "hadith:h-approved");
  assert.deepEqual(
    res.json.plan.cards.slice(1).map((c) => c.recordRef),
    ["content:s1", "content:s2", "content:s3", "content:s4"],
  );
  // The plan's context is the lib's context for today.
  const libCtx = cal.getIslamicContextForKey(TODAY);
  assert.equal(res.json.plan.context.hijriKey, libCtx.hijriKey);
  assert.deepEqual(res.json.plan.context.activeEventSlugs, libCtx.activeEvents.map((e) => e.event.slug));
  assert.equal(res.json.plan.context.ramadanStage, libCtx.ramadanStage);
  assert.equal(res.json.plan.diagnostics.approvedRun, true);
  assert.equal(res.json.plan.diagnostics.approvedHadithSkipped, null);
});

await t("edge Phase 9: an ineligible approved hadith falls back to the seeded pick", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [
      // The approved hadith has no Bengali text, so it is not eligible
      // and must never be planned — the seeded pick takes the slot.
      hadithRow({ id: "h-approved", hadith_number: 534, bengali: "" }),
      hadithRow({ id: "h-seed", hadith_number: 535 }),
    ],
    duas: ["s1", "s2", "s3", "s4"].map((s) => duaRow(s)),
    recommendations: [approvedRun()],
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.json.plan.hadith.id, "h-seed");
  assert.equal(res.json.plan.hadithSource, "seeded");
  // The cards still come from the run: the fallback is per slot.
  assert.equal(res.json.plan.cardsSource, "approved");
  assert.equal(res.json.plan.source, "approved-recommendation");
  assert.match(res.json.plan.diagnostics.approvedHadithSkipped, /not in the eligible pool/);
});

await t("edge Phase 9: a short approved card set is filled from the seeded selection", async () => {
  const run = approvedRun({
    recommendations: [
      { kind: "hadith", ref: "hadith:h-approved", relevance: 0.95, reasonBn: "প্রাসঙ্গিক", sourceLine: "Sahih al-Bukhari, Hadith 534" },
      { kind: "content", ref: "content:s1", relevance: 0.9, reasonBn: "প্রাসঙ্গিক", sourceLine: "REF-s1" },
      { kind: "content", ref: "content:s2", relevance: 0.88, reasonBn: "প্রাসঙ্গিক", sourceLine: "REF-s2" },
    ],
  });
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [
      hadithRow({ id: "h-approved", hadith_number: 534 }),
      hadithRow({ id: "h-seed", hadith_number: 535 }),
    ],
    duas: ["s1", "s2", "s3", "s4", "s5"].map((s) => duaRow(s)),
    recommendations: [run],
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.json.plan.hadith.id, "h-approved");
  assert.equal(res.json.plan.cardsSource, "approved+seeded");
  const contentRefs = res.json.plan.cards.slice(1).map((c) => c.recordRef);
  assert.deepEqual(contentRefs.slice(0, 2), ["content:s1", "content:s2"]);
  assert.equal(contentRefs.length, 4);
  assert.equal(new Set(contentRefs).size, 4);
});

await t("edge Phase 9: an approved hadith already used this cycle is skipped", async () => {
  const pub = {
    id: "pub-old",
    kolkata_date: YESTERDAY,
    status: "published",
    hadith_ref: "hadith:h-approved",
    cards: [],
    hadith_cycle: 1,
    card_cycle: 1,
  };
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [
      hadithRow({ id: "h-approved", hadith_number: 534 }),
      hadithRow({ id: "h-seed", hadith_number: 535 }),
    ],
    duas: ["s1", "s2", "s3", "s4"].map((s) => duaRow(s)),
    publications: [pub],
    recommendations: [approvedRun()],
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.json.plan.hadith.id, "h-seed");
  assert.equal(res.json.plan.hadithSource, "seeded");
  assert.match(res.json.plan.diagnostics.approvedHadithSkipped, /already used this cycle/);
});

await t("edge Phase 9: a live daily run publishes the approved hadith and records the run", async () => {
  const calls = setWebpush(ok201);
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [
      hadithRow({ id: "h-approved", hadith_number: 534 }),
      hadithRow({ id: "h-seed", hadith_number: 535 }),
    ],
    duas: ["s1", "s2", "s3", "s4"].map((s) => duaRow(s)),
    recommendations: [approvedRun()],
    tokens: [token("t1", "d1")],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({});
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  const pub = svc.tables.daily_content_publications[0];
  assert.equal(pub.status, "published");
  assert.equal(pub.hadith_ref, "hadith:h-approved");
  assert.equal(pub.recommendation_id, "rec-1");
  assert.equal(calls.length, 1);
});

await t("edge Phase 9: with no approved run the plan stays seeded and carries the context", async () => {
  const svc = makeSvc({
    settings: [{ enabled: true }],
    hadiths: [hadithRow()],
    duas: ["s1"].map((s) => duaRow(s)),
    tokens: [],
  });
  stubs.holder.svc = svc;
  const res = await callEdge({ dry_run: true });
  assert.equal(res.json.plan.source, "seeded");
  assert.equal(res.json.plan.hadithSource, "seeded");
  assert.equal(res.json.plan.cardsSource, "seeded");
  assert.equal(res.json.plan.recommendationId, null);
  assert.equal(res.json.plan.diagnostics.approvedRun, false);
  assert.equal(res.json.plan.diagnostics.approvedHadithSkipped, null);
  const libCtx = cal.getIslamicContextForKey(TODAY);
  assert.equal(res.json.plan.context.hijriKey, libCtx.hijriKey);
});

console.log(`edge tests: ${n} passed`);
