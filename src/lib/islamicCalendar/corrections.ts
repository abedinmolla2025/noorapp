// Administrator calendar corrections — local moon-sighting adjustments.
//
// A correction says: for Hijri month M of year Y, the calculated month
// started `dayOffset` days off from the locally sighted moon.
//
// Sign convention (documented with an example because getting it backwards
// shifts every date the wrong way):
//   dayOffset = -1  means the month started ONE DAY LATER than calculated.
//   Example: calculated Ramadan 1 = 2026-02-18, but the moon was sighted a
//   day later, so real Ramadan 1 = 2026-02-19. On 2026-02-19 the calculated
//   date is Ramadan 2, so the true date is calculated + (-1) = Ramadan 1.
//   dayOffset = +1  means the month started ONE DAY EARLIER than calculated.
//
// Rules:
// - Only corrections with status "confirmed" shift the date. A "proposed"
//   correction is recorded but never applied — it is a claim awaiting
//   confirmation, not a fact. This is how calculated and confirmed dates
//   stay separate: the engine never upgrades a calculated date on its own.
// - At most one confirmed correction per (year, month) is honoured: the
//   latest by createdAt wins (then by id for determinism). The table enforces
//   UNIQUE(hijri_year, hijri_month), so in practice there is at most one
//   row — the rule exists so the pure function stays deterministic even if
//   it is handed a hand-built list.
// - AI NEVER creates or confirms a correction. Corrections are entered by an
//   administrator from a sighting report; the engine treats them as input
//   data, never as something to infer. The AI Context Engine (Phase 5) has
//   no role in moon sighting or date confirmation.
// - The corrections table itself is the audit history: every row carries
//   who created it, when, why (reason), from what source, and its status.
//   Nothing is ever deleted from it; a wrong correction is superseded by a
//   newer row, not erased.

import { addHijriDays, hijriDateKey, type HijriDate } from "./hijri.js";
import type { ConfirmationStatus } from "./events.js";

export interface CalendarCorrection {
  id: string;
  hijriYear: number;
  hijriMonth: number; // 1-12
  /** -1 = month started a day later than calculated; +1 = a day earlier. */
  dayOffset: -1 | 0 | 1;
  /** Bengali reason, e.g. "পশ্চিমবঙ্গে চাঁদ দেখা গেছে". */
  reasonBn: string;
  /** Where the sighting was reported, e.g. "Hilal Committee, West Bengal". */
  source: string;
  status: "confirmed" | "proposed";
  createdBy: string | null;
  createdAt: string; // ISO timestamp
}

export interface AppliedCorrections {
  /** The (possibly shifted) Hijri date. */
  date: HijriDate;
  /** Confirmed corrections that were applied, latest first. */
  applied: CalendarCorrection[];
  /** Proposed corrections for this month — recorded, never applied. */
  pending: CalendarCorrection[];
  confirmation: ConfirmationStatus;
}

export function validateCorrection(c: Partial<CalendarCorrection>): string[] {
  const errors: string[] = [];
  if (typeof c.hijriYear !== "number" || !Number.isInteger(c.hijriYear) || c.hijriYear < 1400 || c.hijriYear > 1500) {
    errors.push("hijriYear must be an integer between 1400 and 1500");
  }
  if (typeof c.hijriMonth !== "number" || !Number.isInteger(c.hijriMonth) || c.hijriMonth < 1 || c.hijriMonth > 12) {
    errors.push("hijriMonth must be an integer between 1 and 12");
  }
  if (c.dayOffset !== -1 && c.dayOffset !== 0 && c.dayOffset !== 1) {
    errors.push("dayOffset must be -1, 0, or 1");
  }
  if (typeof c.source !== "string" || c.source.trim() === "") {
    errors.push("source is required");
  }
  if (typeof c.reasonBn !== "string" || c.reasonBn.trim() === "") {
    errors.push("reasonBn is required");
  }
  if (c.status !== "confirmed" && c.status !== "proposed") {
    errors.push('status must be "confirmed" or "proposed"');
  }
  return errors;
}

function compareCorrectionRecency(a: CalendarCorrection, b: CalendarCorrection): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function applyCorrections(
  hijri: HijriDate,
  corrections: readonly CalendarCorrection[],
): AppliedCorrections {
  const forMonth = corrections.filter(
    (c) => c.hijriYear === hijri.year && c.hijriMonth === hijri.month,
  );
  const pending = forMonth
    .filter((c) => c.status === "proposed")
    .sort(compareCorrectionRecency);
  const confirmed = forMonth
    .filter((c) => c.status === "confirmed")
    .sort(compareCorrectionRecency);
  if (confirmed.length === 0) {
    return { date: hijri, applied: [], pending, confirmation: "calculated" };
  }
  const latest = confirmed[confirmed.length - 1];
  const date = latest.dayOffset === 0 ? hijri : addHijriDays(hijri, latest.dayOffset);
  return { date, applied: [latest], pending, confirmation: "confirmed" };
}

/** Human-readable audit line for a correction, e.g. for the admin panel. */
export function correctionAuditLine(c: CalendarCorrection): string {
  return (
    `${c.status === "confirmed" ? "CONFIRMED" : "PROPOSED"} ` +
    `${hijriDateKey({ year: c.hijriYear, month: c.hijriMonth, day: 1 }).slice(0, 7)} ` +
    `offset ${c.dayOffset > 0 ? "+" : ""}${c.dayOffset} ` +
    `(${c.source}) ${c.createdAt}`
  );
}
