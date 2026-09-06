import { describe, expect, it } from "vitest";
import { computeNextRetryWithJitter } from "@vietnam-tax/ingestion";

describe("VbplAsyncVerificationWorker — Schedule, Retry Backoff & Jitter (Step 4)", () => {
  it("computes exponential retry schedule [6h, 24h, 72h] with randomized jitter", () => {
    const now = Date.now();

    // Attempt 1: ~6 hours
    const retry1 = computeNextRetryWithJitter(1, [6, 24, 72], 0.2);
    const diffHours1 = (retry1.getTime() - now) / (3600 * 1000);
    expect(diffHours1).toBeGreaterThanOrEqual(6 * 0.79);
    expect(diffHours1).toBeLessThanOrEqual(6 * 1.21);

    // Attempt 2: ~24 hours
    const retry2 = computeNextRetryWithJitter(2, [6, 24, 72], 0.2);
    const diffHours2 = (retry2.getTime() - now) / (3600 * 1000);
    expect(diffHours2).toBeGreaterThanOrEqual(24 * 0.79);
    expect(diffHours2).toBeLessThanOrEqual(24 * 1.21);

    // Attempt 3: ~72 hours
    const retry3 = computeNextRetryWithJitter(3, [6, 24, 72], 0.2);
    const diffHours3 = (retry3.getTime() - now) / (3600 * 1000);
    expect(diffHours3).toBeGreaterThanOrEqual(72 * 0.79);
    expect(diffHours3).toBeLessThanOrEqual(72 * 1.21);
  });

  it("ensures jitter produces dispersed timestamps to prevent request storms against VBPL", () => {
    const timestamps = Array(20)
      .fill(0)
      .map(() => computeNextRetryWithJitter(1, [6, 24, 72], 0.2).getTime());

    const uniqueTimestamps = new Set(timestamps);
    // Across 20 samples, random jitter should generate multiple distinct timestamps
    expect(uniqueTimestamps.size).toBeGreaterThan(10);
  });
});
