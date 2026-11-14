// supabase/functions/_shared/ai-config.ts
// Phase 3 (2026-11-13): versioned AI provider configuration for the Adapter.
//
// RULE (revised architecture §1): only credentials are secrets. Everything
// in this file is non-sensitive configuration, reviewed like code. A model
// name or timeout found in the secrets store is a review failure.
// Secret NAMES are listed here (GEMINI_API_KEY, GROQ_API_KEY); secret
// VALUES are never in this file — they live in Supabase Edge Function
// secrets and are read per invocation via requireSecret (ai-adapter.ts).
//
// VALUES: the docs' proposed values are used as the implementer's choice.
// Owner decisions #2 (timeouts/breaker) and #4 (token ceiling/batch limit)
// in PHASE-3-IMPLEMENTATION-READINESS.md §5 are still open; the values
// below are recorded for owner review, not presented as owner decisions.
// Owner decision #3 (monthly cost cap / per-day token cap) is open too:
// the free-only policy makes the monthly paid budget INR 0 by design (no
// paid provider exists in the configuration), and the per-day token cap is
// a placeholder until Phase 5 measures the real free-tier limits.
//
// This module has no imports and no environment access, so it is directly
// importable in plain Node tests. It also carries the shared provider
// types (ToolDefinition, ProviderUsage) so the Adapter and both clients
// agree on one shape without a circular import.

export type ProviderId = "gemini" | "groq";

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

/**
 * The configuration block for one provider, looked up BY PROVIDER —
 * never by role. The clients use this (a client's URL and model belong
 * to its own provider, whichever role that provider currently holds),
 * so swapping primary/secondary in AI_CONFIG never breaks a client.
 */
export function providerConfig(provider: ProviderId) {
  return AI_CONFIG.primary.id === provider
    ? AI_CONFIG.primary
    : AI_CONFIG.secondary;
}

export const AI_CONFIG = {
  // PRIMARY is Groq (owner decision 2026-11-14): the Gemini API free
  // tier is NOT available for the owner's Google account — it is
  // unavailable across multiple newly created projects, and the owner
  // will not enable billing (free-only policy, INR 0). Do NOT create
  // new Gemini projects or keys to work around this. Groq is the
  // primary until a working Gemini free-tier key exists; the Gemini
  // client, secret name, and failover path below are KEPT so Gemini
  // can be restored as primary later by swapping these two blocks.
  primary: {
    id: "groq" as ProviderId,
    model: "openai/gpt-oss-120b",
    baseUrl: "https://api.groq.com/openai/v1",
    secretName: "GROQ_API_KEY",
    timeoutMs: 90_000,
  },
  secondary: {
    id: "gemini" as ProviderId,
    model: "gemini-3-flash-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    secretName: "GEMINI_API_KEY",
    timeoutMs: 60_000,
  },
  // Health-probe timeout (architecture §6: free signals only; the probe
  // itself is NOT a model call and is not used in Phase 3).
  probeTimeoutMs: 10_000,
  // Bounded retry (failover §3): primary max 2 retries, then ONE attempt
  // on the secondary. At most 4 provider calls per request, never parallel.
  maxPrimaryRetries: 2,
  secondaryAttempts: 1,
  // Backoff: 1500 ms x 2^attempt + jitter ±25% (failover §3).
  backoffBaseMs: 1500,
  backoffJitterFraction: 0.25,
  // A provider's retry-after header is honoured, but never waited longer
  // than this inside one function call (implementer's choice: an Edge
  // Function must not sleep for minutes on a single row).
  retryAfterCapMs: 30_000,
  // Per-instance circuit breaker (architecture §2): 5 consecutive
  // retryable failures on one provider within 5 minutes -> open 60 s.
  breakerFailureThreshold: 5,
  breakerWindowMs: 5 * 60_000,
  breakerCooldownMs: 60_000,
  // Per-request input-token ceiling (readiness §5 decision 4 proposed
  // default, 8,000 — implementer's choice for owner review).
  inputTokenCeiling: 8000,
  // Per-request output-token ceiling (task-specified, 4,096).
  outputTokenCeiling: 4096,
  // Admin batch row limit (readiness §5 decision 4 proposed default).
  batchMaxRows: 20,
  // Free-only: monthly paid budget INR 0. No paid provider exists in the
  // configuration, so there is nothing to charge.
  monthlyPaidBudgetInr: 0,
  // Per-day token cap: PLACEHOLDER (readiness §5 decision 3 is open).
  // Set in Phase 5 from the measured free-tier limits; until then the
  // provider-side free-tier limits are the only cap.
  dailyTokenCap: null as number | null,
  // 429 classification (failover §1a): a reset duration longer than this
  // is a DAILY quota window (hours); shorter is a per-minute window.
  // Per-minute windows reset within 60 s, so anything above 120 s is
  // unambiguously a longer window (implementer's choice).
  longResetThresholdMs: 120_000,
} as const;
