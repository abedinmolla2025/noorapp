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
 *  - planned --heal tick, same date--> the heal step reads the row and
 *    NEVER sends a text-only push and NEVER flips it: a row whose
 *    poster is QC-passed is published through publishPlanned (the
 *    same gate the poster workflow uses, so the first send carries
 *    the poster image); a row whose poster failed is HELD (see
 *    below); a row whose poster is still pending is left for the
 *    poster workflow. A planned row with no stored push (corrupt)
 *    is repaired in place by re-planning, exactly as the daily path
 *    repairs corrupt rows.
 *  - (none) / failed --heal tick--> plan-only: a planned row is
 *    created (or a failed row repaired in place) and the heal stops
 *    there — send nothing, flip nothing. The poster workflow is the
 *    next step (dispatched by the retry workflow when the heal
 *    reports healed:"planned" or a poster hold). A heal tick can
 *    never create a published row.
 *  - Hold / Quarantine (Phase 3 — derived from existing columns, no
 *    migration): a planned row with poster_qc_status='failed' is
 *    HELD — publish_planned refuses it (409 poster_not_ready), so
 *    nothing downstream can distribute that day. The poster workflow
 *    may retry it once; a second failure in the same day is recorded
 *    by set_poster with poster_error starting `quarantined:` and the
 *    row is QUARANTINED — no automatic attempt retries it (the heal
 *    tick reports hold:"quarantined" and the poster workflow skips
 *    it unless force-dispatched). A successful set_poster pass clears
 *    the error and ends the hold. A status='failed' row (no valid
 *    plan) is a hold of a different kind: a later heal tick repairs
 *    it in place when a valid plan exists.
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
 *  - Split-flow self-healing (Phase 3, owner-authorized 2026-11-16;
 *    supersedes the text-only heal of the self-healing branch): a
 *    retry tick with { "retry_only": true, "heal": true } runs the
 *    retry pass unchanged, then heals ONLY through the split flow —
 *    it plans (plan-only semantics, never sends, never flips) or
 *    publishes a row whose poster is already QC-passed. It NEVER
 *    publishes text-only. There is no text-only fallback: the
 *    fallback question needs explicit owner approval and is NOT
 *    implemented. `heal` without `retry_only` is a client error
 *    (400), as is combining `heal` with `plan_only` or
 *    `publish_planned`.
 *  - Facebook Page publication (Phase 4, owner-authorized 2026-11-16;
 *    rehearsal-only; audit NOORAPP-FACEBOOK-AUTOMATION-AUDIT-
 *    2026-11-16.md): the finalized poster for a PUBLISHED publication
 *    is posted to the Page through the official Meta Graph API only
 *    (FB_API_VERSION = "v27.0", pinned, never unversioned), two-step
 *    photo upload (published=false) + /feed with attached_media, then
 *    a verification read — HTTP 200 alone is not proof. Publish ONLY
 *    a QC-passed finalized poster (409 poster_not_ready otherwise);
 *    a Facebook failure NEVER rolls back a website publication. Mode
 *    B (default): no Graph call before facebook_approve. Bounded
 *    retry max 4, backoff [5, 15, 45] min, H2 10-min lease claim;
 *    error 190 (subcodes 463/460/458), 200/10, 368, 100, 506 are
 *    TERMINAL, never retried; 4/17/32/613/80001 and transport
 *    failures are retryable. Idempotency: UNIQUE (publication_id,
 *    page_id) + one log row whose retry_history IS the attempt list.
 *    The Page token is a lazy env var (FACEBOOK_PAGE_ACCESS_TOKEN) —
 *    never a column, never logged. G1–G3 (Page authorization, Meta
 *    App + Business Verification + App Review, token + secret) are
 *    owner dashboard actions — BLOCKED here. The 2026 organic
 *    link-post restriction is UNVERIFIED (single source): no
 *    daily-link design is finalized before a real-Page test; do NOT
 *    pay for Meta One (INR 0). The migration is a SKETCH ONLY.
 *  - Mode A/B + per-channel switches (Phase 6, owner-authorized
 *    2026-11-16; architecture update 2026-11-15): the planner
 *    consumes recommendation runs by MODE, read from
 *    daily_content_settings with fail-closed defaults (missing or
 *    invalid settings -> Mode B, nothing auto-publishes, nothing is
 *    silently enabled). Mode B (approval_required !== false, the
 *    DEFAULT) consumes only status='approved' runs, as before. Mode A
 *    (approval_required === false) may ALSO consume the newest
 *    'pending_review' run — but ONLY when it passes the server-side
 *    Mode A gate (validateModeARun): every recommendation ref
 *    well-formed and resolving in the LIVE eligible pool, at most one
 *    hadith, no malformed refs; a rejected run is never consumed in
 *    either mode. A failed gate falls back to the seeded selection
 *    (the run is ignored wholesale, never partially consumed). The
 *    8 mandatory validations are enforced where each lives: source /
 *    Arabic / Bengali integrity + fabricated-claim detection by
 *    construction (the planner publishes pool text + refs only — no
 *    AI-written text ever reaches a publication); content-visual
 *    consistency + Bengali readability + finalized-asset integrity
 *    by the poster QC gate at publish_planned; duplicate prevention
 *    by the cycle checks + kolkata_date UNIQUE. Mode A end-to-end
 *    automatic publication is therefore realized ONLY through the
 *    split flow (plan_only -> poster -> publish_planned); the default
 *    daily branch (single-call text-only send) is UNCHANGED in this
 *    phase — it is a cutover dependency (Phase 3 §6). Per-channel
 *    switches: website_auto_publish === false refuses publish_planned
 *    (409 website_paused, row stays planned); push_enabled === false
 *    flips the row WITHOUT sending (delivery zeroed, push_paused
 *    reported — no push catch-up is queued for that day);
 *    facebook_posting_enabled === false pauses the Facebook channel;
 *    facebook_auto_publish_enabled === true lets the heal tick trigger
 *    the existing facebook_publish action after a website publish
 *    (Mode B queues with zero Graph calls; Mode A posts). A paused
 *    channel NEVER blocks the others. Settings are changed ONLY
 *    through the admin-JWT-gated update_settings action (never the
 *    master `enabled` toggle — that stays owner-SQL only); every
 *    change is audit-logged (guarded: only a real admin profile UUID
 *    is written). The Mode A/B + per-channel columns are a migration
 *    SKETCH ONLY (phase6-working/) — DO NOT APPLY without owner
 *    approval; until applied, the code reads the columns as absent
 *    and the legacy behaviour holds (Mode B, website + push on,
 *    Facebook auto-publish off).
 * ------------------------------------------------------------------ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// NOTE (S-9 lazy-init, Option B — Phase 4 decision 5, applied 2026-11-11):
// the VAPID keys are deliberately NOT read here. The previous module-scope
// reads + setVapidDetails call threw at import time when the keys were
// missing/empty ("No key set vapidDetails.publicKey"), killing the whole
// function at boot — including dry_run. Keys are read lazily by
// ensureVapid() on the send path only (see sendPushWithTimeout).

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
// S-9 lazy VAPID init: initialise web-push credentials only when a send
// is actually attempted. Fail-closed: a missing/empty key pair throws a
// clear operational error (env-var names only — never key material),
// which the per-delivery catch classifies as retryable via the existing
// no-status-code rule; no token is ever disabled for it and no send is
// attempted. dry_run never reaches this function, so it works without
// keys. The flag is per-isolate: a secret rotation takes effect on the
// next cold start, which is the standard edge-function behaviour.
let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  const pub = (Deno.env.get("WEBPUSH_VAPID_PUBLIC_KEY") ?? "").trim();
  const priv = (Deno.env.get("WEBPUSH_VAPID_PRIVATE_KEY") ?? "").trim();
  if (!pub || !priv) {
    throw new Error(
      "VAPID keys are not configured (WEBPUSH_VAPID_PUBLIC_KEY / WEBPUSH_VAPID_PRIVATE_KEY missing or empty); push sending is unavailable",
    );
  }
  webpush.setVapidDetails("https://noorapp.in", pub, priv);
  vapidReady = true;
}
async function sendPushWithTimeout(sub: unknown, payload: string): Promise<{ statusCode?: number }> {
  ensureVapid();
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
// CRON_SECRET is read ONCE at module scope (isolate cold start) from the
// env var DAILY_CONTENT_CRON_SECRET — NOT from a var named CRON_SECRET.
// After setting or changing that secret in the project, the function MUST
// be redeployed: a no-change deploy is skipped by the CLI and leaves the
// old isolate running with the stale value.
const CRON_SECRET = Deno.env.get("DAILY_CONTENT_CRON_SECRET") ?? "";
const DEFAULT_ICON = "https://www.noorapp.in/notification-icon.png";
const DEFAULT_BADGE = "https://www.noorapp.in/badge-icon.png";

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

// ---- Phase 10 (autonomous monitoring) — schedule health + retry
// observability. `assessSchedule` + the two constants are a VERBATIM
// PORT of src/lib/dailyContent/monitoring.ts (the canonical source;
// Deno edge functions cannot import from src/lib, so the port is copied
// by hand — if the logic changes in either place, update both).
// The daily cron is due 06:00 Asia/Kolkata with a 30-minute grace
// period (the runbook rule): a day is "ok" when published at or before
// 06:30 IST or while the window is still open, "late" when published
// after 06:30 IST (2026-11-16: fired 6h39m late, published 12:39 IST),
// "missed" when there is no published row after the grace period
// (2026-11-17: the schedule missed entirely). IST is UTC+5:30 with no
// DST, so 06:00 IST is always 00:30 UTC and 06:30 IST is always 01:00
// UTC — the comparison is done on instants, never on wall-clock fields.
// This phase only OBSERVES: it never changes what gets published.
const SCHEDULED_HOUR_IST = 6;
const SCHEDULE_GRACE_MINUTES = 30;
type ScheduleAssessment = {
  status: "ok" | "late" | "missed";
  kolkata_date: string;
  checked_at: string;
  expected_at: string;
  grace_until: string;
  published_at: string | null;
  publication_status: string | null;
  window: "open" | "closed";
};
function assessSchedule(
  now: Date,
  kolkataDate: string,
  publication: { status: string; published_at: string | null } | null,
): ScheduleAssessment {
  const [y, m, d] = kolkataDate.split("-").map((p) => Number(p));
  const expectedMs = Date.UTC(y, m - 1, d, 0, 30); // 06:00 IST
  const graceMs = Date.UTC(y, m - 1, d, 1, 0); // 06:30 IST
  const base = {
    kolkata_date: kolkataDate,
    checked_at: now.toISOString(),
    expected_at: new Date(expectedMs).toISOString(),
    grace_until: new Date(graceMs).toISOString(),
    published_at: publication?.published_at ?? null,
    publication_status: publication?.status ?? null,
  };
  if (publication?.status === "published") {
    if (!publication.published_at) return { ...base, status: "ok", window: "closed" };
    return new Date(publication.published_at).getTime() > graceMs
      ? { ...base, status: "late", window: "closed" }
      : { ...base, status: "ok", window: "closed" };
  }
  return now.getTime() < graceMs
    ? { ...base, status: "ok", window: "open" }
    : { ...base, status: "missed", window: "closed" };
}
type DailyAlert = {
  level: "warn" | "critical";
  reason: string;
  kolkata_date: string;
  publication_id: string | null;
  first_seen: string;
};
function dedupeAlerts(alerts: readonly DailyAlert[]): DailyAlert[] {
  const seen = new Set<string>();
  const out: DailyAlert[] = [];
  for (const a of alerts) {
    const key = `${a.kolkata_date}|${a.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
/** Retry observability for a tick response: how many of today's
 *  deliveries are still retryable and how many attempts they have
 *  left. Read-only — it never promotes, sends, or changes a row. */
async function monitoringMeta(
  svc: Svc,
  kolkataDate: string,
  now: Date,
  preFetchedPub: { id: string; status: string; published_at: string | null } | null = null,
): Promise<{ schedule: ScheduleAssessment; retry: { retryable: number; attempts_remaining: number; publication_id: string | null } }> {
  const pub = preFetchedPub ?? (await (async () => {
    const { data: row } = await svc.from("daily_content_publications")
      .select("id, status, published_at")
      .eq("kolkata_date", kolkataDate)
      .maybeSingle();
    return row as { id: string; status: string; published_at: string | null } | null;
  })());
  const schedule = assessSchedule(now, kolkataDate, pub);
  let retryable = 0;
  let attemptsRemaining = 0;
  if (pub) {
    const { data: rows } = await svc.from("daily_content_deliveries")
      .select("id, attempts, max_attempts")
      .eq("publication_id", pub.id)
      .eq("status", "retryable");
    for (const r of (rows ?? []) as Array<{ attempts: number; max_attempts: number | null }>) {
      const max = r.max_attempts ?? 4;
      if (r.attempts >= max) continue;
      retryable += 1;
      attemptsRemaining += max - r.attempts;
    }
  }
  return { schedule, retry: { retryable, attempts_remaining: attemptsRemaining, publication_id: pub?.id ?? null } };
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
// (slugs + windows only), the weekly Jumu'ah occasion, and the context
// assembly. Corrections ARE carried here (Jumu'ah phase, 2026-11-17):
// planDay reads confirmed rows from islamic_calendar_corrections for the
// calculated Hijri month and applies the lib's rule (latest confirmed
// wins, proposed recorded but never applied) via edgeApplyCorrections.
// A failed corrections read degrades to calculated with a diagnostics
// flag — it never blocks the day. Every date it produces is labelled
// confirmation: "calculated" unless a confirmed correction applied it.
// Equivalence with the lib is pinned by edge tests (the dry-run's
// plan.context vs the lib's getIslamicContextForKey over a date list);
// if the port and the lib ever disagree, the test fails.

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

// JDN round-trip (ported VERBATIM from src/lib/islamicCalendar/hijri.ts:
// hijriToJdn + jdnToGregorian), so a Hijri date can be shifted by days.
function edgeHijriToJdn(h: { year: number; month: number; day: number }): number {
  return (
    h.day +
    Math.ceil(29.5 * (h.month - 1)) +
    (h.year - 1) * 354 +
    Math.floor((3 + 11 * h.year) / 30) +
    1948440 -
    1
  );
}

function edgeJdnToGregorian(jdn: number): { year: number; month: number; day: number } {
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

function edgeJdnToHijri(jdn: number): { year: number; month: number; day: number } {
  const g = edgeJdnToGregorian(jdn);
  return edgeGregorianToHijri(g.year, g.month, g.day);
}

/** Shift a Hijri date by n days (negative allowed); handles month/year rollover. */
function edgeAddHijriDays(h: { year: number; month: number; day: number }, n: number): { year: number; month: number; day: number } {
  return edgeJdnToHijri(edgeHijriToJdn(h) + n);
}

// ---- Calendar corrections (ported from src/lib/islamicCalendar/corrections.ts) ----
// A correction row (islamic_calendar_corrections) says: for Hijri month M
// of year Y, the calculated month started `dayOffset` days off from the
// locally sighted moon. dayOffset = -1 means the month started ONE DAY
// LATER than calculated; +1 means ONE DAY EARLIER. Only "confirmed"
// rows shift the date; "proposed" rows are recorded but never applied.
// Latest confirmed wins (by createdAt, then id); the table enforces
// UNIQUE(hijri_year, hijri_month), so in practice there is at most one
// row per month. AI NEVER creates or confirms a correction.
interface EdgeCalendarCorrection {
  id: string;
  hijriYear: number;
  hijriMonth: number;
  /** -1 = month started a day later than calculated; +1 = a day earlier. */
  dayOffset: -1 | 0 | 1;
  reasonBn: string;
  source: string;
  status: "confirmed" | "proposed";
  createdAt: string;
}

function edgeValidateCorrection(c: Partial<EdgeCalendarCorrection>): string[] {
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

function edgeApplyCorrections(
  hijri: { year: number; month: number; day: number },
  corrections: readonly EdgeCalendarCorrection[],
): {
  date: { year: number; month: number; day: number };
  applied: EdgeCalendarCorrection[];
  pending: EdgeCalendarCorrection[];
  confirmation: "calculated" | "confirmed";
} {
  const forMonth = corrections.filter(
    (c) => c.hijriYear === hijri.year && c.hijriMonth === hijri.month,
  );
  const byRecency = (a: EdgeCalendarCorrection, b: EdgeCalendarCorrection): number => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  };
  const pending = forMonth.filter((c) => c.status === "proposed").sort(byRecency);
  const confirmed = forMonth.filter((c) => c.status === "confirmed").sort(byRecency);
  if (confirmed.length === 0) {
    return { date: hijri, applied: [], pending, confirmation: "calculated" };
  }
  const latest = confirmed[confirmed.length - 1];
  const date = latest.dayOffset === 0 ? hijri : edgeAddHijriDays(hijri, latest.dayOffset);
  return { date, applied: [latest], pending, confirmation: "confirmed" };
}

/** Read the corrections rows for one calculated Hijri month. A failed
 *  read (e.g. the table predates the environment) degrades to an empty
 *  set with readError=true — the planner falls back to calculated dates
 *  and records the flag in diagnostics, never blocking the day. */
async function fetchCorrectionsForMonth(
  svc: Svc,
  hijriYear: number,
  hijriMonth: number,
): Promise<{ rows: EdgeCalendarCorrection[]; readError: boolean }> {
  try {
    const { data, error } = await svc
      .from("islamic_calendar_corrections")
      .select("id,hijri_year,hijri_month,day_offset,reason_bn,source,status,created_at")
      .eq("hijri_year", hijriYear)
      .eq("hijri_month", hijriMonth)
      .order("created_at", { ascending: true });
    if (error) return { rows: [], readError: true };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id ?? ""),
      hijriYear: Number(r.hijri_year),
      hijriMonth: Number(r.hijri_month),
      dayOffset: Number(r.day_offset) as -1 | 0 | 1,
      reasonBn: String(r.reason_bn ?? ""),
      source: String(r.source ?? ""),
      status: String(r.status) as "confirmed" | "proposed",
      createdAt: String(r.created_at ?? ""),
    }));
    return { rows, readError: false };
  } catch {
    return { rows: [], readError: true };
  }
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

// Weekly (Gregorian-weekday) occasions — the same entries as
// src/lib/islamicCalendar/events.ts WEEKLY_EVENTS (slugs + weekday only;
// names and descriptions stay in the lib). Jumu'ah recurs every Friday;
// it is not a Hijri-date window and carries no confirmation concept.
const EDGE_WEEKLY_EVENTS: ReadonlyArray<{ slug: string; weekday: number }> = [
  { slug: "jumuah", weekday: 5 },
];

/** The day's Islamic context for a Kolkata date: Hijri date (calculated,
 *  then shifted by confirmed corrections), active event slugs (catalog
 *  order, window end clamped to the real month length), and the Ramadan
 *  stage (date range only — no virtue claims attached). Mirrors the lib's
 *  getIslamicContext, including the weekly Jumu'ah check and the
 *  corrections rule. */
export function islamicContextForKolkataDate(
  kolkataDate: string,
  corrections: readonly EdgeCalendarCorrection[] = [],
): {
  gregorianKey: string;
  hijriKey: string;
  /** The tabular (calculated) Hijri date, before corrections. */
  hijriCalculated: { year: number; month: number; day: number };
  /** The date after confirmed corrections — the date to display. */
  hijri: { year: number; month: number; day: number };
  confirmation: "calculated" | "confirmed";
  appliedCorrections: EdgeCalendarCorrection[];
  pendingCorrections: EdgeCalendarCorrection[];
  activeEventSlugs: string[];
  ramadanStage: "first-ten" | "middle-ten" | "last-ten" | null;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(kolkataDate);
  const gy = m ? Number(m[1]) : 1970;
  const gm = m ? Number(m[2]) : 1;
  const gd = m ? Number(m[3]) : 1;
  const hijriCalculated = edgeGregorianToHijri(gy, gm, gd);
  const applied = edgeApplyCorrections(hijriCalculated, corrections);
  const hijri = applied.date;
  const monthLen = edgeHijriMonthLength(hijri.year, hijri.month);
  const activeEventSlugs = EDGE_ISLAMIC_EVENTS.filter(
    (e) =>
      e.hijriMonth === hijri.month &&
      hijri.day >= e.hijriDayStart &&
      hijri.day <= Math.min(e.hijriDayEnd, monthLen),
  ).map((e) => e.slug);
  // Weekly occasions: Gregorian-weekday based, appended after the Hijri
  // windows in catalog order (the lib does the same — the equivalence
  // test pins the order). new Date(gy, gm-1, gd) is local-midnight
  // parts, so getDay() is that calendar date's weekday in any timezone.
  const weekday = new Date(gy, gm - 1, gd).getDay();
  for (const w of EDGE_WEEKLY_EVENTS) {
    if (w.weekday === weekday) activeEventSlugs.push(w.slug);
  }
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
    hijriCalculated,
    hijri,
    confirmation: applied.confirmation,
    appliedCorrections: applied.applied,
    pendingCorrections: applied.pending,
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

// ---- Poster persistence (Daily Content Master Mission, poster pipeline) ----
// `set_poster` records a rendered poster on a PLANNED or PUBLISHED
// publication row — Stage 3 (Poster Asset Finalization) of the 4-stage
// pipeline:
//   1. Poster Generation (render) -> 2. Image QC -> 3. Asset Finalization
//   (this action) -> 4. Downstream Distribution (homepage / push / share /
//   Facebook — separate work that reads the finalized asset).
// Called by the poster-generation workflow (GitHub Actions) AFTER the PNG
// is rendered and QC-checked, using the same CRON-secret gate as the daily
// path (routed after the gate in the handler). The service-role client
// performs the write — no caller can write publications directly (RLS:
// "Service writes publications" only).
// In the split flow (Phase 3, Master Mission), the poster is finalized
// onto the PLANNED row — before any publish — so the first send can
// carry the image. `publish_planned` is the only step that publishes,
// and it refuses a row whose poster is not QC-passed.
//
// The finalized asset record persisted here:
//   poster_asset_id     — stable asset ID `poster:<kolkata_date>`
//   poster_storage_path — bucket-qualified path
//                         `daily-content-posters/<date>/portrait.png`
//   poster_url          — primary poster public URL (portrait 1080x1350)
//   poster_urls         — format -> public URL map (all rendered formats)
//   poster_checksum     — SHA-256 hex of the primary (portrait) PNG
//   poster_checksums    — format -> SHA-256 hex map
//   poster_scene_id     — background scene id (no-repeat vs yesterday)
//   poster_qc_status    — 'passed' | 'failed'
//
// Safety rules (defense in depth — the workflow also enforces them):
//  * The row must be status='planned' or 'published'. Posters are never
//    attached to a failed row. A planned row finalized here stays planned
//    until `publish_planned` publishes it — finalization alone never
//    publishes anything.
//  * A 'passed' poster requires a poster_url under the expected Storage
//    public prefix for the `daily-content-posters` bucket, with a
//    deterministic path `<kolkata_date>/<format>.png`, a matching asset ID
//    and storage path, and a valid SHA-256 checksum. A URL outside that
//    prefix is refused — the action never persists an arbitrary URL.
//  * A 'failed' attempt NEVER writes a poster URL (poster_url stays NULL,
//    or a previously passed poster stays intact). Only the error is recorded.
//  * Idempotency: once a poster has passed QC (poster_url set +
//    poster_qc_status='passed'), a later call without force=true is a
//    no-op returning {ok:true, deduped:true}. A re-render that fails does
//    not downgrade a passed poster.
//  * On a pass, the stored `push` jsonb's `image_url` is also set to the
//    poster URL, so push RETRIES (which re-read the stored push) carry
//    the image — and so the split flow's `publish_planned` first send
//    carries it too. This action does not re-send anything.
//  * Nothing here changes status/cards/push (other than push.image_url) /
//    kolkata_date, and nothing here publishes, sends, or re-sends
//    anything. A failed poster leaves a planned row planned (never
//    published) and a published row published (text-only).
const POSTER_FORMATS = ["portrait", "square", "wide", "story"] as const;

function isValidPosterUrl(value: unknown, kolkataDate: string): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return false;
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/daily-content-posters/`;
  if (!value.startsWith(prefix)) return false;
  const rest = value.slice(prefix.length);
  return POSTER_FORMATS.some((f) => rest === `${kolkataDate}/${f}.png`);
}

function isValidChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

// ---- Phase 3 (Hold/Quarantine) — quarantine marker (no migration) ----
// A poster failure is recorded by set_poster with poster_error set to
// the workflow's reason. A SECOND failure for the same row on the same
// Kolkata day is recorded with the `quarantined:` prefix instead: the
// row failed twice, so no automatic attempt retries it. The heal tick
// and the poster workflow both read this prefix (see isQuarantined).
// A successful set_poster pass clears poster_error (ends the hold).
// The prefix is a convention on the existing poster_error text column
// — no new column, no migration. The 500-char cap of the input
// validation is preserved when the prefix is added.
const QUARANTINE_PREFIX = "quarantined:";
const isQuarantined = (posterError: unknown): boolean =>
  typeof posterError === "string" && posterError.startsWith(QUARANTINE_PREFIX);

async function handleSetPoster(svc: Svc, body: Record<string, unknown>): Promise<Response> {
  const kolkataDate = body.kolkata_date;
  const qcStatus = body.poster_qc_status;
  const force = body.force === true;
  if (typeof kolkataDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(kolkataDate)) {
    return jsonResponse({ ok: false, error: "kolkata_date must be YYYY-MM-DD" }, 400);
  }
  if (qcStatus !== "passed" && qcStatus !== "failed") {
    return jsonResponse({ ok: false, error: "poster_qc_status must be 'passed' or 'failed'" }, 400);
  }
  const posterUrl = body.poster_url;
  const posterUrls = body.poster_urls;
  const sceneId = body.poster_scene_id;
  const posterError = body.poster_error;
  const assetId = body.poster_asset_id;
  const storagePath = body.poster_storage_path;
  const checksum = body.poster_checksum;
  const checksums = body.poster_checksums;
  if (qcStatus === "passed") {
    if (!isValidPosterUrl(posterUrl, kolkataDate)) {
      return jsonResponse({ ok: false, error: "poster_url must be a daily-content-posters URL for this date and format" }, 400);
    }
    if (posterUrls !== undefined) {
      if (typeof posterUrls !== "object" || posterUrls === null || Array.isArray(posterUrls)) {
        return jsonResponse({ ok: false, error: "poster_urls must be an object" }, 400);
      }
      for (const [format, url] of Object.entries(posterUrls as Record<string, unknown>)) {
        if (!(POSTER_FORMATS as readonly string[]).includes(format) || !isValidPosterUrl(url, kolkataDate)) {
          return jsonResponse({ ok: false, error: `poster_urls[${format}] is not a valid poster URL` }, 400);
        }
      }
    }
    if (typeof sceneId !== "string" || !/^[a-z0-9-]{1,64}$/.test(sceneId)) {
      return jsonResponse({ ok: false, error: "poster_scene_id must be a lowercase slug" }, 400);
    }
    if (assetId !== `poster:${kolkataDate}`) {
      return jsonResponse({ ok: false, error: "poster_asset_id must be poster:<kolkata_date>" }, 400);
    }
    if (storagePath !== `daily-content-posters/${kolkataDate}/portrait.png`) {
      return jsonResponse({ ok: false, error: "poster_storage_path must be daily-content-posters/<date>/portrait.png" }, 400);
    }
    if (!isValidChecksum(checksum)) {
      return jsonResponse({ ok: false, error: "poster_checksum must be a SHA-256 hex string" }, 400);
    }
    if (checksums !== undefined) {
      if (typeof checksums !== "object" || checksums === null || Array.isArray(checksums)) {
        return jsonResponse({ ok: false, error: "poster_checksums must be an object" }, 400);
      }
      for (const [format, sum] of Object.entries(checksums as Record<string, unknown>)) {
        if (!(POSTER_FORMATS as readonly string[]).includes(format) || !isValidChecksum(sum)) {
          return jsonResponse({ ok: false, error: `poster_checksums[${format}] must be a SHA-256 hex string` }, 400);
        }
      }
    }
  } else {
    if (posterUrl !== undefined || posterUrls !== undefined) {
      return jsonResponse({ ok: false, error: "a failed attempt must not carry a poster URL" }, 400);
    }
    if (typeof posterError !== "string" || posterError.length === 0 || posterError.length > 500) {
      return jsonResponse({ ok: false, error: "poster_error must be a non-empty string (max 500 chars)" }, 400);
    }
  }

  const { data: row, error: readError } = await svc
    .from("daily_content_publications")
    .select("id, status, poster_url, poster_qc_status, poster_error, poster_generated_at, push")
    .eq("kolkata_date", kolkataDate)
    .maybeSingle();
  if (readError) return jsonResponse({ ok: false, error: "failed to read publication" }, 500);
  if (!row) return jsonResponse({ ok: false, error: "no publication for date" }, 404);
  const pub = row as { id: string; status: string; poster_url: string | null; poster_qc_status: string | null; poster_error: string | null; poster_generated_at: string | null; push: Record<string, unknown> | null };
  if (pub.status !== "published" && pub.status !== "planned") {
    return jsonResponse({ ok: false, error: "publication is neither planned nor published" }, 409);
  }
  // Idempotency: a passed poster is never overwritten without force.
  if (!force && pub.poster_qc_status === "passed" && pub.poster_url) {
    return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate, poster_qc_status: "passed" });
  }

  const now = new Date().toISOString();
  // Phase 3 (Hold/Quarantine): a second poster failure for the same
  // row on the same Kolkata day quarantines it — the stored error
  // gains the `quarantined:` prefix, so no automatic attempt retries
  // the row. The first failure of the day is stored as given. The
  // day is compared in Asia/Kolkata (the row's date), not UTC: a
  // failure recorded at 02:00 IST and another at 09:00 IST are the
  // same Kolkata day even though their UTC dates differ.
  const priorFailedToday = qcStatus === "failed"
    && pub.poster_qc_status === "failed"
    && typeof pub.poster_generated_at === "string"
    && kolkataDateString(new Date(pub.poster_generated_at)) === kolkataDate
    && !isQuarantined(pub.poster_error);
  const storedError = qcStatus === "failed"
    ? (priorFailedToday ? `${QUARANTINE_PREFIX}${posterError as string}`.slice(0, 500) : (posterError as string))
    : null;
  const update = qcStatus === "passed"
    ? {
        poster_asset_id: assetId as string,
        poster_storage_path: storagePath as string,
        poster_url: posterUrl as string,
        poster_urls: (posterUrls ?? { portrait: posterUrl }) as never,
        poster_checksum: checksum as string,
        poster_checksums: (checksums ?? { portrait: checksum }) as never,
        poster_scene_id: sceneId as string,
        poster_qc_status: "passed",
        poster_error: null,
        poster_generated_at: now,
        // Push retries re-read the stored push: give them the image.
        // (First-send devices already received the text-only push.)
        push: (pub.push && typeof pub.push === "object"
          ? { ...pub.push, image_url: posterUrl as string }
          : pub.push) as never,
      }
    : {
        poster_qc_status: "failed",
        poster_error: storedError,
        poster_generated_at: now,
      };
  const { data: updated, error: updateError } = await svc
    .from("daily_content_publications")
    .update(update as never)
    .eq("id", pub.id)
    .in("status", ["planned", "published"])
    .select("id");
  if (updateError) return jsonResponse({ ok: false, error: "failed to update publication" }, 500);
  if (!((updated as unknown[] | null)?.length)) {
    return jsonResponse({ ok: false, error: "publication update affected 0 rows" }, 409);
  }
  return jsonResponse({
    ok: true,
    kolkata_date: kolkataDate,
    poster_qc_status: qcStatus,
    // Phase 3: the workflow log can see a quarantine without reading
    // the row back — a second same-day failure quarantines the row.
    ...(qcStatus === "failed" && isQuarantined(storedError) ? { quarantined: true } : {}),
  });
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

// ============================================================================
// Phase 6 — Mode A/B + per-channel switches.
//
// The four architecture settings (approval_required,
// website_auto_publish, facebook_auto_publish, daily_content_enabled)
// live on daily_content_settings; daily_content_enabled IS the
// existing `enabled` column (the master switch, owner-SQL only —
// never written by the update_settings action). The Mode A/B and
// per-channel columns are a migration SKETCH ONLY until the owner
// approves + applies them; until then the row has no such columns
// and readModeSettings returns the legacy defaults below.
//
// Fail-closed defaults (a missing/invalid column must NEVER silently
// enable publication):
//   approval_required            true  (Mode B) unless explicitly false
//   website_auto_publish         true  unless explicitly false (legacy:
//                                  publish_planned published regardless)
//   push_enabled                 true  unless explicitly false (legacy:
//                                  the daily path always sent)
//   facebook_auto_publish_enabled false unless explicitly true (Phase 4)
//   facebook_approval_required   true  unless explicitly false (Phase 4)
//   facebook_posting_enabled     true  unless explicitly false (Phase 4)
// A missing settings row means paused (enabled === false).
// ============================================================================
export type ModeSettings = {
  enabled: boolean;
  approvalRequired: boolean;
  websiteAutoPublish: boolean;
  pushEnabled: boolean;
  facebookAutoPublishEnabled: boolean;
  facebookApprovalRequired: boolean;
  facebookPostingEnabled: boolean;
};

/** Pure mapping from a settings row (select "*") to ModeSettings.
 *  Exported for the edge tests. A null row means paused. */
export function modeSettingsFromRow(row: Record<string, unknown> | null): ModeSettings {
  if (!row) {
    return {
      enabled: false,
      approvalRequired: true,
      websiteAutoPublish: true,
      pushEnabled: true,
      facebookAutoPublishEnabled: false,
      facebookApprovalRequired: true,
      facebookPostingEnabled: true,
    };
  }
  return {
    enabled: row.enabled === true,
    approvalRequired: row.approval_required !== false,
    websiteAutoPublish: row.website_auto_publish !== false,
    pushEnabled: row.push_enabled !== false,
    facebookAutoPublishEnabled: row.facebook_auto_publish_enabled === true,
    facebookApprovalRequired: row.facebook_approval_required !== false,
    facebookPostingEnabled: row.facebook_posting_enabled !== false,
  };
}

/** Read the mode settings (select "*" — the Mode A/B columns exist
 *  only after the migration; a wildcard returns whatever is present).
 *  Returns both the mapped settings and the raw row: the raw row is
 *  how callers tell "Facebook columns absent" (migration unapplied)
 *  from "Facebook configured but auto-publish off". */
export async function readModeSettings(svc: Svc): Promise<{
  settings: ModeSettings;
  row: Record<string, unknown> | null;
}> {
  const { data, error } = await svc.from("daily_content_settings").select("*").limit(1).maybeSingle();
  if (error || !data) return { settings: modeSettingsFromRow(null), row: null };
  const row = data as Record<string, unknown>;
  return { settings: modeSettingsFromRow(row), row };
}

/** The newest recommendation run for the date, or null. */
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

/** The newest run for the date under the current mode, or null.
 *  Mode B: approved runs only (unchanged behaviour). Mode A: the
 *  newest run with status 'approved' OR 'pending_review' — a rejected
 *  run is NEVER consumed in either mode. The caller gates a
 *  pending_review run through validateModeARun before trusting it. */
async function fetchLatestRunForMode(
  svc: Svc,
  kolkataDate: string,
  approvalRequired: boolean,
): Promise<ApprovedRunRow | null> {
  if (approvalRequired) return fetchApprovedRun(svc, kolkataDate);
  const { data } = await svc
    .from("daily_content_recommendations")
    .select("id, kolkata_date, hijri_key, context, recommendations, dropped, status, created_by, created_at")
    .eq("kolkata_date", kolkataDate)
    .in("status", ["approved", "pending_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as ApprovedRunRow | null;
}

/** The server-side Mode A gate for an UNAPPROVED run. An approved run
 *  was human-reviewed and is not gated here (its slots are still
 *  re-validated one by one by the planner, as before). A pending_review
 *  run is consumed in Mode A ONLY when every recommendation is
 *  well-formed AND resolves in the LIVE eligible pool: a malformed
 *  ref, a ref outside the pool (fabricated or stale), or more than
 *  one hadith fails the whole run — it is ignored wholesale and the
 *  planner falls back to the seeded selection, never partially
 *  consuming an untrusted run. Exported for the edge tests. */
export function validateModeARun(
  run: ApprovedRunRow | null,
  eligibleHadithRefs: Set<string>,
  eligibleContentRefs: Set<string>,
): { ok: boolean; reason?: string } {
  if (!run) return { ok: false, reason: "no run" };
  if (run.status !== "approved" && run.status !== "pending_review") {
    return { ok: false, reason: `run status ${run.status} is never consumed` };
  }
  if (!Array.isArray(run.recommendations) || run.recommendations.length === 0) {
    return { ok: false, reason: "run has no recommendations" };
  }
  let hadithCount = 0;
  for (const rec of run.recommendations) {
    if (!rec || typeof rec !== "object") return { ok: false, reason: "malformed recommendation" };
    const kind = (rec as { kind?: unknown }).kind;
    const ref = (rec as { ref?: unknown }).ref;
    if (kind !== "hadith" && kind !== "content") return { ok: false, reason: "malformed recommendation kind" };
    if (typeof ref !== "string" || !ref) return { ok: false, reason: "malformed recommendation ref" };
    if (kind === "hadith") {
      if (!ref.startsWith("hadith:")) return { ok: false, reason: `hadith ref ${ref} is malformed` };
      if (!eligibleHadithRefs.has(ref)) return { ok: false, reason: `hadith ref ${ref} is not in the eligible pool` };
      hadithCount++;
      if (hadithCount > 1) return { ok: false, reason: "more than one hadith in the run" };
    } else {
      if (!ref.startsWith("content:")) return { ok: false, reason: `content ref ${ref} is malformed` };
      if (!eligibleContentRefs.has(ref)) return { ok: false, reason: `content ref ${ref} is not in the eligible pool` };
    }
  }
  return { ok: true };
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
  // The day's Islamic context — recorded on every plan return,
  // including the fail-closed truncated path below. Corrections are
  // read for the CALCULATED Hijri month (a correction is keyed by the
  // month it corrects); a failed read degrades to calculated dates with
  // a diagnostics flag, never blocking the day. The context itself
  // carries the applied/pending corrections (the transparent record).
  const calculatedContext = islamicContextForKolkataDate(kolkataDate);
  const { rows: correctionRows, readError: correctionsReadError } =
    await fetchCorrectionsForMonth(svc, calculatedContext.hijri.year, calculatedContext.hijri.month);
  const context = islamicContextForKolkataDate(kolkataDate, correctionRows);
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
        mode: "B",
        modeAConsumed: false,
        modeAGate: null,
        runStatus: null,
        correctionsApplied: context.appliedCorrections.length,
        correctionsReadError,
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

  // Phase 9 — the newest recommendation run for today, if one
  // exists. It is advisory: each slot is re-validated below, and a short
  // or stale run falls back to the seeded selection slot by slot.
  // Phase 6 (Mode A/B): which runs may be consumed is decided by the
  // mode settings. Mode B (the default) takes approved runs only. Mode
  // A also takes the newest pending_review run — but ONLY when it
  // passes validateModeARun (every ref well-formed and in the live
  // eligible pool). A failed gate ignores the run wholesale (the
  // seeded selection fills every slot); a rejected run is never
  // consumed in either mode.
  const { settings: modeSettings } = await readModeSettings(svc);
  const modeA = !modeSettings.approvalRequired;
  let approved = await fetchLatestRunForMode(svc, kolkataDate, modeSettings.approvalRequired);
  let modeAGate: { ok: boolean; reason?: string } | null = null;
  let modeAConsumed = false;
  if (approved && approved.status === "pending_review") {
    modeAGate = validateModeARun(
      approved,
      new Set(eligibleH.map((h) => `hadith:${h.id}`)),
      new Set(eligibleD.map((d) => `content:${d.slug}`)),
    );
    if (modeAGate.ok) {
      modeAConsumed = true;
    } else {
      approved = null;
    }
  }

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
      // Phase 6 — which mode consumed the run (A = an unapproved run
      // passed the server-side gate; B = approved-only, the default).
      mode: modeA ? "A" : "B",
      modeAConsumed,
      modeAGate,
      runStatus: approved?.status ?? null,
      correctionsApplied: context.appliedCorrections.length,
      correctionsReadError,
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
  // Delivery-count contract (1-token gap fix, 2026-11-17): `total`
  // counts every enabled token row fetched, and every token lands in
  // exactly one bucket — sent, failed, or skipped — so the invariant
  // total == sent + failed + skipped holds for every call. `disabled`
  // is a SUB-count of `failed` (tokens disabled for 404/410/401/403),
  // never a separate bucket. Before this fix, four `continue` branches
  // exited without counting the token (opted-out snapshot, prior row,
  // cap-insert conflict, lost claim) — a duplicate device_id
  // (production holds 5 duplicate (device_id, platform) groups) hit
  // the cap-insert branch and produced the observed 17-total /
  // 16-accounted gap (2026-11-15 production, 2026-11-16 heal test,
  // 2026-11-17 E2E). The invariant is asserted by the edge tests on
  // every send shape; there is no runtime log guard because edge
  // console output has no reader in this project (Supabase logs are
  // not agent-readable) — the enforced CI suite is the guard.
  for (const t of tokens) {
    total++;
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
    // Opted out at snapshot: skipped, never sent, no delivery row.
    if (optedOut.has(t.device_id)) {
      skipped++;
      continue;
    }
    // Defense-in-depth: skip if a delivery row already exists for this
    // publication + token, even if the device_id changed since the row
    // was written. The DB unique constraint on (publication, device)
    // remains the primary guard for stable device_ids.
    const { data: prior } = await svc.from("daily_content_deliveries")
      .select("id")
      .eq("publication_id", publicationId)
      .eq("token_id", t.id)
      .limit(1);
    if ((prior as unknown[] | null)?.length) {
      skipped++;
      continue;
    }
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
    if (capErr) {
      // Already attempted for this device today — skip (no double-send).
      // A duplicate token row for one device lands here: the first row
      // owns the (publication, device) delivery row, so the second
      // collides on the cap insert. It is counted skipped, never sent.
      skipped++;
      continue;
    }
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
    if (!((claimed as unknown[] | null)?.length)) {
      // lost the race — never send. The row stays pending/leased for
      // its owner (a concurrent run or the retry tick), which counts
      // the send; this pass counts the token skipped.
      skipped++;
      continue;
    }
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
      // Counted: the row was closed terminally as failed this tick.
      // (Delivery-count fix: this was the one runRetries branch that
      // closed a row failed without counting it — its siblings
      // stale-date, no-push, opt-out and S-6 all count.)
      failed++;
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
      failed++; // counted: same terminal close as the H1 branch above
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

// ---- Phase 3 (Master Mission) — split plan -> poster -> publish ----
// The default daily path (plan -> send -> publish in one call) sends the
// first push text-only, because `set_poster` could only finalize onto an
// already-published row (Production Blocker #1). The split flow breaks
// that call into three explicit steps, each behind the same CRON-secret
// gate and the same fail-closed settings gate:
//   1. plan_only        — plan the day, insert the row as `planned`,
//                          send nothing, publish nothing.
//   2. poster workflow  — render + QC + `set_poster` onto the planned
//                          row (now allowed); a QC failure leaves the
//                          row planned, so downstream has nothing to
//                          distribute that day.
//   3. publish_planned  — publish ONLY a planned row whose poster is
//                          QC-passed, sending the first push with the
//                          finalized poster as `image_url`.
// The default daily path ({}) is unchanged: it still plans, sends, and
// publishes in one call. The split flow is opt-in via the two new modes.
// A planned row that never publishes is superseded by the next day's
// tick (existing runTick behaviour) — a poster outage loses that day,
// and the system recovers the next day automatically.

type PushPayload = NonNullable<Awaited<ReturnType<typeof planDay>>["push"]>;

type PlannedRowResolution =
  | { kind: "ready"; publicationId: string; pushForSend: PushPayload }
  | { kind: "deduped" }
  | { kind: "conflict"; error: string };

/** Record a failed plan once per date (shared by the daily path and
 *  plan_only). Never lets the failure row reserve the date against a
 *  later recovery: a row that already occupies today is left untouched
 *  (published means a concurrent run already finished the day;
 *  planned/failed means an earlier attempt already recorded its
 *  outcome). Returns "deduped" when today is already published. */
async function recordFailedPlan(
  svc: Svc,
  kolkataDate: string,
  plan: Awaited<ReturnType<typeof planDay>>,
): Promise<"deduped" | "recorded"> {
  const { data: todayRow } = await svc.from("daily_content_publications")
    .select("id, status")
    .eq("kolkata_date", kolkataDate)
    .maybeSingle();
  if ((todayRow as { status?: string } | null)?.status === "published") return "deduped";
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
  return "recorded";
}

/** Resolve today's publication row for a valid plan: adopt an existing
 *  planned row (resume a crashed run — same day, same content), repair
 *  a failed/corrupt row in place, or insert a fresh `planned` row.
 *  Moved verbatim from the daily branch so the daily path and
 *  plan_only resolve identically. Never sends, never publishes. */
async function ensurePlannedRow(
  svc: Svc,
  kolkataDate: string,
  plan: Awaited<ReturnType<typeof planDay>>,
): Promise<PlannedRowResolution> {
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
  const resolveRow = async (row: { id: string; status: string; push: unknown } | null): Promise<PlannedRowResolution> => {
    if (!row) return { kind: "conflict", error: "Publication repair conflict." };
    if (row.status === "published") return { kind: "deduped" };
    if (row.status === "planned" && row.push) {
      // Resume a crashed run: adopt the stored push (same day, same
      // content — re-planning could change the day's content mid-flight).
      return { kind: "ready", publicationId: row.id, pushForSend: row.push as PushPayload };
    }
    const repaired = await repairToPlan(row.id, row.status === "failed" ? "failed" : "corrupt");
    if (repaired) return { kind: "ready", publicationId: row.id, pushForSend: plan.push as PushPayload };
    const { data: fresh } = await svc.from("daily_content_publications")
      .select("id, status, push").eq("id", row.id).maybeSingle();
    const f = fresh as { id: string; status: string; push: unknown } | null;
    if (f?.status === "published") return { kind: "deduped" };
    if (f?.status === "planned" && f.push) {
      return { kind: "ready", publicationId: f.id, pushForSend: f.push as PushPayload };
    }
    return { kind: "conflict", error: "Publication repair conflict." };
  };
  const { data: todayRow } = await svc.from("daily_content_publications")
    .select("id, status, push")
    .eq("kolkata_date", kolkataDate)
    .maybeSingle();
  if (todayRow) {
    return await resolveRow(todayRow as { id: string; status: string; push: unknown });
  }
  const { data: pub } = await svc
    .from("daily_content_publications")
    .insert({
      kolkata_date: kolkataDate,
      status: "planned",
      hadith_ref: `hadith:${plan.hadith!.id}`,
      hadith_source_line: plan.hadith!.sourceLine,
      cards: plan.cards,
      push: plan.push,
      hadith_cycle: plan.hadithCycle,
      card_cycle: plan.cardCycle,
      // Phase 9 — provenance of the plan (null when seeded).
      recommendation_id: plan.recommendationId,
    } as never)
    .select("id")
    .single();
  const publicationId = (pub as { id: string } | null)?.id ?? null;
  if (publicationId) {
    return { kind: "ready", publicationId, pushForSend: plan.push as PushPayload };
  }
  // Race: another run created today's row first. Resolve it the
  // same way as above instead of failing the day.
  const { data: raced } = await svc
    .from("daily_content_publications")
    .select("id, status, push")
    .eq("kolkata_date", kolkataDate)
    .maybeSingle();
  const r = await resolveRow(raced as { id: string; status: string; push: unknown } | null);
  if (r.kind === "conflict") return { kind: "conflict", error: "Publication insert failed." };
  return r;
}

/** Send the first push for a planned row and flip it to `published`.
 *  Moved verbatim from the daily branch (stale-promotion, send, H3
 *  flip) so the daily path and `publish_planned` send identically.
 *  Throws on a send abort (row stays `planned`) or on a zero-row flip;
 *  callers map the throw to a 500. Never marks published on failure. */
async function sendAndPublish(
  svc: Svc,
  publicationId: string,
  pushForSend: PushPayload,
): Promise<{ publication_id: string; delivery: Awaited<ReturnType<typeof sendToTokens>> }> {
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
  const delivery = await sendToTokens(svc, publicationId, pushForSend);
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
  return { publication_id: publicationId, delivery };
}

/** Phase 6 — the heal tick's Facebook disposition after a website
 *  publication. This is the auto-publish trigger for the Facebook
 *  channel: it delegates to the EXISTING facebook_publish action
 *  logic (handleFacebookPublish, Phase 4 section below — a hoisted
 *  function declaration, so the call below resolves) — same gates,
 *  same log row, same Mode B queue. It does not re-implement
 *  publishing.
 *
 *  Dispositions (no Graph call is made except in the auto-publish
 *  case):
 *   - "paused"          settings disabled, or facebook_posting_enabled
 *                       === false.
 *   - "not_implemented" the Facebook columns are absent from the
 *                       settings row — the Facebook migration is
 *                       unapplied, so the channel does not exist yet.
 *   - "manual"          auto-publish is off: Facebook is a manual
 *                       action; the heal tick never posts.
 *   - "queued"          auto-publish on + Mode B: the log row is
 *                       staged and waiting for facebook_approve
 *                       (zero Graph calls).
 *   - "published"       auto-publish on and the post is live (or an
 *                       earlier tick already posted it).
 *   - "failed"          auto-publish on and the attempt failed
 *                       (terminal or retryable — see the log row).
 *   - "not_configured"  auto-publish on but no Page token secret.
 *   - "skipped"         the log row is paused/skipped.
 *  Never throws and never touches the publication row: a Facebook
 *  failure can never roll back a website publication. */
async function facebookDispositionAfterPublish(svc: Svc, kolkataDate: string): Promise<string> {
  try {
    const { settings: mode, row } = await readModeSettings(svc);
    if (!mode.enabled) return "paused";
    const fbConfigured = row !== null &&
      ("facebook_auto_publish_enabled" in row || "facebook_posting_enabled" in row || "facebook_page_id" in row);
    if (!fbConfigured) return "not_implemented";
    if (mode.facebookPostingEnabled === false) return "paused";
    if (mode.facebookAutoPublishEnabled !== true) return "manual";
    const res = await handleFacebookPublish({ action: "facebook_publish", kolkata_date: kolkataDate }, svc);
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (j.queued === true) return "queued";
    if (j.ok === true && (typeof j.post_id === "string" || j.deduped === true)) return "published";
    if (j.ok === true && j.skipped === true) return "skipped";
    if (typeof j.error === "string" && j.error === "facebook_log_unavailable") return "not_implemented";
    if (typeof j.error === "string" && j.error === "FACEBOOK_PAGE_ACCESS_TOKEN is not configured") return "not_configured";
    if (j.ok === false) return "failed";
    return "unknown";
  } catch {
    return "failed";
  }
}

/** Split-flow self-healing tick (Phase 3 — supersedes the text-only
 *  heal of the self-healing branch, which published via publishPlan()
 *  with image_url null).
 *
 *  Runs AFTER the plain retry pass (tick). It NEVER sends a text-only
 *  push and NEVER flips a row to published on its own. The only send
 *  in this function is publishPlanned, which refuses any row whose
 *  poster is not QC-passed — so a healed day always carries the
 *  finalized poster image, exactly like the E2E split flow.
 *
 *  Outcomes (kolkata_date is always today):
 *   - published row                 -> healed:false (nothing to do)
 *   - planned + poster QC-passed    -> publishPlanned (healed:true
 *     with the delivery counts; the poster workflow's publish step
 *     failed after set_poster — the heal finishes it, with the image)
 *   - planned + quarantined poster -> healed:false, hold:"quarantined"
 *     (alert: critical — needs owner/admin review; no dispatch)
 *   - planned + poster failed      -> healed:false, hold:"poster_failed"
 *     (alert: warn — the poster workflow should retry; dispatch it)
 *   - planned + poster pending     -> healed:false, hold:"poster_pending"
 *     (no alert — the poster workflow has not run yet; dispatch it)
 *   - planned + no stored push     -> repaired in place by re-planning
 *     (corrupt row, same rule as the daily path), healed:"planned"
 *   - no row / status='failed'     -> planDay + ensurePlannedRow
 *     (plan-only semantics: send nothing, flip nothing),
 *     healed:"planned" (dispatch the poster workflow) — or, when no
 *     valid plan exists, one failed row + hold:"no_valid_plan"
 *     (alert: critical — the day will be lost without intervention)
 *
 *  The response also carries per-channel status (website / push /
 *  facebook) and an `alert` object when a human should look: the
 *  retry workflow logs it (there is no email/webhook channel yet —
 *  that needs an owner decision; see the Phase 3 report §5).
 *  `healed` is "planned" when a planned row was created, true when a
 *  QC-passed row was published, false otherwise. */
async function healSplitFlow(
  svc: Svc,
  kolkataDate: string,
  tick: Awaited<ReturnType<typeof runTick>>,
): Promise<Response> {
  const channels = (website: string, push: unknown, facebook = "not_implemented") => ({
    website,
    push: push ?? null,
    facebook,
  });
  const alertFor = (level: "warn" | "critical", reason: string, publicationId: string | null) => ({
    level,
    reason,
    kolkata_date: kolkataDate,
    publication_id: publicationId,
    first_seen: new Date().toISOString(),
  });
  const { data: row } = await svc.from("daily_content_publications")
    .select("id, status, poster_qc_status, poster_error, poster_url, push, published_at")
    .eq("kolkata_date", kolkataDate)
    .maybeSingle();
  const pub = row as {
    id: string;
    status: string;
    poster_qc_status: string | null;
    poster_error: string | null;
    poster_url: string | null;
    push: Record<string, unknown> | null;
    published_at: string | null;
  } | null;
  // Phase 10 — monitoring meta, computed BEFORE any healing action:
  // the schedule reflects the day as the tick found it (a missed day
  // that gets healed still reports schedule:"missed"), and the retry
  // summary reflects the deliveries as the tick found them.
  const metaNow = new Date();
  const meta = await monitoringMeta(svc, kolkataDate, metaNow, pub);
  const respond = (body: Record<string, unknown>, status = 200) => {
    const alerts: DailyAlert[] = [];
    const single = body.alert as DailyAlert | undefined;
    if (single) alerts.push(single);
    if (meta.schedule.status === "missed") {
      alerts.push({
        level: "critical",
        reason: "schedule_missed: no publication by 06:30 IST",
        kolkata_date: kolkataDate,
        publication_id: pub?.id ?? null,
        first_seen: metaNow.toISOString(),
      });
    }
    return jsonResponse({ ...body, schedule: meta.schedule, retry: meta.retry, alerts: dedupeAlerts(alerts) }, status);
  };

  if (pub?.status === "published") {
    // Phase 6: the website is already published — the heal tick is
    // still the Facebook auto-publish trigger for this row (Mode B
    // queues, Mode A posts; auto-publish off means "manual").
    const fb = await facebookDispositionAfterPublish(svc, kolkataDate);
    return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: null, channels: channels("published", null, fb) });
  }

  if (pub?.status === "planned" && pub.push) {
    if (isQuarantined(pub.poster_error)) {
      return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: "quarantined", publication_id: pub.id,
        channels: channels("quarantined", null),
        alert: alertFor("critical", "quarantined: poster failed twice; needs owner/admin review", pub.id) });
    }
    if (pub.poster_qc_status === "passed" && pub.poster_url) {
      // The poster is QC-passed but the row never published — the
      // poster workflow's publish step failed after set_poster.
      // Finish it here, through the same gate, with the image.
      const published = await publishPlanned(svc, kolkataDate);
      const pj = (await published.json().catch(() => ({}))) as Record<string, unknown>;
      if (pj.ok === true && pj.deduped !== true) {
        const fb = await facebookDispositionAfterPublish(svc, kolkataDate);
        return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: true, hold: null, publication_id: pj.publication_id,
          channels: channels("published", pj.delivery ?? null, fb) });
      }
      if (pj.deduped === true) {
        const fb = await facebookDispositionAfterPublish(svc, kolkataDate);
        return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: null, deduped: true,
          channels: channels("published", null, fb) });
      }
      return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: "publish_failed", publication_id: pub.id,
        channels: channels("planned", null),
        alert: alertFor("warn", `publish_planned failed: ${typeof pj.error === "string" ? pj.error : "unknown"}`, pub.id) });
    }
    if (pub.poster_qc_status === "failed") {
      return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: "poster_failed", publication_id: pub.id,
        channels: channels("held", null),
        alert: alertFor("warn", "poster failed; poster workflow retry needed", pub.id) });
    }
    return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: "poster_pending", publication_id: pub.id,
      channels: channels("planned", null) });
  }

  // No row, a failed row (no valid plan), or a planned row with no
  // stored push (corrupt): plan the day with plan-only semantics.
  // ensurePlannedRow repairs a failed/corrupt row in place or inserts
  // a fresh planned row. Never sends, never flips.
  const plan = await planDay(svc, kolkataDate);
  if (!plan.hadith || !plan.push) {
    const recorded = await recordFailedPlan(svc, kolkataDate, plan);
    if (recorded === "deduped") {
      return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: null, deduped: true,
        channels: channels("published", null) });
    }
    return respond({ ok: false, kolkata_date: kolkataDate, tick, healed: false, hold: "no_valid_plan", reason: plan.hadithEmptyReason,
      channels: channels("failed", null),
      alert: alertFor("critical", `no valid plan: ${plan.hadithEmptyReason ?? "unknown"}`, pub?.id ?? null) });
  }
  const r = await ensurePlannedRow(svc, kolkataDate, plan);
  if (r.kind === "deduped") {
    return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: null, deduped: true,
      channels: channels("published", null) });
  }
  if (r.kind === "conflict") {
    return respond({ ok: false, error: r.error }, 500);
  }
  return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: "planned", hold: null, publication_id: r.publicationId,
    channels: channels("planned", null) });
}

/** Publish step 3 of the split flow: publish a planned row ONLY when
 *  its poster is finalized (QC-passed), sending the first push with the
 *  finalized poster as `image_url`. Refuses anything else — a failed
 *  or missing poster leaves the row planned, so downstream has nothing
 *  to distribute that day. An already-published row dedupes. */
async function publishPlanned(svc: Svc, kolkataDate: string): Promise<Response> {
  const { data: row } = await svc.from("daily_content_publications")
    .select("id, status, push, poster_url, poster_qc_status")
    .eq("kolkata_date", kolkataDate)
    .maybeSingle();
  const pub = row as {
    id: string;
    status: string;
    push: Record<string, unknown> | null;
    poster_url: string | null;
    poster_qc_status: string | null;
  } | null;
  if (!pub) return jsonResponse({ ok: false, error: "no publication for date" }, 404);
  if (pub.status === "published") return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
  if (pub.status !== "planned") {
    return jsonResponse({ ok: false, error: "publication is not planned", reason: "not_planned" }, 409);
  }
  // The split-flow gate: a publication is published ONLY with a
  // QC-passed finalized poster. A failed or missing poster leaves
  // the row planned — downstream has nothing to distribute.
  if (pub.poster_qc_status !== "passed" || !pub.poster_url) {
    return jsonResponse({ ok: false, reason: "poster_not_ready", poster_qc_status: pub.poster_qc_status ?? null }, 409);
  }
  const storedPush = pub.push && typeof pub.push === "object" ? (pub.push as Record<string, unknown>) : null;
  if (!storedPush) return jsonResponse({ ok: false, error: "planned row has no push payload" }, 500);
  // Phase 6 — per-channel switches. website_auto_publish === false
  // refuses the website publication (the row stays planned); a
  // paused website channel never publishes. push_enabled === false
  // publishes the website WITHOUT sending: the row flips with zeroed
  // delivery counters and no delivery rows are created, so no push is
  // queued for later — the push channel's pause is honored, not
  // deferred. (Push catch-up after unpausing is not implemented;
  // see the Phase 6 report.) Missing columns mean legacy behaviour
  // (website + push on).
  const { settings: modeSettings } = await readModeSettings(svc);
  if (modeSettings.websiteAutoPublish === false) {
    return jsonResponse({ ok: false, error: "website_paused", reason: "website_auto_publish is false" }, 409);
  }
  if (modeSettings.pushEnabled === false) {
    try {
      const result = await publishWithoutPush(svc, pub.id);
      return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: result.publication_id, delivery: result.delivery });
    } catch (e) {
      return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  // set_poster already sets push.image_url; re-derive it from the
  // finalized poster_url so the first send carries the image even if
  // the stored push predates finalization.
  const pushForSend = { ...storedPush, image_url: pub.poster_url } as PushPayload;
  try {
    const result = await sendAndPublish(svc, pub.id, pushForSend);
    return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: result.publication_id, delivery: result.delivery });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/** Publish a planned row WITHOUT sending any push (Phase 6: the push
 *  channel is paused). The flip is the same conditional guard
 *  sendAndPublish uses — it matches zero rows when another worker
 *  already flipped the row, and that is a failure, never a success.
 *  No delivery rows are created: a push-paused day gets no push, and
 *  unpausing later does not retro-send it. */
async function publishWithoutPush(
  svc: Svc,
  publicationId: string,
): Promise<{ publication_id: string; delivery: { total: number; sent: number; failed: number; disabled: number; skipped: number; push_paused: boolean } }> {
  const { data: flipped } = await svc.from("daily_content_publications").update({
    status: "published",
    published_at: new Date().toISOString(),
    recipients_total: 0,
    recipients_sent: 0,
    recipients_failed: 0,
  } as never).eq("id", publicationId).eq("status", "planned").select("id");
  if (!((flipped as unknown[] | null)?.length)) throw new Error("Publication flip affected 0 rows");
  return { publication_id: publicationId, delivery: { total: 0, sent: 0, failed: 0, disabled: 0, skipped: 0, push_paused: true } };
}

// ============================================================================
// Phase 6 — admin settings writes (Mode A/B + per-channel switches).
//
// The daily-content function is dual-auth: automation calls carry the
// CRON secret, admin settings writes carry the admin's own Supabase
// JWT. verifyAdmin below implements the SAME trust model as
// _shared/require-admin.ts (anon-client getClaims + is_admin RPC,
// 401/403 fail-closed) locally instead of importing that module: the
// Node test harness stages this file by rewriting only the two esm.sh
// imports, and a relative ../_shared import would break staging.
// The logic is intentionally identical; if require-admin.ts changes
// its trust model, this verifier must change with it.
//
// ALLOWLIST (booleans only): approval_required, website_auto_publish,
// facebook_auto_publish_enabled, facebook_approval_required,
// facebook_posting_enabled, push_enabled. The master `enabled`
// toggle is NOT on the list — it stays owner-SQL only (403). Every
// accepted change writes one admin_audit_log row, guarded exactly
// like Phase 4's facebook_approve: only when the actor is a real
// admin profile UUID (UUID-shaped AND present in profiles), so a
// display name or a made-up id is never written as actor_id.
// ============================================================================
const UPDATE_SETTINGS_ALLOWLIST = [
  "approval_required",
  "website_auto_publish",
  "facebook_auto_publish_enabled",
  "facebook_approval_required",
  "facebook_posting_enabled",
  "push_enabled",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyAdmin(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? null;
  if (!header || !header.startsWith("Bearer ") || header.length <= "Bearer ".length) {
    return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "Server auth configuration missing" };
  }
  const jwt = header.slice("Bearer ".length);
  const authed = createClient(url, anonKey, {
    global: { headers: { Authorization: header } },
  });
  const { data: claimsData, error: claimsErr } = await authed.auth.getClaims(jwt);
  if (claimsErr || typeof (claimsData as { claims?: { sub?: unknown } } | null)?.claims?.sub !== "string" ||
    !(claimsData as { claims: { sub: string } }).claims.sub) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  const userId = (claimsData as { claims: { sub: string } }).claims.sub;
  const { data: isAdmin, error: isAdminErr } = await authed.rpc("is_admin", { _user_id: userId });
  if (isAdminErr || isAdmin !== true) {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return { ok: true, userId };
}

async function handleUpdateSettings(req: Request, svc: Svc, body: Record<string, unknown>): Promise<Response> {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const adminId = auth.userId;
  const patch = body.settings;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return jsonResponse({ ok: false, error: "settings must be an object" }, 400);
  }
  const entries = Object.entries(patch as Record<string, unknown>);
  if (entries.length === 0) return jsonResponse({ ok: false, error: "no settings provided" }, 400);
  if ("enabled" in (patch as Record<string, unknown>)) {
    return jsonResponse({ ok: false, error: "enabled is owner-SQL only and cannot be changed here" }, 403);
  }
  for (const [k, v] of entries) {
    if (!(UPDATE_SETTINGS_ALLOWLIST as readonly string[]).includes(k)) {
      return jsonResponse({ ok: false, error: `unknown setting: ${k}` }, 400);
    }
    if (typeof v !== "boolean") {
      return jsonResponse({ ok: false, error: `setting ${k} must be a boolean` }, 400);
    }
  }
  const prev = await svc.from("daily_content_settings").select("*").limit(1).maybeSingle();
  const prevRow = (prev.data ?? null) as Record<string, unknown> | null;
  if (!prevRow) return jsonResponse({ ok: false, error: "settings row not found" }, 500);
  const updated = await svc.from("daily_content_settings")
    .update(patch as never).eq("id", 1).select("id");
  if ((updated as { error?: { message?: string; code?: string } | null }).error) {
    const err = (updated as { error: { message?: string; code?: string } }).error;
    const msg = typeof err.message === "string" ? err.message : "";
    // A missing column (the Mode A/B migration is not applied) fails
    // here — fail closed and say so instead of a bare 500.
    if (err.code === "PGRST204" || /column .* does not exist/i.test(msg) || /Could not find the .* column/i.test(msg)) {
      return jsonResponse({ ok: false, error: "settings_columns_missing", detail: "apply the Mode A/B migration first" }, 500);
    }
    return jsonResponse({ ok: false, error: "settings update failed", detail: msg }, 500);
  }
  // Audit-logged, guarded: only a real admin profile UUID is written
  // as actor_id (Phase 4 pattern). The change itself is recorded in
  // the response either way, so the decision is never lost when the
  // audit insert is skipped.
  let auditNote = "skipped_no_admin_uuid";
  if (UUID_RE.test(adminId)) {
    const profile = await svc.from("profiles").select("id").eq("id", adminId).limit(1).maybeSingle();
    if (!profile.error && profile.data) {
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      for (const [k, v] of entries) changed[k] = { from: prevRow[k] ?? null, to: v };
      const audit = await svc.from("admin_audit_log").insert({
        action: "daily_content_settings_update",
        actor_id: adminId,
        resource_type: "daily_content_settings",
        resource_id: "1",
        metadata: { changed },
      });
      auditNote = (audit as { error?: { message?: string } | null }).error
        ? `audit_insert_failed: ${(audit as { error: { message: string } }).error.message}`
        : "written";
    }
  }
  return jsonResponse({ ok: true, updated: patch, admin_audit_log: auditNote });
}

// ============================================================================
// Jumu'ah phase — admin calendar corrections (moon-sighting adjustments).
//
// The admin panel records a correction for one Hijri month through the
// `calendar_correction` action (admin-JWT-gated, routed BEFORE the
// CRON-secret gate like update_settings; verifyAdmin implements the SAME
// trust model as _shared/require-admin.ts).
//
// The table enforces UNIQUE(hijri_year, hijri_month), so a second row
// for the same month cannot exist — a wrong correction is SUPERSEDED by
// updating the existing row (the migration's "superseded by a newer row"
// cannot work as written under the UNIQUE constraint). The superseded
// values are preserved in the admin_audit_log metadata (changed.from),
// so the history is not lost. Rows are never deleted here.
// ============================================================================
async function handleCalendarCorrection(req: Request, svc: Svc, body: Record<string, unknown>): Promise<Response> {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const adminId = auth.userId;
  const c = body.correction;
  if (!c || typeof c !== "object" || Array.isArray(c)) {
    return jsonResponse({ ok: false, error: "correction must be an object" }, 400);
  }
  const fields = c as Record<string, unknown>;
  const candidate: Partial<EdgeCalendarCorrection> = {
    id: "",
    hijriYear: fields.hijriYear as number,
    hijriMonth: fields.hijriMonth as number,
    dayOffset: fields.dayOffset as -1 | 0 | 1,
    reasonBn: fields.reasonBn as string,
    source: fields.source as string,
    status: fields.status as "confirmed" | "proposed",
    createdAt: "",
  };
  const errors = edgeValidateCorrection(candidate);
  if (errors.length > 0) {
    return jsonResponse({ ok: false, error: "invalid correction", detail: errors }, 400);
  }
  const row = {
    hijri_year: candidate.hijriYear,
    hijri_month: candidate.hijriMonth,
    day_offset: candidate.dayOffset,
    reason_bn: (candidate.reasonBn as string).trim(),
    source: (candidate.source as string).trim(),
    status: candidate.status,
  };
  try {
    const prev = await svc.from("islamic_calendar_corrections")
      .select("id,hijri_year,hijri_month,day_offset,reason_bn,source,status,created_at")
      .eq("hijri_year", row.hijri_year)
      .eq("hijri_month", row.hijri_month)
      .maybeSingle();
    if (prev.error) throw prev.error;
    // Snapshot the previous row NOW: the update below may mutate the
    // returned object in place (the test fake does), and the audit log
    // must preserve the superseded values, not the new ones.
    const prevRow = (prev.data ?? null) as Record<string, unknown> | null;
    const prevSnapshot = prevRow ? { ...prevRow } : null;
    let saved: Record<string, unknown> | null = null;
    if (prevRow) {
      // Supersede: update the one row for this month (UNIQUE blocks a
      // second row). created_at is bumped so "latest wins" stays true.
      const updated = await svc.from("islamic_calendar_corrections")
        .update({ ...row, created_at: new Date().toISOString() } as never)
        .eq("id", prevRow.id as string)
        .select("id,hijri_year,hijri_month,day_offset,reason_bn,source,status,created_at");
      if (updated.error) throw updated.error;
      saved = ((updated.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
    } else {
      const inserted = await svc.from("islamic_calendar_corrections")
        .insert({ ...row, created_by: adminId })
        .select("id,hijri_year,hijri_month,day_offset,reason_bn,source,status,created_at");
      if (inserted.error) throw inserted.error;
      saved = (inserted.data ?? null) as Record<string, unknown> | null;
    }
    if (!saved) return jsonResponse({ ok: false, error: "correction write returned no row" }, 500);
    // Audit-logged, guarded exactly like update_settings /
    // facebook_approve: only a real admin profile UUID is written as
    // actor_id, and the superseded values are preserved in metadata.
    let auditNote = "skipped_no_admin_uuid";
    if (UUID_RE.test(adminId)) {
      const profile = await svc.from("profiles").select("id").eq("id", adminId).limit(1).maybeSingle();
      if (!profile.error && profile.data) {
        const audit = await svc.from("admin_audit_log").insert({
          action: "islamic_calendar_correction",
          actor_id: adminId,
          resource_type: "islamic_calendar_corrections",
          resource_id: String(saved.id),
          metadata: { changed: { from: prevSnapshot, to: saved } },
        });
        auditNote = (audit as { error?: { message?: string } | null }).error
          ? `audit_insert_failed: ${(audit as { error: { message: string } }).error.message}`
          : "written";
      }
    }
    return jsonResponse({ ok: true, correction: saved, superseded: prevRow !== null, admin_audit_log: auditNote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/column .* does not exist/i.test(msg) || /Could not find the .* column/i.test(msg) ||
      /relation .* does not exist/i.test(msg) || /table .* does not exist/i.test(msg)) {
      return jsonResponse({ ok: false, error: "corrections_table_missing", detail: "the islamic_calendar_corrections table is not present in this environment" }, 500);
    }
    if (/unique/i.test(msg) || /duplicate key/i.test(msg)) {
      return jsonResponse({ ok: false, error: "correction_conflict", detail: msg }, 409);
    }
    return jsonResponse({ ok: false, error: "correction write failed", detail: msg }, 500);
  }
}

// ============================================================================
// Phase 4 — Facebook Page publication (rehearsal-only, M1–M14;
// owner-authorized 2026-11-16; design authority:
// NOORAPP-FACEBOOK-AUTOMATION-AUDIT-2026-11-16.md).
//
// WHAT THIS IS
//   The finalized poster for a PUBLISHED publication is posted to the
//   NoorApp Facebook Page through the OFFICIAL Meta Graph API only — no
//   unofficial API, no browser automation, no unversioned calls. One
//   pinned constant, FB_API_VERSION = "v27.0" (released 2026-11-04),
//   prefixes every request. The Page post uses the SAME finalized asset
//   as push and the homepage (same poster_url, same checksum); Facebook
//   never gets a different image.
//
// ACTIONS (all CRON-secret gated, same as set_poster):
//   - { "action": "facebook_publish", "kolkata_date"?, "page_id"?,
//       "format"? } — publish today's (or the given date's) finalized
//     poster to the Page. Creates the log row on first call (the Mode B
//     decision record); in Mode B it stops at { queued:true } until
//     facebook_approve has run. One publish attempt = photo upload +
//     feed post + verification read (see fbPublishOnce).
//   - { "action": "facebook_approve", "kolkata_date"?, "page_id"?,
//       "approved_by" } — Mode B approval: records approved_at +
//     approved_by on the log row (conditional claim: only an unapproved
//     row can be approved). Also writes one admin_audit_log row when
//     approved_by is a real admin profile UUID (the edge holds no admin
//     JWT, so it cannot invent an actor_id — see handleFacebookApprove).
//   - { "action": "facebook_token_health" } — debug_token health check
//     for the Page token (valid, type PAGE, required scopes, expiry
//     > 14 days). Best-effort settings write (skipped until the
//     Facebook migration adds the columns).
//
// GATES (a Facebook failure NEVER rolls back a website publication —
// the publication row is never touched by this section):
//   - settings.enabled !== true -> { ok:false, reason:"paused" }.
//   - settings.facebook_posting_enabled === false -> per-channel pause
//     ({ ok:false, reason:"facebook_paused" }).
//   - publication status !== "published" -> 409 not_published.
//   - poster_qc_status !== "passed" or no finalized poster_url for the
//     requested format -> 409 poster_not_ready (the same gate
//     publish_planned uses). No poster, no post — never.
//   - Mode B (facebook_approval_required !== false, the default) with
//     no approved_at on the log row -> { ok:true, queued:true }.
//   - The Page token is read LAZILY (Deno.env.get at call time, the
//     VAPID pattern): a missing FACEBOOK_PAGE_ACCESS_TOKEN fails only
//     the Facebook action (500, env-var name only), never the function
//     at boot. The token VALUE never appears in code, logs, or
//     responses; only the Page ID and Post ID are stored or returned.
//
// TWO-STEP IMAGE + LINK FLOW (audit §6.5): /{page-id}/photos has NO
// link field, so a single-call photo post would carry the website link
// only as plain caption text. Instead: (1) POST /{page-id}/photos
// with url=<poster_url> and published=false -> photo id; (2) POST
// /{page-id}/feed with message=<caption>, link=<canonical link>,
// attached_media=[{media_fbid: photo id}] -> post id; (3) GET
// /{post-id}?fields=id,message,created_time,permalink_url,
// attachments{media_type,media} and require the returned id to match
// — an HTTP 200 alone is NOT proof of a visible post. If the url
// upload fails with code 100 (Meta cannot fetch the URL) or a
// retryable error, the same attempt fetches the poster binary and
// re-uploads it as multipart `source` (one rescue try inside the
// attempt; the final error still governs retry/terminal).
//
// ERROR CLASSIFICATION (audit §6.6/§6.8, classifyFacebookError):
//   - 190 token invalid/expired (subcodes 463 expired, 460 password
//     changed, 458 app not installed) -> TERMINAL, never retried.
//   - 200 / 10 permission missing -> TERMINAL.
//   - 368 policy block -> TERMINAL (stop posting).
//   - 100 invalid parameter -> TERMINAL (fix, don't retry).
//   - 506 duplicate post -> TERMINAL as a post (the row is failed, NOT
//     marked posted: a 506 carries no post id to verify against, so
//     the operator verifies on the Page; a future facebook_reconcile
//     action is the reconciliation path, not implemented here).
//   - 4 app rate limit, 17 user rate limit, 32 Pages limit, 613 custom
//     limit, 80001 Pages BUC limit -> RETRYABLE.
//   - network/transport failure (no Graph error body) -> RETRYABLE.
//   - any other Graph code -> NOT retryable (stop and report).
// Bounded retry: max FB_MAX_ATTEMPTS = 4 attempts total, backoff
// [5, 15, 45] minutes (FB_BACKOFF_MIN[attempt-1]); a retryable
// failure stores next_attempt_at = now + backoff; a terminal failure
// stores next_attempt_at = null (never due) and keeps its error_code,
// so the claim can never pick it up again. Per-attempt claims reuse
// the push H2 pattern: one conditional UPDATE moves next_attempt_at
// 10 minutes out (the lease) only if the row is still pending/failed,
// under the cap, and due (lte, then is-null — the same two-step
// claim the push retry uses); losers match zero rows and dedupe.
//
// IDEMPOTENCY (audit §6.7/§11): UNIQUE (publication_id, page_id) is
// the anchor (migration sketch). The log table holds ONE row per
// (publication, page); every attempt is an entry in retry_history
// (jsonb) — the attempt count comes from retry_history.length, never
// from separate counters, so the push 1-token arithmetic gap cannot
// recur here. A second publish on a posted row returns
// { ok:true, deduped:true, post_id, permalink_url } with ZERO Graph
// calls. A second approve returns { ok:true, deduped:true }.
//
// CAPTION (audit §6.4, buildFacebookCaption): Bengali-first — the
// hadith card's Bengali excerpt (clamped to 400 units), then the
// source line ("Sahih al-Bukhari, Hadith 5022"), then the canonical
// website link, then "— NoorApp" and "#NoorApp #Hadith" (two tags
// only). No exaggerated claims, no unverified virtue, no QC text:
// validateFacebookCaption rejects a caption without its source line,
// a caption over 2000 characters, a caption containing "যাচাই করা
// হয়নি", or any poster_qc/QC text. A caption cannot be built without
// a source line or a Bengali excerpt (400, caption_missing_source /
// caption_missing_excerpt).
//
// UNVERIFIED — NOT DECIDED HERE (audit §6.9/§10, single source):
// the 2026 organic link-post restriction (Pages without a qualifying
// Meta One subscription may include links in only two organic
// posts/comments per calendar month; Meta One Advanced from
// $49.99/month). NO daily-link-in-every-post design is finalized:
// every feed post in this phase still carries the link (that is what
// the rehearsal test must measure), and the caption-text URL and
// link-in-first-comment fallbacks are recorded as TEST CANDIDATES,
// not decisions. Do NOT pay for Meta One (INR 0).
// Poster PNGs (~1.3–1.7 MB) exceed Meta's 1 MB PNG recommendation
// (possible pixelation, not rejection) — a rehearsal-test item; no
// quality reduction in this phase.
//
// BLOCKERS (owner actions, NOT attempted here): G1 Page
// authorization (dashboard), G2 Meta App + Business Verification +
// App Review, G3 token creation + Supabase secret
// (FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_APP_ACCESS_TOKEN). No
// rehearsal test can run until G1–G3 exist; the 12 Facebook
// rehearsal tests (Post ID + permalink + visible post on the real
// Page) need their own approval (G7 test post). The migration that
// creates daily_content_facebook_posts + the settings columns is a
// SKETCH ONLY (phase4-working/) — DO NOT APPLY without its own owner
// approval; until it exists, facebook_publish / facebook_approve
// fail closed with facebook_log_unavailable (500) and zero Graph
// calls.
// ============================================================================

export const FB_API_VERSION = "v27.0";
const FB_GRAPH_BASE = "https://graph.facebook.com";
const FB_MAX_ATTEMPTS = 4;
const FB_BACKOFF_MIN = [5, 15, 45];
const FB_LEASE_MIN = 10;
const FB_REQUEST_TIMEOUT_MS = 30_000;
const FB_CAPTION_MAX_LENGTH = 2000;
const FB_EXCERPT_MAX_UNITS = 400;
const FB_ERROR_MAX_LENGTH = 500;
const FB_PAGE_TOKEN_ENV = "FACEBOOK_PAGE_ACCESS_TOKEN";
const FB_APP_TOKEN_ENV = "FACEBOOK_APP_ACCESS_TOKEN";
const FB_REQUIRED_SCOPES = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];
const FB_TERMINAL_CODES = [100, 190, 200, 368, 506];

export type FacebookErrorKind =
  | "terminal_token"
  | "terminal_permission"
  | "terminal_policy"
  | "invalid_parameter"
  | "rate_limit"
  | "duplicate"
  | "transient"
  | "unknown";

export type FacebookClassification = {
  kind: FacebookErrorKind;
  retryable: boolean;
  code: number | null;
  subcode: number | null;
  message: string;
};

type FbErrorCarrier = Error & {
  code?: number;
  subcode?: number;
  fbError?: unknown;
  httpStatus?: number;
};

/** Branch on error.code + error_subcode (audit §6.6). Accepts a thrown
 *  fbGraphCall error (carrying .fbError), a raw Graph error body, or a
 *  transport error. A network failure has no code -> transient. An
 *  unknown Graph code is NOT retryable: stop and report, don't guess. */
export function classifyFacebookError(err: unknown): FacebookClassification {
  let code: number | null = null;
  let subcode: number | null = null;
  let message = "";
  const raw = err as { fbError?: unknown; error?: unknown; code?: unknown; error_subcode?: unknown; message?: unknown } | null;
  const body = (raw?.fbError ?? raw?.error ?? raw) as { code?: unknown; error_subcode?: unknown; message?: unknown } | null;
  if (body && typeof body === "object") {
    if (typeof body.code === "number") code = body.code;
    if (typeof body.error_subcode === "number") subcode = body.error_subcode;
    if (typeof body.message === "string") message = body.message;
  }
  if (!message && typeof raw?.message === "string") message = raw.message;
  if (!message) message = "Facebook request failed";
  if (code === 190) return { kind: "terminal_token", retryable: false, code, subcode, message };
  if (code === 200 || code === 10) return { kind: "terminal_permission", retryable: false, code, subcode, message };
  if (code === 368) return { kind: "terminal_policy", retryable: false, code, subcode, message };
  if (code === 100) return { kind: "invalid_parameter", retryable: false, code, subcode, message };
  if (code === 506) return { kind: "duplicate", retryable: false, code, subcode, message };
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80001) {
    return { kind: "rate_limit", retryable: true, code, subcode, message };
  }
  if (code === null) return { kind: "transient", retryable: true, code, subcode, message };
  return { kind: "unknown", retryable: false, code, subcode, message };
}

export type FacebookCaptionInput = {
  hadith_source_line: string | null;
  cards: Array<{
    kind?: string;
    bengali?: string | null;
    sourceLine?: string | null;
    canonicalLink?: string | null;
  }> | null;
  push: { deep_link?: string | null } | null;
};

/** Bengali-first caption (audit §6.4). Throws caption_missing_source
 *  / caption_missing_excerpt when the row cannot supply them — the
 *  caller turns that into a 400, never a post without attribution. */
export function buildFacebookCaption(pub: FacebookCaptionInput): {
  caption: string;
  link: string;
  sourceLine: string;
  excerpt: string;
} {
  const cards = Array.isArray(pub.cards) ? pub.cards : [];
  const hadithCard = cards.find((c) => c?.kind === "hadith" && typeof c?.bengali === "string" && c.bengali.trim().length > 0)
    ?? cards.find((c) => typeof c?.bengali === "string" && c.bengali.trim().length > 0);
  const sourceLine = (hadithCard?.sourceLine ?? pub.hadith_source_line ?? "").trim();
  if (!sourceLine) throw new Error("caption_missing_source");
  if (!hadithCard || !hadithCard.bengali) throw new Error("caption_missing_excerpt");
  const excerpt = clampText(hadithCard.bengali.trim(), FB_EXCERPT_MAX_UNITS);
  const linkPath = (hadithCard.canonicalLink ?? pub.push?.deep_link ?? "/hadith").trim() || "/hadith";
  const link = linkPath.startsWith("http")
    ? linkPath
    : `https://noorapp.in${linkPath.startsWith("/") ? linkPath : `/${linkPath}`}`;
  const caption = [
    "📿 আজকের হাদিস",
    "",
    excerpt,
    "",
    `📖 ${sourceLine}`,
    "",
    `🔗 ${link}`,
    "",
    "— NoorApp",
    "#NoorApp #Hadith",
  ].join("\n");
  return { caption, link, sourceLine, excerpt };
}

/** The caption that goes out must carry its source, stay within the
 *  length budget, and never contain an unverified-virtue claim or any
 *  QC/internal text. */
export function validateFacebookCaption(caption: string, sourceLine: string): { ok: boolean; error?: string } {
  if (caption.length > FB_CAPTION_MAX_LENGTH) return { ok: false, error: "caption_too_long" };
  if (!sourceLine || !caption.includes(sourceLine)) return { ok: false, error: "caption_missing_source" };
  if (/যাচাই করা হয়নি/.test(caption)) return { ok: false, error: "caption_forbidden_unverified_claim" };
  if (/poster_qc|QC (failed|warning)/i.test(caption)) return { ok: false, error: "caption_contains_qc_text" };
  return { ok: true };
}

/** One Graph API call, always versioned (FB_API_VERSION), always
 *  bounded by a timeout. Non-2xx responses throw an Error carrying
 *  the Graph error body (.fbError) + .code/.subcode/.httpStatus for
 *  classifyFacebookError. A 200 body that still carries .error throws
 *  the same way. `body` (multipart FormData) is for the photo `source`
 *  fallback — it already carries its own access_token. */
export async function fbGraphCall(
  path: string,
  params: Record<string, string>,
  token: string,
  opts: { method?: "GET" | "POST"; timeoutMs?: number; body?: BodyInit } = {},
): Promise<any> {
  const method = opts.method ?? "POST";
  const url = `${FB_GRAPH_BASE}/${FB_API_VERSION}${path}`;
  const timeout = opts.timeoutMs ?? FB_REQUEST_TIMEOUT_MS;
  let res: Response;
  if (method === "GET") {
    const qs = new URLSearchParams({ ...params, access_token: token });
    res = await fetch(`${url}?${qs.toString()}`, { signal: AbortSignal.timeout(timeout) });
  } else if (opts.body) {
    res = await fetch(url, { method: "POST", body: opts.body, signal: AbortSignal.timeout(timeout) });
  } else {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, access_token: token }).toString(),
      signal: AbortSignal.timeout(timeout),
    });
  }
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const fbError = parsed?.error ?? null;
  if (!res.ok || fbError) {
    const err = new Error(fbError?.message ?? `Facebook API HTTP ${res.status}`) as FbErrorCarrier;
    if (fbError && typeof fbError.code === "number") err.code = fbError.code;
    if (fbError && typeof fbError.error_subcode === "number") err.subcode = fbError.error_subcode;
    err.fbError = fbError;
    err.httpStatus = res.status;
    throw err;
  }
  return parsed;
}

/** Photo upload, step 1 of the two-step flow. The `url` method first;
 *  when Meta cannot fetch the URL (code 100) or the call fails
 *  retryably, the same attempt fetches the poster binary and re-uploads
 *  it as multipart `source`. A terminal first error is rethrown
 *  untouched — the fallback cannot rescue a bad token or a policy
 *  block. */
async function fbUploadPhoto(pageId: string, posterUrl: string, token: string): Promise<string> {
  try {
    const photo = await fbGraphCall(`/${pageId}/photos`, { url: posterUrl, published: "false" }, token);
    if (typeof photo?.id !== "string" || !photo.id) throw new Error("facebook_photo_no_id");
    return photo.id;
  } catch (err) {
    const cls = classifyFacebookError(err);
    if (!cls.retryable && cls.code !== 100) throw err;
    const bin = await fetch(posterUrl, { signal: AbortSignal.timeout(FB_REQUEST_TIMEOUT_MS) });
    if (!bin.ok) throw err;
    const buf = await bin.arrayBuffer();
    const form = new FormData();
    form.append("source", new Blob([buf], { type: "image/png" }), "poster.png");
    form.append("published", "false");
    form.append("access_token", token);
    const photo = await fbGraphCall(`/${pageId}/photos`, {}, token, { body: form });
    if (typeof photo?.id !== "string" || !photo.id) throw new Error("facebook_photo_no_id");
    return photo.id;
  }
}

/** One publish attempt: photo upload (published=false) -> feed post
 *  with attached_media -> verification read. Returns the post id
 *  (the full PAGEID_POSTID form Meta returns) and its permalink.
 *  The verification read is mandatory: HTTP 200 alone is not proof
 *  of a visible post. */
async function fbPublishOnce(
  pageId: string,
  posterUrl: string,
  caption: string,
  link: string,
  token: string,
): Promise<{ postId: string; permalinkUrl: string }> {
  const photoId = await fbUploadPhoto(pageId, posterUrl, token);
  const feed = await fbGraphCall(`/${pageId}/feed`, {
    message: caption,
    link,
    attached_media: JSON.stringify([{ media_fbid: photoId }]),
  }, token);
  const postId = typeof feed?.id === "string" ? feed.id : "";
  if (!postId) throw new Error("facebook_feed_no_id");
  const verified = await fbGraphCall(`/${postId}`, {
    fields: "id,message,created_time,permalink_url,attachments{media_type,media}",
  }, token, { method: "GET" });
  if (verified?.id !== postId) throw new Error("facebook_verify_id_mismatch");
  const permalink = typeof verified?.permalink_url === "string" && verified.permalink_url
    ? verified.permalink_url
    : `https://www.facebook.com/${postId}`;
  return { postId, permalinkUrl: permalink };
}

/** The daily_content_facebook_posts table does not exist until the
 *  Facebook migration is applied (sketch only, owner approval). A
 *  missing table must fail closed with a named error — never a
 *  generic 500, never a Graph call. */
function isMissingTableError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = typeof err.message === "string" ? err.message : "";
  return err.code === "42P01" || err.code === "PGRST205"
    || /Could not find the table/i.test(msg)
    || /relation .* does not exist/i.test(msg);
}

function isTerminalFbErrorCode(code: unknown): boolean {
  return typeof code === "number" && FB_TERMINAL_CODES.includes(code);
}

/** H2-style lease claim, copied from the push retry claim: one
 *  conditional UPDATE moves next_attempt_at 10 minutes out only if
 *  the row is still pending/failed, under the cap, and due (lte,
 *  then is-null). Losers match zero rows and dedupe. The caller has
 *  already refused terminal rows (JS pre-check), so the is-null
 *  branch can only match a fresh pending row. */
async function claimFacebookRow(svc: Svc, row: { id: string; status: string; attempt: number }, nowIso: string, leaseUntil: string): Promise<boolean> {
  const attempt = row.attempt + 1;
  const base = () =>
    svc.from("daily_content_facebook_posts")
      .update({ attempt, next_attempt_at: leaseUntil })
      .eq("id", row.id)
      .eq("status", row.status);
  const lteClaim = await base().lte("next_attempt_at", nowIso).select("id").limit(1);
  if (!lteClaim.error && Array.isArray(lteClaim.data) && lteClaim.data.length > 0) return true;
  const nullClaim = await base().is("next_attempt_at", null).select("id").limit(1);
  if (!nullClaim.error && Array.isArray(nullClaim.data) && nullClaim.data.length > 0) return true;
  return false;
}

/** facebook_publish: post the finalized poster for a PUBLISHED
 *  publication to the Page. Never touches the publication row, so a
 *  Facebook failure can never roll back a website publication. */
async function handleFacebookPublish(body: Record<string, unknown>, svc: Svc): Promise<Response> {
  const now = new Date();
  const nowIso = now.toISOString();
  if (body.dry_run === true || body.plan_only === true || body.publish_planned === true || body.retry_only === true || body.heal === true) {
    return jsonResponse({ ok: false, error: "facebook_publish is not combinable with plan_only, publish_planned, retry_only, heal or dry_run" }, 400);
  }
  const kolkataDate = typeof body.kolkata_date === "string" && body.kolkata_date.trim()
    ? body.kolkata_date.trim()
    : kolkataDateString(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kolkataDate)) {
    return jsonResponse({ ok: false, error: "invalid kolkata_date" }, 400);
  }
  const format = typeof body.format === "string" ? body.format : "portrait";
  if (format !== "portrait" && format !== "square") {
    return jsonResponse({ ok: false, error: "invalid format — portrait or square only" }, 400);
  }
  const token = Deno.env.get(FB_PAGE_TOKEN_ENV);
  if (!token) return jsonResponse({ ok: false, error: `${FB_PAGE_TOKEN_ENV} is not configured` }, 500);
  const settings = await svc.from("daily_content_settings").select("*").limit(1).maybeSingle();
  if (settings.error) {
    return jsonResponse({ ok: false, error: "failed to read settings", detail: settings.error.message }, 500);
  }
  const sRow = settings.data;
  if (!sRow || sRow.enabled !== true) return jsonResponse({ ok: false, reason: "paused" });
  if (sRow.facebook_posting_enabled === false) return jsonResponse({ ok: false, reason: "facebook_paused" });
  const settingsPageId = typeof sRow.facebook_page_id === "string" ? sRow.facebook_page_id.trim() : "";
  const bodyPageId = typeof body.page_id === "string" ? body.page_id.trim() : "";
  const pageId = bodyPageId || settingsPageId;
  if (!pageId) return jsonResponse({ ok: false, error: "facebook_page_id is not configured" }, 400);
  if (!/^\d{1,32}$/.test(pageId)) return jsonResponse({ ok: false, error: "invalid facebook page_id" }, 400);
  if (bodyPageId && settingsPageId && bodyPageId !== settingsPageId) {
    return jsonResponse({ ok: false, error: "page_id mismatch with settings" }, 400);
  }
  const pub = await svc.from("daily_content_publications")
    .select("id, kolkata_date, status, hadith_source_line, cards, push, poster_url, poster_urls, poster_qc_status")
    .eq("kolkata_date", kolkataDate).limit(1).maybeSingle();
  if (pub.error) {
    return jsonResponse({ ok: false, error: "failed to read publication", detail: pub.error.message }, 500);
  }
  const pubRow = pub.data;
  if (!pubRow) return jsonResponse({ ok: false, error: "no publication for kolkata_date" }, 404);
  if (pubRow.status !== "published") {
    return jsonResponse({ ok: false, error: "not_published", status: pubRow.status }, 409);
  }
  if (pubRow.poster_qc_status !== "passed" || !pubRow.poster_url) {
    return jsonResponse({ ok: false, error: "poster_not_ready", poster_qc_status: pubRow.poster_qc_status ?? null }, 409);
  }
  let caption: { caption: string; link: string; sourceLine: string };
  try {
    caption = buildFacebookCaption(pubRow);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
  const capCheck = validateFacebookCaption(caption.caption, caption.sourceLine);
  if (!capCheck.ok) return jsonResponse({ ok: false, error: capCheck.error }, 400);
  const posterUrls = (pubRow.poster_urls ?? {}) as Record<string, string>;
  const posterUrl = format === "portrait" ? pubRow.poster_url : posterUrls[format];
  if (!posterUrl) {
    return jsonResponse({ ok: false, error: "poster_not_ready", detail: `no finalized ${format} poster for this date` }, 409);
  }
  if (!isValidPosterUrl(posterUrl, kolkataDate)) {
    return jsonResponse({ ok: false, error: "poster_not_ready", detail: "poster_url failed the finalized-asset check" }, 409);
  }
  // The log row is the Mode B decision record: created on first
  // publish (status pending, attempt 0), approved separately, then
  // published. One row per (publication_id, page_id) — the UNIQUE
  // anchor; a concurrent create re-reads instead of failing.
  const log = await svc.from("daily_content_facebook_posts").select("*")
    .eq("publication_id", pubRow.id).eq("page_id", pageId).limit(1).maybeSingle();
  if (log.error) {
    if (isMissingTableError(log.error)) {
      return jsonResponse({ ok: false, error: "facebook_log_unavailable", detail: "daily_content_facebook_posts table is missing — apply the Facebook migration first" }, 500);
    }
    return jsonResponse({ ok: false, error: "failed to read facebook log", detail: log.error.message }, 500);
  }
  let fbRow: any = log.data;
  if (!fbRow) {
    const created = await svc.from("daily_content_facebook_posts").insert({
      publication_id: pubRow.id,
      page_id: pageId,
      asset_id: `poster:${kolkataDate}`,
      poster_url: posterUrl,
      caption: caption.caption,
      status: "pending",
      attempt: 0,
      retry_history: [],
      approved_at: null,
      approved_by: null,
      post_id: null,
      permalink_url: null,
    }).select("id, publication_id, page_id, status, attempt, retry_history, approved_at, approved_by, post_id, permalink_url, error_code, error_message, next_attempt_at").single();
    if (created.error) {
      const reread = await svc.from("daily_content_facebook_posts").select("*")
        .eq("publication_id", pubRow.id).eq("page_id", pageId).limit(1).maybeSingle();
      if (reread.error || !reread.data) {
        return jsonResponse({ ok: false, error: "failed to create facebook log row", detail: created.error.message }, 500);
      }
      fbRow = reread.data;
    } else {
      fbRow = created.data;
    }
  }
  if (fbRow.status === "posted") {
    return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate, publication_id: pubRow.id, post_id: fbRow.post_id ?? null, permalink_url: fbRow.permalink_url ?? null });
  }
  if (fbRow.status === "paused" || fbRow.status === "skipped") {
    return jsonResponse({ ok: true, skipped: true, status: fbRow.status, kolkata_date: kolkataDate, publication_id: pubRow.id });
  }
  if (fbRow.status === "failed") {
    const attempt = typeof fbRow.attempt === "number" ? fbRow.attempt : 0;
    if (attempt >= FB_MAX_ATTEMPTS) {
      return jsonResponse({ ok: false, error: "facebook_max_attempts_reached", attempt, error_code: fbRow.error_code ?? null });
    }
    if (isTerminalFbErrorCode(fbRow.error_code)) {
      return jsonResponse({ ok: false, error: "facebook_terminal_error", error_code: fbRow.error_code, attempt });
    }
    if (fbRow.next_attempt_at && new Date(fbRow.next_attempt_at).getTime() > now.getTime()) {
      return jsonResponse({ ok: false, error: "facebook_not_due", next_attempt_at: fbRow.next_attempt_at, attempt });
    }
  }
  // Mode B (default): approval_required !== false means the row must
  // carry an approval before any Graph call is made.
  const approvalRequired = sRow.facebook_approval_required !== false;
  if (approvalRequired && !fbRow.approved_at) {
    return jsonResponse({ ok: true, queued: true, status: "pending", approval_required: true, kolkata_date: kolkataDate, publication_id: pubRow.id, page_id: pageId });
  }
  // Claim the row for this attempt (H2 lease, 10 minutes). A loser
  // dedupes — no second worker posts the same row.
  const attempt = (typeof fbRow.attempt === "number" ? fbRow.attempt : 0) + 1;
  const leaseUntil = new Date(now.getTime() + FB_LEASE_MIN * 60_000).toISOString();
  const claimed = await claimFacebookRow(svc, fbRow, nowIso, leaseUntil);
  if (!claimed) {
    return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate, publication_id: pubRow.id, note: "another worker claimed this row" });
  }
  const history: any[] = Array.isArray(fbRow.retry_history) ? [...fbRow.retry_history] : [];
  try {
    const result = await fbPublishOnce(pageId, posterUrl, caption.caption, caption.link, token);
    const newHistory = [...history, { attempt, at: nowIso, step: "verify", result: "posted", post_id: result.postId }];
    await svc.from("daily_content_facebook_posts").update({
      status: "posted",
      post_id: result.postId,
      permalink_url: result.permalinkUrl,
      attempt,
      retry_history: newHistory,
      api_response_status: 200,
      published_at: nowIso,
      next_attempt_at: null,
    }).eq("id", fbRow.id);
    return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: pubRow.id, page_id: pageId, post_id: result.postId, permalink_url: result.permalinkUrl, attempt, attempts: newHistory.length });
  } catch (err) {
    const cls = classifyFacebookError(err);
    const retryable = cls.retryable && attempt < FB_MAX_ATTEMPTS;
    const backoffMin = retryable ? FB_BACKOFF_MIN[Math.min(attempt - 1, FB_BACKOFF_MIN.length - 1)] : null;
    const nextAttemptAt = retryable && backoffMin !== null
      ? new Date(now.getTime() + backoffMin * 60_000).toISOString()
      : null;
    const newHistory = [...history, { attempt, at: nowIso, step: "publish", result: cls.kind, code: cls.code, subcode: cls.subcode, message: cls.message.slice(0, 200) }];
    await svc.from("daily_content_facebook_posts").update({
      status: "failed",
      attempt,
      error_code: cls.code,
      error_message: cls.message.slice(0, FB_ERROR_MAX_LENGTH),
      api_response_status: (err as FbErrorCarrier)?.httpStatus ?? null,
      retry_history: newHistory,
      next_attempt_at: nextAttemptAt,
    }).eq("id", fbRow.id);
    return jsonResponse({ ok: false, error: "facebook_publish_failed", kind: cls.kind, retryable, attempt, attempts: newHistory.length, next_attempt_at: nextAttemptAt, error_code: cls.code, error_subcode: cls.subcode });
  }
}

/** facebook_approve: Mode B approval for one Facebook log row. The
 *  approval is a conditional claim (only an unapproved row can be
 *  approved); a second approve dedupes. Writes one admin_audit_log
 *  row ONLY when approved_by is a real admin profile UUID — the edge
 *  holds no admin JWT and admin_audit_log.actor_id is a uuid FK to
 *  profiles(id), so a display name or a made-up id must never be
 *  written there. The Facebook log row itself always records
 *  approved_by, so the decision is never lost when the audit insert
 *  is skipped. */
async function handleFacebookApprove(body: Record<string, unknown>, svc: Svc): Promise<Response> {
  const nowIso = new Date().toISOString();
  const kolkataDate = typeof body.kolkata_date === "string" && body.kolkata_date.trim()
    ? body.kolkata_date.trim()
    : kolkataDateString(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kolkataDate)) {
    return jsonResponse({ ok: false, error: "invalid kolkata_date" }, 400);
  }
  const approvedBy = typeof body.approved_by === "string" ? body.approved_by.trim() : "";
  if (!approvedBy || approvedBy.length > 128) {
    return jsonResponse({ ok: false, error: "approved_by is required (max 128 characters)" }, 400);
  }
  const settings = await svc.from("daily_content_settings").select("*").limit(1).maybeSingle();
  if (settings.error) {
    return jsonResponse({ ok: false, error: "failed to read settings", detail: settings.error.message }, 500);
  }
  const sRow = settings.data;
  const settingsPageId = typeof sRow?.facebook_page_id === "string" ? sRow.facebook_page_id.trim() : "";
  const bodyPageId = typeof body.page_id === "string" ? body.page_id.trim() : "";
  const pageId = bodyPageId || settingsPageId;
  if (!pageId) return jsonResponse({ ok: false, error: "facebook_page_id is not configured" }, 400);
  if (!/^\d{1,32}$/.test(pageId)) return jsonResponse({ ok: false, error: "invalid facebook page_id" }, 400);
  const pub = await svc.from("daily_content_publications")
    .select("id, kolkata_date, status, hadith_source_line, cards, push, poster_url, poster_qc_status")
    .eq("kolkata_date", kolkataDate).limit(1).maybeSingle();
  if (pub.error) {
    return jsonResponse({ ok: false, error: "failed to read publication", detail: pub.error.message }, 500);
  }
  const pubRow = pub.data;
  if (!pubRow) return jsonResponse({ ok: false, error: "no publication for kolkata_date" }, 404);
  if (pubRow.status !== "planned" && pubRow.status !== "published") {
    return jsonResponse({ ok: false, error: "not_approvable", status: pubRow.status }, 409);
  }
  let captionText = "";
  try {
    captionText = buildFacebookCaption(pubRow).caption;
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
  const log = await svc.from("daily_content_facebook_posts").select("*")
    .eq("publication_id", pubRow.id).eq("page_id", pageId).limit(1).maybeSingle();
  if (log.error) {
    if (isMissingTableError(log.error)) {
      return jsonResponse({ ok: false, error: "facebook_log_unavailable", detail: "daily_content_facebook_posts table is missing — apply the Facebook migration first" }, 500);
    }
    return jsonResponse({ ok: false, error: "failed to read facebook log", detail: log.error.message }, 500);
  }
  let fbRow: any = log.data;
  if (!fbRow) {
    const created = await svc.from("daily_content_facebook_posts").insert({
      publication_id: pubRow.id,
      page_id: pageId,
      asset_id: `poster:${kolkataDate}`,
      poster_url: pubRow.poster_url ?? null,
      caption: captionText,
      status: "pending",
      attempt: 0,
      retry_history: [],
      approved_at: null,
      approved_by: null,
      post_id: null,
      permalink_url: null,
    }).select("id, publication_id, page_id, status, attempt, retry_history, approved_at, approved_by, post_id, permalink_url, error_code, error_message, next_attempt_at").single();
    if (created.error) {
      return jsonResponse({ ok: false, error: "failed to create facebook log row", detail: created.error.message }, 500);
    }
    fbRow = created.data;
  }
  if (fbRow.status === "posted") {
    return jsonResponse({ ok: false, error: "already_posted", post_id: fbRow.post_id ?? null }, 409);
  }
  if (fbRow.approved_at) {
    return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate, publication_id: pubRow.id, page_id: pageId, approved_at: fbRow.approved_at, approved_by: fbRow.approved_by ?? null });
  }
  const updated = await svc.from("daily_content_facebook_posts")
    .update({ approved_at: nowIso, approved_by: approvedBy })
    .eq("id", fbRow.id).is("approved_at", null).select("id, approved_at, approved_by");
  if (updated.error) {
    return jsonResponse({ ok: false, error: "failed to approve facebook post", detail: updated.error.message }, 500);
  }
  if (!Array.isArray(updated.data) || updated.data.length === 0) {
    return jsonResponse({ ok: false, error: "already_approved", note: "another approver won this row" }, 409);
  }
  let auditNote = "skipped_no_admin_uuid";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(approvedBy)) {
    const profile = await svc.from("profiles").select("id").eq("id", approvedBy).limit(1).maybeSingle();
    if (!profile.error && profile.data) {
      const audit = await svc.from("admin_audit_log").insert({
        action: "facebook_approve",
        actor_id: approvedBy,
        resource_type: "daily_content_facebook_posts",
        resource_id: fbRow.id,
        metadata: { kolkata_date: kolkataDate, publication_id: pubRow.id, page_id: pageId },
      });
      auditNote = audit.error ? `audit_insert_failed: ${audit.error.message}` : "written";
    }
  }
  return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: pubRow.id, page_id: pageId, status: "pending", approved_at: nowIso, approved_by: approvedBy, admin_audit_log: auditNote });
}

/** facebook_token_health: debug_token check for the Page token.
 *  Returns metadata only — never the token. The verdict is healthy
 *  only when the token is valid, of type PAGE, carries all three
 *  required scopes, and (when it expires at all) stays valid more
 *  than 14 days. The settings write is best-effort: the columns
 *  exist only after the Facebook migration, so a settings row without
 *  them reports skipped_missing_columns instead of failing. */
async function handleFacebookTokenHealth(svc: Svc): Promise<Response> {
  const now = new Date();
  const pageToken = Deno.env.get(FB_PAGE_TOKEN_ENV);
  const appToken = Deno.env.get(FB_APP_TOKEN_ENV);
  if (!pageToken) return jsonResponse({ ok: false, error: `${FB_PAGE_TOKEN_ENV} is not configured` }, 500);
  if (!appToken) return jsonResponse({ ok: false, error: `${FB_APP_TOKEN_ENV} is not configured` }, 500);
  const debug = await fbGraphCall("/debug_token", { input_token: pageToken }, appToken, { method: "GET" });
  const data = debug?.data ?? {};
  const reasons: string[] = [];
  if (data.is_valid !== true) reasons.push("token is not valid");
  if (data.type && data.type !== "PAGE") reasons.push(`token type is ${data.type}, expected PAGE`);
  const scopes: string[] = Array.isArray(data.scopes) ? data.scopes : [];
  for (const required of FB_REQUIRED_SCOPES) {
    if (!scopes.includes(required)) reasons.push(`missing scope ${required}`);
  }
  const expiresAt = typeof data.expires_at === "number" ? data.expires_at : null;
  const dataAccessExpiresAt = typeof data.data_access_expires_at === "number" ? data.data_access_expires_at : null;
  const warnAt = Math.floor(now.getTime() / 1000) + 14 * 24 * 3600;
  if (expiresAt !== null && expiresAt !== 0 && expiresAt <= warnAt) reasons.push("token expires within 14 days");
  if (dataAccessExpiresAt !== null && dataAccessExpiresAt !== 0 && dataAccessExpiresAt <= warnAt) reasons.push("data access expires within 14 days");
  const healthy = reasons.length === 0;
  let settingsUpdate = "skipped_missing_columns";
  const settings = await svc.from("daily_content_settings").select("*").limit(1).maybeSingle();
  if (!settings.error && settings.data && "facebook_token_health" in settings.data && "facebook_token_checked_at" in settings.data) {
    const updated = await svc.from("daily_content_settings").update({
      facebook_token_health: healthy ? "healthy" : "unhealthy",
      facebook_token_checked_at: now.toISOString(),
    }).eq("id", settings.data.id);
    settingsUpdate = updated.error ? `failed: ${updated.error.message}` : "updated";
  }
  return jsonResponse({
    ok: true,
    healthy,
    verdict: healthy ? "healthy" : "unhealthy",
    reasons,
    app_id: typeof data.app_id === "string" ? data.app_id : null,
    scopes,
    expires_at: expiresAt,
    data_access_expires_at: dataAccessExpiresAt,
    settings_update: settingsUpdate,
  });
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
  // Phase 6 — admin settings writes (Mode A/B + per-channel
  // switches). Routed BEFORE the CRON-secret gate like the preference
  // actions: the admin panel calls this with the admin's own Supabase
  // JWT (supabase.functions.invoke sends it), never with the CRON
  // secret. verifyAdmin validates the JWT itself (anon-client
  // getClaims + is_admin RPC — the same trust model as
  // _shared/require-admin.ts); a CRON Bearer here is NOT an admin
  // credential and is rejected with 401.
  if (body.action === "update_settings") {
    return await handleUpdateSettings(req, svc, body);
  }
  // Jumu'ah phase — admin calendar corrections. Routed BEFORE the
  // CRON-secret gate like update_settings: the admin panel calls this
  // with the admin's own Supabase JWT, never with the CRON secret.
  if (body.action === "calendar_correction") {
    return await handleCalendarCorrection(req, svc, body);
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  // Poster pipeline: record a rendered + QC-passed poster on a published
  // publication row. Cron-secret gated (same as the daily path); the
  // action itself validates the URL, the row state, and idempotency.
  if (body.action === "set_poster") {
    return handleSetPoster(svc, body);
  }
  // Phase 4 — Facebook Page publication (rehearsal-only). CRON-secret
  // gated like set_poster; the handlers validate settings, row state,
  // the poster QC gate, and Mode B approval before any Graph call.
  if (body.action === "facebook_publish") {
    return await handleFacebookPublish(body, svc);
  }
  if (body.action === "facebook_approve") {
    return await handleFacebookApprove(body, svc);
  }
  if (body.action === "facebook_token_health") {
    return await handleFacebookTokenHealth(svc);
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
    // Phase 3 (split flow): publish_planned writes (sends + flips), so
    // it can never combine with dry_run — same policy as retry_only.
    // plan_only and publish_planned are mutually exclusive, and neither
    // combines with retry_only (routed below). Rejected before planDay
    // so a bad combination performs nothing.
    if (body.publish_planned === true && body.dry_run === true) {
      return jsonResponse({ ok: false, error: "publish_planned and dry_run cannot be combined." }, 400);
    }
    if (body.plan_only === true && body.retry_only === true) {
      return jsonResponse({ ok: false, error: "plan_only and retry_only cannot be combined." }, 400);
    }
    if (body.publish_planned === true && body.retry_only === true) {
      return jsonResponse({ ok: false, error: "publish_planned and retry_only cannot be combined." }, 400);
    }
    if (body.plan_only === true && body.publish_planned === true) {
      return jsonResponse({ ok: false, error: "plan_only and publish_planned cannot be combined." }, 400);
    }
    // Phase 3 (split-flow heal): `heal` is a modifier of the retry
    // tick, never a standalone mode — a bare { heal: true } must not
    // fall through to the daily branch (which sends). It also cannot
    // combine with plan_only or publish_planned (the heal step calls
    // those paths itself, in the right order). Rejected before planDay
    // so a bad combination performs nothing.
    if (body.heal === true && body.retry_only !== true) {
      return jsonResponse({ ok: false, error: "heal requires retry_only." }, 400);
    }
    if (body.heal === true && (body.plan_only === true || body.publish_planned === true)) {
      return jsonResponse({ ok: false, error: "heal cannot combine with plan_only or publish_planned." }, 400);
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
      const tick = await runTick(svc, kolkataDate);
      if (body.heal !== true) {
        // Plain tick: unchanged — never plans, publishes, or creates
        // a row. The tick object is the whole response, plus the
        // Phase 10 monitoring meta (schedule + retry observability).
        const meta = await monitoringMeta(svc, kolkataDate, new Date());
        return jsonResponse({ ok: true, ...tick, ...meta });
      }
      // Split-flow heal (Phase 3): run the retry pass, then heal ONLY
      // through the split flow — never a text-only send.
      return await healSplitFlow(svc, kolkataDate, tick);
    }
    // Phase 3 (split flow), step 3: publish a planned row whose poster
    // is finalized. Needs no fresh plan — it publishes what plan_only
    // planned and the poster workflow finalized. Fail-closed when
    // paused, exactly like the daily branch.
    if (body.publish_planned === true) {
      const { data: settings } = await svc.from("daily_content_settings").select("enabled").limit(1).maybeSingle();
      if (!settings || (settings as { enabled: boolean }).enabled !== true) {
        return jsonResponse({ ok: false, reason: "paused" });
      }
      return await publishPlanned(svc, kolkataDate);
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
      // No valid plan: record the failure once per date (shared with
      // plan_only — see recordFailedPlan), but never let the failure
      // row reserve the date against a later recovery.
      const recorded = await recordFailedPlan(svc, kolkataDate, plan);
      if (recorded === "deduped") {
        return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
      }
      return jsonResponse({ ok: false, reason: plan.hadithEmptyReason });
    }

    // Phase 3 (split flow), step 1: plan_only stops here — the row is
    // planned, the poster workflow finalizes onto it, and
    // publish_planned finishes the day. Never sends, never flips to
    // published. Dry-run (above) takes precedence: a dry run returns
    // the plan and writes nothing.
    if (body.plan_only === true) {
      const r = await ensurePlannedRow(svc, kolkataDate, plan);
      if (r.kind === "deduped") {
        return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
      }
      if (r.kind === "conflict") {
        return jsonResponse({ ok: false, error: r.error }, 500);
      }
      return jsonResponse({ ok: true, planned: true, kolkata_date: kolkataDate, publication_id: r.publicationId });
    }

    // Valid plan: resolve today's publication row (shared helper —
    // plan_only uses the same resolution, then stops before sending).
    const r = await ensurePlannedRow(svc, kolkataDate, plan);
    if (r.kind === "deduped") {
      return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
    }
    if (r.kind === "conflict") {
      return jsonResponse({ ok: false, error: r.error }, 500);
    }
    const publicationId = r.publicationId;
    const pushForSend = r.pushForSend;
    // Send + flip (shared helper — publish_planned sends identically).
    let result;
    try {
      result = await sendAndPublish(svc, publicationId, pushForSend);
    } catch (e) {
      // Send aborted mid-flight: the row stays `planned`. Only a later
      // daily-path run adopts it; a retry tick recovers its pending and
      // retryable deliveries but never adopts or publishes it. Never
      // mark published here.
      return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
    return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: result.publication_id, delivery: result.delivery });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
