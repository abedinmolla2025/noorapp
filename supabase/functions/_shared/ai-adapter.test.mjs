// ai-adapter tests — Phase 3 (2026-11-13).
//
// Unit + orchestration tests for the central AI Adapter
// (supabase/functions/_shared/ai-config.ts, ai-adapter.ts,
// ai-gemini-client.ts, ai-groq-client.ts) with MOCKED provider responses
// only. No real API keys, no live provider calls, no paid requests
// (readiness gates G19, G1-G14, G18).
//
// The harness stages copies of the real _shared files into os.tmpdir()
// (rewriting ONLY the esm.sh import in require-admin.ts to a local fake
// module) and drives generateToolCall() with an injected mock fetch, a
// controllable clock, an instant sleep (which records the delay), and a
// deterministic random source (jitter = 0).
//
// Fixtures are built from the official docs' error shapes
// (AI-PROVIDER-VERIFICATION.md §2, §7): Gemini generateContent
// envelopes with usageMetadata/finishReason, Groq OpenAI-compatible
// chat completions with x-ratelimit-* headers, Gemini RetryInfo
// retryDelay. The real forced-call mechanism and the real RetryInfo
// shape are confirmed in Rehearsal (Phase 5), not assumed.
//
// Run: node supabase/functions/_shared/ai-adapter.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const funcsRoot = join(here, "..");
let passed = 0;
let failed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`PASS  ${name}\n`);
  } catch (e) {
    failed++;
    failures.push(name);
    process.stdout.write(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`PASS  ${name}\n`);
  } catch (e) {
    failed++;
    failures.push(name);
    process.stdout.write(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

// ---------------------------------------------------------------- staging
const stageDir = mkdtempSync(join(tmpdir(), "p3-adapter-"));
mkdirSync(join(stageDir, "_shared"), { recursive: true });
const FAKE_SUPABASE = `export function createClient() { return {}; }\n`;
writeFileSync(join(stageDir, "fake-supabase.mjs"), FAKE_SUPABASE);
for (const f of ["ai-config.ts", "ai-adapter.ts", "ai-gemini-client.ts", "ai-groq-client.ts"]) {
  writeFileSync(join(stageDir, "_shared", f), readFileSync(join(funcsRoot, "_shared", f), "utf8"));
}
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(stageDir, "_shared", "require-admin.ts"), adminSrc);

// ---- Deno shim + test keys (literal test values — never real secrets) ----
const testEnv = {
  GEMINI_API_KEY: "test-gemini-key",
  GROQ_API_KEY: "test-groq-key",
};
globalThis.Deno = { env: { get: (k) => testEnv[k] } };

const adapter = await import(pathToFileURL(join(stageDir, "_shared", "ai-adapter.ts")).href);
const geminiClient = await import(pathToFileURL(join(stageDir, "_shared", "ai-gemini-client.ts")).href);
const groqClient = await import(pathToFileURL(join(stageDir, "_shared", "ai-groq-client.ts")).href);
const configMod = await import(pathToFileURL(join(stageDir, "_shared", "ai-config.ts")).href);
const { AI_CONFIG } = configMod;

// Capture the Adapter's usage logs (console.log JSON lines) for assertions.
const logLines = [];
const origLog = console.log;
console.log = (...a) => { logLines.push(a.join(" ")); };

// ---------------------------------------------------------------- mock fetch
// A scripted mock: each entry is { status, body, headers } or { hang: true }.
// The mock records every call (url + parsed body) and the max in-flight
// count. It REFUSES any URL outside the two provider endpoints — that is
// the G19 mock-only guard: a test that reached a real host fails loudly.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function makeMock(script) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  async function fetchImpl(url, opts) {
    if (url !== GEMINI_URL && url !== GROQ_URL) {
      throw new Error(`mock fetch refused non-provider URL: ${url}`);
    }
    calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const next = script.shift();
      if (!next) throw new Error("mock fetch: no scripted response left");
      if (next.hang) {
        await new Promise((_resolve, reject) => {
          const signal = opts?.signal;
          if (!signal) throw new Error("hang mock needs an AbortSignal");
          if (signal.aborted) {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
            return;
          }
          signal.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          }, { once: true });
        });
      }
      const bodyText = typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {});
      const headers = next.headers ?? {};
      return {
        status: next.status ?? 200,
        ok: (next.status ?? 200) >= 200 && (next.status ?? 200) < 300,
        headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
        text: async () => bodyText,
      };
    } finally {
      inFlight--;
    }
  }
  return { fetchImpl, calls, get maxInFlight() { return maxInFlight; } };
}

// A URL-routed mock: the response depends on which provider is called.
function makeRoutedMock(geminiFn, groqFn) {
  const calls = [];
  async function fetchImpl(url, opts) {
    if (url !== GEMINI_URL && url !== GROQ_URL) {
      throw new Error(`mock fetch refused non-provider URL: ${url}`);
    }
    calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
    const next = url === GEMINI_URL ? geminiFn() : groqFn();
    const bodyText = typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {});
    const headers = next.headers ?? {};
    return {
      status: next.status ?? 200,
      ok: (next.status ?? 200) >= 200 && (next.status ?? 200) < 300,
      headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
      text: async () => bodyText,
    };
  }
  return { fetchImpl, calls };
}

// ---------------------------------------------------------------- fixtures
const TEST_TOOL = {
  name: "save_test",
  description: "Test tool.",
  parameters: {
    type: "object",
    properties: { explanation_bn: { type: "string" } },
    required: ["explanation_bn"],
    additionalProperties: false,
  },
};

function geminiOk(args, usage) {
  return {
    status: 200,
    body: {
      candidates: [{
        content: { parts: [{ functionCall: { name: "save_test", args } }] },
        finishReason: "STOP",
      }],
      usageMetadata: usage ?? { promptTokenCount: 1200, candidatesTokenCount: 600, totalTokenCount: 1800 },
    },
  };
}
function groqOk(args, usage) {
  return {
    status: 200,
    body: {
      choices: [{
        message: { tool_calls: [{ function: { name: "save_test", arguments: JSON.stringify(args) } }] },
        finish_reason: "tool_calls",
      }],
      usage: usage ?? { prompt_tokens: 1200, completion_tokens: 600, total_tokens: 1800 },
    },
  };
}
function geminiError(status, message, retryDelay) {
  const details = retryDelay
    ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }]
    : [];
  return {
    status,
    body: {
      error: {
        code: status,
        message,
        status: status === 429 ? "RESOURCE_EXHAUSTED" : "INTERNAL",
        details,
      },
    },
  };
}
function groqError(status, message, headers) {
  return {
    status,
    headers: headers ?? {},
    body: { error: { message, type: "error", code: String(status) } },
  };
}

let nowMs = 1_700_000_000_000; // fixed clock for breaker/quota assertions
const sleeps = [];
async function callAdapter(mock, overrides = {}) {
  return adapter.generateToolCall({
    systemPrompt: "test system prompt",
    userText: "test user text",
    tool: TEST_TOOL,
    correlationId: "test-corr-1",
    fetchImpl: mock.fetchImpl,
    now: () => nowMs,
    sleep: async (ms) => { sleeps.push(ms); },
    random: () => 0.5, // jitter = 0
    timeouts: { primaryMs: 200, secondaryMs: 200 },
    ...overrides,
  });
}
function resetTest() {
  adapter.__resetAdapterStateForTests();
  sleeps.length = 0;
  logLines.length = 0;
  nowMs = 1_700_000_000_000;
  testEnv.GEMINI_API_KEY = "test-gemini-key";
  testEnv.GROQ_API_KEY = "test-groq-key";
}
function outcome(status, headers = {}, bodyText = "", extra = {}) {
  return { status, headers, bodyText, timedOut: false, networkError: false, ...extra };
}

// ---------------------------------------------------------------- G1: error mapping
check("G1 normalizeError: 401 -> auth / PROVIDER_AUTH_FAILED, no retry, no failover", () => {
  const e = adapter.normalizeError("gemini", outcome(401, {}, "bad key"), 0, nowMs);
  assert.equal(e.kind, "auth");
  assert.equal(e.code, "PROVIDER_AUTH_FAILED");
  assert.equal(e.retryable, false);
  assert.equal(e.failover, false);
});
check("G1 normalizeError: 403 -> auth / PROVIDER_AUTH_FAILED", () => {
  const e = adapter.normalizeError("groq", outcome(403, {}, "forbidden"), 0, nowMs);
  assert.equal(e.kind, "auth");
  assert.equal(e.code, "PROVIDER_AUTH_FAILED");
  assert.equal(e.retryable, false);
  assert.equal(e.failover, false);
});
check("G1 normalizeError: 401/403 message carries the provider's rejection reason (first 200 chars of its error body)", () => {
  // Phase D runs #2–#5 all returned the same bare 403 across two
  // different keys; without the provider's own reason a key problem
  // cannot be told apart from "API not enabled" or a restriction.
  const body = '{"error":{"code":403,"message":"Generative Language API has not been used in project 123 before or it is disabled.","status":"PERMISSION_DENIED"}}';
  const e = adapter.normalizeError("gemini", outcome(403, {}, body), 0, nowMs);
  assert.equal(e.code, "PROVIDER_AUTH_FAILED");
  assert.ok(e.message.includes("Generative Language API has not been used"));
  assert.ok(e.message.includes("PERMISSION_DENIED"));
  assert.equal(e.retryable, false);
  assert.equal(e.failover, false);
});
check("G1 normalizeError: 400 -> badRequest / BAD_REQUEST", () => {
  const e = adapter.normalizeError("gemini", outcome(400, {}, "bad request"), 0, nowMs);
  assert.equal(e.kind, "badRequest");
  assert.equal(e.code, "BAD_REQUEST");
  assert.equal(e.failover, false);
});
check("G1 normalizeError: 500 -> retryable / PROVIDER_TEMPORARILY_UNAVAILABLE", () => {
  const e = adapter.normalizeError("groq", outcome(500, {}, "boom"), 0, nowMs);
  assert.equal(e.kind, "retryable");
  assert.equal(e.code, "PROVIDER_TEMPORARILY_UNAVAILABLE");
  assert.equal(e.retryable, true);
  assert.equal(e.failover, true);
});
check("G1 parseGeminiResponse: MALFORMED_FUNCTION_CALL -> schema", () => {
  const r = geminiClient.parseGeminiResponse({
    candidates: [{ content: { parts: [] }, finishReason: "MALFORMED_FUNCTION_CALL" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "schema");
});
check("G1 parseGeminiResponse: promptFeedback SAFETY -> policy", () => {
  const r = geminiClient.parseGeminiResponse({
    promptFeedback: { blockReason: "SAFETY" },
    candidates: [],
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "policy");
});
check("G1 normalizeError: 402 -> PAYMENT_REQUIRED, no retry, no failover", () => {
  const e = adapter.normalizeError("gemini", outcome(402, {}, "payment required"), 0, nowMs);
  assert.equal(e.code, "PAYMENT_REQUIRED");
  assert.equal(e.retryable, false);
  assert.equal(e.failover, false);
});
check("G1 parseGroqResponse: invalid JSON args -> schema", () => {
  const r = groqClient.parseGroqResponse({
    choices: [{ message: { tool_calls: [{ function: { arguments: "{not json" } }] }, finish_reason: "tool_calls" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "schema");
});

// ---------------------------------------------------------------- config values
check("config: docs' proposed values are the implementer's choice (90/60/10s, 2+1, 1500±25%, 5/5min/60s, 8000/4096, 20, INR 0)", () => {
  assert.equal(AI_CONFIG.primary.model, "openai/gpt-oss-120b");
  assert.equal(AI_CONFIG.secondary.model, "gemini-3-flash-preview");
  assert.equal(AI_CONFIG.primary.secretName, "GROQ_API_KEY");
  assert.equal(AI_CONFIG.secondary.secretName, "GEMINI_API_KEY");
  assert.equal(AI_CONFIG.primary.timeoutMs, 90_000);
  assert.equal(AI_CONFIG.secondary.timeoutMs, 60_000);
  assert.equal(AI_CONFIG.probeTimeoutMs, 10_000);
  assert.equal(AI_CONFIG.maxPrimaryRetries, 2);
  assert.equal(AI_CONFIG.secondaryAttempts, 1);
  assert.equal(AI_CONFIG.backoffBaseMs, 1500);
  assert.equal(AI_CONFIG.backoffJitterFraction, 0.25);
  assert.equal(AI_CONFIG.breakerFailureThreshold, 5);
  assert.equal(AI_CONFIG.breakerWindowMs, 300_000);
  assert.equal(AI_CONFIG.breakerCooldownMs, 60_000);
  assert.equal(AI_CONFIG.inputTokenCeiling, 8000);
  assert.equal(AI_CONFIG.outputTokenCeiling, 4096);
  assert.equal(AI_CONFIG.batchMaxRows, 20);
  assert.equal(AI_CONFIG.monthlyPaidBudgetInr, 0);
  assert.equal(AI_CONFIG.dailyTokenCap, null);
});

// ---------------------------------------------------------------- durations
check("parseDurationToMs: seconds, Go and RPC durations; garbage -> null", () => {
  const p = adapter.parseDurationToMs;
  assert.equal(p("90"), 90_000);
  assert.equal(p("6h0m0s"), 21_600_000);
  assert.equal(p("1m30s"), 90_000);
  assert.equal(p("0.5s"), 500);
  assert.equal(p("500ms"), 500);
  assert.equal(p("2h"), 7_200_000);
  assert.equal(p(null), null);
  assert.equal(p(""), null);
  assert.equal(p("garbage"), null);
  assert.equal(p("60sx"), null);
});
check("nextMidnightPacificMs: PST date -> 08:00 UTC next day; PDT date -> 07:00 UTC next day", () => {
  // 2026-01-15 12:00 UTC is PST (UTC-8): next midnight Pacific = 2026-01-16 08:00 UTC.
  assert.equal(
    adapter.nextMidnightPacificMs(Date.UTC(2026, 0, 15, 12, 0, 0)),
    Date.UTC(2026, 0, 16, 8, 0, 0),
  );
  // 2026-07-15 12:00 UTC is PDT (UTC-7): next midnight Pacific = 2026-07-16 07:00 UTC.
  assert.equal(
    adapter.nextMidnightPacificMs(Date.UTC(2026, 6, 15, 12, 0, 0)),
    Date.UTC(2026, 6, 16, 7, 0, 0),
  );
});

// ---------------------------------------------------------------- G2: client translation
check("G2 buildGeminiRequest: exact shape (systemInstruction, contents, functionDeclarations, ANY, maxOutputTokens)", () => {
  const req = geminiClient.buildGeminiRequest({
    systemPrompt: "sys",
    userText: "user",
    tool: TEST_TOOL,
    maxOutputTokens: 4096,
  });
  assert.equal(req.systemInstruction.parts[0].text, "sys");
  assert.equal(req.contents[0].role, "user");
  assert.equal(req.contents[0].parts[0].text, "user");
  assert.equal(req.tools[0].functionDeclarations[0].name, "save_test");
  // Gemini rejects `additionalProperties` in function parameters (HTTP 400,
  // proven live 2026-11-14 Phase D run #1), so buildGeminiRequest strips
  // it. The parameters must equal TEST_TOOL.parameters minus that field.
  const { additionalProperties: _dropped, ...expectedParams } = TEST_TOOL.parameters;
  assert.deepEqual(req.tools[0].functionDeclarations[0].parameters, expectedParams);
  assert.equal(req.toolConfig.functionCallingConfig.mode, "ANY");
  assert.deepEqual(req.toolConfig.functionCallingConfig.allowedFunctionNames, ["save_test"]);
  assert.equal(req.generationConfig.maxOutputTokens, 4096);
});
check("G2 buildGeminiRequest: strips additionalProperties recursively and does not mutate the tool schema", () => {
  const nested = {
    name: "save_nested",
    description: "Nested tool.",
    parameters: {
      type: "object",
      properties: {
        faq: {
          type: "array",
          items: {
            type: "object",
            properties: { q: { type: "string" }, a: { type: "string" } },
            additionalProperties: false,
          },
        },
      },
      required: ["faq"],
      additionalProperties: false,
    },
  };
  const before = JSON.stringify(nested.parameters);
  const req = geminiClient.buildGeminiRequest({
    systemPrompt: "sys",
    userText: "user",
    tool: nested,
    maxOutputTokens: 100,
  });
  const paramsText = JSON.stringify(req.tools[0].functionDeclarations[0].parameters);
  assert.equal(paramsText.includes("additionalProperties"), false);
  assert.deepEqual(req.tools[0].functionDeclarations[0].parameters, {
    type: "object",
    properties: {
      faq: {
        type: "array",
        items: {
          type: "object",
          properties: { q: { type: "string" }, a: { type: "string" } },
        },
      },
    },
    required: ["faq"],
  });
  // The original tool schema must be untouched (the client deep-clones).
  assert.equal(JSON.stringify(nested.parameters), before);
});
check("G2 buildGroqRequest: exact shape (model, messages, tools, tool_choice required, max_tokens)", () => {
  const req = groqClient.buildGroqRequest({
    systemPrompt: "sys",
    userText: "user",
    tool: TEST_TOOL,
    maxOutputTokens: 4096,
  });
  assert.equal(req.model, "openai/gpt-oss-120b");
  assert.equal(req.messages[0].role, "system");
  assert.equal(req.messages[1].role, "user");
  assert.equal(req.tools[0].function.name, "save_test");
  assert.equal(req.tool_choice.type, "function");
  assert.equal(req.tool_choice.function.name, "save_test");
  assert.equal(req.max_tokens, 4096);
});
check("G2 endpoints: Gemini + Groq URLs are exact", () => {
  assert.equal(geminiClient.geminiUrl(), GEMINI_URL);
  assert.equal(groqClient.groqUrl(), GROQ_URL);
});
check("G2 usage extraction: Gemini usageMetadata + Groq usage", () => {
  const g = geminiClient.parseGeminiResponse(geminiOk({ explanation_bn: "x" }).body);
  assert.equal(g.ok, true);
  assert.deepEqual(g.usage, { inputTokens: 1200, outputTokens: 600, totalTokens: 1800 });
  const q = groqClient.parseGroqResponse(groqOk({ explanation_bn: "x" }).body);
  assert.equal(q.ok, true);
  assert.deepEqual(q.usage, { inputTokens: 1200, outputTokens: 600, totalTokens: 1800 });
});

// ---------------------------------------------------------------- G3: forced tool call
await checkAsync("G3 Groq forced tool call returns schema-valid args", async () => {
  resetTest();
  const mock = makeMock([groqOk({ explanation_bn: "ব্যাখ্যা" })]);
  const r = await callAdapter(mock);
  assert.deepEqual(r.args, { explanation_bn: "ব্যাখ্যা" });
  assert.equal(r.provider, "groq");
  assert.equal(r.calls, 1);
  assert.equal(mock.calls[0].url, GROQ_URL);
});
await checkAsync("G3 Gemini forced tool call returns schema-valid args (after primary 503s)", async () => {
  resetTest();
  const mock = makeMock([
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    geminiOk({ explanation_bn: "ব্যাখ্যা" }),
  ]);
  const r = await callAdapter(mock);
  assert.deepEqual(r.args, { explanation_bn: "ব্যাখ্যা" });
  assert.equal(r.provider, "gemini");
  assert.equal(r.calls, 4);
});
await checkAsync("G3 missing tool call -> SCHEMA_ERROR, secondary never called", async () => {
  resetTest();
  const mock = makeMock([{
    status: 200,
    body: { choices: [{ message: { content: "free text, no call" }, finish_reason: "stop" }] },
  }]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof adapter.AiError && e.code === "SCHEMA_ERROR" && e.message.includes("no tool call returned"),
  );
  assert.equal(mock.calls.length, 1);
});

// ---------------------------------------------------------------- G4: invalid JSON
await checkAsync("G4 Gemini 200 with unparseable body -> SCHEMA_ERROR, no failover", async () => {
  resetTest();
  const mock = makeMock([{ status: 200, body: "{not json" }]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof adapter.AiError && e.code === "SCHEMA_ERROR",
  );
  assert.equal(mock.calls.length, 1);
});
await checkAsync("G4 Gemini invalid JSON args -> SCHEMA_ERROR, no further failover", async () => {
  resetTest();
  const mock = makeMock([
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    {
      status: 200,
      body: {
        candidates: [{ content: { parts: [{ functionCall: { name: "save_test", args: "{bad json" } }] }, finishReason: "STOP" }],
      },
    },
  ]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof adapter.AiError && e.code === "SCHEMA_ERROR",
  );
  assert.equal(mock.calls.length, 4);
});

// ---------------------------------------------------------------- G5: timeout
await checkAsync("G5 hung primary aborts at the timeout and maps to retryable (4 calls max)", async () => {
  resetTest();
  const mock = makeMock([{ hang: true }, { hang: true }, { hang: true }, { hang: true }]);
  await assert.rejects(
    callAdapter(mock, { timeouts: { primaryMs: 50, secondaryMs: 50 } }),
    (e) => e instanceof adapter.AiError && e.code === "PROVIDER_TEMPORARILY_UNAVAILABLE" && e.retryable === true,
  );
  assert.equal(mock.calls.length, 4);
});

// ---------------------------------------------------------------- G6: 429 / 5xx
await checkAsync("G6 brief 429 retries and succeeds on the primary", async () => {
  resetTest();
  const mock = makeMock([
    groqError(429, "rate limited"),
    groqOk({ explanation_bn: "ok" }),
  ]);
  const r = await callAdapter(mock);
  assert.equal(r.provider, "groq");
  assert.equal(r.calls, 2);
  assert.equal(sleeps.length, 1);
});
await checkAsync("G6 retry-after is honoured (and capped at 30s)", async () => {
  resetTest();
  const mock = makeMock([
    { status: 429, headers: { "retry-after": "2" }, body: { error: { code: 429, message: "slow down", status: "RESOURCE_EXHAUSTED", details: [] } } },
    groqOk({ explanation_bn: "ok" }),
  ]);
  const r = await callAdapter(mock);
  assert.equal(r.provider, "groq");
  assert.equal(sleeps[0], 2000);
  assert.equal(adapter.backoffDelayMs(0, () => 0.5, 120_000), 30_000);
});
await checkAsync("G6 503 fails over to the secondary", async () => {
  resetTest();
  const mock = makeMock([
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    geminiOk({ explanation_bn: "ok" }),
  ]);
  const r = await callAdapter(mock);
  assert.equal(r.provider, "gemini");
  assert.equal(r.calls, 4);
});

// ---------------------------------------------------------------- G7: auth no-failover
await checkAsync("G7 Groq 401 -> PROVIDER_AUTH_FAILED, secondary never called", async () => {
  resetTest();
  const mock = makeMock([groqError(401, "bad key")]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof adapter.AiError && e.code === "PROVIDER_AUTH_FAILED",
  );
  assert.equal(mock.calls.length, 1);
  assert.ok(mock.calls.every((c) => c.url === GROQ_URL));
});
await checkAsync("G7 Groq 403 -> PROVIDER_AUTH_FAILED, secondary never called", async () => {
  resetTest();
  const mock = makeMock([groqError(403, "forbidden")]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof adapter.AiError && e.code === "PROVIDER_AUTH_FAILED",
  );
  assert.equal(mock.calls.length, 1);
});
await checkAsync("G7 Gemini 403 as secondary -> PROVIDER_AUTH_FAILED carrying the provider's reason (free tier unavailable)", async () => {
  // Owner decision 2026-11-14: the Gemini free tier is unavailable for
  // the owner's Google account (no billing). When the primary (Groq)
  // fails retryable and the secondary (Gemini) answers 403, the error
  // must say Gemini is unavailable — never a paid fallback.
  resetTest();
  const mock = makeMock([
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    groqError(503, "unavailable"),
    geminiError(403, "The Gemini API free tier is not available for this project. To use the Gemini API, please set up billing to upgrade to the paid tier."),
  ]);
  await assert.rejects(
    callAdapter(mock),
    (e) =>
      e instanceof adapter.AiError &&
      e.code === "PROVIDER_AUTH_FAILED" &&
      e.message.includes("free tier is not available"),
  );
  assert.equal(mock.calls.length, 4);
});

// ---------------------------------------------------------------- G8: missing key
await checkAsync("G8 missing GEMINI_API_KEY -> 500 naming the key, zero provider calls", async () => {
  resetTest();
  delete testEnv.GEMINI_API_KEY;
  const mock = makeMock([geminiOk({ explanation_bn: "ok" })]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof Error && e.message.includes("GEMINI_API_KEY is not configured"),
  );
  assert.equal(mock.calls.length, 0);
});
await checkAsync("G8 missing GROQ_API_KEY -> 500 naming the key, zero provider calls", async () => {
  resetTest();
  delete testEnv.GROQ_API_KEY;
  const mock = makeMock([geminiOk({ explanation_bn: "ok" })]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof Error && e.message.includes("GROQ_API_KEY is not configured"),
  );
  assert.equal(mock.calls.length, 0);
});

// ---------------------------------------------------------------- G9: circuit breaker
await checkAsync("G9 breaker: 5 failures open it; next call skips the primary; cooldown probe closes it", async () => {
  resetTest();
  const mock = makeRoutedMock(
    () => geminiOk({ explanation_bn: "ok" }),
    () => groqError(503, "unavailable"),
  );
  // Call 1: 3 primary failures + 1 secondary success.
  let r = await callAdapter(mock);
  assert.equal(r.provider, "gemini");
  assert.equal(mock.calls.filter((c) => c.url === GROQ_URL).length, 3);
  // Call 2: 2 more primary failures (5th trips the breaker) + secondary.
  r = await callAdapter(mock);
  assert.equal(r.provider, "gemini");
  assert.equal(mock.calls.filter((c) => c.url === GROQ_URL).length, 5);
  const state = adapter.getBreakerState("groq");
  assert.ok(state && state.openedUntilMs > nowMs, "breaker must be open after 5 failures");
  // Call 3 (breaker open): zero primary calls, straight to the secondary.
  const before = mock.calls.length;
  r = await callAdapter(mock);
  assert.equal(r.provider, "gemini");
  assert.equal(mock.calls.length - before, 1);
  assert.equal(mock.calls[mock.calls.length - 1].url, GEMINI_URL);
  // Past the 60 s cooldown, the half-open probe tries the primary once.
  nowMs += 61_000;
  const mock2 = makeRoutedMock(
    () => geminiOk({ explanation_bn: "ok" }),
    () => groqOk({ explanation_bn: "recovered" }),
  );
  r = await callAdapter(mock2);
  assert.equal(r.provider, "groq");
  assert.deepEqual(r.args, { explanation_bn: "recovered" });
  assert.equal(adapter.getBreakerState("groq"), undefined);
});

// ---------------------------------------------------------------- G10: correlation ID + no parallel calls
await checkAsync("G10 same correlation ID on retry; at most 1 in-flight call per request", async () => {
  resetTest();
  const mock = makeMock([
    groqError(429, "rate limited"),
    groqOk({ explanation_bn: "ok" }),
  ]);
  const r = await callAdapter(mock, { correlationId: "corr-xyz" });
  assert.equal(r.correlationId, "corr-xyz");
  assert.equal(mock.maxInFlight, 1);
  const lines = logLines.map((l) => JSON.parse(l)).filter((l) => l.event === "ai_call");
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.correlationId === "corr-xyz"));
});

// ---------------------------------------------------------------- G11: call cap
await checkAsync("G11 at most 4 provider calls per request", async () => {
  resetTest();
  const mock = makeMock([
    geminiError(503, "unavailable"),
    geminiError(503, "unavailable"),
    geminiError(503, "unavailable"),
    groqError(503, "unavailable"),
  ]);
  await assert.rejects(callAdapter(mock), (e) => e instanceof adapter.AiError);
  assert.equal(mock.calls.length, 4);
});

// ---------------------------------------------------------------- G12: Bengali
await checkAsync("G12 mocked Bengali response validates (required fields, word counts)", async () => {
  resetTest();
  const bn = "এই দোয়ার অর্থ হলো আল্লাহর কাছে সাহায্য চাওয়া এবং ধৈর্য ধরে তাঁর রহমতের আশা করা। আমরা শিখি প্রতিটি কঠিন সময়ে আল্লাহর উপর ভরসা রাখতে।";
  const mock = makeMock([groqOk({
    explanation_bn: bn,
    lessons_bn: ["ধৈর্য ধরতে শিখি", "আল্লাহর উপর ভরসা রাখি", "সাহায্য চাইতে শিখি"],
  })]);
  const r = await callAdapter(mock);
  const words = String(r.args.explanation_bn).trim().split(/\s+/).length;
  assert.ok(words >= 20, `expected >= 20 Bengali words, got ${words}`);
  assert.ok(Array.isArray(r.args.lessons_bn));
  assert.ok(r.args.lessons_bn.length >= 3 && r.args.lessons_bn.length <= 5);
});

// ---------------------------------------------------------------- G13: Arabic preservation
await checkAsync("G13 Arabic input is byte-identical in the request; no Arabic is generated", async () => {
  resetTest();
  const arabic = "اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي";
  const mock = makeMock([groqOk({ explanation_bn: "ব্যাখ্যা" })]);
  const r = await callAdapter(mock, { userText: `আরবি:\n${arabic}\n\nব্যাখ্যা লেখো।` });
  const sentText = mock.calls[0].body.messages[1].content;
  assert.ok(sentText.includes(arabic), "the exact Arabic input must reach the provider");
  assert.equal(/[\u0600-\u06FF]/.test(JSON.stringify(r.args)), false);
});

// ---------------------------------------------------------------- G14: virtue suppression in the request shape
check("G14 virtue suppression holds in the enrich request shape (no benefits/virtue fields)", () => {
  const enrichTool = {
    name: "save_dua_enrichment",
    description: "Save enriched contextual metadata for a dua.",
    parameters: {
      type: "object",
      properties: {
        when_to_recite_bn: { type: "string" },
        faq: { type: "array", items: { type: "object" } },
        hadith_reference: { type: ["string", "null"] },
        quran_reference: { type: ["string", "null"] },
        related_dua_titles: { type: "array", items: { type: "string" } },
      },
      required: ["when_to_recite_bn", "faq", "hadith_reference", "quran_reference", "related_dua_titles"],
      additionalProperties: false,
    },
  };
  const keys = Object.keys(enrichTool.parameters.properties);
  assert.ok(keys.every((k) => !/benefit|virtue|fadilah|fadhilah|reward|sawab/i.test(k)), `no virtue fields allowed: ${keys.join(",")}`);
  const prompt = "Do NOT generate virtue (fadilah), reward (sawab), benefit, or afterlife-outcome claims of any kind.";
  assert.ok(prompt.includes("Do NOT generate virtue"));
});

// ---------------------------------------------------------------- G18: 429 classification
check("G18 classify429 Groq daily quota: remaining-requests 0 + reset 6h -> FREE_QUOTA_EXHAUSTED", () => {
  const c = adapter.classify429("groq", {
    remainingRequests: "0",
    remainingTokens: "100",
    resetRequests: "6h0m0s",
    resetTokens: null,
    retryAfter: null,
    bodyText: "",
  }, 0, nowMs);
  assert.equal(c.code, "FREE_QUOTA_EXHAUSTED");
  assert.equal(c.resetAtMs, nowMs + 21_600_000);
});
check("G18 classify429 Groq RPM: remaining-requests 0 + reset 30s -> FREE_RATE_LIMITED", () => {
  const c = adapter.classify429("groq", {
    remainingRequests: "0",
    remainingTokens: "100",
    resetRequests: "30s",
    resetTokens: null,
    retryAfter: null,
    bodyText: "",
  }, 0, nowMs);
  assert.equal(c.code, "FREE_RATE_LIMITED");
  assert.equal(c.resetAtMs, null);
});
check("G18 classify429 Groq TPM: remaining-tokens 0 -> FREE_RATE_LIMITED", () => {
  const c = adapter.classify429("groq", {
    remainingRequests: "50",
    remainingTokens: "0",
    resetRequests: "1m0s",
    resetTokens: "1m0s",
    retryAfter: null,
    bodyText: "",
  }, 0, nowMs);
  assert.equal(c.code, "FREE_RATE_LIMITED");
});
check("G18 classify429 Groq provider-wide: retry-after only -> PROVIDER_TEMPORARILY_UNAVAILABLE", () => {
  const c = adapter.classify429("groq", {
    remainingRequests: "50",
    remainingTokens: "100",
    resetRequests: "1m0s",
    resetTokens: "1m0s",
    retryAfter: "120",
    bodyText: "",
  }, 0, nowMs);
  assert.equal(c.code, "PROVIDER_TEMPORARILY_UNAVAILABLE");
  assert.equal(c.retryAfterMs, 120_000);
});
check("G18 classify429 Gemini: long delay 7200s -> FREE_QUOTA_EXHAUSTED; short 30s -> FREE_RATE_LIMITED", () => {
  const longBody = JSON.stringify({
    error: {
      code: 429,
      message: "quota",
      status: "RESOURCE_EXHAUSTED",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "7200s" }],
    },
  });
  const c1 = adapter.classify429("gemini", {
    remainingRequests: null, remainingTokens: null, resetRequests: null,
    resetTokens: null, retryAfter: null, bodyText: longBody,
  }, 0, nowMs);
  assert.equal(c1.code, "FREE_QUOTA_EXHAUSTED");
  assert.equal(c1.resetAtMs, nowMs + 7_200_000);
  const shortBody = JSON.stringify({
    error: {
      code: 429,
      message: "rate",
      status: "RESOURCE_EXHAUSTED",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "30s" }],
    },
  });
  const c2 = adapter.classify429("gemini", {
    remainingRequests: null, remainingTokens: null, resetRequests: null,
    resetTokens: null, retryAfter: null, bodyText: shortBody,
  }, 0, nowMs);
  assert.equal(c2.code, "FREE_RATE_LIMITED");
});
check("G18 classify429 bare 429: attempt 0 -> FREE_RATE_LIMITED, attempt 1 -> PROVIDER_TEMPORARILY_UNAVAILABLE", () => {
  const sig = {
    remainingRequests: null, remainingTokens: null, resetRequests: null,
    resetTokens: null, retryAfter: null, bodyText: "",
  };
  assert.equal(adapter.classify429("gemini", sig, 0, nowMs).code, "FREE_RATE_LIMITED");
  assert.equal(adapter.classify429("gemini", sig, 1, nowMs).code, "PROVIDER_TEMPORARILY_UNAVAILABLE");
  assert.equal(adapter.classify429("groq", sig, 0, nowMs).code, "FREE_RATE_LIMITED");
  assert.equal(adapter.classify429("groq", sig, 1, nowMs).code, "PROVIDER_TEMPORARILY_UNAVAILABLE");
});
await checkAsync("G18 integration: daily-quota 429 on both providers stops the batch, records the reset, second call makes zero provider calls", async () => {
  resetTest();
  const mock = makeMock([
    groqError(429, "quota exhausted", {
      "x-ratelimit-remaining-requests": "0",
      "x-ratelimit-reset-requests": "6h0m0s",
    }),
    geminiError(429, "quota exhausted", "7200s"),
  ]);
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof adapter.AiError && e.code === "FREE_QUOTA_EXHAUSTED",
  );
  assert.equal(mock.calls.length, 2);
  assert.ok(adapter.getQuotaBlockedUntil("groq") > nowMs);
  assert.ok(adapter.getQuotaBlockedUntil("gemini") > nowMs);
  // Second call: both providers are quota-blocked on this instance — zero calls.
  await assert.rejects(
    callAdapter(mock),
    (e) => e instanceof adapter.AiError && e.code === "FREE_QUOTA_EXHAUSTED",
  );
  assert.equal(mock.calls.length, 2);
});
await checkAsync("G18 integration: ambiguous 429 becomes provider-wide on the second attempt, then the secondary succeeds", async () => {
  resetTest();
  const mock = makeMock([
    groqError(429, "rate limited"),
    groqError(429, "rate limited"),
    groqError(429, "rate limited"),
    geminiOk({ explanation_bn: "ok" }),
  ]);
  const r = await callAdapter(mock);
  assert.equal(r.provider, "gemini");
  assert.equal(r.calls, 4);
});

// ---------------------------------------------------------------- G19: mock-only
check("G19 mock-only: only the two free providers exist in the configuration; no paid provider, no Lovable, no Anthropic", () => {
  assert.deepEqual([AI_CONFIG.primary.id, AI_CONFIG.secondary.id], ["groq", "gemini"]);
  const src = ["ai-config.ts", "ai-adapter.ts", "ai-gemini-client.ts", "ai-groq-client.ts"]
    .map((f) => readFileSync(join(funcsRoot, "_shared", f), "utf8"))
    .join("\n");
  assert.equal(/lovable/i.test(src), false, "no Lovable reference in the Adapter files");
  assert.equal(/anthropic/i.test(src), false, "no Anthropic reference in the Adapter files");
  assert.equal(/api\.openai\.com/i.test(src), false, "no OpenAI host in the Adapter files");
  assert.equal(/gpt-5|gpt-6|claude/i.test(src), false, "no unapproved model in the Adapter files");
  // The test keys are literal test values — the tests never read real secrets.
  assert.equal(testEnv.GEMINI_API_KEY, "test-gemini-key");
  assert.equal(testEnv.GROQ_API_KEY, "test-groq-key");
});

console.log = origLog;
rmSync(stageDir, { recursive: true, force: true });
console.log(`\nai-adapter tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) console.log(`failed: ${failures.join("; ")}`);
process.exit(failed ? 1 : 0);
