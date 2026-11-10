// indexnow-submit admin-gate tests — Phase 2 consolidation (2026-11-11).
//
// Ports the S-2 gate from noorapp-s2-remediation into the Phase 2
// worktree: `await requireAdmin(req)` at the start of the handler.
// IndexNow submission is an administrative SEO action; no shipped caller
// exists, so gating breaks no authorized caller. Stages the REAL
// supabase/functions/indexnow-submit/index.ts plus the real
// _shared/require-admin.ts with a fake Supabase and a stubbed IndexNow
// endpoint, and proves the gate is actually wired: unauthenticated
// requests submit nothing, a non-admin JWT gets 403, and an admin JWT
// reaches the submission path (200, config read, IndexNow called).
//
// Run: node supabase/functions/indexnow-submit/indexnow-submit-gate.test.mjs
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

// ---- fake Supabase (app_settings config read) ----
const FAKE_SUPABASE = `
export const state = { tables: {} };
export function __reset(tables) { state.tables = tables; }
class Builder {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; }
  eq(c, v) { this.filters.push({ op: "eq", col: c, val: v }); return this; }
  rows() { return (state.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f.op !== "eq" || r[f.col] === f.val)); }
  async maybeSingle() { const rs = this.rows(); return { data: rs[0] ?? null, error: null }; }
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

const stageDir = mkdtempSync(join(tmpdir(), "p2-indexnow-gate-"));
const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "indexnow-submit"), { recursive: true });
const edgeSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "indexnow-submit", "index.ts"), edgeSrc);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
writeFileSync(join(hDir, "fake-supabase.mjs"), FAKE_SUPABASE);

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
// Stubbed IndexNow endpoint: records calls, always 200.
const indexNowCalls = [];
globalThis.fetch = async (url, opts) => {
  indexNowCalls.push({ url, opts });
  return { ok: true, status: 200, text: async () => "" };
};
await import(pathToFileURL(join(hDir, "indexnow-submit", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

function seedWithConfig() {
  return {
    app_settings: [
      { setting_key: "indexnow", setting_value: { api_key: "test-indexnow-key", host: "noorapp.in" } },
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

await checkAsync("no-auth -> 401, zero IndexNow calls", async () => {
  fakeSupabase.__reset(seedWithConfig());
  indexNowCalls.length = 0;
  const r = await call({ path: "/dua/x" }, null);
  assert.equal(r.status, 401);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("bad JWT -> 401, zero IndexNow calls", async () => {
  fakeSupabase.__reset(seedWithConfig());
  indexNowCalls.length = 0;
  const r = await call({ path: "/dua/x" }, "Bearer garbage");
  assert.equal(r.status, 401);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("non-admin JWT -> 403, zero IndexNow calls", async () => {
  fakeSupabase.__reset(seedWithConfig());
  indexNowCalls.length = 0;
  const r = await call({ path: "/dua/x" }, "Bearer valid-user-jwt");
  assert.equal(r.status, 403);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("admin JWT, no config -> 200 skipped (past the gate, config read)", async () => {
  fakeSupabase.__reset({ app_settings: [] });
  indexNowCalls.length = 0;
  const r = await call({ path: "/dua/x" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.skipped, true);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("admin JWT, config present -> 200, IndexNow called once (past the gate)", async () => {
  fakeSupabase.__reset(seedWithConfig());
  indexNowCalls.length = 0;
  const r = await call({ path: "/dua/x" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.success, true);
  assert.equal(indexNowCalls.length, 1);
  assert.ok(String(indexNowCalls[0].url).includes("api.indexnow.org"));
});
await checkAsync("OPTIONS preflight -> not gated (CORS response, no 401)", async () => {
  fakeSupabase.__reset(seedWithConfig());
  indexNowCalls.length = 0;
  const res = await handler(req(null, null, "OPTIONS"));
  assert.notEqual(res.status, 401);
  assert.equal(indexNowCalls.length, 0);
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
