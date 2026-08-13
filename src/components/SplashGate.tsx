import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/SplashScreen";
import { ChandRaatSplash } from "@/components/ChandRaatSplash";

type SplashMessage = {
  text?: string;
  textArabic?: string;
  textBengali?: string;
};

type SplashColors = {
  primary?: string;
  secondary?: string;
  accent?: string;
};

type SplashConfig = {
  lottieUrl?: string;
  logoUrl?: string;
  appName?: string;
  duration: number;
  fadeOutDuration: number;
  enabled: boolean;
  message?: SplashMessage;
  colors?: SplashColors;
  style?: 'elegant' | 'festive' | 'minimal' | 'royal' | 'spiritual';
};

// Default splash configuration - always show beautiful Islamic splash
const DEFAULT_SPLASH_CONFIG: SplashConfig = {
  enabled: true,
  duration: 3500,
  fadeOutDuration: 800,
};

/** Check if today falls within Chand Raat period (eve of Eid ul-Fitr 2026) */
function isChandRaatPeriod(): boolean {
  const now = new Date();
  // Chand Raat 2026: March 14 (for preview) through March 21 morning
  const start = new Date("2026-03-14T00:00:00+05:30");
  const end = new Date("2026-03-21T06:00:00+05:30");
  return now >= start && now <= end;
}

/**
 * Ensures splash overlay is visible while we fetch splash config.
 * On slower devices (native WebView), fetching can be slow enough that
 * the previous approach never rendered anything because splashConfig was null.
 */
export function SplashGate(props: { children: React.ReactNode }) {
  const { children } = props;

  // Skip splash for /download page for immediate content access
  const skipSplash = window.location.pathname === "/download";

  const [done, setDone] = useState(skipSplash);

  const [config, setConfig] = useState<SplashConfig>(DEFAULT_SPLASH_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchActiveSplash = async () => {
      try {
        // Try to get branding settings from app_settings table
        const { data: brandingData } = await supabase
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", "branding")
          .maybeSingle();

        if (cancelled) return;

        const brandingValue = brandingData?.setting_value as any;
        
        // Check if splash is explicitly disabled
        if (brandingValue?.splashEnabled === false) {
          setDone(true);
          return;
        }

        // Use custom lottie if provided, otherwise use beautiful fallback
        // Also pass logoUrl, appName, message, and colors from settings
        setConfig({
          enabled: true,
          lottieUrl: brandingValue?.lottieSplashUrl || undefined,
          logoUrl: brandingValue?.logoUrl || undefined,
          appName: brandingValue?.appName || undefined,
          duration: brandingValue?.splashDuration || DEFAULT_SPLASH_CONFIG.duration,
          fadeOutDuration: brandingValue?.splashFadeOut || DEFAULT_SPLASH_CONFIG.fadeOutDuration,
          message: brandingValue?.splashMessage || undefined,
          colors: brandingValue?.splashColors || undefined,
          style: brandingValue?.splashStyle || undefined,
        });
      } catch {
        // On error, still show default splash
        if (!cancelled) {
          setConfig(DEFAULT_SPLASH_CONFIG);
        }
      } finally {
        if (!cancelled) setConfigLoaded(true);
      }
    };

    fetchActiveSplash();

    return () => {
      cancelled = true;
    };
  }, []);

  // Already finished showing splash
  if (done) return <>{children}</>;

  // Show Chand Raat special splash during the period
  if (isChandRaatPeriod()) {
    return (
      <>
        <ChandRaatSplash
          logoUrl={config.logoUrl}
          appName={config.appName}
          duration={4500}
          fadeOutDuration={900}
          onComplete={() => setDone(true)}
        />
        {done && children}
      </>
    );
  }

  // Show splash screen - same component handles both loading and display states
  return (
    <>
      <SplashScreen
        lottieUrl={configLoaded ? config.lottieUrl : undefined}
        logoUrl={config.logoUrl}
        appName={config.appName}
        duration={config.duration}
        fadeOutDuration={config.fadeOutDuration}
        message={config.message}
        colors={config.colors}
        style={config.style}
        onComplete={() => setDone(true)}
      />
      {done && children}
    </>
  );
}
