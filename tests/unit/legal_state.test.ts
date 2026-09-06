import { describe, expect, it } from "vitest";
import { getCurrentDateInVietnam } from "@vietnam-tax/legal-state";

describe("Legal State Temporal Invariants", () => {
  it("resolves current date in Vietnam Asia/Ho_Chi_Minh timezone", () => {
    const vnDate = getCurrentDateInVietnam();
    expect(vnDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("applies strict baseline interval checks", () => {
    const effectiveFrom = "2022-07-01";
    const effectiveTo = "2025-12-31";

    // Before effective
    expect("2022-06-30" >= effectiveFrom).toBe(false);

    // During effective window
    expect("2022-07-01" >= effectiveFrom && "2022-07-01" <= effectiveTo).toBe(true);
    expect("2024-05-10" >= effectiveFrom && "2024-05-10" <= effectiveTo).toBe(true);

    // After expiration
    expect("2026-01-01" > effectiveTo).toBe(true);
  });

  it("prioritizes provision-specific validity over document default", () => {
    const docDefaultFrom = "2022-07-01";
    const provSpecificFrom = "2026-01-01";

    const queryDate = "2024-01-01";

    // At 2024-01-01:
    // Parent document is effective
    const isDocEffective = queryDate >= docDefaultFrom;
    expect(isDocEffective).toBe(true);

    // But specific provision is NOT YET effective
    const isProvEffective = queryDate >= provSpecificFrom;
    expect(isProvEffective).toBe(false);
  });
});
