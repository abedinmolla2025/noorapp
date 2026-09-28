// P0-2 regression tests: secret gate for the /api/scheduler-tick Vercel route.
//
// Run: node api/scheduler-tick.test.mjs
// No production calls; fetch (the edge-function call) is fully mocked.

import test from "node:test";
import assert from "node:assert/strict";

import handler, { decideTickAuth, timingSafeEqual } from "./scheduler-tick.ts";

const SECRET = "test-shared-secret-xyz";

function gateOpts(overrides = {}) {
  return {
    method: "GET",
    queryKey: null,
    bodyKey: null,
    authHeader: null,
    secret: SECRET,
    ...overrides,
  };
}

// ---------- decideTickAuth ----------
test("tick gate: correct query key -> pass", () => {
  assert.deepEqual(decideTickAuth(gateOpts({ queryKey: SECRET })), { ok: true });
});
test("tick gate: correct body key -> pass", () => {
  assert.deepEqual(decideTickAuth(gateOpts({ bodyKey: SECRET })), { ok: true });
});
test("tick gate: correct Bearer header -> pass (native CRON_SECRET pattern)", () => {
  assert.deepEqual(
    decideTickAuth(gateOpts({ authHeader: `Bearer ${SECRET}` })),
    { ok: true }
  );
});
test("tick gate: anonymous -> 401", () => {
  const r = decideTickAuth(gateOpts());
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
test("tick gate: wrong key -> 401", () => {
  const r = decideTickAuth(gateOpts({ queryKey: "wrong" }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
test("tick gate: empty key -> 401", () => {
  const r = decideTickAuth(gateOpts({ queryKey: "   " }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
test("tick gate: POST -> 405 (cron uses GET only)", () => {
  const r = decideTickAuth(gateOpts({ method: "POST", queryKey: SECRET }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 405);
});
test("tick gate: FAIL CLOSED — missing env secret -> 500 even with a key", () => {
  const r = decideTickAuth(gateOpts({ secret: "", queryKey: "anything" }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
});

// ---------- handler (mocked fetch) ----------
function withEnvAndFetch(fetchImpl, fn) {
  const prevSecret = process.env.SCHEDULER_CRON_SECRET;
  const prevFetch = globalThis.fetch;
  process.env.SCHEDULER_CRON_SECRET = SECRET;
  globalThis.fetch = fetchImpl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevSecret === undefined) delete process.env.SCHEDULER_CRON_SECRET;
      else process.env.SCHEDULER_CRON_SECRET = prevSecret;
      globalThis.fetch = prevFetch;
    });
}

test("handler: GET without key -> 401 and fetch never called", async () => {
  let called = false;
  await withEnvAndFetch(
    async () => {
      called = true;
      return new Response("{}");
    },
    async () => {
      const res = await handler(
        new Request("https://noorapp.in/api/scheduler-tick")
      );
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(called, false);
    }
  );
});

test("handler: GET with correct query key -> calls edge with Bearer secret", async () => {
  let seenAuth = null;
  await withEnvAndFetch(
    async (url, init) => {
      seenAuth = init.headers.Authorization;
      assert.equal(url, "https://llicfiepatzgllmjhzbw.supabase.co/functions/v1/scheduler-dispatch");
      assert.equal(init.method, "POST");
      return new Response(JSON.stringify({ ok: true, dispatched: 0 }), {
        status: 200,
      });
    },
    async () => {
      const res = await handler(
        new Request(`https://noorapp.in/api/scheduler-tick?key=${SECRET}`)
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.status, 200);
      assert.equal(seenAuth, `Bearer ${SECRET}`);
    }
  );
});

test("handler: POST with correct key -> 405 (method restricted)", async () => {
  await withEnvAndFetch(
    async () => new Response("{}"),
    async () => {
      const res = await handler(
        new Request(`https://noorapp.in/api/scheduler-tick?key=${SECRET}`, {
          method: "POST",
        })
      );
      assert.equal(res.status, 405);
    }
  );
});

test("handler: missing env secret -> 500 fail closed", async () => {
  const prevFetch = globalThis.fetch;
  const prevSecret = process.env.SCHEDULER_CRON_SECRET;
  delete process.env.SCHEDULER_CRON_SECRET;
  globalThis.fetch = async () => new Response("{}");
  try {
    const res = await handler(
      new Request(`https://noorapp.in/api/scheduler-tick?key=${SECRET}`)
    );
    assert.equal(res.status, 500);
  } finally {
    if (prevSecret !== undefined) process.env.SCHEDULER_CRON_SECRET = prevSecret;
    globalThis.fetch = prevFetch;
  }
});

test("handler: edge 401 passthrough does not leak the secret", async () => {
  await withEnvAndFetch(
    async () => new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 }),
    async () => {
      const res = await handler(
        new Request(`https://noorapp.in/api/scheduler-tick?key=${SECRET}`)
      );
      const text = await res.text();
      assert.equal(res.status, 200);
      assert.ok(!text.includes(SECRET), "response must not contain the secret");
    }
  );
});

// ---------- timingSafeEqual sanity ----------
test("timingSafeEqual behaves", () => {
  assert.equal(timingSafeEqual("a", "a"), true);
  assert.equal(timingSafeEqual("a", "b"), false);
  assert.equal(timingSafeEqual("a", "aa"), false);
});
