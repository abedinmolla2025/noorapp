import { useState, useEffect } from "react";
import { claimCustomPrompt, releaseCustomPrompt } from "@/lib/permissionCoordinator";

const CONSENT_KEY = "noor_cookie_consent";

type ConsentState = { ad: "granted" | "denied"; an: "granted" | "denied" };

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

function pushConsent(state: ConsentState) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("consent", "update", {
      ad_storage: state.ad,
      ad_user_data: state.ad,
      ad_personalization: state.ad,
      analytics_storage: state.an,
    });
  } catch {
    /* noop */
  }
}

function persist(state: ConsentState | "accepted" | "rejected") {
  const value = typeof state === "string" ? state : JSON.stringify(state);
  localStorage.setItem(CONSENT_KEY, value);
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [adsAllowed, setAdsAllowed] = useState(true);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(true);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      const showWhenAvailable = () => {
        if (claimCustomPrompt("cookie")) setVisible(true);
      };
      const timer = window.setTimeout(showWhenAvailable, 2000);
      const retry = window.setInterval(() => {
        if (visible) return;
        showWhenAvailable();
        if (sessionStorage.getItem("noor_active_custom_prompt") === "cookie") {
          window.clearInterval(retry);
        }
      }, 1000);
      return () => {
        window.clearTimeout(timer);
        window.clearInterval(retry);
      };
    }
  }, [visible]);

  const accept = () => {
    persist("accepted");
    pushConsent({ ad: "granted", an: "granted" });
    releaseCustomPrompt("cookie");
    setVisible(false);
  };

  const reject = () => {
    persist("rejected");
    pushConsent({ ad: "denied", an: "denied" });
    releaseCustomPrompt("cookie");
    setVisible(false);
  };

  const savePrefs = () => {
    const state: ConsentState = {
      ad: adsAllowed ? "granted" : "denied",
      an: analyticsAllowed ? "granted" : "denied",
    };
    persist(state);
    pushConsent(state);
    releaseCustomPrompt("cookie");
    setVisible(false);
    setShowPrefs(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-[100] px-3 pb-2 animate-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-lg mx-auto bg-card border border-border/80 rounded-2xl shadow-lg p-4 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          We use cookies and similar technologies for essential functionality, analytics,
          and to show personalized ads via Google AdSense and its partners. You can accept all,
          reject non-essential, or manage your preferences. Read our{" "}
          <a href="/privacy-policy" className="text-primary underline">
            Privacy Policy
          </a>
          .
          <br />
          <span className="font-bangla">
            আমরা প্রয়োজনীয় ফাংশনালিটি, অ্যানালিটিক্স ও Google AdSense-এর মাধ্যমে প্রাসঙ্গিক
            বিজ্ঞাপন দেখাতে কুকিজ ব্যবহার করি। আপনি সম্মত বা প্রত্যাখ্যান করতে পারেন।
          </span>
        </p>

        {showPrefs && (
          <div className="flex flex-col gap-2 bg-muted/40 rounded-xl p-3 text-xs">
            <label className="flex items-center justify-between gap-2">
              <span className="text-foreground">Personalized ads (AdSense)</span>
              <input
                type="checkbox"
                checked={adsAllowed}
                onChange={(e) => setAdsAllowed(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-foreground">Analytics cookies</span>
              <input
                type="checkbox"
                checked={analyticsAllowed}
                onChange={(e) => setAnalyticsAllowed(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <p className="text-[10px] text-muted-foreground">
              Essential cookies are always on — they're required for the app to work.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {showPrefs ? (
            <button
              onClick={savePrefs}
              className="flex-1 bg-primary text-primary-foreground text-xs font-semibold rounded-xl py-2 px-3 hover:bg-primary/90 transition-colors"
            >
              Save preferences
            </button>
          ) : (
            <>
              <button
                onClick={accept}
                className="flex-1 bg-primary text-primary-foreground text-xs font-semibold rounded-xl py-2 px-3 hover:bg-primary/90 transition-colors"
              >
                Accept all
              </button>
              <button
                onClick={reject}
                className="flex-1 bg-muted text-foreground text-xs font-semibold rounded-xl py-2 px-3 hover:bg-muted/80 border border-border transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => setShowPrefs(true)}
                className="text-xs text-muted-foreground underline px-2 self-center"
              >
                Manage
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
