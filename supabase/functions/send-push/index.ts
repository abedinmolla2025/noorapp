/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ApplicationServer,
  importVapidKeys,
} from "jsr:@negrel/webpush@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_NOTIFICATION_ICON = "https://www.noorapp.in/notification-icon.png";
const DEFAULT_NOTIFICATION_BADGE = "https://www.noorapp.in/badge-icon.png";

type SendPushRequest = {
  notificationId: string;
  platform?: "all" | "android" | "ios" | "web";
  deviceId?: string;
  tokenId?: string;
  dryRun?: boolean;
};

type DeliveryLogInsert = {
  notification_id: string;
  token_id: string;
  platform: string;
  status: "sent" | "failed";
  provider_message_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  subscription_endpoint?: string | null;
  endpoint_host?: string | null;
  browser?: string | null;
  stage?: string | null;
};

function isValidIdLike(input: unknown, min: number, max: number): input is string {
  if (typeof input !== "string") return false;
  return input.trim().length >= min && input.trim().length <= max;
}

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getHostFromUrl(url: string | null | undefined) {
  if (!url) return null;
  try { return new URL(url).host; } catch { return null; }
}

function guessBrowserFromEndpointHost(host: string | null) {
  const h = (host ?? "").toLowerCase();
  if (!h) return null;
  if (h.includes("google") || h.includes("fcm") || h.includes("gstatic")) return "chrome";
  if (h.includes("mozilla") || h.includes("push.services.mozilla")) return "firefox";
  if (h.includes("windows") || h.includes("wns")) return "edge";
  if (h.includes("apple")) return "safari";
  return null;
}

async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts?: { retries?: number; baseDelayMs?: number }) {
  const retries = Math.max(0, opts?.retries ?? 2);
  const baseDelayMs = Math.max(50, opts?.baseDelayMs ?? 400);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(attempt); } catch (e) {
      lastErr = e;
      if (attempt >= retries) break;
      await sleep(baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 150));
    }
  }
  throw lastErr;
}

// --------------- Base64URL helpers ---------------

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Convert raw base64url VAPID keys to JWK format for importVapidKeys
function rawKeysToJwk(publicKeyB64: string, privateKeyB64: string): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  const pubBytes = base64UrlDecode(publicKeyB64);
  const privBytes = base64UrlDecode(privateKeyB64);

  // Public key is 65 bytes uncompressed: 0x04 + x(32) + y(32)
  const x = base64UrlEncode(pubBytes.slice(1, 33));
  const y = base64UrlEncode(pubBytes.slice(33, 65));
  const d = base64UrlEncode(privBytes);

  const publicKey: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    ext: true,
  };

  const privateKey: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d,
    ext: true,
  };

  return { publicKey, privateKey };
}

// --------------- Web Push via @negrel/webpush ---------------

// Cache the ApplicationServer instance
let cachedAppServer: InstanceType<typeof ApplicationServer> | null = null;

async function getAppServer(): Promise<InstanceType<typeof ApplicationServer>> {
  if (cachedAppServer) return cachedAppServer;

  const publicKeyB64 = (Deno.env.get("WEBPUSH_VAPID_PUBLIC_KEY") ?? "").trim();
  const privateKeyB64 = (Deno.env.get("WEBPUSH_VAPID_PRIVATE_KEY") ?? "").trim();
  const subject = (Deno.env.get("WEBPUSH_SUBJECT") ?? "").trim();

  if (!publicKeyB64 || !privateKeyB64 || !subject) {
    throw new Error("Missing WEBPUSH_VAPID_PUBLIC_KEY, WEBPUSH_VAPID_PRIVATE_KEY, or WEBPUSH_SUBJECT");
  }

  // Convert raw base64url keys to JWK format for importVapidKeys
  const jwk = rawKeysToJwk(publicKeyB64, privateKeyB64);

  // importVapidKeys expects { publicKey: JWK, privateKey: JWK } and returns CryptoKeyPair
  const vapidKeys = await importVapidKeys(jwk);

  // Use ApplicationServer.new() static factory (not constructor)
  cachedAppServer = await ApplicationServer.new({
    contactInformation: subject,
    vapidKeys,
  });

  return cachedAppServer;
}

async function sendWebPushMessage(opts: {
  subscriptionJson: string;
  title: string;
  body: string;
  imageUrl: string | null;
  deepLink: string | null;
  iconUrl: string | null;
  badgeUrl: string | null;
}) {
  const appServer = await getAppServer();
  const subscription = JSON.parse(opts.subscriptionJson);
  const subscriber = appServer.subscribe(subscription);

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    icon: opts.iconUrl || DEFAULT_NOTIFICATION_ICON,
    badge: opts.badgeUrl || DEFAULT_NOTIFICATION_BADGE,
    image_url: opts.imageUrl,
    deep_link: opts.deepLink,
  });

  console.log("[webpush] Sending to endpoint:", subscription?.endpoint ?? "unknown");

  try {
    const res = await subscriber.pushTextMessage(payload, {});

    // v0.5.0 may return void on success or a Response object
    if (res && typeof res === "object" && "ok" in res) {
      const response = res as Response;
      const responseBody = await response.text().catch(() => "");

      if (!response.ok) {
        console.error("[webpush] Push failed", {
          status: response.status,
          statusText: response.statusText,
          endpoint: subscription?.endpoint,
          responseBody,
        });
        throw new Error(`webpush_failed_${response.status}: ${responseBody}`);
      }

      console.log("[webpush] Push succeeded", { status: response.status, endpoint: subscription?.endpoint });
      return `webpush_${response.status}`;
    }

    // pushTextMessage returned void — treat as success
    console.log("[webpush] Push succeeded (void return)", { endpoint: subscription?.endpoint });
    return "webpush_ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[webpush] pushTextMessage threw:", msg);
    throw new Error(`webpush_send_error: ${msg}`);
  }
}

// --------------- FCM (Android/iOS) via Firebase v1 API ---------------

let cachedFcmToken: { token: string; expires: number } | null = null;

async function getFcmAccessToken(): Promise<string> {
  if (cachedFcmToken && Date.now() < cachedFcmToken.expires - 60_000) {
    return cachedFcmToken.token;
  }

  const fcmJson = (Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "").trim();
  if (!fcmJson) throw new Error("Missing FCM_SERVICE_ACCOUNT_JSON");

  const sa = JSON.parse(fcmJson);
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
    await crypto.subtle.importKey(
      "pkcs8", 
      pemToBuffer(sa.private_key), 
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, 
      false, 
      ["sign"]
    ),
    new TextEncoder().encode(`${jwtHeader}.${claims}`),
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${jwtHeader}.${claims}.${signature}`,
    }),
  });

  const j = await r.json();
  if (!j.access_token) throw new Error(`FCM token fetch failed: ${JSON.stringify(j)}`);
  
  cachedFcmToken = { token: j.access_token, expires: now * 1000 + 3600_000 };
  return j.access_token;
}

function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function sendFcmMessage(opts: {
  deviceToken: string;
  title: string;
  body: string;
  imageUrl: string | null;
  deepLink: string | null;
}) {
  const accessToken = await getFcmAccessToken();
  const fcmJson = (Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "").trim();
  const sa = JSON.parse(fcmJson);
  const projectId = sa.project_id;

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: opts.deviceToken,
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
          icon_url: DEFAULT_NOTIFICATION_ICON,
          badge_url: DEFAULT_NOTIFICATION_BADGE,
        },
        android: {
          priority: "high",
          notification: {
            icon: "ic_notification_icon",
            color: "#0d9f6e",
            sound: "default",
          }
        }
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("[fcm] Send failed", { status: res.status, errorBody });
    throw new Error(`fcm_failed_${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  console.log("[fcm] Send succeeded", { messageId: data.name });
  return data.name;
}

// --------------- Main handler ---------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rawBody = await req.text().catch(() => "");
    const body: any = rawBody
      ? (() => { try { return JSON.parse(rawBody); } catch { return null; } })()
      : {};

    // Health check
    if (body && typeof body === "object" && body.action === "health") {
      return json(200, { ok: true });
    }
    if (body === null) return json(400, { error: "Invalid JSON" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const { notificationId, platform, dryRun, deviceId, tokenId } = body as SendPushRequest;
    if (!notificationId || typeof notificationId !== "string") {
      return json(400, { error: "notificationId is required" });
    }
    if (deviceId !== undefined && !isValidIdLike(deviceId, 8, 128)) return json(400, { error: "Invalid deviceId" });
    if (tokenId !== undefined && !isValidIdLike(tokenId, 8, 128)) return json(400, { error: "Invalid tokenId" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const jwt = authHeader.slice("Bearer ".length);
    const { data: claims, error: claimsErr } = await authed.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });

    const userId = claims.claims.sub as string;
    const { data: isAdmin, error: isAdminErr } = await authed.rpc("is_admin", { _user_id: userId });
    if (isAdminErr || !isAdmin) return json(403, { error: "Forbidden" });

    const svc = createClient(supabaseUrl, serviceKey);

    const { data: rawNotif, error: notifErr } = await svc
      .from("admin_notifications")
      .select("id,title,message,image_url,deep_link,target_platform,status,icon_url,badge_url")
      .eq("id", notificationId)
      .maybeSingle();
    if (notifErr || !rawNotif) return json(404, { error: "Notification not found" });

    // Fetch global notification defaults from app_settings
    const { data: notifSettings } = await svc
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "notifications")
      .maybeSingle();
    const defaults = notifSettings?.setting_value as any ?? {};

    const notif = {
      ...rawNotif,
      body: rawNotif.message,
      icon_url: (rawNotif as any).icon_url || defaults.defaultIconUrl || null,
      badge_url: (rawNotif as any).badge_url || defaults.defaultBadgeUrl || null,
    } as any;

    // Determine platforms — default to web only (no FCM dependency)
    const effectiveTarget = platform ?? (notif.target_platform as any) ?? "all";
    const hasFcm = !!(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "").trim();

    const allowedPlatforms = ((): Array<"android" | "ios" | "web"> => {
      if (effectiveTarget === "web") return ["web"];
      if (!hasFcm) {
        console.log("FCM not configured, skipping native push — web only");
        return ["web"];
      }
      if (effectiveTarget === "android") return ["android"];
      if (effectiveTarget === "ios") return ["ios"];
      return ["android", "ios", "web"];
    })();

    let tokensQuery = svc
      .from("device_push_tokens")
      .select("id,token,platform")
      .eq("enabled", true)
      .in("platform", allowedPlatforms);
    if (deviceId) tokensQuery = tokensQuery.eq("device_id", deviceId);
    if (tokenId) tokensQuery = tokensQuery.eq("id", tokenId);

    const { data: tokens, error: tokensErr } = await tokensQuery;
    if (tokensErr) {
      console.error("token fetch error", tokensErr);
      return json(500, { error: "Failed to fetch tokens" });
    }

    if (dryRun) {
      return json(200, {
        ok: true, dryRun: true, notificationId,
        target_platform: effectiveTarget,
        targets: tokens?.length ?? 0,
      });
    }

    let sent = 0;
    let failed = 0;
    const perPlatform: Record<string, { sent: number; failed: number }> = {
      android: { sent: 0, failed: 0 },
      ios: { sent: 0, failed: 0 },
      web: { sent: 0, failed: 0 },
    };

    const logDelivery = async (row: DeliveryLogInsert) => {
      const { error } = await svc.from("notification_deliveries").insert(row as any);
      if (error) console.warn("delivery log insert failed", error);
    };

    const disableToken = async (tid: string) => {
      await svc.from("device_push_tokens").update({ enabled: false }).eq("id", tid);
    };

    for (const t of tokens ?? []) {
      const plat = String(t.platform) as "android" | "ios" | "web";
      const tokenIdStr = String(t.id);
      const baseLog: Omit<DeliveryLogInsert, "status"> = {
        notification_id: notif.id,
        token_id: tokenIdStr,
        platform: plat,
      };

      try {
        let providerMessageId: string | null = null;
        let endpoint: string | null = null;
        let endpointHost: string | null = null;
        let browser: string | null = null;

        if (plat === "web") {
          try {
            const sub = JSON.parse(String(t.token));
            endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : null;
            endpointHost = getHostFromUrl(endpoint);
          } catch { /* ignore */ }
          browser = guessBrowserFromEndpointHost(endpointHost);

          providerMessageId = await withRetry(async () => {
            return await sendWebPushMessage({
              subscriptionJson: String(t.token),
              title: notif.title,
              body: notif.body,
              imageUrl: notif.image_url ?? null,
              deepLink: notif.deep_link ?? null,
              iconUrl: notif.icon_url ?? null,
              badgeUrl: notif.badge_url ?? null,
            });
          }, { retries: 2, baseDelayMs: 450 });
        } else {
          // android/ios via FCM
          providerMessageId = await withRetry(async () => {
            return await sendFcmMessage({
              deviceToken: String(t.token),
              title: notif.title,
              body: notif.body,
              imageUrl: notif.image_url ?? null,
              deepLink: notif.deep_link ?? null,
            });
          }, { retries: 2, baseDelayMs: 450 });
        }

        await logDelivery({
          ...baseLog,
          status: "sent",
          provider_message_id: providerMessageId,
          subscription_endpoint: endpoint,
          endpoint_host: endpointHost,
          browser,
          stage: plat === "web" ? "webpush_send" : "fcm_send",
        });

        sent++;
        perPlatform[plat].sent++;
      } catch (e) {
        failed++;
        perPlatform[plat].failed++;

        const msg = e instanceof Error ? e.message : String(e);
        console.error("send failed", { token_id: t.id, platform: plat, msg });

        const errorCode = (() => {
          const m = msg.toLowerCase();
          const match = m.match(/(\d{3})/);
          if (match) return `http_${match[1]}`;
          if (m.includes("timeout")) return "timeout";
          return null;
        })();

        let endpoint: string | null = null;
        let endpointHost: string | null = null;
        let browser: string | null = null;
        if (plat === "web") {
          try {
            const sub = JSON.parse(String(t.token));
            endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : null;
            endpointHost = getHostFromUrl(endpoint);
            browser = guessBrowserFromEndpointHost(endpointHost);
          } catch { /* ignore */ }
        }

        if (
          errorCode === "http_404" ||
          errorCode === "http_410" ||
          errorCode === "http_401" ||
          errorCode === "http_403"
        ) {
          // 404/410: subscription gone. 401/403: subscription invalid (e.g. it was
          // created under a different VAPID key and can never be signed again).
          // Disable so we stop retrying dead endpoints forever; the browser will
          // re-register a fresh subscription under the current key on its next
          // visit (the registration hook detects the VAPID key hash change).
          await disableToken(tokenIdStr);
        }

        await logDelivery({
          ...baseLog,
          status: "failed",
          error_code: errorCode,
          error_message: msg,
          subscription_endpoint: endpoint,
          endpoint_host: endpointHost,
          browser,
          stage: "webpush_send",
        });
      }
    }

    const finalStatus = failed > 0 && sent === 0 ? "failed" : "sent";
    await svc.from("admin_notifications")
      .update({ status: finalStatus, sent_at: new Date().toISOString() })
      .eq("id", notif.id);

    return json(200, {
      ok: true, notificationId: notif.id, status: finalStatus,
      totals: { sent, failed, targets: tokens?.length ?? 0 },
      perPlatform,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-push error", msg);
    return json(500, { error: msg });
  }
});
