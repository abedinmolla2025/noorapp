import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isBotUA, isHeadlessSignal } from "@/lib/botDetection";

const SESSION_KEY = "noor_visitor_session";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min sliding window

function getOrCreateSessionId(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; ts: number };
      if (Date.now() - parsed.ts < SESSION_TTL_MS) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, ts: Date.now() }));
        return parsed.id;
      }
    }
  } catch {
    /* ignore */
  }
  const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    /* ignore */
  }
  return id;
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

function detectOS(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

function detectDevice(ua: string): string {
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "mobile";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function classifyReferrer(ref: string): string {
  if (!ref) return "direct";
  try {
    const host = new URL(ref).hostname.toLowerCase();
    if (host.includes("google.")) return "google";
    if (host.includes("bing.")) return "bing";
    if (host.includes("duckduckgo.")) return "duckduckgo";
    if (host.includes("yahoo.")) return "yahoo";
    if (host.includes("facebook.") || host.includes("fb.")) return "facebook";
    if (host.includes("instagram.")) return "instagram";
    if (host.includes("twitter.") || host.includes("x.com") || host.includes("t.co")) return "twitter";
    if (host.includes("youtube.") || host.includes("youtu.be")) return "youtube";
    if (host.includes("whatsapp.")) return "whatsapp";
    if (host.includes("linkedin.")) return "linkedin";
    if (host === window.location.hostname) return "internal";
    return host;
  } catch {
    return "unknown";
  }
}

let geoCache: { country?: string; city?: string; region?: string } | null = null;

async function fetchGeo() {
  if (geoCache) return geoCache;
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) throw new Error("geo failed");
    const j = await res.json();
    geoCache = {
      country: j.country_name || j.country || undefined,
      city: j.city || undefined,
      region: j.region || undefined,
    };
  } catch {
    geoCache = {};
  }
  return geoCache;
}

export function usePageTracking() {
  const location = useLocation();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    const path = location.pathname + location.search;
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;

    // Skip admin pages from analytics
    if (location.pathname.startsWith("/admin")) return;

    const ua = navigator.userAgent || "";
    const ref = document.referrer || "";

    // F-BOT-1 (2026-11-03, local branch): skip known crawlers and automation
    // BEFORE any geo lookup, auth read, or insert — bot rows never reach the
    // table. Historical rows are untouched (exclusion-first; deletion needs a
    // separate owner authorization). Human browsers are unaffected.
    if (isBotUA(ua).bot || isHeadlessSignal({ webdriver: (navigator as Navigator & { webdriver?: unknown }).webdriver })) return;

    (async () => {
      const geo = await fetchGeo();
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } as any }));
      await supabase.from("page_visits").insert({
        session_id: getOrCreateSessionId(),
        user_id: user?.id ?? null,
        path: location.pathname,
        page_title: document.title?.slice(0, 200) || null,
        referrer: ref ? ref.slice(0, 500) : null,
        referrer_source: classifyReferrer(ref),
        country: geo.country ?? null,
        city: geo.city ?? null,
        region: geo.region ?? null,
        device_type: detectDevice(ua),
        browser: detectBrowser(ua),
        os: detectOS(ua),
        user_agent: ua.slice(0, 500),
        language: navigator.language || null,
      });
    })().catch(() => {
      /* swallow tracking errors */
    });
  }, [location.pathname, location.search]);
}