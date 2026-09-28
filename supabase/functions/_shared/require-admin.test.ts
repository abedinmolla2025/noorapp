// Regression tests for the P0-1 admin auth gate.
//
// Run with:  deno test --allow-env --allow-net supabase/functions/_shared/require-admin.test.ts
// (deno required; in environments without deno, the node equivalent is
//  supabase/functions/_shared/require-admin.test.mjs)

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { decideAuth } from "./require-admin.ts";

const GOOD_HEADER = "Bearer valid.jwt.token";

Deno.test("anonymous (no Authorization header) -> 401", () => {
  const d = decideAuth({
    authHeader: null,
    claims: null,
    claimsError: null,
    isAdmin: null,
    isAdminError: null,
  });
  assert(!d.ok && d.status === 401, `expected 401, got ${JSON.stringify(d)}`);
});

Deno.test("malformed header (no Bearer prefix) -> 401", () => {
  const d = decideAuth({
    authHeader: "Token abc123",
    claims: null,
    claimsError: null,
    isAdmin: null,
    isAdminError: null,
  });
  assert(!d.ok && d.status === 401, `expected 401, got ${JSON.stringify(d)}`);
});

Deno.test("bare 'Bearer ' with empty token -> 401", () => {
  const d = decideAuth({
    authHeader: "Bearer ",
    claims: null,
    claimsError: null,
    isAdmin: null,
    isAdminError: null,
  });
  assert(!d.ok && d.status === 401, `expected 401, got ${JSON.stringify(d)}`);
});

Deno.test("invalid JWT (getClaims error) -> 401", () => {
  const d = decideAuth({
    authHeader: GOOD_HEADER,
    claims: null,
    claimsError: new Error("invalid JWT"),
    isAdmin: null,
    isAdminError: null,
  });
  assert(!d.ok && d.status === 401, `expected 401, got ${JSON.stringify(d)}`);
});

Deno.test("claims without sub -> 401", () => {
  const d = decideAuth({
    authHeader: GOOD_HEADER,
    claims: {},
    claimsError: null,
    isAdmin: true,
    isAdminError: null,
  });
  assert(!d.ok && d.status === 401, `expected 401, got ${JSON.stringify(d)}`);
});

Deno.test("valid non-admin JWT -> 403", () => {
  const d = decideAuth({
    authHeader: GOOD_HEADER,
    claims: { sub: "user-123" },
    claimsError: null,
    isAdmin: false,
    isAdminError: null,
  });
  assert(!d.ok && d.status === 403, `expected 403, got ${JSON.stringify(d)}`);
});

Deno.test("is_admin RPC failure -> 403 (fail closed, never 200)", () => {
  const d = decideAuth({
    authHeader: GOOD_HEADER,
    claims: { sub: "user-123" },
    claimsError: null,
    isAdmin: null,
    isAdminError: new Error("rpc boom"),
  });
  assert(!d.ok && d.status === 403, `expected 403, got ${JSON.stringify(d)}`);
});

Deno.test("valid admin JWT -> pass, userId returned", () => {
  const d = decideAuth({
    authHeader: GOOD_HEADER,
    claims: { sub: "admin-456" },
    claimsError: null,
    isAdmin: true,
    isAdminError: null,
  });
  assert(d.ok, `expected ok, got ${JSON.stringify(d)}`);
  assertEquals((d as { userId: string }).userId, "admin-456");
});
