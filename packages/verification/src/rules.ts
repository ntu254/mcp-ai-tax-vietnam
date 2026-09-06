import {
  SourceAuthority,
  VerificationStatus,
} from "@vietnam-tax/common";

export interface SourceAssertion {
  sourceName: string;
  sourceAuthority: SourceAuthority;
  snapshotId: string;
  documentNumber?: string;
  documentType?: string;
  title?: string;
  issuedDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  rawTextHash?: string;
}

export interface VerificationRuleResult {
  passed: boolean;
  status: VerificationStatus;
  conflicts: Array<{
    fieldName: string;
    sourceA: { name: string; snapshotId: string; value: unknown };
    sourceB: { name: string; snapshotId: string; value: unknown };
    severity: "high" | "medium" | "low";
  }>;
  warnings: string[];
}

/**
 * Rule A — Identity Comparison
 */
export function verifyIdentity(
  assertions: SourceAssertion[]
): VerificationRuleResult {
  const conflicts: VerificationRuleResult["conflicts"] = [];
  const warnings: string[] = [];

  if (assertions.length < 1) {
    return {
      passed: false,
      status: "unverified",
      conflicts,
      warnings: ["No source assertions provided for verification."],
    };
  }

  // Compare document number across sources if more than one
  for (let i = 0; i < assertions.length; i++) {
    for (let j = i + 1; j < assertions.length; j++) {
      const a = assertions[i];
      const b = assertions[j];

      if (a.documentNumber && b.documentNumber && a.documentNumber !== b.documentNumber) {
        conflicts.push({
          fieldName: "document_number",
          sourceA: { name: a.sourceName, snapshotId: a.snapshotId, value: a.documentNumber },
          sourceB: { name: b.sourceName, snapshotId: b.snapshotId, value: b.documentNumber },
          severity: "high",
        });
      }

      if (a.issuedDate && b.issuedDate && a.issuedDate !== b.issuedDate) {
        conflicts.push({
          fieldName: "issued_date",
          sourceA: { name: a.sourceName, snapshotId: a.snapshotId, value: a.issuedDate },
          sourceB: { name: b.sourceName, snapshotId: b.snapshotId, value: b.issuedDate },
          severity: "medium",
        });
      }
    }
  }

  const hasHighConflicts = conflicts.some((c) => c.severity === "high");
  if (hasHighConflicts) {
    return {
      passed: false,
      status: "conflicting",
      conflicts,
      warnings: ["High-authority identity conflict detected between official sources."],
    };
  }

  return {
    passed: true,
    status: assertions.length >= 2 ? "cross_verified" : "single_source_verified",
    conflicts,
    warnings,
  };
}

/**
 * Rule B & C — Effective Date & Authority Conflict
 */
export function verifyEffectiveDate(
  assertions: SourceAssertion[]
): VerificationRuleResult {
  const conflicts: VerificationRuleResult["conflicts"] = [];
  const warnings: string[] = [];

  const dateAssertions = assertions.filter((a) => !!a.effectiveFrom);

  if (dateAssertions.length === 0) {
    // Rule D: Unknown is valid output
    return {
      passed: false,
      status: "unverified",
      conflicts,
      warnings: ["UNKNOWN_EFFECTIVE_DATE: No official source provides effective date."],
    };
  }

  // Rule C: High-authority conflict check
  for (let i = 0; i < dateAssertions.length; i++) {
    for (let j = i + 1; j < dateAssertions.length; j++) {
      const a = dateAssertions[i];
      const b = dateAssertions[j];

      if (
        (a.sourceAuthority === "tier_a" || a.sourceAuthority === "tier_b") &&
        (b.sourceAuthority === "tier_a" || b.sourceAuthority === "tier_b") &&
        a.effectiveFrom !== b.effectiveFrom
      ) {
        conflicts.push({
          fieldName: "default_effective_from",
          sourceA: { name: a.sourceName, snapshotId: a.snapshotId, value: a.effectiveFrom },
          sourceB: { name: b.sourceName, snapshotId: b.snapshotId, value: b.effectiveFrom },
          severity: "high",
        });
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      passed: false,
      status: "conflicting",
      conflicts,
      warnings: ["Official sources disagree on effective date. Auto-resolution disabled."],
    };
  }

  const officialSourcesCount = dateAssertions.filter(
    (a) => a.sourceAuthority === "tier_a" || a.sourceAuthority === "tier_b"
  ).length;

  return {
    passed: true,
    status: officialSourcesCount >= 2 ? "cross_verified" : "single_source_verified",
    conflicts,
    warnings,
  };
}
