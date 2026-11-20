// Admin calendar-corrections reads — small Supabase fetch helpers.
//
// The corrections table (islamic_calendar_corrections) is read directly
// from the browser: RLS allows anyone to read `confirmed` rows, and an
// admin session (is_admin) reads all rows. No edge call is needed for
// reads; writes go through the admin-JWT-gated `calendar_correction`
// edge action (audit-logged, validated server-side).
//
// Row mapping is snake_case -> the lib's CalendarCorrection shape.
// A row that fails the lib's validateCorrection is skipped (never
// applied) — a bad row in the table must not break the planner.

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateCorrection, type CalendarCorrection } from "./corrections.js";

type CorrectionRow = {
  id: string;
  hijri_year: number;
  hijri_month: number;
  day_offset: number;
  reason_bn: string;
  source: string;
  status: string;
  created_by: string | null;
  created_at: string;
};

/** Map one DB row to a CalendarCorrection, or null when the row fails
 *  the lib's validation (a bad row must never break the planner). */
export function mapCorrectionRow(r: CorrectionRow): CalendarCorrection | null {
  const c: CalendarCorrection = {
    id: String(r.id),
    hijriYear: Number(r.hijri_year),
    hijriMonth: Number(r.hijri_month),
    dayOffset: Number(r.day_offset) as -1 | 0 | 1,
    reasonBn: String(r.reason_bn ?? ""),
    source: String(r.source ?? ""),
    status: r.status === "confirmed" ? "confirmed" : "proposed",
    createdBy: r.created_by ?? null,
    createdAt: String(r.created_at ?? ""),
  };
  return validateCorrection(c).length === 0 ? c : null;
}

/** Confirmed corrections only — the set the planner applies. Readable by anyone. */
export async function fetchConfirmedCorrections(
  client: SupabaseClient,
): Promise<CalendarCorrection[]> {
  const { data, error } = await client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("islamic_calendar_corrections" as any)
    .select("id,hijri_year,hijri_month,day_offset,reason_bn,source,status,created_by,created_at")
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as CorrectionRow[])
    .map(mapCorrectionRow)
    .filter((c): c is CalendarCorrection => c !== null);
}

/** All corrections (confirmed + proposed) — admin sessions only (RLS).
 *  Throws on a read error (e.g. the table does not exist yet) so the
 *  admin UI can say so honestly instead of showing an empty list. */
export async function fetchAllCorrections(
  client: SupabaseClient,
): Promise<CalendarCorrection[]> {
  const { data, error } = await client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("islamic_calendar_corrections" as any)
    .select("id,hijri_year,hijri_month,day_offset,reason_bn,source,status,created_by,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!data) return [];
  return (data as CorrectionRow[])
    .map(mapCorrectionRow)
    .filter((c): c is CalendarCorrection => c !== null);
}
