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

// Push timeout (hardening B): every provider call is bounded well
// below the 10-minute retry lease, so a hung provider cannot hold a
// claimed row past its lease and invite a second worker to send the
// same delivery. Default 30 seconds; overridable per deployment via
// DAILY_CONTENT_PUSH_TIMEOUT_MS (milliseconds) — production leaves it
// unset. The race below never retries inside the call: on timeout the
// single attempt ends, the error carries no status code, and the
// existing classification treats it as retryable without disabling
// the token. The underlying request may still complete late (provider
// accepted), but that late completion touches no database state — it
// can neither resurrect nor overwrite a terminal row. It can only
// produce the documented at-least-once re-send on the next tick.
const PUSH_TIMEOUT_MS_DEFAULT = 30_000;
function pushTimeoutMs(): number {
  const raw = Number(Deno.env.get("DAILY_CONTENT_PUSH_TIMEOUT_MS") ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : PUSH_TIMEOUT_MS_DEFAULT;
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
        const title = (d.title_bn ?? "").trim() || (d.title_en ?? "").trim();
        const bengali = (d.translation_bn ?? "").trim();
        cards.push({
          kind,
          recordRef: ref,
          title,
          arabic: (d.arabic ?? "").trim(),
          bengali,
          sourceLine: (d.reference ?? "").trim(),
          canonicalLink: `/dua/${d.slug}`,
          altText: `${kind === "quran" ? "কুরআনের আয়াত" : kind === "hadith" ? "হাদিস" : "দোয়া"}: ${excerpt(bengali, 80)} — ${(d.reference ?? "").trim()}`,
          caption: `🤲 ${title}\n${bengali}\n📖 ${(d.reference ?? "").trim()}\n🔗 https://noorapp.in/dua/${d.slug}\n— NoorApp`,
        });
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

async function planDay(svc: Svc, kolkataDate: string) {
  const { data: hadithRows } = await svc
    .from("hadiths")
    .select("id, book_key, chapter_id, hadith_number, arabic, bengali")
    .order("hadith_number", { ascending: true })
    .limit(5000);
  const eligibleH = ((hadithRows ?? []) as HadithRow[]).filter(eligibleHadith);

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

  // Hadith: first unused in seeded order, else restart (cycle + 1).
  let hadith: HadithRow | null = null;
  let nextHadithCycle = hadithCycle;
  if (eligibleH.length) {
    const ordered = seededShuffle(eligibleH, hashString(eligibleH.map((h) => `hadith:${h.id}`).join("|")));
    hadith = ordered.find((h) => !hadithUsed.has(`hadith:${h.id}`)) ?? ordered[0] ?? null;
    if (hadith && hadithUsed.has(`hadith:${hadith.id}`)) nextHadithCycle = hadithCycle + 1;
  }
  const hadithSourceLine = hadith
    ? `${BOOK_NAMES[hadith.book_key] ?? hadith.book_key}, Hadith ${hadith.hadith_number}`
    : null;
  const hadithLink = hadith?.book_key === "bukhari" ? "/hadith/sahih-bukhari/bangla" : "/hadith";

  const shareSelection = selectShareCards(eligibleD, cardUsed);
  const cards = shareSelection.cards;
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
      hadithPool: (hadithRows ?? []).length,
      hadithEligible: eligibleH.length,
      duaPool: (duaRows ?? []).length,
      duaEligible: eligibleD.length,
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
): Promise<{ total: number; sent: number; failed: number; disabled: number; skipped: number }> {
  const { data: tokens } = await svc
    .from("device_push_tokens")
    .select("id, token, platform, device_id")
    .eq("enabled", true)
    .eq("platform", "web")
    .limit(5000);
  const { data: prefs } = await svc
    .from("daily_content_preferences")
    .select("device_id, daily_enabled")
    .eq("daily_enabled", false);
  const optedOut = new Set(((prefs ?? []) as Array<{ device_id: string }>).map((p) => p.device_id));

  let total = 0;
  let sent = 0;
  let failed = 0;
  let disabled = 0;
  let skipped = 0;
  for (const t of (tokens ?? []) as Array<{ id: string; token: string; platform: string; device_id: string | null }>) {
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
    const { error: capErr } = await svc.from("daily_content_deliveries").insert({
      publication_id: publicationId,
      token_id: t.id,
      device_id: t.device_id,
      platform: "web",
      status: "pending",
      attempts: 0,
    } as never);
    if (capErr) continue; // Already attempted for this device today — skip (no double-send).
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
  return { total, sent, failed, disabled, skipped };
}

async function runRetries(svc: Svc): Promise<{ retried: number; sent: number; failed: number }> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await svc
    .from("daily_content_deliveries")
    .select("id, publication_id, token_id, device_id, attempts")
    .eq("status", "retryable")
    .lt("attempts", 4)
    .lte("next_attempt_at", nowIso)
    .limit(200);
  const BACKOFF = [5, 15, 45];
  let retried = 0;
  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as Array<{ id: string; publication_id: string; token_id: string; device_id: string | null; attempts: number }>) {
    const { data: pub } = await svc.from("daily_content_publications").select("push, status").eq("id", row.publication_id).maybeSingle();
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
    if (!tok || !(tok as { enabled: boolean }).enabled) continue;
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
    const { data: claimed } = await svc.from("daily_content_deliveries")
      .update({ next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() } as never)
      .eq("id", row.id)
      .eq("status", "retryable")
      .lt("attempts", 4)
      .lte("next_attempt_at", claimIso)
      .select("id");
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
    retried++;
    const attempts = (row.attempts ?? 0) + 1;
    try {
      const sub = JSON.parse(String((tok as { token: string }).token));
      await sendPushWithTimeout(sub, JSON.stringify((pub as { push: unknown }).push));
      // H3: a sent update that matches zero rows is not a success. The
      // push went out, so this falls into the catch below and degrades
      // to retryable (the known at-least-once window); it must not be
      // counted sent.
      const { data: flipped } = await svc.from("daily_content_deliveries").update({ status: "sent", attempts } as never).eq("id", row.id).select("id");
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
    const { data: promotedRows } = await svc.from("daily_content_deliveries")
      .update({ status: "retryable", next_attempt_at: new Date().toISOString() } as never)
      .eq("publication_id", plannedRow.id)
      .eq("status", "pending")
      .select("id");
    promoted = (promotedRows as unknown[] | null)?.length ?? 0;
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
  const retries = await runRetries(svc);
  return { ...retries, promoted, superseded };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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
    await svc.from("daily_content_deliveries").update({
      status: "retryable",
      next_attempt_at: new Date().toISOString(),
    } as never).eq("publication_id", publicationId).eq("status", "pending");
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
    } as never).eq("id", publicationId).select("id");
    // H3: a flip that matches zero rows must not be reported as
    // published. The row stays planned and the next run recovers it.
    if (!((flipped as unknown[] | null)?.length)) throw new Error("Publication flip affected 0 rows");
    return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: publicationId, delivery });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
