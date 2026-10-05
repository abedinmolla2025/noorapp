// Baby-name slug contract verification (2026-10-05).
//
// Validates, against LIVE data:
//  1. All published name records produce unique, non-empty, URL-safe slugs
//     via the canonical src/lib/babyNameSlug.js implementation.
//  2. Every allowlisted slug resolves to exactly one record (collision groups
//     verified: zahra/zahra-2, mina/mina-2, abdul-musawwir/-2, abdul-razzaq/-2).
//  3. The allowlist file is valid (non-empty array, slug-shaped, deduped).
//  4. No record that should be excluded is silently dropped (empty-slug check).
//
// Exit non-zero on any failure. Run: node scripts/verify-baby-name-slugs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  slugifyBabyName,
  assignBabyNameSlugs,
  isValidBabyNameSlugSegment,
} from "../src/lib/babyNameSlug.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://llicfiepatzgllmjhzbw.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0";

let failures = 0;
const fail = (msg) => { failures++; console.error(`FAIL: ${msg}`); };
const ok = (msg) => console.log(`ok: ${msg}`);

// --- allowlist file ---
const allowlist = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "baby-name-sitemap-allowlist.json"), "utf8")
);
if (!Array.isArray(allowlist) || allowlist.length === 0) fail("allowlist empty/missing");
else if (!allowlist.every(isValidBabyNameSlugSegment)) fail("allowlist has invalid slug");
else if (new Set(allowlist).size !== allowlist.length) fail("allowlist has duplicates");
else ok(`allowlist valid (${allowlist.length} slugs)`);

// --- live records ---
const queryBase = {
  select: "id,title",
  content_type: "eq.name",
  is_published: "eq.true",
  order: "created_at.asc",
  limit: "1000",
};
// Paginated: PostgREST clamps limit to 1000 rows.
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const query = new URLSearchParams({ ...queryBase, offset: String(offset) });
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/admin_content?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) { fail(`REST fetch failed: ${res.status}`); process.exit(1); }
  const batch = await res.json();
  rows.push(...batch);
  if (!Array.isArray(batch) || batch.length < 1000) break;
}
if (!Array.isArray(rows) || rows.length === 0) { fail("no name records returned"); process.exit(1); }
ok(`fetched ${rows.length} published name records`);

// --- slug assignment ---
const slugMap = assignBabyNameSlugs(rows.map((r) => ({ id: String(r.id), title: r.title })));
if (slugMap.size !== rows.length) fail(`slug map size ${slugMap.size} != row count ${rows.length}`);
const slugs = [...slugMap.values()];
if (slugs.some((s) => !isValidBabyNameSlugSegment(s))) fail("some slugs are not URL-safe");
if (new Set(slugs).size !== slugs.length) fail("slug collision after disambiguation");
else ok(`all ${slugs.length} slugs unique and URL-safe`);

// every slug must round-trip: slugify(title) is base or base+"-N"
for (const r of rows) {
  const s = slugMap.get(String(r.id));
  const base = slugifyBabyName(r.title);
  if (!(s === base || (base && s.startsWith(base + "-")))) fail(`slug mismatch for ${r.id}`);
}
ok("all slugs derive deterministically from titles");

// --- allowlist resolution ---
const slugToId = new Map([...slugMap.entries()].map(([id, s]) => [s, id]));
for (const s of allowlist) {
  const hits = rows.filter((r) => slugMap.get(String(r.id)) === s);
  if (hits.length !== 1) fail(`allowlisted slug /baby-names/${s} resolves to ${hits.length} records`);
}
ok(`all ${allowlist.length} allowlisted slugs resolve to exactly one record`);

// --- known collision groups ---
for (const base of ["zahra", "mina", "abdul-musawwir", "abdul-razzaq", "abrar"]) {
  const group = rows.filter((r) => slugMap.get(String(r.id)).startsWith(base));
  const got = group.map((r) => slugMap.get(String(r.id))).sort();
  const want = group.length === 1 ? [base] : [base, ...group.slice(1).map((_, i) => `${base}-${i + 2}`)];
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`collision group ${base}: got ${got}`);
}
ok("collision groups verified (zahra, mina, abdul-musawwir, abdul-razzaq, abrar)");

if (failures > 0) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL BABY-NAME SLUG CHECKS PASSED");
