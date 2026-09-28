/**
 * notificationPreferences.ts — P0-3 geolocation privacy choke point.
 *
 * Every coordinate the client sends to `user_notification_preferences` must be
 * built through buildNotificationPreferencePayload(), which:
 *   1. validates the coordinate pair (finite, lat −90…90, lng −180…180),
 *   2. coarsens it to MAX_COORDINATE_DECIMALS (2 ≈ 1.1 km grid),
 *   3. enforces the DB allow-lists (calculation_method, notification_offset,
 *      device_id length) client-side so malformed rows never leave the device.
 *
 * hasExplicitLocationConsent() is the consent gate for *automatic* server
 * syncs: it is true only after the user explicitly saved location-based prayer
 * notification preferences (PrayerNotificationSettings). Push opt-in alone is
 * NOT location consent.
 */

import { isValidCoordinatePair, toServerCoordinates } from "./location.ts";

export const PREFERENCES_STORAGE_KEY = "noor_prayer_notification_preferences";
export const DEVICE_ID_KEY = "noor_device_id";

/** (0, 0) is the "location not set yet" sentinel used by the settings UI. */
const UNSET_LATITUDE = 0;
const UNSET_LONGITUDE = 0;

/** Mirrors the DB WITH CHECK allow-list on calculation_method. */
const ALLOWED_CALCULATION_METHODS = new Set([
  "MWL",
  "ISNA",
  "Egypt",
  "Makkah",
  "Karachi",
  "Tehran",
  "Jafari",
]);

export interface NotificationPreferenceInput {
  deviceId: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculationMethod: string;
  /** JSONB column — passed through verbatim; never reshaped here. */
  enabledPrayers: unknown;
  notificationOffset: number;
  enabled: boolean;
}

export interface NotificationPreferencePayload {
  device_id: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calculation_method: string;
  enabled_prayers: unknown;
  notification_offset: number;
  enabled: boolean;
  updated_at: string;
}

/**
 * Build a validated, precision-capped payload for user_notification_preferences.
 * Throws on any invalid input — callers must treat a throw as "do not send".
 */
export function buildNotificationPreferencePayload(
  input: NotificationPreferenceInput,
): NotificationPreferencePayload {
  if (
    typeof input.deviceId !== "string" ||
    input.deviceId.length < 8 ||
    input.deviceId.length > 128
  ) {
    throw new Error("Invalid device id");
  }
  if (!isValidCoordinatePair(input.latitude, input.longitude)) {
    throw new Error("Coordinates out of range");
  }
  if (input.latitude === UNSET_LATITUDE && input.longitude === UNSET_LONGITUDE) {
    throw new Error("Location not set");
  }
  if (!ALLOWED_CALCULATION_METHODS.has(input.calculationMethod)) {
    throw new Error("Unknown calculation method");
  }
  if (
    !Number.isInteger(input.notificationOffset) ||
    input.notificationOffset < -60 ||
    input.notificationOffset > 60
  ) {
    throw new Error("Notification offset out of range");
  }

  const { latitude, longitude } = toServerCoordinates(input.latitude, input.longitude);

  return {
    device_id: input.deviceId,
    latitude,
    longitude,
    timezone:
      typeof input.timezone === "string" && input.timezone.length > 0 ? input.timezone : "UTC",
    calculation_method: input.calculationMethod,
    enabled_prayers: input.enabledPrayers,
    notification_offset: input.notificationOffset,
    enabled: input.enabled === true,
    updated_at: new Date().toISOString(),
  };
}

/**
 * True only when the user explicitly saved location-based prayer notification
 * preferences with notifications enabled and a real (non-sentinel) location.
 * Used to gate automatic background syncs — fail-closed on any doubt.
 */
export function hasExplicitLocationConsent(): boolean {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw) as {
      enabled?: unknown;
      latitude?: unknown;
      longitude?: unknown;
    };
    return (
      prefs.enabled === true &&
      isValidCoordinatePair(prefs.latitude, prefs.longitude) &&
      !(prefs.latitude === UNSET_LATITUDE && prefs.longitude === UNSET_LONGITUDE)
    );
  } catch {
    return false;
  }
}

/** Stable per-browser device id (unguessable UUID; doubles as the row key). */
export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}
