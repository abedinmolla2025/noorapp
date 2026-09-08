import { useCallback, useEffect, useState } from "react";
import { useAppSettings } from "@/context/AppSettingsContext";
import {
  cacheLocation,
  clearLocationRequestDenied,
  getCachedLocation,
  isLocationRequestCoolingDown,
  markLocationRequestDenied,
  requestBrowserLocation,
  type CachedLocation,
} from "@/lib/location";

interface PrayerTimings { Fajr: string; Sunrise: string; Dhuhr: string; Asr: string; Maghrib: string; Isha: string; }
type LocationData = CachedLocation;
interface HijriDate { day: string; month: { en: string; ar: string }; year: string; }
interface UsePrayerTimesReturn {
  prayerTimes: PrayerTimings | null;
  location: LocationData | null;
  hijriDate: HijriDate | null;
  isLoading: boolean;
  error: string | null;
  requestLocation: () => Promise<boolean>;
}

export const usePrayerTimes = (): UsePrayerTimesReturn => {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimings | null>(null);
  const [location, setLocation] = useState<LocationData | null>(() => getCachedLocation());
  const [hijriDate, setHijriDate] = useState<HijriDate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { calculationMethod, prayerOffsets } = useAppSettings();

  const getMethodId = (method: string) => ({ karachi: 1, isna: 2, mwl: 3, makkah: 4, egypt: 5 }[method as keyof Record<string, number>] ?? 2);
  const applyOffset = (time: string, offsetMinutes: number) => {
    const [h, m] = time.split(":").map(Number);
    const total = ((h * 60 + m + offsetMinutes) % 1440 + 1440) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
  };

  const fetchPrayerTimes = useCallback(async (latitude: number, longitude: number) => {
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, "0")}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getFullYear()}`;
    const response = await fetch(`https://api.aladhan.com/v1/timings/${dateStr}?latitude=${latitude}&longitude=${longitude}&method=${getMethodId(calculationMethod)}`);
    if (!response.ok) throw new Error("Failed to fetch prayer times");
    const data = await response.json();
    if (data.code !== 200 || !data.data) throw new Error("Invalid prayer times response");
    const raw = data.data.timings;
    setPrayerTimes({
      Fajr: applyOffset(raw.Fajr.split(" ")[0], prayerOffsets.Fajr),
      Sunrise: raw.Sunrise.split(" ")[0],
      Dhuhr: applyOffset(raw.Dhuhr.split(" ")[0], prayerOffsets.Dhuhr),
      Asr: applyOffset(raw.Asr.split(" ")[0], prayerOffsets.Asr),
      Maghrib: applyOffset(raw.Maghrib.split(" ")[0], prayerOffsets.Maghrib),
      Isha: applyOffset(raw.Isha.split(" ")[0], prayerOffsets.Isha),
    });
    if (data.data.date?.hijri) setHijriDate({ day: data.data.date.hijri.day, month: data.data.date.hijri.month, year: data.data.date.hijri.year });
  }, [calculationMethod, prayerOffsets]);

  const applyCoordinates = useCallback(async (latitude: number, longitude: number, fallback: LocationData) => {
    let resolved = fallback;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=en`);
      const data = await response.json();
      resolved = {
        city: data.address?.city || data.address?.town || data.address?.village || data.address?.county || data.address?.state_district || fallback.city,
        country: data.address?.country || fallback.country,
        latitude,
        longitude,
      };
    } catch {
      resolved = { ...fallback, latitude, longitude };
    }
    cacheLocation(resolved);
    setLocation(resolved);
    await fetchPrayerTimes(latitude, longitude);
    setError(null);
  }, [fetchPrayerTimes]);

  const requestLocation = useCallback(async () => {
    if (isLocationRequestCoolingDown()) return false;
    try {
      const position = await requestBrowserLocation();
      clearLocationRequestDenied();
      await applyCoordinates(position.coords.latitude, position.coords.longitude, { city: "Unknown", country: "", latitude: position.coords.latitude, longitude: position.coords.longitude });
      setIsLoading(false);
      return true;
    } catch (err) {
      markLocationRequestDenied();
      console.warn("Explicit geolocation request failed:", err);
      setError("Location unavailable");
      setIsLoading(false);
      return false;
    }
  }, [applyCoordinates]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      const cached = getCachedLocation();
      try {
        if (cached) {
          setLocation(cached);
          await fetchPrayerTimes(cached.latitude, cached.longitude);
        } else {
          const response = await fetch("https://ipapi.co/json/");
          const data = await response.json();
          if (!data.latitude || !data.longitude) throw new Error("Invalid IP location data");
          await applyCoordinates(data.latitude, data.longitude, { city: data.city || "Unknown", country: data.country_name || "", latitude: data.latitude, longitude: data.longitude });
        }
      } catch (err) {
        console.error("Prayer-time location fallback failed:", err);
        if (!cancelled) setError("Location unavailable");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [applyCoordinates, fetchPrayerTimes]);

  return { prayerTimes, location, hijriDate, isLoading, error, requestLocation };
};
