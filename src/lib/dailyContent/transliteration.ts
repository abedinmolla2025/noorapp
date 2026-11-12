/**
 * Arabic → Bengali transliteration engine (the "NoorApp convention").
 *
 * PURPOSE: produce a Bengali pronunciation AID for a Dua/Hadith whose exact
 * Arabic text is already known. It is an aid, never a replacement for
 * learning correct Arabic articulation and Tajweed, and it never claims
 * Tajweed-level accuracy.
 *
 * STATUS RULE (mission A4): everything this file generates is a CANDIDATE.
 * A candidate is never verified, never approved, and never presented as
 * approved content. Verification is a separate admin (owner) review step;
 * the admin panel (demo) shows the word-by-word comparison and the flags.
 * If no reliable pronunciation is available, the UI shows
 * "বাংলা উচ্চারণ যাচাই করা হয়নি" — never an unverified candidate dressed
 * up as approved.
 *
 * THE CONVENTION (documented, following the brief's own example style):
 * - Emphatic letters use the conjunct form so they stay distinct:
 *   ط → ত্ব, ض → দ্ব, ص → স্ব, ظ → য্ব, ق → ক্ব, غ → গ্ব.
 * - ذ → য, ث → ছ (distinct from ز → জ and س → স).
 * - ح and ه both write as হ, ع writes as ', ا writes as আ — Bengali script
 *   cannot distinguish ح/ه or ع/ء visually, so every word containing one
 *   is FLAGGED ("collapsing letter") and the distinction must be learned
 *   from a teacher, not from this spelling.
 * - Short vowels: fatha → base + া, kasra → base + ি, damma → base + ু.
 *   Sukun → bare base (no vowel mark). Shaddah doubles the consonant
 *   (written as a conjunct: ব্ + ব = ব্ব). Long ا after fatha adds
 *   nothing (the া already covers it); long و after damma lengthens
 *   ু → ূ; long ي after kasra lengthens ি → ী.
 *   Exception: the conjunct bases (ত্ব/দ্ব/স্ব/য্ব/ক্ব/গ্ব) already carry
 *   the short fatha in their inherent vowel, so a short fatha adds no া
 *   (طَ → ত্ব, as in the brief's example "ত্বয়্যিবাহ"); a following
 *   bare alif makes it long (ত্বা).
 * - ع and ء take the vowel LETTER, not base + vowel sign: عَ → 'আ,
 *   عِ → 'ই, عُ → 'উ; ءَ → আ, ءِ → ই, ءُ → উ.
 * - Tanwin: ً → ান, ٍ → িন, ٌ → ুন. ة in connected reading → ত;
 *   at waqf (final word of the text) ة → হ and tanwin is dropped — the
 *   brief's example ("ত্বয়্যিবাহ") follows waqf for the final word.
 * - ال before a sun letter assimilates (ل dropped, sun letter doubled);
 *   before a moon letter it stays "আল".
 * - نْ / tanwin + ل or ر assimilates (the ন drops, the next letter
 *   doubles: مِن لَّدُنكَ → "মিল্লাদুনকা"). نْ + ي/و/م/ن is idgham with
 *   ghunnah — this engine does NOT assimilate it; the word is flagged
 *   for review instead.
 * - Hamzat al-wasl (ٱ) at the start of the text → "আ"; mid-sentence it
 *   is elided and flagged.
 * - Mushaf annotation marks (ۥ ۭ ۖ ۗ etc.) are stripped and flagged.
 * - A letter with no diacritic is assumed fatha and flagged.
 *
 * WHY NOT THE STORED DATA'S CONVENTION? The bundled duas.json carries a
 * `pronunciation.bn` value for 160/218 records (58 empty, including the
 * parents dua 17:24), but it uses an undocumented, inconsistent convention
 * (ذ → ধ, ط → ত, ق → ক, no connected-reading assimilation, e.g. "ওয় ইন
 * লাম" for وَإِن لَّمْ, and a likely error "আনা" for أَن in 3:147) with
 * unknown provenance (probably AI-generated via the ungated
 * fix-dua-content edge). Stored values are therefore treated as
 * UNVERIFIED and are compared word-by-word against this convention's
 * candidate — every divergence is a flag, not a silent correction.
 * The Arabic text itself is NEVER changed to make pronunciation easier.
 */

export type WordFlag =
  | "collapsing-hah" // ح or ه — Bengali writes both as হ
  | "collapsing-ain" // ع written as '
  | "assimilation-al" // ال + sun letter
  | "assimilation-nun" // نْ + ل/ر
  | "ghunnah-review" // نْ + ي/و/م/ن — not assimilated, needs review
  | "waqf" // final-word ة → হ, tanwin dropped
  | "wasla-elided" // hamzat al-wasl elided mid-sentence
  | "annotation-stripped" // mushaf marks removed
  | "no-diacritic" // a letter had no vowel mark; fatha assumed
  | "unhandled-char" // a character this engine does not map
  | "long-word"; // > 12 letters — check fit visually

export type WordVerification = {
  index: number;
  arabic: string;
  candidate: string;
  /** The stored bn word aligned to this candidate word (sequence alignment, not position), when the record has one. */
  stored: string | null;
  status: "match" | "differs" | "stored-missing" | "uncertain";
  flags: WordFlag[];
};

export type PronunciationCandidate = {
  candidate: string;
  words: WordVerification[];
  flags: string[];
  /** Always "candidate" — generation never verifies. */
  status: "candidate";
};

/* ---------------- letter tables ---------------- */

const BASE: Record<string, string> = {
  "ا": "আ", "ب": "ব", "ت": "ত", "ث": "ছ", "ج": "জ", "ح": "হ", "خ": "খ",
  "د": "দ", "ذ": "য", "ر": "র", "ز": "জ", "س": "স", "ش": "শ", "ص": "স্ব",
  "ض": "দ্ব", "ط": "ত্ব", "ظ": "য্ব", "ع": "'", "غ": "গ্ব", "ف": "ফ", "ق": "ক্ব",
  "ك": "ক", "ل": "ল", "م": "ম", "ن": "ন", "ه": "হ", "و": "ও", "ي": "য়",
  "ء": "অ", "ؤ": "উ", "ئ": "ই", "أ": "আ", "إ": "ই", "آ": "আ", "ى": "া",
  "ة": "ত", "ٱ": "আ",
};

const SUN_LETTERS = new Set(["ت", "ث", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ل", "ن"]);
const COLLAPSING_HAH = new Set(["ح", "ه"]);
const FATHA = "َ";
const KASRA = "ِ";
const DAMMA = "ُ";
const SUKUN = "ْ";
const SHADDAH = "ّ";
const TANWIN_FATHA = "ً";
const TANWIN_KASRA = "ٍ";
const TANWIN_DAMMA = "ٌ";
const ANNOTATION = new Set(["ۥ", "ۭ", "ۖ", "ۗ", "ۘ", "ۙ", "ۚ", "ۛ", "ۜ", "۟", "۞", "ٰ", "ٖ", "ٗ", "ٓ", "ـ", "،", "؛", "؟", "‏", "‎", ".", "!", "?", "…"]);

/** Conjunct bases (ত্ব/দ্ব/স্ব/য্ব/ক্ব/গ্ব) already carry the short fatha in
 * their inherent vowel, so a short fatha adds no া; a following bare alif
 * (long vowel) does. Single-letter bases always take the া. */
const CONJUNCT_BASE = new Set(["ত্ব", "দ্ব", "স্ব", "য্ব", "ক্ব", "গ্ব"]);

/** An Arabic letter is a real letter (not a mark or punctuation). */
function isArabicLetter(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0x0621 && cp <= 0x064a) || cp === 0x0671 || cp === 0x0670;
}

function isDiacritic(ch: string): boolean {
  return [FATHA, KASRA, DAMMA, SUKUN, SHADDAH, TANWIN_FATHA, TANWIN_KASRA, TANWIN_DAMMA].includes(ch);
}

function stripWordMarks(word: string): { clean: string; strippedAnnotation: boolean } {
  let strippedAnnotation = false;
  let clean = "";
  for (const ch of word) {
    if (ANNOTATION.has(ch)) { strippedAnnotation = true; continue; }
    clean += ch;
  }
  return { clean, strippedAnnotation };
}

type LetterToken = { letter: string; marks: string[] };

function tokenize(word: string): LetterToken[] {
  const tokens: LetterToken[] = [];
  for (const ch of word) {
    if (isDiacritic(ch)) {
      if (tokens.length > 0) tokens[tokens.length - 1].marks.push(ch);
      continue;
    }
    tokens.push({ letter: ch, marks: [] });
  }
  return tokens;
}

function vowelFor(marks: string[]): { kind: "fatha" | "kasra" | "damma" | "sukun" | "tanwin-fatha" | "tanwin-kasra" | "tanwin-damma" | "none"; shaddah: boolean } {
  const shaddah = marks.includes(SHADDAH);
  if (marks.includes(TANWIN_FATHA)) return { kind: "tanwin-fatha", shaddah };
  if (marks.includes(TANWIN_KASRA)) return { kind: "tanwin-kasra", shaddah };
  if (marks.includes(TANWIN_DAMMA)) return { kind: "tanwin-damma", shaddah };
  if (marks.includes(FATHA)) return { kind: "fatha", shaddah };
  if (marks.includes(KASRA)) return { kind: "kasra", shaddah };
  if (marks.includes(DAMMA)) return { kind: "damma", shaddah };
  if (marks.includes(SUKUN)) return { kind: "sukun", shaddah };
  return { kind: "none", shaddah };
}

/** A doubled consonant is written as a conjunct: base + halant + base. */
function doubleBase(base: string): string {
  return base + "্" + base;
}

/** Hamza-carrying letters already carry their vowel in the base form. */
const HAMZA_CARRIER = new Set(["أ", "إ", "آ", "ؤ", "ئ"]);

/**
 * Transliterate one Arabic word (connected-reading form). `isFinalWord`
 * applies the waqf rule (ة → হ, tanwin dropped). `prevEndsNun` is set by
 * the caller when the previous word ended in نْ/tanwin and this word
 * starts with ل or ر (assimilation across the boundary). `doubleArticleLam`
 * is set when the previous word ended in نْ and this word starts with
 * ال + a moon letter (the article's ل doubles).
 */
function transliterateWord(
  rawWord: string,
  isFinalWord: boolean,
  prevEndsNun: boolean,
  wordIndex: number,
  doubleArticleLam = false,
): { text: string; flags: WordFlag[] } {
  const flags: WordFlag[] = [];
  const { clean, strippedAnnotation } = stripWordMarks(rawWord);
  if (strippedAnnotation) flags.push("annotation-stripped");
  const tokens = tokenize(clean);
  if (tokens.length > 12) flags.push("long-word");

  // The definite article ال (written with ا or ٱ):
  //  - before a sun letter the ل drops and the sun letter doubles;
  //  - before a moon letter the ل stays;
  //  - mid-sentence the article's alif is elided (wasla), so the first
  //    word gets "আ" and later words get no leading vowel.
  let start = 0;
  let prefix = "";
  const isArticle =
    tokens.length >= 3 &&
    (tokens[0].letter === "ا" || tokens[0].letter === "ٱ") &&
    tokens[1].letter === "ل";
  if (isArticle) {
    const third = tokens[2];
    const v3 = vowelFor(third.marks);
    const vowelMark =
      v3.kind === "fatha" ? (CONJUNCT_BASE.has(BASE[third.letter] ?? "") ? "" : "া") :
      v3.kind === "kasra" ? "ি" :
      v3.kind === "damma" ? "ু" :
      v3.kind === "tanwin-fatha" ? (isFinalWord ? "া" : "ান") :
      v3.kind === "tanwin-kasra" ? (isFinalWord ? "ি" : "িন") :
      v3.kind === "tanwin-damma" ? (isFinalWord ? "ু" : "ুন") : "";
    if (SUN_LETTERS.has(third.letter)) {
      flags.push("assimilation-al");
      // A bare alif after the sun letter makes its fatha long (ত্বা, not ত্ব).
      const longVowel = tokens.length > 3 && tokens[3].letter === "ا" && vowelFor(tokens[3].marks).kind === "none";
      const mark = v3.kind === "fatha" && longVowel ? "া" : vowelMark;
      prefix = (wordIndex === 0 ? "আ" : "") + doubleBase(BASE[third.letter] ?? "") + mark;
      start = 3; // ا + ل + sun letter all covered by the prefix
    } else {
      prefix = wordIndex === 0 ? "আল" : doubleArticleLam ? doubleBase("ল") : "ল";
      if (doubleArticleLam) flags.push("assimilation-nun");
      start = 2; // ا + ل covered; the moon letter is processed normally
    }
    if (wordIndex > 0) flags.push("wasla-elided");
  }

  let out = prefix;
  let i = start;
  // Cross-word نْ + ل/ر assimilation: the first letter doubles (once —
  // a shaddah on it does not double it a second time).
  let doubleFirst = false;
  if (prevEndsNun && tokens.length > start && (tokens[start].letter === "ل" || tokens[start].letter === "ر")) {
    flags.push("assimilation-nun");
    doubleFirst = true;
  }

  let prevVowel: string | null = null;
  while (i < tokens.length) {
    const tok = tokens[i];
    const letter = tok.letter;
    const v = vowelFor(tok.marks);
    if (COLLAPSING_HAH.has(letter)) flags.push("collapsing-hah");
    if (letter === "ع") flags.push("collapsing-ain");

    // Bare alif: a long vowel after fatha (skip — the া already covers
    // it), or the word-initial hamza (আ/ই/উ by its vowel).
    if (letter === "ا") {
      if (i === start) {
        out += v.kind === "kasra" ? "ই" : v.kind === "damma" ? "উ" : "আ";
      }
      prevVowel = v.kind;
      i += 1;
      continue;
    }
    // Alif maqsura: the long vowel. After fatha the া already covers it;
    // after kasra it lengthens ি → ী (e.g. لِى → লী).
    if (letter === "ى") {
      if (prevVowel === "kasra" && out.endsWith("ি")) out = out.slice(0, -1) + "ী";
      i += 1;
      continue;
    }
    // Hamzat al-wasl mid-word: elided in connected reading.
    if (letter === "ٱ") {
      if (wordIndex === 0 && i === start) out += "আ";
      else flags.push("wasla-elided");
      i += 1;
      continue;
    }
    // Waw / ya as long-vowel carriers: only when they carry NO marks and
    // the previous letter had the matching vowel. Otherwise they are
    // consonants with their own vowel.
    if (letter === "و" && v.kind === "none") {
      if (prevVowel === "damma" && out.endsWith("ু")) {
        out = out.slice(0, -1) + "ূ";
      } else {
        out += "ও";
      }
      prevVowel = null;
      i += 1;
      continue;
    }
    if (letter === "ي" && v.kind === "none") {
      if (prevVowel === "kasra" && out.endsWith("ি")) {
        out = out.slice(0, -1) + "ী";
      } else {
        out += "য়";
      }
      prevVowel = null;
      i += 1;
      continue;
    }

    const base = BASE[letter];
    if (base === undefined) {
      flags.push("unhandled-char");
      prevVowel = v.kind;
      i += 1;
      continue;
    }
    if (v.kind === "none") flags.push("no-diacritic");

    // Hamza carriers already carry their vowel in the base form.
    if (HAMZA_CARRIER.has(letter)) {
      out += v.shaddah ? doubleBase(base) : base;
      prevVowel = v.kind;
      i += 1;
      continue;
    }

    // Waw as a consonant: fatha → ওয়া, damma → উ, kasra → উই.
    if (letter === "و") {
      const doubled = v.shaddah || doubleFirst ? doubleBase("ওয়") : "ওয়";
      doubleFirst = false;
      out +=
        v.kind === "fatha" ? doubled + "া" :
        v.kind === "damma" ? (v.shaddah ? doubleBase("উ") : "উ") :
        v.kind === "kasra" ? doubled + "ি" :
        v.kind === "tanwin-fatha" ? doubled + (isFinalWord ? "া" : "ান") :
        v.kind === "tanwin-kasra" ? doubled + (isFinalWord ? "ি" : "ইন") :
        v.kind === "tanwin-damma" ? doubled + (isFinalWord ? "ু" : "উন") :
        "ও";
      prevVowel = v.kind;
      i += 1;
      continue;
    }

    // ة: waqf at the final word → হ (tanwin dropped); otherwise ত.
    if (letter === "ة" && isFinalWord) {
      flags.push("waqf");
      out += v.shaddah ? doubleBase("হ") : "হ";
      prevVowel = v.kind;
      i += 1;
      continue;
    }

    // ع and ء take the vowel LETTER (আ/ই/উ), not base + vowel sign:
    // عَ → 'আ, عِ → 'ই, عُ → 'উ; ءَ → আ, ءِ → ই, ءُ → উ.
    if (letter === "ع" || letter === "ء") {
      const lead = letter === "ع" ? "'" : "";
      if (v.kind === "sukun" || v.kind === "none") {
        out += letter === "ع" ? "'" : "অ";
      } else {
        const vowelLetter =
          v.kind === "fatha" ? "আ" :
          v.kind === "kasra" ? "ই" :
          v.kind === "damma" ? "উ" :
          v.kind === "tanwin-fatha" ? (isFinalWord ? "আ" : "আন") :
          v.kind === "tanwin-kasra" ? (isFinalWord ? "ই" : "ইন") :
          (isFinalWord ? "উ" : "উন");
        const one = lead + vowelLetter;
        out += v.shaddah || doubleFirst ? one + one : one;
      }
      doubleFirst = false;
      if (isFinalWord && v.kind.startsWith("tanwin")) flags.push("waqf");
      prevVowel = v.kind;
      i += 1;
      continue;
    }

    const emit = v.shaddah || doubleFirst ? doubleBase(base) : base;
    doubleFirst = false;
    // A short fatha on a conjunct base adds no া (the inherent vowel
    // already says it); a following bare alif makes it long (ত্বা).
    const nextIsBareAlif = i + 1 < tokens.length && tokens[i + 1].letter === "ا" && vowelFor(tokens[i + 1].marks).kind === "none";
    const fathaMark = CONJUNCT_BASE.has(base) && !nextIsBareAlif ? "" : "া";
    switch (v.kind) {
      case "fatha": out += emit + fathaMark; break;
      case "kasra": out += emit + "ি"; break;
      case "damma": out += emit + "ু"; break;
      case "tanwin-fatha": out += emit + (isFinalWord ? "া" : "ান"); break;
      case "tanwin-kasra": out += emit + (isFinalWord ? "ি" : "িন"); break;
      case "tanwin-damma": out += emit + (isFinalWord ? "ু" : "ুন"); break;
      case "sukun":
      case "none":
      default: out += emit; break;
    }
    if (isFinalWord && v.kind.startsWith("tanwin")) flags.push("waqf");
    prevVowel = v.kind;
    i += 1;
  }

  return { text: out, flags: [...new Set(flags)] };
}

/** Does this word end in a bare نْ or a tanwin (for cross-word assimilation)? */
function wordEndsNun(rawWord: string): boolean {
  const { clean } = stripWordMarks(rawWord);
  if (/[ًٌٍ]$/.test(clean)) return true;
  const tokens = tokenize(clean);
  const last = tokens[tokens.length - 1];
  if (!last) return false;
  if (last.letter !== "ن") return false;
  const v = vowelFor(last.marks);
  return v.kind === "sukun" || v.kind === "none";
}

/** First letter of a word (after stripping marks), for assimilation lookahead. */
function wordFirstLetter(rawWord: string): string | null {
  const { clean } = stripWordMarks(rawWord);
  const tokens = tokenize(clean);
  return tokens[0]?.letter ?? null;
}

/**
 * The letter a preceding نْ assimilates into: for an ال word it is the
 * article's ل (moon) or the sun letter (sun); otherwise the first letter.
 */
function assimilationTarget(rawWord: string): string | null {
  const { clean } = stripWordMarks(rawWord);
  const tokens = tokenize(clean);
  if (tokens.length >= 3 && (tokens[0].letter === "ا" || tokens[0].letter === "ٱ") && tokens[1].letter === "ل") {
    return SUN_LETTERS.has(tokens[2].letter) ? tokens[2].letter : "ل";
  }
  return tokens[0]?.letter ?? null;
}

/** Transliterate a full Arabic text (connected reading). Never verified. */
export function transliterateArabic(arabic: string): PronunciationCandidate {
  // Drop words that are pure mushaf annotation or punctuation (e.g. a
  // standalone ۖ or the closing ‏"‏‏.‏ of a hadith).
  const rawWords = arabic
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .filter((w) => {
      const { clean } = stripWordMarks(w);
      return [...clean].some((ch) => isArabicLetter(ch));
    });
  const words: WordVerification[] = [];
  const allFlags: string[] = [];
  rawWords.forEach((raw, idx) => {
    const isFinal = idx === rawWords.length - 1;
    const prevEndsNun = idx > 0 && wordEndsNun(rawWords[idx - 1]);
    const target = assimilationTarget(raw);
    const assimilates = prevEndsNun && (target === "ل" || target === "ر");
    // نْ + ال(sun): the ن drops; the sun letter is already doubled by the
    // article rule, so no extra doubling is needed here.
    const prevNunBeforeArticle = prevEndsNun && wordFirstLetter(raw) !== target && (target !== null && SUN_LETTERS.has(target));
    const doubleArticleLam = prevEndsNun && wordFirstLetter(raw) !== target && target === "ل";
    const { text, flags } = transliterateWord(raw, isFinal, assimilates, idx, doubleArticleLam);
    // نْ + ي/و/م/ن: idgham with ghunnah — flagged, not assimilated.
    if (prevEndsNun && target && ["ي", "و", "م", "ن"].includes(target)) flags.push("ghunnah-review");
    // The previous word's final ন drops when assimilation happened.
    if (assimilates || prevNunBeforeArticle || doubleArticleLam) {
      const prev = words[words.length - 1];
      if (prev) prev.candidate = prev.candidate.replace(/ন$/, "");
    }
    words.push({ index: idx, arabic: raw, candidate: text, stored: null, status: "stored-missing", flags });
  });
  for (const w of words) for (const f of w.flags) if (!allFlags.includes(f)) allFlags.push(f);
  return { candidate: words.map((w) => w.candidate).join(" "), words, flags: allFlags, status: "candidate" };
}

function normalizeStoredWord(word: string): string {
  return word.replace(/[।,;:.!?'"“”]+$/u, "").replace(/^[।,;:.!?'"“”]+/u, "").trim();
}

/**
 * Loose normalization for COMPARISON ONLY (never for display): collapses
 * the known convention variants (ত্ব→ত, স্ব→স, ক্ব→ক, দ্ব→দ, য্ব→জ, গ্ব→গ,
 * ধ/য→জ, ছ→স) and doubled consonants (shaddah), strips spaces and
 * punctuation. Two spellings that differ only by convention score as the
 * same word. Vowel length is NOT collapsed, so a real error such as
 * "আনা" for أَن (আন) still differs.
 */
function looseWord(word: string): string {
  return normalizeStoredWord(word)
    .replace(/\s+/gu, "")
    .replace(/ত্ব/g, "ত").replace(/দ্ব/g, "দ").replace(/স্ব/g, "স")
    .replace(/য্ব/g, "জ").replace(/ক্ব/g, "ক").replace(/গ্ব/g, "গ")
    .replace(/ধ/g, "জ").replace(/য/g, "জ").replace(/ছ/g, "স")
    .replace(/(.)\1/gu, "$1");
}

function levDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Loose edit cost between one candidate word and one stored word (0 = same word under some consistent convention, 1 = unrelated). */
function alignedWordCost(candidate: string, stored: string): number {
  const a = looseWord(candidate), b = looseWord(stored);
  if (a === b) return 0;
  return levDistance(a, b) / Math.max(a.length, b.length, 1);
}

/** Cost of leaving a word unpaired (a split or a join). Below 1 so a
 * near-match is always preferred to a gap; above 0.5 so a bad pairing is
 * not forced when the words are unrelated. */
const ALIGN_GAP_COST = 0.8;

/**
 * Compare a stored Bengali pronunciation (e.g. the bundled `pronunciation.bn`)
 * against the convention candidate, word by word. The stored value is never
 * "corrected" — divergences are reported so an admin can judge them.
 *
 * ALIGNMENT (2026-11-08, P1/P2 correction): the stored value and the
 * candidate often split words differently (stored "ওয়া মা" for candidate
 * "ওয়ামা"; stored "ওয় ইন লাম" for candidate "ওয়াই ল্লাম"). The old
 * positional comparison judged every later word against the WRONG partner
 * after the first split — e.g. Quran 7:23 read "partial 2/12" and 3:147
 * "differs 0/19" when both stored values are in fact faithful
 * transliterations under the legacy convention. The comparison now aligns
 * the two word sequences (Needleman-Wunsch, loose edit cost), so each
 * stored word is judged against the Arabic word it actually renders.
 * Stored words with no candidate partner (a split) are listed in
 * `extraStoredWords` instead of shifting the alignment. The `overall`
 * verdict still uses EXACT normalized equality per aligned pair, so a
 * record whose stored value uses a different convention still reads
 * "partial"/"differs" — only the pairing is now correct.
 */
export function verifyStoredPronunciation(
  arabic: string,
  storedBn: string | null,
): { candidate: PronunciationCandidate; overall: "match" | "differs" | "stored-missing" | "partial"; matched: number; total: number; extraStoredWords: string[] } {
  const gen = transliterateArabic(arabic);
  if (!storedBn || !storedBn.trim()) {
    return { candidate: gen, overall: "stored-missing", matched: 0, total: gen.words.length, extraStoredWords: [] };
  }
  const storedWords = storedBn.split(/\s+/).filter((w) => w.length > 0);
  const cands = gen.words.map((w) => w.candidate);
  const n = cands.length, m = storedWords.length;
  // Needleman-Wunsch over (candidate words × stored words).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const bt: string[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(""));
  for (let i = 1; i <= n; i++) { dp[i][0] = dp[i - 1][0] + ALIGN_GAP_COST; bt[i][0] = "up"; }
  for (let j = 1; j <= m; j++) { dp[0][j] = dp[0][j - 1] + ALIGN_GAP_COST; bt[0][j] = "left"; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const diag = dp[i - 1][j - 1] + alignedWordCost(cands[i - 1], storedWords[j - 1]);
    const up = dp[i - 1][j] + ALIGN_GAP_COST, left = dp[i][j - 1] + ALIGN_GAP_COST;
    if (diag <= up && diag <= left) { dp[i][j] = diag; bt[i][j] = "diag"; }
    else if (up <= left) { dp[i][j] = up; bt[i][j] = "up"; }
    else { dp[i][j] = left; bt[i][j] = "left"; }
  }
  const pairedStored: (string | null)[] = new Array(n).fill(null);
  const extraStoredWords: string[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const dir = bt[i][j];
    if (dir === "diag") { pairedStored[i - 1] = storedWords[j - 1]; i--; j--; }
    else if (dir === "up") { i--; }
    else { extraStoredWords.unshift(storedWords[j - 1]); j--; }
  }
  let matched = 0;
  gen.words.forEach((w, idx) => {
    const stored = pairedStored[idx];
    w.stored = stored;
    if (stored === null) {
      w.status = "stored-missing";
      return;
    }
    if (normalizeStoredWord(stored) === normalizeStoredWord(w.candidate)) {
      w.status = "match";
      matched += 1;
    } else {
      w.status = "differs";
    }
    if (w.flags.length > 0 && w.status === "match") w.status = "uncertain";
  });
  const overall =
    matched === gen.words.length ? "match" :
    matched === 0 ? "differs" : "partial";
  return { candidate: gen, overall, matched, total: gen.words.length, extraStoredWords };
}

/** The fallback text shown when no reliable pronunciation is available. */
export const PRONUNCIATION_MISSING_TEXT = "বাংলা উচ্চারণ যাচাই করা হয়নি";

/**
 * Extract the matn (the actual saying) from a Bukhari hadith's Arabic text:
 * the quoted portion between the opening and closing quote marks. The
 * isnad (narrator chain) is not pronounced on a poster — it would
 * overcrowd it (mission A5). Returns null when no quoted portion exists.
 */
export function extractHadithMatn(arabic: string): string | null {
  const m = arabic.match(/["“«]([^"”»]+)["”»]/);
  if (!m) return null;
  const matn = m[1].replace(/[‏‎]/g, "").trim();
  return matn.length > 0 ? matn : null;
}
