import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import webpush from "https://esm.sh/web-push@3.6.7?bundle";

/* ------------------------------------------------------------------
 * daily-content — Daily Islamic Content Automation (NOT YET DEPLOYED).
 * Local implementation only. Deploying this function, running the
 * migration, and registering the 06:00 Asia/Kolkata cron are separately
 * approved launch steps (see docs/daily-content/PRODUCTION-READINESS.md).
 *
 * Behaviour:
 *  - One run per Asia/Kolkata date (idempotent: a published publication
 *    for the date is never re-published or re-sent).
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
 * ------------------------------------------------------------------ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("WEBPUSH_VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("WEBPUSH_VAPID_PRIVATE_KEY")!;
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

  // Cards: seeded order, max 2 per kind, 4 target, never duplicated in a day.
  const cards: Array<Record<string, unknown>> = [];
  const perKind = new Map<string, number>();
  const seen = new Set<string>();
  const orderedD = seededShuffle(eligibleD, hashString(eligibleD.map((d) => `content:${d.slug}`).join("|")));
  for (const pass of [0, 1]) {
    for (const d of orderedD) {
      if (cards.length >= 4) break;
      const ref = `content:${d.slug}`;
      if (seen.has(ref) || cardUsed.has(ref)) continue;
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
    cardCycle,
    diagnostics: {
      hadithPool: (hadithRows ?? []).length,
      hadithEligible: eligibleH.length,
      duaPool: (duaRows ?? []).length,
      duaEligible: eligibleD.length,
    },
  };
}

function classifyFailure(status: number | null): string {
  if (status === 404 || status === 410 || status === 401 || status === 403) return "disabled";
  if (status === null || status === 429 || status >= 500) return "retryable";
  return "failed";
}

async function sendToTokens(
  svc: Svc,
  publicationId: string,
  push: NonNullable<Awaited<ReturnType<typeof planDay>>["push"]>,
): Promise<{ total: number; sent: number; failed: number; disabled: number }> {
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
  for (const t of (tokens ?? []) as Array<{ id: string; token: string; platform: string; device_id: string | null }>) {
    if (t.device_id && optedOut.has(t.device_id)) continue;
    total++;
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
      const res = await webpush.sendNotification(sub, JSON.stringify(push), { TTL: 86400, urgency: "normal" } as never);
      const status = (res as unknown as { statusCode?: number }).statusCode ?? 201;
      if (status >= 200 && status < 300) {
        sent++;
        await svc.from("daily_content_deliveries").update({ status: "sent", attempts: 1 } as never).eq("publication_id", publicationId).eq("device_id", t.device_id);
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
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/(\d{3})/);
      const cls = classifyFailure(m ? Number(m[1]) : null);
      failed++;
      if (cls === "disabled") {
        disabled++;
        await svc.from("device_push_tokens").update({ enabled: false } as never).eq("id", t.id);
      }
      const patch: Record<string, unknown> = { status: cls, attempts: 1, error: msg };
      if (cls === "retryable") {
        patch.next_attempt_at = new Date(Date.now() + 5 * 60_000).toISOString();
      }
      await svc.from("daily_content_deliveries").update(patch as never).eq("publication_id", publicationId).eq("device_id", t.device_id);
    }
  }
  return { total, sent, failed, disabled };
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
    const { data: pub } = await svc.from("daily_content_publications").select("push").eq("id", row.publication_id).maybeSingle();
    const { data: tok } = await svc.from("device_push_tokens").select("token, enabled").eq("id", row.token_id).maybeSingle();
    if (!pub || !tok || !(tok as { enabled: boolean }).enabled) continue;
    retried++;
    const attempts = (row.attempts ?? 0) + 1;
    try {
      const sub = JSON.parse(String((tok as { token: string }).token));
      await webpush.sendNotification(sub, JSON.stringify((pub as { push: unknown }).push), { TTL: 86400, urgency: "normal" } as never);
      sent++;
      await svc.from("daily_content_deliveries").update({ status: "sent", attempts } as never).eq("id", row.id);
    } catch {
      failed++;
      if (attempts >= 4) {
        await svc.from("daily_content_deliveries").update({ status: "failed", attempts } as never).eq("id", row.id);
      } else {
        const delayMin = BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];
        await svc.from("daily_content_deliveries").update({
          status: "retryable",
          attempts,
          next_attempt_at: new Date(Date.now() + delayMin * 60_000).toISOString(),
        } as never).eq("id", row.id);
      }
    }
  }
  return { retried, sent, failed };
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

  try {
    if (body.retry_only === true) {
      return jsonResponse({ ok: true, ...(await runRetries(svc)) });
    }

    const kolkataDate = kolkataDateString(new Date());
    const plan = await planDay(svc, kolkataDate);

    if (body.dry_run === true) {
      return jsonResponse({ ok: true, dry_run: true, plan });
    }

    const { data: settings } = await svc.from("daily_content_settings").select("enabled").limit(1).maybeSingle();
    if (settings && (settings as { enabled: boolean }).enabled === false) {
      return jsonResponse({ ok: false, reason: "paused" });
    }

    const { data: existing } = await svc
      .from("daily_content_publications")
      .select("id")
      .eq("kolkata_date", kolkataDate)
      .eq("status", "published")
      .maybeSingle();
    if (existing) {
      return jsonResponse({ ok: true, deduped: true, kolkata_date: kolkataDate });
    }
    if (!plan.hadith || !plan.push) {
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
      return jsonResponse({ ok: false, reason: plan.hadithEmptyReason });
    }

    const { data: pub } = await svc
      .from("daily_content_publications")
      .insert({
        kolkata_date: kolkataDate,
        status: "published",
        hadith_ref: `hadith:${plan.hadith.id}`,
        hadith_source_line: plan.hadith.sourceLine,
        cards: plan.cards,
        push: plan.push,
        hadith_cycle: plan.hadithCycle,
        card_cycle: plan.cardCycle,
        published_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    const publicationId = (pub as { id: string } | null)?.id;
    if (!publicationId) {
      return jsonResponse({ ok: false, error: "Publication insert failed." }, 500);
    }
    const delivery = await sendToTokens(svc, publicationId, plan.push);
    await svc.from("daily_content_publications").update({
      recipients_total: delivery.total,
      recipients_sent: delivery.sent,
      recipients_failed: delivery.failed,
    } as never).eq("id", publicationId);
    return jsonResponse({ ok: true, kolkata_date: kolkataDate, publication_id: publicationId, delivery });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
