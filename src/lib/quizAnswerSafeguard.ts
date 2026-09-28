// quizAnswerSafeguard.ts — P0-7 answer-key integrity, render-layer safeguards.
//
// Pure functions shared by the SPA (QuizDetailPage.tsx) and the regression
// tests. api/prerender.js mirrors this logic verbatim (it cannot import TS).
//
// A safeguard record looks up quiz-answer-safeguards.json by row id and
// decides the *effective* correct-answer index the render layer may assert:
//   - "none" (no entry, or entry malformed) → stored correct_answer, after the
//     stored-key sanity check.
//   - "suppress" → -1: the JSON-LD acceptedAnswer is omitted. The page still
//     renders its stored row; only the machine-asserted claim is withdrawn.
//   - "correct" → the evidence-backed index, but ONLY when the option text at
//     that index matches expected_text (fail-closed: evidence stale or row
//     drifted ⇒ suppress rather than assert something unverified).
//
// The stored key itself is also sanity-checked: a correct_answer that does
// not point at a real option suppresses the accepted answer ("key must match
// one of the options").

export type SafeguardEntry = {
  action?: string;
  effective_correct_answer?: number;
  expected_text?: string[];
};

export type SafeguardDoc = {
  records?: Record<string, SafeguardEntry>;
};

export type QuizAnswerLike = {
  id?: string | null;
  correct_answer?: number | null;
  options_bn?: string[] | null;
  options_en?: string[] | null;
};

export const SUPPRESS_INDEX = -1;

const norm = (s: unknown): string => String(s ?? "").trim();

function optionText(record: QuizAnswerLike, index: number): string {
  if (!Number.isInteger(index) || index < 0) return "";
  const bn = Array.isArray(record.options_bn) ? record.options_bn : [];
  const en = Array.isArray(record.options_en) ? record.options_en : [];
  const opts = bn.length ? bn : en;
  return norm(opts[index]);
}

/** True when the stored key points at a real, non-empty option. */
export function isStoredKeyValid(record: QuizAnswerLike): boolean {
  return optionText(record, record.correct_answer ?? -1) !== "";
}

/**
 * Effective correct-answer index the render layer may assert, or
 * SUPPRESS_INDEX (-1) when the accepted answer must be omitted from JSON-LD.
 * Never throws; unknown input ⇒ SUPPRESS_INDEX (fail-closed).
 */
export function getEffectiveAnswerIndex(
  record: QuizAnswerLike,
  doc: SafeguardDoc | null | undefined,
): number {
  try {
    const stored = Number.isInteger(record?.correct_answer) ? (record.correct_answer as number) : -1;
    if (!isStoredKeyValid(record)) return SUPPRESS_INDEX;
    const entry = doc?.records?.[String(record?.id ?? "")];
    if (!entry || typeof entry !== "object") return stored;
    if (entry.action === "suppress") return SUPPRESS_INDEX;
    if (entry.action === "correct") {
      const eff = entry.effective_correct_answer;
      const expected = Array.isArray(entry.expected_text) ? entry.expected_text.map(norm) : [];
      if (Number.isInteger(eff) && expected.length > 0 && expected.includes(optionText(record, eff as number))) {
        return eff as number;
      }
      return SUPPRESS_INDEX; // evidence stale / row drifted: do not assert
    }
    return stored;
  } catch {
    return SUPPRESS_INDEX;
  }
}

/** Convenience: should the JSON-LD acceptedAnswer be omitted for this record? */
export function shouldSuppressAcceptedAnswer(
  record: QuizAnswerLike,
  doc: SafeguardDoc | null | undefined,
): boolean {
  return getEffectiveAnswerIndex(record, doc) === SUPPRESS_INDEX;
}

/**
 * The acceptedAnswer text the render layer asserts, or "" when suppressed.
 * Mirrors the derivation in QuizDetailPage/quizStructuredData: bn + en joined.
 */
export function getAcceptedAnswerText(
  record: QuizAnswerLike,
  doc: SafeguardDoc | null | undefined,
): string {
  const eff = getEffectiveAnswerIndex(record, doc);
  if (eff === SUPPRESS_INDEX) return "";
  const bn = Array.isArray(record.options_bn) ? norm(record.options_bn[eff]) : "";
  const en = Array.isArray(record.options_en) ? norm(record.options_en[eff]) : "";
  return [bn, en].filter(Boolean).join(" / ");
}
