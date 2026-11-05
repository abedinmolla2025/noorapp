/**
 * Asia/Kolkata date math + deterministic, no-repeat selection.
 *
 * No-repeat rule: the eligible pool is shuffled ONCE per pool fingerprint
 * (seeded, deterministic). Each day takes the first item not already used in
 * the current cycle. When every item has been used, the cycle number
 * increments and the rotation restarts. Nothing is ever picked twice inside
 * one cycle, and the same (pool, history) always yields the same pick.
 */

export const KOLKATA_TZ = "Asia/Kolkata";
/** Daily run time, Asia/Kolkata. 06:00 IST == 00:30 UTC (IST has no DST). */
export const DAILY_RUN_HOUR_IST = 6;
export const DAILY_RUN_MINUTE_IST = 0;

/** YYYY-MM-DD in Asia/Kolkata for the given instant. */
export function kolkataDateString(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Next 06:00 Asia/Kolkata run, as an ISO UTC string.
 * IST = UTC+05:30 year-round, so 06:00 IST is 00:30 UTC on the same date.
 */
export function nextDailyRunAt(now: Date = new Date()): string {
  const today = kolkataDateString(now);
  const [y, m, d] = today.split("-").map(Number);
  let runUtc = Date.UTC(y, m - 1, d, 0, 30, 0);
  if (runUtc <= now.getTime()) runUtc += 24 * 3600_000;
  return new Date(runUtc).toISOString();
}

/** FNV-1a 32-bit hash — deterministic across runs and runtimes. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic shuffle (mulberry32 seeded by the pool fingerprint). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick the next unused item from the deterministically shuffled pool.
 * `wrapped` is true when every pool item was already used — the pick then
 * restarts the rotation (the caller advances its stored cycle number and
 * resets the used set to just this pick for the next day).
 */
export function pickNext<T>(
  pool: readonly T[],
  refOf: (item: T) => string,
  usedRefs: ReadonlySet<string>,
): { item: T | null; wrapped: boolean } {
  if (pool.length === 0) return { item: null, wrapped: false };
  const fingerprint = pool.map(refOf).join("|");
  const ordered = seededShuffle(pool, hashString(fingerprint));
  const fresh = ordered.find((item) => !usedRefs.has(refOf(item)));
  if (fresh) return { item: fresh, wrapped: false };
  // Pool exhausted in this cycle: restart from the top (new cycle).
  return { item: ordered[0] ?? null, wrapped: true };
}

/**
 * Pick up to `count` card records with a kind mix: at most 2 per kind,
 * preferring at least one Quran-sourced and one Dua record when available,
 * in seeded order, skipping refs already used this cycle.
 */
export function pickCards<T>(
  pool: readonly T[],
  refOf: (item: T) => string,
  kindOf: (item: T) => string,
  usedRefs: ReadonlySet<string>,
  count: number,
): T[] {
  if (pool.length === 0 || count <= 0) return [];
  const fingerprint = pool.map(refOf).join("|");
  const ordered = seededShuffle(pool, hashString(fingerprint));
  const picked: T[] = [];
  const perKind = new Map<string, number>();
  const seen = new Set<string>();
  // Pass 1: fresh items, max 2 per kind.
  for (const item of ordered) {
    if (picked.length >= count) break;
    const ref = refOf(item);
    if (seen.has(ref) || usedRefs.has(ref)) continue;
    const kind = kindOf(item);
    if ((perKind.get(kind) ?? 0) >= 2) continue;
    picked.push(item);
    seen.add(ref);
    perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
  }
  // Pass 2: relax the per-kind cap (still no repeats, still fresh first).
  if (picked.length < count) {
    for (const item of ordered) {
      if (picked.length >= count) break;
      const ref = refOf(item);
      if (seen.has(ref) || usedRefs.has(ref)) continue;
      picked.push(item);
      seen.add(ref);
    }
  }
  // NOTE: deliberately no pass 3. A card is never duplicated inside one
  // day's set to pad the count — a short pool yields a short (reported) set.
  return picked;
}
