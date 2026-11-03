import { delayAfterFailures, PUSH_MAX_ATTEMPTS } from "./push.js";
import type { DeliveryAttempt } from "./types.js";

/**
 * Retry state machine for one delivery row. Pure function — no I/O, no send.
 * Scheduling a retry advances the attempt count and reports the backoff
 * delay before the next attempt. A row at max attempts becomes `failed`
 * (terminal). Any non-retryable status is returned unchanged, so retrying
 * a `sent` or `disabled` row is a no-op and can never double-send.
 */
export function applyRetry(
  attempt: DeliveryAttempt,
): { next: DeliveryAttempt; delayMinutes: number | null; terminal: boolean } {
  if (attempt.status !== "retryable") {
    return { next: attempt, delayMinutes: null, terminal: true };
  }
  if (attempt.attempts >= PUSH_MAX_ATTEMPTS) {
    return {
      next: { ...attempt, status: "failed" },
      delayMinutes: null,
      terminal: true,
    };
  }
  const attempts = attempt.attempts + 1;
  const delayMinutes = delayAfterFailures(attempt.attempts);
  return {
    next: { ...attempt, attempts, status: "retryable" },
    delayMinutes,
    terminal: false,
  };
}

/** A row is a "failed job" when it is retryable or terminally failed. */
export function isFailedJob(attempt: DeliveryAttempt): boolean {
  return attempt.status === "retryable" || attempt.status === "failed";
}
