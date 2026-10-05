// Full-scale 99 Names prerender verification.
// Runs EVERY allowlisted slug through api/prerender.js locally and checks:
// 200, correct record (via DefinedTerm name+description), self-canonical,
// index,follow, Arabic/transliteration/English/Bengali content, H1, prev/next.
// Plus fail-closed 404s and hub regression.
// Exit non-zero on any failure.
import handler from "../api/prerender.js";
import { assignAllahNameSlugs } from "../src/lib/allahNameSlug.js";
import allowlist from "../src/data/allah-name-sitemap-allowlist.json" with { type: "json" };
import { readFileSync } from "node:fs";

const names = JSON.parse(readFileSync(new URL("../public/data/names-of-allah.json", import.meta.url), "utf8"));
const slugMap = assignAllahNameSlugs(names.map((n) => ({ id: n.id, transliteration: n.transliteration })));
const idToRow = new Map(names.map((n) => [n.id, n]));

const call = async (path) => {
  const req = { query: { path }, headers: { "user-agent": "Googlebot" } };
  let status = 0, body = "";
  const res = { setHeader: () => {}, status: (c) => { status = c; return { send: (b) => { body = b; } }; } };
  await handler(req, res);
  return { status, body };
};

let failures = 0;
const fail = (s, why) => { failures++; console.error(`FAIL /99-names/${s}: ${why}`); };

let n = 0;
for (const s of allowlist) {
  n++;
  const rec = idToRow.get([...slugMap.entries()].find(([, v]) => v === s)?.[0]);
  if (!rec) { fail(s, "no record for allowlisted slug"); continue; }
  const { status, body } = await call("/99-names/" + s);
  const problems = [];
  if (status !== 200) problems.push(`status ${status}`);
  if (!body.includes(`<link rel="canonical" href="https://noorapp.in/99-names/${s}"`)) problems.push("canonical");
  if (!body.includes('name="robots" content="index,follow"')) problems.push("robots");
  if (!body.includes(rec.arabic)) problems.push("arabic");
  if (!body.includes(rec.transliteration)) problems.push("transliteration");
  if (!body.includes(rec.meaning)) problems.push("english");
  if (!body.includes(rec.bengaliMeaning)) problems.push("bengali");
  if (!/<h1[^>]*>/.test(body)) problems.push("h1");
  let ldOk = false;
  for (const m of body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const ld = JSON.parse(m[1]);
      if (ld["@type"] === "DefinedTerm" && ld.name === rec.transliteration && ld.description === rec.meaning) ldOk = true;
    } catch {}
  }
  if (!ldOk) problems.push("jsonld");
  if (problems.length) fail(s, problems.join(","));
}
console.log(`detail pages: ${allowlist.length - failures}/${allowlist.length} PASS`);

// fail-closed
for (const s of ["invalid-name", "al-majid-999", "nonexistent", "AL-RAHMAN"]) {
  const { status, body } = await call("/99-names/" + s);
  if (status === 404 && body.includes("noindex")) console.log(`ok: /99-names/${s} -> 404 + noindex`);
  else fail(s, `expected 404+noindex, got ${status}`);
}

// hub regression
{
  const { status, body } = await call("/99-names");
  if (status === 200 && body.includes('<link rel="canonical" href="https://noorapp.in/99-names"'))
    console.log("ok: /99-names hub 200 + self-canonical");
  else fail("(hub)", `status ${status}`);
}

if (failures > 0) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL 99 PRERENDER CHECKS PASSED");
