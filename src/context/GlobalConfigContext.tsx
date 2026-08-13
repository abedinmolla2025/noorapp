import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppSettingKey =
  | "branding"
  | "theme"
  | "seo"
  | "system"
  | "modules"
  | "legal";

export interface BrandingSettings {
  // Core text
  appName?: string;
  tagline?: string;

  // Brand imagery
  logoUrl?: string;
  iconUrl?: string;
  faviconUrl?: string;
  faviconVariants?: {
    png16?: string;
    png32?: string;
    png48?: string;
    png180?: string; // apple-touch-icon
  };

  // Logo version for cache-busting PWA icons
  logoVersion?: string;

  // App name typography (used in header/navigation)
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string; // hex or CSS color string

  // Tagline typography
  taglineFontFamily?: string;
  taglineFontSize?: number;
  taglineColor?: string;
}

export interface ThemeSettings {
  primaryColor?: string; // HSL string, e.g. "158 64% 35%"
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  defaultMode?: "light" | "dark";
}

export interface SeoSettings {
  title?: string;
  description?: string;
  shareImageUrl?: string;
}

export interface SystemSettings {
  maintenanceMode?: boolean;
  showAds?: boolean;
  forceUpdate?: boolean;
  adsensePublisherId?: string;
  apkUrl?: string;
  apkVersion?: string;
}

export interface ModuleToggles {
  prayerTimes?: boolean;
  quran?: boolean;
  duas?: boolean;
  hadith?: boolean;
  calendar?: boolean;
  quiz?: boolean;
}

export interface LegalSettings {
  developerName?: string;
  developerNameBn?: string;
  contactEmail?: string;
  country?: string;
  countryBn?: string;
  facebookUrl?: string;
  whatsappUrl?: string;
  websiteUrl?: string;
  playStoreUrl?: string;
  appStoreUrl?: string;
  privacyPolicyLastUpdated?: string;
  termsLastUpdated?: string;
  legalVersionNumber?: string;
  regionComplianceNote?: string;
}

export interface GlobalConfigState {
  branding: BrandingSettings;
  theme: ThemeSettings;
  seo: SeoSettings;
  system: SystemSettings;
  modules: ModuleToggles;
  legal: LegalSettings;
  loading: boolean;
}

interface GlobalConfigContextValue extends GlobalConfigState {}

const GlobalConfigContext = createContext<GlobalConfigContextValue | undefined>(
  undefined,
);

function cacheBust(url: string, version?: string) {
  if (!url) return url;
  const v = version || String(Date.now());
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${v}`;
}

function applyDocumentBranding(branding: BrandingSettings, seo: SeoSettings) {
  if (typeof document === "undefined") return;

  const upsertLink = (selector: string, attrs: Record<string, string>) => {
    let link = document.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = document.createElement("link");
      document.head.appendChild(link);
    }
    for (const [k, v] of Object.entries(attrs)) {
      link.setAttribute(k, v);
    }
    return link;
  };

  if (seo.title) {
    document.title = seo.title;
  } else if (branding.appName) {
    document.title = branding.appName;
  }

  const description = seo.description;
  if (description) {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }

  const shareImage = seo.shareImageUrl || branding.logoUrl;
  if (shareImage) {
    const og =
      document.querySelector<HTMLMetaElement>('meta[property="og:image"]') ??
      (() => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:image");
        document.head.appendChild(m);
        return m;
      })();
    og.content = shareImage;

    const tw =
      document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]') ??
      (() => {
        const m = document.createElement("meta");
        m.name = "twitter:image";
        document.head.appendChild(m);
        return m;
      })();
    tw.content = shareImage;
  }

  const faviconHref = branding.faviconUrl || branding.iconUrl || branding.logoUrl;

  // Prefer generated PNG variants when available (best browser support).
  const v = branding.faviconVariants;
  const lv = branding.logoVersion;
  if (v?.png16) upsertLink('link[rel="icon"][sizes="16x16"]', { rel: "icon", sizes: "16x16", type: "image/png", href: cacheBust(v.png16, lv) });
  if (v?.png32) upsertLink('link[rel="icon"][sizes="32x32"]', { rel: "icon", sizes: "32x32", type: "image/png", href: cacheBust(v.png32, lv) });
  if (v?.png48) upsertLink('link[rel="icon"][sizes="48x48"]', { rel: "icon", sizes: "48x48", type: "image/png", href: cacheBust(v.png48, lv) });
  if (v?.png180) upsertLink('link[rel="apple-touch-icon"]', { rel: "apple-touch-icon", sizes: "180x180", href: cacheBust(v.png180, lv) });

  if (faviconHref) {
    upsertLink('link[rel="icon"]:not([sizes])', { rel: "icon", href: cacheBust(v?.png32 || faviconHref, lv) });
  } else {
    // Fallback: use default placeholder if no admin favicon set
    upsertLink('link[rel="icon"]:not([sizes])', { rel: "icon", href: "/favicon.ico" });
  }

  // Dynamic PWA manifest with cache-busted icons
  const manifestIcons = [
    // Use high-quality local icons if using default paths, otherwise use branding URLs
    { src: cacheBust("/pwa-icon-192.png", lv), sizes: "192x192", type: "image/png", purpose: "any" },
    { src: cacheBust("/pwa-icon-192.png", lv), sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: cacheBust("/pwa-icon-512.png", lv), sizes: "512x512", type: "image/png", purpose: "any" },
    { src: cacheBust("/pwa-icon-512.png", lv), sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: cacheBust("/pwa-icon-1024.png", lv), sizes: "1024x1024", type: "image/png", purpose: "any" },
    { src: cacheBust("/pwa-icon-1024.png", lv), sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    // Also include dynamic branding variants if they exist
    ...(v?.png180 ? [{ src: cacheBust(v.png180, lv), sizes: "180x180", type: "image/png", purpose: "any maskable" }] : []),
    ...(v?.png48 ? [{ src: cacheBust(v.png48, lv), sizes: "48x48", type: "image/png", purpose: "any" }] : []),
  ].filter(Boolean) as any[];

  if (manifestIcons.length) {
    const appName = branding.appName || "Noor";
    const manifest = {
      name: appName,
      short_name: appName,
      description: "Prayer times, Quran, Dua, Qibla finder and more.",
      start_url: window.location.origin + "/",
      display: "standalone",
      background_color: "#0a1a14",
      theme_color: "#0d9f6e",
      orientation: "portrait" as const,
      icons: manifestIcons,
    };

    // Keep the last object URL so we can revoke it.
    const w = window as any;
    if (w.__noorManifestUrl) {
      try {
        URL.revokeObjectURL(w.__noorManifestUrl);
      } catch {
        // ignore
      }
    }
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    w.__noorManifestUrl = url;
    upsertLink('link[rel="manifest"]', { rel: "manifest", href: url });
  }
}

function applyThemeSettings(theme: ThemeSettings) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  if (theme.defaultMode === "dark") {
    root.classList.add("dark");
  } else if (theme.defaultMode === "light") {
    root.classList.remove("dark");
  }

  if (theme.primaryColor) {
    root.style.setProperty("--primary", theme.primaryColor);
    root.style.setProperty("--ring", theme.primaryColor);
  }
  if (theme.secondaryColor) {
    root.style.setProperty("--secondary", theme.secondaryColor);
  }
  if (theme.accentColor) {
    root.style.setProperty("--accent", theme.accentColor);
  }
  if (theme.borderRadius) {
    root.style.setProperty("--radius", theme.borderRadius);
  }
  if (theme.fontFamily) {
    root.style.setProperty("--font-sans", theme.fontFamily);
  }
}

const defaultState: GlobalConfigState = {
  branding: {},
  theme: {},
  seo: {},
  system: {},
  modules: {
    prayerTimes: true,
    quran: true,
    duas: true,
    hadith: true,
    calendar: true,
    quiz: true,
  },
  legal: {},
  loading: true,
};

export const GlobalConfigProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [state, setState] = useState<GlobalConfigState>(defaultState);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["branding", "theme", "seo", "system", "modules", "legal"]);

      if (error) {
        console.error("Error loading app_settings", error);
        if (!isMounted) return;
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const nextState: GlobalConfigState = { ...defaultState, loading: false };

      for (const row of data || []) {
        const key = row.setting_key as AppSettingKey;
        const value = (row.setting_value || {}) as any;
        switch (key) {
          case "branding":
            nextState.branding = value;
            break;
          case "theme":
            nextState.theme = value;
            break;
          case "seo":
            nextState.seo = value;
            break;
          case "system":
            nextState.system = value;
            break;
          case "modules":
            nextState.modules = { ...nextState.modules, ...value };
            break;
          case "legal":
            nextState.legal = value;
            break;
        }
      }

      if (!isMounted) return;
      setState(nextState);
      applyDocumentBranding(nextState.branding, nextState.seo);
      applyThemeSettings(nextState.theme);
    };

    loadSettings();

    const channel = supabase
      .channel("app_settings_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
        },
        (payload) => {
          const key = (payload.new as any)?.setting_key as AppSettingKey | undefined;
          if (!key) return;
          const value = ((payload.new as any)?.setting_value || {}) as any;

          setState((prev) => {
            const updated: GlobalConfigState = { ...prev };
            switch (key) {
              case "branding":
                updated.branding = value;
                break;
              case "theme":
                updated.theme = value;
                break;
              case "seo":
                updated.seo = value;
                break;
              case "system":
                updated.system = value;
                break;
              case "modules":
                updated.modules = { ...prev.modules, ...value };
                break;
              case "legal":
                updated.legal = value;
                break;
            }
            applyDocumentBranding(updated.branding, updated.seo);
            applyThemeSettings(updated.theme);
            return updated;
          });
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const value = useMemo<GlobalConfigContextValue>(() => state, [state]);

  return (
    <GlobalConfigContext.Provider value={value}>
      {children}
    </GlobalConfigContext.Provider>
  );
};

export const useGlobalConfig = () => {
  const ctx = useContext(GlobalConfigContext);
  if (!ctx) {
    // Fallback to defaultState so components can render even if the provider
    // is temporarily missing (e.g. during tests or isolated renders).
    return defaultState;
  }
  return ctx;
};
