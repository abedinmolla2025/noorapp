// generate-dua-seo G-1 blocklist-validation tests — Phase 2 (2026-11-10),
// Part 2 re-stubbed for Phase 3 (2026-11-13): the handler now calls the
// Adapter (Gemini free primary / Groq free secondary) instead of the
// pre-migration gateway, so the stub returns Gemini-shaped tool-call
// responses and the env carries GEMINI_API_KEY / GROQ_API_KEY.
//
// Part 1: unit tests of validateGeneratedOutput / containsVirtueLanguage
// (VIRTUE_BLOCKLIST), extracted verbatim from index.ts (NODE_TESTABLE
// markers) and imported as .ts (Node 24 type-strips).
// Part 2: handler-level tests of the REAL staged index.ts (P0 base +
// G-1 candidate) with a fake Supabase + stubbed Gemini (via the Adapter):
// proves benefits_* are NEVER written to live rows even when the
// model returns virtue-laden benefits, and that a virtue-laden
// explanation blocks the whole row (zero writes, failed++, error
// mentions virtue_language_blocked).
//
// Run: node supabase/functions/generate-dua-seo/generate-dua-seo-g1.test.mjs
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
function check(name, fn) {
  try { fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

// ---------------------------------------------------------------- Part 1
const src = readFileSync(join(here, "index.ts"), "utf8");
const begin = "// --- NODE_TESTABLE_BEGIN ---";
const end = "// --- NODE_TESTABLE_END ---";
const bi = src.indexOf(begin);
const ei = src.indexOf(end);
if (bi === -1 || ei === -1 || ei <= bi) throw new Error("NODE_TESTABLE markers not found");
const stageDir = mkdtempSync(join(tmpdir(), "p2-g1-"));
writeFileSync(join(stageDir, "logic.ts"), src.slice(bi + begin.length, ei));
const { containsVirtueLanguage, validateGeneratedOutput } = await import(pathToFileURL(join(stageDir, "logic.ts")).href);

const clean = {
  explanation_bn: "এই দোয়ার অর্থ হলো আল্লাহর কাছে সাহায্য চাওয়া। আমরা শিখি ধৈর্য ধরতে।",
  explanation_en: "This dua is a request for help. It teaches patience.",
  explanation_hi: "यह दुआ मदद की प्रार्थना है।",
  explanation_ur: "یہ دعا مدد کی درخواست ہے۔",
};
check("clean explanations (bn/en/hi/ur) -> ok, no blocked fields", () => {
  assert.deepEqual(validateGeneratedOutput(clean), { ok: true, blockedFields: [] });
});
check("Bengali ফজিলত in explanation_bn -> blocked (bn only)", () => {
  const d = validateGeneratedOutput({ ...clean, explanation_bn: "এই দোয়ার ফজিলত অনেক বেশি।" });
  assert.equal(d.ok, false); assert.deepEqual(d.blockedFields, ["explanation_bn"]);
});
check("Bengali সওয়াব -> blocked", () => {
  assert.equal(containsVirtueLanguage("এই আমলে অনেক সওয়াব পাওয়া যায়।"), true);
});
check("Bengali জান্নাত -> blocked", () => {
  assert.equal(containsVirtueLanguage("যে এই দোয়া পড়বে সে জান্নাত পাবে।"), true);
});
check("Bengali গুনাহ মাফ -> blocked", () => {
  assert.equal(containsVirtueLanguage("এতে গুনাহ মাফ হয়ে যায়।"), true);
});
check("English 'will be forgiven' -> blocked", () => {
  assert.equal(containsVirtueLanguage("Whoever recites this will be forgiven."), true);
});
check("English 'virtue' (case-insensitive) -> blocked", () => {
  assert.equal(containsVirtueLanguage("The VIRTUE of this dua is great."), true);
});
check("English 'reward' -> blocked", () => {
  assert.equal(containsVirtueLanguage("You get a great reward for this."), true);
});
check("transliteration 'sawab' -> blocked", () => {
  assert.equal(containsVirtueLanguage("You earn sawab by reciting it."), true);
});
check("transliteration 'fazilat' -> blocked", () => {
  assert.equal(containsVirtueLanguage("The fazilat of this prayer is immense."), true);
});
check("ordinary religious vocabulary is NOT blocked (no false positive)", () => {
  assert.equal(containsVirtueLanguage("আল্লাহর রহমতে এই দোয়া পড়ুন।"), false);
  assert.equal(containsVirtueLanguage("This dua teaches patience and gratitude to Allah."), false);
});
check("multiple blocked fields are all reported", () => {
  const d = validateGeneratedOutput({ ...clean, explanation_bn: "ফজিলত অনেক।", explanation_en: "Great reward awaits." });
  assert.equal(d.ok, false); assert.deepEqual(d.blockedFields, ["explanation_bn", "explanation_en"]);
});
check("empty / missing explanations -> ok (nothing to block)", () => {
  assert.deepEqual(validateGeneratedOutput({}), { ok: true, blockedFields: [] });
});
check("prompt forbids virtue language explicitly in English, for all four languages (run #10 regression)", () => {
  // Run #10 (2026-11-14): Gemini generated virtue language in
  // explanation_en and the validator blocked the row
  // ("virtue_language_blocked (explanation_en)"). The prohibition was
  // Bengali-only, so the model did not reliably apply it to the
  // English output. The fix names the forbidden English terms
  // explicitly and states the rule applies to all four languages.
  // The validator (VIRTUE_BLOCKLIST) is UNCHANGED — this test pins
  // the prompt fix, not a weaker validator.
  const phrase = "virtue, reward, forgiven, forgiveness of sins, paradise, hellfire, guaranteed reward";
  assert.ok(src.includes(phrase), "prompt must name the forbidden English virtue terms");
  assert.ok(src.includes("চারটি ভাষার ব্যাখ্যাতেই সমানভাবে প্রযোজ্য"), "prompt must state the rule applies to all four languages");
  // The phrase must appear in BOTH prompts (dua + story).
  const count = src.split(phrase).length - 1;
  assert.equal(count, 2, `expected the English prohibition in both prompts, found ${count}`);
  // The tool description must also carry the prohibition (it is part of
  // the tool-call context the model sees).
  assert.ok(src.includes("No virtue, reward, forgiveness, paradise, or guaranteed-outcome claim in ANY language"), "tool description must carry the prohibition");
});

// ---------------------------------------------------------------- Part 2
const FAKE_SUPABASE = `
export const state = { tables: {}, writes: [] };
export function __reset(seed) { state.tables = JSON.parse(JSON.stringify(seed)); state.writes = []; }
function matches(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    if (f.op === "eq" && v !== f.val) return false;
    if (f.op === "in" && !f.val.includes(v)) return false;
  }
  return true;
}
function orMatches(row, orStr) {
  // Supports only the "field.is.null" / "field.is.not.null" clauses this edge uses.
  return orStr.split(",").some((clause) => {
    const [field, op, val] = clause.split(".");
    if (op === "is" && val === "null") return row[field] == null;
    if (op === "is" && val === "not") return row[field] != null;
    return false;
  });
}
class Builder {
  constructor(table) { this.table = table; this.filters = []; this.orStr = null; this.limitN = null; this.patch = null; this.head = false; }
  select(cols, opts) { this.head = !!opts?.head; return this; }
  eq(c, v) { this.filters.push({ op: "eq", col: c, val: v }); return this; }
  in(c, v) { this.filters.push({ op: "in", col: c, val: v }); return this; }
  or(s) { this.orStr = s; return this; }
  limit(n) { this.limitN = n; return this; }
  rows() {
    let rs = (state.tables[this.table] ?? []).filter((r) => matches(r, this.filters));
    if (this.orStr) rs = rs.filter((r) => orMatches(r, this.orStr));
    if (this.limitN != null) rs = rs.slice(0, this.limitN);
    return rs;
  }
  async maybeSingle() { const rs = this.rows(); return { data: rs[0] ?? null, error: null }; }
  async insert(row) { const rows = Array.isArray(row) ? row : [row]; state.tables[this.table] ??= []; for (const r of rows) state.tables[this.table].push({ ...r }); state.writes.push({ table: this.table, op: "insert" }); return { data: rows, error: null }; }
  update(patch) { this.patch = patch; return this; }
  then(resolve, reject) {
    try {
      if (this.patch) {
        const rs = this.rows();
        for (const r of rs) Object.assign(r, this.patch);
        state.writes.push({ table: this.table, op: "update", patch: { ...this.patch } });
        resolve({ data: rs, error: null });
        return;
      }
      resolve({ data: this.head ? [] : this.rows(), count: this.rows().length, error: null });
    } catch (e) { reject(e); }
  }
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

const hDir = join(stageDir, "handler");
mkdirSync(join(hDir, "_shared"), { recursive: true });
mkdirSync(join(hDir, "generate-dua-seo"), { recursive: true });
const g1Src = readFileSync(join(here, "index.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2.95.0", "../fake-supabase.mjs");
writeFileSync(join(hDir, "generate-dua-seo", "index.ts"), g1Src);
const adminSrc = readFileSync(join(funcsRoot, "_shared", "require-admin.ts"), "utf8")
  .replace("https://esm.sh/@supabase/supabase-js@2", "../fake-supabase.mjs");
writeFileSync(join(hDir, "_shared", "require-admin.ts"), adminSrc);
// Phase 3: the handler imports the Adapter; stage its real files too.
for (const f of ["ai-config.ts", "ai-adapter.ts", "ai-gemini-client.ts", "ai-groq-client.ts"]) {
  writeFileSync(join(hDir, "_shared", f), readFileSync(join(funcsRoot, "_shared", f), "utf8"));
}
writeFileSync(join(hDir, "fake-supabase.mjs"), FAKE_SUPABASE);

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  GEMINI_API_KEY: "test-gemini-key",
  GROQ_API_KEY: "test-groq-key",
};
let handler = null;
globalThis.Deno = {
  env: { get: (k) => (k in env ? env[k] : undefined) },
  serve: (fn) => { handler = fn; },
};
// Stubbed Gemini (the Adapter's primary): a queue of per-row tool-call
// outputs. The Adapter calls the real Gemini endpoint shape; assert it.
const gatewayQueue = [];
globalThis.fetch = async (url) => {
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent");
  const out = gatewayQueue.shift() ?? {
    explanation_bn: "clean bn", benefits_bn: ["clean benefit"],
    explanation_en: "clean en", benefits_en: ["clean benefit"],
    explanation_hi: "clean hi", benefits_hi: ["clean benefit"],
    explanation_ur: "clean ur", benefits_ur: ["clean benefit"],
  };
  const body = {
    candidates: [{ content: { parts: [{ functionCall: { name: "save_dua_seo", args: out } }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 600, totalTokenCount: 1800 },
  };
  return {
    ok: true, status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
};
await import(pathToFileURL(join(hDir, "generate-dua-seo", "index.ts")).href);
const fakeSupabase = await import(pathToFileURL(join(hDir, "fake-supabase.mjs")).href);
assert.ok(handler, "Deno.serve handler was not captured");

function seed() {
  return {
    admin_content: [
      { id: "dua-clean", title: "Dua Clean", category: "general", content_arabic: "AR", content: "BN", content_type: "dua", explanation_bn: null, benefits_bn: null, explanation_en: null, benefits_en: null, explanation_hi: null, benefits_hi: null, explanation_ur: null, benefits_ur: null },
      { id: "dua-virtue", title: "Dua Virtue", category: "general", content_arabic: "AR", content: "BN", content_type: "dua", explanation_bn: null, benefits_bn: null, explanation_en: null, benefits_en: null, explanation_hi: null, benefits_hi: null, explanation_ur: null, benefits_ur: null },
    ],
  };
}
function req(body, authHeader) {
  return {
    method: "POST",
    headers: { get: (n) => (String(n).toLowerCase() === "authorization" ? (authHeader ?? null) : null) },
    json: async () => body,
  };
}
async function call(body, authHeader) {
  const res = await handler(req(body, authHeader));
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

await checkAsync("handler: no-auth process call -> 401, zero writes", async () => {
  fakeSupabase.__reset(seed());
  const r = await call({ action: "process", batchSize: 10 }, null);
  assert.equal(r.status, 401);
  assert.equal(fakeSupabase.state.writes.length, 0);
});
await checkAsync("handler: clean explanations + virtue-laden benefits -> explanations written, benefits_* NEVER written", async () => {
  fakeSupabase.__reset(seed());
  gatewayQueue.length = 0;
  gatewayQueue.push(
    { // dua-clean: clean explanations, benefits full of virtue claims
      explanation_bn: "এই দোয়ার অর্থ হলো সাহায্য চাওয়া।", benefits_bn: ["অনেক ফজিলত পাওয়া যায়", "সওয়াব লাভ হয়"],
      explanation_en: "A request for help.", benefits_en: ["great reward"],
      explanation_hi: "मदद की प्रार्थना।", benefits_hi: ["बहुत सवाब"],
      explanation_ur: "مدد کی درخواست۔", benefits_ur: ["بہت ثواب"],
    },
    { // dua-virtue: virtue-laden Bengali explanation -> whole row blocked
      explanation_bn: "এই দোয়ার ফজিলত অনেক বেশি, পড়লে সওয়াব পাওয়া যায়।", benefits_bn: ["ফজিলত"],
      explanation_en: "A request for help.", benefits_en: ["reward"],
      explanation_hi: "मदद की प्रार्थना।", benefits_hi: ["x"],
      explanation_ur: "مدد کی درخواست۔", benefits_ur: ["x"],
    },
  );
  const r = await call({ action: "process", batchSize: 10 }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.processed, 1, `expected 1 processed, got ${JSON.stringify(r.data)}`);
  assert.equal(r.data.failed, 1);
  assert.ok(String(r.data.errors?.[0] ?? "").includes("virtue_language_blocked"), `error must name the block: ${JSON.stringify(r.data.errors)}`);
  const cleanRow = fakeSupabase.state.tables.admin_content.find((x) => x.id === "dua-clean");
  assert.equal(cleanRow.explanation_bn, "এই দোয়ার অর্থ হলো সাহায্য চাওয়া।");
  assert.equal(cleanRow.explanation_en, "A request for help.");
  assert.equal(cleanRow.benefits_bn, null, "benefits_bn must stay null (never written)");
  assert.equal(cleanRow.benefits_en, null, "benefits_en must stay null (never written)");
  assert.equal(cleanRow.benefits_hi, null);
  assert.equal(cleanRow.benefits_ur, null);
  const virtueRow = fakeSupabase.state.tables.admin_content.find((x) => x.id === "dua-virtue");
  assert.equal(virtueRow.explanation_bn, null, "blocked row: zero writes to explanation_bn");
  assert.equal(virtueRow.explanation_en, null, "blocked row: zero writes to explanation_en");
  assert.equal(virtueRow.benefits_bn, null, "blocked row: zero writes to benefits_bn");
  const updates = fakeSupabase.state.writes.filter((w) => w.op === "update");
  assert.equal(updates.length, 1, "exactly one row update overall");
  assert.equal("benefits_bn" in updates[0].patch, false);
  assert.equal("benefits_en" in updates[0].patch, false);
});
await checkAsync("handler: stats pending counts explanations only (benefits-null rows are not pending)", async () => {
  fakeSupabase.__reset(seed());
  // Give both rows explanations but leave benefits null: pending must be 0.
  for (const row of fakeSupabase.state.tables.admin_content) {
    row.explanation_bn = "x"; row.explanation_en = "x"; row.explanation_hi = "x"; row.explanation_ur = "x";
  }
  const r = await call({ action: "stats" }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 2);
  assert.equal(r.data.pending, 0);
});
await checkAsync("handler: virtue language in explanation_en blocks the row, zero writes (run #10 regression)", async () => {
  // Run #10 (2026-11-14): the live Gemini call returned an English
  // explanation containing virtue language and the validator blocked
  // the row ("virtue_language_blocked (explanation_en)"). This test
  // reproduces that exact failure mode with the stubbed AI and proves
  // the validator still catches English virtue language — the prompt
  // fix does NOT weaken the gate.
  fakeSupabase.__reset(seed());
  gatewayQueue.length = 0;
  gatewayQueue.push(
    { // dua-clean: clean in all four languages.
      explanation_bn: "এই দোয়ার অর্থ হলো সাহায্য চাওয়া।",
      explanation_en: "A request for help.",
      explanation_hi: "मदद की प्रार्थना।",
      explanation_ur: "مدد کی درخواست۔",
    },
    { // dua-virtue: clean Bengali, but the ENGLISH explanation carries
      // virtue language — the run #10 shape.
      explanation_bn: "এই দোয়ার অর্থ হলো সাহায্য চাওয়া।",
      explanation_en: "The virtue of this dua is immense; whoever recites it will be forgiven and granted paradise.",
      explanation_hi: "मदद की प्रार्थना।",
      explanation_ur: "مدد کی درخواست۔",
    },
  );
  const r = await call({ action: "process", batchSize: 10 }, "Bearer valid-admin-jwt");
  assert.equal(r.status, 200);
  assert.equal(r.data.processed, 1, `expected 1 processed, got ${JSON.stringify(r.data)}`);
  assert.equal(r.data.failed, 1);
  assert.ok(String(r.data.errors?.[0] ?? "").includes("virtue_language_blocked (explanation_en)"), `error must name the blocked field: ${JSON.stringify(r.data.errors)}`);
  const virtueRow = fakeSupabase.state.tables.admin_content.find((x) => x.id === "dua-virtue");
  assert.equal(virtueRow.explanation_bn, null, "blocked row: zero writes to explanation_bn");
  assert.equal(virtueRow.explanation_en, null, "blocked row: zero writes to explanation_en");
  assert.equal(virtueRow.explanation_hi, null, "blocked row: zero writes to explanation_hi");
  assert.equal(virtueRow.explanation_ur, null, "blocked row: zero writes to explanation_ur");
});

rmSync(stageDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
