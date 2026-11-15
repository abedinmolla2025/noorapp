// generate-quiz-sfx admin-gate tests — Phase 2 consolidation (2026-11-11).
//
// Ports the S-2 gate from noorapp-ai-security-2 (commit 90e59f2) into the
// Phase 2 worktree: `await requireAdmin(req)` at the start of the handler.
// Quiz SFX spends paid ElevenLabs credits; only admins may invoke it.
// (No callers in the frontend — quiz SFX is local Web Audio — so gating
// breaks nothing.) Stages the REAL supabase/functions/generate-quiz-sfx/
// index.ts plus the real _shared/require-admin.ts with a fake Supabase
// and a stubbed ElevenLabs fetch, and proves the gate is actually wired:
// unauthenticated requests reach no ElevenLabs call, a non-admin JWT gets
// 403, and an admin JWT reaches the generation path (200 audio).
//
// Run: node supabase/functions/generate-quiz-sfx/generate-quiz-sfx-gate.test.mjs
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

// ---- fake deno.land serve: captures the handler on globalThis ----
const FAKE_SERVE = `
export function serve(fn) { globalThis.__quizHandler = fn; }
`;

const stageDir = mkdtempSync(join(tmpdir(), "p2-quizsfx-gate-"));
const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "generate-quiz-sfx"), { recursive: true });
const edgeSrc = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://deno.land/std@0.168.0/http/server.ts", "../fake-serve.mjs");
writeFileSync(join(hDir, "generate-quiz-sfx", "index.ts"), edgeSrc);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
writeFileSync(join(hDir, "fake-supabase.mjs"), FAKE_SUPABASE);
writeFileSync(join(hDir, "fake-serve.mjs"), FAKE_SERVE);

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  ELEVENLABS_API_KEY: "test-elevenlabs-key",
};
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { globalThis.__quizHandler = fn; },
};
// Stubbed ElevenLabs: records calls, returns 8 bytes of fake audio.
const elevenCalls = [];
globalThis.fetch = async (url, opts) => {
  elevenCalls.push({ url, opts });
  return {
    ok: true, status: 200,
    text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(8),
  };
};
await import(pathToFileURL(join(hDir, "generate-quiz-sfx", "index.ts")).href);
const handler = globalThis.__quizHandler;
assert.ok(handler, "serve handler was not captured");

function req(body, authHeader, method = "POST") {
  return {
    method,
    headers: { get: (n) => (String(n).toLowerCase() === "authorization" ? (authHeader ?? null) : null) },
    json: async () => body,
  };
}
async function call(body, authHeader) {
  const res = await handler(req(body, authHeader));
  return { status: res.status, headers: res.headers, body: await res.text().catch(() => "") };
}

await checkAsync("no-auth -> 401, zero ElevenLabs calls", async () => {
  elevenCalls.length = 0;
  const r = await call({ type: "correct" }, null);
  assert.equal(r.status, 401);
  assert.equal(elevenCalls.length, 0);
});
await checkAsync("bad JWT -> 401, zero ElevenLabs calls", async () => {
  elevenCalls.length = 0;
  const r = await call({ type: "correct" }, "Bearer garbage");
  assert.equal(r.status, 401);
  assert.equal(elevenCalls.length, 0);
});
await checkAsync("non-admin JWT -> 403, zero ElevenLabs calls", async () => {
  elevenCalls.length = 0;
  const r = await call({ type: "correct" }, "Bearer valid-user-jwt");
  assert.equal(r.status, 403);
  assert.equal(elevenCalls.length, 0);
});
await checkAsync("admin JWT + valid type -> 200 audio, exactly one ElevenLabs call (past the gate)", async () => {
  elevenCalls.length = 0;
  const r = await call({ type: "correct" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(elevenCalls.length, 1);
  assert.ok(String(elevenCalls[0].url).includes("elevenlabs.io"));
});
await checkAsync("admin JWT + invalid type -> 400 (past the gate, validation after gate)", async () => {
  elevenCalls.length = 0;
  const r = await call({ type: "bogus" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 400);
  assert.equal(elevenCalls.length, 0);
});
await checkAsync("OPTIONS preflight -> not gated (CORS response, no 401)", async () => {
  const res = await handler(req(null, null, "OPTIONS"));
  assert.notEqual(res.status, 401);
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
