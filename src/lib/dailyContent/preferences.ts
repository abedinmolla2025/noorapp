// Phase 3 — client for the daily-content preference endpoint.
//
// The browser proves ownership by presenting its own push subscription
// endpoint (only its own Push API registration can produce it). The edge
// function resolves the endpoint to device_ids from its own token table
// and writes the preference with the service role. The client never
// writes preferences directly and never asserts a bare device_id.
//
// The logic is pure and dependency-injected so it is unit-testable in
// Node: `post` and `getSubscriptionEndpoint` are supplied by the caller.
// The component wires the real browser implementations.

export type PreferenceAction = "opt_out" | "opt_in" | "status";

export type PreferencePost = (
  url: string,
  body: { action: PreferenceAction; endpoint: string },
) => Promise<{ status: number; json: unknown }>;

export type SubscriptionEndpointGetter = () => Promise<string | null>;

export type PreferenceErrorCode =
  | "NO_SUBSCRIPTION"
  | "SUBSCRIPTION_NOT_FOUND"
  | "PREFERENCE_FAILED";

export class PreferenceError extends Error {
  readonly code: PreferenceErrorCode;
  constructor(code: PreferenceErrorCode) {
    super(code);
    this.name = "PreferenceError";
    this.code = code;
  }
}

export async function setDailyPreference(
  deps: { post: PreferencePost; getSubscriptionEndpoint: SubscriptionEndpointGetter },
  input: { edgeUrl: string; enabled: boolean },
): Promise<{ daily_enabled: boolean; devices: number }> {
  const endpoint = await deps.getSubscriptionEndpoint();
  if (!endpoint) throw new PreferenceError("NO_SUBSCRIPTION");
  const res = await deps.post(input.edgeUrl, {
    action: input.enabled ? "opt_in" : "opt_out",
    endpoint,
  });
  if (res.status === 404) throw new PreferenceError("SUBSCRIPTION_NOT_FOUND");
  const body = res.json as { ok?: unknown; daily_enabled?: unknown; devices?: unknown } | null;
  if (res.status !== 200 || body?.ok !== true || typeof body.daily_enabled !== "boolean") {
    throw new PreferenceError("PREFERENCE_FAILED");
  }
  return {
    daily_enabled: body.daily_enabled,
    devices: typeof body.devices === "number" ? body.devices : 0,
  };
}

// Phase 7 — read this subscription's daily preference from the server,
// so the toggle shows the server's value instead of a local hint. Same
// error codes as setDailyPreference: NO_SUBSCRIPTION (no browser
// subscription), SUBSCRIPTION_NOT_FOUND (server has no token row for
// this endpoint — the toggle hides), PREFERENCE_FAILED (anything else;
// the caller keeps its local hint).
export async function getDailyPreferenceStatus(
  deps: { post: PreferencePost; getSubscriptionEndpoint: SubscriptionEndpointGetter },
  input: { edgeUrl: string },
): Promise<{ daily_enabled: boolean; devices: number }> {
  const endpoint = await deps.getSubscriptionEndpoint();
  if (!endpoint) throw new PreferenceError("NO_SUBSCRIPTION");
  const res = await deps.post(input.edgeUrl, { action: "status", endpoint });
  if (res.status === 404) throw new PreferenceError("SUBSCRIPTION_NOT_FOUND");
  const body = res.json as { ok?: unknown; daily_enabled?: unknown; devices?: unknown } | null;
  if (res.status !== 200 || body?.ok !== true || typeof body.daily_enabled !== "boolean") {
    throw new PreferenceError("PREFERENCE_FAILED");
  }
  return {
    daily_enabled: body.daily_enabled,
    devices: typeof body.devices === "number" ? body.devices : 0,
  };
}

// Default transport: plain fetch. No credentials, no CRON secret — the
// subscription endpoint in the body is the credential for this path.
export async function postPreference(
  url: string,
  body: { action: PreferenceAction; endpoint: string },
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// Browser helper: resolve this browser's push subscription endpoint.
// Returns null when push is unsupported, the service worker is
// unavailable, or no subscription exists. Never throws.
export async function getBrowserSubscriptionEndpoint(): Promise<string | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}
