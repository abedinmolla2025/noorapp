// P0-2 follow-up regression tests: send-prayer-notifications auth gate.
//
// send-prayer-notifications was a live unauthenticated mass-push endpoint.
// It is now gated behind SCHEDULER_CRON_SECRET with wantsBulk: true, so
// only the cron secret authorizes it — an admin JWT is deliberately
// insufficient. The service-role client must only be created after the gate.
//
// Run: node supabase/functions/send-prayer-notifications/gate.test.mjs
// No production calls; the admin-JWT verifier is fully mocked.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { authorizeDispatch } from "../scheduler-dispatch/authz.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = "test-cron-secret-xyz789";

const adminVerifier = (verdict) => async (_token) => verdict;

function baseOpts(overrides = {}) {
  return {
    method: "POST",
    authHeader: `Bearer ${SECRET}`,
    cronSecret: SECRET,
    wantsBulk: true, // send-prayer-notifications is inherently bulk
    verifyAdminJwt: adminVerifier("invalid"),
    ...overrides,
  };
}

test("cron secret authorizes the bulk push sender", async () => {
  const d = await authorizeDispatch(baseOpts());
  assert.deepEqual(d, { ok: true, kind: "cron-secret" });
});

test("missing credentials -> 401", async () => {
  const d = await authorizeDispatch(baseOpts({ authHeader: null }));
  assert.equal(d.ok, false);
  assert.equal(d.status, 401);
});

test("wrong secret + invalid JWT -> 401", async () => {
  const d = await authorizeDispatch(
    baseOpts({ authHeader: "Bearer wrong-secret" })
  );
  assert.equal(d.ok, false);
  assert.equal(d.status, 401);
});

test("valid admin JWT is NOT enough for bulk -> 403", async () => {
  const d = await authorizeDispatch(
    baseOpts({
      authHeader: "Bearer some.admin.jwt",
      verifyAdminJwt: adminVerifier("admin"),
    })
  );
  assert.equal(d.ok, false);
  assert.equal(d.status, 403);
  assert.equal(d.reason, "bulk-requires-cron-secret");
});

test("non-admin JWT -> 403", async () => {
  const d = await authorizeDispatch(
    baseOpts({
      authHeader: "Bearer some.user.jwt",
      verifyAdminJwt: adminVerifier("not-admin"),
    })
  );
  assert.equal(d.ok, false);
  assert.equal(d.status, 403);
});

test("GET with the secret -> 405", async () => {
  const d = await authorizeDispatch(baseOpts({ method: "GET" }));
  assert.equal(d.ok, false);
  assert.equal(d.status, 405);
});

test("empty SCHEDULER_CRON_SECRET fails closed -> 401 even with a token", async () => {
  const d = await authorizeDispatch(
    baseOpts({ cronSecret: "", authHeader: "Bearer anything" })
  );
  assert.equal(d.ok, false);
  assert.equal(d.status, 401);
});

test("structural: the gate runs before the service-role client is created", () => {
  const src = readFileSync(join(HERE, "index.ts"), "utf8");
  const gatePos = src.indexOf("authorizeDispatch(");
  const svcPos = src.indexOf('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
  assert.ok(gatePos > 0, "authorizeDispatch call must exist in index.ts");
  assert.ok(svcPos > 0, "service-role key read must exist in index.ts");
  assert.ok(
    gatePos < svcPos,
    "auth gate must run before the service-role client is created"
  );
  assert.ok(
    src.includes("wantsBulk: true"),
    "send-prayer-notifications must use wantsBulk: true"
  );
});
