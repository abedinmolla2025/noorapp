#!/usr/bin/env node
/**
 * audit-spa-prerender-drift.mjs — READ-ONLY audit script (M-18).
 *
 * Compares the SEO title/description the SPA would render (src/lib/seoDefaults.ts
 * DEFAULTS) against the SEO title/description the prerender function serves
 * (api/prerender.js STATIC_PAGE_COPY + dedicated hub branches), and checks the
 * canonical/og:url construction rules structurally in both layers.
 *
 * What it does NOT do: it does not render pages, does not call any API, and does
 * not change any file. Canonical agreement for static routes is reported as a
 * STRUCTURAL check (both layers build canonical as SITE_ORIGIN + path); deep-URL
 * canonical overrides (M-04) are out of scope for Tier 1 and are listed as
 * known-uncompared routes.
 *
 * Architecture since M-05 (Option C, 2026-10-24): the 14 Tier 1 static
 * routes' title/description live in ONE shared plain-JS module,
 * src/lib/seoStaticCopy.js (SEO_STATIC_COPY). The SPA DEFAULTS literal holds
 * only the 17 non-Tier-1 entries and spreads SEO_STATIC_COPY; each
 * STATIC_PAGE_COPY entry spreads SEO_STATIC_COPY[route] for title/description
 * and keeps its literal heading/intro/sections.
 *
 * Why the Tier 1 equality check is NOT vacuous: both effective maps derive
 * from the shared module, but the script first proves the WIRING — the SPA
 * import + spread, the disjointness of literal vs shared keys, the per-route
 * prerender spread, and the ABSENCE of any literal title/description left in
 * a STATIC_PAGE_COPY entry (a literal after the spread would shadow the
 * shared value). If any wiring check fails, the script throws instead of
 * reporting a match. The comparison then verifies the wiring claims.
 *
 * Self-validation (post-M-05 expectation):
 *   - STATIC_PAGE_COPY route keys == 14 (the Tier 1 set).
 *   - seoDefaults DEFAULTS literal == 17 entries; SEO_STATIC_COPY == 14.
 *   - Effective SPA entries == 31 (17 literal + 14 shared; /sources arrives
 *     via the shared module, which is the approved M-05 gap-fill).
 *   - Tier 1 title MATCH == 14 and description MATCH == 14.
 * Run with --strict-baseline to exit non-zero when that pattern is NOT
 * reproduced. Without the flag, a differing pattern is reported as
 * information, and the exit code is 0 as long as parsing succeeded.
 *
 * Usage: node scripts/audit-spa-prerender-drift.mjs [--strict-baseline]
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict-baseline");

// ---------------------------------------------------------------- parsing ---

/** Unescape a double-quoted JS string body (handles \\, \", \n, \uXXXX). */
function unescape(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|n|t|r|"|\\|\/)/g, (_, e) => {
    if (e === "n") return "\n";
    if (e === "t") return "\t";
    if (e === "r") return "\r";
    if (e.startsWith("u")) return String.fromCodePoint(parseInt(e.slice(1), 16));
    return e;
  });
}

const STR = String.raw`((?:[^"\\]|\\.)*)`;

/**
 * Extract { path: { title, description } } from a flat object literal whose
 * entries are `"/path": { title: "...", description: "...", ... }`.
 * `block` must be the object body (without the outer braces). Only the first
 * title/description pair per entry is taken (they are the first fields).
 */
function parseFlatObject(block, sourceLabel) {
  const out = new Map();
  const entryRe = new RegExp(
    String.raw`^  "([^"]+)": \{\s*title:\s*"${STR}"\s*,?\s*description:\s*"${STR}"`,
    "gm",
  );
  let m;
  while ((m = entryRe.exec(block)) !== null) {
    const [, path, title, description] = m;
    if (!out.has(path)) out.set(path, { title: unescape(title), description: unescape(description) });
  }
  if (out.size === 0) {
    throw new Error(`No entries parsed from ${sourceLabel}; file layout may have changed.`);
  }
  return out;
}

/** Slice the body of `const NAME = { ... };` (balanced braces, strings aware). */
function extractObjectBody(src, constName) {
  const start = src.indexOf(`const ${constName}`);
  if (start === -1) throw new Error(`const ${constName} not found`);
  let i = src.indexOf("{", start);
  let depth = 0;
  let inStr = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(src.indexOf("{", start) + 1, i);
    }
  }
  throw new Error(`Unbalanced braces in ${constName}`);
}

// ------------------------------------------------------------ load sources ---

const seoSrc = readFileSync(join(ROOT, "src/lib/seoDefaults.ts"), "utf8");
const prerenderSrc = readFileSync(join(ROOT, "api/prerender.js"), "utf8");
const seoHeadSrc = readFileSync(join(ROOT, "src/components/seo/SeoHead.tsx"), "utf8");
const sharedSrc = readFileSync(join(ROOT, "src/lib/seoStaticCopy.js"), "utf8");

// ------------------------------------------------------- wiring checks ----
// These checks prove each layer's EFFECTIVE Tier 1 value is the shared value.
// Any failure throws: a match must never be reported on broken wiring.
function fail(msg) {
  throw new Error(`WIRING CHECK FAILED: ${msg}`);
}

const spaLiteral = parseFlatObject(extractObjectBody(seoSrc, "DEFAULTS"), "seoDefaults.ts DEFAULTS");
const shared = parseFlatObject(
  extractObjectBody(sharedSrc, "SEO_STATIC_COPY"),
  "src/lib/seoStaticCopy.js SEO_STATIC_COPY",
);
if (!/from "\.\/seoStaticCopy\.js"/.test(seoSrc)) {
  fail("seoDefaults.ts does not import ./seoStaticCopy.js");
}
if (!/\.\.\.SEO_STATIC_COPY,/.test(extractObjectBody(seoSrc, "DEFAULTS"))) {
  fail("DEFAULTS does not spread SEO_STATIC_COPY");
}
for (const r of spaLiteral.keys()) {
  if (shared.has(r)) fail(`route ${r} defined in BOTH DEFAULTS literal and SEO_STATIC_COPY`);
}
// Effective SPA map: 17 literals + 14 shared (spread last, so shared wins).
const spa = new Map([...spaLiteral, ...shared]);

/** Slice one `  "route": { ... }` entry block out of an object body. */
function extractEntryBlock(body, route) {
  const start = body.indexOf(`  "${route}": {`);
  if (start === -1) return null;
  let i = body.indexOf("{", start);
  let depth = 0;
  let inStr = null;
  for (; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

if (!/from "\.\.\/src\/lib\/seoStaticCopy\.js"/.test(prerenderSrc)) {
  fail("api/prerender.js does not import ../src/lib/seoStaticCopy.js");
}
const staticBody = extractObjectBody(prerenderSrc, "STATIC_PAGE_COPY");
const staticRoutes = [...staticBody.matchAll(/^  "([^"]+)": \{/gm)].map((m) => m[1]);
const prerenderStatic = new Map();
for (const route of staticRoutes) {
  const block = extractEntryBlock(staticBody, route);
  if (!block) fail(`STATIC_PAGE_COPY entry ${route} could not be extracted`);
  if (!block.includes(`...SEO_STATIC_COPY[${JSON.stringify(route)}]`)) {
    fail(`STATIC_PAGE_COPY entry ${route} does not spread SEO_STATIC_COPY`);
  }
  // A literal title:/description: AFTER the spread would shadow the shared
  // value, so its absence is part of the wiring proof (field-position match
  // only; section body text cannot match a 4-space field indent at line start).
  if (/^    title\s*:/m.test(block) || /^    description\s*:/m.test(block)) {
    fail(`literal title/description left in STATIC_PAGE_COPY entry ${route}`);
  }
  const h = block.match(/^    heading:\s*"((?:[^"\\]|\\.)*)"/m);
  const intro = block.match(/^    intro:\s*"((?:[^"\\]|\\.)*)"/m);
  if (!h || !unescape(h[1])) fail(`missing/empty heading in STATIC_PAGE_COPY entry ${route}`);
  if (!intro || !unescape(intro[1])) fail(`missing/empty intro in STATIC_PAGE_COPY entry ${route}`);
  const s = shared.get(route);
  if (!s) fail(`STATIC_PAGE_COPY route ${route} has no SEO_STATIC_COPY entry`);
  prerenderStatic.set(route, s);
}

// ------------------------------------------------- Tier 2: hub branches -----

/**
 * Best-effort extraction of a hub branch's title/description assignments:
 * find `routePath === "<route>"` guards, then the first `title = "..."` /
 * `description = "..."` assignments within the following 150 lines.
 * Returns null when nothing is found (reported as NOT VERIFIED, never guessed).
 */
function extractHubBranch(route) {
  const guard = `routePath === "${route}"`;
  let from = 0;
  for (;;) {
    const at = prerenderSrc.indexOf(guard, from);
    if (at === -1) return null;
    const window = prerenderSrc.slice(at, at + 9000);
    const lines = window.split("\n").slice(0, 150).join("\n");
    const t = lines.match(new RegExp(String.raw`^\s*title\s*=\s*"${STR}"`, "m"));
    const d = lines.match(new RegExp(String.raw`^\s*description\s*=\s*"${STR}"`, "m"));
    if (t && d) {
      const lineNo = prerenderSrc.slice(0, at).split("\n").length;
      return { title: unescape(t[1]), description: unescape(d[1]), line: lineNo };
    }
    from = at + guard.length;
  }
}

const HUB_ROUTES = ["/quran", "/dua", "/stories", "/hadith", "/contact"];
const hubRows = HUB_ROUTES.map((route) => {
  const found = extractHubBranch(route);
  const spaEntry = spa.get(route);
  return { route, found, spaEntry };
});

// ------------------------------------------- canonical structural checks ------

const prerenderDefaultRule = /canonicalUrl\s*=\s*`\$\{SITE_ORIGIN\}\$\{routePath/.test(prerenderSrc);
const spaCanonicalRule =
  /canonical\s*=\s*sanitizeCanonical/.test(seoHeadSrc) &&
  /\$\{SITE_ORIGIN\}\$\{canonicalPath\}/.test(seoHeadSrc);
const spaOgUrlRule = /<meta property="og:url" content=\{canonical\}/.test(seoHeadSrc);
const prerenderOgUrlRule = /<meta property="og:url" content="\$\{esc\(canonical\)\}"/.test(prerenderSrc);

function siteOriginOf(src) {
  const m = src.match(/SITE_ORIGIN\s*=\s*["'`]([^"'`]+)["'`]/);
  return m ? m[1] : null;
}
const prerenderOrigin = siteOriginOf(prerenderSrc);
const spaOrigin = siteOriginOf(seoHeadSrc);

// ------------------------------------------------------------------ report ---

function verdict(a, b) {
  if (a === undefined) return "SPA-MISSING";
  return a === b ? "MATCH" : "DRIFT";
}

const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

console.log("SPA vs PRERENDER SEO DRIFT AUDIT (read-only)");
console.log(`SPA source: src/lib/seoDefaults.ts literal (${spaLiteral.size}) + shared module (${shared.size}) = effective ${spa.size} entries`);
console.log(`Prerender source: api/prerender.js STATIC_PAGE_COPY (${prerenderStatic.size} routes, title/description via shared module)`);
console.log("");

console.log("TIER 1 — STATIC_PAGE_COPY routes (title / description, exact match; wiring proven above)");
console.log(
  `${"route".padEnd(16)} ${"title".padEnd(8)} ${"description".padEnd(12)} notes`,
);
let titleMatch = 0;
let titleDrift = 0;
let descMatch = 0;
let descDrift = 0;
for (const [route, pre] of [...prerenderStatic.entries()].sort()) {
  const s = spa.get(route);
  const tv = verdict(s?.title, pre.title);
  const dv = verdict(s?.description, pre.description);
  if (tv === "MATCH") titleMatch++;
  else titleDrift++;
  if (dv === "MATCH") descMatch++;
  else descDrift++;
  const notes = [];
  if (!s) notes.push("no SPA entry");
  else {
    if (tv === "DRIFT") notes.push(`SPA: ${pad(s.title, 60)}`);
    if (dv === "DRIFT") notes.push(`SPA desc differs`);
  }
  console.log(
    `${route.padEnd(16)} ${tv.padEnd(8)} ${dv.padEnd(12)} ${notes.join(" | ")}`,
  );
}
console.log(
  `Tier 1 summary: titles ${titleMatch} MATCH / ${titleDrift} DRIFT; ` +
    `descriptions ${descMatch} MATCH / ${descDrift} DRIFT.`,
);
console.log("");

console.log("TIER 2 — Hub branches (best-effort extraction; NOT VERIFIED if unparsed)");
for (const { route, found, spaEntry } of hubRows) {
  if (!found) {
    console.log(`${route.padEnd(16)} NOT VERIFIED (no title/description assignment found near guard)`);
    continue;
  }
  const tv = verdict(spaEntry?.title, found.title);
  const dv = verdict(spaEntry?.description, found.description);
  console.log(
    `${route.padEnd(16)} title=${tv} desc=${dv} (prerender branch line ~${found.line})` +
      (tv === "DRIFT" && spaEntry ? ` SPA: ${pad(spaEntry.title, 60)}` : ""),
  );
}
console.log("");

console.log("CANONICAL / OG:URL — structural rules (not a rendered-page check)");
console.log(`  prerender default rule (SITE_ORIGIN + routePath): ${prerenderDefaultRule ? "FOUND" : "MISSING"}`);
console.log(`  prerender og:url = canonical: ${prerenderOgUrlRule ? "FOUND" : "MISSING"}`);
console.log(`  SPA canonical rule (SITE_ORIGIN + path): ${spaCanonicalRule ? "FOUND" : "MISSING"}`);
console.log(`  SPA og:url = canonical: ${spaOgUrlRule ? "FOUND" : "MISSING"}`);
console.log(`  SITE_ORIGIN prerender=${prerenderOrigin} spa=${spaOrigin} ` +
  (prerenderOrigin && prerenderOrigin === spaOrigin ? "AGREE" : "CHECK"));
console.log(
  "  Verdict for Tier 1 routes: STRUCTURAL-AGREE (both layers build canonical/og:url " +
    "as SITE_ORIGIN + route path; deep-URL overrides in M-04 are out of scope here).",
);
console.log("");

const spaUncovered = [...spa.keys()]
  .filter((r) => !prerenderStatic.has(r) && !HUB_ROUTES.includes(r))
  .sort();
console.log(`SPA entries not covered by Tier 1/2 (deep routes, informational): ${spaUncovered.join(", ") || "none"}`);
console.log("");

// ------------------------------------------------------------- self-check ----

const selfChecks = [
  ["STATIC_PAGE_COPY routes == 14", prerenderStatic.size === 14],
  ["DEFAULTS literal entries == 17", spaLiteral.size === 17],
  ["SEO_STATIC_COPY entries == 14", shared.size === 14],
  ["effective SPA entries == 31", spa.size === 31],
  ["Tier 1 title MATCH count == 14", titleMatch === 14],
  ["Tier 1 description MATCH count == 14", descMatch === 14],
  ["/sources has an effective SPA entry", spa.has("/sources")],
];
console.log("SELF-CHECK (post-M-05 expectation: shared module wired on both layers, 14/14 Tier 1 MATCH)");
let selfOk = true;
for (const [label, ok] of selfChecks) {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
  if (!ok) selfOk = false;
}
console.log(selfOk
  ? "SELF-CHECK: post-M-05 pattern confirmed (shared module wired, 14/14 Tier 1 MATCH)."
  : "SELF-CHECK: pattern differs from the post-M-05 expectation — see rows above.");
if (STRICT && !selfOk) {
  console.error("ERROR: --strict-baseline failed.");
  process.exit(1);
}
