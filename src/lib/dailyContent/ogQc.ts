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

/** Batch checks: non-empty fields, background uniqueness, long-text flags. */
export function checkOgCardBatch(
  cards: CardPayload[],
  backgroundIds: string[],
  catalogSize: number,
): OgCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  cards.forEach((card, i) => {
    if (!card.title.trim()) errors.push(`card ${i}: empty title`);
    if (!card.arabic.trim()) errors.push(`card ${i}: empty arabic`);
    if (!card.bengali.trim()) errors.push(`card ${i}: empty bengali`);
    if (!card.sourceLine.trim()) errors.push(`card ${i}: empty reference`);
    if (card.arabic.length > 260 || card.bengali.length > 380) {
      warnings.push(`card ${i}: long text — verify fit visually (do not truncate)`);
    }
    if ((card.pronunciation ?? "").length > 380) {
      warnings.push(`card ${i}: long pronunciation — verify fit visually (do not truncate)`);
    }
    if (card.pronunciationStatus === "missing") {
      warnings.push(`card ${i}: no pronunciation — poster shows the "যাচাই করা হয়নি" fallback`);
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
