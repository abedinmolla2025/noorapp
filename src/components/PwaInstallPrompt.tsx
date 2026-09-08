import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Share, EllipsisVertical, Menu } from "lucide-react";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import noorLogo from "@/assets/noor-logo.png";
import { claimCustomPrompt, releaseCustomPrompt } from "@/lib/permissionCoordinator";

const COOLDOWN_KEY = "pwa-install-dismissed-at";
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type BrowserType = "chrome" | "safari" | "firefox" | "samsung" | "other";

function detectBrowser(): BrowserType {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "safari";
  if (/Firefox/i.test(ua)) return "firefox";
  return "other";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isCooldownActive(): boolean {
  const dismissedAt = localStorage.getItem(COOLDOWN_KEY);
  return !!dismissedAt && Date.now() - Number(dismissedAt) < COOLDOWN_MS;
}

const instructions: Record<string, { icon: typeof Download; text: string }> = {
  safari: { icon: Share, text: "Tap Share ↗ → Add to Home Screen" },
  firefox: { icon: Menu, text: "Tap ☰ menu → Install" },
  samsung: { icon: EllipsisVertical, text: "Menu → Add page to → Home screen" },
  other: { icon: Download, text: "Use your browser menu to install this app" },
};

export default function PwaInstallPrompt() {
  const { branding } = useGlobalConfig();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const promptReady = useRef(false);
  const [browser] = useState<BrowserType>(detectBrowser);
  const supportsPrompt = useRef(false);

  const logoSrc = branding.logoUrl
    ? `${branding.logoUrl}?v=${branding.logoVersion || ""}`
    : noorLogo;

  // Listen for native install prompt (Chrome/Edge/Samsung)
  useEffect(() => {
    if (isStandalone() || isCooldownActive()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      console.log("PWA install prompt available");
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      promptReady.current = true;
      supportsPrompt.current = true;
    };

    window.addEventListener("beforeinstallprompt", handler);

    // For browsers that don't fire beforeinstallprompt, show fallback after a short delay
    const fallbackTimer = setTimeout(() => {
      if (!supportsPrompt.current && !isStandalone() && !isCooldownActive()) {
        if (claimCustomPrompt("pwa")) setVisible(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Show popup on first user interaction once native prompt is ready
  useEffect(() => {
    if (!deferredPrompt) return;

    const show = () => {
      if (!promptReady.current) return;
      if (claimCustomPrompt("pwa")) setVisible(true);
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener("click", show);
      window.removeEventListener("scroll", show, true);
    };

    window.addEventListener("click", show, { once: true });
    window.addEventListener("scroll", show, { once: true, capture: true });

    return cleanup;
  }, [deferredPrompt]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      setDeferredPrompt(null);
      releaseCustomPrompt("pwa");
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    releaseCustomPrompt("pwa");
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  }, []);

  const hasNativePrompt = !!deferredPrompt;
  const fallback = instructions[browser] || instructions.other;
  const FallbackIcon = fallback.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-24 left-3 right-3 z-50 mx-auto max-w-sm"
        >
          <div className="relative rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/20">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <img
                src={logoSrc}
                alt="Noor App"
                className="h-12 w-12 rounded-xl"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  Install Noor Islamic App
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  {!hasNativePrompt && <FallbackIcon className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  {hasNativePrompt
                    ? "Get faster access from your home screen"
                    : fallback.text}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Works like a real app after install
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              {hasNativePrompt ? (
                <>
                  <button
                    onClick={handleInstall}
                    className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97]"
                  >
                    Install
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted active:scale-[0.97]"
                  >
                    Later
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDismiss}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted active:scale-[0.97]"
                >
                  <FallbackIcon className="h-4 w-4" />
                  Got it
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
