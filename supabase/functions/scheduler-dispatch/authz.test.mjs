// P0-2 regression tests: auth-gate decision logic for scheduler-dispatch.
//
// Run: node supabase/functions/scheduler-dispatch/authz.test.mjs
// No production calls; the admin-JWT verifier is fully mocked.

import test from "node:test";
import assert from "node:assert/strict";

import {
  timingSafeEqual,
  extractBearerToken,
  parseJsonBody,
  extractScheduleId,
  authorizeDispatch,
} from "./authz.ts";

const SECRET = "test-cron-secret-abc123";

const adminVerifier = (verdict) => async (_token) => verdict;

function baseOpts(overrides = {}) {
  return {
    method: "POST",
    authHeader: `Bearer ${SECRET}`,
    cronSecret: SECRET,
    wantsBulk: false,
    verifyAdminJwt: adminVerifier("invalid"),
    ...overrides,
  };
}

// ---------- timingSafeEqual ----------
test("timingSafeEqual: equal strings match", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
});
test("timingSafeEqual: different strings do not match", () => {
  assert.equal(timingSafeEqual("abc", "abd"), false);
});
test("timingSafeEqual: length mismatch does not match", () => {
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", "x"), false);
});
test("timingSafeEqual: empty vs empty matches (callers still require non-empty secret)", () => {
  assert.equal(timingSafeEqual("", ""), true);
});

// ---------- extractBearerToken ----------
test("extractBearerToken: parses Bearer token", () => {
  assert.equal(extractBearerToken("Bearer tok123"), "tok123");
});
test("extractBearerToken: scheme is case-insensitive", () => {
  assert.equal(extractBearerToken("bearer tok123"), "tok123");
});
test("extractBearerToken: rejects missing/empty/malformed", () => {
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(""), null);
  assert.equal(extractBearerToken("Bearer "), null);
  assert.equal(extractBearerToken("Basic dG9r"), null);
});

// ---------- parseJsonBody ----------
test("parseJsonBody: empty body -> {}", () => {
  assert.deepEqual(parseJsonBody(""), { ok: true, body: {} });
  assert.deepEqual(parseJsonBody("   "), { ok: true, body: {} });
});
test("parseJsonBody: valid JSON object parses", () => {
  assert.deepEqual(parseJsonBody('{"schedule_id":"x"}'), {
    ok: true,
    body: { schedule_id: "x" },
  });
});
test("parseJsonBody: malformed JSON -> not ok (must never dispatch)", () => {
  assert.deepEqual(parseJsonBody("{not json"), { ok: false });
  assert.deepEqual(parseJsonBody('{"a":}'), { ok: false });
});
test("parseJsonBody: non-object JSON -> not ok", () => {
  assert.deepEqual(parseJsonBody("[1,2]"), { ok: false });
  assert.deepEqual(parseJsonBody('"str"'), { ok: false });
});

// ---------- extractScheduleId ----------
test("extractScheduleId: picks non-empty string id", () => {
  assert.equal(extractScheduleId({ schedule_id: "abc" }), "abc");
  assert.equal(extractScheduleId({}), null);
  assert.equal(extractScheduleId({ schedule_id: "  " }), null);
  assert.equal(extractScheduleId({ schedule_id: 123 }), null);
});

// ---------- authorizeDispatch: cron secret path ----------
test("gate: correct cron secret -> pass (single)", async () => {
  const r = await authorizeDispatch(baseOpts({ wantsBulk: false }));
  assert.deepEqual(r, { ok: true, kind: "cron-secret" });
});
test("gate: correct cron secret -> pass (bulk)", async () => {
  const r = await authorizeDispatch(baseOpts({ wantsBulk: true }));
  assert.deepEqual(r, { ok: true, kind: "cron-secret" });
});
test("gate: wrong secret + invalid JWT -> 401", async () => {
  const r = await authorizeDispatch(
    baseOpts({ authHeader: "Bearer wrong-secret" })
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
test("gate: anonymous (no header) -> 401", async () => {
  const r = await authorizeDispatch(baseOpts({ authHeader: null }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.reason, "missing-credentials");
});
test("gate: empty Authorization header -> 401", async () => {
  const r = await authorizeDispatch(baseOpts({ authHeader: "" }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

// ---------- fail closed on missing secret ----------
test("gate: FAIL CLOSED — missing env secret never matches (even with the right-looking token)", async () => {
  const r = await authorizeDispatch(
    baseOpts({ cronSecret: "", authHeader: `Bearer ${SECRET}` })
  );
  // Falls through to the admin path; mocked verifier says invalid -> 401.
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
test("gate: FAIL CLOSED — whitespace-only secret never matches", async () => {
  const r = await authorizeDispatch(
    baseOpts({ cronSecret: "   ", authHeader: "Bearer    " })
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

// ---------- admin JWT path ----------
test("gate: valid admin JWT -> pass for single schedule (admin test/preview path)", async () => {
  const r = await authorizeDispatch(
    baseOpts({
      authHeader: "Bearer admin.jwt.token",
      cronSecret: SECRET,
      wantsBulk: false,
      verifyAdminJwt: adminVerifier("admin"),
    })
  );
  assert.deepEqual(r, { ok: true, kind: "admin-jwt" });
});
test("gate: valid admin JWT on bulk -> 403 (bulk requires cron secret)", async () => {
  const r = await authorizeDispatch(
    baseOpts({
      authHeader: "Bearer admin.jwt.token",
      cronSecret: SECRET,
      wantsBulk: true,
      verifyAdminJwt: adminVerifier("admin"),
    })
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.reason, "bulk-requires-cron-secret");
});
test("gate: valid JWT but not admin -> 403", async () => {
  const r = await authorizeDispatch(
    baseOpts({
      authHeader: "Bearer user.jwt.token",
      wantsBulk: false,
      verifyAdminJwt: adminVerifier("not-admin"),
    })
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});
test("gate: expired/forged JWT -> 401", async () => {
  const r = await authorizeDispatch(
    baseOpts({
      authHeader: "Bearer forged.jwt",
      wantsBulk: false,
      verifyAdminJwt: adminVerifier("invalid"),
    })
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
test("gate: admin JWT still works when cron secret is unconfigured", async () => {
  const r = await authorizeDispatch(
    baseOpts({
      authHeader: "Bearer admin.jwt.token",
      cronSecret: "",
      wantsBulk: false,
      verifyAdminJwt: adminVerifier("admin"),
    })
  );
  assert.deepEqual(r, { ok: true, kind: "admin-jwt" });
});

// ---------- method ----------
test("gate: non-POST -> 405", async () => {
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const r = await authorizeDispatch(baseOpts({ method }));
    assert.equal(r.ok, false);
    assert.equal(r.status, 405);
  }
});
