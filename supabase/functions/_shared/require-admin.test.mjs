// Node fallback for supabase/functions/_shared/require-admin.test.ts.
//
// Deno is not installed in this environment, so these tests exercise the
// *exact production logic* of `decideAuth` by extracting it verbatim from
// require-admin.ts (between // --- NODE_TESTABLE_BEGIN --- and
// // --- NODE_TESTABLE_END ---), stripping only TypeScript type syntax,
// and running the same assertion matrix as the Deno test file.
//
// LIMITATION: this validates the pure decision logic (anonymous->401,
// malformed/invalid JWT->401, valid non-admin JWT->403, admin->pass).
// It does NOT exercise requireAdmin()'s live wiring (env reads, supabase-js
// getClaims, is_admin RPC) — that must be re-run with `deno test` once deno
// is available, against a mocked supabase client (no production calls).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "require-admin.ts"), "utf8");

const begin = "// --- NODE_TESTABLE_BEGIN ---";
const end = "// --- NODE_TESTABLE_END ---";
const bi = src.indexOf(begin);
const ei = src.indexOf(end);
if (bi === -1 || ei === -1 || ei <= bi) {
  throw new Error("NODE_TESTABLE markers not found in require-admin.ts");
}

let block = src.slice(bi + begin.length, ei);

// Strip the JSDoc comment (harmless in JS, but keep the extraction simple),
// drop `export`, and collapse the typed signature to plain JS.
block = block
  .replace(/\/\*\*[\s\S]*?\*\//, "") // JSDoc
  .replace(/export\s+function\s+decideAuth\s*\(/, "function decideAuth(")
  .replace(
    /\(\s*opts\s*:\s*\{[\s\S]*?\}\s*\)\s*:\s*AuthDecision\s*\{/,
    "(opts) {"
  );

const factory = new Function(`${block}\nreturn decideAuth;`);
const decideAuth = factory();

// ---- assertion matrix (mirrors require-admin.test.ts) ----
const GOOD_HEADER = "Bearer valid.jwt.token";
let passed = 0;
let failed = 0;

function check(name, input, expectOk, expectStatus, expectUserId) {
  const d = decideAuth(input);
  const ok =
    d.ok === expectOk &&
    (expectOk || d.status === expectStatus) &&
    (expectOk ? d.userId === expectUserId : true);
  if (ok) {
    passed++;
    console.log(`PASS  ${name} -> ${JSON.stringify(d)}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}\n      got: ${JSON.stringify(d)}\n      want ok=${expectOk} status=${expectStatus} userId=${expectUserId}`);
  }
}

const base = {
  authHeader: GOOD_HEADER,
  claims: { sub: "admin-456" },
  claimsError: null,
  isAdmin: true,
  isAdminError: null,
};

check("anonymous (no header) -> 401", { ...base, authHeader: null }, false, 401);
check("malformed header (no Bearer prefix) -> 401", { ...base, authHeader: "Token abc123" }, false, 401);
check("bare 'Bearer ' with empty token -> 401", { ...base, authHeader: "Bearer " }, false, 401);
check("invalid JWT (getClaims error) -> 401", { ...base, claims: null, claimsError: new Error("bad") }, false, 401);
check("claims without sub -> 401", { ...base, claims: {} }, false, 401);
check("valid non-admin JWT -> 403", { ...base, claims: { sub: "user-123" }, isAdmin: false }, false, 403);
check("is_admin RPC failure -> 403 (fail closed)", { ...base, claims: { sub: "user-123" }, isAdmin: null, isAdminError: new Error("rpc boom") }, false, 403);
check("valid admin JWT -> pass, userId returned", { ...base }, true, null, "admin-456");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
