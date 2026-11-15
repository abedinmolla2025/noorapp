// Handler-level tests for supabase/functions/recommend-daily-content/index.ts.
// Phase 3 (2026-11-13): rewritten from the frontend-branch harness
// (/tmp/ai-recommend.test.mjs) for the Adapter — the handler now calls
// generateToolCall() (Gemini free primary / Groq free secondary) instead
// of the pre-migration gateway. The stub returns Gemini-shaped tool-call
// responses, the env carries GEMINI_API_KEY / GROQ_API_KEY, the key-unset
// test expects "GEMINI_API_KEY is not configured", the 429 test uses a
// Gemini 429, the 402 test expects PAYMENT_REQUIRED, and "no tool call"
// is a Gemini text-only response.
//
// NOTE: recommend-daily-content is MIGRATED but NOT deployed in Phase 3.
// Deployment waits for migration 070002 (daily_content_recommendations
// does not exist in production) + HARD GATE 0 — separate approvals.
//
// No Deno, no network, no real Supabase. Node 24 (type-strips .ts on import).
//
// Run from the worktree root:
//   node supabase/functions/recommend-daily-content/recommend-daily-content.test.mjs
//
// The harness stages copies of the real function + the real _shared files
// into os.tmpdir(), rewrites ONLY the esm.sh import to a local fake module,
// and drives the captured Deno.serve handler. The fake Supabase client reads
// its tables from globalThis.__FAKE_TABLES__ (set per test) and the Gemini
// stub reads its scripted responses from globalThis.__GATEWAY__.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p3-recommend-test-"));

// ---- Deno shim (must exist before the staged modules are imported) ----
let capturedHandler = null;
globalThis.Deno = {
  env: {
    get: (name) => process.env[name] ?? undefined,
  },
  serve: (handler) => {
    capturedHandler = handler;
  },
};

// The staged modules read these at import time (module scope). The values
// are test-only; the fake client ignores them.
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

// ---- Fake supabase-js module ----
const fakeSupabase = `
export function createClient(url, key) {
  const isAnon = key === "anon-key";
  return {
    auth: {
      getClaims: async (jwt) => {
        if (jwt === "valid-admin-jwt") return { data: { claims: { sub: "admin-uuid" } }, error: null };
        if (jwt === "valid-user-jwt") return { data: { claims: { sub: "user-uuid" } }, error: null };
        return { data: null, error: new Error("invalid jwt") };
      },
    },
    rpc: async (fn, args) => {
      if (fn === "is_admin") return { data: args?._user_id === "admin-uuid", error: null };
      return { data: null, error: new Error("unknown rpc " + fn) };
    },
    from: (table) => {
      const live = globalThis.__FAKE_TABLES__?.[table] ?? [];
      let filtered = live.slice();
      let mode = "select";
      let pendingRow = null;
      let pendingPatch = null;
      const q = {
        select: (_cols) => q,
        eq: (col, val) => { filtered = filtered.filter((r) => r[col] === val); return q; },
        in: (col, vals) => { filtered = filtered.filter((r) => vals.includes(r[col])); return q; },
        order: (col, { ascending }) => {
          filtered = filtered.slice().sort((a, b) => {
            if (a[col] < b[col]) return ascending ? -1 : 1;
            if (a[col] > b[col]) return ascending ? 1 : -1;
            return 0;
          });
          return q;
        },
        limit: (n) => { filtered = filtered.slice(0, n); return q; },
        insert: (row) => { mode = "insert"; pendingRow = row; return q; },
        update: (patch) => { mode = "update"; pendingPatch = patch; return q; },
        then: (resolve, reject) => {
          if (mode === "insert") {
            const row = { ...pendingRow };
            if (!row.id) {
              globalThis.__FAKE_ID_SEQ__ = (globalThis.__FAKE_ID_SEQ__ ?? 0) + 1;
              row.id = \`rec-\${globalThis.__FAKE_ID_SEQ__}\`;
            }
            if (!row.created_at) row.created_at = "2026-11-07T00:00:00Z";
            live.push(row);
            return Promise.resolve({ data: [row], error: null }).then(resolve, reject);
          }
          if (mode === "update") {
            const updated = [];
            for (const r of live) {
              if (filtered.includes(r)) {
                Object.assign(r, pendingPatch);
                updated.push(r);
              }
            }
            return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
`;
fs.writeFileSync(path.join(tmp, "fake-supabase.mjs"), fakeSupabase);

// ---- Stage the real files ----
const sharedDir = path.join(tmp, "_shared");
const fnDir = path.join(tmp, "recommend-daily-content");
fs.mkdirSync(sharedDir, { recursive: true });
fs.mkdirSync(fnDir, { recursive: true });
const rewriteEsm = (src) =>
  src.replace(
    /from "https:\/\/esm\.sh\/@supabase\/supabase-js@[^"]+"/,
    'from "../fake-supabase.mjs"',
  );
for (const [src, dest] of [
  [path.join(root, "supabase", "functions", "_shared", "require-admin.ts"), path.join(sharedDir, "require-admin.ts")],
  [path.join(root, "supabase", "functions", "recommend-daily-content", "index.ts"), path.join(fnDir, "index.ts")],
]) {
  fs.writeFileSync(dest, rewriteEsm(fs.readFileSync(src, "utf8")));
}
// Phase 3: the handler imports the Adapter; stage its real files too.
for (const f of ["ai-config.ts", "ai-adapter.ts", "ai-gemini-client.ts", "ai-groq-client.ts", "bengali-editorial.ts"]) {
  fs.writeFileSync(path.join(sharedDir, f), fs.readFileSync(path.join(root, "supabase", "functions", "_shared", f), "utf8"));
}

// ---- Gemini fetch stub (the Adapter's primary) ----
// Scripted responses are { status, body } where body is a JSON object or a
// string. The Adapter reads resp.text() and resp.headers.get("retry-after"),
// so the stub provides both. It asserts the Gemini endpoint and refuses
// any other URL — a test that reached a real host fails loudly (G19).
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
globalThis.__GATEWAY__ = { responses: [], calls: 0 };
globalThis.fetch = async (url, _opts) => {
  if (url !== GEMINI_URL) throw new Error(`stub refused non-Gemini URL: ${url}`);
  globalThis.__GATEWAY__.calls++;
  const next = globalThis.__GATEWAY__.responses.shift();
  if (!next) throw new Error("Gemini stub: no scripted response left");
  const bodyText = typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {});
  return {
    status: next.status ?? 200,
    ok: (next.status ?? 200) >= 200 && (next.status ?? 200) < 300,
    headers: { get: () => null },
    text: async () => bodyText,
    json: async () => next.body,
  };
};

await import(path.join(fnDir, "index.ts"));
if (!capturedHandler) throw new Error("handler was not captured");

// ---- Test helpers ----
const ADMIN_JWT = "valid-admin-jwt";
const USER_JWT = "valid-user-jwt";

const CONTEXT = {
  gregorianKey: "2026-11-07",
  hijri: { year: 1448, month: 5, day: 26 },
  confirmation: "calculated",
  activeEventSlugs: [],
  ramadanStage: null,
};

const DEFAULT_HADITHS = [
  { id: "bukhari-9-534", book_key: "bukhari", chapter_id: 9, hadith_number: 534, arabic: "AR-534", bengali: "BN-534" },
  { id: "bukhari-9-535", book_key: "bukhari", chapter_id: 9, hadith_number: 535, arabic: "AR-535", bengali: "BN-535" },
  { id: "bukhari-1-1", book_key: "bukhari", chapter_id: 1, hadith_number: 1, arabic: "", bengali: "BN-1" },
];
const DEFAULT_DUAS = [
  { id: "d1", slug: "dua-when-it-rains", title: "বৃষ্টির সময়ের দোয়া", source_type: "Hadith", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: { reference: "বুখারী ১০৩২" } },
  { id: "d2", slug: "dua-for-children", title: "সন্তানের জন্য দোয়া", source_type: "Quran", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: { reference: "সূরা ফুরকান ২৫:৭৪" } },
  { id: "d3", slug: "surah-al-ikhlas", title: "সূরা ইখলাস", source_type: "Quran", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: { reference: "সূরা ইখলাস ১১২:১-৪" } },
  { id: "d4", slug: "dua-no-ref", title: "রেফারেন্সহীন দোয়া", source_type: "Hadith", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: {} },
];

function defaultTables() {
  return {
    hadiths: structuredClone(DEFAULT_HADITHS),
    admin_content: structuredClone(DEFAULT_DUAS),
    daily_content_publications: [],
    daily_content_recommendations: [],
  };
}

// Gemini-shaped tool-call response (generateContent envelope).
function aiResponse(recs) {
  return {
    status: 200,
    body: {
      candidates: [{
        content: { parts: [{ functionCall: { name: "recommend_daily_content", args: { recommendations: recs } } }] },
        finishReason: "STOP",
      }],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 600, totalTokenCount: 1800 },
    },
  };
}

function geminiError(status, message) {
  return {
    status,
    body: {
      error: {
        code: status,
        message,
        status: status === 429 ? "RESOURCE_EXHAUSTED" : "PERMISSION_DENIED",
        details: [],
      },
    },
  };
}

const GOOD_RECS = [
  { kind: "hadith", ref: "hadith:bukhari-9-534", relevance: 0.95, reasonBn: "রমজানের রোজা সম্পর্কিত হাদিস, আজকের প্রসঙ্গে উপযোগী।" },
  { kind: "content", ref: "content:dua-when-it-rains", relevance: 0.9, reasonBn: "বৃষ্টির সময়ের দোয়া, আজকের আবহাওয়ার প্রসঙ্গে উপযোগী।" },
];

async function callEdge(body, jwt = ADMIN_JWT) {
  const headers = { "Content-Type": "application/json" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await capturedHandler(
    new Request("http://localhost/functions/v1/recommend-daily-content", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed, text };
}

function recommendBody(overrides = {}) {
  return {
    action: "recommend",
    kolkataDate: "2026-11-07",
    context: structuredClone(CONTEXT),
    hadithIds: ["bukhari-9-534", "bukhari-9-535"],
    ...overrides,
  };
}

// ---- Test runner (sequential, like the repo's other harnesses) ----
let passed = 0;
let failed = 0;
const failures = [];
let chain = Promise.resolve();
function t(name, fn) {
  chain = chain.then(async () => {
    try {
      await fn();
      passed++;
      console.log(`  ok ${name}`);
    } catch (e) {
      failed++;
      failures.push(name);
      console.log(`  FAIL ${name}: ${e.message}`);
    }
  });
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function setup({ tables, gateway, key = "test-key" } = {}) {
  globalThis.__FAKE_TABLES__ = tables ?? defaultTables();
  globalThis.__FAKE_ID_SEQ__ = 0;
  globalThis.__GATEWAY__ = { responses: gateway ?? [aiResponse(GOOD_RECS)], calls: 0 };
  if (key === null) {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = key;
    process.env.GROQ_API_KEY = key;
  }
}

// 1-4: auth + preflight
t("no auth -> 401", async () => {
  setup();
  const r = await callEdge(recommendBody(), null);
  eq(r.status, 401, "status");
});
t("garbage JWT -> 401", async () => {
  setup();
  const r = await callEdge(recommendBody(), "garbage-jwt");
  eq(r.status, 401, "status");
});
t("non-admin -> 403", async () => {
  setup();
  const r = await callEdge(recommendBody(), USER_JWT);
  eq(r.status, 403, "status");
});
t("OPTIONS -> 200 unauthenticated", async () => {
  setup();
  const res = await capturedHandler(new Request("http://localhost/", { method: "OPTIONS" }));
  eq(res.status, 200, "status");
});

// 5: happy path
t("admin recommend: valid AI response -> 2 kept, 0 dropped", async () => {
  setup();
  const r = await callEdge(recommendBody());
  eq(r.status, 200, "status");
  eq(r.body.ok, true, "ok");
  eq(r.body.recommendations.length, 2, "recommendations");
  eq(r.body.dropped.length, 0, "dropped");
  eq(r.body.candidates.hadith, 2, "hadith candidates");
  eq(r.body.candidates.dua, 3, "dua candidates (no-ref excluded)");
  eq(r.body.persisted, false, "persisted");
  eq(r.body.recommendations[0].sourceLine.includes("Sahih al-Bukhari, Hadith 534"), true, "hadith sourceLine");
});

// 6-9: validation drops
t("invented ref -> dropped, valid kept", async () => {
  setup({
    gateway: [
      aiResponse([
        { kind: "content", ref: "content:dua-does-not-exist", relevance: 0.99, reasonBn: "কাল্পনিক দোয়া।" },
        GOOD_RECS[1],
      ]),
    ],
  });
  const r = await callEdge(recommendBody());
  eq(r.status, 200, "status");
  eq(r.body.recommendations.length, 1, "kept");
  eq(r.body.recommendations[0].ref, "content:dua-when-it-rains", "kept ref");
  eq(r.body.dropped.length, 1, "dropped");
  eq(r.body.dropped[0].reason, "not an eligible candidate for this date", "drop reason");
});
t("bare slug (no content:/hadith: prefix) -> dropped, exact ref kept (run #7-#10 regression)", async () => {
  // Runs #7-#10: the AI returned bare slugs ("ayatul-kursi",
  // "dua-for-guidance") and human-readable refs ("সূরা বাক্বারাহ
  // ২:২৫৫", "বুখারী ৬৩১২") instead of the exact ref strings
  // (content:<slug> / hadith:<id>), so validation dropped all of
  // them and no recommendation persisted. The fix instructs the AI
  // to copy the ref EXACTLY. The server-side validation is UNCHANGED
  // — this test proves it still rejects a bare slug.
  setup({
    gateway: [
      aiResponse([
        { kind: "content", ref: "dua-when-it-rains", relevance: 0.99, reasonBn: "বৃষ্টির সময়ের দোয়া।" },
        { kind: "content", ref: "content:dua-for-children", relevance: 0.9, reasonBn: "সন্তানের জন্য দোয়া।" },
      ]),
    ],
  });
  const r = await callEdge(recommendBody());
  eq(r.status, 200, "status");
  eq(r.body.recommendations.length, 1, "kept");
  eq(r.body.recommendations[0].ref, "content:dua-for-children", "kept ref");
  eq(r.body.dropped.length, 1, "dropped");
  eq(r.body.dropped[0].ref, "dua-when-it-rains", "dropped ref");
  eq(r.body.dropped[0].reason, "not an eligible candidate for this date", "drop reason");
});
t("prompt constrains the AI to exact refs from the candidate list (run #7-#10 regression)", async () => {
  // The fix for runs #7-#10 is prompt-side: the AI must copy the ref
  // EXACTLY as listed, including the 'content:' / 'hadith:' prefix.
  // This test pins that instruction in the SYSTEM_PROMPT, the tool
  // schema, and the TASK section. The validation loop is unchanged.
  const src = fs.readFileSync(path.join(root, "supabase", "functions", "recommend-daily-content", "index.ts"), "utf8");
  if (!src.includes("Copy the ref EXACTLY as listed")) throw new Error("SYSTEM_PROMPT must require the exact ref");
  if (!src.includes("content:dua-when-it-rains, hadith:bukhari-9-534")) throw new Error("prompt must show the exact ref format");
  if (!src.includes("copied verbatim including the 'content:' or 'hadith:' prefix")) throw new Error("tool ref description must require the exact ref");
  if (!src.includes("Do not shorten, translate, or reformat it")) throw new Error("TASK must reinforce the exact ref");
});
t("duplicate ref -> deduped", async () => {
  setup({
    gateway: [
      aiResponse([GOOD_RECS[1], { ...GOOD_RECS[1], relevance: 0.5 }]),
    ],
  });
  const r = await callEdge(recommendBody());
  eq(r.body.recommendations.length, 1, "kept");
  eq(r.body.dropped.length, 1, "dropped");
  eq(r.body.dropped[0].reason, "duplicate recommendation", "drop reason");
});
t("two hadiths -> only the top one kept", async () => {
  setup({
    gateway: [
      aiResponse([
        { kind: "hadith", ref: "hadith:bukhari-9-534", relevance: 0.95, reasonBn: "প্রথম হাদিস।" },
        { kind: "hadith", ref: "hadith:bukhari-9-535", relevance: 0.8, reasonBn: "দ্বিতীয় হাদিস।" },
      ]),
    ],
  });
  const r = await callEdge(recommendBody());
  eq(r.body.recommendations.length, 1, "kept");
  eq(r.body.recommendations[0].ref, "hadith:bukhari-9-534", "kept ref");
  eq(r.body.dropped[0].reason, "only one hadith per daily plan", "drop reason");
});
t("virtue claim in reason -> dropped", async () => {
  setup({
    gateway: [
      aiResponse([
        { kind: "content", ref: "content:dua-when-it-rains", relevance: 0.9, reasonBn: "এই দোয়ার অনেক ফজিলত আছে।" },
      ]),
    ],
  });
  const r = await callEdge(recommendBody());
  eq(r.body.recommendations.length, 0, "kept");
  eq(r.body.dropped.length, 1, "dropped");
  eq(r.body.dropped[0].reason.includes("forbidden claim"), true, "drop reason");
});

// 10-13: AI / key failures (Phase 3: Adapter error codes)
t("malformed AI output (recommendations not an array) -> 500 AI_INVALID_JSON", async () => {
  setup({
    gateway: [
      {
        status: 200,
        body: {
          candidates: [{
            content: { parts: [{ functionCall: { name: "recommend_daily_content", args: { recommendations: "not-an-array" } } }] },
            finishReason: "STOP",
          }],
        },
      },
    ],
  });
  const r = await callEdge(recommendBody());
  eq(r.status, 500, "status");
  eq(r.body.error.includes("AI_INVALID_JSON"), true, "error");
});
t("unparseable tool-call args -> 500 SCHEMA_ERROR", async () => {
  setup({
    gateway: [
      {
        status: 200,
        body: {
          candidates: [{
            content: { parts: [{ functionCall: { name: "recommend_daily_content", args: "not json{" } }] },
            finishReason: "STOP",
          }],
        },
      },
    ],
  });
  const r = await callEdge(recommendBody());
  eq(r.status, 500, "status");
  eq(r.body.error.includes("SCHEMA_ERROR"), true, "error");
});
t("no tool call -> 500 SCHEMA_ERROR (no tool call returned)", async () => {
  setup({
    gateway: [{
      status: 200,
      body: { candidates: [{ content: { parts: [{ text: "free text, no call" }] }, finishReason: "STOP" }] },
    }],
  });
  const r = await callEdge(recommendBody());
  eq(r.status, 500, "status");
  eq(r.body.error.includes("SCHEMA_ERROR"), true, "error");
  eq(r.body.error.includes("no tool call"), true, "error names the missing call");
});
t("key unset -> 500 GEMINI_API_KEY is not configured", async () => {
  setup({ key: null });
  const r = await callEdge(recommendBody());
  eq(r.status, 500, "status");
  eq(r.body.error.includes("GEMINI_API_KEY is not configured"), true, "error");
  eq(globalThis.__GATEWAY__.calls, 0, "gateway never called");
});

// 14: empty pool — gateway never called
t("no eligible candidates -> 200, empty, gateway not called", async () => {
  setup({
    tables: { hadiths: [], admin_content: [], daily_content_publications: [] },
    gateway: [],
  });
  const r = await callEdge(recommendBody({ hadithIds: [] }));
  eq(r.status, 200, "status");
  eq(r.body.recommendations.length, 0, "recommendations");
  eq(r.body.warnings.some((w) => w.includes("No eligible candidates")), true, "warning");
  eq(globalThis.__GATEWAY__.calls, 0, "gateway calls");
});

// 15: recent history drops; old history does not
t("recent publication drops the ref; 31-day-old publication does not", async () => {
  const tables = defaultTables();
  tables.daily_content_publications = [
    { hadith_ref: "hadith:bukhari-9-534", cards: [], kolkata_date: "2026-11-07", status: "published" },
    { hadith_ref: null, cards: [{ recordRef: "content:dua-when-it-rains" }], kolkata_date: "2026-10-07", status: "published" },
  ];
  setup({ tables });
  const r = await callEdge(recommendBody());
  eq(r.body.recommendations.length, 1, "kept");
  eq(r.body.recommendations[0].ref, "content:dua-when-it-rains", "old publication kept");
  eq(r.body.dropped.length, 1, "dropped");
  eq(r.body.dropped[0].ref, "hadith:bukhari-9-534", "dropped ref");
  eq(r.body.dropped[0].reason.includes("last 30 days"), true, "drop reason");
});

// 16: ineligible hadith id is never a candidate
t("ineligible hadith id (empty Arabic) -> not a candidate", async () => {
  setup();
  const r = await callEdge(recommendBody({ hadithIds: ["bukhari-1-1"] }));
  eq(r.body.candidates.hadith, 0, "hadith candidates");
  // The dua pool is still ranked: the AI's dua recommendation is kept.
  eq(r.body.recommendations.length, 1, "recommendations");
  eq(r.body.recommendations[0].ref, "content:dua-when-it-rains", "kept ref");
  eq(globalThis.__GATEWAY__.calls, 1, "gateway still called for the dua pool");
});

// 17-18: Gemini 429 retry + 402
t("Gemini 429 then 200 -> retried, 200 with recommendations", async () => {
  setup({ gateway: [geminiError(429, "rate limited"), aiResponse(GOOD_RECS)] });
  const r = await callEdge(recommendBody());
  eq(r.status, 200, "status");
  eq(r.body.recommendations.length, 2, "recommendations");
  eq(globalThis.__GATEWAY__.calls, 2, "gateway calls");
});
t("Gemini 402 -> 500 PAYMENT_REQUIRED", async () => {
  setup({ gateway: [geminiError(402, "payment required")] });
  const r = await callEdge(recommendBody());
  eq(r.status, 500, "status");
  eq(r.body.error.includes("PAYMENT_REQUIRED"), true, "error");
});

// 19: context validation
t("bad context (month 13, unknown slug) -> 400, gateway not called", async () => {
  setup();
  const badMonth = recommendBody();
  badMonth.context.hijri.month = 13;
  const r1 = await callEdge(badMonth);
  eq(r1.status, 400, "month status");
  const badSlug = recommendBody();
  badSlug.context.activeEventSlugs = ["not-a-real-event"];
  const r2 = await callEdge(badSlug);
  eq(r2.status, 400, "slug status");
  eq(globalThis.__GATEWAY__.calls, 0, "gateway calls");
});

// 20: unknown action
t("unknown action -> 400", async () => {
  setup();
  const r = await callEdge({ action: "publish", context: structuredClone(CONTEXT) });
  eq(r.status, 400, "status");
});

// 21-24: chapter prefilter (Phase 6)
const CHAPTER30_HADITHS = [1001, 1002, 1003, 1004, 1005].map((n) => ({
  id: `bukhari-30-${n}`,
  book_key: "bukhari",
  chapter_id: 30,
  hadith_number: n,
  arabic: `AR-${n}`,
  bengali: `BN-${n}`,
}));

t("chapterIds [30] with 5 eligible -> 3 candidates (per-chapter cap)", async () => {
  const tables = defaultTables();
  tables.hadiths = structuredClone(CHAPTER30_HADITHS);
  setup({ tables });
  const r = await callEdge(recommendBody({ hadithIds: [], chapterIds: [30] }));
  eq(r.status, 200, "status");
  eq(r.body.candidates.hadith, 3, "hadith candidates");
  eq(r.body.candidates.chapterPrefiltered, 3, "chapterPrefiltered");
});

t("chapterIds [30, 32] -> candidates from both chapters", async () => {
  const tables = defaultTables();
  tables.hadiths = [
    { id: "bukhari-30-1001", book_key: "bukhari", chapter_id: 30, hadith_number: 1001, arabic: "AR", bengali: "BN" },
    { id: "bukhari-32-2001", book_key: "bukhari", chapter_id: 32, hadith_number: 2001, arabic: "AR", bengali: "BN" },
  ];
  setup({ tables });
  const r = await callEdge(recommendBody({ hadithIds: [], chapterIds: [30, 32] }));
  eq(r.body.candidates.hadith, 2, "hadith candidates");
  eq(r.body.candidates.chapterPrefiltered, 2, "chapterPrefiltered");
});

t("chapterIds + hadithIds overlap -> deduped, ids take precedence", async () => {
  setup();
  const r = await callEdge(recommendBody({ hadithIds: ["bukhari-9-534"], chapterIds: [9] }));
  eq(r.body.candidates.hadith, 2, "hadith candidates (534 via ids, 535 via chapter)");
  eq(r.body.candidates.chapterPrefiltered, 1, "chapterPrefiltered (535 only)");
});

t("chapterIds with no eligible hadiths -> 0 hadith candidates, gateway still called for duas", async () => {
  const tables = defaultTables();
  tables.hadiths = [];
  setup({ tables });
  const r = await callEdge(recommendBody({ hadithIds: [], chapterIds: [50] }));
  eq(r.body.candidates.hadith, 0, "hadith candidates");
  eq(r.body.candidates.chapterPrefiltered, 0, "chapterPrefiltered");
  eq(globalThis.__GATEWAY__.calls, 1, "gateway calls");
});

t("invalid chapterIds -> 400, gateway not called", async () => {
  setup();
  for (const bad of [[0], [98], ["30"], [30.5], [null]]) {
    const r = await callEdge(recommendBody({ hadithIds: [], chapterIds: bad }));
    eq(r.status, 400, `chapterIds ${JSON.stringify(bad)} status`);
  }
  eq(globalThis.__GATEWAY__.calls, 0, "gateway calls");
});

// 25: eligibility equivalence — lib vs function over the same fixture rows.
// The lib rule (src/lib/dailyContent/eligibility.ts) and the function's rule
// must give identical verdicts; this test pins that. The lib import is a
// plain .ts import (Node 24 type-strips; eligibility.ts imports only types).
import { isEligibleHadith, isEligibleContent } from "../../../src/lib/dailyContent/eligibility.ts";

const HADITH_FIXTURE = [
  { id: "h-valid", book_key: "bukhari", chapter_id: 9, hadith_number: 534, arabic: "AR", bengali: "BN", expect: true },
  { id: "h-zero", book_key: "bukhari", chapter_id: 9, hadith_number: 0, arabic: "AR", bengali: "BN", expect: false },
  { id: "h-neg", book_key: "bukhari", chapter_id: 9, hadith_number: -5, arabic: "AR", bengali: "BN", expect: false },
  { id: "h-dec", book_key: "bukhari", chapter_id: 9, hadith_number: 534.5, arabic: "AR", bengali: "BN", expect: false },
  { id: "h-no-ar", book_key: "bukhari", chapter_id: 9, hadith_number: 534, arabic: "", bengali: "BN", expect: false },
  { id: "h-no-bn", book_key: "bukhari", chapter_id: 9, hadith_number: 534, arabic: "AR", bengali: "   ", expect: false },
  { id: "h-no-book", book_key: "", chapter_id: 9, hadith_number: 534, arabic: "AR", bengali: "BN", expect: false },
];
const DUA_FIXTURE = [
  { id: "du-valid", slug: "dua-ok", title: "T", source_type: "Hadith", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: { reference: "বুখারী ১০৩২" }, expect: true },
  { id: "du-no-ref", slug: "dua-no-ref", title: "T", source_type: "Hadith", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: {}, expect: false },
  { id: "du-no-slug", slug: "", title: "T", source_type: "Hadith", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: { reference: "X" }, expect: false },
  { id: "du-no-ar", slug: "dua-no-ar", title: "T", source_type: "Hadith", content: "BN", content_arabic: "", status: "published", content_type: "dua", metadata: { reference: "X" }, expect: false },
  { id: "du-no-bn", slug: "dua-no-bn", title: "T", source_type: "Hadith", content: "", content_arabic: "AR", status: "published", content_type: "dua", metadata: { reference: "X" }, expect: false },
  { id: "du-source-ref", slug: "dua-src", title: "T", source_type: "Quran", content: "BN", content_arabic: "AR", status: "published", content_type: "dua", metadata: { source: "সূরা ফুরকান ২৫:৭৪" }, expect: true },
];

t("eligibility equivalence: lib verdict == function verdict on every fixture row", async () => {
  for (const row of HADITH_FIXTURE) {
    const { expect, ...hadith } = row;
    const libVerdict = isEligibleHadith(hadith);
    if (libVerdict !== expect) throw new Error(`lib: ${hadith.id} expected ${expect}, got ${libVerdict}`);
    const tables = { hadiths: [structuredClone(hadith)], admin_content: [], daily_content_publications: [] };
    setup({ tables });
    const r = await callEdge(recommendBody({ hadithIds: [hadith.id], chapterIds: [] }));
    eq(r.body.candidates.hadith, expect ? 1 : 0, `function: ${hadith.id} candidates`);
  }
  for (const row of DUA_FIXTURE) {
    const { expect, ...dua } = row;
    const meta = dua.metadata;
    const reference = typeof meta.reference === "string" && meta.reference
      ? meta.reference
      : typeof meta.source === "string" && meta.source
        ? meta.source
        : null;
    const libVerdict = isEligibleContent({
      slug: dua.slug,
      arabic: dua.content_arabic,
      translation_bn: dua.content,
      reference,
    });
    if (libVerdict !== expect) throw new Error(`lib: ${dua.slug || dua.id} expected ${expect}, got ${libVerdict}`);
    const tables = { hadiths: [], admin_content: [structuredClone(dua)], daily_content_publications: [] };
    setup({ tables });
    const r = await callEdge(recommendBody({ hadithIds: [], chapterIds: [] }));
    eq(r.body.candidates.dua, expect ? 1 : 0, `function: ${dua.slug || dua.id} candidates`);
  }
});

// 26-35: review workflow (Phase 7) — save, list, get, approve, reject.
async function saveOneRun() {
  setup();
  const r = await callEdge(recommendBody({ save: true }));
  eq(r.status, 200, "save status");
  eq(r.body.persisted, true, "persisted");
  if (!r.body.recommendationId) throw new Error("recommendationId missing");
  return r.body.recommendationId;
}

t("recommend with save:true persists exactly the validated output", async () => {
  const id = await saveOneRun();
  eq(id, "rec-1", "generated id");
  const rows = globalThis.__FAKE_TABLES__.daily_content_recommendations;
  eq(rows.length, 1, "one row saved");
  eq(rows[0].status, "pending_review", "status");
  eq(rows[0].created_by, "admin-uuid", "created_by");
  eq(rows[0].kolkata_date, "2026-11-07", "kolkata_date");
  eq(rows[0].recommendations.length, 2, "saved recommendations");
  eq(rows[0].dropped.length, 0, "saved dropped");
});

t("recommend without save stays stateless (no insert)", async () => {
  setup();
  const r = await callEdge(recommendBody());
  eq(r.body.persisted, false, "persisted");
  eq(r.body.recommendationId, null, "recommendationId");
  eq(globalThis.__FAKE_TABLES__.daily_content_recommendations.length, 0, "no rows saved");
});

t("list_pending returns the saved run", async () => {
  const id = await saveOneRun();
  const r = await callEdge({ action: "list_pending" });
  eq(r.status, 200, "status");
  eq(r.body.items.length, 1, "items");
  eq(r.body.items[0].id, id, "item id");
  eq(r.body.items[0].status, "pending_review", "item status");
});

t("get returns one run; unknown id -> 404; missing id -> 400", async () => {
  const id = await saveOneRun();
  const r = await callEdge({ action: "get", id });
  eq(r.status, 200, "status");
  eq(r.body.item.id, id, "item id");
  const missing = await callEdge({ action: "get", id: "rec-999" });
  eq(missing.status, 404, "unknown id status");
  const noId = await callEdge({ action: "get" });
  eq(noId.status, 400, "missing id status");
});

t("approve stages the plan (status approved, reviewed_by/at set)", async () => {
  const id = await saveOneRun();
  const r = await callEdge({ action: "approve", id });
  eq(r.status, 200, "status");
  eq(r.body.item.status, "approved", "status");
  eq(r.body.item.reviewed_by, "admin-uuid", "reviewed_by");
  if (!r.body.item.reviewed_at) throw new Error("reviewed_at missing");
  const listed = await callEdge({ action: "list_pending" });
  eq(listed.body.items.length, 0, "no longer pending");
});

t("approve twice -> 404 (only a pending run can be decided)", async () => {
  const id = await saveOneRun();
  await callEdge({ action: "approve", id });
  const r = await callEdge({ action: "approve", id });
  eq(r.status, 404, "status");
});

t("reject stores the reason and the run leaves the queue", async () => {
  const id = await saveOneRun();
  const r = await callEdge({ action: "reject", id, reason: "ভুল প্রসঙ্গ" });
  eq(r.status, 200, "status");
  eq(r.body.item.status, "rejected", "status");
  eq(r.body.item.review_note, "ভুল প্রসঙ্গ", "review_note");
  eq(r.body.item.reviewed_by, "admin-uuid", "reviewed_by");
  const listed = await callEdge({ action: "list_pending" });
  eq(listed.body.items.length, 0, "no longer pending");
});

t("reject on an approved run -> 404", async () => {
  const id = await saveOneRun();
  await callEdge({ action: "approve", id });
  const r = await callEdge({ action: "reject", id, reason: "too late" });
  eq(r.status, 404, "status");
});

t("approve unknown id -> 404; approve without id -> 400", async () => {
  setup();
  const r = await callEdge({ action: "approve", id: "rec-999" });
  eq(r.status, 404, "unknown id status");
  const noId = await callEdge({ action: "approve" });
  eq(noId.status, 400, "missing id status");
});

t("non-admin cannot approve -> 403", async () => {
  const id = await saveOneRun();
  const r = await callEdge({ action: "approve", id }, USER_JWT);
  eq(r.status, 403, "status");
});

await chain;
console.log(`\nrecommend-daily-content tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed: ${failures.join(", ")}`);
  process.exit(1);
}
