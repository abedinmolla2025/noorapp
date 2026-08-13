import { useState, useEffect } from "react";
import { useAppSettings } from "@/context/AppSettingsContext";

interface PrayerTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface LocationData {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface HijriDate {
  day: string;
  month: { en: string; ar: string };
  year: string;
}

interface UsePrayerTimesReturn {
  prayerTimes: PrayerTimings | null;
  location: LocationData | null;
  hijriDate: HijriDate | null;
  isLoading: boolean;
  error: string | null;
}

export const usePrayerTimes = (): UsePrayerTimesReturn => {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimings | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [hijriDate, setHijriDate] = useState<HijriDate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { calculationMethod, prayerOffsets } = useAppSettings();

  const getMethodId = (method: string): number => {
    switch (method) {
      case "karachi":
        return 1;
      case "isna":
        return 2;
      case "mwl":
        return 3;
      case "makkah":
        return 4;
      case "egypt":
        return 5;
      default:
        return 2;
    }
  };

  const applyOffset = (time: string, offsetMinutes: number): string => {
    const [h, m] = time.split(":").map(Number);
    let total = h * 60 + m + offsetMinutes;
    total = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const fetchPrayerTimes = async (latitude: number, longitude: number) => {
      try {
        // Get today's date in DD-MM-YYYY format
        const today = new Date();
        const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
        
        const methodId = getMethodId(calculationMethod);
        
        // Fetch prayer times from Aladhan API
        const response = await fetch(
          `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${latitude}&longitude=${longitude}&method=${methodId}`
        );
        
        if (!response.ok) {
          throw new Error("Failed to fetch prayer times");
        }
        
        const data = await response.json();
        
        if (data.code === 200 && data.data) {
          const rawTimes: PrayerTimings = {
            Fajr: data.data.timings.Fajr.split(' ')[0],
            Sunrise: data.data.timings.Sunrise.split(' ')[0],
            Dhuhr: data.data.timings.Dhuhr.split(' ')[0],
            Asr: data.data.timings.Asr.split(' ')[0],
            Maghrib: data.data.timings.Maghrib.split(' ')[0],
            Isha: data.data.timings.Isha.split(' ')[0],
          };

          const adjustedTimes: PrayerTimings = {
            Fajr: applyOffset(rawTimes.Fajr, prayerOffsets.Fajr),
            Sunrise: rawTimes.Sunrise,
            Dhuhr: applyOffset(rawTimes.Dhuhr, prayerOffsets.Dhuhr),
            Asr: applyOffset(rawTimes.Asr, prayerOffsets.Asr),
            Maghrib: applyOffset(rawTimes.Maghrib, prayerOffsets.Maghrib),
            Isha: applyOffset(rawTimes.Isha, prayerOffsets.Isha),
          };

          setPrayerTimes(adjustedTimes);

          if (data.data.date?.hijri) {
            setHijriDate({
              day: data.data.date.hijri.day,
              month: data.data.date.hijri.month,
              year: data.data.date.hijri.year,
            });
          }
        }
      } catch (err) {
        console.error("Error fetching prayer times:", err);
        setError("Failed to fetch prayer times");
      }
    };

    const getLocationAndPrayerTimes = async () => {
      if (!navigator.geolocation) {
        setError("Geolocation not supported");
        setIsLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Get city name from reverse geocoding
          try {
            const geoResponse = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=en`
            );
            const geoData = await geoResponse.json();
            
            const city = geoData.address?.city || 
                        geoData.address?.town || 
                        geoData.address?.village || 
                        geoData.address?.county ||
                        geoData.address?.state_district ||
                        "Unknown";
            
            const country = geoData.address?.country || "";
            
            setLocation({ city, country, latitude, longitude });
          } catch (err) {
            console.error("Error getting location:", err);
            setLocation({ city: "Unknown", country: "", latitude, longitude });
          }
          
          // Fetch prayer times
          await fetchPrayerTimes(latitude, longitude);
          setIsLoading(false);
        },
        (err) => {
          console.error("Geolocation error:", err);
          setError("Location access denied");
          setIsLoading(false);
        },
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 300000 }
      );
    };

    getLocationAndPrayerTimes();
  }, [calculationMethod]);

  return { prayerTimes, location, hijriDate, isLoading, error };
};
