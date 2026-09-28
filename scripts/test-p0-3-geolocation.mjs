// test-p0-3-geolocation.mjs
// P0-3 REGRESSION TESTS — anonymous precise geolocation (TRK3-1703).
//
// Covers:
//   1. Precision caps: roundCoordinate/toServerCoordinates never emit more
//      than MAX_COORDINATE_DECIMALS (2 ≈ 1.1 km) decimals.
//   2. Payload validation: buildNotificationPreferencePayload rejects
//      malformed/out-of-range/unset coordinates, bad methods, bad offsets,
//      bad device ids.
//   3. Consent gating: hasExplicitLocationConsent() is fail-closed — false
//      without an explicit, enabled, non-sentinel location save.
//   4. Client never sends >2 decimals: 500-pair fuzz over the payload builder.
//   5. Source tripwires: microdegree input removed; background sync is
//      consent-gated and uses the validated builder (no raw SELECT-then-write).
//
// Pure Node (type-stripping import of src TS). Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── localStorage stub (module under test reads it only at call time) ─────────
function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
globalThis.localStorage = makeStorage();

const location = await import("../src/lib/location.ts");
const prefs = await import("../src/lib/notificationPreferences.ts");

const { roundCoordinate, toServerCoordinates, isValidCoordinatePair, MAX_COORDINATE_DECIMALS } = location;
const { buildNotificationPreferencePayload, hasExplicitLocationConsent, PREFERENCES_STORAGE_KEY } = prefs;

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${name}`); }
}
function decimals(n) {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}
function throws(fn) {
  try { fn(); return false; } catch { return true; }
}

// ── 1. Precision caps ────────────────────────────────────────────────────────
check("MAX_COORDINATE_DECIMALS is 2", MAX_COORDINATE_DECIMALS === 2);
check("audit sample lat 22.48033000 -> 22.48", roundCoordinate(22.48033) === 22.48);
check("audit sample lng 87.99327340 -> 87.99", roundCoordinate(87.9932734) === 87.99);
check("negative rounds away-from-zero correctly", roundCoordinate(-23.8103456) === -23.81);
check("IEEE754 edge 1.005 stays within 2dp (float artifact accepted)", (() => {
  const r = roundCoordinate(1.005);
  return decimals(r) <= 2 && Math.abs(r - 1.005) < 0.0051;
})());
check("zero stays zero", roundCoordinate(0) === 0);
check("already-coarse value unchanged", roundCoordinate(22.48) === 22.48);
check("idempotent", roundCoordinate(roundCoordinate(22.4803333)) === roundCoordinate(22.4803333));
check("NaN passes through (validation rejects separately)", Number.isNaN(roundCoordinate(NaN)));
check("Infinity passes through (validation rejects separately)", roundCoordinate(Infinity) === Infinity);

const coarse = toServerCoordinates(22.48033001, 87.99327349);
check("toServerCoordinates caps lat decimals", decimals(coarse.latitude) <= 2);
check("toServerCoordinates caps lng decimals", decimals(coarse.longitude) <= 2);
check("toServerCoordinates values correct", coarse.latitude === 22.48 && coarse.longitude === 87.99);

// ── 2. Coordinate validation ─────────────────────────────────────────────────
check("valid pair accepted", isValidCoordinatePair(22.48, 87.99));
check("boundary lat ±90 accepted", isValidCoordinatePair(90, 180) && isValidCoordinatePair(-90, -180));
check("lat 91 rejected", !isValidCoordinatePair(91, 0));
check("lat -91 rejected", !isValidCoordinatePair(-91, 0));
check("lng 181 rejected", !isValidCoordinatePair(0, 181));
check("lng -181 rejected", !isValidCoordinatePair(0, -181));
check("NaN rejected", !isValidCoordinatePair(NaN, 0));
check("Infinity rejected", !isValidCoordinatePair(0, Infinity));
check("string coords rejected", !isValidCoordinatePair("22.48", 87.99));
check("undefined rejected", !isValidCoordinatePair(undefined, 0));
check("null rejected", !isValidCoordinatePair(null, 0));

// ── 3. Payload builder ───────────────────────────────────────────────────────
const goodInput = {
  deviceId: "12345678-1234-1234-1234-1234567890ab",
  latitude: 22.48033001,
  longitude: 87.99327349,
  timezone: "Asia/Kolkata",
  calculationMethod: "MWL",
  enabledPrayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  notificationOffset: 0,
  enabled: true,
};
const payload = buildNotificationPreferencePayload(goodInput);
check("payload lat coarsened to 2dp", payload.latitude === 22.48);
check("payload lng coarsened to 2dp", payload.longitude === 87.99);
check("payload keeps device/timezone/method", payload.device_id === goodInput.deviceId && payload.timezone === "Asia/Kolkata" && payload.calculation_method === "MWL");
check("payload carries updated_at", typeof payload.updated_at === "string" && payload.updated_at.length > 0);
check("empty timezone defaults to UTC", buildNotificationPreferencePayload({ ...goodInput, timezone: "" }).timezone === "UTC");

check("rejects lat 91", throws(() => buildNotificationPreferencePayload({ ...goodInput, latitude: 91 })));
check("rejects lng -181", throws(() => buildNotificationPreferencePayload({ ...goodInput, longitude: -181 })));
check("rejects NaN lat", throws(() => buildNotificationPreferencePayload({ ...goodInput, latitude: NaN })));
check("rejects (0,0) sentinel", throws(() => buildNotificationPreferencePayload({ ...goodInput, latitude: 0, longitude: 0 })));
check("rejects unknown method", throws(() => buildNotificationPreferencePayload({ ...goodInput, calculationMethod: "isna" })));
check("rejects lowercase method (DB allow-list is uppercase)", throws(() => buildNotificationPreferencePayload({ ...goodInput, calculationMethod: "mwl" })));
check("rejects offset 61", throws(() => buildNotificationPreferencePayload({ ...goodInput, notificationOffset: 61 })));
check("rejects offset -61", throws(() => buildNotificationPreferencePayload({ ...goodInput, notificationOffset: -61 })));
check("rejects fractional offset", throws(() => buildNotificationPreferencePayload({ ...goodInput, notificationOffset: 2.5 })));
check("rejects short device id", throws(() => buildNotificationPreferencePayload({ ...goodInput, deviceId: "abc" })));
check("rejects missing device id", throws(() => buildNotificationPreferencePayload({ ...goodInput, deviceId: "" })));

// ── 4. Consent gating (fail-closed) ──────────────────────────────────────────
globalThis.localStorage = makeStorage();
check("no stored prefs -> no consent", hasExplicitLocationConsent() === false);

localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ enabled: true, latitude: 22.48, longitude: 87.99 }));
check("explicit enabled save -> consent", hasExplicitLocationConsent() === true);

localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ enabled: false, latitude: 22.48, longitude: 87.99 }));
check("disabled prefs -> no consent", hasExplicitLocationConsent() === false);

localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ enabled: true, latitude: 0, longitude: 0 }));
check("(0,0) sentinel -> no consent", hasExplicitLocationConsent() === false);

localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ enabled: true, latitude: 91, longitude: 0 }));
check("out-of-range stored pair -> no consent", hasExplicitLocationConsent() === false);

localStorage.setItem(PREFERENCES_STORAGE_KEY, "{not json");
check("malformed JSON -> no consent", hasExplicitLocationConsent() === false);

localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ latitude: 22.48, longitude: 87.99 }));
check("missing enabled flag -> no consent", hasExplicitLocationConsent() === false);

// ── 5. Fuzz: client never emits >2 decimals ──────────────────────────────────
let fuzzBad = 0;
for (let i = 0; i < 500; i++) {
  const lat = (Math.random() * 180 - 90);
  const lng = (Math.random() * 360 - 180);
  if (lat === 0 && lng === 0) continue;
  const p = buildNotificationPreferencePayload({ ...goodInput, latitude: lat, longitude: lng });
  if (decimals(p.latitude) > 2 || decimals(p.longitude) > 2) fuzzBad++;
}
check("500 fuzz pairs: payload never exceeds 2 decimals", fuzzBad === 0);

// ── 6. Source tripwires ──────────────────────────────────────────────────────
const settingsSrc = readFileSync(join(ROOT, "src/components/PrayerNotificationSettings.tsx"), "utf8");
check("microdegree step removed from settings inputs", !settingsSrc.includes('step="0.000001"'));
check("settings uses the validated payload builder", settingsSrc.includes("buildNotificationPreferencePayload("));
check("settings upserts the built payload (no inline raw object)", settingsSrc.includes(".upsert(payload as any"));

const webpushSrc = readFileSync(join(ROOT, "src/hooks/useWebPushRegistration.ts"), "utf8");
check("background sync is consent-gated", webpushSrc.includes("hasExplicitLocationConsent()"));
check("background sync uses the validated payload builder", webpushSrc.includes("buildNotificationPreferencePayload("));
check("background sync no longer SELECTs before write", !webpushSrc.includes('.select("id")'));
check("background sync no longer writes raw cached coords", !webpushSrc.includes("const { latitude, longitude } = cached;"));

const prayerSrc = readFileSync(join(ROOT, "src/hooks/usePrayerTimes.ts"), "utf8");
check("prayer hook validates coordinates", prayerSrc.includes("isValidCoordinatePair(latitude, longitude)"));
check("prayer hook coarsens before use", prayerSrc.includes("toServerCoordinates(latitude, longitude)"));

console.log(`\nP0-3 geolocation tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
