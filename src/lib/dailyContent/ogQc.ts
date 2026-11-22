/**
 * Quality gate for OG-style share cards.
 *
 * Photo backgrounds make numeric WCAG contrast meaningless (contrast is
 * carried by the card's dark scrim + glass panels + text shadow, and is
 * verified visually on real previews instead). What this gate CAN prove
 * exactly:
 *  - every rendered field equals the source record character-for-character,
 *  - no background repeats inside a batch while the catalog has spares,
 *  - no required field is empty,
 *  - long texts that need a visual fit check are flagged, never silently cut,
 *  - a measured fit record honours the Bengali/Arabic floors, has no
 *    overflow and no negative spare (checkOgFitRecord),
 *  - the layout's readability guarantees hold (floors, line heights,
 *    Arabic cap — checkOgReadabilityGuarantees).
 *
 * What it still CANNOT prove (needs human eyes on real previews):
 * numeric contrast of any text run, glyph-level shaping/diacritic
 * correctness, background-vs-text competition in a specific photograph,
 * or whether a scene is semantically right. Those are recorded in the
 * render JSON + the Phase 2 report as by-eye verdicts, never as
 * automated passes.
 */
import type { CardPayload } from "./types.js";

export const OG_STAGE_SIZE = {
  portrait: { width: 540, height: 675 },
  square: { width: 540, height: 540 },
  /** Website OG image 1200×630 at pixelRatio 2. */
  wide: { width: 600, height: 315 },
  /** Story / WhatsApp Status 1080×1920 at pixelRatio 2. */
  story: { width: 540, height: 960 },
} as const;

export type OgFormat = keyof typeof OG_STAGE_SIZE;

/**
 * Per-format layout. Portrait/square values are the exact numbers the
 * existing card already shipped with — they must not change, so the admin
 * previews render byte-identically to before. Wide/story are new
 * responsive compositions for their aspect ratios (wide is a horizontal
 * two-column layout; story is a tall centered stack with more air).
 */
export const OG_LAYOUT = {
  portrait: {
    padding: "28px 28px 30px", titleSize: 44, arabicSize: 30, bengaliSize: 22, pronunciationSize: 18,
    gap: 18, bodyPadding: "10px 0", arabicPadding: "16px 20px", horizontal: false,
  },
  square: {
    padding: "24px 26px 26px", titleSize: 36, arabicSize: 25, bengaliSize: 19, pronunciationSize: 16,
    gap: 14, bodyPadding: "6px 0", arabicPadding: "13px 18px", horizontal: false,
  },
  wide: {
    padding: "18px 22px 18px", titleSize: 26, arabicSize: 17, bengaliSize: 14, pronunciationSize: 12,
    gap: 10, bodyPadding: "4px 0", arabicPadding: "10px 14px", horizontal: true,
  },
  story: {
    padding: "32px 30px 34px", titleSize: 48, arabicSize: 32, bengaliSize: 24, pronunciationSize: 20,
    gap: 22, bodyPadding: "12px 0", arabicPadding: "18px 22px", horizontal: false,
  },
} as const satisfies Record<OgFormat, {
  padding: string; titleSize: number; arabicSize: number; bengaliSize: number; pronunciationSize: number;
  gap: number; bodyPadding: string; arabicPadding: string; horizontal: boolean;
}>;

/**
 * Bengali-first poster layouts (owner brief 2026-11-15: BENGALI TEXT
 * FIRST — Arabic Text Second). In every variant the Bengali translation
 * is the largest, primary section and gets most of the poster's space;
 * the Arabic original is second (smaller, never distorted, never
 * reworded); source/number/branding stay small but clear. "legacy" is
 * the original Arabic-first composition; its numbers above must not
 * change (admin previews render byte-identically). Variants a/b/c differ
 * in hierarchy and spacing only — all three omit the pronunciation block
 * entirely (rule 8: pronunciation/QC state lives in QC metadata only,
 * never on the poster). `bengaliSize` is the starting size; the card
 * auto-fits down to `bengaliMinSize` (never below) so a long translation
 * is never cut off (rules 6–7).
 *
 *  A — "Bengali Hero": Bengali in a large glass panel on top, Arabic in
 *      a compact panel below, source stays in the header badge.
 *  B — "Bengali Full-Bleed": Bengali bare on the scrim (no panel),
 *      Arabic in a framed citation band at the bottom, source moves to
 *      a footer pill.
 *  C — "Bengali Panel + Arabic Footnote": Bengali left-aligned in a
 *      glass panel with a gold accent bar, Arabic as a compact footnote
 *      under a hairline, source in a footer pill.
 */
export type BengaliFirstLayout = "a" | "b" | "c";
export type PosterLayout = "legacy" | BengaliFirstLayout;

export type BengaliFirstFormatLayout = {
  padding: string; titleSize: number; bengaliSize: number; bengaliMinSize: number;
  arabicSize: number; gap: number; bodyPadding: string; arabicPadding: string;
  /** True: source line stays in the header badge (variant A). False: source moves to a footer pill (B/C). */
  sourceInBadge: boolean;
  /**
   * Arabic auto-fit floor (px): the Arabic block shrinks toward this size
   * when the Arabic text is long. Never below this — if the Arabic still
   * does not fit its capped box at this size, the render fails loudly
   * rather than shipping a clipped or unreadable citation.
   */
  arabicMinSize: number;
  /**
   * Arabic height cap as a share of the body height (0–1). The Arabic
   * block never takes more than this share of the body: its box height is
   * therefore fixed from first paint, so the Bengali auto-fit measures
   * against its final geometry and the two fits never chase each other.
   * A short Arabic takes only its natural height (below the cap).
   */
  arabicCapShare: number;
};

export const BENGALI_FIRST_LAYOUT: Record<BengaliFirstLayout, Record<OgFormat, BengaliFirstFormatLayout>> = {
  a: {
    portrait: { padding: "26px 28px 26px", titleSize: 30, bengaliSize: 40, bengaliMinSize: 18, arabicSize: 20, gap: 14, bodyPadding: "8px 0", arabicPadding: "12px 16px", sourceInBadge: true, arabicMinSize: 13, arabicCapShare: 0.29 },
    square: { padding: "22px 26px 22px", titleSize: 26, bengaliSize: 34, bengaliMinSize: 16, arabicSize: 18, gap: 12, bodyPadding: "6px 0", arabicPadding: "10px 14px", sourceInBadge: true, arabicMinSize: 12, arabicCapShare: 0.25 },
    wide: { padding: "16px 20px 16px", titleSize: 22, bengaliSize: 26, bengaliMinSize: 13, arabicSize: 15, gap: 10, bodyPadding: "4px 0", arabicPadding: "8px 12px", sourceInBadge: true, arabicMinSize: 12, arabicCapShare: 0.30 },
    story: { padding: "30px 30px 30px", titleSize: 34, bengaliSize: 44, bengaliMinSize: 20, arabicSize: 22, gap: 18, bodyPadding: "10px 0", arabicPadding: "14px 18px", sourceInBadge: true, arabicMinSize: 18, arabicCapShare: 0.28 },
  },
  b: {
    portrait: { padding: "26px 28px 26px", titleSize: 22, bengaliSize: 44, bengaliMinSize: 18, arabicSize: 18, gap: 16, bodyPadding: "8px 0", arabicPadding: "12px 16px", sourceInBadge: false, arabicMinSize: 13, arabicCapShare: 0.29 },
    square: { padding: "22px 26px 22px", titleSize: 20, bengaliSize: 38, bengaliMinSize: 16, arabicSize: 16, gap: 12, bodyPadding: "6px 0", arabicPadding: "10px 14px", sourceInBadge: false, arabicMinSize: 12, arabicCapShare: 0.25 },
    wide: { padding: "16px 20px 16px", titleSize: 18, bengaliSize: 28, bengaliMinSize: 13, arabicSize: 14, gap: 10, bodyPadding: "4px 0", arabicPadding: "8px 12px", sourceInBadge: false, arabicMinSize: 12, arabicCapShare: 0.30 },
    story: { padding: "30px 30px 30px", titleSize: 26, bengaliSize: 48, bengaliMinSize: 20, arabicSize: 20, gap: 20, bodyPadding: "10px 0", arabicPadding: "14px 18px", sourceInBadge: false, arabicMinSize: 18, arabicCapShare: 0.28 },
  },
  c: {
    portrait: { padding: "26px 28px 26px", titleSize: 24, bengaliSize: 38, bengaliMinSize: 18, arabicSize: 18, gap: 14, bodyPadding: "8px 0", arabicPadding: "12px 16px", sourceInBadge: false, arabicMinSize: 14, arabicCapShare: 0.28 },
    square: { padding: "22px 26px 22px", titleSize: 22, bengaliSize: 32, bengaliMinSize: 16, arabicSize: 16, gap: 12, bodyPadding: "6px 0", arabicPadding: "10px 14px", sourceInBadge: false, arabicMinSize: 14, arabicCapShare: 0.25 },
    wide: { padding: "16px 20px 16px", titleSize: 20, bengaliSize: 26, bengaliMinSize: 13, arabicSize: 14, gap: 10, bodyPadding: "4px 0", arabicPadding: "8px 12px", sourceInBadge: false, arabicMinSize: 12, arabicCapShare: 0.30 },
    story: { padding: "30px 30px 30px", titleSize: 28, bengaliSize: 42, bengaliMinSize: 20, arabicSize: 20, gap: 18, bodyPadding: "10px 0", arabicPadding: "14px 18px", sourceInBadge: false, arabicMinSize: 18, arabicCapShare: 0.28 },
  },
} as const;

/**
 * Long-content thresholds (chars, measured on the stored record): the
 * real Bukhari 869 content is 420 Bengali / 331 Arabic chars, and the
 * short fixture is ~35 / ~20. A render past either threshold tightens
 * the fixed chrome so the two auto-fit blocks keep a readable margin.
 * The thresholds match the QC "long text" flags in checkOgCardBatch
 * (Arabic > 260, Bengali > 380).
 */
export const LONG_ARABIC_CHARS = 260;
export const LONG_BENGALI_CHARS = 380;

/** Shrink a "Vpx Hpx Vpx" (or "Vpx Hpx") padding string's vertical values by `by` px (floor 8). */
function tightenPadding(padding: string, by: number): string {
  const parts = padding.split(" ").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return padding;
  const tightened = parts.map((n, i) => {
    // 3-value form: top, horizontal, bottom. 2-value form: vertical, horizontal.
    const isVertical = parts.length === 3 ? i !== 1 : i === 0;
    return isVertical ? `${Math.max(8, n - by)}px` : `${n}px`;
  });
  return tightened.join(" ");
}

export type EffectiveBengaliFirstLayout = BengaliFirstFormatLayout & {
  /** True when either text passed its long-content threshold. */
  isLongContent: boolean;
  /** Arabic line height for this content (tighter when the Arabic is long). */
  arabicLineHeight: number;
  /** Bengali line height (1.65 normally; 1.55 for square long content — see below). */
  bengaliLineHeight: number;
  /** Vertical padding (px) inside the Bengali hero panel (16 normally). */
  panelPaddingV: number;
  /** Vertical padding (px) inside the source pill (6 normally). */
  sourcePillPaddingV: number;
  /**
   * Long content only: compact the header (smaller logo/badge) so the
   * body — and therefore the Bengali panel — gains ~8 px. False otherwise.
   */
  headerCompact: boolean;
  /**
   * Square-long only: omit the gold divider between title and Bengali
   * panel (frees the divider height + one gap, ~15 px). The title still
   * reads as an eyebrow above the panel; the divider is chrome, not
   * content. False otherwise.
   */
  hideDivider: boolean;
};

/**
 * Short poster content: BOTH texts short enough that the Bengali hero
 * fits at its base size with room to spare, so the panel may shrink to
 * its content instead of stretching (flex:1) across the whole body.
 * Threshold (120 chars each): at the base sizes (38 px portrait /
 * 32 px square) 120 Bengali chars wrap to at most ~5 lines (~315 px
 * incl. panel padding) — well under the smallest body allotment — so a
 * short panel can never overflow the stage. Anything longer keeps the
 * stretching panel and its auto-fit measurement, which is the only
 * mechanism that can detect a real overflow.
 */
export function isShortPosterContent(bengaliLen: number, arabicLen: number): boolean {
  return bengaliLen <= 120 && arabicLen <= 120;
}

/**
 * Arabic readability floor for Layout C (2026-11-17 Phase 2): 14 px.
 * Below 14 px Arabic diacritics blur at phone scale (28 px at the 2x
 * export) and the footnote stops being legible as a citation. The floor
 * is a minimum, never a target — 869 square already settled at 14 px
 * before this change; the floor now guarantees it instead of leaving
 * it to chance. Layouts A/B keep their own floors (13/12 px); only the
 * standard Layout C is raised. If an Arabic cannot fit its capped box
 * at 14 px the render FAILS (arabic_overflow_at_min) — the floor is
 * never silently lowered to make a render pass.
 */
export const ARABIC_MIN_SIZE_LAYOUT_C = 14;

/**
 * Effective sizes for one render: the table values, tightened when the
 * content is long. The tightening only touches fixed chrome (title,
 * gaps, padding, Arabic leading) — the Bengali/Arabic font sizes are
 * left to their auto-fit blocks, which measure the real geometry.
 * Short content returns the table values unchanged (no regression on
 * the fixture renders).
 *
 * Square long content gets EXTRA tightening (square-fit, 2026-11-17,
 * revised Phase 2 2026-11-17): the 2026-11-17 E2E proved square Layout
 * C cannot fit a long Bengali (Bukhari 66-5022, 538 chars) at the 16 px
 * minimum — the real Google webfont needs 9 lines where the local
 * fallback needs 8.5, and the square body leaves the Bengali panel
 * ~20 px short. The first fix's "~40 px freed / ~37 px spare" claim
 * did NOT reproduce in the Phase 1 audit's direct measurement (5022
 * square: panel 295.2 px, scrollHeight 293 px — 0 px spare), so it is
 * treated as unresolved and is NOT cited as proof here.
 *
 * Phase 2 funds the Bengali headroom from CHROME, never from the
 * Arabic: header compaction (~12 px) + divider omission (~15 px) +
 * Bengali line height 1.65 -> 1.55 (~7 px at 8.5 lines) ≈ +34 px of
 * panel spare locally. The Arabic cap is RESTORED 0.23 -> 0.25 (the
 * table value) because the Layout C Arabic floor rose 12 -> 14 px:
 * a 4-line Arabic at the 14 px minimum needs 4 x 14 x 1.75 = 98 px of
 * text + 20 px strip padding + 2 px border = 120 px, and the cap at
 * 0.25 of the (now taller, ~484 px) body is ~121 px — the cap still
 * binds, but it no longer makes a minimum-size Arabic geometrically
 * impossible. Bengali min size stays 16 px (readability floor, not
 * lowered); only chrome and line height move. Portrait/wide/story are
 * untouched. Local spare is indicative only: the real Google font
 * needs ~+13 px (half a line), so ~34 px local headroom is expected
 * to leave ~20 px in the workflow environment — the 2026-11-18
 * rehearsal E2E run is the only closing proof.
 */
export function effectiveBengaliFirstLayout(
  layout: BengaliFirstLayout,
  format: OgFormat,
  arabicLen: number,
  bengaliLen: number,
): EffectiveBengaliFirstLayout {
  const base = BENGALI_FIRST_LAYOUT[layout][format];
  const isLongContent = arabicLen > LONG_ARABIC_CHARS || bengaliLen > LONG_BENGALI_CHARS;
  if (!isLongContent) {
    return { ...base, isLongContent: false, arabicLineHeight: 1.9, bengaliLineHeight: 1.65, panelPaddingV: 16, sourcePillPaddingV: 6, headerCompact: false, hideDivider: false };
  }
  const tightened: EffectiveBengaliFirstLayout = {
    ...base,
    isLongContent: true,
    titleSize: Math.max(16, base.titleSize - 4),
    gap: Math.max(8, base.gap - 4),
    padding: tightenPadding(base.padding, 4),
    bodyPadding: "0px 0",
    arabicLineHeight: 1.75,
    bengaliLineHeight: 1.65,
    panelPaddingV: 16,
    sourcePillPaddingV: 6,
    headerCompact: false,
    hideDivider: false,
  };
  if (format === "square") {
    // Square long content: the short body is the binding constraint.
    // Tighten the chrome further (outer padding 22 -> 12 top/bottom,
    // title 18 -> 16, gaps 8 -> 6, panel padding 16 -> 12, pill
    // padding 6 -> 4) AND compact the header + omit the divider
    // (Phase 2: the headroom must come from chrome, not from the
    // Arabic — see the function comment). Bengali line height
    // 1.65 -> 1.55: still comfortable leading for 16 px Bengali
    // (24.8 px) and worth ~7 px across 8.5 lines. The Arabic cap
    // returns to the table value 0.25 (see comment above for why
    // 0.23 + a 14 px Arabic floor cannot both hold).
    tightened.titleSize = Math.max(16, base.titleSize - 6);
    tightened.gap = Math.max(6, base.gap - 6);
    tightened.padding = tightenPadding(base.padding, 10);
    tightened.arabicCapShare = 0.25;
    tightened.bengaliLineHeight = 1.55;
    tightened.panelPaddingV = 12;
    tightened.sourcePillPaddingV = 4;
    tightened.headerCompact = true;
    tightened.hideDivider = true;
  } else if (format === "portrait") {
    // Portrait long content (Phase 2): the Arabic footnote's new glass
    // strip costs the Bengali panel ~15 px (padding + border the old
    // hairline footnote did not have), and portrait Bengali was already
    // at -1 px spare in the audit — so long portrait overflowed at its
    // 18 px floor on the first Phase 2 render. Fund it from chrome
    // the same way: compact header (~8 px) + Bengali leading
    // 1.65 -> 1.6 (~9 px across 10 lines). The divider stays — portrait
    // has room for it once the header and leading pay for the strip.
    tightened.bengaliLineHeight = 1.6;
    tightened.headerCompact = true;
  }
  return tightened;
}

/**
 * Parse the `layout` query param: "legacy" | "a" | "b" | "c" stay as
 * given (explicit overrides, including legacy). Anything else —
 * including a missing param — is the standard template "c"
 * (Layout C — Bengali Panel + Arabic Footnote, Master Mission
 * Phase 2 decision 2026-11-16). Legacy is never the default: it
 * clips long Bengali and shows the forbidden pronunciation fallback.
 */
export function parsePosterLayout(value: string | null): PosterLayout {
  if (value === "legacy" || value === "a" || value === "b" || value === "c") return value;
  return "c";
}

/** Exact export pixels at the component's pixelRatio of 2. */
export function ogExportSize(format: OgFormat): { width: number; height: number } {
  const s = OG_STAGE_SIZE[format];
  return { width: s.width * 2, height: s.height * 2 };
}

export type OgCheck = { ok: boolean; errors: string[]; warnings: string[] };

type OgText = { title: string; arabic: string; bengali: string; sourceLine: string; pronunciation: string };

/** Character-exact comparison of rendered text against the source record. */
export function checkOgVerbatim(rendered: OgText, source: OgText): OgCheck {
  const errors: string[] = [];
  (["title", "arabic", "bengali", "sourceLine", "pronunciation"] as const).forEach((field) => {
    if (rendered[field] !== source[field]) errors.push(`${field} differs from source record`);
  });
  return { ok: errors.length === 0, errors, warnings: [] };
}

/** Batch checks: non-empty fields, background uniqueness, long-text flags.
 * `opts.pronunciationShown` is false for Bengali-first layouts, where no
 * pronunciation block is rendered at all (rule 8): the missing/unverified
 * state is then recorded as a metadata note, never as an on-poster
 * fallback warning. */
export function checkOgCardBatch(
  cards: CardPayload[],
  backgroundIds: string[],
  catalogSize: number,
  opts?: { pronunciationShown?: boolean },
): OgCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pronunciationShown = opts?.pronunciationShown !== false;
  cards.forEach((card, i) => {
    if (!card.title.trim()) errors.push(`card ${i}: empty title`);
    if (!card.arabic.trim()) errors.push(`card ${i}: empty arabic`);
    if (!card.bengali.trim()) errors.push(`card ${i}: empty bengali`);
    if (!card.sourceLine.trim()) errors.push(`card ${i}: empty reference`);
    if (card.arabic.length > 260 || card.bengali.length > 380) {
      warnings.push(`card ${i}: long text — verify fit visually (do not truncate)`);
    }
    if (pronunciationShown) {
      if ((card.pronunciation ?? "").length > 380) {
        warnings.push(`card ${i}: long pronunciation — verify fit visually (do not truncate)`);
      }
      if (card.pronunciationStatus === "missing") {
        warnings.push(`card ${i}: no pronunciation — poster shows the "যাচাই করা হয়নি" fallback`);
      }
    } else if (card.pronunciationStatus !== "verified") {
      warnings.push(`card ${i}: pronunciation ${card.pronunciationStatus ?? "missing"} — QC metadata only, not shown on poster`);
    }
  });
  const seen = new Set<string>();
  backgroundIds.forEach((id) => {
    if (seen.has(id)) {
      if (cards.length <= catalogSize) errors.push(`background ${id} repeats inside one batch`);
      else warnings.push(`background ${id} repeats: batch is larger than the catalog`);
    }
    seen.add(id);
  });
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Measured fit record for one rendered poster (Phase 2, 2026-11-17).
 * Produced by the render route from live DOM geometry (see
 * PosterRender.tsx) and carried in the render JSON (`fit`) alongside
 * `fitSize`/`arabicFitSize`, so a render can be judged from data, not
 * eyeballs alone. Line counts come from Range rects on the text node
 * (the gold quote spans are excluded — their taller rects invent
 * phantom lines); spare px is the true headroom, box height minus text
 * height minus vertical padding (NOT clientHeight - scrollHeight,
 * which reads 0 for any fitting flex panel).
 *
 * Persistence to the publication row is a FOLLOW-UP SKETCH, not
 * implemented here: `set_poster` stores no fit measurement and adding
 * columns needs a migration + its own owner approval. Sketch: new
 * nullable columns `poster_fit_bengali_size`, `poster_fit_arabic_size`,
 * `poster_fit_bengali_lines`, `poster_fit_arabic_lines`,
 * `poster_fit_bengali_spare_px`, `poster_fit_arabic_spare_px` on
 * `daily_content_publications`, written by the `set_poster` `passed`
 * call from the workflow's render JSON, so gate V6 can read a fit
 * measurement instead of trusting bare `poster_qc_status === 'passed'`.
 * Until that migration exists, the render JSON + workflow log are the
 * only record.
 */
export type OgFitRecord = {
  format: OgFormat;
  isLongContent: boolean;
  bengaliSize: number;
  bengaliMinSize: number;
  arabicSize: number;
  arabicMinSize: number;
  bengaliLines: number;
  arabicLines: number;
  /** Bengali auto-fit box true headroom px (box height - text height - vertical padding). */
  bengaliSparePx: number;
  /** Arabic auto-fit box true headroom px (box height - text height - vertical padding). */
  arabicSparePx: number;
  bengaliOverflow: boolean;
  arabicOverflow: boolean;
  /** Measured px line-heights from computed style (not the layout multipliers). */
  bengaliLineHeight: number;
  arabicLineHeight: number;
  /**
   * Adaptive multi-page (owner brief 2026-11-22): a page whose Arabic
   * ended on an earlier page renders no Arabic block (and vice versa
   * for Arabic-heavy sets). Absent (default true) = the block is
   * present and the lines<1 checks apply; false = the block is absent
   * by design and the set-level coverage check proves completeness.
   */
  bengaliPresent?: boolean;
  arabicPresent?: boolean;
};

/** Validate a measured fit record: floors honoured, no overflow, no negative spare. */
export function checkOgFitRecord(fit: OgFitRecord): OgCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (fit.bengaliOverflow) errors.push("bengali_overflow_at_min: translation does not fit even at minimum font size");
  if (fit.arabicOverflow) errors.push("arabic_overflow_at_min: Arabic does not fit even at minimum font size");
  if (fit.bengaliSize < fit.bengaliMinSize) errors.push(`bengali size ${fit.bengaliSize}px is below the ${fit.bengaliMinSize}px floor`);
  if (fit.arabicSize < fit.arabicMinSize) errors.push(`arabic size ${fit.arabicSize}px is below the ${fit.arabicMinSize}px floor`);
  // Spare tolerance is -1 px, matching the render gate's own
  // scrollHeight-vs-clientHeight +1 px tolerance: sub-pixel rounding
  // in getBoundingClientRect can read -0.2/-0.4 px on a fitting box.
  if (fit.bengaliSparePx < -1) errors.push(`bengali spare ${fit.bengaliSparePx}px is negative (text overflows its panel)`);
  if (fit.arabicSparePx < -1) errors.push(`arabic spare ${fit.arabicSparePx}px is negative (text overflows its box)`);
  // Adaptive multi-page: a block absent by design (its text ended on an
  // earlier page) reports 0 lines — the set-level coverage check, not
  // this record, proves that text is complete across pages.
  if (fit.bengaliPresent !== false && fit.bengaliLines < 1) errors.push("bengali lines < 1 (no Bengali text measured)");
  if (fit.arabicPresent !== false && fit.arabicLines < 1) errors.push("arabic lines < 1 (no Arabic text measured)");
  if (errors.length === 0) {
    if (fit.bengaliSize === fit.bengaliMinSize) {
      warnings.push("bengali at the floor: readable size is the minimum — re-verify in the real-font environment");
    }
    // The real Google webfont needs ~half a Bengali line more than the
    // local fallback (+13 px at 16 px). Less than that of spare on long
    // content is fragile even when the local render passes.
    if (fit.isLongContent && fit.bengaliSparePx < 13) {
      warnings.push(`bengali spare ${fit.bengaliSparePx}px is under one real-font line (~13px) for long content`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Structural readability guarantees for one effective layout (Phase 2).
 * These are automatable constants — they guard regressions in the
 * layout tables (a floor silently lowered, a line height squeezed, a
 * cap that starves the Arabic). They do NOT measure pixels: numeric
 * contrast, glyph shaping, background competition and scene match are
 * still human-eye checks on real previews (see the header comment).
 */
export function checkOgReadabilityGuarantees(layout: BengaliFirstLayout, eff: EffectiveBengaliFirstLayout): OgCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (eff.bengaliMinSize < 16) errors.push(`bengali floor ${eff.bengaliMinSize}px is below the 16px hard floor`);
  if (layout === "c" && eff.arabicMinSize < ARABIC_MIN_SIZE_LAYOUT_C) {
    errors.push(`layout C arabic floor ${eff.arabicMinSize}px is below the ${ARABIC_MIN_SIZE_LAYOUT_C}px floor`);
  }
  if (eff.bengaliLineHeight < 1.5 || eff.bengaliLineHeight > 1.75) {
    errors.push(`bengali line height ${eff.bengaliLineHeight} is outside 1.5–1.75 (cramped or wasteful)`);
  }
  if (eff.arabicLineHeight < 1.7 || eff.arabicLineHeight > 1.95) {
    errors.push(`arabic line height ${eff.arabicLineHeight} is outside 1.7–1.95`);
  }
  if (eff.arabicCapShare < 0.2 || eff.arabicCapShare > 0.3) {
    errors.push(`arabic cap share ${eff.arabicCapShare} is outside 0.20–0.30 (starves one of the two texts)`);
  }
  // The square-long title (16 px) equals the Bengali floor — the
  // eyebrow no longer reads larger than the smallest body text. Known
  // hierarchy inversion, accepted for long square content only because
  // the title is gold/800 and the body is white/400; flagged, not
  // silently passed.
  if (eff.titleSize <= eff.bengaliMinSize) {
    warnings.push(`title ${eff.titleSize}px is not larger than the bengali floor ${eff.bengaliMinSize}px (hierarchy inversion)`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
