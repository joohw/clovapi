export type AuthRateKind = "email" | "ip";

export interface RateWindow {
  durationMs: number;
  limit: number;
}

export interface RateDecision {
  allowed: boolean;
  retryAfterMs: number;
}

export const AUTH_RATE_POLICIES: Readonly<Record<AuthRateKind, readonly RateWindow[]>> = {
  email: [
    { durationMs: 60_000, limit: 1 },
    { durationMs: 60 * 60_000, limit: 5 },
  ],
  ip: [
    { durationMs: 60_000, limit: 5 },
    { durationMs: 60 * 60_000, limit: 30 },
  ],
};

export function isAuthRateKind(value: unknown): value is AuthRateKind {
  return value === "email" || value === "ip";
}

export function evaluateAuthRate(
  timestamps: readonly number[],
  now: number,
  windows: readonly RateWindow[],
): RateDecision {
  const ordered = [...timestamps].sort((left, right) => left - right);
  let retryAfterMs = 0;

  for (const window of windows) {
    const relevant = ordered.filter((timestamp) => timestamp > now - window.durationMs);
    if (relevant.length < window.limit) continue;

    // If historical data exceeds the current policy, wait until enough of the
    // oldest claims have left this sliding window for one new claim to fit.
    const blockingTimestamp = relevant[relevant.length - window.limit];
    retryAfterMs = Math.max(retryAfterMs, blockingTimestamp + window.durationMs - now);
  }

  return retryAfterMs > 0
    ? { allowed: false, retryAfterMs }
    : { allowed: true, retryAfterMs: 0 };
}
