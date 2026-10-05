// 99 Names of Allah slug contract verification.
//
// Validates, against the authoritative local dataset (public/data/names-of-allah.json):
//  1. 99 records, unique immutable ids, no missing required fields.
//  2. All 99 slugs unique, non-empty, URL-safe via src/lib/allahNameSlug.js.
//  3. Mandatory collision: al-majid -> id 48, al-majid-2 -> id 65.
//  4. Every allowlisted slug resolves to exactly one record; no silent drops.
//  5. The allowlist file is valid (non-empty array, slug-shaped, deduped).
//
// Exit non-zero on any failure. Run: node scripts/verify-allah-name-slugs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  slugifyAllahName,
  assignAllahNameSlugs,
  isValidAllahNameSlugSegment,
} from "../src/lib/allahNameSlug.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const fail = (msg) => { failures++; console.error(`FAIL: ${msg}`); };
const ok = (msg) => console.log(`ok: ${msg}`);

// --- authoritative dataset ---
const names = JSON.parse(fs.readFileSync(path.join(root, "public", "data", "names-of-allah.json"), "utf8"));
if (!Array.isArray(names) || names.length !== 99) fail(`expected 99 records, got ${Array.isArray(names) ? names.length : "non-array"}`);
else ok("99 records in authoritative dataset");
if (new Set(names.map((n) => n.id)).size !== 99) fail("duplicate ids");
else ok("99 unique immutable ids");
const missing = names.filter((n) => !n.id || !n.arabic || !n.transliteration || !n.meaning || !n.bengaliMeaning);
if (missing.length > 0) fail(`${missing.length} records missing required fields`);
else ok("no missing required fields");

// --- allowlist file ---
const allowlist = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "allah-name-sitemap-allowlist.json"), "utf8")
);
if (!Array.isArray(allowlist) || allowlist.length !== 99) fail("allowlist must have exactly 99 slugs");
else if (!allowlist.every(isValidAllahNameSlugSegment)) fail("allowlist has invalid slug");
else if (new Set(allowlist).size !== allowlist.length) fail("allowlist has duplicates");
else ok("allowlist valid (99 slugs)");

// --- slug assignment ---
const slugMap = assignAllahNameSlugs(names.map((n) => ({ id: n.id, transliteration: n.transliteration })));
if (slugMap.size !== 99) fail(`slug map size ${slugMap.size} != 99`);
const slugs = [...slugMap.values()];
if (slugs.some((s) => !isValidAllahNameSlugSegment(s))) fail("some slugs are not URL-safe");
if (new Set(slugs).size !== slugs.length) fail("slug collision after disambiguation");
else ok("all 99 slugs unique and URL-safe");

// every slug must round-trip: slugify(transliteration) is base or base+"-N"
for (const n of names) {
  const s = slugMap.get(n.id);
  const base = slugifyAllahName(n.transliteration);
  if (!(s === base || (base && s.startsWith(base + "-")))) fail(`slug mismatch for id ${n.id}`);
}
ok("all slugs derive deterministically from transliterations");

// --- mandatory collision ---
if (slugMap.get(48) !== "al-majid") fail(`id 48 must map to al-majid, got ${slugMap.get(48)}`);
if (slugMap.get(65) !== "al-majid-2") fail(`id 65 must map to al-majid-2, got ${slugMap.get(65)}`);
if (slugMap.get(48) === "al-majid" && slugMap.get(65) === "al-majid-2")
  ok("mandatory collision: al-majid -> 48, al-majid-2 -> 65");

// --- generic collision safety ---
{
  const byBase = new Map();
  for (const [id, s] of slugMap) {
    const base = s.replace(/-\d+$/, "");
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push({ id, s });
  }
  let groups = 0;
  for (const [base, members] of byBase) {
    if (members.length < 2) continue;
    groups++;
    const ordered = [...members].sort((a, b) => a.id - b.id);
    const want = ordered.map((m, i) => (i === 0 ? base : `${base}-${i + 1}`));
    const got = ordered.map((m) => m.s);
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(`collision pattern broken for ${base}`);
  }
  ok(`all ${groups} collision group(s) follow deterministic -2 pattern`);
}

// --- allowlist resolution: every allowlisted slug -> exactly one record ---
const slugToId = new Map([...slugMap.entries()].map(([id, s]) => [s, id]));
for (const s of allowlist) {
  const hits = names.filter((n) => slugMap.get(n.id) === s);
  if (hits.length !== 1) fail(`allowlisted slug /99-names/${s} resolves to ${hits.length} records`);
}
ok("all 99 allowlisted slugs resolve to exactly one record");

// --- no silent drops ---
{
  const allowed = new Set(allowlist);
  const dropped = [...slugMap.values()].filter((s) => !allowed.has(s));
  if (dropped.length > 0) fail(`silently dropped: ${dropped.join(", ")}`);
  else ok("no silent drops: all 99 mapped slugs allowlisted");
}

if (failures > 0) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL 99-NAME SLUG CHECKS PASSED");
