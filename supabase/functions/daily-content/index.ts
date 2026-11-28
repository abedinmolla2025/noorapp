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
 *  - (none) --daily run, valid plan--> planned (the bare call stops
 *    here — Option A conversion, 2026-11-17; publish_planned finishes
 *    it after the poster is finalized, or text-only when the
 *    text-only fallback applies — quarantined row + text_only_fallback
 *    setting on, owner decision 2026-11-23)
 *  - (none) --daily run, no valid plan--> failed (one row per date; a
 *    later same-date run with a valid plan repairs it in place, it does
 *    NOT insert a second row and the date is never blocked)
 *  - planned --daily run, same date--> adopted (row returned, nothing
 *    sent; never re-planned mid-flight) or repaired in place (corrupt row
 *    without a push, or failed row, rewritten to the fresh plan)
 *  - planned --tick, same date--> pending deliveries promoted to
 *    retryable and sent by the tick; the row itself stays planned
 *    (a tick NEVER adopts content, plans, publishes, or creates a row)
 *  - planned --heal tick, same date--> the heal step reads the row and
 *    NEVER flips it on its own: a row whose poster is QC-passed is
 *    published through publishPlanned (the same gate the poster
 *    workflow uses, so the first send carries the poster image); a
 *    QUARANTINED row is published TEXT-ONLY through publishPlanned
 *    when the text_only_fallback setting is on (owner decision
 *    2026-11-23 — the 8-gate still applies, V5/V8 skipped, V6
 *    push-text checked; a gate_hold never publishes), and is HELD
 *    when the flag is off; a row whose poster failed is HELD (see
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
 *    it unless force-dispatched), EXCEPT the text-only fallback:
 *    when the text_only_fallback setting is on (owner decision
 *    2026-11-23), the heal tick publishes a quarantined row
 *    text-only through publishPlanned (8-gate still applies). A
 *    successful set_poster pass clears the error and ends the hold.
 *    A status='failed' row (no valid plan) is a hold of a different
 *    kind: a later heal tick repairs it in place when a valid plan
 *    exists.
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
 *    publishes a row whose poster is already QC-passed. Text-only
 *    fallback (owner-authorized 2026-11-23 16:22 IST, "Text-only
 *    fallback করে দিন"): when the text_only_fallback setting is on
 *    (owner-SQL only), a QUARANTINED row publishes text-only
 *    through publishPlanned — the 8-gate still applies (V5/V8
 *    skipped, V6 push-text checked; a gate_hold never publishes).
 *    Flag off restores the previous hold behaviour exactly.
 *    `heal` without `retry_only` is a client error (400), as is
 *    combining `heal` with `plan_only` or `publish_planned`.
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
 *    split flow (plan_only -> poster -> publish_planned). The default
 *    daily branch was converted to plan_only semantics by the Option A
 *    conversion (overnight mission 2026-11-17): the bare call plans
 *    and stops — it never sends, so no text-only publication path
 *    remains in the function. Per-channel
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

// ---- Adaptive multi-page (owner brief 2026-11-22) — page keys ----
// A multi-page set keeps page 1 under the base format key (the
// singular poster_url stays page-1 portrait) and pages 2-3 under
// `<format>-p2` / `<format>-p3` in the poster_urls / poster_checksums
// maps (storage `<date>/<format>-p<N>.png`). No new columns: the maps
// already exist; only the key validation widens. The singular
// poster_url check stays on isValidPosterUrl (page-1 only) so a
// page-2 URL can never become the push/homepage image.
const ADAPTIVE_MAX_PAGE = 3;

function isPosterAssetKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if ((POSTER_FORMATS as readonly string[]).includes(value)) return true;
  const m = /^([a-z]+)-p([2-9])$/.exec(value);
  return m !== null && (POSTER_FORMATS as readonly string[]).includes(m[1]) && Number(m[2]) <= ADAPTIVE_MAX_PAGE;
}

function isValidPosterPageUrl(value: unknown, kolkataDate: string): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return false;
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/daily-content-posters/`;
  if (!value.startsWith(prefix)) return false;
  const rest = value.slice(prefix.length);
  return POSTER_FORMATS.some((f) => {
    if (rest === `${kolkataDate}/${f}.png`) return true;
    for (let p = 2; p <= ADAPTIVE_MAX_PAGE; p++) {
      if (rest === `${kolkataDate}/${f}-p${p}.png`) return true;
    }
    return false;
  });
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
        if (!isPosterAssetKey(format) || !isValidPosterPageUrl(url, kolkataDate)) {
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
        if (!isPosterAssetKey(format) || !isValidChecksum(sum)) {
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
  /** Text-only fallback (owner decision 2026-11-23): when true, a
   *  QUARANTINED row (poster failed twice) publishes text-only
   *  through publishPlanned. Owner-SQL only — never in the
   *  update_settings allowlist. Default false (fail-closed). */
  textOnlyFallback: boolean;
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
      textOnlyFallback: false,
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
    textOnlyFallback: row.text_only_fallback === true,
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
// The old default daily path (plan -> send -> publish in one call) sent
// the first push text-only, because `set_poster` could only finalize
// onto an already-published row (Production Blocker #1). The split flow
// breaks that call into three explicit steps, each behind the same
// CRON-secret gate and the same fail-closed settings gate:
//   1. plan_only        — plan the day, insert the row as `planned`,
//                          send nothing, publish nothing.
//   2. poster workflow  — render + QC + `set_poster` onto the planned
//                          row (now allowed); a QC failure leaves the
//                          row planned, so downstream has nothing to
//                          distribute that day.
//   3. publish_planned  — publish ONLY a planned row whose poster is
//                          QC-passed, sending the first push with the
//                          finalized poster as `image_url`.
// The default daily path ({}) was converted by Option A (overnight
// mission 2026-11-17): it now plans and stops — plan_only semantics —
// and never sends. The split flow is the ONLY publish path:
// publish_planned after the poster workflow finalizes the row.
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
    // A successful publish clears a stale gate_hold verdict (the row
    // was held, then fixed and re-published) — bookkeeping only.
    error: null,
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
 *  Runs AFTER the plain retry pass (tick). It NEVER flips a row to
 *  published on its own, EXCEPT the text-only fallback (owner
 *  decision 2026-11-23): with the text_only_fallback setting on, a
 *  quarantined row publishes text-only through publishPlanned (the
 *  8-gate still applies; V5/V8 skipped, V6 push-text). With the flag
 *  off, the only send in this function is publishPlanned, which
 *  refuses any row whose poster is not QC-passed — so a healed day
 *  carries the finalized poster image, exactly like the E2E split
 *  flow, unless the fallback fires.
 *
 *  Outcomes (kolkata_date is always today):
 *   - published row                 -> healed:false (nothing to do)
 *   - planned + poster QC-passed    -> publishPlanned (healed:true
 *     with the delivery counts; the poster workflow's publish step
 *     failed after set_poster — the heal finishes it, with the image)
 *   - planned + quarantined poster -> healed:false, hold:"quarantined"
 *     (alert: critical — needs owner/admin review; no dispatch)
 *     when the fallback flag is off; with the flag on, publishPlanned
 *     publishes it text-only (healed:true, fallback:"text_only"),
 *     or hold:"gate_hold" when the gate fails
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
// ============================================================================
// 8-Validation Autonomous Gate (owner's Section 7 amendment, 2026-11-15
// ~23:03 IST — binding): content is publishable WITHOUT owner review
// ONLY if ALL 8 mandatory server-side validations pass; ANY failure ->
// Held/Quarantined, never published. The gate is a PURE function — it
// takes the planned content plus the LIVE rows it must be verified
// against and returns a structured verdict (per-validation pass/fail +
// reason, overall publish/hold). It is wired into publishPlanned ONLY
// (the single publish path); the default daily branch no longer
// publishes at all (Option A conversion, 2026-11-17), and Mode B
// approval at plan time is untouched.
//
// CANONICAL SOURCE: src/lib/dailyContent/autonomousGate.ts (the lib
// file is canonical; this section is its verbatim port, same pattern
// as Phase 10's monitoring.ts port). The engine pieces + the Bengali
// classifier below are extracted VERBATIM from
// src/lib/dailyContent/visualConceptEngine.ts and
// src/lib/dailyContent/bengaliQuality.ts by
// ~/workspace/noorapp-ai-daily-content/gate-working/extract-edge-port.py
// (asserted anchors — a drifted source file fails the extraction
// loudly). Never edit a ported block in one place only: fix the
// canonical file first, then re-extract.
// ============================================================================

// ---- ENGINE (verbatim port of src/lib/dailyContent/visualConceptEngine.ts) ----
export type HadithInput = {
  /** e.g. "hadith:bukhari-1-1" or "hadith:fixture-intentions". */
  ref: string;
  /** e.g. "bukhari". */
  bookKey: string;
  /** Bukhari book/chapter number (1-97), or null when unknown. */
  chapterId: number | null;
  /** Verified English chapter title, when known. */
  chapterTitleEn?: string | null;
  /** Bengali translation (verbatim from the record). */
  bengali: string;
  /** Arabic matn (diacritics optional; stripped before matching). */
  arabic: string;
  /** English text, when available (bundled data). */
  english?: string | null;
  /** Verbatim source line, e.g. "Sahih al-Bukhari, Hadith 1". */
  sourceLine?: string | null;
};

export type TopicId =
  | "salah" | "quran" | "knowledge" | "charity" | "parents" | "family"
  | "patience" | "kindness" | "forgiveness" | "gratitude" | "creation"
  | "intentions" | "speech" | "modesty" | "protection" | "guidance"
  | "fasting" | "faith";

export type Topic = {
  id: TopicId;
  labelBn: string;
  labelEn: string;
  /** Bengali keywords. RULE: never a bare <=3-char word (e.g. "মা" matches
   *  inside "আমার"); use full or inflected forms ("মা-বাবা", "বাবার"). */
  keywordsBn: string[];
  /** Arabic keywords (matched after diacritic stripping + alef norm).
   *  SAME RULE as Bengali: never a bare <=2-char word — Arabic matching
   *  is substring over the FULL text INCLUDING the isnad, so "أب" fires
   *  on "ابن" (ibn — in nearly every isnad) and "أم" fires on "امروا"
   *  (were commanded) / "امرأة" (woman). Removed from parents
   *  2026-11-17 after bukhari-66-5022 misclassified as parents in
   *  card-only mode (score 2 from "ابن أبي أوفى" + "أمروا", beating
   *  quran's 1 from Bengali "কুরআন"). Parents still fires via
   *  "والدين" / "بر الوالدين" + the Bengali compounds + English. */
  keywordsAr: string[];
  /** English keywords (lowercased substring). */
  keywordsEn: string[];
  /** Bukhari chapter ids whose title hints at this topic (weak prior). */
  chapterHints: number[];
};

export const TOPICS: Topic[] = [
  {
    id: "salah", labelBn: "সালাত ও ইবাদত", labelEn: "Prayer & worship",
    keywordsBn: ["নামাজ", "সালাত", "মসজিদ", "জামাত", "আজান", "ফজর", "ইবাদত", "সিজদা", "রুকু", "তাহাজ্জুদ", "জুম্মা", "জুমা"],
    keywordsAr: ["صلاة", "مسجد", "أذان", "فجر", "سجود", "ركوع", "تهجد", "جمعة"],
    keywordsEn: ["prayer", "mosque", "adhan", "fajr", "prostrat", "worship", "friday", "jumu"],
    // Friday keywords (2026-11-17, Jumu'ah): a Friday hadith is prayer
    // content — "জুমার নামাজ" already matched on "নামাজ", but a text
    // that says only "জুম্মার দিন" did not. "جمعة" is 4 letters (the
    // Phase 2 fix removed bare 2-letter Arabic words); "jumu" matches
    // jumu'ah / jumuah. Chapter 11 is the canonical "Friday Prayer"
    // book (forensic reconstruction, 97/97).
    chapterHints: [10, 11, 31, 33],
  },
  {
    id: "quran", labelBn: "কুরআন", labelEn: "Quran",
    keywordsBn: ["কুরআন", "কোরআন", "তিলাওয়াত", "আয়াত", "সূরা"],
    keywordsAr: ["قرآن", "تلاوة", "آية", "سورة", "كتاب الله"],
    keywordsEn: ["quran", "qur'an", "recit"],
    chapterHints: [66],
  },
  {
    id: "knowledge", labelBn: "জ্ঞান অর্জন", labelEn: "Seeking knowledge",
    keywordsBn: ["জ্ঞান", "শেখা", "পড়া", "বই", "শিক্ষা", "আলেম", "অন্বেষণ"],
    keywordsAr: ["علم", "تعلم", "كتاب", "عالم"],
    keywordsEn: ["knowledge", "learn", "seeking knowledge", "scholar", "book"],
    chapterHints: [],
  },
  {
    id: "charity", labelBn: "দান ও সদকা", labelEn: "Charity & sadaqah",
    keywordsBn: ["দান", "সদকা", "সাদাকা", "যাকাত", "গরিব", "মিসকিন", "সাহায্য", "অভাবী"],
    keywordsAr: ["صدقة", "زكاة", "فقير", "مسكين"],
    keywordsEn: ["charity", "sadaqah", "zakat", "poor", "give", "alms"],
    chapterHints: [73],
  },
  {
    id: "parents", labelBn: "মা-বাবার অধিকার", labelEn: "Parents' rights",
    keywordsBn: ["পিতা-মাতা", "মা-বাবা", "পিতামাতা", "বাবা-মা", "বাবার", "মায়ের", "বৃদ্ধ পিতা", "পিতার", "মাতার"],
    keywordsAr: ["والدين", "بر الوالدين"],
    keywordsEn: ["parent", "mother", "father", "elderly parent"],
    chapterHints: [],
  },
  {
    id: "family", labelBn: "পরিবার ও সন্তান", labelEn: "Family & children",
    keywordsBn: ["পরিবার", "সন্তান", "সন্তানের", "স্ত্রী", "স্বামী", "ঘর", "বাড়ি"],
    keywordsAr: ["أسرة", "ولد", "أهل", "بيت"],
    keywordsEn: ["family", "child", "offspring", "household", "spouse"],
    chapterHints: [13],
  },
  {
    id: "patience", labelBn: "ধৈর্য", labelEn: "Patience",
    // "রাগ / غضب / anger" added 2026-11-18: anger-restraint hadiths
    // (e.g. bukhari-93-7158) are patience content. (Edge port of the
    // canonical engine — keep in sync with visualConceptEngine.ts.)
    keywordsBn: ["ধৈর্য", "সবর", "দৃঢ়তা", "সহনশীল", "রাগ"],
    keywordsAr: ["صبر", "صابر", "غضب"],
    keywordsEn: ["patience", "patient", "steadfast", "endur", "anger", "angry"],
    chapterHints: [25, 27, 28, 33],
  },
  {
    id: "kindness", labelBn: "দয়া ও উত্তম আচরণ", labelEn: "Kindness & good conduct",
    keywordsBn: ["দয়া", "সদাচরণ", "চরিত্র", "উত্তম আচরণ", "সদয়", "নম্র", "ভদ্র"],
    keywordsAr: ["خلق", "رفق", "إحسان", "رحمة"],
    keywordsEn: ["kindness", "character", "good conduct", "gentle", "compassion"],
    chapterHints: [78],
  },
  {
    id: "forgiveness", labelBn: "ক্ষমা ও তওবা", labelEn: "Forgiveness & repentance",
    keywordsBn: ["ক্ষমা", "তওবা", "গুনাহ", "মাফ", "তাওবা", "ইস্তিগফার"],
    keywordsAr: ["استغفار", "توبة", "مغفرة", "ذنب"],
    keywordsEn: ["forgive", "repent", "pardon", "mercy", "sin"],
    chapterHints: [32],
  },
  {
    id: "gratitude", labelBn: "কৃতজ্ঞতা", labelEn: "Gratitude",
    keywordsBn: ["কৃতজ্ঞতা", "শুকরিয়া", "শোকর", "কৃতজ্ঞ"],
    keywordsAr: ["شكر", "نعمة", "حمد"],
    keywordsEn: ["grateful", "gratitude", "thank", "blessing"],
    chapterHints: [13],
  },
  {
    id: "creation", labelBn: "আল্লাহর সৃষ্টি", labelEn: "Allah's creation",
    keywordsBn: ["সৃষ্টি", "প্রকৃতি", "আকাশ", "পাহাড়", "সাগর", "নক্ষত্র", "চাঁদ", "সূর্য"],
    keywordsAr: ["خلق", "طبيعة", "سماء", "نجم", "قمر", "شمس"],
    keywordsEn: ["creation", "nature", "sky", "mountain", "star", "moon", "sea"],
    chapterHints: [],
  },
  {
    id: "intentions", labelBn: "নিয়ত ও আন্তরিকতা", labelEn: "Intentions & sincerity",
    keywordsBn: ["নিয়ত", "ইখলাস", "আন্তরিকতা", "উদ্দেশ্য"],
    keywordsAr: ["نية", "نيات", "إخلاص"],
    keywordsEn: ["intention", "sincer", "deed"],
    chapterHints: [1],
  },
  // NOTE (2026-11-18): "قول" removed from keywordsAr — it substring-matches
  // the narration verb "يقول" and stole a score-1 speech win on
  // bukhari-93-7158 (an anger/patience hadith). Edge port of the canonical
  // engine — keep in sync with visualConceptEngine.ts.
  {
    id: "speech", labelBn: "জিহ্বা ও কথা", labelEn: "Speech & the tongue",
    keywordsBn: ["কথা", "জিহ্বা", "চুপ", "নীরব", "ভালো কথা", "জবান"],
    keywordsAr: ["لسان", "كلام", "صمت"],
    keywordsEn: ["tongue", "speech", "speak", "silent", "silence", "words"],
    chapterHints: [78],
  },
  {
    id: "modesty", labelBn: "লজ্জাশীলতা", labelEn: "Modesty",
    keywordsBn: ["লজ্জা", "শালীনতা", "লজ্জাশীল"],
    keywordsAr: ["حياء"],
    keywordsEn: ["modest", "modesty", "shy", "bashful"],
    chapterHints: [],
  },
  {
    id: "protection", labelBn: "হেফাজত ও নিরাপত্তা", labelEn: "Protection & safety",
    keywordsBn: ["হেফাজত", "নিরাপত্তা", "রক্ষা", "ভয়", "অন্ধকার", "নিরাপদ"],
    keywordsAr: ["أمان", "خوف", "حفظ", "ليل"],
    keywordsEn: ["protect", "safety", "safe", "fear", "night", "harm"],
    chapterHints: [],
  },
  {
    id: "guidance", labelBn: "হেদায়াত ও সরল পথ", labelEn: "Guidance & the straight path",
    keywordsBn: ["হেদায়াত", "সরল পথ", "পথ", "হিদায়াত", "সঠিক পথ"],
    keywordsAr: ["هداية", "صراط", "طريق"],
    keywordsEn: ["guidance", "straight path", "right path"],
    chapterHints: [25, 27, 28],
  },
  {
    id: "fasting", labelBn: "রোজা ও রমজান", labelEn: "Fasting & Ramadan",
    keywordsBn: ["রোজা", "সিয়াম", "সেহরি", "ইফতার", "রমজান"],
    keywordsAr: ["صوم", "صيام", "رمضان", "سحور", "إفطار"],
    keywordsEn: ["fast", "ramadan", "suhur", "iftar"],
    chapterHints: [30, 31, 33],
  },
  {
    id: "faith", labelBn: "ঈমান", labelEn: "Faith",
    keywordsBn: ["ঈমান", "বিশ্বাস", "মুমিন", "আখিরাত", "পরকাল"],
    keywordsAr: ["إيمان", "مؤمن", "آخرة"],
    keywordsEn: ["faith", "believe", "believer", "hereafter"],
    chapterHints: [2],
  },
];

export function topicById(id: TopicId): Topic {
  return TOPICS.find((t) => t.id === id) as Topic;
}

/** The safe default when no rule fires: guidance, never invented. */
export const DEFAULT_TOPIC_ID: TopicId = "guidance";

export type VisualConcept = {
  id: string;
  topicId: TopicId;
  labelBn: string;
  labelEn: string;
  /** Existing scene id in CARD_BACKGROUNDS, or null = scene must be generated first. */
  sceneId: string | null;
  composition: "centered" | "lower-third";
  /** Scene description (existing scene's description, or the new-scene brief). */
  sceneDescription: string;
  /** Generation prompt for a NEW scene (Dua OG style: photorealistic,
   *  text-free, no faces / no identifiable people, dark areas top+bottom
   *  for text). Null when the scene already exists. */
  newScenePrompt: string | null;
};

const NEW_SCENE_GUARD =
  "Photorealistic premium cinematic photograph, tall vertical portrait orientation. " +
  "Absolutely no text, no words, no letters, no calligraphy, no signs, no readable writing anywhere in the image. " +
  "No faces, no identifiable people. Generous darker areas at the top and bottom for text overlay.";

export const VISUAL_CONCEPTS: VisualConcept[] = [
  { id: "mosque-courtyard", topicId: "salah", labelBn: "মসজিদের আঙিনায় নামাজ", labelEn: "Prayer in a mosque courtyard", sceneId: "courtyard-prayer", composition: "centered", sceneDescription: "Man from behind in quiet prayer in a mosque courtyard at dusk, arches and lamps", newScenePrompt: null },
  { id: "fajr-window", topicId: "salah", labelBn: "ফজরের ভোর", labelEn: "Fajr dawn at home", sceneId: "morning-window", composition: "lower-third", sceneDescription: "Quiet bedroom at first morning light, dawn through sheer curtains, prayer cap on side table", newScenePrompt: null },
  { id: "quran-rehal", topicId: "quran", labelBn: "রেহালে কুরআন", labelEn: "Quran on a rehal", sceneId: "library", composition: "centered", sceneDescription: "Quiet Islamic library reading corner — open Quran on a carved wooden rehal stand, warm brass lamp", newScenePrompt: null },
  { id: "quran-dawn", topicId: "quran", labelBn: "ভোরের আলোয় কুরআন", labelEn: "Quran in dawn light", sceneId: null, composition: "centered", sceneDescription: "NEW: open Quran on a wooden rehal beside a window, soft dawn light falling across blank warm pages, quiet and reverent, no people", newScenePrompt: `${NEW_SCENE_GUARD} An open Quran resting on a carved wooden rehal stand beside a tall window, soft golden dawn light falling across the pages, deep green and warm gold tones, quiet reverent atmosphere.` },
  { id: "library-study", topicId: "knowledge", labelBn: "পাঠাগারে অধ্যয়ন", labelEn: "Study in the library", sceneId: "library", composition: "centered", sceneDescription: "Quiet Islamic library reading corner — wooden shelves of old books, warm brass reading lamp (shared scene with quran-rehal; see report §4)", newScenePrompt: null },
  { id: "study-desk", topicId: "knowledge", labelBn: "পড়ার টেবিল", labelEn: "Study desk with books", sceneId: null, composition: "centered", sceneDescription: "NEW: a wooden study desk with stacked old books, an ink pot and a warm lamp glow, deep green and gold tones, no people", newScenePrompt: `${NEW_SCENE_GUARD} A wooden study desk with a stack of old cloth-bound books, an ink pot and a warm brass lamp glowing softly, deep green and warm gold tones, focused calm atmosphere of learning, no people.` },
  { id: "food-sharing", topicId: "charity", labelBn: "খাবার বিতরণ", labelEn: "Sharing food", sceneId: "food-sharing", composition: "lower-third", sceneDescription: "Two pairs of hands across a simple wooden table, one gently offering a bowl of dates and bread to the other in warm golden light — a humble, generous image of charity and sadaqah, no faces", newScenePrompt: null },
  { id: "giving-hands", topicId: "charity", labelBn: "দানের হাত", labelEn: "Hands giving", sceneId: null, composition: "centered", sceneDescription: "NEW: an open palm offering coins and dates in warm sunlight, soft green bokeh background, no faces", newScenePrompt: `${NEW_SCENE_GUARD} An open palm gently offering a few coins and dates in warm sunlight, soft green bokeh background, generous and humble atmosphere, close-up on hands only.` },
  { id: "parents-hands", topicId: "parents", labelBn: "পিতা-মাতার হাত", labelEn: "Parents' hands", sceneId: "parents-hands", composition: "lower-third", sceneDescription: "An adult child's hands gently holding an elderly parent's wrinkled hands in warm golden window light", newScenePrompt: null },
  { id: "family-path", topicId: "parents", labelBn: "পরিবারের পথ", labelEn: "Family on a garden path", sceneId: "family-child", composition: "centered", sceneDescription: "Parents and a young child walking together on a garden path at golden hour, seen from behind", newScenePrompt: null },
  { id: "home-welcome", topicId: "family", labelBn: "ঘরের দুয়ার", labelEn: "Home entrance", sceneId: "home-entrance", composition: "lower-third", sceneDescription: "Warm home entrance at golden hour, open carved wooden door, plants and courtyard", newScenePrompt: null },
  { id: "patience-tree", topicId: "patience", labelBn: "ঝড়ে দাঁড়িয়ে থাকা গাছ", labelEn: "Tree standing firm in the storm", sceneId: "patience-tree", composition: "centered", sceneDescription: "A single strong old tree standing firm on a rocky mountain slope in difficult weather, a break of golden light", newScenePrompt: null },
  { id: "still-water", topicId: "patience", labelBn: "শান্ত জল", labelEn: "Still water at dawn", sceneId: null, composition: "centered", sceneDescription: "NEW: a perfectly still lake at dawn reflecting soft gold light, mist over the water, deep calm", newScenePrompt: `${NEW_SCENE_GUARD} A perfectly still mountain lake at dawn reflecting soft golden light, thin mist over the water, deep teal and gold tones, profound calm and steadiness.` },
  { id: "helping-hands", topicId: "kindness", labelBn: "সাহায্যের হাত", labelEn: "Hands helping", sceneId: "helping-hands", composition: "centered", sceneDescription: "Two hands gently offering a cup of tea to an elderly person in a warm sunlit home, no faces", newScenePrompt: null },
  { id: "neighbour-greeting", topicId: "kindness", labelBn: "প্রতিবেশীর সাক্ষাৎ", labelEn: "Neighbours greeting", sceneId: null, composition: "centered", sceneDescription: "NEW: two neighbours sharing tea at a doorway at golden hour, seen from behind, warm and respectful, no faces", newScenePrompt: `${NEW_SCENE_GUARD} Two neighbours sharing tea at an open doorway at golden hour, seen from behind, warm respectful atmosphere, soft golden light, deep green and gold tones.` },
  { id: "dawn-forgiveness", topicId: "forgiveness", labelBn: "ভোরের ক্ষমা", labelEn: "Dawn breaking through darkness", sceneId: "dawn-forgiveness", composition: "lower-third", sceneDescription: "First dawn light breaking through darkness over a calm valley with mist and a lake", newScenePrompt: null },
  { id: "forgiveness-leaf", topicId: "forgiveness", labelBn: "বৃষ্টিধোয়া পাতা", labelEn: "Rain-washed leaf", sceneId: "forgiveness-leaf", composition: "centered", sceneDescription: "Rain-washed green leaf with droplets in golden light", newScenePrompt: null },
  { id: "gratitude-garden", topicId: "gratitude", labelBn: "কৃতজ্ঞতার বাগান", labelEn: "Garden of gratitude", sceneId: "gratitude-garden", composition: "centered", sceneDescription: "Morning sunlight breaking through soft green leaves in a quiet garden, golden rays and gentle mist", newScenePrompt: null },
  { id: "creation-mountains", topicId: "creation", labelBn: "সৃষ্টির পাহাড়", labelEn: "Mountains of creation", sceneId: "guidance-path", composition: "centered", sceneDescription: "Winding path through misty green hills at dawn, distant mosque silhouette", newScenePrompt: null },
  { id: "night-sky", topicId: "creation", labelBn: "তারাভরা আকাশ", labelEn: "Star-filled night sky", sceneId: null, composition: "centered", sceneDescription: "NEW: a vast night sky full of stars over quiet dark hills, a single warm lantern glow low in the frame", newScenePrompt: `${NEW_SCENE_GUARD} A vast night sky full of bright stars over quiet dark hills, a single small warm lantern glowing low in the frame, deep blue-black and gold tones, awe and humility.` },
  { id: "intention-sunrise", topicId: "intentions", labelBn: "নিয়তের সূর্যোদয়", labelEn: "Sunrise of intention", sceneId: "intention-sunrise", composition: "centered", sceneDescription: "Golden sunrise over layered mountains and a valley river", newScenePrompt: null },
  { id: "quiet-garden", topicId: "speech", labelBn: "নীরব বাগান", labelEn: "Quiet garden", sceneId: null, composition: "centered", sceneDescription: "NEW: a quiet garden path at dawn with still air and soft light, an empty wooden bench, no people", newScenePrompt: `${NEW_SCENE_GUARD} A quiet garden path at dawn, still air, soft golden light through trees, an empty wooden bench, deep green and gold tones, silence and restraint.` },
  { id: "still-water-speech", topicId: "speech", labelBn: "শান্ত জল (কথা)", labelEn: "Still water (speech)", sceneId: null, composition: "centered", sceneDescription: "NEW: same still-water scene as patience (shared concept file) — a perfectly still lake at dawn; one scene file serves both topics, flagged by the similarity check", newScenePrompt: `${NEW_SCENE_GUARD} A perfectly still mountain lake at dawn reflecting soft golden light, thin mist over the water, deep teal and gold tones, profound calm and restraint.` },
  { id: "latticed-light", topicId: "modesty", labelBn: "জালির আলো", labelEn: "Light through a lattice", sceneId: null, composition: "centered", sceneDescription: "NEW: soft light falling through a carved wooden lattice window onto a quiet floor, no people", newScenePrompt: `${NEW_SCENE_GUARD} Soft golden light falling through a carved wooden lattice window onto a quiet stone floor, deep shadows and warm light, dignified private calm, no people.` },
  { id: "night-lantern", topicId: "protection", labelBn: "রাতের লণ্ঠন", labelEn: "Lantern in the night", sceneId: "night-lantern", composition: "centered", sceneDescription: "Ornate lantern glowing on a branch in a dark night forest, stars above", newScenePrompt: null },
  { id: "guidance-path", topicId: "guidance", labelBn: "সরল পথ", labelEn: "The straight path", sceneId: "guidance-path", composition: "centered", sceneDescription: "Winding path through misty green hills at dawn, distant mosque silhouette", newScenePrompt: null },
  { id: "suhur-meal", topicId: "fasting", labelBn: "সেহরির খাবার", labelEn: "Suhur meal", sceneId: "suhur-meal", composition: "lower-third", sceneDescription: "A simple pre-dawn suhur meal on a wooden table — dates, water, bread — with a warm lantern", newScenePrompt: null },
  { id: "iftar-table", topicId: "fasting", labelBn: "ইফতারের টেবিল", labelEn: "Iftar table at dusk", sceneId: null, composition: "lower-third", sceneDescription: "NEW: a simple iftar spread at dusk — dates, water, bread — warm lantern light, deep blue dusk through a window", newScenePrompt: `${NEW_SCENE_GUARD} A simple iftar spread on a wooden table at dusk — dates in a small bowl, a glass of water, bread — warm lantern light and deep blue dusk through a window, calm blessed atmosphere, no people.` },
  { id: "dawn-valley", topicId: "faith", labelBn: "ভোরের উপত্যকা", labelEn: "Valley at dawn", sceneId: "dawn-forgiveness", composition: "lower-third", sceneDescription: "First dawn light breaking through darkness over a calm valley with mist and a lake (shared scene with forgiveness)", newScenePrompt: null },
];

export function conceptsForTopic(topicId: TopicId): VisualConcept[] {
  return VISUAL_CONCEPTS.filter((c) => c.topicId === topicId);
}

export const SELECTION_WINDOWS = {
  /** Same scene id must not repeat within this many days (hard block). */
  sceneReuseDays: 14,
  /** Same visual concept must not repeat within this many days (hard block). */
  conceptReuseDays: 7,
  /** Same topic two days running is allowed but flagged (soft warning). */
  topicSoftDays: 2,
  /** Target scene window once the catalog grows to >= 30 scenes. */
  targetSceneWindowDays: 30,
  /** Minimum catalog size for the 30-day target window. */
  targetCatalogSize: 30,
} as const;

/** Strip Arabic diacritics + tatweel; normalise alef/yeh/teh forms. */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٓـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export function normalizeText(s: string): string {
  return s.toLowerCase();
}

export type ClassificationMethod = "keyword" | "chapter" | "default";

export type Classification = {
  topicId: TopicId;
  method: ClassificationMethod;
  /** Distinct keyword hits per topic (chapter prior adds +1.5). */
  scores: Array<{ topicId: TopicId; score: number }>;
  reasoning: string[];
  /** True when no rule fired at all — the AI fallback MAY refine this
   *  (Gemini Free / Groq Free, closed taxonomy list). The default topic
   *  is still safe to use without AI. */
  needsAiFallback: boolean;
};

export function classifyHadith(input: HadithInput): Classification {
  const bn = normalizeText(input.bengali);
  const ar = normalizeArabic(input.arabic);
  const en = normalizeText(input.english ?? "");
  const chapterTitle = normalizeText(input.chapterTitleEn ?? "");
  const hayBn = bn;
  const hayAr = ar;
  const hayEn = `${en} ${chapterTitle} ${input.sourceLine ?? ""}`.toLowerCase();

  const scores = TOPICS.map((t) => {
    let score = 0;
    const hits: string[] = [];
    for (const k of t.keywordsBn) {
      if (k && hayBn.includes(k.toLowerCase())) { score += 1; hits.push(`bn:${k}`); }
    }
    for (const k of t.keywordsAr) {
      if (k && hayAr.includes(normalizeArabic(k))) { score += 1; hits.push(`ar:${k}`); }
    }
    for (const k of t.keywordsEn) {
      if (k && hayEn.includes(k.toLowerCase())) { score += 1; hits.push(`en:${k}`); }
    }
    if (input.chapterId !== null && t.chapterHints.includes(input.chapterId)) {
      score += 1.5;
      hits.push(`chapter:${input.chapterId}`);
    }
    return { topicId: t.id, score, hits };
  });

  const sorted = [...scores].sort((a, b) => b.score - a.score || TOPICS.findIndex((t) => t.id === a.topicId) - TOPICS.findIndex((t) => t.id === b.topicId));
  const best = sorted[0];
  const keywordHit = best.hits.some((h) => h.startsWith("bn:") || h.startsWith("ar:") || h.startsWith("en:"));
  const chapterHit = best.hits.some((h) => h.startsWith("chapter:"));

  let method: ClassificationMethod;
  let topicId: TopicId;
  if (best.score > 0 && keywordHit) {
    method = "keyword";
    topicId = best.topicId;
  } else if (best.score > 0 && chapterHit) {
    method = "chapter";
    topicId = best.topicId;
  } else {
    method = "default";
    topicId = DEFAULT_TOPIC_ID;
  }

  const reasoning: string[] = [];
  if (method === "keyword") {
    reasoning.push(`keyword match: ${best.hits.filter((h) => !h.startsWith("chapter:")).join(", ")} (score ${best.score})`);
    if (chapterHit) reasoning.push(`chapter prior agrees (chapter ${input.chapterId})`);
  } else if (method === "chapter") {
    reasoning.push(`no keyword hit; chapter ${input.chapterId} hints at ${topicById(topicId).labelEn}`);
  } else {
    reasoning.push("no keyword or chapter rule fired — safe default topic (guidance); AI fallback MAY refine");
  }
  const runnerUp = sorted[1];
  if (runnerUp && runnerUp.score > 0 && runnerUp.score === best.score) {
    reasoning.push(`tie with ${topicById(runnerUp.topicId).labelEn} at ${runnerUp.score} — taxonomy order breaks the tie (deterministic)`);
  }

  return {
    topicId,
    method,
    scores: sorted.map(({ topicId: id, score }) => ({ topicId: id, score })),
    reasoning,
    needsAiFallback: method === "default",
  };
}

export type VisualHistoryEntry = {
  /** Asia/Kolkata date, YYYY-MM-DD. */
  date: string;
  contentRef: string;
  sceneId: string;
  conceptId: string;
  topicId: TopicId;
};

export type SimilarityCheck = { ok: boolean; warnings: string[]; blocked: boolean };

export function checkVisualSimilarity(
  candidate: { sceneId: string; conceptId: string; topicId: TopicId },
  history: readonly VisualHistoryEntry[],
  today: string,
): SimilarityCheck {
  const warnings: string[] = [];
  let blocked = false;
  if (history.length === 0) return { ok: true, warnings, blocked };
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  const dayMs = 86_400_000;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const gapDays = (d: string): number => Math.round((todayMs - Date.parse(`${d}T00:00:00Z`)) / dayMs);

  for (const e of sorted) {
    const gap = gapDays(e.date);
    if (e.sceneId === candidate.sceneId && gap >= 0 && gap <= SELECTION_WINDOWS.sceneReuseDays) {
      warnings.push(`scene ${candidate.sceneId} was used ${gap === 0 ? "today" : `${gap} day(s) ago`} (${e.date} · ${e.contentRef}) — inside the ${SELECTION_WINDOWS.sceneReuseDays}-day window; BLOCKED`);
      blocked = true;
      break;
    }
  }
  for (const e of sorted) {
    const gap = gapDays(e.date);
    if (e.conceptId === candidate.conceptId && gap >= 0 && gap <= SELECTION_WINDOWS.conceptReuseDays) {
      warnings.push(`concept ${candidate.conceptId} was used ${gap === 0 ? "today" : `${gap} day(s) ago`} (${e.date}) — inside the ${SELECTION_WINDOWS.conceptReuseDays}-day window; BLOCKED`);
      blocked = true;
      break;
    }
  }
  const yesterday = sorted[0];
  if (yesterday && yesterday.topicId === candidate.topicId && gapDays(yesterday.date) <= SELECTION_WINDOWS.topicSoftDays) {
    warnings.push(`same topic as ${yesterday.date} (${topicById(candidate.topicId).labelEn}) — allowed, but the visual MUST differ`);
  }
  return { ok: !blocked, warnings, blocked };
}

/** Does this scene belong to the classified topic? (Content-Visual Match.) */
export function contentVisualMatch(topicId: TopicId, sceneId: string): boolean {
  return VISUAL_CONCEPTS.some((c) => c.topicId === topicId && c.sceneId === sceneId);
}

export type ValidationId =
  | "source_reference_integrity"
  | "arabic_integrity"
  | "bengali_editorial_quality"
  | "fabricated_claims_detection"
  | "content_visual_consistency"
  | "bengali_readability_image_quality"
  | "duplicate_prevention"
  | "finalized_asset_integrity";

export type ValidationStatus = "exists" | "partial" | "missing";

export type MandatoryValidation = {
  id: ValidationId;
  label: string;
  /** Current state in the pipeline (audited 2026-11-15; see report §7). */
  currentStatus: ValidationStatus;
  evidence: string;
};

export const MANDATORY_VALIDATIONS: MandatoryValidation[] = [
  {
    id: "source_reference_integrity", label: "Islamic source & reference integrity",
    currentStatus: "exists",
    evidence: "EXISTS: recommend drops any ref not in the live eligible pool; planner re-validates approved runs slot-by-slot (Phase 3); the 8-validation autonomous gate (autonomousGate.ts, 2026-11-17) re-verifies refs at publish time — ref well-formed, resolves in the live pool, eligible, source line matches the live record's book + number (gate V1).",
  },
  {
    id: "arabic_integrity", label: "Arabic text integrity",
    currentStatus: "exists",
    evidence: "EXISTS: eligibleHadith requires non-empty Arabic; poster QC is character-exact vs the source record (ogQc checkOgVerbatim); the autonomous gate (2026-11-17) re-verifies every card's Arabic verbatim against its live row at publish time (gate V2).",
  },
  {
    id: "bengali_editorial_quality", label: "Bengali translation & editorial quality",
    currentStatus: "partial",
    evidence: "Editorial Standard v1.0 in all 5 AI function prompts; 168-test quality suite green (Phase 4); the autonomous gate (2026-11-17) re-verifies every card's Bengali verbatim against its live row and fails on meaning-level failure (classifyBengali meaningFidelity FAIL) at publish time (gate V3). GAP REMAINS: generate-hadith-seo has NO server-side virtue gate (prompt-only) and writes directly to live hadiths with no pending review; fix-dua-content also writes directly (Phases 3/4).",
  },
  {
    id: "fabricated_claims_detection", label: "Misleading / fabricated religious claims detection",
    currentStatus: "partial",
    evidence: "Recommend FORBIDDEN_REASON_PATTERNS + validation loop; enrich Option A suppresses unsupported virtue claims; generate-dua-seo VIRTUE_BLOCKLIST + validateGeneratedOutput() (Phase 3); the autonomous gate (2026-11-17) scans cards + push for claim patterns at publish time and fails only on wording NOT in the live source text (gate V4). GAP REMAINS: generate-hadith-seo prompt-only, no server-side gate; patterns are 6 shapes only — no general fabricated-claim detector; soft-benefit language decision still open.",
  },
  {
    id: "content_visual_consistency", label: "Content-visual consistency",
    currentStatus: "exists",
    evidence: "EXISTS (Phase 2, 2026-11-17): selectPosterVisual + checkVisualQC in the poster path — engine match + semantic score >= 85 + similarity windows (14-day scene / 7-day concept) + isSafeScene + text-safe-area warning; render fails closed. The autonomous gate (2026-11-17) re-checks the topic match + similarity windows at publish time against the stored scene (gate V5).",
  },
  {
    id: "bengali_readability_image_quality", label: "Bengali readability & image quality",
    currentStatus: "exists",
    evidence: "EXISTS: ogQc checks dimensions, file size, public-URL 200, verbatim, no-repeat, long-text warnings (Phase 6); the poster render enforces fit (autofit gate) and the autonomous gate (2026-11-17) consumes poster_qc_status === 'passed' at publish time (gate V6). Fit is render-time evidence only — the row carries no fit measurement; the gate documents this rather than re-measuring it.",
  },
  {
    id: "duplicate_prevention", label: "Duplicate content & duplicate publication prevention",
    currentStatus: "exists",
    evidence: "kolkata_date UNIQUE, delivery UNIQUE (publication_id, device_id) with NULL hole (worked around in code), 30-day repeat check in recommend (HISTORY_DAYS=30), cycle-based no-repeat in planner (hadithUsed/cardUsed), resolveRow dedup, idempotent set_poster (Phases 9/10/11, autonomous audit §2); the autonomous gate (2026-11-17) re-checks same-date + same-cycle reuse at publish time (gate V7). Residuals (observability, not prevention): documented at-least-once windows, no provider-side idempotency, no recipients_disabled column.",
  },
  {
    id: "finalized_asset_integrity", label: "Finalized asset integrity",
    currentStatus: "exists",
    evidence: "EXISTS on the poster branch: set_poster validates URL prefix, 64-hex checksum, asset ID poster:<date>, storage path, scene slug; published-only; conditional update; idempotent; failed attempts never persist a URL (Phase 6/11); the autonomous gate (2026-11-17) re-validates the STORED poster fields with the same validators at publish time (gate V8). MISSING on main/production: no set_poster, no poster columns.",
  },
];

export type ValidationResult = { id: ValidationId; pass: boolean; detail?: string; skipped?: boolean };

export type SafetyGateResult =
  | { decision: "publish"; failed: [] }
  | { decision: "hold"; failed: ValidationId[]; reasons: string[] };

/** All 8 must be present AND pass, else HOLD. Unknown id -> HOLD (fail-closed).
 *  A result recorded with skipped === true (text-only fallback mode:
 *  V5/V8 have no poster to check) is present but NOT counted as a
 *  failure — it is explicitly not a pass either. A missing result
 *  still HOLDs. */
export function evaluateSafetyGate(results: ValidationResult[]): SafetyGateResult {
  const byId = new Map(results.map((r) => [r.id, r]));
  const failed: ValidationId[] = [];
  const reasons: string[] = [];
  for (const v of MANDATORY_VALIDATIONS) {
    const r = byId.get(v.id);
    if (!r) {
      failed.push(v.id);
      reasons.push(`${v.label}: no result recorded — HOLD (fail-closed)`);
    } else if (!r.pass) {
      if (r.skipped === true) continue;
      failed.push(v.id);
      reasons.push(`${v.label}: FAILED${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  if (failed.length > 0) return { decision: "hold", failed, reasons };
  return { decision: "publish", failed: [] };
}

// ---- BENGALI QUALITY (verbatim port of src/lib/dailyContent/bengaliQuality.ts) ----
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
// Exported (port addition): the autonomous gate's V4 scans the same
// patterns and exempts a hit only when the matched word is the live
// source text's own wording.
export const RELIGIOUS_CLAIM_PATTERNS: Array<{ re: RegExp; label: string }> = [
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

// ---- VISUAL SELECTION BRIDGE (verbatim port of the two functions the
// gate needs from src/lib/dailyContent/visualSelection.ts:
// buildHadithInput + buildHistoryEntries. The rest of that module —
// selectPosterVisual, checkVisualQC, the semantic scorer — is NOT
// needed at publish time: the render already ran it and the gate
// consumes poster_qc_status === "passed" as its evidence. Type
// annotations are adapted to the edge's loose row shapes; the bodies
// are identical. ----

type GateCardShape = {
  kind: string;
  recordRef: string;
  arabic: string;
  bengali: string;
  sourceLine: string | null;
};

type GateHadithShape = {
  id: string;
  book_key: string;
  chapter_id: number | null;
  hadith_number: number;
  arabic: string;
  bengali: string | null;
  english?: string | null;
};

function gateBuildHadithInput(card: GateCardShape, record?: GateHadithShape | null): HadithInput {
  const bookKey = record?.book_key ?? card.recordRef.replace(/^hadith:/, "").split("-")[0] ?? "bukhari";
  return {
    ref: card.recordRef,
    bookKey,
    chapterId: record?.chapter_id ?? null,
    chapterTitleEn: null,
    bengali: card.bengali,
    arabic: card.arabic,
    english: record?.english ?? null,
    sourceLine: card.sourceLine,
  };
}

function gateBuildHistoryEntries(
  rows: readonly { kolkata_date: string; hadith_ref: string | null; cards: unknown; poster_scene_id: string | null }[],
  today: string,
  records?: ReadonlyMap<string, { chapter_id: number | null; english: string | null }>,
): VisualHistoryEntry[] {
  const entries: VisualHistoryEntry[] = [];
  for (const row of rows) {
    if (!row.poster_scene_id) continue;
    if (row.kolkata_date === today) continue;
    const cards = Array.isArray(row.cards) ? (row.cards as Record<string, unknown>[]) : [];
    const stored = cards.find((c) => c.kind === "hadith") as
      | { recordRef?: string; arabic?: string; bengali?: string; sourceLine?: string }
      | undefined;
    if (!stored || typeof stored.recordRef !== "string") continue;
    const recordId = stored.recordRef.replace(/^hadith:/, "");
    const record = records?.get(recordId);
    const classification = classifyHadith({
      ref: stored.recordRef,
      bookKey: "bukhari",
      chapterId: record?.chapter_id ?? null,
      bengali: typeof stored.bengali === "string" ? stored.bengali : "",
      arabic: typeof stored.arabic === "string" ? stored.arabic : "",
      english: record?.english ?? null,
      sourceLine: typeof stored.sourceLine === "string" ? stored.sourceLine : null,
    });
    const concept = conceptsForTopic(classification.topicId).find((c) => c.sceneId === row.poster_scene_id);
    if (!concept) continue;
    entries.push({
      date: row.kolkata_date,
      contentRef: stored.recordRef,
      sceneId: row.poster_scene_id,
      conceptId: concept.id,
      topicId: classification.topicId,
    });
  }
  return entries;
}

// ---- THE GATE (verbatim port of src/lib/dailyContent/autonomousGate.ts)
// The lib file is canonical; this is the same logic, same verdict
// shape, same failure messages. Differences (mechanical only):
//  - kolkataDateString (already in this file, same Intl algorithm)
//    replaces the lib's kolkataDateOf;
//  - isValidPosterUrl / isValidPosterPageUrl / isPosterAssetKey /
//    isValidChecksum / POSTER_FORMATS are the ones
//    already in this file (set_poster's validators, reused, not copied);
//  - input types are the edge's row shapes.
// A parity test (lib gate vs edge gate on identical fixtures) guards
// drift. Exported so the edge tests can call it directly.

export type GateLiveDuaShape = {
  slug: string;
  title: string | null;
  content: string | null;
  content_arabic: string | null;
  metadata: { reference?: string | null; source?: string | null; source_type?: string | null } | null;
  status: string;
  content_type: string;
};

export type GatePosterShape = {
  url: string | null;
  urls?: Record<string, unknown> | null;
  assetId: string | null;
  storagePath: string | null;
  checksum: string | null;
  checksums?: Record<string, unknown> | null;
  sceneId: string | null;
  qcStatus: string | null;
  generatedAt: string | null;
};

export type GateHistoryRowShape = {
  kolkata_date: string;
  hadith_ref: string | null;
  cards: unknown;
  poster_scene_id: string | null;
  hadith_cycle: number | null;
  card_cycle: number | null;
};

export type GateInputShape = {
  kolkataDate: string;
  hadithRef: string | null;
  hadithSourceLine: string | null;
  cards: GateCardShape[];
  push: { title: string; body: string } | null;
  poster: GatePosterShape;
  liveHadith: GateHadithShape | null;
  liveDuas: Map<string, GateLiveDuaShape> | Record<string, GateLiveDuaShape>;
  history: GateHistoryRowShape[];
  historyRecords?: ReadonlyMap<string, { chapter_id: number | null; english: string | null }>;
  hadithCycle: number | null;
  cardCycle: number | null;
  /** Text-only fallback mode (owner decision 2026-11-23): V5/V8 are
   *  SKIPPED (no poster to check) and V6 runs only its push-text
   *  half. Absent/false = the normal all-8-must-pass gate. */
  textOnlyFallback?: boolean;
};

export type GateValidationResultShape = {
  id: ValidationId;
  pass: boolean;
  /** True when the check did not run (text-only fallback: V5/V8 have
   *  no poster to check). A skipped result is never recorded as a
   *  pass — evaluateSafetyGate excludes it from `failed` but the
   *  verdict still shows pass:false + skipped:true. */
  skipped?: boolean;
  detail: string;
  warnings: string[];
};

export type GateVerdictShape = {
  decision: "publish" | "hold";
  results: GateValidationResultShape[];
  failed: ValidationId[];
  reasons: string[];
};

const gateOk = (id: ValidationId, detail: string, warnings: string[] = []): GateValidationResultShape => ({ id, pass: true, detail, warnings });
const gateFail = (id: ValidationId, detail: string, warnings: string[] = []): GateValidationResultShape => ({ id, pass: false, detail, warnings });
const gateSkip = (id: ValidationId, detail: string): GateValidationResultShape => ({ id, pass: false, skipped: true, detail, warnings: [] });

function gateParseHadithRef(ref: string | null): string | null {
  if (typeof ref !== "string") return null;
  const m = /^hadith:([A-Za-z0-9-]+)$/.exec(ref);
  return m ? m[1] : null;
}

function gateParseContentRef(ref: string): string | null {
  const m = /^content:([A-Za-z0-9-]+)$/.exec(ref);
  return m ? m[1] : null;
}

function gateLiveDuaFor(liveDuas: GateInputShape["liveDuas"], slug: string): GateLiveDuaShape | null {
  if (liveDuas instanceof Map) return liveDuas.get(slug) ?? null;
  return (liveDuas as Record<string, GateLiveDuaShape>)[slug] ?? null;
}

function gateLiveRowForCard(
  card: GateCardShape,
  input: GateInputShape,
): { arabic: string; bengali: string; english?: string | null } | null {
  if (card.recordRef.startsWith("hadith:")) {
    const h = input.liveHadith;
    if (!h) return null;
    return { arabic: h.arabic, bengali: h.bengali ?? "", english: h.english ?? null };
  }
  const slug = gateParseContentRef(card.recordRef);
  if (slug === null) return null;
  const d = gateLiveDuaFor(input.liveDuas, slug);
  if (!d) return null;
  return { arabic: d.content_arabic ?? "", bengali: d.content ?? "" };
}

export function gateEvalSourceReferenceIntegrity(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "source_reference_integrity";
  const cards = Array.isArray(input.cards) ? input.cards : [];
  if (cards.length < 1 || cards.length > 5) {
    return gateFail(id, `cards must be 1-5, got ${cards.length}`);
  }
  const hadithCards = cards.filter((c) => c.recordRef.startsWith("hadith:"));
  if (hadithCards.length !== 1) {
    return gateFail(id, `exactly one hadith card required, got ${hadithCards.length}`);
  }
  const contentCards = cards.filter((c) => c.recordRef.startsWith("content:"));
  if (hadithCards.length + contentCards.length !== cards.length) {
    return gateFail(id, "every card must be hadith:<id> or content:<slug>");
  }
  const refs = cards.map((c) => c.recordRef);
  if (new Set(refs).size !== refs.length) {
    return gateFail(id, `duplicate card refs: ${refs.join(", ")}`);
  }
  const hadithId = gateParseHadithRef(input.hadithRef);
  if (hadithId === null) {
    return gateFail(id, `hadith_ref malformed: ${JSON.stringify(input.hadithRef)}`);
  }
  const hadithCard = hadithCards[0];
  if (hadithCard.recordRef !== input.hadithRef) {
    return gateFail(id, `hadith card ref ${hadithCard.recordRef} != hadith_ref ${input.hadithRef}`);
  }
  if (hadithCard.kind !== "hadith") {
    return gateFail(id, `hadith card kind must be "hadith", got ${JSON.stringify(hadithCard.kind)}`);
  }
  for (const c of contentCards) {
    if (c.kind !== "dua" && c.kind !== "quran" && c.kind !== "hadith") {
      return gateFail(id, `content card ${c.recordRef} kind must be dua/quran/hadith, got ${JSON.stringify(c.kind)}`);
    }
  }
  if (!hasText(hadithCard.sourceLine) || hadithCard.sourceLine !== input.hadithSourceLine) {
    return gateFail(id, "hadith card sourceLine does not match the row's hadith_source_line");
  }
  const live = input.liveHadith;
  if (!live) {
    return gateFail(id, `live hadith ${hadithId} not found — cannot verify refs (fail-closed)`);
  }
  if (live.id !== hadithId) {
    return gateFail(id, `live hadith id ${live.id} != ref id ${hadithId}`);
  }
  if (!hasText(live.arabic) || !hasText(live.bengali)) {
    return gateFail(id, `live hadith ${hadithId} is ineligible (empty Arabic or Bengali)`);
  }
  if (live.book_key !== "bukhari") {
    return gateFail(id, `live hadith ${hadithId} book_key ${JSON.stringify(live.book_key)} is not bukhari — unknown book (fail-closed)`);
  }
  const expectedSourceLine = `Sahih al-Bukhari, Hadith ${live.hadith_number}`;
  if (input.hadithSourceLine !== expectedSourceLine) {
    return gateFail(id, `hadith_source_line ${JSON.stringify(input.hadithSourceLine)} != expected ${JSON.stringify(expectedSourceLine)}`);
  }
  for (const c of contentCards) {
    const slug = gateParseContentRef(c.recordRef);
    if (slug === null) return gateFail(id, `content card ref malformed: ${c.recordRef}`);
    const d = gateLiveDuaFor(input.liveDuas, slug);
    if (!d) {
      return gateFail(id, `live dua ${slug} not found — cannot verify refs (fail-closed)`);
    }
    if (d.status !== "published") {
      return gateFail(id, `live dua ${slug} status ${JSON.stringify(d.status)} != published`);
    }
    if (typeof d.content_type !== "string" || d.content_type.toLowerCase() !== "dua") {
      return gateFail(id, `live dua ${slug} content_type ${JSON.stringify(d.content_type)} != dua`);
    }
    // Reference fallback mirrors the planner's mapDua: an empty-string
    // reference falls through to metadata.source (||), not just null
    // (??). A dua whose reference is "" but whose source is set (e.g.
    // special-dua-for-ramadan, 2026-11-28) is planner-eligible, so the
    // gate must not fail it on reference.
    const meta = d.metadata ?? {};
    const reference =
      (typeof meta.reference === "string" && meta.reference) ||
      (typeof meta.source === "string" && meta.source) ||
      null;
    if (!hasText(d.content) || !hasText(d.content_arabic) || !hasText(reference)) {
      return gateFail(id, `live dua ${slug} is ineligible (empty content, Arabic, or reference)`);
    }
  }
  return gateOk(id, `hadith ${input.hadithRef} + ${contentCards.length} content card(s) resolve in the live pools; source line ${expectedSourceLine}`);
}

export function gateEvalArabicIntegrity(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "arabic_integrity";
  for (const card of input.cards) {
    if (!hasText(card.arabic)) {
      return gateFail(id, `card ${card.recordRef} has empty Arabic`);
    }
    const live = gateLiveRowForCard(card, input);
    if (!live) {
      return gateFail(id, `card ${card.recordRef} has no live row to verify Arabic against (fail-closed)`);
    }
    if (card.arabic !== live.arabic) {
      return gateFail(id, `card ${card.recordRef} Arabic differs from the live row (introduced in transit)`);
    }
  }
  return gateOk(id, `${input.cards.length} card(s) Arabic verbatim vs live rows`);
}

export function gateEvalBengaliEditorialQuality(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "bengali_editorial_quality";
  const warnings: string[] = [];
  for (const card of input.cards) {
    if (!hasText(card.bengali)) {
      return gateFail(id, `card ${card.recordRef} has empty Bengali`);
    }
    const live = gateLiveRowForCard(card, input);
    if (!live) {
      return gateFail(id, `card ${card.recordRef} has no live row to verify Bengali against (fail-closed)`);
    }
    if (card.bengali !== live.bengali) {
      return gateFail(id, `card ${card.recordRef} Bengali differs from the live row (introduced in transit)`);
    }
    const result = classifyBengali({ bn: card.bengali, en: live.english ?? undefined });
    if (result.meaningFidelity === "FAIL") {
      return gateFail(id, `card ${card.recordRef} meaning failure: ${result.issues.join(" | ")}`);
    }
    if (result.issues.length > 0) {
      warnings.push(`${card.recordRef}: ${result.issues.join(" | ")}`);
    }
    if (!live.english) {
      warnings.push(`${card.recordRef}: no English parallel — bn/en mismatch check not run`);
    }
  }
  return gateOk(id, `${input.cards.length} card(s) Bengali verbatim vs live rows; no meaning failure`, warnings);
}

export function gateEvalFabricatedClaimsDetection(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "fabricated_claims_detection";
  const liveTexts: string[] = [];
  for (const card of input.cards) {
    const live = gateLiveRowForCard(card, input);
    if (!live) {
      return gateFail(id, `card ${card.recordRef} has no live row to discriminate claim wording against (fail-closed)`);
    }
    liveTexts.push(live.bengali);
  }
  const texts: Array<{ where: string; text: string }> = input.cards.map((c) => ({ where: `card ${c.recordRef}`, text: c.bengali }));
  if (input.push) {
    texts.push({ where: "push title", text: input.push.title });
    texts.push({ where: "push body", text: input.push.body });
  }
  const noted: string[] = [];
  for (const { where, text } of texts) {
    if (!text) continue;
    for (const { re, label } of RELIGIOUS_CLAIM_PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      const matched = m[0];
      if (liveTexts.some((live) => live.includes(matched))) {
        noted.push(`${where}: "${matched}" is the live source's own wording (${label}) — noted, pass`);
      } else {
        return gateFail(id, `${where}: claim pattern hit "${matched}" (${label}) not present in any live source text — introduced in transit`);
      }
    }
  }
  return gateOk(
    id,
    noted.length > 0
      ? `${noted.length} claim-pattern hit(s), all source wording: ${noted.join(" | ")}`
      : "no claim-pattern hits in cards or push",
  );
}

export function gateEvalContentVisualConsistency(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "content_visual_consistency";
  const poster = input.poster;
  // Text-only fallback: there is no poster or scene to check — the
  // validation is SKIPPED (recorded, never claimed as passed).
  if (input.textOnlyFallback === true) {
    return gateSkip(id, "text-only fallback: no poster/scene to check — content-visual consistency skipped (not passed)");
  }
  if (poster.qcStatus !== "passed") {
    return gateFail(id, `poster_qc_status ${JSON.stringify(poster.qcStatus)} != passed — no render QC evidence`);
  }
  const hadithCard = input.cards.find((c) => c.recordRef.startsWith("hadith:"));
  if (!hadithCard) {
    return gateFail(id, "no hadith card to classify");
  }
  if (!hasText(poster.sceneId)) {
    return gateFail(id, "poster_scene_id is empty");
  }
  const sceneId = poster.sceneId as string;
  const engineInput = gateBuildHadithInput(hadithCard, input.liveHadith);
  const classification = classifyHadith(engineInput);
  const topicId = classification.topicId;
  if (!contentVisualMatch(topicId, sceneId)) {
    return gateFail(id, `scene ${sceneId} does not belong to topic ${topicId} (classified ${classification.method}: ${classification.reasoning.join(" | ")})`);
  }
  const concept = conceptsForTopic(topicId).find((c) => c.sceneId === sceneId);
  if (!concept) {
    return gateFail(id, `no concept in topic ${topicId} uses scene ${sceneId}`);
  }
  const historyRows = (input.history ?? []).filter((r) => r.kolkata_date !== input.kolkataDate);
  const entries = gateBuildHistoryEntries(
    historyRows.map((r) => ({ kolkata_date: r.kolkata_date, hadith_ref: r.hadith_ref, cards: r.cards, poster_scene_id: r.poster_scene_id })),
    input.kolkataDate,
    input.historyRecords,
  );
  const similarity = checkVisualSimilarity(
    { sceneId, conceptId: concept.id, topicId },
    entries,
    input.kolkataDate,
  );
  if (similarity.blocked) {
    return gateFail(id, `visual repetition: ${similarity.warnings.join(" | ")}`);
  }
  const dayMs = 86_400_000;
  const todayMs = Date.parse(`${input.kolkataDate}T00:00:00Z`);
  for (const r of historyRows) {
    if (r.poster_scene_id !== sceneId) continue;
    const gap = Math.round((todayMs - Date.parse(`${r.kolkata_date}T00:00:00Z`)) / dayMs);
    if (gap >= 0 && gap <= SELECTION_WINDOWS.sceneReuseDays) {
      return gateFail(id, `scene ${sceneId} was used ${gap === 0 ? "today" : `${gap} day(s) ago`} (${r.kolkata_date}) — inside the ${SELECTION_WINDOWS.sceneReuseDays}-day window; BLOCKED`);
    }
  }
  const warnings = [...similarity.warnings];
  return gateOk(id, `topic ${topicId} (${classification.method}) matches scene ${sceneId} (concept ${concept.id}); similarity windows clear`, warnings);
}

export function gateEvalBengaliReadabilityImageQuality(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "bengali_readability_image_quality";
  // Text-only fallback: the poster-QC precondition is skipped, but
  // the push-text half still runs — in fallback mode the push IS the
  // publication, so empty title/body must still HOLD.
  if (input.textOnlyFallback !== true && input.poster.qcStatus !== "passed") {
    return gateFail(id, `poster_qc_status ${JSON.stringify(input.poster.qcStatus)} != passed — no render QC evidence`);
  }
  if (input.cards.length < 1) {
    return gateFail(id, "no cards to render");
  }
  if (!input.push || !hasText(input.push.title) || !hasText(input.push.body)) {
    return gateFail(id, "push title/body empty — nothing readable to send");
  }
  return gateOk(id, input.textOnlyFallback === true
    ? "text-only fallback: no poster; push title/body present"
    : "poster QC passed for these cards; push title/body present (fit is render-time evidence)");
}

export function gateEvalDuplicatePrevention(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "duplicate_prevention";
  if (input.hadithCycle === null || input.cardCycle === null) {
    return gateFail(id, "hadith_cycle / card_cycle missing — cycle windows cannot be checked (fail-closed)");
  }
  const history = input.history ?? [];
  for (const r of history) {
    if (r.kolkata_date === input.kolkataDate && r.hadith_ref) {
      return gateFail(id, `a published row already exists for ${input.kolkataDate} (duplicate publication)`);
    }
  }
  const hadithCycle = input.hadithCycle;
  const cardCycle = input.cardCycle;
  for (const r of history) {
    if ((r.hadith_cycle ?? 1) === hadithCycle && r.hadith_ref === input.hadithRef) {
      return gateFail(id, `hadith ${input.hadithRef} already published in hadith_cycle ${hadithCycle} (${r.kolkata_date})`);
    }
  }
  const refs = new Set(input.cards.map((c) => c.recordRef));
  for (const r of history) {
    if ((r.card_cycle ?? 1) !== cardCycle) continue;
    const cards = Array.isArray(r.cards) ? (r.cards as Array<{ recordRef?: unknown }>) : [];
    for (const c of cards) {
      if (typeof c.recordRef === "string" && refs.has(c.recordRef)) {
        return gateFail(id, `card ${c.recordRef} already published in card_cycle ${cardCycle} (${r.kolkata_date})`);
      }
    }
  }
  return gateOk(id, `no duplicate publication for ${input.kolkataDate}; hadith + ${refs.size} card(s) unused in cycles ${hadithCycle}/${cardCycle}`);
}

export function gateEvalFinalizedAssetIntegrity(input: GateInputShape): GateValidationResultShape {
  const id: ValidationId = "finalized_asset_integrity";
  const p = input.poster;
  const date = input.kolkataDate;
  // Text-only fallback: there is no finalized asset to verify — the
  // validation is SKIPPED (recorded, never claimed as passed).
  if (input.textOnlyFallback === true) {
    return gateSkip(id, "text-only fallback: no finalized asset to verify — skipped (not passed)");
  }
  if (!isValidPosterUrl(p.url, date)) {
    return gateFail(id, `poster_url is not a daily-content-posters URL for ${date} and a known format`);
  }
  if (p.urls !== undefined && p.urls !== null) {
    if (typeof p.urls !== "object" || Array.isArray(p.urls)) {
      return gateFail(id, "poster_urls must be an object");
    }
    for (const [format, url] of Object.entries(p.urls)) {
      if (!isPosterAssetKey(format) || !isValidPosterPageUrl(url, date)) {
        return gateFail(id, `poster_urls[${format}] is not a valid poster URL`);
      }
    }
  }
  if (typeof p.sceneId !== "string" || !/^[a-z0-9-]{1,64}$/.test(p.sceneId)) {
    return gateFail(id, "poster_scene_id must be a lowercase slug");
  }
  if (p.assetId !== `poster:${date}`) {
    return gateFail(id, `poster_asset_id must be poster:${date}`);
  }
  if (p.storagePath !== `daily-content-posters/${date}/portrait.png`) {
    return gateFail(id, `poster_storage_path must be daily-content-posters/${date}/portrait.png`);
  }
  if (!isValidChecksum(p.checksum)) {
    return gateFail(id, "poster_checksum must be a SHA-256 hex string");
  }
  if (p.checksums !== undefined && p.checksums !== null) {
    if (typeof p.checksums !== "object" || Array.isArray(p.checksums)) {
      return gateFail(id, "poster_checksums must be an object");
    }
    for (const [format, sum] of Object.entries(p.checksums)) {
      if (!isPosterAssetKey(format) || !isValidChecksum(sum)) {
        return gateFail(id, `poster_checksums[${format}] must be a SHA-256 hex string`);
      }
    }
  }
  if (!hasText(p.generatedAt)) {
    return gateFail(id, "poster_generated_at is missing");
  }
  const generatedDate = new Date(p.generatedAt as string);
  if (Number.isNaN(generatedDate.getTime())) {
    return gateFail(id, "poster_generated_at is not a valid timestamp");
  }
  if (kolkataDateString(generatedDate) !== date) {
    return gateFail(id, `poster_generated_at is dated ${kolkataDateString(generatedDate)}, not ${date}`);
  }
  return gateOk(id, `poster ${p.assetId} validated: URL, storage path, checksum, scene ${p.sceneId}, generated ${date}`);
}

export function evaluateAutonomousGate(input: GateInputShape): GateVerdictShape {
  // Normalize first: a stored row with a corrupt card (missing
  // recordRef / non-string text) or a missing poster object must HOLD,
  // never throw. A gate that crashes on malformed input is not
  // fail-closed — it is a 500, and the heal tick would misread it.
  const normalizeCard = (card: unknown): GateCardShape => {
    const c = (card ?? {}) as Record<string, unknown>;
    return {
      kind: typeof c.kind === "string" ? c.kind : "",
      recordRef: typeof c.recordRef === "string" ? c.recordRef : "",
      arabic: typeof c.arabic === "string" ? c.arabic : "",
      bengali: typeof c.bengali === "string" ? c.bengali : "",
      sourceLine: typeof c.sourceLine === "string" ? c.sourceLine : null,
    };
  };
  const safe: GateInputShape = {
    ...input,
    cards: (Array.isArray(input.cards) ? input.cards : []).map(normalizeCard),
    poster: input.poster ?? {
      url: null, urls: null, assetId: null, storagePath: null,
      checksum: null, checksums: null, sceneId: null, qcStatus: null, generatedAt: null,
    },
    history: input.history ?? [],
  };
  const results: GateValidationResultShape[] = [
    gateEvalSourceReferenceIntegrity(safe),
    gateEvalArabicIntegrity(safe),
    gateEvalBengaliEditorialQuality(safe),
    gateEvalFabricatedClaimsDetection(safe),
    gateEvalContentVisualConsistency(safe),
    gateEvalBengaliReadabilityImageQuality(safe),
    gateEvalDuplicatePrevention(safe),
    gateEvalFinalizedAssetIntegrity(safe),
  ];
  const combined = evaluateSafetyGate(results.map((r) => ({ id: r.id, pass: r.pass, detail: r.detail, ...(r.skipped === true ? { skipped: true } : {}) })));
  if (combined.decision === "publish") {
    return { decision: "publish", results, failed: [], reasons: [] };
  }
  return { decision: "hold", results, failed: combined.failed, reasons: combined.reasons };
}

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
      // Text-only fallback (owner decision 2026-11-23): when the
      // text_only_fallback setting is on, a quarantined row publishes
      // text-only through publishPlanned (same gate, no image). Flag
      // off keeps the hold behaviour below.
      const { settings: fbSettings } = await readModeSettings(svc);
      if (fbSettings.textOnlyFallback === true) {
        const published = await publishPlanned(svc, kolkataDate);
        const pj = (await published.json().catch(() => ({}))) as Record<string, unknown>;
        if (pj.ok === true && pj.deduped !== true) {
          const fb = await facebookDispositionAfterPublish(svc, kolkataDate);
          return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: true, hold: null, fallback: "text_only", publication_id: pj.publication_id,
            reason: "poster_quarantined; published text-only (text_only_fallback enabled)",
            channels: channels("published", pj.delivery ?? null, fb) });
        }
        if (pj.deduped === true) {
          const fb = await facebookDispositionAfterPublish(svc, kolkataDate);
          return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold: null, deduped: true,
            channels: channels("published", null, fb) });
        }
        // A gate hold is its own hold state (not a publish failure):
        // the content failed validation and is NEVER published
        // text-only. Any other non-ok publish result keeps the
        // publish_failed hold.
        const hold = pj.reason === "gate_hold" ? "gate_hold" : "publish_failed";
        const alertReason = pj.reason === "gate_hold"
          ? `autonomous gate held the publication: ${Array.isArray(pj.failed) ? (pj.failed as string[]).join(",") : "unknown"}`
          : `publish_planned failed: ${typeof pj.error === "string" ? pj.error : "unknown"}`;
        return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold, publication_id: pub.id,
          channels: channels("planned", null),
          alert: alertFor("warn", alertReason, pub.id) });
      }
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
      // A gate hold is its own hold state (not a publish failure):
      // the content failed validation and stays planned for review.
      // Any other non-ok publish result keeps the publish_failed hold.
      const hold = pj.reason === "gate_hold" ? "gate_hold" : "publish_failed";
      const alertReason = pj.reason === "gate_hold"
        ? `autonomous gate held the publication: ${Array.isArray(pj.failed) ? (pj.failed as string[]).join(",") : "unknown"}`
        : `publish_planned failed: ${typeof pj.error === "string" ? pj.error : "unknown"}`;
      return respond({ ok: true, kolkata_date: kolkataDate, tick, healed: false, hold, publication_id: pub.id,
        channels: channels("planned", null),
        alert: alertFor("warn", alertReason, pub.id) });
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

/** The 8-validation autonomous gate, run at publish time (publishPlanned
 *  ONLY — the Mode A publish path). Fetches the live rows the gate must
 *  verify against with targeted by-id / by-slug queries (never the full
 *  pools), the published history, and the history rows' hadith records
 *  for the visual-history rebuild. A live row that cannot be fetched is
 *  passed as null, and the gate FAILS CLOSED on the missing row (V1 /
 *  V2 / V3 / V4) — a fetch failure never becomes a publish. */
async function runPublishGate(
  svc: Svc,
  pub: {
    hadith_ref: string | null;
    hadith_source_line: string | null;
    cards: unknown;
    push: Record<string, unknown> | null;
    poster_url: string | null;
    poster_urls: Record<string, unknown> | null;
    poster_asset_id: string | null;
    poster_storage_path: string | null;
    poster_checksum: string | null;
    poster_checksums: Record<string, unknown> | null;
    poster_scene_id: string | null;
    poster_qc_status: string | null;
    poster_generated_at: string | null;
    hadith_cycle: number | null;
    card_cycle: number | null;
  },
  kolkataDate: string,
  opts: { textOnlyFallback?: boolean } = {},
): Promise<GateVerdictShape> {
  const cards = Array.isArray(pub.cards) ? (pub.cards as GateCardShape[]) : [];
  const hadithId = gateParseHadithRef(pub.hadith_ref);
  let liveHadith: GateHadithShape | null = null;
  if (hadithId) {
    const { data } = await svc.from("hadiths")
      .select("id, book_key, chapter_id, hadith_number, arabic, bengali")
      .eq("id", hadithId)
      .maybeSingle();
    const h = data as { id: string; book_key: string; chapter_id: number | null; hadith_number: number; arabic: string; bengali: string | null } | null;
    if (h) {
      // The hadiths table carries no English column (planDay selects
      // the same six columns) — the gate's bn/en mismatch check does
      // not run for hadiths; V3 records that as a warning, not a pass.
      liveHadith = { ...h, english: null };
    }
  }
  const slugs = [...new Set(
    cards
      .filter((c) => typeof c.recordRef === "string" && c.recordRef.startsWith("content:"))
      .map((c) => gateParseContentRef(c.recordRef))
      .filter((s): s is string => s !== null),
  )];
  const liveDuas: Record<string, GateLiveDuaShape> = {};
  if (slugs.length > 0) {
    const { data } = await svc.from("admin_content")
      .select("slug, title, content, content_arabic, metadata, status, content_type")
      .in("slug", slugs);
    for (const d of (data ?? []) as Array<{ slug: string; title: string | null; content: string | null; content_arabic: string | null; metadata: GateLiveDuaShape["metadata"]; status: string; content_type: string }>) {
      liveDuas[d.slug] = d;
    }
  }
  const { data: pubs } = await svc.from("daily_content_publications")
    .select("kolkata_date, hadith_ref, cards, poster_scene_id, hadith_cycle, card_cycle")
    .eq("status", "published")
    .order("kolkata_date", { ascending: false })
    .limit(500);
  const history = (pubs ?? []) as GateHistoryRowShape[];
  // History rows' hadith records (chapter_id) for the visual-history
  // rebuild — without them classification is card-only, which can drop
  // a history entry and hide a scene reuse.
  const historyIds = [...new Set(
    history.flatMap((r) => (Array.isArray(r.cards) ? (r.cards as Array<{ recordRef?: unknown }>) : [])
      .filter((c) => typeof c.recordRef === "string" && (c.recordRef as string).startsWith("hadith:"))
      .map((c) => (c.recordRef as string).slice("hadith:".length))),
  )];
  const historyRecords = new Map<string, { chapter_id: number | null; english: string | null }>();
  if (historyIds.length > 0) {
    const { data } = await svc.from("hadiths").select("id, chapter_id").in("id", historyIds);
    for (const h of (data ?? []) as Array<{ id: string; chapter_id: number | null }>) {
      historyRecords.set(h.id, { chapter_id: h.chapter_id ?? null, english: null });
    }
  }
  const storedPush = pub.push && typeof pub.push === "object" ? pub.push : null;
  const push = storedPush
    ? {
        title: typeof storedPush.title === "string" ? storedPush.title : "",
        body: typeof storedPush.body === "string" ? storedPush.body : "",
      }
    : null;
  return evaluateAutonomousGate({
    kolkataDate,
    hadithRef: pub.hadith_ref ?? null,
    hadithSourceLine: pub.hadith_source_line ?? null,
    cards,
    push,
    poster: {
      url: pub.poster_url ?? null,
      urls: pub.poster_urls ?? null,
      assetId: pub.poster_asset_id ?? null,
      storagePath: pub.poster_storage_path ?? null,
      checksum: pub.poster_checksum ?? null,
      checksums: pub.poster_checksums ?? null,
      sceneId: pub.poster_scene_id ?? null,
      qcStatus: pub.poster_qc_status ?? null,
      generatedAt: pub.poster_generated_at ?? null,
    },
    liveHadith,
    liveDuas,
    history,
    historyRecords,
    hadithCycle: pub.hadith_cycle ?? null,
    cardCycle: pub.card_cycle ?? null,
    textOnlyFallback: opts.textOnlyFallback === true,
  });
}

/** Publish step 3 of the split flow: publish a planned row whose
 *  poster is finalized (QC-passed), sending the first push with the
 *  finalized poster as `image_url`. Text-only fallback (owner
 *  decision 2026-11-23): a QUARANTINED row (poster failed twice)
 *  publishes text-only when the `text_only_fallback` setting is on
 *  — the 8-gate still applies (V5/V8 skipped, V6 push-text checked;
 *  a gate_hold never publishes). Refuses anything else — a failed
 *  or missing poster on a non-quarantined row leaves the row
 *  planned, so downstream has nothing to distribute that day. An
 *  already-published row dedupes. */
async function publishPlanned(svc: Svc, kolkataDate: string): Promise<Response> {
  const { data: row } = await svc.from("daily_content_publications")
    .select("id, status, push, poster_url, poster_qc_status, poster_error, hadith_ref, hadith_source_line, cards, poster_asset_id, poster_storage_path, poster_checksum, poster_checksums, poster_urls, poster_scene_id, poster_generated_at, hadith_cycle, card_cycle")
    .eq("kolkata_date", kolkataDate)
    .maybeSingle();
  const pub = row as {
    id: string;
    status: string;
    push: Record<string, unknown> | null;
    poster_url: string | null;
    poster_qc_status: string | null;
    poster_error: string | null;
    hadith_ref: string | null;
    hadith_source_line: string | null;
    cards: unknown;
    poster_asset_id: string | null;
    poster_storage_path: string | null;
    poster_checksum: string | null;
    poster_checksums: Record<string, unknown> | null;
    poster_urls: Record<string, unknown> | null;
    poster_scene_id: string | null;
    poster_generated_at: string | null;
    hadith_cycle: number | null;
    card_cycle: number | null;
  } | null;
  if (!pub) return jsonResponse({ ok: false, error: "no publication for date" }, 404);
  if (pub.status === "published") return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
  if (pub.status !== "planned") {
    return jsonResponse({ ok: false, error: "publication is not planned", reason: "not_planned" }, 409);
  }
  // Settings are read once here and reused for the per-channel
  // switches below. The fallback is a function of (flag on) + (row
  // quarantined) — no body flag: a manual publish-workflow dispatch
  // on a quarantined row with the flag on publishes text-only, and
  // with the flag off it 409s poster_not_ready as before.
  const { settings: modeSettings } = await readModeSettings(svc);
  const fallback = isQuarantined(pub.poster_error) && modeSettings.textOnlyFallback === true;
  // The split-flow gate: a publication is published ONLY with a
  // QC-passed finalized poster — unless the text-only fallback
  // applies (quarantined row + flag on). A failed or missing poster
  // on any other row leaves the row planned — downstream has nothing
  // to distribute.
  if (pub.poster_qc_status !== "passed" || !pub.poster_url) {
    if (!fallback) {
      return jsonResponse({ ok: false, reason: "poster_not_ready", poster_qc_status: pub.poster_qc_status ?? null }, 409);
    }
    // else: text-only fallback — continue to the gate.
  }
  const storedPush = pub.push && typeof pub.push === "object" ? (pub.push as Record<string, unknown>) : null;
  if (!storedPush) return jsonResponse({ ok: false, error: "planned row has no push payload" }, 500);
  // The 8-validation autonomous gate (Section 7): ALL 8 must pass or
  // the row is HELD, never published. In fallback mode V5/V8 are
  // recorded SKIPPED and V6 runs its push-text half; any genuine
  // failure still holds the row. The verdict is recorded in the
  // row's error column (gate_hold:<failed ids>) so the admin page and
  // the heal tick can see why; the row stays planned. This runs AFTER
  // the poster check (preserving the poster_not_ready contract) and
  // BEFORE the per-channel switches, so it applies to both send paths
  // (including push-paused publishWithoutPush).
  const verdict = await runPublishGate(svc, pub, kolkataDate, { textOnlyFallback: fallback });
  if (verdict.decision === "hold") {
    // Best-effort verdict record: a failed write must not turn a hold
    // into a publish — the 409 below is returned regardless, and it
    // carries the full per-validation results.
    await svc.from("daily_content_publications").update({ error: `gate_hold:${verdict.failed.join(",")}` } as never).eq("id", pub.id).eq("status", "planned");
    return jsonResponse({ ok: false, reason: "gate_hold", failed: verdict.failed, validations: verdict.results }, 409);
  }
  // Phase 6 — per-channel switches (modeSettings was read once at
  // the top of this function and is reused here). website_auto_publish
  // === false refuses the website publication (the row stays planned);
  // a paused website channel never publishes. push_enabled === false
  // publishes the website WITHOUT sending: the row flips with zeroed
  // delivery counters and no delivery rows are created, so no push is
  // queued for later — the push channel's pause is honored, not
  // deferred. (Push catch-up after unpausing is not implemented;
  // see the Phase 6 report.) Missing columns mean legacy behaviour
  // (website + push on).
  if (modeSettings.websiteAutoPublish === false) {
    return jsonResponse({ ok: false, error: "website_paused", reason: "website_auto_publish is false" }, 409);
  }
  if (modeSettings.pushEnabled === false) {
    try {
      const result = await publishWithoutPush(svc, pub.id);
      return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: result.publication_id, delivery: result.delivery, ...(fallback ? { fallback: "text_only" } : {}) });
    } catch (e) {
      return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  // set_poster already sets push.image_url; re-derive it from the
  // finalized poster_url so the first send carries the image even if
  // the stored push predates finalization. In text-only fallback
  // mode the push is forced image_url null (defense in depth — a
  // quarantined row's stored push already carries null).
  const pushForSend = fallback
    ? { ...storedPush, image_url: null } as PushPayload
    : { ...storedPush, image_url: pub.poster_url } as PushPayload;
  try {
    const result = await sendAndPublish(svc, pub.id, pushForSend);
    return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: result.publication_id, delivery: result.delivery, ...(fallback ? { fallback: "text_only" } : {}) });
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
    // A successful publish clears a stale gate_hold verdict — see sendAndPublish.
    error: null,
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
  if ("text_only_fallback" in (patch as Record<string, unknown>)) {
    return jsonResponse({ ok: false, error: "text_only_fallback is owner-SQL only and cannot be changed here" }, 403);
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
    // fall through to the daily branch (which would plan the day).
    // It also cannot combine with plan_only or publish_planned (the
    // heal step calls those paths itself, in the right order). Rejected
    // before planDay so a bad combination performs nothing.
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

    // Daily branch — Option A conversion (overnight mission 2026-11-17):
    // the bare call now has plan_only semantics. Plan + resolve today's
    // publication row, then STOP. It never sends and never flips to
    // published. Publication happens ONLY through publish_planned
    // (poster QC + 8-validation gate + per-channel switches), after the
    // poster workflow finalizes onto the row. A bare call can therefore
    // never publish text-only, in either mode. The old single-call send
    // lived here; sendAndPublish is now called only from publishPlanned
    // (and publishWithoutPush, the push-paused case). The production
    // daily cron becomes a 3-dispatch chain (plan -> poster ->
    // publish_planned) in a separate, owner-approved step (Phase 7
    // step 6); until then a bare cron call plans the day and the
    // heal/retry path finishes it — with a poster when one exists, or
    // text-only only for a quarantined row when the text_only_fallback
    // setting is on (owner decision 2026-11-23).
    const r = await ensurePlannedRow(svc, kolkataDate, plan);
    if (r.kind === "deduped") {
      return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
    }
    if (r.kind === "conflict") {
      return jsonResponse({ ok: false, error: r.error }, 500);
    }
    return jsonResponse({ ok: true, planned: true, kolkata_date: kolkataDate, publication_id: r.publicationId });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
