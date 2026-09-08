import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import SeoIntroSection from "@/components/SeoIntroSection";
import { motion } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import PrayerHeroCard from "@/components/PrayerHeroCard";
import FeatureIcons from "@/components/FeatureIcons";
import AudioRecitationCard from "@/components/AudioRecitationCard";
import BottomNavigation from "@/components/BottomNavigation";
import DailyHadith from "@/components/DailyHadith";
import AthanSettingsModal from "@/components/AthanSettingsModal";
import FooterSection from "@/components/FooterSection";
import { OccasionCarousel } from "@/components/OccasionCarousel";
import { DailyQuizCard } from "@/components/DailyQuizCard";
import { useAthanNotification } from "@/hooks/useAthanNotification";
import { usePrayerTimes } from "@/hooks/usePrayerTimes";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import { AdSlot } from "@/components/ads/AdSlot";
import type { AdPlacement } from "@/lib/ads";
import { APP_PLACEMENTS, WEB_PLACEMENTS } from "@/lib/ads";
import type { LayoutPlatform } from "@/lib/layout";
import { detectLayoutPlatform } from "@/lib/layout";
import { useLayoutSettings } from "@/hooks/useLayoutSettings";
import { NotificationOptInPrompt } from "@/components/NotificationOptInPrompt";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import StoriesHeroSlider from "@/components/stories/StoriesHeroSlider";
import { Helmet } from "react-helmet-async";

const Index = () => {
  const [athanModalOpen, setAthanModalOpen] = useState(false);
  const [layoutPlatform, setLayoutPlatform] = useState<LayoutPlatform>("web");
  const prayerData = usePrayerTimes();
  const { prayerTimes } = prayerData;
  const navigate = useNavigate();
  const { system, branding } = useGlobalConfig();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const layoutQuery = useLayoutSettings("home", layoutPlatform);

  const resolveAdPlacement = (raw: unknown, fallback: AdPlacement): AdPlacement => {
    const allowed = layoutPlatform === "app" ? APP_PLACEMENTS : WEB_PLACEMENTS;
    if (typeof raw === "string" && (allowed as readonly string[]).includes(raw)) return raw as AdPlacement;
    return fallback;
  };

  const getDefaultPlacementForSection = (sectionKey: string): AdPlacement => {
    // Currently we only ship one home ad block; keep this predictable.
    if (sectionKey === "ad_home_top") return layoutPlatform === "app" ? "app_home_top" : "web_home_top";
    // Safe fallback
    return layoutPlatform === "app" ? "app_home_top" : "web_home_top";
  };

  const sizeToPad = (size?: string) => {
    if (size === "compact") return "space-y-2";
    if (size === "large") return "space-y-5";
    return "space-y-4";
  };

  const variantToWrapper = (variant?: string) => {
    if (variant === "glass") {
      return "rounded-2xl border border-border bg-background/60 backdrop-blur";
    }
    if (variant === "soft") {
      return "rounded-2xl border border-border bg-card";
    }
    return "";
  };

  const wrapWithVariant = (node: React.ReactNode, variant?: string) => {
    const cls = variantToWrapper(variant);
    if (!cls) return node;
    return <div className={cls}>{node}</div>;
  };

  const {
    settings,
    updateSettings,
    togglePrayer,
    isPlaying,
    currentPrayer,
    playAthan,
    stopAthan,
    requestNotificationPermission,
  } = useAthanNotification(prayerTimes);

  useEffect(() => {
    detectLayoutPlatform().then(setLayoutPlatform).catch(() => setLayoutPlatform("web"));
  }, []);

  const defaultSections = useMemo(
    () =>
      [
        {
          section_key: "occasions",
          el: <OccasionCarousel platform={layoutPlatform} />,
        },
        {
          section_key: "prayer_hero",
          el: (
            <PrayerHeroCard
              prayerData={prayerData}
              athanSettings={{
                enabled: settings.enabled,
                isPlaying,
                onOpenSettings: () => setAthanModalOpen(true),
              }}
            />
          ),
        },
        { section_key: "feature_icons", el: <FeatureIcons /> },
        {
          section_key: "ad_home_top",
          el: <AdSlot placement={getDefaultPlacementForSection("ad_home_top")} />,
        },
        {
          section_key: "focus_zone",
          el: (
            <div className="space-y-4">
              <AudioRecitationCard />
              <DailyQuizCard />
            </div>
          ),
        },
        {
          section_key: "stories_hero",
          el: (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-lg font-semibold">Islamic Stories</h2>
                <Link to="/stories" className="text-sm text-emerald-700 hover:underline">
                  View all →
                </Link>
              </div>
              <StoriesHeroSlider />
            </div>
          ),
        },
        { section_key: "daily_hadith", el: <DailyHadith /> },
                { section_key: "seo_intro",
          el: <SeoIntroSection />,
        },
        {
          section_key: "footer",
          el: <FooterSection platform={layoutPlatform} onNavigate={(path) => navigate(path)} />,
        },
      ] as const,
    [getDefaultPlacementForSection, isPlaying, layoutPlatform, navigate, prayerData, settings.enabled],
  );

  const sectionMap = useMemo(() => {
    const map = new Map<string, React.ReactNode>();
    defaultSections.forEach((s) => map.set(s.section_key, s.el));
    return map;
  }, [defaultSections]);

  const hasConfig = (layoutQuery.data?.length ?? 0) > 0;

  const orderedSections = hasConfig
    ? (layoutQuery.data ?? [])
        .filter((r) => r.visible !== false)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((r) => {
          const rowSettings = (r as any).settings ?? {};

          // Focus zone: allow DailyQuizCard overlay tuning
          if (r.section_key === "focus_zone") {
            const overlayTuning =
              typeof rowSettings?.quizOverlay === "object" && rowSettings?.quizOverlay
                ? rowSettings.quizOverlay
                : undefined;

            const cardCfg =
              typeof rowSettings?.dailyQuizCard === "object" && rowSettings?.dailyQuizCard
                ? rowSettings.dailyQuizCard
                : undefined;

            return {
              key: r.id,
              el: wrapWithVariant(
                <div className="space-y-4">
                  <AudioRecitationCard />
                  <DailyQuizCard
                    overlayTuning={overlayTuning}
                    overlayConfig={
                      cardCfg
                        ? {
                            enabled:
                              typeof cardCfg?.overlayEnabled === "boolean"
                                ? cardCfg.overlayEnabled
                                : undefined,
                            preset: cardCfg?.overlayPreset === "old" || cardCfg?.overlayPreset === "new"
                              ? cardCfg.overlayPreset
                              : undefined,
                            imageUrl: typeof cardCfg?.overlayImageUrl === "string" ? cardCfg.overlayImageUrl : undefined,
                          }
                        : undefined
                    }
                    cardClassName={typeof cardCfg?.cardClassName === "string" ? cardCfg.cardClassName : undefined}
                    cardCss={typeof cardCfg?.cardCss === "string" ? cardCfg.cardCss : undefined}
                  />
                </div>,
                rowSettings?.styleVariant,
              ),
              pad: sizeToPad(r.size as any),
            };
          }

          // Daily hadith: allow wrapper style override
          if (r.section_key === "daily_hadith") {
            const hadithCfg =
              typeof rowSettings?.dailyHadithCard === "object" && rowSettings?.dailyHadithCard
                ? rowSettings.dailyHadithCard
                : undefined;

            const cls = typeof hadithCfg?.cardClassName === "string" ? hadithCfg.cardClassName : "";
            const css = typeof hadithCfg?.cardCss === "string" ? hadithCfg.cardCss.trim() : "";
            const scopedCss =
              css && !css.includes("{") ? `[data-daily-hadith-card]{${css}}` : css;

            return {
              key: r.id,
              el: wrapWithVariant(
                <div data-daily-hadith-card className={cls}>
                  {scopedCss ? <style>{scopedCss}</style> : null}
                  <DailyHadith />
                </div>,
                rowSettings?.styleVariant,
              ),
              pad: sizeToPad(r.size as any),
            };
          }

          // Ad slot: placement override via settings.adPlacement
          if (typeof r.section_key === "string" && r.section_key.startsWith("ad_")) {
            const fallbackPlacement = getDefaultPlacementForSection(r.section_key);
            const placement = resolveAdPlacement(rowSettings?.adPlacement, fallbackPlacement);
            return {
              key: r.id,
              el: wrapWithVariant(<AdSlot placement={placement} />, rowSettings?.styleVariant),
              pad: sizeToPad(r.size as any),
            };
          }

          // Feature icons: allow gridColumns
          if (r.section_key === "feature_icons") {
            const cols = typeof rowSettings?.gridColumns === "number" ? rowSettings.gridColumns : undefined;
            const layout = cols ? "grid" : "scroll";
            return {
              key: r.id,
              el: wrapWithVariant(
                <FeatureIcons layout={layout as any} columns={cols} />,
                rowSettings?.styleVariant,
              ),
              pad: sizeToPad(r.size as any),
            };
          }

          // Footer: allow links via settings
          if (r.section_key === "footer") {
            const footerSettings = {
              playStoreUrl:
                typeof rowSettings?.playStoreUrl === "string" ? rowSettings.playStoreUrl : undefined,
              appStoreUrl:
                typeof rowSettings?.appStoreUrl === "string" ? rowSettings.appStoreUrl : undefined,
              websiteUrl:
                typeof rowSettings?.websiteUrl === "string" ? rowSettings.websiteUrl : undefined,
              contactEmail:
                typeof rowSettings?.contactEmail === "string" ? rowSettings.contactEmail : undefined,
              facebookUrl:
                typeof rowSettings?.facebookUrl === "string" ? rowSettings.facebookUrl : undefined,
              whatsappUrl:
                typeof rowSettings?.whatsappUrl === "string" ? rowSettings.whatsappUrl : undefined,
              footerText:
                typeof rowSettings?.footerText === "string" ? rowSettings.footerText : undefined,
              developerLine:
                typeof rowSettings?.developerLine === "string" ? rowSettings.developerLine : undefined,
            };

            return {
              key: r.id,
              el: wrapWithVariant(
                <FooterSection
                  platform={layoutPlatform}
                  settings={footerSettings}
                  onNavigate={(path) => navigate(path)}
                />,
                rowSettings?.styleVariant,
              ),
              pad: sizeToPad(r.size as any),
            };
          }

          const base = sectionMap.get(r.section_key);
          return {
            key: r.id,
            el: wrapWithVariant(base, rowSettings?.styleVariant),
            pad: sizeToPad(r.size as any),
          };
        })
        .filter((s) => s.el !== undefined)
    : defaultSections.map((s, idx) => ({ key: String(idx), el: s.el, pad: "space-y-4" }));

  const SITE_ORIGIN = "https://noorapp.in";
  const pageTitle = "Noor Islamic App — Quran, Hadith, Dua & Prayer Times";
  const pageDescription = "Use Noor, a free Islamic app for Quran reading, Hadith, daily Duas, prayer times and learning tools. Explore the web app or install it on supported devices.";

  return (
    <PullToRefresh
      disabled={!isMobile}
      onRefresh={async () => {
        // Refetch everything that's currently active (best UX) and also mark stale queries.
        await queryClient.invalidateQueries();
        await queryClient.refetchQueries({ type: "active" });
      }}
    >
      <div className="min-h-screen min-h-[100dvh] bg-background pb-20 w-full overflow-x-hidden">
        <Helmet>
          <title>{pageTitle}</title>
          <meta name="description" content={pageDescription} />
          <meta property="og:title" content={pageTitle} />
          <meta property="og:description" content={pageDescription} />
          <meta property="og:url" content={`${SITE_ORIGIN}/`} />
          <meta property="og:image" content={`${SITE_ORIGIN}/og-image.png`} />
        </Helmet>
        <NotificationOptInPrompt />


      {/* Maintenance banner */}
      {system.maintenanceMode && (
        <div className="w-full bg-amber-500/90 text-amber-950 text-center text-xs py-2 px-3">
          {branding.tagline || "The app is currently in maintenance mode. Some features may be limited."}
        </div>
      )}

      {/* Playing Indicator */}
      {isPlaying && currentPrayer && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-4 right-4 z-40 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl px-4 py-3 shadow-lg border border-white/20"
        >
          <div className="flex items-center gap-3">
            <BellRing className="w-5 h-5 text-white" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{currentPrayer} আযান চলছে...</p>
            </div>
            <button
              onClick={stopAthan}
              className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full transition-colors"
            >
              বন্ধ করুন
            </button>
          </div>
        </motion.div>
      )}

      {/* Main Content */}
      <main className="w-full px-3 py-4" style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
        <div className="space-y-4">
          {orderedSections.map((s) => (
            <section
              key={s.key}
              style={{ contentVisibility: 'auto', contain: 'layout style paint', transform: 'translateZ(0)' }}
            >
              <div className={s.pad ?? "space-y-4"}>{s.el}</div>
            </section>
          ))}

        </div>
      </main>

      {/* Athan Settings Modal */}
      <AthanSettingsModal
        open={athanModalOpen}
        onClose={() => setAthanModalOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        onTogglePrayer={togglePrayer}
        onRequestPermission={requestNotificationPermission}
        isPlaying={isPlaying}
        onPlayTest={() => playAthan("Test")}
        onStop={stopAthan}
      />

        {/* PWA Install Prompt */}
        <PwaInstallPrompt />

        {/* Bottom Navigation */}
        <BottomNavigation />
      </div>
    </PullToRefresh>
  );
};

export default Index;
