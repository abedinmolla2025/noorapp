// enrich-dua-content admin-gate tests — Phase 2 consolidation (2026-11-11).
//
// Ports the P0 gate from noorapp-ai-security (commit 35eb536) into the
// Phase 2 worktree: `await requireAdmin(req)` at the start of the handler
// (generate-dua-seo was already gated; this file was not). Stages the REAL
// supabase/functions/enrich-dua-content/index.ts plus the real
// _shared/require-admin.ts with a fake Supabase, and proves the gate is
// actually wired: unauthenticated requests make zero DB calls and zero
// writes, a non-admin JWT gets 403, and an admin JWT reaches the stats
// path (200 with the expected counts).
//
// Run: node supabase/functions/enrich-dua-content/enrich-dua-content-gate.test.mjs
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
    if (f.op === "is" && f.val === null && v !== null && v !== undefined) return false;
    if (f.op === "is" && f.val !== null && v !== f.val) return false;
    if (f.op === "contains") {
      if (!v || typeof v !== "object") return false;
      for (const [k, want] of Object.entries(f.val)) { if (v[k] !== want) return false; }
    }
    if (f.op === "in" && !f.val.includes(v)) return false;
  }
  return true;
}
class Builder {
  constructor(table) { this.table = table; this.filters = []; this.limitN = null; this.patch = null; this.head = false; }
  select(cols, opts) { this.head = !!opts?.head; return this; }
  eq(c, v) { this.filters.push({ op: "eq", col: c, val: v }); return this; }
  is(c, v) { this.filters.push({ op: "is", col: c, val: v }); return this; }
  contains(c, v) { this.filters.push({ op: "contains", col: c, val: v }); return this; }
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

const stageDir = mkdtempSync(join(tmpdir(), "p2-enrich-gate-"));
const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "enrich-dua-content"), { recursive: true });
const edgeSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2.95.0", "../fake-supabase.mjs");
writeFileSync(join(hDir, "enrich-dua-content", "index.ts"), edgeSrc);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
writeFileSync(join(hDir, "fake-supabase.mjs"), FAKE_SUPABASE);

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  LOVABLE_API_KEY: "test-lovable-key",
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
// The stats path never calls the AI gateway; fail loudly if any test
// reaches it (no real network in tests).
globalThis.fetch = async () => { throw new Error("unexpected network fetch in gate test"); };
await import(pathToFileURL(join(hDir, "enrich-dua-content", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

function seed() {
  return {
    admin_content: [
      { id: "dua-1", content_type: "dua", when_to_recite_bn: "x", metadata: {} },
      { id: "dua-2", content_type: "dua", when_to_recite_bn: null, metadata: { enrichment_status: "pending_review" } },
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
  assert.equal(r.data.awaitingReview, 1);
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
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
