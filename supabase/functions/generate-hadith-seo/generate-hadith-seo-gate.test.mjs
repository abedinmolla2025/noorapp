// generate-hadith-seo admin-gate tests — Phase 2 consolidation (2026-11-11),
// re-stubbed for Phase 3 (2026-11-13): the handler now calls the Adapter
// (Gemini free primary / Groq free secondary) instead of the pre-migration
// gateway, so the stub returns Gemini-shaped tool-call responses and the
// env carries GEMINI_API_KEY / GROQ_API_KEY. A handler-level process test
// proves one mocked Gemini call processes a pending row and writes it.
//
// Ports the P0 gate from noorapp-ai-security (commit 35eb536) into the
// Phase 2 worktree: `await requireAdmin(req)` at the start of the handler
// (generate-dua-seo was already gated; this file was not). Stages the REAL
// supabase/functions/generate-hadith-seo/index.ts plus the real
// _shared/require-admin.ts with a fake Supabase, and proves the gate is
// actually wired: unauthenticated requests make zero DB calls and zero
// writes, a non-admin JWT gets 403, and an admin JWT reaches the stats
// path (200 with the expected counts).
//
// Run: node supabase/functions/generate-hadith-seo/generate-hadith-seo-gate.test.mjs
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
function orMatches(row, orStr) {
  // Supports only the "field.is.null" / "field.is.not.null" clauses this edge uses.
  return orStr.split(",").some((clause) => {
    const [field, op, val] = clause.split(".");
    if (op === "is" && val === "null") return row[field] == null;
    if (op === "is" && val === "not") return row[field] != null;
    return false;
  });
}
function matches(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    if (f.op === "eq" && v !== f.val) return false;
  }
  return true;
}
class Builder {
  constructor(table) { this.table = table; this.filters = []; this.orStr = null; this.limitN = null; this.patch = null; this.head = false; }
  select(cols, opts) { this.head = !!opts?.head; return this; }
  eq(c, v) { this.filters.push({ op: "eq", col: c, val: v }); return this; }
  or(s) { this.orStr = s; return this; }
  limit(n) { this.limitN = n; return this; }
  rows() {
    let rs = (state.tables[this.table] ?? []).filter((r) => matches(r, this.filters));
    if (this.orStr) rs = rs.filter((r) => orMatches(r, this.orStr));
    if (this.limitN != null) rs = rs.slice(0, this.limitN);
    return rs;
  }
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

const stageDir = mkdtempSync(join(tmpdir(), "p2-hadithseo-gate-"));
const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "generate-hadith-seo"), { recursive: true });
const edgeSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2.95.0", "../fake-supabase.mjs");
writeFileSync(join(hDir, "generate-hadith-seo", "index.ts"), edgeSrc);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
// Phase 3: the handler imports the Adapter; stage its real files too.
for (const f of ["ai-config.ts", "ai-adapter.ts", "ai-gemini-client.ts", "ai-groq-client.ts", "bengali-editorial.ts"]) {
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
    explanation_bn: "এই হাদীস থেকে শিক্ষা পাওয়া যায় ধৈর্য ধরতে।",
    lessons_bn: ["ধৈর্য ধরতে শিখি", "আল্লাহর উপর ভরসা রাখি", "সত্য কথা বলতে শিখি"],
  };
  const body = {
    candidates: [{ content: { parts: [{ functionCall: { name: "save_hadith_seo", args: out } }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 600, totalTokenCount: 1800 },
  };
  return {
    ok: true, status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
};
await import(pathToFileURL(join(hDir, "generate-hadith-seo", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

function seed() {
  return {
    hadiths: [
      { id: "h1", arabic: "AR", bengali: "BN", explanation_bn: "done", lessons_bn: ["a"] },
      { id: "h2", arabic: "AR", bengali: "BN", explanation_bn: null, lessons_bn: null },
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
await checkAsync("admin process -> one mocked Gemini call processes the pending row and writes it (G15/G16)", async () => {
  fakeSupabase.__reset(seed());
  geminiQueue.length = 0;
  fetchCalls.length = 0;
  geminiQueue.push({
    explanation_bn: "এই হাদীস থেকে শিক্ষা পাওয়া যায় যে ধৈর্য ধরতে হয় এবং আল্লাহর উপর ভরসা রাখতে হয়।",
    lessons_bn: ["ধৈর্য ধরতে শিখি", "আল্লাহর উপর ভরসা রাখি", "সত্য কথা বলতে শিখি"],
  });
  const r = await call({ action: "process", batchSize: 1 }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.processed, 1, `expected 1 processed, got ${JSON.stringify(r.data)}`);
  assert.equal(r.data.failed, 0);
  assert.equal(r.data.pending, 0);
  assert.equal(r.data.done, true);
  assert.equal(fetchCalls.length, 1, "exactly one provider call for one row");
  assert.equal(fetchCalls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent");
  const row = fakeSupabase.state.tables.hadiths.find((x) => x.id === "h2");
  assert.equal(row.explanation_bn, "এই হাদীস থেকে শিক্ষা পাওয়া যায় যে ধৈর্য ধরতে হয় এবং আল্লাহর উপর ভরসা রাখতে হয়।");
  assert.deepEqual(row.lessons_bn, ["ধৈর্য ধরতে শিখি", "আল্লাহর উপর ভরসা রাখি", "সত্য কথা বলতে শিখি"]);
  const done = fakeSupabase.state.tables.hadiths.find((x) => x.id === "h1");
  assert.equal(done.explanation_bn, "done", "the complete row must not be rewritten");
  assert.equal(fakeSupabase.state.writes.filter((w) => w.op === "update").length, 1);
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
