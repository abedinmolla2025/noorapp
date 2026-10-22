import { Coordinates, PrayerTimes, CalculationMethod, Madhab } from "adhan";
import type { CityPageDef } from "./cityPages";

/**
 * Local prayer-time calculation for city pages (P2 pilot).
 *
 * Owner-approved configuration (2026-10-22):
 *  - Library: `adhan` (batoulapps/adhan-js), MIT license.
 *  - Method: University of Islamic Sciences, Karachi (Fajr 18°, Isha 18°) —
 *    the same method the app uses by default on /prayer-times.
 *  - Asr: Hanafi (shadow factor 2) — city pages only; /prayer-times keeps
 *    its existing behavior and is not affected by this module.
 *
 * Parity vs the Aladhan API (method=1, school=1) was verified on 2026-10-22
 * for 8 dates × 6 prayers: maximum absolute difference 1 minute (Dhuhr
 * rounding). See the P2 pilot report for the full table.
 *
 * How dates are handled: `adhan` reads the year/month/day components of the
 * Date it is given, so day objects are constructed as local (y, m, d, noon)
 * — never from a UTC instant — which makes results independent of the
 * viewer's own timezone. Returned instants are formatted in the city's
 * timezone with Intl.
 */

const params = CalculationMethod.Karachi();
params.madhab = Madhab.Hanafi;

export interface CityDayTimes {
  year: number;
  month: number; // 1-12
  day: number;
  hijriDay: number;
  hijriMonthName: string;
  hijriYear: number;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  /** Sunrise -> sunset (Maghrib) length, e.g. "11:30" */
  dayLength: string;
}

const HIJRI_MONTHS_BN = [
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

/** Arithmetic (tabular) Hijri conversion — same verified algorithm as IslamicCalendarPage. */
export const gregorianToHijri = (year: number, month: number, day: number) => {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
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
};

/** Today's (year, month, day) as observed in the city's timezone. */
export const todayInCity = (city: CityPageDef): { year: number; month: number; day: number } => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: city.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
};

const timeFmt = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const getCityDayTimes = (
  city: CityPageDef,
  year: number,
  month: number,
  day: number,
): CityDayTimes => {
  const coords = new Coordinates(city.latitude, city.longitude);
  // Local-component construction (see module note): components are what
  // adhan reads, so the result does not depend on the viewer's timezone.
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const pt = new PrayerTimes(coords, date, params);
  const fmt = timeFmt(city.timeZone);
  const hijri = gregorianToHijri(year, month, day);
  const dayMinutes =
    Math.round((pt.maghrib.getTime() - pt.sunrise.getTime()) / 60000);
  return {
    year,
    month,
    day,
    hijriDay: hijri.day,
    hijriMonthName: HIJRI_MONTHS_BN[hijri.month - 1],
    hijriYear: hijri.year,
    fajr: fmt.format(pt.fajr),
    sunrise: fmt.format(pt.sunrise),
    dhuhr: fmt.format(pt.dhuhr),
    asr: fmt.format(pt.asr),
    maghrib: fmt.format(pt.maghrib),
    isha: fmt.format(pt.isha),
    dayLength: `${Math.floor(dayMinutes / 60)}:${String(dayMinutes % 60).padStart(2, "0")}`,
  };
};

export const getCityMonthTimes = (
  city: CityPageDef,
  year: number,
  month: number,
): CityDayTimes[] => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const out: CityDayTimes[] = [];
  for (let d = 1; d <= daysInMonth; d++) out.push(getCityDayTimes(city, year, month, d));
  return out;
};
