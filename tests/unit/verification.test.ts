import { describe, expect, it } from "vitest";
import {
  verifyEffectiveDate,
  verifyIdentity,
} from "@vietnam-tax/verification";

describe("Verification Engine Rules", () => {
  it("Rule A: detects document number conflict between sources", () => {
    const res = verifyIdentity([
      {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "snap-1",
        documentNumber: "123/2020/ND-CP",
      },
      {
        sourceName: "vbpl",
        sourceAuthority: "tier_a",
        snapshotId: "snap-2",
        documentNumber: "124/2020/ND-CP", // Conflict
      },
    ]);

    expect(res.passed).toBe(false);
    expect(res.status).toBe("conflicting");
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.conflicts[0].fieldName).toBe("document_number");
  });

  it("Rule A: passes cross-verification when identity is consistent across >=2 official sources", () => {
    const res = verifyIdentity([
      {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "snap-1",
        documentNumber: "123/2020/ND-CP",
        issuedDate: "2020-10-19",
      },
      {
        sourceName: "chinhphu",
        sourceAuthority: "tier_b",
        snapshotId: "snap-2",
        documentNumber: "123/2020/ND-CP",
        issuedDate: "2020-10-19",
      },
    ]);

    expect(res.passed).toBe(true);
    expect(res.status).toBe("cross_verified");
    expect(res.conflicts.length).toBe(0);
  });

  it("Rule B: verifies effective date from official source", () => {
    const res = verifyEffectiveDate([
      {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "snap-1",
        effectiveFrom: "2022-07-01",
      },
    ]);

    expect(res.passed).toBe(true);
    expect(res.status).toBe("single_source_verified");
  });

  it("Rule C: flags conflict when Tier A/B sources disagree on effective date", () => {
    const res = verifyEffectiveDate([
      {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "snap-1",
        effectiveFrom: "2022-07-01",
      },
      {
        sourceName: "mof",
        sourceAuthority: "tier_b",
        snapshotId: "snap-2",
        effectiveFrom: "2022-01-01", // Disagreement
      },
    ]);

    expect(res.passed).toBe(false);
    expect(res.status).toBe("conflicting");
    expect(res.conflicts.some((c) => c.fieldName === "default_effective_from")).toBe(true);
  });

  it("Rule D: returns unverified/unknown when effective date is missing", () => {
    const res = verifyEffectiveDate([
      {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "snap-1",
      },
    ]);

    expect(res.passed).toBe(false);
    expect(res.status).toBe("unverified");
    expect(res.warnings).toContain(
      "UNKNOWN_EFFECTIVE_DATE: No official source provides effective date."
    );
  });
});
