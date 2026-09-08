import { useState, useEffect, useCallback, useRef } from "react";
import { requestNotificationPermission as requestNotificationPermissionShared } from "@/lib/permissionCoordinator";

interface PrayerTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface AthanSettings {
  enabled: boolean;
  prayers: {
    Fajr: boolean;
    Dhuhr: boolean;
    Asr: boolean;
    Maghrib: boolean;
    Isha: boolean;
  };
  volume: number;
  sound: keyof typeof ATHAN_AUDIO_URLS;
}

const DEFAULT_SETTINGS: AthanSettings = {
  enabled: true,
  prayers: {
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true,
  },
  volume: 0.8,
  sound: "madinah",
};

// Free Athan audio sources
const ATHAN_AUDIO_URLS = {
  makkah: "https://www.islamcan.com/audio/adhan/azan1.mp3",
  madinah: "https://www.islamcan.com/audio/adhan/azan2.mp3",
};

export const useAthanNotification = (prayerTimes: PrayerTimings | null) => {
  const [settings, setSettings] = useState<AthanSettings>(() => {
    const saved = localStorage.getItem("athanSettings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPrayer, setCurrentPrayer] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedRef = useRef<string | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem("athanSettings", JSON.stringify(settings));
  }, [settings]);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(ATHAN_AUDIO_URLS[settings.sound]);
    audioRef.current.volume = settings.volume;

    audioRef.current.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentPrayer(null);
    });

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Update audio source and volume when settings change
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.src = ATHAN_AUDIO_URLS[settings.sound];
    audioRef.current.volume = settings.volume;
  }, [settings.sound, settings.volume]);

  const playAthan = useCallback(async (prayerName: string) => {
    if (!audioRef.current || !settings.enabled) return;

    // Only enforce per-prayer toggles for real prayers, not for test plays
    const enabledPrayers: (keyof typeof settings.prayers)[] = [
      "Fajr",
      "Dhuhr",
      "Asr",
      "Maghrib",
      "Isha",
    ];

    if (enabledPrayers.includes(prayerName as keyof typeof settings.prayers)) {
      const prayerKey = prayerName as keyof typeof settings.prayers;
      if (!settings.prayers[prayerKey]) return;
    }

    try {
      // Request notification permission
      await requestNotificationPermissionShared();

      // Show notification for real prayers only
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        enabledPrayers.includes(prayerName as keyof typeof settings.prayers)
      ) {
        new Notification(`${prayerName} Prayer Time`, {
          body: `It's time for ${prayerName} prayer`,
          icon: "/favicon.ico",
          tag: `prayer-${prayerName}`,
        });
      }

      // Play audio
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setIsPlaying(true);
      setCurrentPrayer(prayerName);
      lastPlayedRef.current = `${prayerName}-${new Date().toDateString()}`;
    } catch (error) {
      console.error("Error playing Athan:", error);
    }
  }, [settings]);

  const stopAthan = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentPrayer(null);
    }
  }, []);

  // Check for prayer time
  useEffect(() => {
    if (!prayerTimes || !settings.enabled) return;

    const checkPrayerTime = () => {
      const now = new Date();
      const currentTimeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

      for (const prayer of prayers) {
        const prayerTime = prayerTimes[prayer];
        if (!prayerTime) continue;

        // Check if current time matches prayer time (within the same minute)
        if (currentTimeStr === prayerTime) {
          const todayKey = `${prayer}-${now.toDateString()}`;
          
          // Only play if not already played today for this prayer
          if (lastPlayedRef.current !== todayKey) {
            playAthan(prayer);
          }
        }
      }
    };

    // Check every 30 seconds
    checkIntervalRef.current = setInterval(checkPrayerTime, 30000);
    checkPrayerTime(); // Check immediately

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [prayerTimes, settings.enabled, playAthan]);

  const updateSettings = useCallback((newSettings: Partial<AthanSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const togglePrayer = useCallback((prayer: keyof AthanSettings["prayers"]) => {
    setSettings((prev) => ({
      ...prev,
      prayers: {
        ...prev.prayers,
        [prayer]: !prev.prayers[prayer],
      },
    }));
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    const permission = await requestNotificationPermissionShared();
    return permission === "granted";
  }, []);

  return {
    settings,
    updateSettings,
    togglePrayer,
    isPlaying,
    currentPrayer,
    playAthan,
    stopAthan,
    requestNotificationPermission,
  };
};
