// supabase/functions/_shared/ai-adapter.ts
// Phase 3 (2026-11-13): central AI Adapter — the ONLY path from Edge
// Functions to an AI provider. Handlers call generateToolCall(); they
// never build a provider URL, never read a provider key, and never call
// fetch for AI themselves.
//
// Providers (free-only, owner decision 2026-11-13): Gemini free tier
// (primary) + Groq free plan (secondary). No other provider exists in
// this module, and there is no paid provider, model, or tier in the
// configuration, so no code path can switch to one.
//
// Rules implemented here (AI-FAILOVER-REVISED.md):
// - At most 4 provider calls per request (primary + 2 retries + 1
//   secondary), never parallel, never a retry loop.
// - Retries only on retryable errors; NEVER fail over on 401/403, 400,
//   schema, policy, or unknown errors.
// - Every 429 is classified by its cause (RPM / TPM / daily quota /
//   provider-wide throttling). A 429 alone NEVER proves daily quota
//   exhaustion — without a positive quota signal it is a brief rate
//   limit, never FREE_QUOTA_EXHAUSTED.
// - A daily-quota error stops calling THAT provider until its documented
//   reset window; the secondary is used only if its own quota is
//   available. If both are exhausted, the batch stops.
// - Per-instance in-memory circuit breaker (5 consecutive retryable
//   failures within 5 min -> open 60 s -> half-open probe). No shared
//   state, no database change.
// - Every call is logged (correlation ID, provider, model, status, error
//   code, tokens, latency) — layer B accounting (cost-control §4).
// - No secret values are read here except via requireSecret per
//   invocation (fail-closed 500 naming the missing key, same behaviour
//   as the pre-migration code). Both keys are required: a missing
//   secondary key is a misconfiguration that must be visible, not
//   silently degraded.

import { AI_CONFIG } from "./ai-config.ts";
import type { ProviderId, ProviderUsage, ToolDefinition } from "./ai-config.ts";
import { callGemini, parseGeminiResponse } from "./ai-gemini-client.ts";
import type { GeminiHttpOutcome } from "./ai-gemini-client.ts";
import { callGroq, parseGroqResponse } from "./ai-groq-client.ts";
import type { GroqHttpOutcome } from "./ai-groq-client.ts";
import { requireSecret } from "./require-admin.ts";

export type ErrorKind =
  | "retryable"
  | "auth"
  | "badRequest"
  | "schema"
  | "policy"
  | "unknown"
  // Failover §1a adds quota exhaustion as a distinct error kind on top of
  // the six kinds in §2: it is not retryable on the same provider, but it
  // DOES allow one attempt on the secondary (if its quota is available).
  | "quotaExhausted";

export type ErrorCode =
  | "FREE_RATE_LIMITED"
  | "FREE_QUOTA_EXHAUSTED"
  | "PROVIDER_TEMPORARILY_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "BAD_REQUEST"
  | "SCHEMA_ERROR"
  | "POLICY_BLOCKED"
  | "PAYMENT_REQUIRED"
  | "INPUT_TOO_LARGE"
  | "UNKNOWN_ERROR";

/** One normalized AI failure. `message` always starts with `[CODE]`. */
export class AiError extends Error {
  kind: ErrorKind;
  code: ErrorCode;
  provider: ProviderId | null;
  status: number | null;
  /** May be retried on the SAME provider (bounded, with backoff). */
  retryable: boolean;
  /** May be tried once on the secondary provider. */
  failover: boolean;
  /** For FREE_QUOTA_EXHAUSTED: the epoch ms after which the provider may be called again. */
  resetAtMs: number | null;
  /** The provider's retry-after, in ms (when the response carried one). */
  retryAfterMs: number | null;
  /** Earlier provider errors from this same request (most recent last). */
  previousErrors: AiError[];

  constructor(opts: {
    kind: ErrorKind;
    code: ErrorCode;
    message: string;
    provider?: ProviderId | null;
    status?: number | null;
    retryable?: boolean;
    failover?: boolean;
    resetAtMs?: number | null;
    retryAfterMs?: number | null;
    previousErrors?: AiError[];
  }) {
    super(`[${opts.code}] ${opts.message}`);
    this.name = "AiError";
    this.kind = opts.kind;
    this.code = opts.code;
    this.provider = opts.provider ?? null;
    this.status = opts.status ?? null;
    this.retryable = opts.retryable ?? false;
    this.failover = opts.failover ?? false;
    this.resetAtMs = opts.resetAtMs ?? null;
    this.retryAfterMs = opts.retryAfterMs ?? null;
    this.previousErrors = opts.previousErrors ?? [];
  }
}

type ProviderHttpOutcome = GeminiHttpOutcome | GroqHttpOutcome;

function providerLabel(provider: ProviderId): string {
  return provider === "gemini" ? "Gemini" : "Groq";
}

function bodySlice(bodyText: string): string {
  return bodyText.replace(/\s+/g, " ").trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

/**
 * Parses a reset/retry duration: plain seconds ("90"), Go durations
 * ("1m30s", "6h0m0s", "500ms"), Google RPC durations ("60s", "0.5s").
 * Returns milliseconds, or null when the value is absent/unparseable.
 */
export function parseDurationToMs(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const s = value.trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let total = 0;
  let matched = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched++;
    const n = Number(m[1]);
    if (m[2] === "ms") total += n;
    else if (m[2] === "s") total += n * 1000;
    else if (m[2] === "m") total += n * 60_000;
    else if (m[2] === "h") total += n * 3_600_000;
  }
  if (matched === 0) return null;
  if (s.replace(/(\d+(?:\.\d+)?)(ms|s|m|h)/g, "") !== "") return null;
  return total;
}

// UTC instant minus the same instant expressed as a Pacific wall clock
// (read as UTC). PST -> +8h, PDT -> +7h.
function pacificUtcGapMs(atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(atMs));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  let hour = get("hour");
  if (hour === 24) hour = 0; // en-US hour12:false can yield "24"
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return Math.round((atMs - asUtc) / 60_000) * 60_000;
}

/**
 * Next midnight in America/Los_Angeles, as a UTC epoch ms. Used only as
 * a fallback reset time for a Gemini daily-quota error with no retry
 * delay (the Gemini RPD resets at midnight Pacific). DST is handled by
 * measuring the Pacific offset at the target instant.
 */
export function nextMidnightPacificMs(nowMs: number): number {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const get = (t: string) =>
    Number(dateParts.find((p) => p.type === t)?.value ?? 0);
  const utcMidnight = Date.UTC(get("year"), get("month") - 1, get("day") + 1, 0, 0, 0);
  // Pacific midnight = UTC midnight + (UTC - Pacific wall clock).
  const first = utcMidnight + pacificUtcGapMs(utcMidnight);
  return utcMidnight + pacificUtcGapMs(first);
}

// ---------------------------------------------------------------------------
// 429 classification (failover §1a)
// ---------------------------------------------------------------------------

export type RateLimitSignals = {
  remainingRequests: string | null;
  remainingTokens: string | null;
  resetRequests: string | null;
  resetTokens: string | null;
  retryAfter: string | null;
  bodyText: string;
};

export type RateLimitClassification = {
  code:
    | "FREE_RATE_LIMITED"
    | "FREE_QUOTA_EXHAUSTED"
    | "PROVIDER_TEMPORARILY_UNAVAILABLE";
  resetAtMs: number | null;
  retryAfterMs: number | null;
};

function ambiguous429(
  attempt: number,
  retryAfterMs: number | null,
): RateLimitClassification {
  // No positive signal: a brief rate limit on the first attempt, then a
  // provider-wide condition. Quota exhaustion is NEVER assumed. A
  // retry-after header, when present, is still honoured as the backoff.
  if (attempt === 0) {
    return {
      code: "FREE_RATE_LIMITED",
      resetAtMs: null,
      retryAfterMs,
    };
  }
  return {
    code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
    resetAtMs: null,
    retryAfterMs,
  };
}

/**
 * The retry delay from a Gemini error body: the standard Google API
 * error shape carries it in `error.details[]` as a RetryInfo
 * (`retryDelay: "60s"`). That shape is NOT verified from the pages read
 * (verification doc §7a) — the Phase 3 fixtures model it and Rehearsal
 * (Phase 5) confirms the real shape. A missing/unparseable delay is
 * null, never an invented number.
 */
export function geminiRetryDelayMs(bodyText: string): number | null {
  try {
    const root = JSON.parse(bodyText) as Record<string, unknown>;
    const err = root.error as Record<string, unknown> | undefined;
    const details = err?.details as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(details)) return null;
    for (const d of details) {
      const type = typeof d["@type"] === "string" ? d["@type"] : "";
      if (type.includes("RetryInfo") && typeof d.retryDelay === "string") {
        return parseDurationToMs(d.retryDelay);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Classify ONE 429 response by its cause. `attempt` is the retry index
 * for this provider (0 = first attempt). A 429 alone never proves daily
 * quota exhaustion: without a positive quota signal the result is a
 * brief rate limit (first attempt) or a provider-wide condition (later
 * attempts) — never FREE_QUOTA_EXHAUSTED.
 */
export function classify429(
  provider: ProviderId,
  signals: RateLimitSignals,
  attempt: number,
  nowMs: number,
): RateLimitClassification {
  // retry-after is in seconds; parseDurationToMs treats a plain number
  // as seconds.
  const retryAfterMs = parseDurationToMs(signals.retryAfter);
  if (provider === "groq") {
    const resetReqMs = parseDurationToMs(signals.resetRequests);
    if (signals.remainingRequests === "0") {
      if (resetReqMs !== null && resetReqMs > AI_CONFIG.longResetThresholdMs) {
        return {
          code: "FREE_QUOTA_EXHAUSTED",
          resetAtMs: nowMs + resetReqMs,
          retryAfterMs,
        };
      }
      // A request limit with a short (or unparseable) reset is per-minute.
      return { code: "FREE_RATE_LIMITED", resetAtMs: null, retryAfterMs };
    }
    if (signals.remainingTokens === "0") {
      // TPM limit: per-minute by definition.
      return { code: "FREE_RATE_LIMITED", resetAtMs: null, retryAfterMs };
    }
    if (retryAfterMs !== null) {
      // retry-after with no quota counter at zero: provider-wide throttling.
      return {
        code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
        resetAtMs: null,
        retryAfterMs,
      };
    }
    return ambiguous429(attempt, retryAfterMs);
  }
  // Gemini: the retry delay is the signal. Short -> per-minute (RPM/TPM),
  // long (hours, up to the midnight-Pacific RPD reset) -> daily quota.
  const delayMs = geminiRetryDelayMs(signals.bodyText);
  if (delayMs !== null) {
    if (delayMs > AI_CONFIG.longResetThresholdMs) {
      return {
        code: "FREE_QUOTA_EXHAUSTED",
        resetAtMs: nowMs + delayMs,
        retryAfterMs,
      };
    }
    return { code: "FREE_RATE_LIMITED", resetAtMs: null, retryAfterMs };
  }
  if (/overload|temporarily unavailable|UNAVAILABLE/i.test(signals.bodyText)) {
    return {
      code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
      resetAtMs: null,
      retryAfterMs,
    };
  }
  return ambiguous429(attempt, retryAfterMs);
}

// ---------------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------------

/**
 * Normalize any provider outcome into an AiError. The mapping follows
 * failover §2 (verified against the deployed code) plus the four
 * free-only codes from §1a. Retryable kinds retry (bounded) and may
 * fail over; auth / badRequest / schema / policy / unknown never retry
 * and never fail over.
 */
export function normalizeError(
  provider: ProviderId,
  outcome: ProviderHttpOutcome,
  attempt: number,
  nowMs: number,
): AiError {
  const label = providerLabel(provider);
  if (outcome.timedOut || outcome.networkError) {
    return new AiError({
      kind: "retryable",
      code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
      message: outcome.timedOut
        ? `${label} timed out`
        : `${label} could not be reached`,
      provider,
      status: null,
      retryable: true,
      failover: true,
    });
  }
  const status = outcome.status;
  if (status === 401 || status === 403) {
    return new AiError({
      kind: "auth",
      code: "PROVIDER_AUTH_FAILED",
      message: `${label} rejected the API key (HTTP ${status}) — fix the key configuration; no retry, no failover`,
      provider,
      status,
      retryable: false,
      failover: false,
    });
  }
  if (status === 400) {
    return new AiError({
      kind: "badRequest",
      code: "BAD_REQUEST",
      message: `${label} rejected the request (HTTP 400): ${bodySlice(outcome.bodyText)}`,
      provider,
      status,
    });
  }
  if (status === 402) {
    // Under free-only there is no paid tier to fall back to: a 402 means
    // the provider-side configuration is wrong. Never enable paid billing.
    return new AiError({
      kind: "unknown",
      code: "PAYMENT_REQUIRED",
      message: `${label} requires payment (HTTP 402) — the free-plan configuration is wrong; never enable paid billing`,
      provider,
      status,
    });
  }
  if (status === 429) {
    const signals: RateLimitSignals = {
      remainingRequests: outcome.headers["x-ratelimit-remaining-requests"] ?? null,
      remainingTokens: outcome.headers["x-ratelimit-remaining-tokens"] ?? null,
      resetRequests: outcome.headers["x-ratelimit-reset-requests"] ?? null,
      resetTokens: outcome.headers["x-ratelimit-reset-tokens"] ?? null,
      retryAfter: outcome.headers["retry-after"] ?? null,
      bodyText: outcome.bodyText,
    };
    const c = classify429(provider, signals, attempt, nowMs);
    if (c.code === "FREE_QUOTA_EXHAUSTED") {
      const resetAtMs = c.resetAtMs ?? nextMidnightPacificMs(nowMs);
      return new AiError({
        kind: "quotaExhausted",
        code: "FREE_QUOTA_EXHAUSTED",
        message: `${label} daily free quota exhausted — try again after ${new Date(resetAtMs).toISOString()}`,
        provider,
        status,
        retryable: false,
        failover: true,
        resetAtMs,
        retryAfterMs: c.retryAfterMs,
      });
    }
    if (c.code === "FREE_RATE_LIMITED") {
      return new AiError({
        kind: "retryable",
        code: "FREE_RATE_LIMITED",
        message: `${label} rate limited (per-minute) — retrying`,
        provider,
        status,
        retryable: true,
        failover: true,
        retryAfterMs: c.retryAfterMs,
      });
    }
    return new AiError({
      kind: "retryable",
      code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
      message: `${label} is temporarily throttling requests — retrying`,
      provider,
      status,
      retryable: true,
      failover: true,
      retryAfterMs: c.retryAfterMs,
    });
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new AiError({
      kind: "retryable",
      code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
      message: `${label} returned HTTP ${status} — retrying`,
      provider,
      status,
      retryable: true,
      failover: true,
    });
  }
  if (status >= 400 && status < 500) {
    return new AiError({
      kind: "badRequest",
      code: "BAD_REQUEST",
      message: `${label} rejected the request (HTTP ${status}): ${bodySlice(outcome.bodyText)}`,
      provider,
      status,
    });
  }
  return new AiError({
    kind: "unknown",
    code: "UNKNOWN_ERROR",
    message: `${label} returned an unexpected HTTP ${status}: ${bodySlice(outcome.bodyText)}`,
    provider,
    status,
  });
}

// ---------------------------------------------------------------------------
// Circuit breaker + quota state (per-instance, in-memory only)
// ---------------------------------------------------------------------------

export type BreakerState = {
  consecutiveFailures: number;
  windowStartMs: number;
  openedUntilMs: number;
};

const breakerStates = new Map<ProviderId, BreakerState>();
const quotaBlockedUntil = new Map<ProviderId, number>();

export function isBreakerOpen(provider: ProviderId, nowMs: number): boolean {
  const s = breakerStates.get(provider);
  return !!s && s.openedUntilMs > nowMs;
}

export function getBreakerState(
  provider: ProviderId,
): BreakerState | undefined {
  return breakerStates.get(provider);
}

export function recordProviderSuccess(provider: ProviderId): void {
  breakerStates.delete(provider);
}

export function recordProviderFailure(
  provider: ProviderId,
  nowMs: number,
): void {
  const s = breakerStates.get(provider);
  if (!s || nowMs - s.windowStartMs > AI_CONFIG.breakerWindowMs) {
    breakerStates.set(provider, {
      consecutiveFailures: 1,
      windowStartMs: nowMs,
      openedUntilMs: 0,
    });
    return;
  }
  const next = s.consecutiveFailures + 1;
  if (next >= AI_CONFIG.breakerFailureThreshold) {
    breakerStates.set(provider, {
      consecutiveFailures: next,
      windowStartMs: s.windowStartMs,
      openedUntilMs: nowMs + AI_CONFIG.breakerCooldownMs,
    });
  } else {
    breakerStates.set(provider, { ...s, consecutiveFailures: next });
  }
}

export function isQuotaBlocked(provider: ProviderId, nowMs: number): boolean {
  const until = quotaBlockedUntil.get(provider);
  return typeof until === "number" && until > nowMs;
}

export function getQuotaBlockedUntil(
  provider: ProviderId,
): number | undefined {
  return quotaBlockedUntil.get(provider);
}

export function setQuotaBlocked(
  provider: ProviderId,
  untilMs: number | null,
  nowMs: number,
): void {
  quotaBlockedUntil.set(
    provider,
    untilMs ?? nextMidnightPacificMs(nowMs),
  );
}

/** Test hook: the breaker/quota state is per-instance module state. */
export function __resetAdapterStateForTests(): void {
  breakerStates.clear();
  quotaBlockedUntil.clear();
}

// ---------------------------------------------------------------------------
// Backoff, token estimate, usage logging
// ---------------------------------------------------------------------------

/**
 * Delay before the next retry. A provider retry-after is honoured but
 * capped (AI_CONFIG.retryAfterCapMs); otherwise exponential backoff
 * 1500 ms x 2^attempt + jitter ±25%.
 */
export function backoffDelayMs(
  attempt: number,
  random: () => number,
  retryAfterMs: number | null,
): number {
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, AI_CONFIG.retryAfterCapMs);
  }
  const base = AI_CONFIG.backoffBaseMs * Math.pow(2, attempt);
  const jitter =
    base * AI_CONFIG.backoffJitterFraction * (random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

/**
 * Approximate token count for the input-token ceiling (cost-control §6).
 * ~4 characters per token is the standard rough estimate; it is a guard,
 * not a billing measurement (billing uses the provider's usageMetadata).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type UsageLog = {
  event: "ai_call";
  correlationId: string;
  provider: ProviderId;
  model: string;
  status: number | null;
  code: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

/** Layer B accounting: one JSON line per provider call (append-only). */
export function logUsage(entry: UsageLog): void {
  console.log(JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type AiToolCallRequest = {
  systemPrompt: string;
  userText: string;
  tool: ToolDefinition;
  correlationId?: string;
  /** Test injection: a mock fetch (production callers never pass this). */
  fetchImpl?: typeof fetch;
  /** Test injection: clock (production uses Date.now). */
  now?: () => number;
  /** Test injection: sleep (production uses setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Test injection: randomness for jitter (production uses Math.random). */
  random?: () => number;
  /** Test injection: per-provider timeouts (production uses ai-config). */
  timeouts?: { primaryMs?: number; secondaryMs?: number };
  /** Test injection: primary retry count (production uses ai-config). */
  maxPrimaryRetries?: number;
};

export type AiToolCallSuccess = {
  args: Record<string, unknown>;
  provider: ProviderId;
  model: string;
  usage: ProviderUsage;
  /** Provider calls made for this request (at most 4). */
  calls: number;
  correlationId: string;
};

/**
 * True when the error is a provider-level failure (rate/quota/
 * unavailability/auth/payment) rather than a per-row problem
 * (schema/policy/bad input). Batch handlers use it to stop early: a
 * provider-level failure will hit every remaining row the same way.
 */
export function isProviderLevelError(e: unknown): boolean {
  return (
    e instanceof AiError &&
    (e.code === "FREE_RATE_LIMITED" ||
      e.code === "FREE_QUOTA_EXHAUSTED" ||
      e.code === "PROVIDER_TEMPORARILY_UNAVAILABLE" ||
      e.code === "PROVIDER_AUTH_FAILED" ||
      e.code === "PAYMENT_REQUIRED")
  );
}

/**
 * One forced tool call through the Adapter: primary (Gemini) with bounded
 * retries, then one attempt on the secondary (Groq) — only for retryable
 * or quota errors. Returns the parsed tool-call arguments. Throws
 * AiError on any failure (never returns a partial result).
 */
export async function generateToolCall(
  req: AiToolCallRequest,
): Promise<AiToolCallSuccess> {
  const now = req.now ?? Date.now;
  const sleep =
    req.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = req.random ?? Math.random;
  const correlationId =
    req.correlationId ??
    `ai-${Math.floor(random() * 1e9).toString(36)}-${now()}`;
  const maxPrimaryRetries =
    req.maxPrimaryRetries ?? AI_CONFIG.maxPrimaryRetries;

  // Per-request input-token ceiling (cost-control §6): refuse before any
  // provider call. No shared state is needed for this guard.
  const inputEstimate =
    estimateTokens(req.systemPrompt) +
    estimateTokens(req.userText) +
    estimateTokens(JSON.stringify(req.tool.parameters));
  if (inputEstimate > AI_CONFIG.inputTokenCeiling) {
    throw new AiError({
      kind: "badRequest",
      code: "INPUT_TOO_LARGE",
      message: `Prompt exceeds the per-request input-token ceiling (${inputEstimate} estimated tokens > ${AI_CONFIG.inputTokenCeiling})`,
      provider: null,
      status: null,
    });
  }

  // Fail closed: both provider keys are required (missing key -> 500
  // naming the key, the same behaviour as the pre-migration code).
  const primaryKey = requireSecret(AI_CONFIG.primary.secretName);
  const secondaryKey = requireSecret(AI_CONFIG.secondary.secretName);

  let calls = 0;
  let lastError: AiError | null = null;

  const attemptProvider = async (
    provider: ProviderId,
    attempt: number,
  ): Promise<AiToolCallSuccess> => {
    const started = now();
    const isPrimary = provider === "gemini";
    const cfg = isPrimary ? AI_CONFIG.primary : AI_CONFIG.secondary;
    const key = isPrimary ? primaryKey : secondaryKey;
    const timeoutMs =
      (isPrimary ? req.timeouts?.primaryMs : req.timeouts?.secondaryMs) ??
      cfg.timeoutMs;
    const fetchImpl = req.fetchImpl;
    let outcome: ProviderHttpOutcome;
    if (isPrimary) {
      outcome = await callGemini({
        apiKey: key,
        systemPrompt: req.systemPrompt,
        userText: req.userText,
        tool: req.tool,
        maxOutputTokens: AI_CONFIG.outputTokenCeiling,
        timeoutMs,
        fetchImpl,
      });
    } else {
      outcome = await callGroq({
        apiKey: key,
        systemPrompt: req.systemPrompt,
        userText: req.userText,
        tool: req.tool,
        maxOutputTokens: AI_CONFIG.outputTokenCeiling,
        timeoutMs,
        fetchImpl,
      });
    }
    const latencyMs = now() - started;
    calls++;
    if (outcome.status >= 200 && outcome.status < 300) {
      let json: unknown;
      try {
        json = JSON.parse(outcome.bodyText);
      } catch {
        const e = new AiError({
          kind: "schema",
          code: "SCHEMA_ERROR",
          message: `${providerLabel(provider)} returned a 200 with unparseable JSON`,
          provider,
          status: outcome.status,
        });
        logUsage({
          event: "ai_call",
          correlationId,
          provider,
          model: cfg.model,
          status: outcome.status,
          code: e.code,
          inputTokens: null,
          outputTokens: null,
          latencyMs,
        });
        throw e;
      }
      const parsed = isPrimary
        ? parseGeminiResponse(json)
        : parseGroqResponse(json);
      if (!parsed.ok) {
        const e = new AiError({
          kind: parsed.kind,
          code: parsed.kind === "policy" ? "POLICY_BLOCKED" : "SCHEMA_ERROR",
          message: parsed.message,
          provider,
          status: outcome.status,
        });
        logUsage({
          event: "ai_call",
          correlationId,
          provider,
          model: cfg.model,
          status: outcome.status,
          code: e.code,
          inputTokens: null,
          outputTokens: null,
          latencyMs,
        });
        throw e;
      }
      logUsage({
        event: "ai_call",
        correlationId,
        provider,
        model: cfg.model,
        status: outcome.status,
        code: null,
        inputTokens: parsed.usage.inputTokens,
        outputTokens: parsed.usage.outputTokens,
        latencyMs,
      });
      // A success clears the breaker (including a half-open probe) so a
      // recovered provider is not tripped again by stale failures.
      recordProviderSuccess(provider);
      return {
        args: parsed.args,
        provider,
        model: cfg.model,
        usage: parsed.usage,
        calls,
        correlationId,
      };
    }
    const err = normalizeError(provider, outcome, attempt, now());
    logUsage({
      event: "ai_call",
      correlationId,
      provider,
      model: cfg.model,
      status: outcome.status,
      code: err.code,
      inputTokens: null,
      outputTokens: null,
      latencyMs,
    });
    throw err;
  };

  // PRIMARY (up to 1 + maxPrimaryRetries attempts).
  for (let attempt = 0; attempt <= maxPrimaryRetries; attempt++) {
    if (isQuotaBlocked("gemini", now())) {
      lastError = new AiError({
        kind: "quotaExhausted",
        code: "FREE_QUOTA_EXHAUSTED",
        message:
          "Gemini daily free quota exhausted (recorded earlier on this instance) — try again after the reset window",
        provider: "gemini",
        status: null,
        retryable: false,
        failover: true,
        resetAtMs: getQuotaBlockedUntil("gemini") ?? null,
      });
      break;
    }
    if (isBreakerOpen("gemini", now())) {
      lastError = new AiError({
        kind: "retryable",
        code: "PROVIDER_TEMPORARILY_UNAVAILABLE",
        message:
          "Gemini circuit breaker is open on this instance — trying the secondary",
        provider: "gemini",
        status: null,
        retryable: true,
        failover: true,
      });
      break;
    }
    try {
      return await attemptProvider("gemini", attempt);
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      lastError = e;
      if (e.code === "FREE_QUOTA_EXHAUSTED") {
        setQuotaBlocked("gemini", e.resetAtMs, now());
        break;
      }
      // auth / badRequest / schema / policy / unknown / 402: no retry,
      // no failover — return immediately.
      if (!e.retryable) throw e;
      recordProviderFailure("gemini", now());
      if (attempt < maxPrimaryRetries) {
        await sleep(backoffDelayMs(attempt, random, e.retryAfterMs));
      }
    }
  }

  // SECONDARY (exactly one attempt) — only for retryable or quota errors.
  if (
    lastError &&
    (lastError.retryable || lastError.code === "FREE_QUOTA_EXHAUSTED")
  ) {
    if (!isQuotaBlocked("groq", now()) && !isBreakerOpen("groq", now())) {
      try {
        return await attemptProvider("groq", 0);
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        if (e.code === "FREE_QUOTA_EXHAUSTED") {
          setQuotaBlocked("groq", e.resetAtMs, now());
        }
        if (e.retryable) recordProviderFailure("groq", now());
        e.previousErrors = [lastError, ...e.previousErrors];
        lastError = e;
      }
    }
  }

  if (lastError) throw lastError;
  // Unreachable: every path through the primary loop sets lastError.
  throw new AiError({
    kind: "unknown",
    code: "UNKNOWN_ERROR",
    message: "AI Adapter failed without a provider error",
    provider: null,
    status: null,
  });
}
