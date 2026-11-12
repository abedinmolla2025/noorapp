import { useEffect, useState } from "react";
import {
  getBrowserSubscriptionEndpoint,
  getDailyPreferenceStatus,
  postPreference,
  setDailyPreference,
  PreferenceError,
} from "@/lib/dailyContent/preferences";

const STORAGE_KEY = "noor_daily_content_enabled";

/**
 * Phase 3 — user-facing daily-content preference control.
 *
 * Rendered under the Daily Hadith card. It only appears when this browser
 * holds a push subscription (without one, no daily push can reach it, so
 * there is nothing to opt out of). The toggle POSTs the browser's own
 * subscription endpoint to the daily-content edge function, which resolves
 * it to device_ids server-side and writes the preference. The last choice
 * is remembered in this browser (localStorage); the server row is the
 * source of truth for sending. Phase 7: the initial state is read from
 * the server (action "status") so the switch shows the server's value;
 * the local value is only the fallback hint while that read is in flight
 * or fails.
 */
export function DailyNotificationToggle() {
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBrowserSubscriptionEndpoint().then((endpoint) => {
      if (cancelled) return;
      if (endpoint === null) {
        setHasSubscription(false);
        return;
      }
      setHasSubscription(true);
      // Phase 7 — the server row governs sending, so read it for the
      // initial state instead of trusting the local hint alone. On any
      // failure the local hint stays (the toggle still works; tapping
      // it posts the real preference and gets the real result). A 404
      // means the server has no token row for this subscription, so
      // the control hides — same as a missing subscription.
      const edgeUrl = import.meta.env.VITE_SUPABASE_URL
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-content`
        : null;
      if (!edgeUrl) return;
      void getDailyPreferenceStatus(
        { post: postPreference, getSubscriptionEndpoint: async () => endpoint },
        { edgeUrl },
      )
        .then(({ daily_enabled }) => {
          if (cancelled) return;
          setEnabled(daily_enabled);
          try {
            localStorage.setItem(STORAGE_KEY, String(daily_enabled));
          } catch {
            // Display hint only; the server row is already the truth.
          }
        })
        .catch((e) => {
          if (cancelled) return;
          if (e instanceof PreferenceError && e.code === "SUBSCRIPTION_NOT_FOUND") {
            setHasSubscription(false);
          }
          // Any other failure: keep the local hint.
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hasSubscription !== true) return null;

  const edgeUrl = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-content`
    : null;
  if (!edgeUrl) return null;

  const onToggle = async () => {
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      await setDailyPreference(
        { post: postPreference, getSubscriptionEndpoint: getBrowserSubscriptionEndpoint },
        { edgeUrl, enabled: next },
      );
      setEnabled(next);
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Display hint only; the server row is already saved.
      }
    } catch (e) {
      if (e instanceof PreferenceError && e.code === "SUBSCRIPTION_NOT_FOUND") {
        setHasSubscription(false);
      } else {
        setError("Could not save your preference. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
      <span>Daily Hadith notifications</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={() => void onToggle()}
        className="rounded-full border px-3 py-1 disabled:opacity-50"
      >
        {busy ? "Saving…" : enabled ? "On" : "Off"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
