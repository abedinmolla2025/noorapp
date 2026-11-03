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
globalThis.Deno = {
  env: {
    get: (k) =>
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
await import(pathToFileURL(path.join(outDir, "edge-under-test.mjs")).href);
if (!capturedHandler) throw new Error("edge handler was not captured");

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
  };
  let seq = 1000;
  const flags = { hidePlannedOnce: false, throwOnDeliveryInsertAt: null };
  const matches = (rows, filters) => rows.filter((r) => filters.every((f) => f(r)));

  class Q {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.descs = [];
      this.orders = [];
      this.lim = null;
      this.insertRow = null;
      this.patch = null;
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
    lt(c, v) {
      this.filters.push((r) => r[c] < v);
      return this;
    }
    lte(c, v) {
      this.filters.push((r) => r[c] <= v);
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
        flags.hidePlannedOnce &&
        this.table === "daily_content_publications" &&
        this.descs.some((d) => d.c === "status" && d.v === "planned")
      ) {
        // Race simulation: the planned row exists but this read misses it.
        flags.hidePlannedOnce = false;
        return [];
      }
      for (const [c, asc] of this.orders) {
        rs = [...rs].sort((a, b) =>
          a[c] < b[c] ? (asc ? -1 : 1) : a[c] > b[c] ? (asc ? 1 : -1) : 0,
        );
      }
      return this.lim == null ? rs : rs.slice(0, this.lim);
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
      const rs = this.rows();
      for (const r of rs) Object.assign(r, this.patch);
      return { data: rs, error: null };
    }
    then(res, rej) {
      try {
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
  svc.flags.hidePlannedOnce = true; // first planned-read misses the row
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

console.log(`edge tests: ${n} passed`);
