import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import webpush from "https://esm.sh/web-push@3.6.7?bundle";

/* ------------------------------------------------------------------
 * daily-content — Daily Islamic Content Automation (NOT YET DEPLOYED).
 * Local implementation only. Deploying this function, running the
 * migration, and registering the 06:00 Asia/Kolkata cron are separately
 * approved launch steps (see docs/daily-content/PRODUCTION-READINESS.md).
 *
 * Behaviour:
 *  - One publication per Asia/Kolkata date (UNIQUE kolkata_date).
 *  - Exactly one eligible hadith (Arabic + Bengali + number + book key;
 *    no grade is ever claimed — the table carries none).
 *  - 3-5 share cards from eligible admin_content duas (Arabic + Bengali
 *    + reference + slug; reference comes from metadata.reference/source).
 *  - Web push only, to enabled device_push_tokens, at most one per
 *    device per day (UNIQUE(publication_id, device_id)), honouring
 *    daily_content_preferences.daily_enabled = false as an opt-out.
 *  - Dead tokens (404/410/401/403) are disabled; 429/5xx are retryable
 *    (max 3 attempts, 5/15/45 min backoff) via { retry_only: true } runs.
 *  - { dry_run: true } plans everything, writes nothing, sends nothing.
 * Logic mirrors src/lib/dailyContent/* — keep the two in sync.
 *
 * Publication state machine (all transitions date-scoped; the unique
 * date is never violated, so no schema change was needed):
 *  - (none) --daily run, valid plan--> planned --send finishes--> published
 *  - (none) --daily run, no valid plan--> failed (one row per date; a
 *    later same-date run with a valid plan repairs it in place, it does
 *    NOT insert a second row and the date is never blocked)
 *  - planned --daily run, same date--> adopted (stored push is sent;
 *    never re-planned mid-flight) or repaired in place (corrupt row
 *    without a push, or failed row, rewritten to the fresh plan)
 *  - planned --tick, same date--> pending deliveries promoted to
 *    retryable and sent by the tick; the row itself stays planned
 *    (a tick NEVER adopts content, plans, publishes, or creates a row)
 *  - planned --tick, past date--> failed ("superseded") + its pending
 *    AND retryable deliveries failed, so no stale notification can
 *    survive supersede. Stale content is NEVER reused as another day's
 *    publication. As defense-in-depth, runRetries also refuses any
 *    delivery whose parent publication is missing or failed, closing
 *    such rows terminally — so even a supersede that fails halfway
 *    cannot later send stale content.
 *  - pending --daily adoption OR tick--> retryable (due now) --> sent
 *    / failed / disabled (410 disables the token; attempts cap at 4)
 *  - retryable sends are claimed atomically (H2): one conditional
 *    UPDATE moves next_attempt_at 10 minutes out (the lease) only if
 *    the row is still retryable, under the cap, and due. Exactly one
 *    overlapping worker matches a row; losers match zero rows and skip.
 *    A crashed worker's lease expires on its own. No new column, status,
 *    RPC, or migration is needed for this claim.
 *  - sent / failed / disabled are terminal; the per-device cap and the
 *    token pre-check make re-runs skip already-attempted devices.
 *  - Zero-row rule (H3): a success claim needs row proof. A sent update
 *    or a publication flip matching zero rows is treated as a failure,
 *    never counted as success; a repair matching zero rows means
 *    another run won the race and triggers re-resolution, never a
 *    clobber. Promotion matching zero rows is a normal empty outcome,
 *    and its count always comes from actually returned rows.
 *  - Residual at-least-once window (by design, no transaction spans
 *    the push provider and the database): a crash after the provider
 *    accepts a message but before its row flips to sent means the
 *    retry tick re-sends that device once. Systematic duplicates are
 *    prevented; this single window is not. A further microsecond window
 *    remains between the post-claim parent re-check and the provider
 *    call; no database mechanism can close it without provider-side
 *    idempotency.
 *
 * DECIDED OWNER POLICIES (launch preparation; both now implemented):
 *  - Pause stops retry ticks: the settings gate applies to the retry
 *    branch exactly as to the daily branch, so a paused system sends
 *    nothing at all. Dry-run stays read-only and is unaffected.
 *  - retry_only + dry_run combined is a client error (400) at both
 *    the endpoint and the edge: it performs no planning, publication,
 *    or sending.
 * ------------------------------------------------------------------ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("WEBPUSH_VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("WEBPUSH_VAPID_PRIVATE_KEY")!;

// Push timeout (hardening B): every provider call is bounded at most
// half the 10-minute retry lease, so a hung provider cannot hold a
// claimed row past its lease and invite a second worker to send the
// same delivery. Default 30 seconds; overridable per deployment via
// DAILY_CONTENT_PUSH_TIMEOUT_MS (milliseconds) — production leaves it
// unset. Values above 300,000 ms are clamped to 300,000 ms, not honored:
// the documented 600,000 ms ceiling is not a safe setting (a response
// arriving at the lease boundary plus timer slop could double-send),
// and anything above the lease breaks the guarantee outright. Invalid
// values fall back to the default. The race below never retries
// inside the call: on timeout the
// single attempt ends, the error carries no status code, and the
// existing classification treats it as retryable without disabling
// the token. The underlying request may still complete late (provider
// accepted), but that late completion touches no database state — it
// can neither resurrect nor overwrite a terminal row. It can only
// produce the documented at-least-once re-send on the next tick.
const PUSH_TIMEOUT_MS_DEFAULT = 30_000;
const PUSH_TIMEOUT_MS_MAX = 300_000;
// Exported for the edge regression tests only; the deployed handler
// uses it through sendPushWithTimeout.
export function pushTimeoutMs(): number {
  const raw = Number(Deno.env.get("DAILY_CONTENT_PUSH_TIMEOUT_MS") ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return PUSH_TIMEOUT_MS_DEFAULT;
  return Math.min(Math.floor(raw), PUSH_TIMEOUT_MS_MAX);
}
async function sendPushWithTimeout(sub: unknown, payload: string): Promise<{ statusCode?: number }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      webpush.sendNotification(sub, payload, { TTL: 86400, urgency: "normal" } as never) as Promise<{ statusCode?: number }>,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Push request timed out")), pushTimeoutMs());
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
const CRON_SECRET = Deno.env.get("DAILY_CONTENT_CRON_SECRET") ?? "";
const DEFAULT_ICON = "https://www.noorapp.in/notification-icon.png";
const DEFAULT_BADGE = "https://www.noorapp.in/badge-icon.png";

webpush.setVapidDetails("https://noorapp.in", VAPID_PUBLIC, VAPID_PRIVATE);

const hasText = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

function kolkataDateString(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
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

const EMOJI_RE =
  // eslint-disable-next-line no-misleading-character-class -- Second class intentionally lists emoji modifiers (variation selector, ZWJ, keycap, combining marks) that combine with the preceding emoji; clamp behavior is covered by push-clamp tests.
  /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\u2764\u262A\u2190-\u21AA][\uFE0F\u200D\u20E3\u0301-\u036F]*/gu;
function clampText(text: string, maxUnits: number): string {
  let out = text;
  const width = (s: string) => {
    let n = 0;
    for (const ch of s) n += ch.codePointAt(0)! > 0xffff ? 2 : 1;
    return n;
  };
  while (width(out) > maxUnits || (out.match(EMOJI_RE)?.length ?? 0) > 1) {
    out = out.replace(/[\s.!?,;-]+$/, "");
    if (out.length <= 3) return out;
    out = out.slice(0, -2);
  }
  return out;
}

const BOOK_NAMES: Record<string, string> = {
  bukhari: "Sahih al-Bukhari",
  muslim: "Sahih Muslim",
};

// ---- Phase 9 — Islamic context (ported from src/lib/islamicCalendar) ----
// The edge function is a standalone Deno function: it cannot import from
// src/lib (same constraint as the recommend function, D-18/D-21). This
// section is a minimal, self-contained port of the deterministic core the
// daily plan needs: the tabular Hijri conversion, the 16-event catalog
// (slugs + windows only), and the context assembly. It carries NO
// corrections (an approved run's stored context already reflects any
// correction applied at generation time) and NO AI. Every date it produces
// is labelled confirmation: "calculated" — never presented as locally
// confirmed. Equivalence with the lib is pinned by edge tests (the
// dry-run's plan.context vs the lib's getIslamicContextForKey over a date
// list); if the port and the lib ever disagree, the test fails.

// Tabular Hijri conversion (Kuwaiti / Islamic-civil algorithm), ported
// VERBATIM from src/lib/islamicCalendar/hijri.ts — same arithmetic, but
// taking Gregorian parts directly (the lib takes a Date; the edge works
// from the "YYYY-MM-DD" Kolkata key, so the parts are explicit and no
// timezone is involved).
function edgeGregorianToHijri(year: number, month: number, day: number): { year: number; month: number; day: number } {
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
}

function edgeIsHijriLeapYear(year: number): boolean {
  return (11 * year + 14) % 30 < 11;
}

function edgeHijriMonthLength(year: number, month: number): number {
  if (month === 12) return edgeIsHijriLeapYear(year) ? 30 : 29;
  return month % 2 === 1 ? 30 : 29;
}

// Event windows (slug, Hijri month, inclusive day range) — the same 16
// entries, in the same order, as src/lib/islamicCalendar/events.ts. Only
// the fields the plan needs are carried here; names and descriptions stay
// in the lib. Qadr is a window (21-30), never a fixed night.
const EDGE_ISLAMIC_EVENTS: ReadonlyArray<{ slug: string; hijriMonth: number; hijriDayStart: number; hijriDayEnd: number }> = [
  { slug: "islamic-new-year", hijriMonth: 1, hijriDayStart: 1, hijriDayEnd: 1 },
  { slug: "ashura", hijriMonth: 1, hijriDayStart: 10, hijriDayEnd: 10 },
  { slug: "mawlid", hijriMonth: 3, hijriDayStart: 12, hijriDayEnd: 12 },
  { slug: "miraj", hijriMonth: 7, hijriDayStart: 27, hijriDayEnd: 27 },
  { slug: "shabe-barat", hijriMonth: 8, hijriDayStart: 15, hijriDayEnd: 15 },
  { slug: "ramadan-start", hijriMonth: 9, hijriDayStart: 1, hijriDayEnd: 1 },
  { slug: "laylatul-qadr", hijriMonth: 9, hijriDayStart: 21, hijriDayEnd: 30 },
  { slug: "eid-fitr", hijriMonth: 10, hijriDayStart: 1, hijriDayEnd: 1 },
  { slug: "arafah", hijriMonth: 12, hijriDayStart: 9, hijriDayEnd: 9 },
  { slug: "eid-adha", hijriMonth: 12, hijriDayStart: 10, hijriDayEnd: 10 },
  { slug: "ramadan-month", hijriMonth: 9, hijriDayStart: 1, hijriDayEnd: 30 },
  { slug: "last-ten-nights", hijriMonth: 9, hijriDayStart: 21, hijriDayEnd: 30 },
  { slug: "first-ten-dhul-hijjah", hijriMonth: 12, hijriDayStart: 1, hijriDayEnd: 10 },
  { slug: "hajj", hijriMonth: 12, hijriDayStart: 8, hijriDayEnd: 13 },
  { slug: "dhul-hijjah-month", hijriMonth: 12, hijriDayStart: 1, hijriDayEnd: 30 },
  { slug: "rabi-ul-awwal-month", hijriMonth: 3, hijriDayStart: 1, hijriDayEnd: 30 },
];

/** The day's Islamic context for a Kolkata date: Hijri date, active event
 *  slugs (catalog order, window end clamped to the real month length),
 *  and the Ramadan stage (date range only — no virtue claims attached).
 *  Mirrors the lib's getIslamicContext (without corrections). */
export function islamicContextForKolkataDate(kolkataDate: string): {
  gregorianKey: string;
  hijriKey: string;
  hijri: { year: number; month: number; day: number };
  confirmation: "calculated";
  activeEventSlugs: string[];
  ramadanStage: "first-ten" | "middle-ten" | "last-ten" | null;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(kolkataDate);
  const gy = m ? Number(m[1]) : 1970;
  const gm = m ? Number(m[2]) : 1;
  const gd = m ? Number(m[3]) : 1;
  const hijri = edgeGregorianToHijri(gy, gm, gd);
  const monthLen = edgeHijriMonthLength(hijri.year, hijri.month);
  const activeEventSlugs = EDGE_ISLAMIC_EVENTS.filter(
    (e) =>
      e.hijriMonth === hijri.month &&
      hijri.day >= e.hijriDayStart &&
      hijri.day <= Math.min(e.hijriDayEnd, monthLen),
  ).map((e) => e.slug);
  const ramadanStage =
    hijri.month === 9
      ? hijri.day <= 10
        ? "first-ten"
        : hijri.day <= 20
          ? "middle-ten"
          : "last-ten"
      : null;
  return {
    gregorianKey: kolkataDate,
    hijriKey: `${hijri.year}-${String(hijri.month).padStart(2, "0")}-${String(hijri.day).padStart(2, "0")}`,
    hijri,
    confirmation: "calculated",
    activeEventSlugs,
    ramadanStage,
  };
}

interface HadithRow {
  id: string;
  book_key: string;
  chapter_id: number;
  hadith_number: number;
  arabic: string;
  bengali: string | null;
}
interface DuaRow {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  content: string | null;
  content_arabic: string | null;
  metadata: Record<string, unknown> | null;
}

function eligibleHadith(h: HadithRow): boolean {
  return (
    hasText(h.id) &&
    hasText(h.book_key) &&
    Number.isInteger(h.hadith_number) &&
    h.hadith_number > 0 &&
    hasText(h.arabic) &&
    hasText(h.bengali)
  );
}

function mapDua(row: DuaRow) {
  const meta = row.metadata ?? {};
  const reference =
    (typeof meta.reference === "string" && meta.reference) ||
    (typeof meta.source === "string" && meta.source) ||
    null;
  const sourceType =
    (typeof meta.source_type === "string" && meta.source_type) || "Dua";
  return {
    slug: row.slug,
    title_bn: row.title,
    title_en: row.title_en,
    arabic: row.content_arabic ?? "",
    translation_bn: row.content,
    reference,
    source_type: sourceType,
  };
}
function eligibleDua(
  d: ReturnType<typeof mapDua>,
): boolean {
  return (
    hasText(d.slug) &&
    hasText(d.arabic) &&
    hasText(d.translation_bn) &&
    hasText(d.reference)
  );
}

function duaKind(sourceType: string): string {
  const st = sourceType.toLowerCase();
  if (st === "quran" || st === "qur'an") return "quran";
  if (st === "hadith") return "hadith";
  return "dua";
}

function excerpt(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return clean.slice(0, maxChars - 1).trimEnd() + "…";
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type Svc = ReturnType<typeof createClient>;

/**
 * H3: share-card selection with cycle wrap. Seeded order, max 2 per kind
 * on the first pass, 4 target, never duplicated in a day. When the whole
 * eligible pool is already used in the current cycle, the old inline loop
 * returned zero cards forever (the pool silently emptied). Now the
 * selection restarts with an empty used set and reports `wrapped: true`,
 * so the caller advances cardCycle — the same rule the hadith rotation
 * and the TS lib's planDay already use. An empty pool stays empty: no
 * cards are ever invented.
 */
/**
 * One share card for an eligible dua. The single builder for the card
 * shape — selectShareCards and the Phase 9 approved-run merge both use
 * it, so a card from an approved run is identical to a seeded card.
 */
function contentCard(d: ReturnType<typeof mapDua>): Record<string, unknown> {
  const kind = duaKind(d.source_type);
  const title = (d.title_bn ?? "").trim() || (d.title_en ?? "").trim();
  const bengali = (d.translation_bn ?? "").trim();
  return {
    kind,
    recordRef: `content:${d.slug}`,
    title,
    arabic: (d.arabic ?? "").trim(),
    bengali,
    sourceLine: (d.reference ?? "").trim(),
    canonicalLink: `/dua/${d.slug}`,
    altText: `${kind === "quran" ? "কুরআনের আয়াত" : kind === "hadith" ? "হাদিস" : "দোয়া"}: ${excerpt(bengali, 80)} — ${(d.reference ?? "").trim()}`,
    caption: `🤲 ${title}\n${bengali}\n📖 ${(d.reference ?? "").trim()}\n🔗 https://noorapp.in/dua/${d.slug}\n— NoorApp`,
  };
}

export function selectShareCards(
  eligible: Array<ReturnType<typeof mapDua>>,
  used: ReadonlySet<string>,
): { cards: Array<Record<string, unknown>>; wrapped: boolean } {
  const ordered = seededShuffle(
    eligible,
    hashString(eligible.map((d) => `content:${d.slug}`).join("|")),
  );
  const run = (blocked: ReadonlySet<string>) => {
    const cards: Array<Record<string, unknown>> = [];
    const perKind = new Map<string, number>();
    const seen = new Set<string>();
    for (const pass of [0, 1]) {
      for (const d of ordered) {
        if (cards.length >= 4) break;
        const ref = `content:${d.slug}`;
        if (seen.has(ref) || blocked.has(ref)) continue;
        const kind = duaKind(d.source_type);
        if (pass === 0 && (perKind.get(kind) ?? 0) >= 2) continue;
        cards.push(contentCard(d));
        seen.add(ref);
        perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
      }
    }
    return cards;
  };
  const first = run(used);
  if (first.length === 0 && eligible.length > 0 && used.size > 0) {
    return { cards: run(new Set()), wrapped: true };
  }
  return { cards: first, wrapped: false };
}

// Phase 2 — planner pool pagination. The hadiths table holds 7,220
// eligible rows (Q7, owner-run 2026-11-06) but the planner used a single
// .limit(5000) query, hiding 2,220 of them. A single raised limit is not
// a safe fix: PostgREST's default db-max-rows is 1,000, so a large limit
// may silently return fewer rows than requested — the effective pool may
// already be 1,000 rather than 5,000, which only a real-data dry-run can
// settle (the dry-run plan reports hadithPool). Keyset pagination on
// hadith_number — unique across all 7,220 rows (Q9, 2026-11-06) and the
// planner's sort key — fetches the complete pool in bounded 1,000-row
// pages that no max-rows setting can truncate. Deterministic: same rows,
// same order, every run. The seeded shuffle still runs over the full
// eligible pool, so no-repeat/cycle behavior is unchanged; only the pool
// grows (5,000 -> 7,220), which changes the shuffle seed and therefore
// which hadith a given date picks. That is expected: no publication
// exists yet, so no cycle state depends on the old pool.
const HADITH_POOL_PAGE_SIZE = 1000;
const HADITH_POOL_MAX_PAGES = 50; // 50,000-row runaway guard (corpus is 7,220)

async function fetchHadithPool(svc: Svc): Promise<{ rows: HadithRow[]; truncated: boolean }> {
  const rows: HadithRow[] = [];
  let after: number | null = null;
  for (let page = 0; page < HADITH_POOL_MAX_PAGES; page++) {
    let q = svc
      .from("hadiths")
      .select("id, book_key, chapter_id, hadith_number, arabic, bengali")
      .order("hadith_number", { ascending: true })
      .limit(HADITH_POOL_PAGE_SIZE);
    if (after !== null) q = q.gt("hadith_number", after);
    const { data } = await q;
    const pageRows = (data ?? []) as HadithRow[];
    rows.push(...pageRows);
    if (pageRows.length < HADITH_POOL_PAGE_SIZE) return { rows, truncated: false };
    const last = pageRows[pageRows.length - 1].hadith_number;
    // Defensive: a non-numeric last number means any remaining rows sort
    // after it only by NULL ordering and are ineligible anyway
    // (eligibility requires hadith_number > 0; Q7 showed zero such rows).
    // Stop rather than issuing a gt(null) that PostgREST would reject.
    if (typeof last !== "number" || !Number.isFinite(last)) return { rows, truncated: false };
    after = last;
  }
  return { rows, truncated: true };
}

// Phase 3 — opt-out reads must be provably complete. Both send paths
// read daily_content_preferences with NO limit, so PostgREST's default
// 1,000-row cap could silently omit opt-outs: a device that opted out
// would still be sent to. Keyset pagination on device_id — the table's
// text primary key — fetches every opted-out device in bounded 1,000-row
// pages. The set is snapshotted once per send/tick; an opt-out landing
// mid-send is now caught by the S-6 re-check immediately before each
// send (isDeviceOptedOut below). The 50-page bound is a
// runaway guard: unlike the hadith pool, a partial opt-out set is never
// acceptable (it would send to opted-out devices), so hitting the bound
// throws and the whole send fails closed instead of sending partially.

// Phase 2 / S-6 (2026-11-10) — opt-out RE-CHECK, immediately before
// each provider send. The snapshot above closes the race for opt-outs
// that exist when the send starts; an opt-out landing mid-send used
// to apply only on the next tick. This single-row read runs AFTER
// the delivery row is claimed and BEFORE the provider call, in both
// sendToTokens (first send) and runRetries (retry tick). A device
// that opted out after the snapshot is skipped and its delivery row
// is closed terminally (status 'failed', error 'device opted out of
// daily content') so it is never sent and never re-read. The residual
// window is the microseconds between this read and the provider call
// — no database mechanism can close that without provider-side
// idempotency, and it is documented in PHASE2-SECURITY-COMPLETION-REPORT.md.
async function isDeviceOptedOut(svc: Svc, deviceId: string): Promise<boolean> {
  const { data } = await svc
    .from("daily_content_preferences")
    .select("device_id")
    .eq("device_id", deviceId)
    .eq("daily_enabled", false)
    .maybeSingle();
  return data != null;
}
const OPT_OUT_PAGE_SIZE = 1000;
const OPT_OUT_MAX_PAGES = 50; // 50,000 opted-out devices (fleet is 48 tokens)

async function fetchOptedOutDeviceIds(svc: Svc): Promise<Set<string>> {
  const optedOut = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < OPT_OUT_MAX_PAGES; page++) {
    let q = svc
      .from("daily_content_preferences")
      .select("device_id, daily_enabled")
      .eq("daily_enabled", false)
      .order("device_id", { ascending: true })
      .limit(OPT_OUT_PAGE_SIZE);
    if (after !== null) q = q.gt("device_id", after);
    const { data } = await q;
    const rows = (data ?? []) as Array<{ device_id: string }>;
    for (const r of rows) if (hasText(r.device_id)) optedOut.add(r.device_id);
    if (rows.length < OPT_OUT_PAGE_SIZE) return optedOut;
    after = rows[rows.length - 1].device_id;
  }
  throw new Error(
    "Opt-out set exceeds the 50,000-device safety bound; refusing to send from a partial opt-out set.",
  );
}

const TOKEN_PAGE_SIZE = 1000;
const TOKEN_MAX_PAGES = 50;

type TokenRow = { id: string; token: string; platform: string; device_id: string | null };

// Phase 7 — the token fetch is keyset-paged on the token id (UUID PK),
// like the opt-out fetch. The old single `.limit(5000)` query was
// silently capped at 1,000 rows by PostgREST's default max-rows, so
// devices past the 1,000th token would never receive a push. Unlike the
// opt-out set — where a partial set is UNSAFE and the run must fail — a
// truncated token set is a completeness issue, not a safety one: the
// fetched devices still get their push, and the truncation is reported
// (tokensTruncated) instead of hidden. The 50,000-token bound is a
// runaway guard, far above the 48-token fleet.
async function fetchEnabledWebTokens(svc: Svc): Promise<{ rows: TokenRow[]; truncated: boolean }> {
  const rows: TokenRow[] = [];
  let after: string | null = null;
  for (let page = 0; page < TOKEN_MAX_PAGES; page++) {
    let q = svc
      .from("device_push_tokens")
      .select("id, token, platform, device_id")
      .eq("enabled", true)
      .eq("platform", "web")
      .order("id", { ascending: true })
      .limit(TOKEN_PAGE_SIZE);
    if (after !== null) q = q.gt("id", after);
    const { data } = await q;
    const pageRows = (data ?? []) as TokenRow[];
    rows.push(...pageRows);
    if (pageRows.length < TOKEN_PAGE_SIZE) return { rows, truncated: false };
    after = pageRows[pageRows.length - 1].id;
  }
  return { rows, truncated: true };
}

// Phase 3 — user-facing opt-out. The browser proves ownership by
// presenting its own push subscription endpoint (only its own Push API
// registration can produce it); the server resolves the endpoint to
// device_ids from ITS OWN device_push_tokens table and writes the
// preference with the service role. The client never writes preferences
// directly (no client RLS write path exists) and never asserts a bare
// device_id — a bare device_id is a random localStorage UUID anyone can
// present, so it proves nothing. The token scan is keyset-paged on the
// token id (UUID primary key); a truncated scan can only miss a device
// (caller gets a 404), never write a wrong preference.
async function resolveDeviceIdsByEndpoint(svc: Svc, endpoint: string): Promise<Set<string>> {
  const deviceIds = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < OPT_OUT_MAX_PAGES; page++) {
    let q = svc
      .from("device_push_tokens")
      .select("id, token, device_id")
      .order("id", { ascending: true })
      .limit(OPT_OUT_PAGE_SIZE);
    if (after !== null) q = q.gt("id", after);
    const { data } = await q;
    const rows = (data ?? []) as Array<{ id: string; token: string; device_id: string | null }>;
    for (const r of rows) {
      if (!hasText(r.device_id)) continue;
      let sub: { endpoint?: unknown } | null = null;
      try {
        sub = JSON.parse(String(r.token)) as { endpoint?: unknown };
      } catch {
        continue;
      }
      if (sub && typeof sub.endpoint === "string" && sub.endpoint === endpoint) {
        deviceIds.add(r.device_id);
      }
    }
    if (rows.length < OPT_OUT_PAGE_SIZE) return deviceIds;
    after = rows[rows.length - 1].id;
  }
  return deviceIds;
}

async function handlePreferenceAction(svc: Svc, body: Record<string, unknown>): Promise<Response> {
  const action = body.action === "opt_out" ? "opt_out" : body.action === "opt_in" ? "opt_in" : body.action === "status" ? "status" : null;
  if (!action) {
    return jsonResponse({ ok: false, error: "action must be 'opt_out', 'opt_in' or 'status'" }, 400);
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint || !endpoint.startsWith("https://")) {
    return jsonResponse({ ok: false, error: "a valid https endpoint is required" }, 400);
  }
  const deviceIds = await resolveDeviceIdsByEndpoint(svc, endpoint);
  if (deviceIds.size === 0) {
    return jsonResponse({ ok: false, error: "no subscription found for this endpoint" }, 404);
  }
  if (action === "status") {
    // Phase 7 — read-only: returns this subscription's daily preference
    // so the toggle can show the server's value instead of a local hint.
    // Absent row = never opted out = daily on. If ANY of the resolved
    // device_ids is opted out, the subscription is off.
    const { data: prefRows } = await svc.from("daily_content_preferences")
      .select("device_id, daily_enabled")
      .in("device_id", [...deviceIds]);
    const dailyEnabled = !((prefRows ?? []) as Array<{ daily_enabled: boolean }>).some((r) => r.daily_enabled === false);
    return jsonResponse({ ok: true, action, devices: deviceIds.size, daily_enabled: dailyEnabled });
  }
  // Daily-content scope only: this never touches device_push_tokens.enabled,
  // so prayer notifications (a different system) are unaffected. Opt-out
  // works while the automation is paused — the settings gate does not
  // apply to this path — so a user can always withdraw.
  const dailyEnabled = action === "opt_in";
  for (const deviceId of deviceIds) {
    const { error } = await svc
      .from("daily_content_preferences")
      .upsert({ device_id: deviceId, daily_enabled: dailyEnabled } as never);
    if (error) return jsonResponse({ ok: false, error: "failed to save preference" }, 500);
  }
  // The response carries counts only — never the endpoint or device_ids.
  return jsonResponse({ ok: true, action, devices: deviceIds.size, daily_enabled: dailyEnabled });
}

// ---- Phase 9 — approved recommendation runs (daily automation) ----
// The daily planner consumes APPROVED runs; it never calls the AI and
// never calls the recommend function (that function is admin-gated —
// D-23 — and the daily edge holds no admin JWT). The run is advisory,
// never mandatory: every ref is re-validated against the live pools and
// the current-cycle dedupe, and a short or stale run falls back to the
// seeded selection slot by slot, so a bad run can never empty the day.

interface ApprovedRunRow {
  id: string;
  kolkata_date: string;
  hijri_key: string;
  context: Record<string, unknown>;
  recommendations: Array<{ kind?: string | null; ref?: string | null }>;
  status: string;
  created_at: string;
}

/** The newest approved run for the date, or null. */
async function fetchApprovedRun(svc: Svc, kolkataDate: string): Promise<ApprovedRunRow | null> {
  const { data } = await svc
    .from("daily_content_recommendations")
    .select("id, kolkata_date, hijri_key, context, recommendations, dropped, status, created_by, created_at")
    .eq("kolkata_date", kolkataDate)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as ApprovedRunRow | null;
}

/** The hadith ref the run recommends (first well-formed "hadith:<id>"), or null. */
function approvedHadithRef(run: ApprovedRunRow | null): string | null {
  if (!run || !Array.isArray(run.recommendations)) return null;
  for (const r of run.recommendations) {
    if (r?.kind === "hadith" && typeof r.ref === "string" && r.ref.startsWith("hadith:")) {
      const id = r.ref.slice("hadith:".length);
      if (id) return r.ref;
    }
  }
  return null;
}

/** The run's content cards, in the run's order (at most 4 — the hadith
 *  card takes the fifth slot). Each ref is looked up in the live eligible
 *  pool: a ref that is missing or no longer eligible is skipped, never
 *  fabricated. Cards are built by the same contentCard builder the seeded
 *  selection uses. */
function approvedContentCards(
  run: ApprovedRunRow | null,
  eligible: Array<ReturnType<typeof mapDua>>,
): Array<Record<string, unknown>> {
  if (!run || !Array.isArray(run.recommendations)) return [];
  const byRef = new Map(eligible.map((d) => [`content:${d.slug}`, d] as const));
  const cards: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const r of run.recommendations) {
    if (cards.length >= 4) break;
    if (r?.kind !== "content" || typeof r.ref !== "string" || !r.ref.startsWith("content:")) continue;
    if (seen.has(r.ref)) continue;
    const d = byRef.get(r.ref);
    if (!d) continue;
    cards.push(contentCard(d));
    seen.add(r.ref);
  }
  return cards;
}

async function planDay(svc: Svc, kolkataDate: string) {
  // The day's Islamic context (pure, no I/O) — recorded on every plan
  // return, including the fail-closed truncated path below.
  const context = islamicContextForKolkataDate(kolkataDate);
  const hadithPool = await fetchHadithPool(svc);
  const hadithRows = hadithPool.rows;
  const eligibleH = (hadithRows as HadithRow[]).filter(eligibleHadith);
  if (hadithPool.truncated) {
    // Fail closed: never plan from a partial pool. This path is
    // unreachable for the closed 7,220-row Bukhari corpus; it exists
    // only as a runaway guard. The handler records it as a failed row
    // with this reason (see the !plan.hadith branch) and sends nothing.
    // Dua counts are 0 here because the dua query never ran on this path.
    return {
      kolkataDate,
      source: "seeded",
      hadithSource: "seeded",
      cardsSource: "seeded",
      recommendationId: null,
      context,
      hadith: null,
      hadithEmptyReason:
        "Hadith pool exceeds the 50,000-row safety bound (50 pages of 1,000 rows); refusing to plan from a partial pool.",
      cards: [],
      push: null,
      hadithCycle: 1,
      cardCycle: 1,
      diagnostics: {
        hadithPool: hadithRows.length,
        hadithEligible: eligibleH.length,
        duaPool: 0,
        duaEligible: 0,
        hadithPoolTruncated: true,
        approvedRun: false,
        approvedHadithSkipped: null,
      },
    };
  }

  const { data: duaRows } = await svc
    .from("admin_content")
    .select("id, slug, title, title_en, content, content_arabic, metadata")
    .eq("status", "published")
    .in("content_type", ["dua", "Dua"])
    .limit(5000);
  const eligibleD = ((duaRows ?? []) as DuaRow[]).map(mapDua).filter(eligibleDua);

  // Current-cycle history (rows of the current cycle only).
  const { data: pubs } = await svc
    .from("daily_content_publications")
    .select("hadith_ref, cards, hadith_cycle, card_cycle, status")
    .eq("status", "published")
    .order("kolkata_date", { ascending: false })
    .limit(500);
  const rows = (pubs ?? []) as Array<{
    hadith_ref: string | null;
    cards: Array<{ recordRef: string }> | null;
    hadith_cycle: number;
    card_cycle: number;
  }>;
  const hadithCycle = rows.length ? Math.max(...rows.map((r) => r.hadith_cycle ?? 1)) : 1;
  const cardCycle = rows.length ? Math.max(...rows.map((r) => r.card_cycle ?? 1)) : 1;
  const hadithUsed = new Set(
    rows.filter((r) => r.hadith_cycle === hadithCycle).map((r) => r.hadith_ref).filter(Boolean) as string[],
  );
  const cardUsed = new Set(
    rows
      .filter((r) => r.card_cycle === cardCycle)
      .flatMap((r) => (r.cards ?? []).map((c) => c.recordRef)),
  );

  // Phase 9 — the newest approved recommendation run for today, if one
  // exists. It is advisory: each slot is re-validated below, and a short
  // or stale run falls back to the seeded selection slot by slot.
  const approved = await fetchApprovedRun(svc, kolkataDate);

  // Hadith: the approved run's hadith first — but only when it is in the
  // live eligible pool AND not already used in the current cycle. An
  // approved hadith already used this cycle is skipped (the seeded pick
  // below advances the cycle instead); an approved hadith outside the
  // pool is never invented. Otherwise the seeded selection, unchanged.
  let hadith: HadithRow | null = null;
  let hadithSource: "approved" | "seeded" = "seeded";
  let approvedHadithSkipped: string | null = null;
  let nextHadithCycle = hadithCycle;
  const approvedRef = approvedHadithRef(approved);
  if (approved) {
    if (!approvedRef) {
      approvedHadithSkipped = "no hadith in the approved run";
    } else if (!eligibleH.some((h) => `hadith:${h.id}` === approvedRef)) {
      approvedHadithSkipped = "approved hadith not in the eligible pool";
    } else if (hadithUsed.has(approvedRef)) {
      approvedHadithSkipped = "approved hadith already used this cycle";
    } else {
      hadith = eligibleH.find((h) => `hadith:${h.id}` === approvedRef) ?? null;
      if (hadith) hadithSource = "approved";
    }
  }
  if (!hadith && eligibleH.length) {
    const ordered = seededShuffle(eligibleH, hashString(eligibleH.map((h) => `hadith:${h.id}`).join("|")));
    hadith = ordered.find((h) => !hadithUsed.has(`hadith:${h.id}`)) ?? ordered[0] ?? null;
    if (hadith && hadithUsed.has(`hadith:${hadith.id}`)) nextHadithCycle = hadithCycle + 1;
  }
  const hadithSourceLine = hadith
    ? `${BOOK_NAMES[hadith.book_key] ?? hadith.book_key}, Hadith ${hadith.hadith_number}`
    : null;
  const hadithLink = hadith?.book_key === "bukhari" ? "/hadith/sahih-bukhari/bangla" : "/hadith";

  // Content cards: the approved run's eligible cards first, in the run's
  // order, then the seeded selection fills the remaining slots (deduped
  // against the approved refs). The 4-card content cap is unchanged.
  const shareSelection = selectShareCards(eligibleD, cardUsed);
  let cards = shareSelection.cards;
  let cardsSource: "approved" | "approved+seeded" | "seeded" = "seeded";
  if (approved) {
    const approvedCards = approvedContentCards(approved, eligibleD);
    if (approvedCards.length > 0) {
      const approvedRefs = new Set(approvedCards.map((c) => c.recordRef as string));
      const fill = cards.filter((c) => !approvedRefs.has(c.recordRef as string));
      cards = [...approvedCards, ...fill].slice(0, 4);
      cardsSource = fill.length > 0 ? "approved+seeded" : "approved";
    }
  }
  const nextCardCycle = shareSelection.wrapped ? cardCycle + 1 : cardCycle;
  if (hadith) {
    const ref = `hadith:${hadith.id}`;
    if (!cards.some((c) => c.recordRef === ref)) {
      cards.unshift({
        kind: "hadith",
        recordRef: ref,
        title: "আজকের হাদিস",
        arabic: hadith.arabic.trim(),
        bengali: (hadith.bengali ?? "").trim(),
        sourceLine: hadithSourceLine,
        canonicalLink: hadithLink,
        altText: `হাদিস: ${excerpt(hadith.bengali ?? "", 80)} — ${hadithSourceLine}`,
        caption: `🤲 আজকের হাদিস\n${(hadith.bengali ?? "").trim()}\n📖 ${hadithSourceLine}\n🔗 https://noorapp.in${hadithLink}\n— NoorApp`,
      });
    }
  }
  const finalCards = cards.slice(0, 5);

  const push = hadith
    ? {
        title: clampText(`📿 আজকের হাদিস — ${hadithSourceLine}`, 60),
        body: clampText(
          `Assalamu Alaikum! ${(hadith.bengali ?? "").trim()}${finalCards.length ? ` + আজকের ${finalCards.length}টি ইসলামিক কার্ড দেখুন।` : ""}`,
          120,
        ),
        deep_link: hadithLink,
        icon: DEFAULT_ICON,
        badge: DEFAULT_BADGE,
        image_url: null,
      }
    : null;

  return {
    kolkataDate,
    // Phase 9 — where the plan came from: "approved-recommendation"
    // when the hadith or any card came from the approved run, else
    // "seeded". The per-slot sources + the run id are recorded so the
    // dry-run (and the publication row, via recommendation_id) show the
    // provenance of every plan.
    source: hadithSource === "approved" || cardsSource !== "seeded" ? "approved-recommendation" : "seeded",
    hadithSource,
    cardsSource,
    recommendationId: approved?.id ?? null,
    context,
    hadith: hadith
      ? { id: hadith.id, sourceLine: hadithSourceLine, canonicalLink: hadithLink }
      : null,
    hadithEmptyReason: hadith
      ? null
      : eligibleH.length === 0
        ? "No eligible hadith in the pool."
        : "Selection failed unexpectedly.",
    cards: finalCards,
    push,
    hadithCycle: nextHadithCycle,
    cardCycle: nextCardCycle,
    diagnostics: {
      hadithPool: hadithRows.length,
      hadithEligible: eligibleH.length,
      duaPool: (duaRows ?? []).length,
      duaEligible: eligibleD.length,
      hadithPoolTruncated: false,
      approvedRun: approved !== null,
      approvedHadithSkipped,
    },
  };
}

export function classifyFailure(status: number | null): string {
  if (status === 404 || status === 410 || status === 401 || status === 403) return "disabled";
  if (status === null || status === 429 || status >= 500) return "retryable";
  return "failed";
}

/**
 * M2: read the push provider's structured status code from a thrown error.
 * The web-push client attaches `statusCode` to its errors; that is the
 * ONLY signal used. Message text is never parsed for digits (a message can
 * contain incidental numbers, and a real 410 without digits in its message
 * was previously misclassified as retryable). No status code at all means
 * a network-style failure, which is retryable — never a wrongful disable.
 */
export function extractPushStatus(e: unknown): number | null {
  const s = (e as { statusCode?: unknown } | null)?.statusCode;
  return typeof s === "number" && Number.isInteger(s) ? s : null;
}

async function sendToTokens(
  svc: Svc,
  publicationId: string,
  push: NonNullable<Awaited<ReturnType<typeof planDay>>["push"]>,
): Promise<{ total: number; sent: number; failed: number; disabled: number; skipped: number; tokensTruncated: boolean }> {
  const { rows: tokens, truncated: tokensTruncated } = await fetchEnabledWebTokens(svc);
  const optedOut = await fetchOptedOutDeviceIds(svc);

  let total = 0;
  let sent = 0;
  let failed = 0;
  let disabled = 0;
  let skipped = 0;
  for (const t of tokens) {
    // M3: never send without a stable device identity. A NULL or empty
    // device_id cannot be capped (Postgres treats NULLs as distinct in
    // the unique constraint), cannot be opted out, and cannot be matched
    // reliably for status updates — so such tokens are skipped, not sent.
    // token_id was evaluated as an alternative primary key and rejected:
    // it is not in the DB unique constraint, it breaks opt-out and
    // preference joins keyed by device_id, and it is nulled when its
    // token row is deleted. It is used below only as defense-in-depth.
    if (!hasText(t.device_id)) {
      skipped++;
      continue;
    }
    if (optedOut.has(t.device_id)) continue;
    total++;
    // Defense-in-depth: skip if a delivery row already exists for this
    // publication + token, even if the device_id changed since the row
    // was written. The DB unique constraint on (publication, device)
    // remains the primary guard for stable device_ids.
    const { data: prior } = await svc.from("daily_content_deliveries")
      .select("id")
      .eq("publication_id", publicationId)
      .eq("token_id", t.id)
      .limit(1);
    if ((prior as unknown[] | null)?.length) continue;
    // Per-device daily cap: one delivery row per (publication, device).
    // R-5 claim protocol: every pending row carries a due
    // next_attempt_at from birth, so the first-send claim below can
    // lease it and a retry tick can tell claimed rows apart from
    // unclaimed ones. (Rows created by this version always carry
    // next_attempt_at; pre-fix code never ran in production.)
    const { error: capErr } = await svc.from("daily_content_deliveries").insert({
      publication_id: publicationId,
      token_id: t.id,
      device_id: t.device_id,
      platform: "web",
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    } as never);
    if (capErr) continue; // Already attempted for this device today — skip (no double-send).
    // R-5 first-send claim: lease this row for 10 minutes before the
    // provider call. The claim matches only while the row is still
    // pending and due — a retry tick that already promoted/claimed
    // it makes this match zero rows, and we skip the send instead
    // of double-sending. Conversely, a claimed row's future lease
    // makes the tick's promotion (which requires a due
    // next_attempt_at) skip it. This is the mutual exclusion
    // between the daily send and the retry tick; the success
    // update below stays unconditional because nothing else can
    // move a leased row during the lease. Two attempts: a row
    // with no next_attempt_at was never leased, so it is claimable
    // via the IS NULL attempt (NULL fails the LTE comparison).
    const claimIso = new Date().toISOString();
    const leaseIso = new Date(Date.now() + 10 * 60_000).toISOString();
    const claimBase = () => svc.from("daily_content_deliveries")
      .update({ next_attempt_at: leaseIso } as never)
      .eq("publication_id", publicationId)
      .eq("device_id", t.device_id)
      .eq("status", "pending");
    let { data: claimed } = await claimBase().lte("next_attempt_at", claimIso).select("id");
    if (!((claimed as unknown[] | null)?.length)) {
      ({ data: claimed } = await claimBase().is("next_attempt_at", null).select("id"));
    }
    if (!((claimed as unknown[] | null)?.length)) continue; // lost the race — never send
    // S-6 re-check: an opt-out that landed after the snapshot (or after
    // the claim) is respected HERE, before the provider call. Close the
    // row terminally so it is never sent and never re-read.
    if (await isDeviceOptedOut(svc, t.device_id)) {
      skipped++;
      await svc.from("daily_content_deliveries").update({
        status: "failed",
        error: "device opted out of daily content",
      } as never).eq("publication_id", publicationId).eq("device_id", t.device_id).eq("status", "pending");
      continue;
    }
    try {
      const sub = JSON.parse(typeof t.token === "string" ? t.token : JSON.stringify(t.token));
      const res = await sendPushWithTimeout(sub, JSON.stringify(push));
      const status = (res as unknown as { statusCode?: number }).statusCode ?? 201;
      if (status >= 200 && status < 300) {
        // H3: a sent update that matches zero rows is not a success.
        // The push went out, so the per-token catch below degrades this
        // to retryable (the known at-least-once window); it must not be
        // counted sent.
        const { data: updated } = await svc.from("daily_content_deliveries").update({ status: "sent", attempts: 1 } as never).eq("publication_id", publicationId).eq("device_id", t.device_id).select("id");
        if (!((updated as unknown[] | null)?.length)) throw new Error("Delivery sent update affected 0 rows");
        sent++;
      } else {
        const cls = classifyFailure(status);
        failed++;
        if (cls === "disabled") {
          disabled++;
          await svc.from("device_push_tokens").update({ enabled: false } as never).eq("id", t.id);
        }
        const patch: Record<string, unknown> = { status: cls, attempts: 1, error: `HTTP ${status}` };
        if (cls === "retryable") {
          patch.next_attempt_at = new Date(Date.now() + 5 * 60_000).toISOString();
        }
        await svc.from("daily_content_deliveries").update(patch as never).eq("publication_id", publicationId).eq("device_id", t.device_id);
      }
    } catch (e) {
      // M2: classify from the structured status code, never from message
      // text. A 410 that arrives without digits in its message used to be
      // misclassified as retryable; an error with no status code at all
      // is a network-style failure and stays retryable (never a wrongful
      // token disable).
      const cls = classifyFailure(extractPushStatus(e));
      const msg = e instanceof Error ? e.message : String(e);
      failed++;
      if (cls === "disabled") {
        disabled++;
        await svc.from("device_push_tokens").update({ enabled: false } as never).eq("id", t.id);
      }
      const patch: Record<string, unknown> = { status: cls, attempts: 1, error: msg };
      if (cls === "retryable") {
        patch.next_attempt_at = new Date(Date.now() + 5 * 60_000).toISOString();
      }
      // Hardening A: the patch is conditional on the row still being
      // pending. If the sent-update committed but its acknowledgement was
      // lost, the row is already `sent` — this patch must match zero rows
      // and leave it sent, never resurrect it to retryable/failed.
      await svc.from("daily_content_deliveries").update(patch as never).eq("publication_id", publicationId).eq("device_id", t.device_id).eq("status", "pending");
    }
  }
  return { total, sent, failed, disabled, skipped, tokensTruncated };
}

async function runRetries(svc: Svc): Promise<{ retried: number; sent: number; failed: number }> {
  const nowIso = new Date().toISOString();
  // A retryable row with NULL next_attempt_at cannot occur via code
  // paths (every retry transition sets it), but a manually seeded row
  // must not sit invisible forever: select it too (two disjoint sets;
  // LTE excludes NULL, IS NULL includes only NULL).
  const { data: dueRows } = await svc
    .from("daily_content_deliveries")
    .select("id, publication_id, token_id, device_id, attempts")
    .eq("status", "retryable")
    .lt("attempts", 4)
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(200);
  const { data: unleasedRows } = await svc
    .from("daily_content_deliveries")
    .select("id, publication_id, token_id, device_id, attempts")
    .eq("status", "retryable")
    .lt("attempts", 4)
    .is("next_attempt_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = [...(dueRows ?? []), ...(unleasedRows ?? [])] as Array<{ id: string; publication_id: string; token_id: string; device_id: string | null; attempts: number }>;
  const BACKOFF = [5, 15, 45];
  let retried = 0;
  let sent = 0;
  let failed = 0;
  // N-1: the retry path must respect opt-outs exactly like the first
  // send. Preferences are snapshotted once per tick (same as the
  // first send); the S-6 re-check immediately before each provider
  // call additionally catches an opt-out landing mid-tick.
  const optedOut = await fetchOptedOutDeviceIds(svc);
  for (const row of rows) {
    const { data: pub } = await svc.from("daily_content_publications").select("push, status, kolkata_date").eq("id", row.publication_id).maybeSingle();
    const { data: tok } = await svc.from("device_push_tokens").select("token, enabled").eq("id", row.token_id).maybeSingle();
    // H1 defense-in-depth: a delivery whose parent publication is gone
    // or failed (superseded) must never send. Close it terminally
    // instead of re-reading it on every tick forever.
    if (!pub || (pub as { status: string }).status === "failed") {
      await svc.from("daily_content_deliveries").update({
        status: "failed",
        error: !pub ? "parent publication missing" : "parent publication failed",
      } as never).eq("id", row.id);
      continue;
    }
    // Phase 7 (R-6): a retryable whose publication is for a past Kolkata
    // date is stale — never send yesterday's content late. runTick's
    // supersede only fails *planned* past-date rows, so a *published*
    // past-date row's retryables reach here; this guard closes them
    // terminally instead of sending. The manual pre-re-enable step
    // (rollback plan step 3) stays as a belt-and-braces check, but the
    // code no longer depends on it.
    const pubDate = (pub as { kolkata_date?: string }).kolkata_date;
    if (typeof pubDate === "string" && pubDate < kolkataDateString(new Date())) {
      await svc.from("daily_content_deliveries").update({
        status: "failed",
        error: "stale: publication date has passed",
      } as never).eq("id", row.id).eq("status", "retryable");
      failed++;
      continue;
    }
    // N-3 guard: a planned parent with no push payload must never
    // produce a "null" send. Such rows are corrupt (the daily path
    // repairs them); close their retryables terminally.
    if ((pub as { push: unknown }).push == null) {
      await svc.from("daily_content_deliveries").update({
        status: "failed",
        error: "parent publication has no push payload",
      } as never).eq("id", row.id).eq("status", "retryable");
      failed++;
      continue;
    }
    if (!tok || !(tok as { enabled: boolean }).enabled) continue;
    // N-1: a device that opted out after a failed first attempt (or
    // during a pause) must not receive the retry. Close the row
    // terminally so it is not re-read forever.
    if (row.device_id != null && optedOut.has(row.device_id)) {
      await svc.from("daily_content_deliveries").update({
        status: "failed",
        error: "device opted out of daily content",
      } as never).eq("id", row.id).eq("status", "retryable");
      failed++;
      continue;
    }
    // H2 atomic claim (no migration needed): a single conditional UPDATE
    // is the claim. It moves next_attempt_at 10 minutes out (the lease)
    // only if the row is still retryable, under the attempt cap, and due.
    // Postgres serializes concurrent updates on the row lock, so exactly
    // one overlapping worker matches a row; losers match zero rows and
    // skip. A crashed worker's lease expires on its own, so its row
    // becomes claimable again — claims never stick forever. Process-local
    // single-flight was rejected: it cannot span Vercel instances, while
    // this database claim can. No RPC is needed; plain PostgREST update
    // suffices, so no schema change is required.
    const claimIso = new Date().toISOString();
    const retryLeaseIso = new Date(Date.now() + 10 * 60_000).toISOString();
    const retryClaimBase = () => svc.from("daily_content_deliveries")
      .update({ next_attempt_at: retryLeaseIso } as never)
      .eq("id", row.id)
      .eq("status", "retryable")
      .lt("attempts", 4);
    let { data: claimed } = await retryClaimBase().lte("next_attempt_at", claimIso).select("id");
    if (!((claimed as unknown[] | null)?.length)) {
      // Never-leased NULL row: claimable too (NULL fails LTE).
      ({ data: claimed } = await retryClaimBase().is("next_attempt_at", null).select("id"));
    }
    if (!((claimed as unknown[] | null)?.length)) continue; // lost the race — never send
    // Post-claim parent re-check: supersede may have failed the parent
    // between the first check and the claim (its row update landing
    // before its deliveries update). Only a supersede landing between
    // this re-check and the provider call (microseconds) can still
    // produce a stale send, which no database mechanism can close
    // without provider-side idempotency.
    const { data: pubFresh } = await svc.from("daily_content_publications").select("status").eq("id", row.publication_id).maybeSingle();
    if (!pubFresh || (pubFresh as { status: string }).status === "failed") {
      await svc.from("daily_content_deliveries").update({ status: "failed", error: "parent publication failed" } as never).eq("id", row.id);
      continue;
    }
    // S-6 re-check (retry path): an opt-out that landed after the
    // snapshot — including DURING this tick — is respected before the
    // provider call. Close the row terminally, exactly like the N-1
    // snapshot path above.
    if (row.device_id != null && (await isDeviceOptedOut(svc, row.device_id))) {
      await svc.from("daily_content_deliveries").update({
        status: "failed",
        error: "device opted out of daily content",
      } as never).eq("id", row.id).eq("status", "retryable");
      failed++;
      continue;
    }
    retried++;
    const attempts = (row.attempts ?? 0) + 1;
    try {
      const sub = JSON.parse(String((tok as { token: string }).token));
      await sendPushWithTimeout(sub, JSON.stringify((pub as { push: unknown }).push));
      // H3: a sent update that matches zero rows is not a success. The
      // push went out, so this falls into the catch below and degrades
      // to retryable (the known at-least-once window); it must not be
      // counted sent. Guard: if a concurrent opt-out close (or
      // supersede) failed the row after our claim, do not resurrect
      // it to sent — the zero-row throw degrades to the
      // retryable-conditional catch patch, which then matches zero
      // rows and leaves the row failed. The send itself already
      // happened (same class as the supersede microsecond window),
      // but the audit trail stays honest.
      const { data: flipped } = await svc.from("daily_content_deliveries").update({ status: "sent", attempts } as never).eq("id", row.id).eq("status", "retryable").select("id");
      if (!((flipped as unknown[] | null)?.length)) throw new Error("Delivery sent update affected 0 rows");
      sent++;
    } catch (e) {
      // M2: same structured classification as the first send. A 410 on
      // retry disables the token instead of burning the remaining
      // attempts; anything else follows the normal backoff/max rule.
      failed++;
      if (classifyFailure(extractPushStatus(e)) === "disabled") {
        await svc.from("device_push_tokens").update({ enabled: false } as never).eq("id", row.token_id);
        // Hardening A: conditional on still being retryable, so a
        // sent-update that committed but lost its acknowledgement can
        // never be overwritten back to failed (see sendToTokens catch).
        await svc.from("daily_content_deliveries").update({ status: "failed", attempts } as never).eq("id", row.id).eq("status", "retryable");
      } else if (attempts >= 4) {
        await svc.from("daily_content_deliveries").update({ status: "failed", attempts } as never).eq("id", row.id).eq("status", "retryable");
      } else {
        const delayMin = BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];
        await svc.from("daily_content_deliveries").update({
          status: "retryable",
          attempts,
          next_attempt_at: new Date(Date.now() + delayMin * 60_000).toISOString(),
        } as never).eq("id", row.id).eq("status", "retryable");
      }
    }
  }
  return { retried, sent, failed };
}

/**
 * The 15-minute retry tick. It NEVER publishes, plans, adopts content,
 * or creates a publication row. Its recovery policy:
 *  1. Promote today's planned publication's pending deliveries to
 *     retryable (due now), so step 3 sends them in this same tick. A
 *     planned row without a push is corrupt and is left for the daily
 *     path to repair — the tick cannot plan.
 *  2. Supersede past-date planned rows (mark failed) and fail their
 *     pending AND retryable deliveries, so no stale notification can
 *     survive supersede. Stale content is never reused as another day's
 *     publication. Rows a failed supersede leaves behind are closed by
 *     the parent-status check in runRetries (step 3), never sent.
 *  3. Process due retryable deliveries (runRetries, unchanged).
 * Settings are consulted by the handler before runTick is reached
 * (decided policy): a paused system never enters this function, so a
 * paused system sends nothing at all — no promotion, no supersede, no
 * retries. Dry-run never reaches this function either.
 */
async function runTick(svc: Svc, kolkataDate: string): Promise<{
  retried: number;
  sent: number;
  failed: number;
  promoted: number;
  promotedPublished: number;
  superseded: number;
}> {
  let promoted = 0;
  const { data: plannedToday } = await svc.from("daily_content_publications")
    .select("id, push")
    .eq("kolkata_date", kolkataDate)
    .eq("status", "planned")
    .maybeSingle();
  const plannedRow = plannedToday as { id: string; push: unknown } | null;
  if (plannedRow?.push) {
    // R-5: promote only due pending rows. A row leased by an
    // in-flight first-send carries a future next_attempt_at and is
    // skipped, so the tick cannot re-send it. A row with no
    // next_attempt_at was never leased, so the second update
    // promotes it (NULL fails the LTE comparison).
    const promoteIso = new Date().toISOString();
    const promoteBase = () => svc.from("daily_content_deliveries")
      .update({ status: "retryable", next_attempt_at: promoteIso } as never)
      .eq("publication_id", plannedRow.id)
      .eq("status", "pending");
    const { data: promotedDue } = await promoteBase().lte("next_attempt_at", promoteIso).select("id");
    const { data: promotedUnleased } = await promoteBase().is("next_attempt_at", null).select("id");
    promoted = ((promotedDue as unknown[] | null)?.length ?? 0) +
      ((promotedUnleased as unknown[] | null)?.length ?? 0);
  }
  // Strand recovery: a daily resume that flips to published while a
  // leased pending row remains must not strand it (this tick's
  // planned-only promotion would never touch it again, and
  // runRetries reads only retryable rows). Ticks also promote due
  // pending rows of TODAY's published publication — same-day
  // content only, so past days are never revived (no stale sends).
  // Leased rows are skipped until their lease expires; never-leased
  // NULL rows are promoted. The count is returned as
  // promotedPublished so first-run watch can see strand recoveries.
  const { data: publishedToday } = await svc.from("daily_content_publications")
    .select("id")
    .eq("kolkata_date", kolkataDate)
    .eq("status", "published")
    .maybeSingle();
  const publishedRow = publishedToday as { id: string } | null;
  let promotedPublished = 0;
  if (publishedRow) {
    const pubPromoteIso = new Date().toISOString();
    const pubPromoteBase = () => svc.from("daily_content_deliveries")
      .update({ status: "retryable", next_attempt_at: pubPromoteIso } as never)
      .eq("publication_id", publishedRow.id)
      .eq("status", "pending");
    const { data: promotedPublishedDue } = await pubPromoteBase().lte("next_attempt_at", pubPromoteIso).select("id");
    const { data: promotedPublishedUnleased } = await pubPromoteBase().is("next_attempt_at", null).select("id");
    promotedPublished = ((promotedPublishedDue as unknown[] | null)?.length ?? 0) +
      ((promotedPublishedUnleased as unknown[] | null)?.length ?? 0);
  }
  let superseded = 0;
  const { data: stale } = await svc.from("daily_content_publications")
    .select("id")
    .eq("status", "planned")
    .lt("kolkata_date", kolkataDate);
  for (const row of (stale ?? []) as Array<{ id: string }>) {
    const { data: failedRow } = await svc.from("daily_content_publications").update({
      status: "failed",
      error: "superseded: planned row from a past date was never published",
    } as never).eq("id", row.id).select("id");
    // H1: close pending AND retryable deliveries in one statement, so
    // no stale notification can survive supersede. The parent-status
    // check in runRetries is defense-in-depth for rows this update
    // misses (for example when it throws halfway through).
    await svc.from("daily_content_deliveries").update({
      status: "failed",
      error: "superseded: publication never published",
    } as never).eq("publication_id", row.id).in("status", ["pending", "retryable"]);
    if (((failedRow as unknown[] | null)?.length)) superseded++;
  }
  // Phase 7 (R-6, pending side): past-date PUBLISHED publications keep
  // their historical record, but their unattempted / retryable
  // deliveries are stale — fail them terminally so they are visible
  // (failed + error) instead of sitting pending forever, and so no
  // later tick can send yesterday's content late. runRetries' own date
  // guard above is the defense-in-depth for rows this step misses.
  const { data: stalePublished } = await svc.from("daily_content_publications")
    .select("id")
    .eq("status", "published")
    .lt("kolkata_date", kolkataDate);
  for (const row of (stalePublished ?? []) as Array<{ id: string }>) {
    await svc.from("daily_content_deliveries").update({
      status: "failed",
      error: "stale: publication date has passed",
    } as never).eq("publication_id", row.id).in("status", ["pending", "retryable"]);
  }
  const retries = await runRetries(svc);
  return { ...retries, promoted, promotedPublished, superseded };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Phase 3 — user-facing preference actions (opt_out / opt_in) are routed
  // BEFORE the CRON-secret gate: a browser cannot present the CRON secret,
  // and the subscription endpoint in the body is the credential for this
  // narrow path (see handlePreferenceAction). Phase 7 adds the read-only
  // "status" action on the same path. Every other action still
  // requires the CRON secret below. createClient performs no I/O, so
  // constructing it before the auth check changes nothing.
  if (body.action === "opt_out" || body.action === "opt_in" || body.action === "status") {
    return handlePreferenceAction(svc, body);
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  const kolkataDate = kolkataDateString(new Date());

  try {
    // DECIDED POLICY (launch preparation): retry_only + dry_run is a
    // client error, never a real retry and never a plan. Rejecting here
    // — before any planning, publication, or send — guarantees the
    // combination performs nothing.
    if (body.retry_only === true && body.dry_run === true) {
      return jsonResponse({ ok: false, error: "retry_only and dry_run cannot be combined." }, 400);
    }
    // DECIDED POLICY (launch preparation): pause stops retry ticks too.
    // The settings gate applies to the retry branch exactly as it does
    // to the daily branch, so a paused system sends nothing at all.
    // Dry-run stays read-only and is unaffected (it returns before any
    // gate below).
    if (body.retry_only === true) {
      const { data: settings } = await svc.from("daily_content_settings").select("enabled").limit(1).maybeSingle();
      if (!settings || (settings as { enabled: boolean }).enabled !== true) {
        return jsonResponse({ ok: false, reason: "paused" });
      }
      return jsonResponse({ ok: true, ...(await runTick(svc, kolkataDate)) });
    }

    const plan = await planDay(svc, kolkataDate);

    if (body.dry_run === true) {
      return jsonResponse({ ok: true, dry_run: true, plan });
    }

    const { data: settings } = await svc.from("daily_content_settings").select("enabled").limit(1).maybeSingle();
    // M1: fail CLOSED. A missing settings row used to fall through and
    // publish; now automation runs only when a row explicitly enables it.
    if (!settings || (settings as { enabled: boolean }).enabled !== true) {
      return jsonResponse({ ok: false, reason: "paused" });
    }

    if (!plan.hadith || !plan.push) {
      // No valid plan: record the failure once per date, but never let
      // the failure row reserve the date against a later recovery. If a
      // row already occupies today, leave it untouched (published means
      // a concurrent run already finished the day; planned/failed means
      // an earlier attempt already recorded its outcome) and just report.
      const { data: todayRow } = await svc.from("daily_content_publications")
        .select("id, status")
        .eq("kolkata_date", kolkataDate)
        .maybeSingle();
      if (todayRow?.status === "published") {
        return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
      }
      if (!todayRow) {
        await svc.from("daily_content_publications").insert({
          kolkata_date: kolkataDate,
          status: "failed",
          hadith_ref: null,
          hadith_source_line: null,
          cards: plan.cards,
          push: plan.push,
          hadith_cycle: plan.hadithCycle,
          card_cycle: plan.cardCycle,
          error: plan.hadithEmptyReason,
          // Phase 9 — provenance of the attempted plan (null when seeded).
          recommendation_id: plan.recommendationId,
        } as never);
      }
      return jsonResponse({ ok: false, reason: plan.hadithEmptyReason });
    }

    // Valid plan: resolve today's publication row. Repair-in-place is the
    // rule for failed and corrupt rows: rewriting the existing row to the
    // fresh plan can never violate the unique date, unlike fail + insert.
    // The repair is conditional on the row still holding the observed
    // state (H3): an unconditional update could clobber a concurrent
    // run's published row. A zero-row repair means another run won the
    // race, so we re-read and resolve again instead of sending.
    const freshPlan = {
      status: "planned",
      hadith_ref: `hadith:${plan.hadith!.id}`,
      hadith_source_line: plan.hadith!.sourceLine,
      cards: plan.cards,
      push: plan.push,
      hadith_cycle: plan.hadithCycle,
      card_cycle: plan.cardCycle,
      error: null,
      published_at: null,
      // Phase 9 — provenance of the plan (null when seeded). The column
      // comes from migration 202611070003; the edge must not be deployed
      // before that migration is applied (see the Phase 9 doc).
      recommendation_id: plan.recommendationId,
    };
    const repairToPlan = async (id: string, mode: "failed" | "corrupt"): Promise<boolean> => {
      const { data: updated } = mode === "failed"
        ? await svc.from("daily_content_publications").update(freshPlan as never).eq("id", id).eq("status", "failed").select("id")
        : await svc.from("daily_content_publications").update(freshPlan as never).eq("id", id).eq("status", "planned").is("push", null).select("id");
      return ((updated as unknown[] | null)?.length ?? 0) > 0;
    };
    type Resolution =
      | { kind: "ready"; publicationId: string; pushForSend: typeof plan.push }
      | { kind: "deduped" }
      | { kind: "conflict" };
    const resolveRow = async (row: { id: string; status: string; push: unknown } | null): Promise<Resolution> => {
      if (!row) return { kind: "conflict" };
      if (row.status === "published") return { kind: "deduped" };
      if (row.status === "planned" && row.push) {
        // Resume a crashed run: adopt the stored push (same day, same
        // content — re-planning could change the day's content mid-flight).
        return { kind: "ready", publicationId: row.id, pushForSend: row.push as typeof plan.push };
      }
      const repaired = await repairToPlan(row.id, row.status === "failed" ? "failed" : "corrupt");
      if (repaired) return { kind: "ready", publicationId: row.id, pushForSend: plan.push };
      const { data: fresh } = await svc.from("daily_content_publications")
        .select("id, status, push").eq("id", row.id).maybeSingle();
      const f = fresh as { id: string; status: string; push: unknown } | null;
      if (f?.status === "published") return { kind: "deduped" };
      if (f?.status === "planned" && f.push) {
        return { kind: "ready", publicationId: f.id, pushForSend: f.push as typeof plan.push };
      }
      return { kind: "conflict" };
    };
    const { data: todayRow } = await svc.from("daily_content_publications")
      .select("id, status, push")
      .eq("kolkata_date", kolkataDate)
      .maybeSingle();
    let publicationId: string | null = null;
    let pushForSend = plan.push;
    if (todayRow) {
      const r = await resolveRow(todayRow as { id: string; status: string; push: unknown });
      if (r.kind === "deduped") {
        return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
      }
      if (r.kind === "conflict") {
        return jsonResponse({ ok: false, error: "Publication repair conflict." }, 500);
      }
      publicationId = r.publicationId;
      pushForSend = r.pushForSend;
    } else {
      const { data: pub } = await svc
        .from("daily_content_publications")
        .insert({
          kolkata_date: kolkataDate,
          status: "planned",
          hadith_ref: `hadith:${plan.hadith.id}`,
          hadith_source_line: plan.hadith.sourceLine,
          cards: plan.cards,
          push: plan.push,
          hadith_cycle: plan.hadithCycle,
          card_cycle: plan.cardCycle,
          // Phase 9 — provenance of the plan (null when seeded).
          recommendation_id: plan.recommendationId,
        } as never)
        .select("id")
        .single();
      publicationId = (pub as { id: string } | null)?.id ?? null;
      if (!publicationId) {
        // Race: another run created today's row first. Resolve it the
        // same way as above instead of failing the day.
        const { data: raced } = await svc
          .from("daily_content_publications")
          .select("id, status, push")
          .eq("kolkata_date", kolkataDate)
          .maybeSingle();
        const r = await resolveRow(raced as { id: string; status: string; push: unknown } | null);
        if (r.kind === "deduped") {
          return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
        }
        if (r.kind === "conflict") {
          return jsonResponse({ ok: false, error: "Publication insert failed." }, 500);
        }
        publicationId = r.publicationId;
        pushForSend = r.pushForSend;
      }
    }
    // Stale `pending` delivery rows (inserted but never attempted because
    // a previous run crashed mid-send) become `retryable` now, so the
    // retry tick delivers them instead of dropping them silently. The
    // per-(publication, device) cap still prevents any double-send.
    // R-5: only due rows are promoted — a row leased by a concurrent
    // run's in-flight first-send carries a future next_attempt_at
    // and is skipped until its lease expires. A row with no
    // next_attempt_at was never leased, so the second update
    // promotes it (NULL fails the LTE comparison).
    const staleIso = new Date().toISOString();
    const staleBase = () => svc.from("daily_content_deliveries").update({
      status: "retryable",
      next_attempt_at: staleIso,
    } as never).eq("publication_id", publicationId).eq("status", "pending");
    await staleBase().lte("next_attempt_at", staleIso);
    await staleBase().is("next_attempt_at", null);
    let delivery;
    try {
      delivery = await sendToTokens(svc, publicationId, pushForSend);
    } catch (e) {
      // Send aborted mid-flight: the row stays `planned`. Only a later
      // daily-path run adopts it; a retry tick recovers its pending and
      // retryable deliveries but never adopts or publishes it. Never
      // mark published here.
      return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
    const { data: flipped } = await svc.from("daily_content_publications").update({
      status: "published",
      published_at: new Date().toISOString(),
      recipients_total: delivery.total,
      recipients_sent: delivery.sent,
      recipients_failed: delivery.failed,
    } as never).eq("id", publicationId).eq("status", "planned").select("id");
    // H3: a flip that matches zero rows must not be reported as
    // published. The row stays planned and the next run recovers it.
    // The status condition is the concurrency guard: two daily runs
    // that both resolve "ready" can both send (per-device caps prevent
    // double-sends), but only the first flips the row to published;
    // the second matches zero rows and throws here, so the first
    // run's counters are never overwritten by the second (S-5,
    // 2026-11-08). Without it the last writer's counters win.
    if (!((flipped as unknown[] | null)?.length)) throw new Error("Publication flip affected 0 rows");
    return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: publicationId, delivery });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
