// Islamic (Hijri) calendar arithmetic — pure, deterministic, AI-independent.
//
// The conversion is the Kuwaiti / Islamic-civil tabular algorithm, moved
// VERBATIM from IslamicCalendarPage.tsx (its gregorianToHijri). It is a
// CALCULATED approximation: it can differ from Umm al-Qura / local moon
// sighting by ±1 day (live Aladhan cross-check, 2026-11-07, Phase 10:
// 9/12 exact matches; 3 differ by exactly 1 day, all with the tabular
// date one day behind Aladhan — 2026-11-07, 2026-06-16, 2025-06-27.
// Ramadan 1447 AGREES on both (2026-02-18). The earlier note claiming
// Umm al-Qura put Ramadan 1447 on 2026-02-19 was not confirmed by the
// live check and must not be quoted.) That is why every date this module
// produces is labelled `confirmation: "calculated"` by the context
// engine, and why admin corrections (corrections.ts) exist. Never
// present a calculated date as locally confirmed.
//
// No network, no AI, no Date.now() inside: every function takes its input
// explicitly, so the same input always yields the same output. The engine
// keeps working even if the AI Gateway is unavailable.

export interface HijriDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-30
}

export interface GregorianDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

// Hijri month names in Bengali (moved from IslamicCalendarPage.tsx).
export const HIJRI_MONTHS_BN: readonly string[] = [
  "মুহাররম",
  "সফর",
  "রবিউল আউয়াল",
  "রবিউস সানি",
  "জমাদিউল আউয়াল",
  "জমাদিউস সানি",
  "রজব",
  "শাবান",
  "রমজান",
  "শাওয়াল",
  "জিলকদ",
  "জিলহজ",
];

// Hijri month names in English (transliterated).
export const HIJRI_MONTHS_EN: readonly string[] = [
  "Muharram",
  "Safar",
  "Rabi al-Awwal",
  "Rabi al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhul Qa'dah",
  "Dhul Hijjah",
];

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Bengali-digit rendering of a non-negative integer (moved from the page). */
export function getBengaliNumber(num: number): string {
  return num
    .toString()
    .split("")
    .map((d) => BENGALI_DIGITS[parseInt(d, 10)])
    .join("");
}

/** Gregorian date -> Hijri date. Moved verbatim from IslamicCalendarPage.tsx. */
export function gregorianToHijri(date: Date): HijriDate {
  const gregorianYear = date.getFullYear();
  const gregorianMonth = date.getMonth();
  const gregorianDay = date.getDate();

  // Julian Day Number calculation
  const a = Math.floor((14 - (gregorianMonth + 1)) / 12);
  const y = gregorianYear + 4800 - a;
  const m = gregorianMonth + 1 + 12 * a - 3;

  const jdn =
    gregorianDay +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  // Convert JDN to Hijri
  const l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
    Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 =
    l2 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hijriMonth = Math.floor((24 * l3) / 709);
  const hijriDay = l3 - Math.floor((709 * hijriMonth) / 24);
  const hijriYear = 30 * n + j - 30;

  return { year: hijriYear, month: hijriMonth, day: hijriDay };
}

/** Hijri date -> Julian Day Number (same epoch/cycle as gregorianToHijri). */
export function hijriToJdn(h: HijriDate): number {
  return (
    h.day +
    Math.ceil(29.5 * (h.month - 1)) +
    (h.year - 1) * 354 +
    Math.floor((3 + 11 * h.year) / 30) +
    1948440 -
    1
  );
}

/** Julian Day Number -> Gregorian date (Richards' inverse of the JDN formula). */
export function jdnToGregorian(jdn: number): GregorianDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

/** Hijri date -> Gregorian date. Throws RangeError on an invalid Hijri date. */
export function hijriToGregorian(h: HijriDate): GregorianDate {
  if (!isValidHijriDate(h)) {
    throw new RangeError(`Invalid Hijri date: ${hijriDateKey(h)}`);
  }
  return jdnToGregorian(hijriToJdn(h));
}

/** Leap years of the 30-year Islamic cycle: (11y + 14) mod 30 < 11. */
export function isHijriLeapYear(year: number): boolean {
  return (11 * year + 14) % 30 < 11;
}

/** Days in a Hijri month: odd months 30, even 29, Dhul Hijjah 30 in leap years. */
export function hijriMonthLength(year: number, month: number): number {
  if (month === 12) return isHijriLeapYear(year) ? 30 : 29;
  return month % 2 === 1 ? 30 : 29;
}

export function isValidHijriDate(h: HijriDate): boolean {
  if (!Number.isInteger(h.year) || !Number.isInteger(h.month) || !Number.isInteger(h.day)) {
    return false;
  }
  if (h.month < 1 || h.month > 12) return false;
  return h.day >= 1 && h.day <= hijriMonthLength(h.year, h.month);
}

/** Shift a Hijri date by n days (negative allowed); handles month/year rollover. */
export function addHijriDays(h: HijriDate, n: number): HijriDate {
  if (!isValidHijriDate(h)) {
    throw new RangeError(`Invalid Hijri date: ${hijriDateKey(h)}`);
  }
  return jdnToHijri(hijriToJdn(h) + n);
}

/** Julian Day Number -> Hijri date (inverse of hijriToJdn, via gregorianToHijri). */
export function jdnToHijri(jdn: number): HijriDate {
  // Reuse the forward algorithm: convert JDN to a Gregorian date, then
  // convert that date with the (verbatim) page algorithm.
  const g = jdnToGregorian(jdn);
  return gregorianToHijri(new Date(g.year, g.month - 1, g.day));
}

/** -1 / 0 / 1 by (year, month, day). */
export function compareHijri(a: HijriDate, b: HijriDate): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/** Stable zero-padded key, e.g. "1447-09-01". */
export function hijriDateKey(h: HijriDate): string {
  return `${h.year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`;
}

/** Stable zero-padded key, e.g. "2026-11-07" (same format as kolkataDateString). */
export function gregorianDateKey(g: GregorianDate): string {
  return `${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`;
}

export function isValidGregorianDate(g: GregorianDate): boolean {
  if (!Number.isInteger(g.year) || !Number.isInteger(g.month) || !Number.isInteger(g.day)) {
    return false;
  }
  if (g.month < 1 || g.month > 12 || g.day < 1) return false;
  const d = new Date(g.year, g.month - 1, g.day);
  return d.getFullYear() === g.year && d.getMonth() === g.month - 1 && d.getDate() === g.day;
}

/** Whole days from Gregorian date a to date b (b - a), via UTC to avoid TZ drift. */
export function gregorianDaysBetween(a: GregorianDate, b: GregorianDate): number {
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}
