// test-indexnow admin-gate tests — Phase 2 consolidation (2026-11-11).
//
// Ports the S-2 gate from noorapp-s2-remediation into the Phase 2
// worktree: `await requireAdmin(req)` at the start of the handler.
// This is an admin diagnostic tool; no shipped caller exists, so gating
// breaks no authorized caller. Stages the REAL
// supabase/functions/test-indexnow/index.ts plus the real
// _shared/require-admin.ts with a fake Supabase and a stubbed IndexNow
// endpoint, and proves the gate is actually wired: unauthenticated
// requests test nothing, a non-admin JWT gets 403, and an admin JWT
// reaches the test path (200, IndexNow called).
//
// Run: node supabase/functions/test-indexnow/test-indexnow-gate.test.mjs
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

// ---- fake Supabase (only auth.getClaims + is_admin RPC are used) ----
const FAKE_SUPABASE = `
export function createClient(url, key, opts) {
  return {
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

const stageDir = mkdtempSync(join(tmpdir(), "p2-testindexnow-gate-"));
const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "test-indexnow"), { recursive: true });
const edgeSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "test-indexnow", "index.ts"), edgeSrc);
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
await import(pathToFileURL(join(hDir, "test-indexnow", "index.ts")).href);
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

await checkAsync("no-auth -> 401, zero IndexNow calls", async () => {
  indexNowCalls.length = 0;
  const r = await call({ api_key: "k", host: "noorapp.in" }, null);
  assert.equal(r.status, 401);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("bad JWT -> 401, zero IndexNow calls", async () => {
  indexNowCalls.length = 0;
  const r = await call({ api_key: "k", host: "noorapp.in" }, "Bearer garbage");
  assert.equal(r.status, 401);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("non-admin JWT -> 403, zero IndexNow calls", async () => {
  indexNowCalls.length = 0;
  const r = await call({ api_key: "k", host: "noorapp.in" }, "Bearer valid-user-jwt");
  assert.equal(r.status, 403);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("admin JWT + valid body -> 200 success, IndexNow called once (past the gate)", async () => {
  indexNowCalls.length = 0;
  const r = await call({ api_key: "k", host: "noorapp.in" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.success, true);
  assert.equal(indexNowCalls.length, 1);
  assert.ok(String(indexNowCalls[0].url).includes("api.indexnow.org"));
});
await checkAsync("admin JWT + missing fields -> 400 (past the gate, validation after gate)", async () => {
  indexNowCalls.length = 0;
  const r = await call({ host: "noorapp.in" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 400);
  assert.equal(indexNowCalls.length, 0);
});
await checkAsync("OPTIONS preflight -> not gated (CORS response, no 401)", async () => {
  const res = await handler(req(null, null, "OPTIONS"));
  assert.notEqual(res.status, 401);
  assert.equal(indexNowCalls.length, 0);
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
