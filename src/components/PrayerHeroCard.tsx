import { useState, useEffect } from "react";
import { MapPin, Clock, Loader2, ChevronRight, Sparkles, Bell, BellRing } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { usePrayerTimes } from "@/hooks/usePrayerTimes";
import noorLogo from "@/assets/noor-logo.png";
import prayingMan3D from "@/assets/praying-man-3d.png";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import { AdminUnlockModal } from "@/components/admin/AdminUnlockModal";

interface AthanSettings {
  enabled: boolean;
  isPlaying: boolean;
  onOpenSettings: () => void;
}

interface PrayerHeroCardProps {
  prayerData?: ReturnType<typeof usePrayerTimes>;
  athanSettings?: AthanSettings;
}

const PrayerHeroCard = ({ prayerData, athanSettings }: PrayerHeroCardProps) => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const localPrayerData = usePrayerTimes();
  const { branding, loading: configLoading } = useGlobalConfig();
  const { prayerTimes, location, hijriDate, isLoading } = prayerData || localPrayerData;
  
  // Render the hero branding even when app_settings is unavailable. The bundled
  // logo is the safe fallback; hiding the whole branding row made the hero look
  // empty whenever Supabase branding was delayed or denied by RLS.
  const brandingLoaded = !configLoading;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const formatTo24Hour = (timeStr: string): { hours: number; minutes: number } => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return { hours, minutes };
  };

  const formatPrayerTime = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const prayerSchedule = prayerTimes
    ? [
        { name: "Fajr", time: prayerTimes.Fajr },
        { name: "Sunrise", time: prayerTimes.Sunrise },
        { name: "Dhuhr", time: prayerTimes.Dhuhr },
        { name: "Asr", time: prayerTimes.Asr },
        { name: "Maghrib", time: prayerTimes.Maghrib },
        { name: "Isha", time: prayerTimes.Isha },
      ]
    : [
        { name: "Fajr", time: "05:00" },
        { name: "Sunrise", time: "06:15" },
        { name: "Dhuhr", time: "12:30" },
        { name: "Asr", time: "15:30" },
        { name: "Maghrib", time: "18:00" },
        { name: "Isha", time: "19:30" },
      ];

  const getCurrentPrayer = () => {
    const now = currentTime.getHours() * 60 + currentTime.getMinutes();

    for (let i = prayerSchedule.length - 1; i >= 0; i--) {
      const { hours, minutes } = formatTo24Hour(prayerSchedule[i].time);
      const prayerMinutes = hours * 60 + minutes;
      if (now >= prayerMinutes) {
        return prayerSchedule[i].name;
      }
    }
    return "Isha";
  };

  const getNextPrayer = () => {
    const now = currentTime.getHours() * 60 + currentTime.getMinutes();

    for (let i = 0; i < prayerSchedule.length; i++) {
      const { hours, minutes } = formatTo24Hour(prayerSchedule[i].time);
      const prayerMinutes = hours * 60 + minutes;
      if (now < prayerMinutes) {
        return { name: prayerSchedule[i].name, time: prayerSchedule[i].time };
      }
    }
    return { name: prayerSchedule[0].name, time: prayerSchedule[0].time };
  };

  const getCountdown = () => {
    const next = getNextPrayer();
    const { hours, minutes } = formatTo24Hour(next.time);
    
    const nextTotalSeconds = hours * 3600 + minutes * 60;
    const nowTotalSeconds = 
      currentTime.getHours() * 3600 + 
      currentTime.getMinutes() * 60 + 
      currentTime.getSeconds();

    let diffTotalSeconds = nextTotalSeconds - nowTotalSeconds;
    
    if (diffTotalSeconds <= 0) {
      diffTotalSeconds += 24 * 60 * 60;
    }

    const h = Math.floor(diffTotalSeconds / 3600);
    const m = Math.floor((diffTotalSeconds % 3600) / 60);
    const s = diffTotalSeconds % 60;

    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const period = currentTime.getHours() >= 12 ? "PM" : "AM";

  const hijriDateStr = hijriDate
    ? `${hijriDate.day} ${hijriDate.month.en}, ${hijriDate.year} AH`
    : "Loading...";

  const locationStr = location?.city || "Loading...";

  return (
    <div 
      className="relative cursor-pointer group"
      onClick={() => navigate("/prayer-times")}
    >
      {/* Premium Glass Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-xl" style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
        {/* Dynamic Gradient Background - Solid Emerald Green */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700" />
        
        {/* Subtle Static Orbs - no animation for performance */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full blur-[80px] opacity-10" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-gradient-to-tr from-teal-500 to-cyan-500 rounded-full blur-[60px] opacity-10" />
        
        {/* Mesh Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }} />

        {/* Content Container */}
        <div className="relative z-10 p-3 md:p-4">
          <div className="flex flex-col gap-2">
            
            {/* Left Section - Main Info */}
            <div className="flex-1 space-y-2 relative z-20">
              
              {/* Top Bar - NOOR Branding & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* NOOR Branding - only show when loaded */}
                {brandingLoaded && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="relative h-10 flex-shrink-0 flex items-center">
                      <div className="absolute -inset-0.5 bg-white rounded-full blur-sm opacity-25" />
                      <button
                        type="button"
                        aria-label="NOOR logo"
                        className="relative z-10 block"
                        onClick={(e) => {
                          // prevent navigating to /prayer-times when triggering admin unlock
                          e.stopPropagation();
                          const next = logoTapCount + 1;
                          if (next >= 7) {
                            setLogoTapCount(0);
                            setUnlockOpen(true);
                          } else {
                            setLogoTapCount(next);
                          }
                        }}
                      >
                        <img
                          src={branding.logoUrl || noorLogo}
                          alt={branding.appName || "NOOR Logo"}
                          className="h-10 w-auto max-w-[120px] object-contain"
                          onError={(event) => {
                            const image = event.currentTarget;
                            if (image.src !== noorLogo) {
                              image.onerror = null;
                              image.src = noorLogo;
                            }
                          }}
                          style={{ 
                            filter: "drop-shadow(0 0 4px rgba(255, 255, 255, 0.4))",
                            borderRadius: branding.logoUrl?.includes("circle") ? "9999px" : "4px"
                          }}
                        />
                      </button>
                    </div>
                    <div className="flex flex-col ml-1.5">
                      {/* App name follows branding typography but always stays as the primary name */}
                      <span
                        className="font-semibold tracking-[0.18em] text-xs md:text-sm lg:text-base uppercase"
                        style={{
                          fontFamily: branding.fontFamily || undefined,
                          fontSize: branding.fontSize ? `${branding.fontSize}px` : undefined,
                          fontWeight: branding.fontWeight || undefined,
                          // Fall back to semantic primary color when no custom brand color is set
                          color: branding.color || undefined,
                        }}
                      >
                        {branding.appName || "Noor"}
                      </span>

                      {/* Tagline / category is always secondary and smaller */}
                      <span
                        className="mt-0.5 text-[9px] md:text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground"
                        style={{
                          fontFamily: branding.taglineFontFamily || undefined,
                          fontSize: branding.taglineFontSize ? `${branding.taglineFontSize}px` : undefined,
                          color: branding.taglineColor || undefined,
                        }}
                      >
                        {branding.tagline || "Islamic App"}
                      </span>
                    </div>
                  </div>
                </div>
                )}

                {/* Location & Bell */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2 py-1 border border-white/15">
                    {isLoading ? (
                      <Loader2 size={10} className="animate-spin text-amber-400" />
                    ) : (
                      <MapPin size={10} className="text-amber-400" />
                    )}
                    <span className="text-[10px] text-white font-medium">{locationStr}</span>
                  </div>
                  
                  {/* Athan Bell Button */}
                  {athanSettings && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        athanSettings.onOpenSettings();
                      }}
                      className="relative p-1.5 rounded-full bg-white/10 border border-white/15"
                    >
                      {athanSettings.isPlaying ? (
                        <BellRing size={12} className="text-amber-400" />
                      ) : athanSettings.enabled ? (
                        <Bell size={12} className="text-amber-400" />
                      ) : (
                        <Bell size={12} className="text-white/50" />
                      )}
                      {athanSettings.enabled && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Current Prayer & Next Prayer - Side by Side */}
              <div className="flex items-center justify-between gap-2">
                {/* Current Prayer */}
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles size={10} className="text-amber-400" />
                    <span className="text-[9px] text-amber-400 uppercase tracking-[0.1em] font-semibold">
                      Current Prayer
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      {getCurrentPrayer()}
                    </h2>
                    <span className="text-lg font-light text-white/70 tabular-nums">
                      {formatTime(currentTime)}
                    </span>
                  </div>
                </div>

                {/* Praying Man 3D Image - Fixed Position with Light Rays */}
                <div className="absolute right-32 top-1/2 -translate-y-1/2">
                  
                  {/* Glow on Hands - static for performance */}
                  <div
                    className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-8 rounded-full opacity-60"
                    style={{
                      background: 'radial-gradient(ellipse, rgba(255, 255, 255, 0.6) 0%, transparent 70%)',
                      filter: 'blur(6px)',
                    }}
                  />
                  
                  <img 
                    src={prayingMan3D} 
                    alt="Praying Man" 
                    className="w-20 h-20 object-contain -scale-x-100 relative z-10"
                    style={{
                      filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.5)) drop-shadow(0 0 24px rgba(16, 185, 129, 0.4))'
                    }}
                  />
                </div>

                {/* Next Prayer Countdown - Fixed Width */}
                <div className="flex items-center gap-1.5 bg-amber-400/15 border border-amber-400/25 rounded-lg px-2 py-1.5 min-w-[90px]">
                  <Clock size={12} className="text-amber-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[8px] uppercase tracking-wider text-white/60">Next</span>
                    <span className="text-sm font-bold text-white tabular-nums">{getCountdown()}</span>
                  </div>
                  <ChevronRight size={12} className="text-amber-400" />
                </div>
              </div>
            </div>

          </div>

          {/* Bottom Quick Stats */}
          <div className="mt-2 pt-2 border-t border-white/10">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 sm:gap-1.5">
              {prayerSchedule.map((prayer) => {
                const isCurrentPrayer = getCurrentPrayer() === prayer.name;
                const isNextPrayer = getNextPrayer().name === prayer.name;
                
                return (
                  <div
                    key={prayer.name}
                    className={`
                      text-center py-1.5 px-1 rounded-md
                      ${isCurrentPrayer 
                        ? 'bg-amber-400/25 border border-amber-400/40' 
                        : isNextPrayer
                          ? 'bg-white/10 border border-white/20'
                          : 'bg-white/5 border border-transparent'
                      }
                    `}
                  >
                    <p className={`text-[8px] uppercase tracking-wider ${
                      isCurrentPrayer ? 'text-amber-300 font-semibold' : 'text-white/60'
                    }`}>
                      {prayer.name}
                    </p>
                    <p className={`text-[11px] font-bold tabular-nums ${
                      isCurrentPrayer ? 'text-amber-300' : 'text-white'
                    }`}>
                      {formatPrayerTime(prayer.time)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Outer Glow Effect on Hover */}
      <div className="absolute -inset-1 bg-gradient-to-r from-amber-400/0 via-amber-400/15 to-amber-400/0 rounded-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl" />

      <AdminUnlockModal
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        onUnlocked={() => navigate("/admin")}
      />
    </div>
  );
};

export default PrayerHeroCard;