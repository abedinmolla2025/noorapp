import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import PremiumIcon from "./PremiumIcon";

interface NavItem {
  iconName: 'home' | 'quran' | 'hadith' | 'calendar' | 'support' | 'settings';
  label: string;
  labelBn: string;
  id: string;
  path: string;
  moduleKey?: keyof ReturnType<typeof useGlobalConfig>["modules"];
}

const navItems: NavItem[] = [
  {
    id: "home",
    iconName: "home",
    label: "Home",
    labelBn: "হোম",
    path: "/",
  },
  {
    id: "quran",
    iconName: "quran",
    label: "Quran",
    labelBn: "কুরআন",
    path: "/quran",
    moduleKey: "quran",
  },
  {
    id: "hadith",
    iconName: "hadith",
    label: "Hadith",
    labelBn: "হাদিস",
    path: "/hadith",
    moduleKey: "hadith",
  },
  {
    id: "calendar",
    iconName: "calendar",
    label: "Calendar",
    labelBn: "ক্যালেন্ডার",
    path: "/calendar",
    moduleKey: "calendar",
  },
  {
    id: "support",
    iconName: "support",
    label: "Help & Support",
    labelBn: "সহায়তা",
    path: "/contact",
  },
  {
    id: "settings",
    iconName: "settings",
    label: "Settings",
    labelBn: "সেটিংস",
    path: "/settings",
  },
];

const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { modules } = useGlobalConfig();

  const isActive = (path: string) => location.pathname === path;

  // Prefetch components to make transitions feel instant
  const handlePrefetch = (id: string) => {
    const safeImport = (promise: Promise<any>) => {
      promise.catch((err) => {
        console.warn(`Prefetch failed for ${id}:`, err);
        // If it's a chunk load error, it might be a new version.
        // We don't force reload here to not interrupt the user, 
        // but the ErrorBoundary or the global listener will handle it if they actually click.
      });
    };

    switch (id) {
      case "quran": safeImport(import("../pages/QuranPage")); break;
      case "hadith": safeImport(import("../pages/HadithPage")); break;
      case "calendar": safeImport(import("../pages/IslamicCalendarPage")); break;
      case "settings": safeImport(import("../pages/SettingsPage")); break;
      case "support": safeImport(import("../pages/ContactPage")); break;
      default: break;
    }
  };

  // বড় স্ক্রিনে লুকিয়ে রেখে শুধু মোবাইল/ট্যাবের জন্য বটম ন্যাভবার
  if (!isMobile) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/50 bg-background md:bottom-4 md:mx-auto md:max-w-lg md:rounded-2xl md:border md:shadow-card" style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-1.5 px-2 pt-2 pb-4 sm:px-4">
        {navItems
          .filter((item) => (item.moduleKey ? modules[item.moduleKey] !== false : true))
          .map((item) => {
            const active = isActive(item.path);

            return (
              <motion.button
                key={item.id}
                onClick={() => navigate(item.path)}
                onMouseEnter={() => handlePrefetch(item.id)}
                onTouchStart={() => handlePrefetch(item.id)}
                whileTap={{ scale: 0.94 }}
                className={`bottom-nav-item relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition-all duration-200 sm:text-xs ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute -top-1 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-accent"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                <motion.div
                  title={item.id === "support" ? "Support & Feedback" : undefined}
                  className="transition-transform"
                  animate={active ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <PremiumIcon name={item.iconName} active={active} className="w-7 h-7" />
                </motion.div>

                <span className={active ? "font-semibold" : undefined}>
                  {item.label}
                </span>
              </motion.button>
            );
          })}
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </nav>
  );
};

export default BottomNavigation;
