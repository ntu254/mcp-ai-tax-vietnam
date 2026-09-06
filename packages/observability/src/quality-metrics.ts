export interface LegalSafetyMetrics {
  totalEvaluated: number;
  draftAsLawCount: number;
  futureAsCurrentCount: number;
  expiredAsCurrentCount: number;
  unsupportedAnswerableCount: number;
  hiddenConflictCount: number;
}

export interface TemporalAccuracyMetrics {
  documentStatusAccuracyPct: number;
  provisionStatusAccuracyPct: number;
  effectiveDateAccuracyPct: number;
}

export interface RetrievalQualityMetrics {
  documentRecallAt10Pct: number;
  provisionRecallAt10Pct: number;
  citationAccuracyPct: number;
}

export interface IngestionQualityMetrics {
  duplicateRatePct: number;
  missedDocumentRatePct: number;
  snapshotMutationRatePct: number;
  recoveryCompletenessPct: number;
}

export interface SystemQualityReport {
  version: string;
  evaluatedAt: string;
  safety: LegalSafetyMetrics;
  temporal: TemporalAccuracyMetrics;
  retrieval: RetrievalQualityMetrics;
  ingestion: IngestionQualityMetrics;
}

export function formatQualityDashboard(report: SystemQualityReport): string {
  const N = report.safety.totalEvaluated;

  const lines: string[] = [
    `================================================================================`,
    `               VIETNAM TAX & LEGAL MCP — QUALITY & SAFETY DASHBOARD`,
    `                     Release: ${report.version} | ${report.evaluatedAt}`,
    `================================================================================`,
    ``,
    `Legal Safety`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Draft-as-law                   ${report.safety.draftAsLawCount} / ${N}`,
    `  Future-as-current              ${report.safety.futureAsCurrentCount} / ${N}`,
    `  Expired-as-current             ${report.safety.expiredAsCurrentCount} / ${N}`,
    `  Unsupported answerable         ${report.safety.unsupportedAnswerableCount} / ${N}`,
    `  Hidden authoritative conflict  ${report.safety.hiddenConflictCount} / ${N}`,
    ``,
    `Temporal`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Document status accuracy       ${report.temporal.documentStatusAccuracyPct.toFixed(1)}%`,
    `  Provision status accuracy      ${report.temporal.provisionStatusAccuracyPct.toFixed(1)}%`,
    `  Effective-date accuracy        ${report.temporal.effectiveDateAccuracyPct.toFixed(1)}%`,
    ``,
    `Retrieval`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Document Recall@10             ${report.retrieval.documentRecallAt10Pct.toFixed(1)}%`,
    `  Provision Recall@10            ${report.retrieval.provisionRecallAt10Pct.toFixed(1)}%`,
    `  Citation accuracy              ${report.retrieval.citationAccuracyPct.toFixed(1)}%`,
    ``,
    `Ingestion`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Duplicate rate                 ${report.ingestion.duplicateRatePct.toFixed(1)}%`,
    `  Missed-document rate           ${report.ingestion.missedDocumentRatePct.toFixed(1)}%`,
    `  Snapshot mutation rate         ${report.ingestion.snapshotMutationRatePct.toFixed(1)}%`,
    `  Recovery completeness          ${report.ingestion.recoveryCompletenessPct.toFixed(1)}%`,
    `================================================================================`,
  ];

  return lines.join("\n");
}
