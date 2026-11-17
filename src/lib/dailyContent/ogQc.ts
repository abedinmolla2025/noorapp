/**
 * Quality gate for OG-style share cards.
 *
 * Photo backgrounds make numeric WCAG contrast meaningless (contrast is
 * carried by the card's dark scrim + glass Arabic panel + text shadow, and
 * is verified visually on real previews instead). What this gate CAN prove
 * exactly:
 *  - every rendered field equals the source record character-for-character,
 *  - no background repeats inside a batch while the catalog has spares,
 *  - no required field is empty,
 *  - long texts that need a visual fit check are flagged, never silently cut.
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
    portrait: { padding: "26px 28px 26px", titleSize: 24, bengaliSize: 38, bengaliMinSize: 18, arabicSize: 18, gap: 14, bodyPadding: "8px 0", arabicPadding: "12px 16px", sourceInBadge: false, arabicMinSize: 13, arabicCapShare: 0.28 },
    square: { padding: "22px 26px 22px", titleSize: 22, bengaliSize: 32, bengaliMinSize: 16, arabicSize: 16, gap: 12, bodyPadding: "6px 0", arabicPadding: "10px 14px", sourceInBadge: false, arabicMinSize: 12, arabicCapShare: 0.25 },
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
  /** Bengali line height (1.65 normally; 1.6 for square long content — see below). */
  bengaliLineHeight: number;
  /** Vertical padding (px) inside the Bengali hero panel (16 normally). */
  panelPaddingV: number;
  /** Vertical padding (px) inside the source pill (6 normally). */
  sourcePillPaddingV: number;
};

/**
 * Effective sizes for one render: the table values, tightened when the
 * content is long. The tightening only touches fixed chrome (title,
 * gaps, padding, Arabic leading) — the Bengali/Arabic font sizes are
 * left to their auto-fit blocks, which measure the real geometry.
 * Short content returns the table values unchanged (no regression on
 * the fixture renders).
 *
 * Square long content gets EXTRA tightening (square-fix, 2026-11-17):
 * the 2026-11-17 E2E proved square Layout C cannot fit a long Bengali
 * (Bukhari 66-5022, 538 chars) at the 16 px minimum — the real Google
 * webfont needs 9 lines where the local fallback needs 8.5, and the
 * square body (460 px) leaves the Bengali panel ~20 px short. The
 * extras below free ~40 px for the Bengali panel (measured geometry,
 * 5022 square: panel 267 px -> ~292 px, content ~224 px -> ~266 px),
 * so the same text fits at 16 px with a full line of headroom instead
 * of sitting exactly at the floor. The Arabic cap moves 0.25 -> 0.23:
 * at the 12 px minimum a 5-line Arabic is 105 px and the new cap is
 * ~108 px, so the min-size threshold is UNCHANGED (a 6-line Arabic
 * fails today and still fails — no new Arabic failure class). Bengali
 * min size stays 16 px (readability floor, not lowered); only chrome
 * and line height move. Portrait/wide/story are untouched.
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
    return { ...base, isLongContent: false, arabicLineHeight: 1.9, bengaliLineHeight: 1.65, panelPaddingV: 16, sourcePillPaddingV: 6 };
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
  };
  if (format === "square") {
    // Square long content: the short body is the binding constraint.
    // Tighten the chrome further (outer padding 22 -> 12 top/bottom,
    // title 18 -> 16, gaps 8 -> 6, panel padding 16 -> 12, pill
    // padding 6 -> 4) and cap the Arabic footnote at 23% of the body
    // (it settles at 14 px instead of 16 px for 5022 — still a
    // readable footnote, Arabic stays second priority per the
    // Bengali-first rules). Bengali line height 1.65 -> 1.6.
    tightened.titleSize = Math.max(16, base.titleSize - 6);
    tightened.gap = Math.max(6, base.gap - 6);
    tightened.padding = tightenPadding(base.padding, 10);
    tightened.arabicCapShare = 0.23;
    tightened.bengaliLineHeight = 1.6;
    tightened.panelPaddingV = 12;
    tightened.sourcePillPaddingV = 4;
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
