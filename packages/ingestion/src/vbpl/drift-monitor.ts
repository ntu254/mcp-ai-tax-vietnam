import { logger } from "@vietnam-tax/observability";
import { computeSha256 } from "@vietnam-tax/source-storage";
import { VbplDocumentDto } from "./types.js";

export type DriftCircuitStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface FieldCoverageStats {
  documentNumber: number;
  title: number;
  issuer: number;
  issuedDate: number;
  effectiveDate: number;
  statusMetadata: number;
}

export interface VbplDriftReport {
  evaluatedAt: string;
  totalSamples: number;
  extractionSuccessRatePct: number;
  identityMatchRatePct: number;
  fieldCoveragePct: FieldCoverageStats;
  selectorFailuresCount: number;
  htmlFingerprint: string;
  previousFingerprint?: string;
  fingerprintChanged: boolean;
  circuitStatus: DriftCircuitStatus;
  flags: string[];
  safeToIngest: boolean;
}

export interface VbplDriftMonitorOptions {
  minExtractionRatePct?: number; // default 98%
  minEffectiveDateRatePct?: number; // default 95%
  maxSelectorFailures?: number; // default 1
}

export class VbplSchemaDriftMonitor {
  private readonly minExtractionRatePct: number;
  private readonly minEffectiveDateRatePct: number;
  private readonly maxSelectorFailures: number;

  constructor(options?: VbplDriftMonitorOptions) {
    this.minExtractionRatePct = options?.minExtractionRatePct ?? 98;
    this.minEffectiveDateRatePct = options?.minEffectiveDateRatePct ?? 95;
    this.maxSelectorFailures = options?.maxSelectorFailures ?? 1;
  }

  /**
   * Per-document Fail-Closed Validation:
   * Rejects assertion generation if essential fields or identity are uncertain.
   */
  public validateDocumentPerItemFailClosed(dto: VbplDocumentDto): {
    valid: boolean;
    reason?: string;
  } {
    if (!dto.documentNumber || dto.documentNumber.trim().length === 0) {
      return { valid: false, reason: "FAIL_CLOSED: Missing required document_number" };
    }
    if (!dto.title || dto.title.trim().length === 0) {
      return { valid: false, reason: "FAIL_CLOSED: Missing required title" };
    }
    if (!dto.sourceUrl || !dto.sourceUrl.startsWith("http")) {
      return { valid: false, reason: "FAIL_CLOSED: Missing valid source locator URL" };
    }
    return { valid: true };
  }

  /**
   * Evaluate extraction results across a sample batch of documents
   * and detect HTML structure changes or degraded parsing.
   */
  public evaluateBatch(
    samples: VbplDocumentDto[],
    rawHtmlSample?: string,
    previousFingerprint?: string
  ): VbplDriftReport {
    const total = samples.length;
    const now = new Date().toISOString();

    if (total === 0) {
      return {
        evaluatedAt: now,
        totalSamples: 0,
        extractionSuccessRatePct: 0,
        identityMatchRatePct: 0,
        fieldCoveragePct: {
          documentNumber: 0,
          title: 0,
          issuer: 0,
          issuedDate: 0,
          effectiveDate: 0,
          statusMetadata: 0,
        },
        selectorFailuresCount: 0,
        htmlFingerprint: "empty",
        fingerprintChanged: false,
        circuitStatus: "DEGRADED",
        flags: ["NO_SAMPLES_EVALUATED"],
        safeToIngest: false,
      };
    }

    // Count field presence
    let hasDocNum = 0;
    let hasTitle = 0;
    let hasIssuer = 0;
    let hasIssuedDate = 0;
    let hasEffectiveDate = 0;
    let hasStatus = 0;
    let fullyExtracted = 0;
    let selectorFailures = 0;

    for (const d of samples) {
      const docNumOk = !!d.documentNumber && d.documentNumber.trim().length > 0;
      const titleOk = !!d.title && d.title.trim().length > 0;
      const issuerOk = !!d.issuer && d.issuer.trim().length > 0;
      const issuedOk = !!d.issuedDate && d.issuedDate.trim().length > 0;
      const effectiveOk = !!d.effectiveDate && d.effectiveDate.trim().length > 0;
      const statusOk = !!d.statusMetadata && d.statusMetadata.trim().length > 0;

      if (docNumOk) hasDocNum++;
      if (titleOk) hasTitle++;
      if (issuerOk) hasIssuer++;
      if (issuedOk) hasIssuedDate++;
      if (effectiveOk) hasEffectiveDate++;
      if (statusOk) hasStatus++;

      // Essential core fields: docNum, title, effectiveDate
      if (docNumOk && titleOk && effectiveOk) {
        fullyExtracted++;
      } else {
        selectorFailures++;
      }
    }

    const extractionRate = (fullyExtracted / total) * 100;
    const identityMatchRate = (hasDocNum / total) * 100;
    const effectiveDateRate = (hasEffectiveDate / total) * 100;

    const coverage: FieldCoverageStats = {
      documentNumber: (hasDocNum / total) * 100,
      title: (hasTitle / total) * 100,
      issuer: (hasIssuer / total) * 100,
      issuedDate: (hasIssuedDate / total) * 100,
      effectiveDate: effectiveDateRate,
      statusMetadata: (hasStatus / total) * 100,
    };

    // Compute structure fingerprint from HTML tag skeleton (ignoring text/ids)
    let htmlFingerprint = "not_provided";
    let fingerprintChanged = false;

    if (rawHtmlSample) {
      const tagSkeleton = Array.from(rawHtmlSample.matchAll(/<([a-zA-Z0-9]+)[^>]*>/g))
        .map((m) => m[1].toLowerCase())
        .filter((t) => t !== "script" && t !== "style")
        .slice(0, 100)
        .join(">");
      htmlFingerprint = computeSha256(tagSkeleton).slice(0, 16);

      if (previousFingerprint && previousFingerprint !== htmlFingerprint) {
        fingerprintChanged = true;
      }
    }

    const flags: string[] = [];
    let circuitStatus: DriftCircuitStatus = "HEALTHY";

    if (extractionRate < this.minExtractionRatePct) {
      flags.push("VBPL_SCHEMA_CHANGED");
      flags.push(`EXTRACTION_DEGRADED_${extractionRate.toFixed(1)}PCT`);
      circuitStatus = "DEGRADED";
    }

    if (effectiveDateRate < this.minEffectiveDateRatePct) {
      flags.push(`EFFECTIVE_DATE_COVERAGE_LOW_${effectiveDateRate.toFixed(1)}PCT`);
      circuitStatus = "DEGRADED";
    }

    if (selectorFailures > this.maxSelectorFailures && total > 10) {
      flags.push(`SELECTOR_FAILURES_${selectorFailures}`);
      if (circuitStatus === "HEALTHY") circuitStatus = "DEGRADED";
    }

    if (fingerprintChanged) {
      flags.push("HTML_FINGERPRINT_SHIFT");
    }

    const safeToIngest = circuitStatus === "HEALTHY";

    if (!safeToIngest) {
      logger.warn(
        {
          circuitStatus,
          flags,
          extractionRate,
          effectiveDateRate,
          selectorFailures,
        },
        "VBPL Schema Drift Monitor: Circuit breaker tripped; unsafe to ingest automated assertions"
      );
    } else {
      logger.debug(
        { extractionRate, effectiveDateRate },
        "VBPL Schema Drift Monitor: Healthy extraction metrics"
      );
    }

    return {
      evaluatedAt: now,
      totalSamples: total,
      extractionSuccessRatePct: extractionRate,
      identityMatchRatePct: identityMatchRate,
      fieldCoveragePct: coverage,
      selectorFailuresCount: selectorFailures,
      htmlFingerprint,
      previousFingerprint,
      fingerprintChanged,
      circuitStatus,
      flags,
      safeToIngest,
    };
  }
}
