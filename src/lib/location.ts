export interface CachedLocation {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

export const LOCATION_CACHE_KEY = "noor_location_cache";
export const LOCATION_DENIED_UNTIL_KEY = "noor_location_denied_until";
const LOCATION_DENIED_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function getCachedLocation(): CachedLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as CachedLocation;
    if (
      typeof value.city === "string" &&
      typeof value.country === "string" &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
    ) {
      return value;
    }
  } catch {
    // Ignore malformed or unavailable local storage.
  }
  return null;
}

export function cacheLocation(location: CachedLocation) {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location));
  } catch {
    // Ignore unavailable local storage.
  }
}

export function isLocationRequestCoolingDown(): boolean {
  const raw = localStorage.getItem(LOCATION_DENIED_UNTIL_KEY);
  return !!raw && Number(raw) > Date.now();
}

export function markLocationRequestDenied() {
  try {
    localStorage.setItem(
      LOCATION_DENIED_UNTIL_KEY,
      String(Date.now() + LOCATION_DENIED_COOLDOWN_MS),
    );
  } catch {
    // Ignore unavailable local storage.
  }
}

export function clearLocationRequestDenied() {
  try {
    localStorage.removeItem(LOCATION_DENIED_UNTIL_KEY);
  } catch {
    // Ignore unavailable local storage.
  }
}

export function requestBrowserLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 3600000,
    });
  });
}
