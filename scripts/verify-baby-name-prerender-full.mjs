// Full-scale baby-name prerender verification (mass rollout).
// Runs EVERY allowlisted slug through api/prerender.js locally and checks:
// 200, correct record (via DefinedTerm name+description), self-canonical,
// index,follow, Arabic/Bengali/English content, H1. Plus fail-closed 404s.
// Exit non-zero on any failure.
import handler from "../api/prerender.js";
import { assignBabyNameSlugs } from "../src/lib/babyNameSlug.js";
import allowlist from "../src/data/baby-name-sitemap-allowlist.json" with { type: "json" };
import { readFileSync } from "node:fs";

const rows = JSON.parse(readFileSync("/tmp/baby-names-mass.json", "utf8"));
const slugMap = assignBabyNameSlugs(rows.map((r) => ({ id: String(r.id), title: r.title })));
const idToRow = new Map(rows.map((r) => [String(r.id), r]));

const call = async (path) => {
  const req = { query: { path }, headers: { "user-agent": "Googlebot" } };
  let status = 0, body = "";
  const res = { setHeader: () => {}, status: (c) => { status = c; return { send: (b) => { body = b; } }; } };
  await handler(req, res);
  return { status, body };
};

let failures = 0;
const fail = (s, why) => { failures++; console.error(`FAIL /baby-names/${s}: ${why}`); };

let n = 0;
for (const s of allowlist) {
  n++;
  const rec = idToRow.get([...slugMap.entries()].find(([, v]) => v === s)?.[0]);
  if (!rec) { fail(s, "no record for allowlisted slug"); continue; }
  const { status, body } = await call("/baby-names/" + s);
  const problems = [];
  if (status !== 200) problems.push(`status ${status}`);
  if (!body.includes(`<link rel="canonical" href="https://noorapp.in/baby-names/${s}"`)) problems.push("canonical");
  if (!body.includes('name="robots" content="index,follow"')) problems.push("robots");
  if (!body.includes(rec.title_arabic)) problems.push("arabic");
  if (!body.includes(rec.content)) problems.push("bengali");
  if (!body.includes(String(rec.content_en).slice(0, 25))) problems.push("english");
  if (!/<h1[^>]*>/.test(body)) problems.push("h1");
  let ldOk = false;
  for (const m of body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const ld = JSON.parse(m[1]);
      if (ld["@type"] === "DefinedTerm" && ld.name === rec.title && ld.description === rec.content_en) ldOk = true;
    } catch {}
  }
  if (!ldOk) problems.push("jsonld");
  if (problems.length) fail(s, problems.join(","));
  if (n % 300 === 0) console.log(`... ${n}/${allowlist.length} checked`);
}
console.log(`detail pages: ${allowlist.length - failures}/${allowlist.length} PASS`);

// fail-closed
for (const s of ["abrar-2", "abrar-molla", "an-invalid-name-slug", "ABRAR"]) {
  const { status, body } = await call("/baby-names/" + s);
  if (status === 404 && body.includes("noindex")) console.log(`ok: /baby-names/${s} -> 404 + noindex`);
  else fail(s, `expected 404+noindex, got ${status}`);
}

// hub regression
{
  const { status, body } = await call("/baby-names");
  if (status === 200 && body.includes('<link rel="canonical" href="https://noorapp.in/baby-names"'))
    console.log("ok: /baby-names hub 200 + self-canonical");
  else fail("(hub)", `status ${status}`);
}

if (failures > 0) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL 1200 PRERENDER CHECKS PASSED");
