/**
 * Adaptive long-hadith poster system (owner brief 2026-11-22).
 *
 * The single-page Layout C poster has a hard capacity: the Bengali panel
 * holds ~10 lines at the 18 px portrait floor (~11 at the 16 px square
 * floor) and the Arabic footnote cap holds ~4 lines at the 14 px floor.
 * Bukhari 81-6530 (1,365 Bengali chars) needs 24 portrait / 21 square
 * lines — ~2x too long — and failed both production poster days
 * (2026-11-21, 2026-11-22, `bengali_overflow_at_min`, rows
 * quarantined). This module decides, BEFORE rendering, how a hadith of
 * any length is presented — without cutting text, paraphrasing, or
 * dropping below the readability floors.
 *
 * Modes:
 *  - single: short; complete Arabic + Bengali on one 1080x1350 poster.
 *  - extended_single: medium; same one-poster geometry with the
 *    existing long-content chrome tightening, only when the complete
 *    content genuinely fits (verified by the browser's measured fit).
 *  - multi_page: long; auto-split into coordinated 1080x1350 pages
 *    (2-3 target), split only at sentence/paragraph boundaries.
 *  - full_reading_link: exceptionally long (4+ pages); a readable
 *    introductory poster + a link to the complete Hadith page. The
 *    excerpt is always marked as an excerpt — never implied complete.
 *
 * Two-stage truth: layout SELECTION here uses a calibrated
 * character-per-line estimate (measured: portrait Bengali ~57
 * chars/line at the 18 px floor, square ~65 at 16 px, Arabic ~75 at
 * 14 px — with a x1.1 safety factor). The browser's `measureFit`
 * (real font metrics, per page) is the AUTHORITATIVE gate: a page
 * that overflows at its floor fails the render and the whole set is
 * held. The estimate is provisional; the measurement decides.
 *
 * PURE module: no DOM, no React, no I/O — fully unit-testable.
 * Text integrity: splitting never adds, drops, or reorders a single
 * character. `units.join("") === source` is the invariant, and
 * `verifyAdaptiveCoverage` proves it for every set.
 */
import {
  LONG_ARABIC_CHARS,
  LONG_BENGALI_CHARS,
  type OgFormat,
} from "./ogQc.js";

export type AdaptivePosterMode = "single" | "extended_single" | "multi_page" | "full_reading_link";

/** Multi-page sets target 2-3 pages; 4+ pages become the link mode. */
export const ADAPTIVE_MAX_PAGES = 3;

/**
 * Bengali lines that fit one page's hero panel at the floor size.
 * Measured (Bukhari 81-6530, 2026-11-21): portrait box 319 px holds
 * ~10 lines at 18 px (28.8 px/line, 32 px vertical padding); square
 * box 291 px holds ~11 lines at 16 px (24.8 px/line, 24 px padding).
 * 10 is the conservative budget for BOTH formats (portrait binding).
 */
export const BENGALI_LINES_PER_PAGE = 10;

/**
 * Arabic lines that fit one page's footnote cap at the 14 px floor.
 * Portrait cap box ~165 px holds (165-24)/24.5 ~= 5 lines; square cap
 * box ~118 px holds (118-20)/24.5 = 4 lines. 4 is the conservative
 * budget for BOTH formats (square binding).
 */
export const ARABIC_LINES_PER_PAGE = 4;

/** Calibrated chars-per-line at the floor sizes (see module header). */
export const BENGALI_CHARS_PER_LINE_FLOOR = 57;
export const ARABIC_CHARS_PER_LINE_FLOOR = 70;

/** Safety factor on the line estimate: over-estimating pages is safe
 * (the browser verifies); under-estimating fails a page at render. */
export const ESTIMATE_SAFETY_FACTOR = 1.1;

/** Sentence-final terminators. Bengali dari + ? ! . ; Arabic full stop + ? ! . */
const SENTENCE_TERMINATORS = new Set(["।", "?", "!", ".", "۔", "؟"]);

/**
 * Split text into sentence units. Each unit ends right after its
 * sentence terminator (trailing whitespace stays with the unit), and
 * paragraph breaks end a unit. A trailing fragment without a
 * terminator is its own unit. INVARIANT: units.join("") === text
 * exactly — no character is added, dropped, or reordered.
 */
export function splitIntoSentences(text: string): string[] {
  const units: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (SENTENCE_TERMINATORS.has(ch)) {
      // Include trailing whitespace (spaces/newlines) in this unit so
      // the join stays exact and the next unit starts clean.
      let end = i + 1;
      while (end < text.length && /\s/.test(text[end])) end++;
      units.push(text.slice(start, end));
      start = end;
      i = end - 1;
    } else if (ch === "\n") {
      // Paragraph break: hard boundary. The newline(s) stay with the
      // preceding unit; the next unit starts the new paragraph.
      let end = i + 1;
      while (end < text.length && text[end] === "\n") end++;
      // Only cut here if there is more text after the break.
      if (end < text.length) {
        units.push(text.slice(start, end));
        start = end;
        i = end - 1;
      }
    }
  }
  if (start < text.length) units.push(text.slice(start));
  return units.filter((u) => u.length > 0);
}

/** Estimated rendered lines for a text at the floor size (with margin). */
export function estimateLines(text: string, charsPerLine: number): number {
  if (text.trim().length === 0) return 0;
  return Math.max(1, Math.ceil((text.length / charsPerLine) * ESTIMATE_SAFETY_FACTOR));
}

/** True when a unit ends at a sentence terminator or paragraph break. */
export function endsAtSentenceBoundary(unit: string): boolean {
  const trimmed = unit.replace(/\s+$/, "");
  if (trimmed.length === 0) return false;
  return SENTENCE_TERMINATORS.has(trimmed[trimmed.length - 1]);
}

export type AdaptiveLayoutSelection = {
  mode: AdaptivePosterMode;
  /** Estimated page count for multi_page (1 for single/extended/link intro). */
  estimatedPages: number;
  estimatedBengaliLines: number;
  estimatedArabicLines: number;
  /** True when the content passed the long-content thresholds. */
  isLongContent: boolean;
  /** Reason string for the report/log (not rendered on a poster). */
  reason: string;
};

/**
 * Select the layout mode from measured-calibrated estimates.
 * `format` must be portrait or square — the daily poster flow renders
 * only those two; wide/story have no calibrated page budget.
 */
export function selectAdaptiveLayout(
  arabic: string,
  bengali: string,
  format: OgFormat,
): AdaptiveLayoutSelection {
  if (format !== "portrait" && format !== "square") {
    throw new Error(`adaptive layout unsupported for format: ${format}`);
  }
  const isLongContent = arabic.length > LONG_ARABIC_CHARS || bengali.length > LONG_BENGALI_CHARS;
  const estimatedBengaliLines = estimateLines(bengali, BENGALI_CHARS_PER_LINE_FLOOR);
  const estimatedArabicLines = estimateLines(arabic, ARABIC_CHARS_PER_LINE_FLOOR);
  const bengaliPages = Math.max(1, Math.ceil(estimatedBengaliLines / BENGALI_LINES_PER_PAGE));
  const arabicPages = Math.max(1, Math.ceil(estimatedArabicLines / ARABIC_LINES_PER_PAGE));
  const pages = Math.max(bengaliPages, arabicPages);
  if (pages <= 1) {
    if (!isLongContent) {
      return {
        mode: "single",
        estimatedPages: 1,
        estimatedBengaliLines,
        estimatedArabicLines,
        isLongContent,
        reason: "fits one page without long-content tightening",
      };
    }
    return {
      mode: "extended_single",
      estimatedPages: 1,
      estimatedBengaliLines,
      estimatedArabicLines,
      isLongContent,
      reason: "fits one page with long-content chrome tightening",
    };
  }
  if (pages <= ADAPTIVE_MAX_PAGES) {
    return {
      mode: "multi_page",
      estimatedPages: pages,
      estimatedBengaliLines,
      estimatedArabicLines,
      isLongContent,
      reason: `needs ${pages} pages at the floor sizes`,
    };
  }
  return {
    mode: "full_reading_link",
    estimatedPages: pages,
    estimatedBengaliLines,
    estimatedArabicLines,
    isLongContent,
    reason: `needs ${pages} pages (over the ${ADAPTIVE_MAX_PAGES}-page multi-page cap) — intro poster + full-reading link`,
  };
}

export type AdaptivePage = {
  /** 1-based page index. */
  index: number;
  /** Total pages in the set. */
  pageCount: number;
  /** This page's Arabic slice ("" when the Arabic ended on an earlier page). */
  arabic: string;
  /** This page's Bengali slice ("" only when the Bengali ended earlier — Arabic-heavy sets). */
  bengali: string;
  /** True when this page's Bengali slice was split at a word boundary (last resort). */
  hadWordSplit: boolean;
  /** True when every split into this page landed on a sentence/paragraph boundary. */
  cleanSplit: boolean;
};

/**
 * Split one text into word chunks that each fit the line budget.
 * Last resort only (a single sentence longer than a page): words are
 * never split mid-word. The chunks keep their inter-word spaces, so
 * chunks.join("") === the unit exactly.
 */
function splitUnitByWords(unit: string, budgetLines: number, charsPerLine: number): string[] {
  const words = unit.split(/(\s+)/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current + word;
    if (current !== "" && estimateLines(candidate, charsPerLine) > budgetLines) {
      chunks.push(current);
      // A word starting a chunk: strip its leading whitespace (it was
      // the separator); the join stays exact because the space was
      // already emitted at the end of the previous chunk.
      current = word.replace(/^\s+/, "");
    } else {
      current = candidate;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks.length > 0 ? chunks : [unit];
}

/**
 * Greedy-pack sentence units into the fewest pages whose estimated
 * lines stay within the budget. Lines are estimated on the JOINED
 * page text (not summed per unit — a short sentence costs a fraction
 * of a line, not a whole one). Returns one entry per page (each a
 * list of units). A unit longer than a whole page is word-split
 * (flagged) rather than dropped or clipped.
 */
function packUnits(
  units: string[],
  budgetLines: number,
  charsPerLine: number,
): { pages: string[][]; hadWordSplit: boolean } {
  const pages: string[][] = [[]];
  let currentText = "";
  let hadWordSplit = false;
  const pushToCurrent = (chunk: string): void => {
    pages[pages.length - 1].push(chunk);
    currentText += chunk;
  };
  for (const unit of units) {
    if (estimateLines(unit, charsPerLine) > budgetLines) {
      hadWordSplit = true;
      const chunks = splitUnitByWords(unit, budgetLines, charsPerLine);
      for (const chunk of chunks) {
        if (currentText !== "" && estimateLines(currentText + chunk, charsPerLine) > budgetLines) {
          pages.push([]);
          currentText = "";
        }
        pushToCurrent(chunk);
      }
      continue;
    }
    if (currentText !== "" && estimateLines(currentText + unit, charsPerLine) > budgetLines) {
      pages.push([]);
      currentText = "";
    }
    pushToCurrent(unit);
  }
  return { pages, hadWordSplit };
}

export type AdaptiveSplitResult = {
  mode: AdaptivePosterMode;
  pages: AdaptivePage[];
  /** Page count the selection estimated (matches pages.length for multi_page). */
  estimatedPages: number;
  /** True when any page needed the word-split fallback. */
  hadWordSplit: boolean;
};

/**
 * Split a hadith into adaptive pages. The page count is the max of the
 * Bengali and Arabic pack counts (each packed at its own budget); the
 * shorter text is padded with empty trailing pages — i.e. a short
 * Arabic stays on page 1 (with the start of the Bengali) and later
 * pages carry Bengali only, which is how the Arabic stays with the
 * beginning of its translation. Page numbering is 1-based across the
 * set; every page carries the same source line (rendered by the card).
 */
export function splitAdaptivePages(
  arabic: string,
  bengali: string,
  format: OgFormat,
): AdaptiveSplitResult {
  const selection = selectAdaptiveLayout(arabic, bengali, format);
  if (selection.mode === "single" || selection.mode === "extended_single") {
    return {
      mode: selection.mode,
      pages: [
        {
          index: 1,
          pageCount: 1,
          arabic,
          bengali,
          hadWordSplit: false,
          cleanSplit: true,
        },
      ],
      estimatedPages: 1,
      hadWordSplit: false,
    };
  }
  if (selection.mode === "full_reading_link") {
    return {
      mode: "full_reading_link",
      pages: [buildIntroPage(arabic, bengali)],
      estimatedPages: selection.estimatedPages,
      hadWordSplit: false,
    };
  }
  const bnPack = packUnits(splitIntoSentences(bengali), BENGALI_LINES_PER_PAGE, BENGALI_CHARS_PER_LINE_FLOOR);
  const arPack = packUnits(splitIntoSentences(arabic), ARABIC_LINES_PER_PAGE, ARABIC_CHARS_PER_LINE_FLOOR);
  const pageCount = Math.max(bnPack.pages.length, arPack.pages.length);
  const hadWordSplit = bnPack.hadWordSplit || arPack.hadWordSplit;
  const pages: AdaptivePage[] = [];
  for (let i = 0; i < pageCount; i++) {
    const bnUnits = bnPack.pages[i] ?? [];
    const arUnits = arPack.pages[i] ?? [];
    const bnText = bnUnits.join("");
    const arText = arUnits.join("");
    // Clean split: every unit boundary that ENDS a non-final page is a
    // sentence/paragraph boundary (word-split chunks are the exception).
    const cleanSplit =
      !hadWordSplit &&
      (i === pageCount - 1 ||
        (bnUnits.length === 0 || endsAtSentenceBoundary(bnUnits[bnUnits.length - 1])) &&
          (arUnits.length === 0 || endsAtSentenceBoundary(arUnits[arUnits.length - 1])));
    pages.push({
      index: i + 1,
      pageCount,
      arabic: arText,
      bengali: bnText,
      hadWordSplit,
      cleanSplit,
    });
  }
  return { mode: "multi_page", pages, estimatedPages: pageCount, hadWordSplit };
}

/**
 * Intro page for the full_reading_link mode: the first sentences up to
 * one page's budget, ending at a sentence boundary. The excerpt is a
 * sentence-aligned PREFIX of the source — never a mid-sentence cut —
 * and the card must mark it as an excerpt with the full-reading link.
 */
export function buildIntroPage(arabic: string, bengali: string): AdaptivePage {
  const takeFirstPage = (text: string, budgetLines: number, charsPerLine: number): string => {
    const units = splitIntoSentences(text);
    let taken = "";
    let lines = 0;
    for (const unit of units) {
      const unitLines = estimateLines(unit, charsPerLine);
      if (lines > 0 && lines + unitLines > budgetLines) break;
      taken += unit;
      lines += unitLines;
      if (lines >= budgetLines) break;
    }
    return taken;
  };
  return {
    index: 1,
    pageCount: 1,
    arabic: takeFirstPage(arabic, ARABIC_LINES_PER_PAGE, ARABIC_CHARS_PER_LINE_FLOOR),
    bengali: takeFirstPage(bengali, BENGALI_LINES_PER_PAGE, BENGALI_CHARS_PER_LINE_FLOOR),
    hadWordSplit: false,
    cleanSplit: true,
  };
}

export type AdaptiveCoverageCheck = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Set-level QC: prove the pages carry the source text COMPLETELY —
 * joined page slices must equal the source exactly (no missing or
 * duplicated sentences), no page is empty in both languages, page
 * order/numbering is sequential, and every split is clean unless the
 * word-split fallback was flagged. Any failure holds the WHOLE set.
 * For full_reading_link the pages are an excerpt by design: the check
 * then proves the excerpt is a sentence-aligned prefix (never a
 * mid-sentence cut) instead of complete coverage.
 */
export function verifyAdaptiveCoverage(
  arabic: string,
  bengali: string,
  result: AdaptiveSplitResult,
): AdaptiveCoverageCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (result.mode === "full_reading_link") {
    const intro = result.pages[0];
    if (!intro) {
      errors.push("link mode has no intro page");
      return { ok: false, errors, warnings };
    }
    if (!bengali.startsWith(intro.bengali) || !arabic.startsWith(intro.arabic)) {
      errors.push("intro page is not a prefix of the source text");
    }
    if (intro.bengali.length > 0 && !endsAtSentenceBoundary(intro.bengali)) {
      errors.push("intro Bengali does not end at a sentence boundary");
    }
    if (intro.arabic.length > 0 && !endsAtSentenceBoundary(intro.arabic)) {
      errors.push("intro Arabic does not end at a sentence boundary");
    }
    if (intro.bengali.trim().length === 0) errors.push("intro page has no Bengali text");
    return { ok: errors.length === 0, errors, warnings };
  }
  const joinedBengali = result.pages.map((p) => p.bengali).join("");
  const joinedArabic = result.pages.map((p) => p.arabic).join("");
  if (joinedBengali !== bengali) {
    errors.push("joined Bengali pages do not equal the source Bengali (missing or duplicated text)");
  }
  if (joinedArabic !== arabic) {
    errors.push("joined Arabic pages do not equal the source Arabic (missing or duplicated text)");
  }
  result.pages.forEach((page, i) => {
    if (page.index !== i + 1) errors.push(`page ${i + 1} has wrong index ${page.index}`);
    if (page.pageCount !== result.pages.length) {
      errors.push(`page ${page.index} declares pageCount ${page.pageCount}, set has ${result.pages.length}`);
    }
    if (page.arabic.trim().length === 0 && page.bengali.trim().length === 0) {
      errors.push(`page ${page.index} is empty in both languages`);
    }
    if (!page.cleanSplit) {
      warnings.push(`page ${page.index} split is not at a sentence boundary (word-split fallback)`);
    }
  });
  if (result.hadWordSplit) {
    warnings.push("word-split fallback was used: a single sentence exceeded one page");
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** Bengali digits for the on-poster page label (e.g. 2/3 -> "২/৩"). */
export function toBengaliDigits(n: number): string {
  const digits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n)
    .split("")
    .map((ch) => (ch >= "0" && ch <= "9" ? digits[Number(ch)] : ch))
    .join("");
}

/** On-poster page label for page `index` of `pageCount` (e.g. "২/৩"). */
export function adaptivePageLabel(index: number, pageCount: number): string {
  return `${toBengaliDigits(index)}/${toBengaliDigits(pageCount)}`;
}

/**
 * The finalized asset-set record for a multi-page hadith (brief §6).
 * No new columns: the set id IS the existing `poster:<date>` asset id,
 * page 1 stays the singular `poster_url` / `poster_storage_path` /
 * `poster_checksum` (so the whole existing chain works unchanged), and
 * pages 2+ live in the existing `poster_urls` / `poster_checksums`
 * jsonb maps under page keys (`portrait-p2`, `square-p3`, ...).
 */
export type AdaptiveAssetSet = {
  assetSetId: string;
  hadithRef: string;
  mode: AdaptivePosterMode;
  pageCount: number;
  /** Ordered page asset ids, e.g. `poster:<date>:portrait:p1`. */
  pageAssetIds: string[];
  /** Storage path per page asset, e.g. `daily-content-posters/<date>/portrait-p2.png`. */
  storagePaths: Record<string, string>;
  /** Public URL per page asset. */
  urls: Record<string, string>;
  /** SHA-256 checksum per page asset. */
  checksums: Record<string, string>;
  /** Per-page QC status (all "passed" — a set is only finalized when every page passes). */
  perPageQc: Record<string, "passed">;
  overallQc: "passed";
};

/** Page-key for the poster maps: base format, or `<format>-p<N>` for pages 2+. */
export function adaptivePageKey(format: OgFormat, pageIndex: number): string {
  return pageIndex <= 1 ? format : `${format}-p${pageIndex}`;
}

/** Storage object path for one page: `<date>/<format>.png` or `<date>/<format>-p<N>.png`. */
export function adaptivePageObjectPath(kolkataDate: string, format: OgFormat, pageIndex: number): string {
  return `${kolkataDate}/${adaptivePageKey(format, pageIndex)}.png`;
}

export function buildAdaptiveAssetSet(args: {
  kolkataDate: string;
  hadithRef: string;
  mode: AdaptivePosterMode;
  pageCount: number;
  /** poster_urls map (base + page keys) as stored by set_poster. */
  posterUrls: Record<string, string>;
  /** poster_checksums map (base + page keys) as stored by set_poster. */
  posterChecksums: Record<string, string>;
  formats: OgFormat[];
}): AdaptiveAssetSet {
  const { kolkataDate, hadithRef, mode, pageCount, posterUrls, posterChecksums, formats } = args;
  const pageAssetIds: string[] = [];
  const storagePaths: Record<string, string> = {};
  const urls: Record<string, string> = {};
  const checksums: Record<string, string> = {};
  const perPageQc: Record<string, "passed"> = {};
  for (const format of formats) {
    for (let page = 1; page <= pageCount; page++) {
      const key = adaptivePageKey(format, page);
      const assetId = `poster:${kolkataDate}:${format}:p${page}`;
      pageAssetIds.push(assetId);
      storagePaths[assetId] = `daily-content-posters/${adaptivePageObjectPath(kolkataDate, format, page)}`;
      urls[assetId] = posterUrls[key] ?? "";
      checksums[assetId] = posterChecksums[key] ?? "";
      perPageQc[assetId] = "passed";
    }
  }
  return {
    assetSetId: `poster:${kolkataDate}`,
    hadithRef,
    mode,
    pageCount,
    pageAssetIds,
    storagePaths,
    urls,
    checksums,
    perPageQc,
    overallQc: "passed",
  };
}

/**
 * Validate a stored asset set (the shape `buildAdaptiveAssetSet`
 * produces): every page asset has a URL + a 64-hex checksum, the
 * portrait page-1 URL matches the singular poster_url, and the page
 * count matches the keys present. Used by the workflow finalize step
 * and (via the gate) by publish.
 */
export function checkAdaptiveAssetSet(
  set: AdaptiveAssetSet,
  posterUrl: string,
  formats: OgFormat[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (set.pageCount < 1 || set.pageCount > ADAPTIVE_MAX_PAGES) {
    errors.push(`pageCount ${set.pageCount} is outside 1..${ADAPTIVE_MAX_PAGES}`);
  }
  for (const format of formats) {
    for (let page = 1; page <= set.pageCount; page++) {
      const assetId = `poster:${set.assetSetId.slice("poster:".length)}:${format}:p${page}`;
      const url = set.urls[assetId];
      const sum = set.checksums[assetId];
      if (!url) errors.push(`missing URL for ${assetId}`);
      if (!sum || !/^[0-9a-f]{64}$/.test(sum)) errors.push(`missing/invalid checksum for ${assetId}`);
    }
  }
  const portraitP1 = set.urls[`poster:${set.assetSetId.slice("poster:".length)}:portrait:p1`];
  if (portraitP1 !== posterUrl) {
    errors.push("portrait page-1 URL does not match the singular poster_url");
  }
  return { ok: errors.length === 0, errors };
}

/** Layout C table sanity for the adaptive budgets (used by tests). */
export function adaptiveBudgetFor(format: OgFormat): { bengaliLines: number; arabicLines: number } {
  if (format !== "portrait" && format !== "square") {
    throw new Error(`adaptive layout unsupported for format: ${format}`);
  }
  return { bengaliLines: BENGALI_LINES_PER_PAGE, arabicLines: ARABIC_LINES_PER_PAGE };
}
