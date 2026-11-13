// fix-dua-content admin-gate tests — Phase 2 consolidation (2026-11-11),
// re-stubbed for Phase 3 (2026-11-13): the handler now calls the Adapter
// (Gemini free primary / Groq free secondary) instead of the pre-migration
// gateway, so the stub returns Gemini-shaped tool-call responses and the
// env carries GEMINI_API_KEY / GROQ_API_KEY. A handler-level process test
// proves one mocked Gemini call fixes an incomplete row and writes it.
//
// Ports the P0 gate from noorapp-ai-security (commit 35eb536) into the
// Phase 2 worktree: `await requireAdmin(req)` at the start of the handler
// (generate-dua-seo was already gated; this file was not). Stages the REAL
// supabase/functions/fix-dua-content/index.ts plus the real
// _shared/require-admin.ts with a fake Supabase, and proves the gate is
// actually wired: unauthenticated requests make zero DB calls and zero
// writes, a non-admin JWT gets 403, and an admin JWT reaches the stats
// path (200 with the expected counts).
//
// Run: node supabase/functions/fix-dua-content/fix-dua-content-gate.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const funcsRoot = join(here, ".."); // supabase/functions

let passed = 0;
let failed = 0;
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

// ---- fake Supabase (PostgREST-shaped, thenable builder) ----
const FAKE_SUPABASE = `
export const state = { tables: {}, writes: [] };
export function __reset(tables) { state.tables = tables; state.writes = []; }
function matches(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    if (f.op === "eq" && v !== f.val) return false;
    if (f.op === "in" && !f.val.includes(v)) return false;
  }
  return true;
}
class Builder {
  constructor(table) { this.table = table; this.filters = []; this.limitN = null; this.patch = null; this.head = false; }
  select(cols, opts) { this.head = !!opts?.head; return this; }
  eq(c, v) { this.filters.push({ op: "eq", col: c, val: v }); return this; }
  in(c, v) { this.filters.push({ op: "in", col: c, val: v }); return this; }
  limit(n) { this.limitN = n; return this; }
  rows() { let rs = (state.tables[this.table] ?? []).filter((r) => matches(r, this.filters)); if (this.limitN != null) rs = rs.slice(0, this.limitN); return rs; }
  async maybeSingle() { const rs = this.rows(); return { data: rs[0] ?? null, error: null }; }
  async insert(row) { const rows = Array.isArray(row) ? row : [row]; state.tables[this.table] ??= []; for (const r of rows) state.tables[this.table].push({ ...r }); state.writes.push({ table: this.table, op: "insert" }); return { data: rows, error: null }; }
  update(patch) { this.patch = patch; return this; }
  then(resolve, reject) {
    try {
      if (this.patch) { const rs = this.rows(); for (const r of rs) Object.assign(r, this.patch); state.writes.push({ table: this.table, op: "update", count: rs.length }); resolve({ data: rs, error: null }); }
      else resolve({ data: this.head ? [] : this.rows(), count: this.rows().length, error: null });
    } catch (e) { reject(e); }
  }
}
export function createClient(url, key, opts) {
  return {
    from: (table) => new Builder(table),
    auth: { getClaims: async (jwt) => {
      if (jwt === "valid-admin-jwt") return { data: { claims: { sub: "admin-uuid" } }, error: null };
      if (jwt === "valid-user-jwt") return { data: { claims: { sub: "user-uuid" } }, error: null };
      return { data: null, error: { message: "invalid token" } };
    } },
    rpc: async (fn, args) => {
      if (fn === "is_admin") return { data: args?._user_id === "admin-uuid", error: null };
      return { data: null, error: null };
    },
  };
}
`;

const stageDir = mkdtempSync(join(tmpdir(), "p2-fix-gate-"));
const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "fix-dua-content"), { recursive: true });
const edgeSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2.95.0", "../fake-supabase.mjs");
writeFileSync(join(hDir, "fix-dua-content", "index.ts"), edgeSrc);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
// Phase 3: the handler imports the Adapter; stage its real files too.
for (const f of ["ai-config.ts", "ai-adapter.ts", "ai-gemini-client.ts", "ai-groq-client.ts"]) {
  writeFileSync(join(hDir, "_shared", f), readFileSync(join(funcsRoot, "_shared", f), "utf8"));
}
writeFileSync(join(hDir, "fake-supabase.mjs"), FAKE_SUPABASE);

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  GEMINI_API_KEY: "test-gemini-key",
  GROQ_API_KEY: "test-groq-key",
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
// Stubbed Gemini (the Adapter's primary): a queue of per-row tool-call
// outputs. Records every call; gate tests assert it was never reached.
const geminiQueue = [];
const fetchCalls = [];
globalThis.fetch = async (url, opts) => {
  fetchCalls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent");
  const out = geminiQueue.shift() ?? {
    content_pronunciation: "আল্লা-হুম্মা ইন্নাকা আফুউন\nতুহিব্বুল আফওয়া ফা'ফু আন্নি\nআমিন।",
    content: "হে আল্লাহ, তুমি ক্ষমাশীল এবং ক্ষমা করতে ভালোবাসো, তাই আমাকে ক্ষমা করে দাও। এই দোয়া আমরা পড়ি ক্ষমা চাওয়ার জন্য।",
  };
  const body = {
    candidates: [{ content: { parts: [{ functionCall: { name: "save_dua_content", args: out } }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 600, totalTokenCount: 1800 },
  };
  return {
    ok: true, status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
};
await import(pathToFileURL(join(hDir, "fix-dua-content", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

function seed() {
  return {
    admin_content: [
      // complete: pronunciation >= 100 chars, meaning >= 120 chars
      { id: "dua-complete", content_type: "dua", content_pronunciation: "প".repeat(150), content: "অ".repeat(150) },
      // incomplete: both empty
      { id: "dua-incomplete", content_type: "dua", content_pronunciation: "", content: "" },
    ],
  };
}
function req(body, authHeader, method = "POST") {
  return {
    method,
    headers: { get: (n) => (String(n).toLowerCase() === "authorization" ? (authHeader ?? null) : null) },
    json: async () => body,
  };
}
async function call(body, authHeader) {
  const res = await handler(req(body, authHeader));
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

await checkAsync("no-auth stats -> 401, zero writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ action: "stats" }, null);
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("bad JWT stats -> 401, zero writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ action: "stats" }, "Bearer garbage");
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("non-admin JWT stats -> 403, zero writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ action: "stats" }, "Bearer valid-user-jwt");
  assert.equal(r.status, 403);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("admin JWT stats -> 200 with expected counts (past the gate)", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ action: "stats" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 2);
  assert.equal(r.data.pending, 1);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("OPTIONS preflight -> not gated (CORS response, no 401)", async () => {
  fakeSupabase.__reset(seed());
  const res = await handler(req(null, null, "OPTIONS"));
  assert.notEqual(res.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("no-auth process -> 401, zero writes (process would write + call AI)", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ action: "process", batchSize: 1 }, null);
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
  assert.equal(fetchCalls.length, 0, "the gate must block before any AI call");
});
await checkAsync("admin process -> one mocked Gemini call fixes the incomplete row and writes it (G15/G16)", async () => {
  fakeSupabase.__reset(seed());
  geminiQueue.length = 0;
  fetchCalls.length = 0;
  const pron = "আল্লা-হুম্মা ইন্নাকা আফুউন্ তুহিব্বুল আফওয়া ফা'ফু আন্নী। ইয়া আল্লাহ, তুমি ক্ষমাশীল, আমাকে ক্ষমা করে দাও। আমিন।";
  const meaning = "হে আল্লাহ, তুমি ক্ষমাশীল এবং ক্ষমা করতে ভালোবাসো, তাই আমাকে ক্ষমা করে দাও। এই দোয়া আমরা পড়ি ক্ষমা চাওয়ার জন্য এবং তোমার রহমতের আশায়।";
  assert.ok(pron.length >= 100, `fixture pronunciation must be >= 100 chars, got ${pron.length}`);
  assert.ok(meaning.length >= 120, `fixture meaning must be >= 120 chars, got ${meaning.length}`);
  geminiQueue.push({ content_pronunciation: pron, content: meaning });
  const r = await call({ action: "process", batchSize: 10 }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.processed, 1, `expected 1 processed, got ${JSON.stringify(r.data)}`);
  assert.equal(r.data.failed, 0);
  assert.equal(r.data.pending, 0);
  assert.equal(r.data.done, true);
  assert.equal(fetchCalls.length, 1, "exactly one provider call for one row");
  assert.equal(fetchCalls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent");
  const row = fakeSupabase.state.tables.admin_content.find((x) => x.id === "dua-incomplete");
  assert.equal(row.content_pronunciation, pron);
  assert.equal(row.content, meaning);
  const complete = fakeSupabase.state.tables.admin_content.find((x) => x.id === "dua-complete");
  assert.equal(complete.content_pronunciation, "প".repeat(150), "the complete row must not be rewritten");
  assert.equal(fakeSupabase.state.writes.filter((w) => w.op === "update").length, 1);
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
