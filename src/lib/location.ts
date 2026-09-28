export interface CachedLocation {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

export const LOCATION_CACHE_KEY = "noor_location_cache";
export const LOCATION_DENIED_UNTIL_KEY = "noor_location_denied_until";
const LOCATION_DENIED_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// ── P0-3 geolocation privacy ─────────────────────────────────────────────
// Maximum coordinate precision the client may persist or transmit anywhere.
//
// 2 decimal places ≈ 1.1 km grid. Prayer-time math shifts by seconds and the
// qibla bearing by <0.05° at that granularity — both far inside the features'
// accuracy budgets — so there is no product reason to keep finer precision.
// Anything leaving the client (localStorage cache, Supabase writes, third-party
// prayer-time / reverse-geocode calls) must pass through roundCoordinate() /
// toServerCoordinates() first.
export const MAX_COORDINATE_DECIMALS = 2;

/** Round one coordinate to the P0-3 precision cap (idempotent). */
export function roundCoordinate(value: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** MAX_COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

/** Coarsen a lat/lng pair to the P0-3 precision cap (idempotent). */
export function toServerCoordinates(
  latitude: number,
  longitude: number,
): { latitude: number; longitude: number } {
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
}

/**
 * Reject malformed or out-of-range coordinates before they are used or
 * transmitted. Mirrors the DB CHECK constraints (lat −90…90, lng −180…180).
 */
export function isValidCoordinatePair(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

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
    // P0-3: never persist millimetre precision — coarsen at the single
    // choke point where location enters client storage.
    const { latitude, longitude } = toServerCoordinates(location.latitude, location.longitude);
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({ ...location, latitude, longitude }));
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
