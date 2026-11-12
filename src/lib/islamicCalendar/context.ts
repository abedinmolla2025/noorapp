// Islamic Calendar Intelligence Engine — the context function.
//
// getIslamicContext(gregorianDate, corrections) answers, for one calendar
// day (Asia/Kolkata — the caller supplies the date, so no timezone is
// assumed inside):
//   - the Hijri date (calculated, then shifted by confirmed corrections)
//   - whether that date is calculated or locally confirmed
//   - which event windows are active today, and which are coming up
//   - the Ramadan stage (first / middle / last ten — a DATE RANGE ONLY;
//     no virtue, reward, or "mercy/forgiveness/emancipation" claim is
//     attached; the popular three-stage narration is not asserted here)
//   - whether the day is ordinary (no active event window)
//
// Pure and deterministic: same inputs -> same output. No I/O, no network,
// no AI, no Date.now(). The engine stays fully functional if the AI
// Gateway is down — the AI Context Engine (Phase 5) consumes this output,
// it does not produce it.
//
// Timezone note: the engine works on calendar dates (year/month/day), not
// instants. The caller passes the Asia/Kolkata date (the daily-content
// planner's kolkataDateString, or a Date's local parts). A test pins this:
// the same Gregorian date yields the same context regardless of how the
// Date object was constructed.

import {
  compareHijri,
  gregorianDateKey,
  gregorianDaysBetween,
  gregorianToHijri,
  hijriDateKey,
  hijriMonthLength,
  hijriToGregorian,
  isValidGregorianDate,
  type GregorianDate,
  type HijriDate,
} from "./hijri.js";
import { ISLAMIC_EVENTS, type ConfirmationStatus, type IslamicEventDef } from "./events.js";
import { applyCorrections, type CalendarCorrection } from "./corrections.js";

export type RamadanStage = "first-ten" | "middle-ten" | "last-ten";

export interface ActiveEvent {
  event: IslamicEventDef;
  /** Hijri year the window falls in for this date. */
  windowYear: number;
  windowStart: HijriDate;
  windowEnd: HijriDate;
  /** 1-based day position inside the window. */
  dayInWindow: number;
  windowLength: number;
}

export interface UpcomingEvent {
  event: IslamicEventDef;
  /** Gregorian date the window starts, YYYY-MM-DD. */
  startGregorian: string;
  /** Whole days from today until the window starts (> 0). */
  startsInDays: number;
}

export interface IslamicContext {
  gregorian: GregorianDate;
  gregorianKey: string;
  /** The tabular (calculated) Hijri date, before corrections. */
  hijriCalculated: HijriDate;
  /** The date after confirmed corrections — the date to display. */
  hijri: HijriDate;
  hijriKey: string;
  confirmation: ConfirmationStatus;
  appliedCorrections: CalendarCorrection[];
  pendingCorrections: CalendarCorrection[];
  activeEvents: ActiveEvent[];
  /** Next windows, nearest first (within 60 days, at most 5). */
  upcomingEvents: UpcomingEvent[];
  isOrdinaryDay: boolean;
  ramadanStage: RamadanStage | null;
  /** Always "tabular": the calculated source. */
  source: "tabular";
}

const UPCOMING_WINDOW_DAYS = 60;
const UPCOMING_MAX = 5;

export function parseGregorianDateKey(key: string): GregorianDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const g = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidGregorianDate(g) ? g : null;
}

/** Accepts the planner's kolkataDateString output ("2026-11-07") directly. */
export function getIslamicContextForKey(
  gregorianKey: string,
  corrections: readonly CalendarCorrection[] = [],
): IslamicContext {
  const g = parseGregorianDateKey(gregorianKey);
  if (!g) throw new RangeError(`Invalid Gregorian date key: ${gregorianKey}`);
  return getIslamicContext(g, corrections);
}

export function getIslamicContext(
  gregorian: GregorianDate,
  corrections: readonly CalendarCorrection[] = [],
): IslamicContext {
  if (!isValidGregorianDate(gregorian)) {
    throw new RangeError(`Invalid Gregorian date: ${gregorianDateKey(gregorian)}`);
  }
  const hijriCalculated = gregorianToHijri(
    new Date(gregorian.year, gregorian.month - 1, gregorian.day),
  );
  const applied = applyCorrections(hijriCalculated, corrections);
  const hijri = applied.date;

  const activeEvents: ActiveEvent[] = [];
  for (const event of ISLAMIC_EVENTS) {
    if (hijri.month !== event.hijriMonth) continue;
    if (hijri.day < event.hijriDayStart || hijri.day > event.hijriDayEnd) continue;
    const windowStart: HijriDate = { year: hijri.year, month: event.hijriMonth, day: event.hijriDayStart };
    // Clamp the window end to the real month length: Dhul Hijjah has 29 days
    // in a non-leap year, so a "1-30" window really ends on the 29th.
    const endDay = Math.min(event.hijriDayEnd, hijriMonthLength(hijri.year, event.hijriMonth));
    const windowEnd: HijriDate = { year: hijri.year, month: event.hijriMonth, day: endDay };
    activeEvents.push({
      event,
      windowYear: hijri.year,
      windowStart,
      windowEnd,
      dayInWindow: hijri.day - event.hijriDayStart + 1,
      windowLength: endDay - event.hijriDayStart + 1,
    });
  }

  // Upcoming: for each event, the next window start on/after today.
  const upcoming: UpcomingEvent[] = [];
  for (const event of ISLAMIC_EVENTS) {
    for (const yearOffset of [0, 1]) {
      const start: HijriDate = {
        year: hijri.year + yearOffset,
        month: event.hijriMonth,
        day: event.hijriDayStart,
      };
      if (compareHijri(start, hijri) <= 0) continue; // starts today or earlier
      const startGregorian = hijriToGregorian(start);
      const startsInDays = gregorianDaysBetween(gregorian, startGregorian);
      if (startsInDays > 0 && startsInDays <= UPCOMING_WINDOW_DAYS) {
        upcoming.push({ event, startGregorian: gregorianDateKey(startGregorian), startsInDays });
      }
      break; // the first future year for this event is the next occurrence
    }
  }
  upcoming.sort((a, b) => a.startsInDays - b.startsInDays || a.event.slug.localeCompare(b.event.slug));

  const ramadanStage: RamadanStage | null =
    hijri.month === 9
      ? hijri.day <= 10
        ? "first-ten"
        : hijri.day <= 20
          ? "middle-ten"
          : "last-ten"
      : null;

  return {
    gregorian,
    gregorianKey: gregorianDateKey(gregorian),
    hijriCalculated,
    hijri,
    hijriKey: hijriDateKey(hijri),
    confirmation: applied.confirmation,
    appliedCorrections: applied.applied,
    pendingCorrections: applied.pending,
    activeEvents,
    upcomingEvents: upcoming.slice(0, UPCOMING_MAX),
    isOrdinaryDay: activeEvents.length === 0,
    ramadanStage,
    source: "tabular",
  };
}

/** Convenience: context for "today" from a Date (local parts, e.g. Kolkata). */
export function getIslamicContextForDate(
  date: Date,
  corrections: readonly CalendarCorrection[] = [],
): IslamicContext {
  return getIslamicContext(
    { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
    corrections,
  );
}

/** The active event slugs for a context, e.g. ["ramadan-month", "last-ten-nights"]. */
export function activeEventSlugs(ctx: IslamicContext): string[] {
  return ctx.activeEvents.map((a) => a.event.slug);
}
