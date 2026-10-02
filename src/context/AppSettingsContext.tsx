import { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
export type ThemeColor = "default" | "emerald" | "teal" | "amber";
export type FontSize = "sm" | "md" | "lg";
export type AppLanguage = "bn" | "en" | "ar";

export type PrayerCalculationMethod = "karachi" | "isna" | "mwl" | "egypt" | "makkah";

export type PrayerOffsets = {
  Fajr: number;
  Dhuhr: number;
  Asr: number;
  Maghrib: number;
  Isha: number;
};

interface AppSettingsContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  calculationMethod: PrayerCalculationMethod;
  setCalculationMethod: (method: PrayerCalculationMethod) => void;
  prayerOffsets: PrayerOffsets;
  setPrayerOffsets: (offsets: PrayerOffsets) => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

const THEME_KEY = "theme";
const LANG_KEY = "appLanguage";
const COLOR_KEY = "themeColor";
const FONT_KEY = "fontSize";
const PRAYER_METHOD_KEY = "prayerCalculationMethod";

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  if (mode === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function applyThemeColor(color: ThemeColor) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme-color", color);
}

function applyFontSize(size: FontSize) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-font-size", size);
}

function applyLanguage(lang: AppLanguage) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "bn" ? "bn" : lang === "ar" ? "ar" : "en";
}

export const AppSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [language, setLanguageState] = useState<AppLanguage>(() => {
    // Phase 5 (2026-10-02): the default must agree with the served <html lang>.
    // Served markup is route-aware (api/prerender.js getHtmlLang): "bn" on
    // /hadith/.../bangla* and /dua, "ur" on /hadith/.../urdu*, "en" elsewhere.
    // A stored user preference always wins; otherwise derive from the route so
    // hydration no longer contradicts the crawler-visible markup.
    // NOTE: AppLanguage has no "ur" member, so Urdu routes fall back to the
    // shell default "en" here (served HTML still correctly declares lang="ur").
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(LANG_KEY) as AppLanguage | null;
    if (stored === "bn" || stored === "en" || stored === "ar") return stored;
    const path = window.location.pathname || "";
    if (path === "/dua" || path.startsWith("/hadith/sahih-bukhari/bangla")) return "bn";
    return "en";
  });

  const [themeColor, setThemeColorState] = useState<ThemeColor>(() => {
    if (typeof window === "undefined") return "default";
    const stored = localStorage.getItem(COLOR_KEY) as ThemeColor | null;
    return stored ?? "default";
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window === "undefined") return "md";
    const stored = localStorage.getItem(FONT_KEY) as FontSize | null;
    return stored ?? "md";
  });

  const [calculationMethod, setCalculationMethodState] = useState<PrayerCalculationMethod>(() => {
    if (typeof window === "undefined") return "karachi";
    const stored = localStorage.getItem(PRAYER_METHOD_KEY) as PrayerCalculationMethod | null;
    return stored ?? "karachi";
  });

  const [prayerOffsets, setPrayerOffsetsState] = useState<PrayerOffsets>(() => {
    if (typeof window === "undefined") {
      return { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 };
    }
    try {
      const stored = localStorage.getItem("prayerOffsets");
      return stored ? JSON.parse(stored) : { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 };
    } catch {
      return { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 };
    }
  });

  // Apply initial values on mount
  useEffect(() => {
    applyTheme(theme);
    applyLanguage(language);
    applyThemeColor(themeColor);
    applyFontSize(fontSize);
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_KEY, mode);
    }
    applyTheme(mode);
  };

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANG_KEY, lang);
    }
    applyLanguage(lang);
  };

  const setThemeColor = (color: ThemeColor) => {
    setThemeColorState(color);
    if (typeof window !== "undefined") {
      localStorage.setItem(COLOR_KEY, color);
    }
    applyThemeColor(color);
  };

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    if (typeof window !== "undefined") {
      localStorage.setItem(FONT_KEY, size);
    }
    applyFontSize(size);
  };

  const setCalculationMethod = (method: PrayerCalculationMethod) => {
    setCalculationMethodState(method);
    if (typeof window !== "undefined") {
      localStorage.setItem(PRAYER_METHOD_KEY, method);
    }
  };

  const setPrayerOffsets = (offsets: PrayerOffsets) => {
    setPrayerOffsetsState(offsets);
    if (typeof window !== "undefined") {
      localStorage.setItem("prayerOffsets", JSON.stringify(offsets));
    }
  };

  return (
    <AppSettingsContext.Provider
      value={{
        theme,
        setTheme,
        language,
        setLanguage,
        themeColor,
        setThemeColor,
        fontSize,
        setFontSize,
        calculationMethod,
        setCalculationMethod,
        prayerOffsets,
        setPrayerOffsets,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }
  return ctx;
};
