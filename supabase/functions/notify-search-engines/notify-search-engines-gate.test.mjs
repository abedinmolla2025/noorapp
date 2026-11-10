// notify-search-engines admin-gate tests — Phase 2 consolidation (2026-11-11).
//
// Ports the S-2 gate from noorapp-s2-remediation into the Phase 2
// worktree: `await requireAdmin(req)` at the start of the handler.
// The only caller is the admin SEO tab, whose functions.invoke already
// sends the admin's session JWT, so gating breaks no authorized caller.
// Stages the REAL supabase/functions/notify-search-engines/index.ts plus
// the real _shared/require-admin.ts with a fake Supabase and stubbed
// Google/Bing pings, and proves the gate is actually wired:
// unauthenticated requests ping nothing and write nothing, a non-admin
// JWT gets 403, and an admin JWT reaches the ping path (200, both pings
// sent, log rows written).
//
// Run: node supabase/functions/notify-search-engines/notify-search-engines-gate.test.mjs
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

// ---- fake Supabase (seo_index_log rate-limit read + log insert) ----
const FAKE_SUPABASE = `
export const state = { tables: {}, writes: [] };
export function __reset(tables) { state.tables = tables; state.writes = []; }
class Builder {
  constructor(table) { this.table = table; this.filters = []; this.limitN = null; }
  select() { return this; }
  in(c, v) { this.filters.push({ op: "in", col: c, val: v }); return this; }
  gte(c, v) { this.filters.push({ op: "gte", col: c, val: v }); return this; }
  limit(n) { this.limitN = n; return this; }
  rows() {
    let rs = (state.tables[this.table] ?? []).filter((r) => {
      for (const f of this.filters) {
        if (f.op === "in" && !f.val.includes(r[f.col])) return false;
        if (f.op === "gte" && !(r[f.col] >= f.val)) return false;
      }
      return true;
    });
    if (this.limitN != null) rs = rs.slice(0, this.limitN);
    return rs;
  }
  async insert(row) { const rows = Array.isArray(row) ? row : [row]; state.tables[this.table] ??= []; for (const r of rows) state.tables[this.table].push({ ...r }); state.writes.push({ table: this.table, op: "insert" }); return { data: rows, error: null }; }
  then(resolve, reject) { try { resolve({ data: this.rows(), error: null }); } catch (e) { reject(e); } }
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

const stageDir = mkdtempSync(join(tmpdir(), "p2-notify-gate-"));
const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "notify-search-engines"), { recursive: true });
const edgeSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "notify-search-engines", "index.ts"), edgeSrc);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
writeFileSync(join(hDir, "fake-supabase.mjs"), FAKE_SUPABASE);

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
// Stubbed search-engine pings: records calls, always OK.
const pingCalls = [];
globalThis.fetch = async (url) => {
  pingCalls.push(String(url));
  return { ok: true, status: 200, text: async () => "" };
};
await import(pathToFileURL(join(hDir, "notify-search-engines", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

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

await checkAsync("no-auth -> 401, zero pings, zero writes", async () => {
  fakeSupabase.__reset({ seo_index_log: [] });
  pingCalls.length = 0;
  const r = await call({}, null);
  assert.equal(r.status, 401);
  assert.equal(pingCalls.length, 0);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("bad JWT -> 401, zero pings, zero writes", async () => {
  fakeSupabase.__reset({ seo_index_log: [] });
  pingCalls.length = 0;
  const r = await call({}, "Bearer garbage");
  assert.equal(r.status, 401);
  assert.equal(pingCalls.length, 0);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("non-admin JWT -> 403, zero pings, zero writes", async () => {
  fakeSupabase.__reset({ seo_index_log: [] });
  pingCalls.length = 0;
  const r = await call({}, "Bearer valid-user-jwt");
  assert.equal(r.status, 403);
  assert.equal(pingCalls.length, 0);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("admin JWT -> 200, Google + Bing pinged, log rows written (past the gate)", async () => {
  fakeSupabase.__reset({ seo_index_log: [] });
  pingCalls.length = 0;
  const r = await call({}, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.success, true);
  assert.equal(pingCalls.length, 2);
  assert.ok(pingCalls.some((u) => u.includes("google.com/ping")));
  assert.ok(pingCalls.some((u) => u.includes("bing.com/ping")));
  assert.ok(fakeSupabase.state.writes.length >= 1, "log insert must have run");
});
await checkAsync("OPTIONS preflight -> not gated (CORS response, no 401)", async () => {
  fakeSupabase.__reset({ seo_index_log: [] });
  pingCalls.length = 0;
  const res = await handler(req(null, null, "OPTIONS"));
  assert.notEqual(res.status, 401);
  assert.equal(pingCalls.length, 0);
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
