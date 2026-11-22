#!/usr/bin/env node
/**
 * Poster render script — headless screenshot of the poster-render route.
 *
 * Usage:
 *   node scripts/daily-content/poster/render-poster.mjs \
 *     --url "http://127.0.0.1:8080/demo/daily-content/poster-render?date=2026-11-15&format=portrait" \
 *     --out /tmp/poster-2026-11-15-portrait.png
 *
 * Behaviour:
 *  - Launches Chromium (Playwright). Uses PLAYWRIGHT_CHROMIUM_PATH when
 *    set (local testing against a cached browser); otherwise the
 *    Playwright-managed browser (`npx playwright install chromium`).
 *  - Waits for the page's readiness signal
 *    (`document.documentElement.dataset.posterStatus === "ready"`).
 *    Any "error:*" status fails the run with the page's error message.
 *  - Reads the `#poster-status` JSON (date, format, recordRef,
 *    sourceLine, backgroundId, badgeLabel, qc, verbatimOk, exportSize,
 *    plus `visual` — the Phase 2 Visual Intelligence selection:
 *    topic/concept/scene, semantic score, match/safety flags — and
 *    `fit`, the measured fit record: fitted sizes, line counts and
 *    spare px for both auto-fit blocks — plus `adaptive` for
 *    multi-page renders: mode, pageIndex, pageCount, coverage).
 *  - Screenshots the `#poster-stage` element at deviceScaleFactor 2.
 *  - Verifies the PNG's IHDR dimensions equal the expected export size
 *    (ogExportSize) and that the file is non-trivially large.
 *  - Prints a single JSON result line on stdout; exits non-zero on any
 *    failure. Never writes a poster file on failure (a stale/partial
 *    file is deleted if one exists at --out).
 *  - Bounded retry (Phase 3 — Hold/Quarantine + self-healing): a
 *    TRANSIENT failure (browser launch crash, navigation timeout,
 *    wait timeout) is retried ONCE with a fresh browser (max 2
 *    attempts, 5 s apart). A DETERMINISTIC failure is never retried:
 *    `poster_page_error:*` (the page's own QC/fit/visual-hold
 *    decision), `dimension_mismatch:*`, `poster_too_small:*`. The
 *    result JSON carries `attempts` (1 or 2) so the workflow log
 *    shows whether a retry happened.
 *
 * The script renders exactly what the page renders — it never invents
 * or edits religious text. All text comes from the publication row
 * (via the page) verbatim.
 */
import fs from "node:fs";
import { chromium } from "playwright";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

/** Read PNG IHDR width/height without any image library. */
function pngDimensions(path) {
  const buf = fs.readFileSync(path);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not_a_png");
  if (buf.toString("ascii", 12, 16) !== "IHDR") throw new Error("png_missing_ihdr");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

const url = arg("--url");
const out = arg("--out");
const timeoutMs = Number(arg("--timeout-ms", "60000"));
if (!url || !out) {
  console.error("usage: render-poster.mjs --url <render-page-url> --out <png-path> [--timeout-ms 60000]");
  process.exit(2);
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

// Deterministic failures — the page's own decision (QC, fit, visual
// hold) or a render defect. Retrying cannot fix these; a retry would
// only burn time and hide the real reason. Everything else (launch
// crash, navigation/timeout, browser closed mid-flight) is transient
// and gets one retry with a fresh browser.
const DETERMINISTIC_ERROR_PREFIXES = ["poster_page_error:", "dimension_mismatch:", "poster_too_small:"];
const isDeterministic = (msg) => DETERMINISTIC_ERROR_PREFIXES.some((p) => msg.startsWith(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function renderOnce() {
  let browser = null;
  try {
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Wait for the page's own readiness signal (fonts + images loaded).
    // NOTE: waitForFunction's signature is (fn, arg, options) — the
    // timeout MUST be the 3rd argument. Passing it 2nd silently treats
    // it as the function's arg and the wait falls back to Playwright's
    // 30 s default, which the font/image/autofit deadlines can exceed
    // when webfonts are unreachable (fixed 2026-11-17, Phase 2).
    await page.waitForFunction(
      () => ["ready", "error"].includes(document.documentElement.dataset.posterStatus || ""),
      undefined,
      { timeout: timeoutMs },
    );
    const statusJson = await page.locator("#poster-status").innerText();
    const status = JSON.parse(statusJson);
    if (status.status !== "ready") {
      throw new Error(`poster_page_error:${status.error ?? "unknown"}`);
    }
    const stage = page.locator("#poster-stage");
    await stage.waitFor({ state: "visible", timeout: timeoutMs });
    if (fs.existsSync(out)) fs.unlinkSync(out);
    await stage.screenshot({ path: out });
    const dims = pngDimensions(out);
    const expected = status.exportSize;
    if (dims.width !== expected.width || dims.height !== expected.height) {
      throw new Error(`dimension_mismatch: got ${dims.width}x${dims.height}, expected ${expected.width}x${expected.height}`);
    }
    if (dims.bytes < 20000) throw new Error(`poster_too_small:${dims.bytes} bytes (likely blank render)`);
    return {
      ok: true,
      out,
      width: dims.width,
      height: dims.height,
      bytes: dims.bytes,
      kolkataDate: status.kolkataDate,
      format: status.format,
      layout: status.layout ?? "c",
      source: status.source,
      recordRef: status.recordRef,
      sourceLine: status.sourceLine,
      backgroundId: status.backgroundId,
      backgroundScene: status.backgroundScene,
      visual: status.visual ?? null,
      badgeLabel: status.badgeLabel,
      pronunciationStatus: status.pronunciationStatus ?? null,
      fitSize: status.fitSize ?? null,
      arabicFitSize: status.arabicFitSize ?? null,
      fit: status.fit ?? null,
      adaptive: status.adaptive ?? null,
      qc: status.qc,
      verbatimOk: status.verbatimOk,
    };
  } finally {
    if (browser) await browser.close();
  }
}

let lastError = null;
let attempts = 0;
for (let attempt = 1; attempt <= 2; attempt++) {
  attempts = attempt;
  try {
    const result = await renderOnce();
    console.log(JSON.stringify({ ...result, attempts: attempt }));
    process.exit(0);
  } catch (e) {
    lastError = e;
    const msg = e instanceof Error ? e.message : String(e);
    if (isDeterministic(msg)) break;
    if (attempt === 2) break;
    console.error(JSON.stringify({ ok: false, error: msg, attempt, retrying: true }));
    await sleep(5000);
  }
}
if (out && fs.existsSync(out)) fs.unlinkSync(out);
console.error(JSON.stringify({ ok: false, error: lastError instanceof Error ? lastError.message : String(lastError), attempts }));
process.exit(1);
