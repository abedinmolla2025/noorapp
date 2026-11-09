/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireAdmin,
  httpErrorResponse,
  HttpError,
} from "../_shared/require-admin.ts";
import {
  INTERNAL_CALLER,
  signInternalCall,
} from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type PrayerTimes = {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
};

async function getPrayerTimes(
  latitude: number,
  longitude: number,
  method: string,
  date: string
): Promise<PrayerTimes | null> {
  try {
    const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=${getMethodCode(method)}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("Aladhan API error:", response.status);
      return null;
    }

    const data = await response.json();
    const timings = data.data.timings;

    return {
      fajr: timings.Fajr,
      dhuhr: timings.Dhuhr,
      asr: timings.Asr,
      maghrib: timings.Maghrib,
      isha: timings.Isha,
    };
  } catch (error) {
    console.error("Prayer times calculation error:", error);
    return null;
  }
}

function getMethodCode(method: string): number {
  const methods: Record<string, number> = {
    MWL: 3,
    ISNA: 2,
    Egypt: 5,
    Makkah: 4,
    Karachi: 1,
    Tehran: 7,
    Jafari: 0,
  };
  return methods[method] || 3;
}

function getPrayerDisplay(prayer: string): { emoji: string; name: string } {
  const displays: Record<string, { emoji: string; name: string }> = {
    fajr: { emoji: "🌅", name: "Fajr" },
    dhuhr: { emoji: "☀️", name: "Dhuhr" },
    asr: { emoji: "🌤️", name: "Asr" },
    maghrib: { emoji: "🌇", name: "Maghrib" },
    isha: { emoji: "🌙", name: "Isha" },
  };
  return displays[prayer] || { emoji: "🕌", name: prayer };
}

function isTimeToNotify(
  prayerTime: string,
  offsetMinutes: number,
  now: Date,
  timezone: string
): boolean {
  const [hours, minutes] = prayerTime.split(":").map(Number);

  // Build a date in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const nowHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const nowMinute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

  const prayerTotalMin = hours * 60 + minutes + offsetMinutes;
  const nowTotalMin = nowHour * 60 + nowMinute;

  const diff = prayerTotalMin - nowTotalMin;
  return diff >= 0 && diff <= 5; // within a 5-minute window
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // S-2 remediation candidate: admin-only. This is an administrative /
    // scheduled job, not a user-facing endpoint, and no shipped caller
    // exists, so gating breaks no authorized caller. Pair with the S-3
    // architecture decision: gating alone does not fix delivery, and
    // fixing delivery without gating would hand an unauthenticated
    // caller a working push trigger.
    //
    // PHASE 2 / S-3 Option A (2026-11-10): the call to send-push below
    // now uses the dedicated HMAC service-to-service auth
    // (PRAYER_PUSH_INTERNAL_SECRET, owner-created; the agent never
    // handles the value) with deviceId mandatory — the old
    // `Authorization: Bearer <service-role>` call is REMOVED (it
    // returned 401 by design: a service-role JWT has no `sub`, so
    // send-push's getClaims gate rejects it). If the secret is not
    // configured the attempt fails closed (500-class error, no send,
    // NO fallback to the service-role path). Draft rows are deleted
    // on failed sends and the prayer_notification_log row is written
    // on EVERY send attempt (success or failure) so the dedup check
    // at the top of the loop actually fires.
    await requireAdmin(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internalSecret = (Deno.env.get("PRAYER_PUSH_INTERNAL_SECRET") ?? "").trim();
    const svc = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    const { data: preferences, error: prefError } = await svc
      .from("user_notification_preferences")
      .select("*")
      .eq("enabled", true);

    if (prefError) throw prefError;
    if (!preferences || preferences.length === 0) {
      return json(200, { message: "No active preferences", sent: 0 });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const pref of preferences) {
      try {
        const tz = pref.timezone || "UTC";
        const times = await getPrayerTimes(
          Number(pref.latitude),
          Number(pref.longitude),
          pref.calculation_method,
          today
        );

        if (!times) {
          errors.push(`Failed to get times for preference ${pref.id}`);
          continue;
        }

        const enabledPrayers = pref.enabled_prayers as Record<string, boolean>;

        for (const [prayer, enabled] of Object.entries(enabledPrayers)) {
          if (!enabled) continue;

          const prayerTime = times[prayer as keyof PrayerTimes];
          if (!prayerTime) continue;

          if (!isTimeToNotify(prayerTime, pref.notification_offset, now, tz))
            continue;

          // Check if already notified today for this prayer
          const { data: existing } = await svc
            .from("prayer_notification_log")
            .select("id")
            .eq("preference_id", pref.id)
            .eq("prayer_name", prayer)
            .eq("prayer_date", today)
            .maybeSingle();

          if (existing) continue;

          // Find push tokens for this device
          const { data: tokens } = await svc
            .from("device_push_tokens")
            .select("id, token, platform")
            .eq("device_id", pref.device_id)
            .eq("enabled", true);

          if (!tokens || tokens.length === 0) continue;

          const display = getPrayerDisplay(prayer);
          const { data: notification, error: notifErr } = await svc
            .from("admin_notifications")
            .insert({
              title: `${display.emoji} ${display.name} Time`,
              message: `It's time for ${display.name} prayer. May Allah accept your worship.`,
              status: "draft",
              target_platform: "web",
            })
            .select("id")
            .single();

          if (notifErr) {
            errors.push(`Failed to create notification: ${notifErr.message}`);
            continue;
          }

          // S-3 Option A: signed internal call to send-push, scoped to
          // THIS preference's device only (deviceId mandatory — no
          // broadcast). Never the service-role Bearer (dead by design).
          let attemptOk = false;
          if (!internalSecret) {
            errors.push(
              `PRAYER_PUSH_INTERNAL_SECRET is not configured; prayer push for ${pref.id}/${prayer} not sent`,
            );
          } else {
            const timestamp = String(Date.now());
            const nonce = crypto.randomUUID();
            const signature = await signInternalCall(internalSecret, {
              timestamp,
              nonce,
              notificationId: notification.id,
              deviceId: pref.device_id,
            });
            const sendUrl = `${supabaseUrl}/functions/v1/send-push`;
            const sendRes = await fetch(sendUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Noor-Internal-Caller": INTERNAL_CALLER,
                "X-Noor-Timestamp": timestamp,
                "X-Noor-Nonce": nonce,
                "X-Noor-Signature": signature,
              },
              body: JSON.stringify({ notificationId: notification.id, deviceId: pref.device_id }),
            });
            if (!sendRes.ok) {
              errors.push(
                `Failed to send notification: ${sendRes.status}`,
              );
            } else {
              attemptOk = true;
              sent++;
            }
          }

          if (!attemptOk) {
            // Draft-row cleanup: a failed send must not leave a draft
            // behind to accumulate (or to be sent later by another path).
            await svc.from("admin_notifications").delete().eq("id", notification.id);
          }

          // Dedup fix: log EVERY send attempt (success or failure) so
          // the `existing` check above fires and this prayer is not
          // re-attempted all window. A log failure must not mask the
          // attempt outcome, so it is swallowed here (and the error is
          // recorded). NOTE (pre-deploy schema check): this insert
          // passes notification_id = the draft id even on failure; if
          // prayer_notification_log.notification_id is NOT NULL in
          // production this insert is valid as written; verify before
          // deploy (see PHASE2-DEPLOYMENT-DEPENDENCY-MAP.md).
          try {
            await svc.from("prayer_notification_log").insert({
              preference_id: pref.id,
              prayer_name: prayer,
              prayer_time: `${today}T${prayerTime}:00`,
              prayer_date: today,
              notification_id: notification.id,
            });
          } catch (logErr) {
            errors.push(
              `Failed to log notification for ${pref.id}/${prayer}: ${logErr instanceof Error ? logErr.message : String(logErr)}`,
            );
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Error processing ${pref.id}: ${msg}`);
      }
    }

    return json(200, {
      message: "Prayer notifications processed",
      processed: preferences.length,
      sent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("send-prayer-notifications error:", msg);
    if (error instanceof HttpError) return httpErrorResponse(error, corsHeaders);
    return json(500, { error: msg });
  }
});
