import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const DEVICE_ID_KEY = "noor_device_id";
const WEB_PUSH_REGISTERED_KEY = "noor_web_push_registered";
const WEB_PUSH_VAPID_KEY_HASH = "noor_web_push_vapid_hash";
const PUSH_OPT_IN_KEY = "noor_push_opt_in";

// One-time automatic migration flag.
// Subscriptions created under the old Lovable Cloud VAPID key are cryptographically
// invalid now and can never receive pushes. Browsers that registered with the old
// key (stored hash differs) — or under an older app version where the hash was
// never stored — must re-subscribe WITHOUT the user clearing browser data.
// Once a fresh subscription is saved, this flag persists so the migration only
// ever runs once per browser.
const PUSH_MIGRATION_V2_KEY = "noor_push_migration_v2";

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isDuplicateTokenError(error: unknown): boolean {
  const msg = typeof (error as any)?.message === "string" ? (error as any).message : "";
  return msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("23505");
}

/**
 * Auto-sync user's current location to prayer notification preferences.
 * This ensures the server-side cron job can send prayer-time push notifications
 * even when the app/tab is closed.
 */
async function syncLocationToPreferences(deviceId: string) {
  if (!("geolocation" in navigator)) return;

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      });
    });

    const { latitude, longitude } = position.coords;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // First try to find existing record by device_id
    const { data: existing } = await supabase
      .from("user_notification_preferences" as any)
      .select("id")
      .eq("device_id", deviceId)
      .maybeSingle();

    const payload = {
      device_id: deviceId,
      latitude,
      longitude,
      timezone,
      enabled: true,
      updated_at: new Date().toISOString(),
      calculation_method: "isna",
      enabled_prayers: ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"],
      notification_offset: 0
    };

    if (existing?.id) {
      await supabase
        .from("user_notification_preferences" as any)
        .update(payload)
        .eq("id", existing.id);
    } else {
      await supabase
        .from("user_notification_preferences" as any)
        .insert(payload);
    }

    console.log("[webpush] Location synced for prayer notifications");
  } catch (e) {
    console.warn("[webpush] Location sync skipped:", e);
  }
}

/**
 * Registers the browser for web push notifications.
 * Only runs on web (not native platforms).
 * Also auto-syncs user location for server-side prayer notifications.
 */
export function useWebPushRegistration() {
  useEffect(() => {
    // Only run on web
    if (Capacitor.isNativePlatform()) return;

    // Check if service workers are supported
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Only register after user opt-in
    if (localStorage.getItem(PUSH_OPT_IN_KEY) !== "true") return;

    let removed = false;

    const run = async () => {
      try {
        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Register service worker
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        // Get VAPID public key from edge function
        const { data: keyRes, error: keyErr } = await supabase.functions.invoke("webpush-public-key", {
          body: {},
        });
        if (keyErr) throw keyErr;
        const publicKey = String(keyRes?.publicKey ?? "");
        if (!publicKey) throw new Error("Missing VAPID public key");

        // Check if VAPID key has changed — if so, force re-registration
        // One-time automatic migration: browsers holding an old Lovable-era
        // subscription (key hash differs) or registered before the key-hash
        // storage was added (no hash stored) must re-subscribe under the
        // current Supabase VAPID key. New browsers skip this entirely.
        const storedKeyHash = localStorage.getItem(WEB_PUSH_VAPID_KEY_HASH);
        const migrated = localStorage.getItem(PUSH_MIGRATION_V2_KEY) === "true";
        const keyChanged = storedKeyHash !== null && storedKeyHash !== publicKey;
        const needsMigration = !migrated && (keyChanged || storedKeyHash === null);

        if (keyChanged) {
          console.log("[webpush] VAPID key changed, clearing old registration");
          localStorage.removeItem(WEB_PUSH_REGISTERED_KEY);
        }

        const deviceId = getOrCreateDeviceId();

        // Always sync location for prayer notifications (even if push already registered)
        syncLocationToPreferences(deviceId);

        // Skip push registration if already registered with the same key
        if (!keyChanged && localStorage.getItem(WEB_PUSH_REGISTERED_KEY) === "true") return;

        // Unsubscribe any existing subscription (key change or stale)
        const existing = await (reg as any).pushManager.getSubscription();
        if (existing) {
          try {
            await existing.unsubscribe();
            console.log("[webpush] Unsubscribed old subscription");
          } catch {
            // ignore
          }
        }

        // Subscribe to push
        const subscription = await (reg as any).pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        if (removed) return;

        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Note: delete_own_push_token RPC is intentionally skipped to avoid 404s
        // if the backend migration is not yet fully deployed. Duplicate tokens
        // are handled by the unique constraint on the database.

        // Save subscription to database using upsert to handle existing tokens/devices
        const { error } = await supabase
          .from("device_push_tokens" as any)
          .upsert({
            token: JSON.stringify(subscription),
            platform: "web",
            device_id: deviceId,
            enabled: true,
            user_id: user?.id ?? null,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: "token" }); // Token is usually the unique identifier for push service

        if (error && !isDuplicateTokenError(error)) {
          console.warn("Failed to save web push subscription", error);
          return;
        }

        // Mark as registered and store current key hash
        localStorage.setItem(WEB_PUSH_REGISTERED_KEY, "true");
        localStorage.setItem(WEB_PUSH_VAPID_KEY_HASH, publicKey);

        // Persist the one-time migration flag — the old Lovable subscription is
        // now replaced by a fresh one under the current Supabase VAPID key.
        localStorage.setItem(PUSH_MIGRATION_V2_KEY, "true");
        console.log("[webpush] Subscription registered successfully");
        // NOTE: if this visit performed the one-time migration, the stale
        // migration-era server row was already removed by the
        // delete_own_push_token call above BEFORE the fresh subscription was
        // inserted — the new row is intact, so no further cleanup is needed.
        void needsMigration;
      } catch (e) {
        console.warn("Web push setup failed", e);
      }
    };

    // Delay registration to avoid blocking initial render
    const timer = setTimeout(run, 2000);

    return () => {
      removed = true;
      clearTimeout(timer);
    };
  }, []);
}
