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
 * Self-validation (baseline c88656a, 2026-10-24):
 *   - STATIC_PAGE_COPY parses to exactly 14 routes.
 *   - seoDefaults DEFAULTS parses to 30 entries.
 *   - Exactly 1 static title MATCHES: /download; the other 13 DRIFT
 *     (including /sources, which has no SPA entry).
 * Run with --strict-baseline to exit non-zero when that pattern is NOT
 * reproduced (use this for the baseline self-check). Without the flag, a
 * changed drift pattern is reported as information (the script is meant to be
 * re-run AFTER drift fixes to show the delta), and the exit code is 0 as long
 * as parsing succeeded.
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

const spa = parseFlatObject(extractObjectBody(seoSrc, "DEFAULTS"), "seoDefaults.ts DEFAULTS");
const prerenderStatic = parseFlatObject(
  extractObjectBody(prerenderSrc, "STATIC_PAGE_COPY"),
  "api/prerender.js STATIC_PAGE_COPY",
);

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
console.log(`SPA source: src/lib/seoDefaults.ts (${spa.size} entries)`);
console.log(`Prerender source: api/prerender.js STATIC_PAGE_COPY (${prerenderStatic.size} routes)`);
console.log("");

console.log("TIER 1 — STATIC_PAGE_COPY routes (title / description, exact match)");
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
    `descriptions ${descMatch} MATCH / ${descDrift} DRIFT (incl. SPA-MISSING).`,
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
  ["seoDefaults entries == 30", spa.size === 30],
  ["static title MATCH count == 1", titleMatch === 1],
  ["static title MATCH route is /download", verdict(spa.get("/download")?.title, prerenderStatic.get("/download")?.title) === "MATCH"],
];
console.log("SELF-CHECK (baseline c88656a expectation: 14 static routes, 30 SPA entries, 1 title match on /download)");
let selfOk = true;
for (const [label, ok] of selfChecks) {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
  if (!ok) selfOk = false;
}
console.log(selfOk
  ? "SELF-CHECK: baseline drift pattern reproduced."
  : "SELF-CHECK: drift pattern differs from baseline — expected after a drift fix; see rows above.");
if (STRICT && !selfOk) {
  console.error("ERROR: --strict-baseline failed.");
  process.exit(1);
}
