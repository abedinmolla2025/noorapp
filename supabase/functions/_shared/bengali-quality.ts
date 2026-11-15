// Bengali Quality classifier (v1.0, 2026-11-14).
//
// Heuristic classifier for Bengali AI-generated content, based on
// NOORAPP-BENGALI-EDITORIAL-STANDARD.md (v1.0). It is a HEURISTIC
// tool for audit and testing — not a judge. It flags the concrete
// patterns the standard names; it cannot catch every bad sentence,
// and a "Natural Bengali" result does not replace human review.
//
// Categories (from the standard, §5):
//   Natural Bengali | Literal AI Translation | Awkward Word Choice |
//   Repetition | Meaning Distortion | Unsupported Religious Claim |
//   Scholar Review Required
//
// Patterns are the same shapes as the server-side validators
// (generate-dua-seo VIRTUE_BLOCKLIST, recommend
// FORBIDDEN_REASON_PATTERNS) but this module is NOT the write
// path — the functions' own validators remain authoritative.
// Do not weaken either validator; this classifier only reports.
//
// Usage: classifyBengali({ bn, en? }) -> QualityResult.
//   bn: the Bengali text. en: the English parallel, when available
//   (used for the bn/en consistency check).

export type BengaliQualityCategory =
  | "Natural Bengali"
  | "Literal AI Translation"
  | "Awkward Word Choice"
  | "Repetition"
  | "Meaning Distortion"
  | "Unsupported Religious Claim"
  | "Scholar Review Required";

export interface BengaliQualityResult {
  /** Categories that apply (empty + no issues = Natural Bengali). */
  categories: BengaliQualityCategory[];
  /** 0-100. 100 = no issues found. Deducted per issue. */
  languageQualityScore: number;
  /** Meaning fidelity vs the English parallel / source: PASS | CHECK | FAIL. */
  meaningFidelity: "PASS" | "CHECK" | "FAIL";
  /** Religious safety: PASS | REVIEW (a claim or distortion needs a human). */
  religiousSafety: "PASS" | "REVIEW";
  /** Whether a human must review this text before it is used. */
  humanReviewRequired: boolean;
  /** Human-readable issue list (what was found and where). */
  issues: string[];
}

// --- Patterns ---

// Words that are always wrong in Bengali Islamic content.
const AWKWARD_WORDS: Array<{ re: RegExp; label: string }> = [
  { re: /পিতৃসত্তা/, label: "পিতৃসত্তা — Allah is never 'father' (Qur'an 112:3); use প্রতিপালক" },
  { re: /প্রফেট/, label: "প্রফেট — English loanword; use নবী / রাসুলুল্লাহ ﷺ / নবীজি ﷺ" },
  { re: /হস্তগত/, label: "হস্তগত — unnatural heavy word; use নাযিল হওয়া / পাওয়া / অবতীর্ণ হওয়া" },
];

// AI-style empty phrases (no information; literal English filler).
const AI_PHRASES: Array<{ re: RegExp; label: string }> = [
  { re: /এটি আমাদের অনুপ্রাণিত করে|এটি আমাদেরকে অনুপ্রেরণা দেয়/, label: "AI filler: 'এটি আমাদের অনুপ্রাণিত করে'" },
  { re: /আত্মউন্নতির লক্ষ্য(কে)? প্রকাশ করে/, label: "AI filler: 'আত্মউন্নতির লক্ষ্য প্রকাশ করে'" },
  { re: /জীবন(কে)? সুশৃঙ্খল করে|জীবন সুশৃঙ্খল হয়/, label: "AI filler: 'জীবনকে সুশৃঙ্খল করে'" },
  { re: /বাস্তবে, এটি আমাদেরকে .* অভ্যাস গড়ে তুলতে অনুপ্রেরণা দেয়/, label: "AI filler: 'বাস্তবে, এটি আমাদেরকে ... অভ্যাস গড়ে তুলতে অনুপ্রেরণা দেয়'" },
  { re: /এটি আমাদের শেখার ইচ্ছা প্রকাশ করে/, label: "AI filler: 'এটি আমাদের শেখার ইচ্ছা প্রকাশ করে'" },
];

// Literal-translation markers (English sentence shapes copied into Bengali).
const LITERAL_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /এটি জোর দেয় যে/, label: "literal translation: 'এটি জোর দেয় যে' (it underscores that)" },
  { re: /এটি গুরুত্বপূর্ণ যে/, label: "literal translation: 'এটি গুরুত্বপূর্ণ যে' (it is important that)" },
  { re: /বাস্তবে,/, label: "literal translation: sentence starting with 'বাস্তবে,' (in everyday life)" },
];

// Unsupported religious claims (same shapes as the server-side validators).
const RELIGIOUS_CLAIM_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /ফজিলত|ফযীলত|সওয়াব|সাওয়াব/, label: "unsupported virtue/reward claim (ফজিলত/সওয়াব)" },
  { re: /নিশ্চিত|গ্যারান্টি|guaranteed/i, label: "guarantee claim (নিশ্চিত/গ্যারান্টি)" },
  { re: /reward|পুরস্কার/, label: "reward claim (reward/পুরস্কার)" },
  { re: /ক্ষমা করা হবে|মাফ করা হবে|জান্নাত(ের)? নিশ্চিত|জান্নাতে (যাবে|যাওয়া)/, label: "forgiveness / Paradise guarantee claim" },
  { re: /[০-৯0-9]+\s*বার/, label: "prayer-count claim" },
  { re: /কদর.*২৭|২৭.*কদর/, label: "Laylatul Qadr exact-night claim" },
];

// Known bn/en mismatches (the English parallel proves the Bengali wrong).
// Each entry: the English word/phrase that must NOT be rendered as the
// Bengali word. Only the concrete cases we have evidence for.
const BN_EN_MISMATCHES: Array<{
  enRe: RegExp;
  bnRe: RegExp;
  label: string;
}> = [
  {
    enRe: /humility/i,
    bnRe: /নীরবতা/,
    label: "bn/en mismatch: English says 'humility' but Bengali says 'নীরবতা' (silence) — should be 'নম্রতা'",
  },
];

function splitSentences(text: string): string[] {
  return text
    .split(/[।!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function classifyBengali(input: {
  bn: string;
  en?: string;
}): BengaliQualityResult {
  const bn = input.bn ?? "";
  const en = input.en ?? "";
  const issues: string[] = [];
  const categories = new Set<BengaliQualityCategory>();
  let score = 100;

  // 1. Awkward word choice (always wrong).
  for (const { re, label } of AWKWARD_WORDS) {
    if (re.test(bn)) {
      issues.push(label);
      categories.add("Awkward Word Choice");
      score -= 25;
    }
  }

  // 2. AI-style empty phrases.
  for (const { re, label } of AI_PHRASES) {
    if (re.test(bn)) {
      issues.push(label);
      categories.add("Literal AI Translation");
      score -= 15;
    }
  }

  // 3. Literal-translation markers.
  for (const { re, label } of LITERAL_MARKERS) {
    if (re.test(bn)) {
      issues.push(label);
      categories.add("Literal AI Translation");
      score -= 10;
    }
  }

  // 4. Unsupported religious claims.
  for (const { re, label } of RELIGIOUS_CLAIM_PATTERNS) {
    if (re.test(bn)) {
      issues.push(label);
      categories.add("Unsupported Religious Claim");
      score -= 30;
    }
  }

  // 5. Repetition: the same sentence (or the same opening words)
  // appears more than once.
  const sentences = splitSentences(bn);
  const seen = new Map<string, number>();
  for (const s of sentences) {
    const key = s.slice(0, 30);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count >= 2) {
      issues.push(`Repetition: the same sentence/opening repeats ${count} times ("${key}…")`);
      categories.add("Repetition");
      score -= 10;
      break;
    }
  }

  // 6. bn/en consistency (only when the English parallel is given).
  if (en) {
    for (const { enRe, bnRe, label } of BN_EN_MISMATCHES) {
      if (enRe.test(en) && bnRe.test(bn)) {
        issues.push(label);
        categories.add("Meaning Distortion");
        score -= 25;
      }
    }
  }

  // 7. Meaning distortion follows from a theological error: calling
  // Allah "father" (পিতৃসত্তা) distorts the meaning of Rabb.
  if (/পিতৃসত্তা/.test(bn)) {
    categories.add("Meaning Distortion");
  }

  // Scholar review is required when there is a meaning distortion,
  // an unsupported religious claim, or a theological error.
  const needsScholar =
    categories.has("Meaning Distortion") ||
    categories.has("Unsupported Religious Claim") ||
    /পিতৃসত্তা/.test(bn);
  if (needsScholar) {
    categories.add("Scholar Review Required");
  }

  const meaningFidelity: "PASS" | "CHECK" | "FAIL" = categories.has(
    "Meaning Distortion",
  )
    ? "FAIL"
    : categories.has("Awkward Word Choice") ||
        categories.has("Literal AI Translation")
      ? "CHECK"
      : "PASS";
  const religiousSafety: "PASS" | "REVIEW" = needsScholar ? "REVIEW" : "PASS";
  const humanReviewRequired =
    issues.length > 0 || needsScholar;

  if (issues.length === 0) {
    categories.add("Natural Bengali");
  }

  return {
    categories: [...categories],
    languageQualityScore: Math.max(0, score),
    meaningFidelity,
    religiousSafety,
    humanReviewRequired,
    issues,
  };
}
