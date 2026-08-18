import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import webpush from "https://esm.sh/web-push@3.6.7?bundle";

/* ------------------------------------------------------------------
 * scheduler-dispatch — invoked by pg_cron every minute (bulk)
 * or by the admin panel with { schedule_id } (test / preview).
 * Self-contained: selects content, generates Bengali copy, signs and
 * sends web push using the VAPID keypair in secrets.
 * ------------------------------------------------------------------ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("WEBPUSH_VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("WEBPUSH_VAPID_PRIVATE_KEY")!;
const FCM_JSON = (Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "").trim();
const DEFAULT_NOTIFICATION_ICON = "https://www.noorapp.in/notification-icon.png";
const DEFAULT_NOTIFICATION_BADGE = "https://www.noorapp.in/badge-icon.png";

function safeAssetUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

async function getNotificationAssets(svc: ReturnType<typeof createClient>): Promise<{ icon: string; badge: string }> {
  const { data } = await svc
    .from("app_settings")
    .select("setting_key, setting_value")
    .in("setting_key", ["branding", "notifications"]);

  const rows = new Map<string, any>((data ?? []).map((row: any) => [String(row.setting_key), row.setting_value ?? {}]));
  const branding = rows.get("branding") ?? {};
  const notifications = rows.get("notifications") ?? {};

  return {
    icon: safeAssetUrl(notifications.defaultIconUrl || branding.iconUrl, DEFAULT_NOTIFICATION_ICON),
    badge: safeAssetUrl(notifications.defaultBadgeUrl || branding.faviconUrl, DEFAULT_NOTIFICATION_BADGE),
  };
}

webpush.setVapidDetails(
  "https://noorapp.in",
  VAPID_PUBLIC,
  VAPID_PRIVATE,
);

interface Schedule {
  id: string;
  name: string;
  kind: string;
  time_at: string;
  weekdays: number[];
  day_of_month: number | null;
  tz: string;
  islamic_event: string | null;
  event_date: string | null;
  enabled: boolean;
  target: string;
  title_override: string | null;
  body_override: string | null;
  content_auto: boolean;
  content_type: string | null;
  content_id: string | null;
  slug?: string;
}

/* ---------------- smart copy generation ---------------- */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\u2764\u262A\u2190-\u21AA][\uFE0F\u200D\u20E3\u0301-\u036F]*/gu;
function emojiCount(s: string): number {
  return (s.match(EMOJI_RE) || []).length;
}

function clampTitle(title: string): string {
  let out = title;
  while (true) {
    let n = 0;
    for (const ch of out) n += ch.codePointAt(0)! > 0xffff ? 2 : 1;
    if (n <= 60 && emojiCount(out) <= 1) return out;
    out = out.replace(/[\s.!?,;-]+$/, "");
    if (out.length <= 3) return out;
    out = out.slice(0, -2);
  }
}
function clampBody(body: string): string {
  let out = body;
  while (true) {
    let n = 0;
    for (const ch of out) n += ch.codePointAt(0)! > 0xffff ? 2 : 1;
    if (n <= 120 && emojiCount(out) <= 1) return out;
    out = out.replace(/[\s.!?,;-]+$/, "");
    if (out.length <= 3) return out;
    out = out.slice(0, -2);
  }
}

function generateCopy(eventType: string | null, contentTitle: string | null): { title: string; body: string } {
  if (eventType === "jumuah") {
    return {
      title: "🕌 জুম্মার দিন — জুম্মার নামাজের প্রস্তুতি নিন।",
      body: "Assalamu Alaikum! আজ জুম্মার দিন। জুম্মার নামাজের প্রস্তুতি নিন এবং বেশি বেশি দুরুদ শরীফ পাঠ করুন।",
    };
  }
  if (eventType === "morning") {
    return {
      title: "🌅 সুপ্রভাত — এই সুন্দর দোয়াটি দিয়ে দিন শুরু করুন।",
      body: "Assalamu Alaikum! আল্লাহর স্মরণে সকালের আমল শুরু করুন — আজের দোয়াটি পড়ে নিন।",
    };
  }
  if (eventType === "evening") {
    return {
      title: "🌇 সন্ধ্যার আমল — মনকে আল্লাহর দিকে ফিরিয়ে নিন।",
      body: "Assalamu Alaikum! দিনের কাজ সেরে সন্ধ্যার এই দোয়াটি পড়ে মনকে শান্ত করুন।",
    };
  }
  if (eventType === "sleep") {
    return {
      title: "🌙 ঘুমানোর আগে এই দোয়াটি পড়তে ভুলবেন না।",
      body: "Assalamu Alaikum! রাতের ঘুমের আগে আল্লাহর স্মরণে এই দোয়াটি পড়ে শুভরাত্রি কাটান।",
    };
  }
  if (eventType === "fast_reminder") {
    return {
      title: "🤲 আজ নাফল রোজার দিন — আমল রাখতে পারেন?",
      body: "Assalamu Alaikum! রাসূল ﷺ সপ্তাহে সোম ও বৃহস্পতিবার নাফল রোজা রাখতেন। আল্লাহর রহমতের আশায় আজ রোজা রাখুন।",
    };
  }
  if (eventType === "ramadan_sehri") {
    return {
      title: "🌙 সেহরির সময় — সেহরির দোয়া পড়ে নিন।",
      body: "Assalamu Alaikum! সেহরির সময় শেষ হচ্ছে — সেহরির দোয়া পড়ে রোজা শুরু করুন। আল্লাহ রহমতে কবুল করুন।",
    };
  }
  if (eventType === "ramadan_iftar") {
    return {
      title: "🌅 ইফতারের মুহূর্ত — ইফতারের দোয়া পড়ুন।",
      body: "Assalamu Alaikum! ইফতারের সময় এসেছে — ইফতারের দোয়া পড়ে রোজা ভাঙুন। কবুলিয়তের সাথে আমল হোক।",
    };
  }
  if (eventType === "eid") {
    return {
      title: "🌙 ঈদ মুবারক! আজ তাকবীর — \"আল্লাহু আকবার\"।",
      body: "Assalamu Alaikum! ঈদ মুবারক — ঈদের তাকবীর পাঠ করুন এবং ঈদের সুন্দর আমলগুলো করতে ভুলবেন না।",
    };
  }
  // fallback: story/dua daily prompt
  const isDua = contentTitle !== null;
  return {
    title: isDua
      ? `📿 আজকের দোয়া — "${contentTitle!.slice(0, 38)}"।`
      : "📖 আজকের অনুপ্রেরণামূলক কাহিনীটি শুনুন।",
    body: isDua
      ? "Assalamu Alaikum! কয়েক সেকেন্ডের এই দোয়াটি হতে পারে আজকের সুন্দর আমল। পড়ুন ও আমল করুন।"
      : "Assalamu Alaikum! কয়েক মিনিটের এই হৃদয়স্পর্শী কাহিনীটিতে লুকানো আছে বড় একটি শিক্ষা।",
  };
}

/* ---------------- content selection ---------------- */
async function pickContent(
  svc: ReturnType<typeof createClient>,
  opts: { eventType: string | null; content_type: string | null; content_id: string | null }
): Promise<{ type: "dua" | "story"; title: string; slug: string; path: string } | null> {
  if (opts.content_id) {
    const { data } = await svc
      .from("admin_content")
      .select("id, title, title_en, slug, content_type")
      .eq("id", opts.content_id)
      .maybeSingle();
    if (!data) return null;
    return {
      type: String(data.content_type) === "dua" ? "dua" : "story",
      title: String(data.title || data.title_en || ""),
      slug: String(data.slug || ""),
      path: String(data.content_type) === "dua" ? `/dua/${data.slug}` : `/stories/${data.slug}`,
    };
  }
  const preferDua =
    opts.eventType === "sleep" ||
    opts.eventType === "morning" ||
    opts.eventType === "evening" ||
    opts.eventType === "ramadan_sehri" ||
    opts.eventType === "ramadan_iftar";
  const ct = opts.content_type ?? (preferDua ? "dua" : "story");
  const type = ct === "dua" ? "dua" : "story";

  // Avoid repetition: Don't pick content sent in the last 7 days
  const recent = await svc
    .from("scheduler_notification_runs")
    .select("content_id")
    .gte("run_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
    .eq("content_type", type)
    .limit(100);
  const recentIds = new Set(((recent.data as unknown[]) || []).map((r: any) => r.content_id));

  // Time-relevance: Filter by category if event type matches
  let query = svc
    .from("admin_content")
    .select("id, title, title_en, slug, content_type, category")
    .eq("content_type", type)
    .eq("status", "published");

  if (type === "dua") {
    if (opts.eventType === "morning") {
      query = query.ilike("category", "%morning%");
    } else if (opts.eventType === "evening") {
      query = query.ilike("category", "%evening%");
    } else if (opts.eventType === "sleep") {
      query = query.ilike("category", "%sleep%");
    } else if (opts.eventType === "jumuah") {
      query = query.ilike("category", "%jumuah%");
    }
  }

  const { data, error } = await query.order("random()").limit(20);
  
  if (error || !data?.length) {
    // Fallback: If no category-specific content found, try generic published content of that type
    const fallback = await svc
      .from("admin_content")
      .select("id, title, title_en, slug, content_type")
      .eq("content_type", type)
      .eq("status", "published")
      .order("random()")
      .limit(20);
    
    if (!fallback.data?.length) return null;
    
    const fresh = fallback.data.filter((d: any) => !recentIds.has(d.id));
    const pick = fresh[0] ?? fallback.data[0];
    return {
      type,
      title: String(pick.title || pick.title_en || ""),
      slug: String(pick.slug || ""),
      path: type === "dua" ? `/dua/${pick.slug}` : `/stories/${pick.slug}`,
    };
  }

  const fresh = data.filter((d: any) => !recentIds.has(d.id));
  const pick = fresh[0] ?? data[0];

  return {
    type,
    title: String(pick.title || pick.title_en || ""),
    slug: String(pick.slug || ""),
    path: type === "dua" ? `/dua/${pick.slug}` : `/stories/${pick.slug}`,
  };
}

/* ---------------- web push delivery ---------------- */
async function deliver(
  svc: ReturnType<typeof createClient>,
  opts: { title: string; body: string; imageUrl: string | null; deepLink: string | null; target: string; iconUrl: string; badgeUrl: string }
): Promise<{ total: number; sent: number; failed: number }> {
  const hasFcm = !!FCM_JSON;
  const allowed = opts.target === "web"
    ? ["web"]
    : opts.target === "android"
      ? (hasFcm ? ["android"] : ["web"])
      : (hasFcm ? ["android", "web"] : ["web"]);

  const { data: tokens, error } = await svc
    .from("device_push_tokens")
    .select("id, token, platform")
    .eq("enabled", true)
    .in("platform", allowed)
    .limit(5000);
  if (error || !tokens?.length) return { total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const t of tokens) {
    const plat = String(t.platform);
    try {
      if (plat === "web") {
        const subscriptionJson = typeof t.token === "string" ? t.token : JSON.stringify(t.token);
        const res = await webpush.sendNotification(
          JSON.parse(subscriptionJson),
          JSON.stringify({
            title: opts.title,
            body: opts.body,
            icon: opts.iconUrl,
            badge: opts.badgeUrl,
            image_url: opts.imageUrl,
            deep_link: opts.deepLink,
          }),
          { TTL: 86400, urgency: "normal" } as any,
        );
        const status = (res as unknown as { statusCode?: number }).statusCode ?? 201;
        if (status >= 200 && status < 300) {
          sent++;
        } else {
          failed++;
          if (status === 404 || status === 410 || status === 401 || status === 403) {
            await svc.from("device_push_tokens").update({ enabled: false }).eq("id", t.id);
          }
        }
      } else {
        // android via FCM (only when credentials exist)
        const tokenRow = JSON.parse(String(t.token || "{}"));
        const deviceToken = tokenRow.token || tokenRow.fcm_token || String(t.token);
        const sa = JSON.parse(FCM_JSON);
        const projectId = sa.project_id;
        
        const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await fcmAccessToken()}`,
          },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              notification: { 
                title: opts.title, 
                body: opts.body,
                ...(opts.imageUrl ? { image: opts.imageUrl } : {}),
              },
              data: {
                title: opts.title,
                body: opts.body,
                ...(opts.imageUrl ? { image_url: opts.imageUrl } : {}),
                ...(opts.deepLink ? { deep_link: opts.deepLink } : {}),
                icon_url: opts.iconUrl,
                badge_url: opts.badgeUrl,
              },
              android: { 
                priority: "high",
                notification: {
                  // FCM Android uses a drawable resource name, not a remote URL.
                  // The web/PWA path receives the remote icon and badge in data below.
                  icon: "ic_notification_icon",
                  color: "#0d9f6e",
                  sound: "default",
                }
              },
            },
          }),
        });
        
        if (!fcmRes.ok) {
          const errorText = await fcmRes.text();
          throw new Error(`FCM error ${fcmRes.status}: ${errorText}`);
        }
        
        sent++;
      }
    } catch (e) {
      failed++;
      console.error("[scheduler] send failed", { tokenId: t.id, platform: plat, err: e instanceof Error ? e.message : String(e) });
    }
  }
  return { total: tokens.length, sent, failed };
}

/* ---------------- FCM access token ---------------- */
let cachedToken: { token: string; expires: number } | null = null;
async function fcmAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.token;
  const sa = JSON.parse(FCM_JSON);
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=+$/, "");
  const claims = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).replace(/=+$/, "");
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await crypto.subtle.importKey("pkcs8", pemToBuffer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(`${jwtHeader}.${claims}`),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${jwtHeader}.${claims}.${signature}`,
    }),
  });
  const j = await r.json();
  cachedToken = { token: j.access_token, expires: now * 1000 + 3600_000 };
  return j.access_token;
}
function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* ---------------- single schedule dispatch ---------------- */
async function dispatchSchedule(svc: ReturnType<typeof createClient>, id: string): Promise<{ ok: boolean; total: number; sent: number; failed: number; copy: { title: string; body: string } }> {
  const { data: sched } = await svc.from("scheduler_schedules").select("*").eq("id", id).maybeSingle();
  if (!sched) return { ok: false, total: 0, sent: 0, failed: 0, copy: { title: "", body: "" } };
  const s = sched as unknown as Schedule;

  const eventType =
    s.islamic_event === "jumuah" ? "jumuah"
    : s.islamic_event === "ramadan_sehri" ? "ramadan_sehri"
    : s.islamic_event === "ramadan_iftar" ? "ramadan_iftar"
    : s.islamic_event === "eid_ul_fitr" || s.islamic_event === "eid_ul_adha" ? "eid"
    : s.name.toLowerCase().includes("sleep") || s.name.toLowerCase().includes("রাতের") ? "sleep"
    : s.name.toLowerCase().includes("সোকাল") || s.name.toLowerCase().includes("morning") ? "morning"
    : s.name.toLowerCase().includes("সন্ধ্যা") || s.name.toLowerCase().includes("evening") ? "evening"
    : s.name.toLowerCase().includes("রোজা") || s.name.toLowerCase().includes("fast") ? "fast_reminder"
    : null;

  const content = s.content_auto ? await pickContent(svc, { eventType, content_type: s.content_type, content_id: s.content_id }) : null;
  let copy = s.title_override && s.body_override
    ? { title: s.title_override, body: s.body_override }
    : generateCopy(eventType, content?.title ?? null);
  copy = { title: clampTitle(copy.title), body: clampBody(copy.body) };

  // resolve thumbnail
  let imageUrl: string | null = null;
  let deepLink: string | null = null;
  if (content) {
    const { data: og } = await svc
      .from("admin_content")
      .select("og_image_data, image_url")
      .eq("slug", content.slug)
      .maybeSingle();
    const rec = og as unknown as { og_image_data?: { og_image_url?: string }; image_url?: string };
    imageUrl = rec?.og_image_data?.og_image_url || rec?.image_url || null;
    deepLink = content.path;
  }

  const startedAt = new Date().toISOString();
  const assets = await getNotificationAssets(svc);
  const { total, sent, failed } = await deliver(svc, { ...copy, imageUrl, deepLink, target: s.target, iconUrl: assets.icon, badgeUrl: assets.badge });
  await svc.from("scheduler_notification_runs").insert({
    schedule_id: s.id,
    schedule_name: s.name,
    content_type: content?.type ?? null,
    content_id: content?.slug ?? null,
    content_title: content?.title ?? null,
    recipients_total: total,
    recipients_sent: sent,
    recipients_failed: failed,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
  await svc.from("scheduler_schedules").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
  return { ok: true, total, sent, failed, copy };
}

/* ---------------- main handler ---------------- */
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Single schedule: admin test / preview
    if (typeof body.schedule_id === "string" && body.schedule_id) {
      const result = await dispatchSchedule(svc, body.schedule_id as string);
      return jsonResponse(result);
    }

    // Bulk: pg_cron dispatch
    const nowIso = new Date().toISOString();
    const { data: due, error: dueErr } = await svc
      .from("scheduler_schedules")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", nowIso)
      .limit(20);
    if (dueErr) return jsonResponse({ ok: false, error: dueErr.message }, 500);

    const results: { id: string; name: string; total?: number; sent?: number; failed?: number }[] = [];
    for (const row of due ?? []) {
      const s = row as unknown as Schedule;
      try {
        const r = await dispatchSchedule(svc, s.id);
        results.push({ id: s.id, name: s.name, total: r.total, sent: r.sent, failed: r.failed });
      } catch (e) {
        console.error("[scheduler] dispatch failed", { id: s.id, err: e instanceof Error ? e.message : String(e) });
        results.push({ id: s.id, name: s.name });
      }
      // advance next_run_at so this minute is not re-fired
      const { data: next } = await svc.rpc("scheduler_compute_next_run", { s: s as never, from_tz: s.tz } as never);
      await svc.from("scheduler_schedules").update({ next_run_at: next ?? null }).eq("id", s.id);
    }

    return jsonResponse({ ok: true, dispatched: results.length, results });
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
