export interface LegalSafetyMetrics {
  totalEvaluated: number;
  draftAsLawCount: number;
  futureAsCurrentCount: number;
  expiredAsCurrentCount: number;
  unsupportedAnswerableCount: number;
  hiddenConflictCount: number;
}

export interface TemporalAccuracyMetrics {
  goldenDocumentStatusAccuracyPct: number;
  goldenProvisionStatusAccuracyPct: number;
  goldenEffectiveDateAccuracyPct: number;
}

export interface RetrievalQualityMetrics {
  documentRecallAt10Pct: number;
  provisionRecallAt10Pct: number;
  precisionAt5Pct: number;
  precisionAt10Pct: number;
  meanReciprocalRank: number;
  nDCGAt10: number;
  citationAccuracyPct: number;
  duplicateResultRatePct: number;
  irrelevantEffectiveRuleRatePct: number;
}

export interface ProvisionDistributionMetrics {
  documentsWithProvisions: number;
  totalProvisions: number;
  meanProvisionsPerDoc: number;
  medianProvisionsPerDoc: number;
  p95ProvisionsPerDoc: number;
  maxProvisionsPerDoc: number;
  fallbackOnlyDocs: number;
}

export interface CoverageAccountingMetrics {
  totalDocumentsIndexed: number;
  expectedParseable: number;
  structuredSuccessfully: number;
  fallbackOnlyDocs: number;
  metadataOnlyDocs: number;
  attachmentUnavailable: number;
  parserFailed: number;
  ocrRequired: number;
  pendingReprocessing: number;
}

export interface GoldenBenchmarkAuditMetrics {
  expertLegalCases: number;
  datasetIntegrityTests: number;
  totalAutomatedGoldenTests: number;
  totalTestSuiteCases: number;
  expertReviewStatus: string;
  reviewedAt: string;
}

export interface DomainIntegrityMetrics {
  orphanStubDocuments: number;
  duplicateCanonicalDocs: number;
  sourcesWithoutDocument: number;
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
  provisionDistribution: ProvisionDistributionMetrics;
  coverageAccounting: CoverageAccountingMetrics;
  goldenBenchmarkAudit: GoldenBenchmarkAuditMetrics;
  domainIntegrity: DomainIntegrityMetrics;
  ingestion: IngestionQualityMetrics;
}

export function formatQualityDashboard(report: SystemQualityReport): string {
  const N = report.safety.totalEvaluated;
  const p = report.provisionDistribution;
  const c = report.coverageAccounting;
  const g = report.goldenBenchmarkAudit;
  const d = report.domainIntegrity;

  const lines: string[] = [
    `================================================================================`,
    `               VIETNAM TAX & LEGAL MCP — QUALITY & SAFETY DASHBOARD`,
    `                     Release: ${report.version} | ${report.evaluatedAt}`,
    `================================================================================`,
    ``,
    `Production Golden Benchmark Audit Trail (Section 56 & 57)`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Expert-verified legal cases    ${g.expertLegalCases} / 100`,
    `  Dataset schema integrity tests ${g.datasetIntegrityTests}`,
    `  Total automated golden tests   ${g.totalAutomatedGoldenTests}`,
    `  Total automated test suite     ${g.totalTestSuiteCases}`,
    `  Expert review status           ${g.expertReviewStatus}`,
    `  Audit baseline timestamp       ${g.reviewedAt}`,
    ``,
    `Legal Safety`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Draft-as-law                   ${report.safety.draftAsLawCount} / ${N}`,
    `  Future-as-current              ${report.safety.futureAsCurrentCount} / ${N}`,
    `  Expired-as-current             ${report.safety.expiredAsCurrentCount} / ${N}`,
    `  Unsupported answerable         ${report.safety.unsupportedAnswerableCount} / ${N}`,
    `  Hidden authoritative conflict  ${report.safety.hiddenConflictCount} / ${N}`,
    ``,
    `Temporal Evaluation Accuracy (Verified Benchmark)`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Golden-set doc status accuracy ${report.temporal.goldenDocumentStatusAccuracyPct.toFixed(1)}%`,
    `  Golden-set prov status accuracy${report.temporal.goldenProvisionStatusAccuracyPct.toFixed(1)}%`,
    `  Golden-set eff-date accuracy   ${report.temporal.goldenEffectiveDateAccuracyPct.toFixed(1)}%`,
    ``,
    `Retrieval Quality & Ranking`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Precision@5                    ${report.retrieval.precisionAt5Pct.toFixed(1)}%`,
    `  Precision@10                   ${report.retrieval.precisionAt10Pct.toFixed(1)}%`,
    `  Document Recall@10             ${report.retrieval.documentRecallAt10Pct.toFixed(1)}%`,
    `  Provision Recall@10            ${report.retrieval.provisionRecallAt10Pct.toFixed(1)}%`,
    `  MRR (Mean Reciprocal Rank)     ${report.retrieval.meanReciprocalRank.toFixed(2)}`,
    `  nDCG@10                        ${report.retrieval.nDCGAt10.toFixed(2)}`,
    `  Citation accuracy              ${report.retrieval.citationAccuracyPct.toFixed(1)}%`,
    `  Duplicate-result rate          ${report.retrieval.duplicateResultRatePct.toFixed(1)}%`,
    `  Irrelevant-effective-rule rate ${report.retrieval.irrelevantEffectiveRuleRatePct.toFixed(1)}%`,
    ``,
    `Structured Provision Distribution (PostgreSQL 17 Grounded)`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Documents with provisions      ${p.documentsWithProvisions}`,
    `  Total provisions segmented     ${p.totalProvisions}`,
    `  Mean provisions / document     ${p.meanProvisionsPerDoc.toFixed(1)}`,
    `  Median provisions / document   ${p.medianProvisionsPerDoc}`,
    `  P95 provisions / document      ${p.p95ProvisionsPerDoc}`,
    `  Max provisions / document      ${p.maxProvisionsPerDoc}`,
    `  Fallback-only documents        ${p.fallbackOnlyDocs}`,
    ``,
    `Document Ingestion & Body Processing Accounting`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Total documents indexed        ${c.totalDocumentsIndexed}`,
    `  Expected parseable             ${c.expectedParseable}`,
    `  Structured successfully        ${c.structuredSuccessfully}`,
    `  Fallback-only (short/summary)  ${c.fallbackOnlyDocs}`,
    `  Metadata-only (signed on CDN)  ${c.metadataOnlyDocs}`,
    `  Attachment unavailable         ${c.attachmentUnavailable}`,
    `  Parser failures                ${c.parserFailed}`,
    `  OCR required (scanned PDF)     ${c.ocrRequired}`,
    `  Pending reprocessing           ${c.pendingReprocessing}`,
    ``,
    `Domain Integrity (Relational Correctness)`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Orphan stub documents          ${d.orphanStubDocuments}`,
    `  Duplicate canonical docs       ${d.duplicateCanonicalDocs}`,
    `  Sources without document       ${d.sourcesWithoutDocument}`,
    ``,
    `Ingestion & Resilience`,
    `────────────────────────────────────────────────────────────────────────────────`,
    `  Duplicate rate                 ${report.ingestion.duplicateRatePct.toFixed(1)}%`,
    `  Missed-document rate           ${report.ingestion.missedDocumentRatePct.toFixed(1)}%`,
    `  Snapshot mutation rate         ${report.ingestion.snapshotMutationRatePct.toFixed(1)}%`,
    `  Recovery completeness          ${report.ingestion.recoveryCompletenessPct.toFixed(1)}%`,
    `================================================================================`,
  ];

  return lines.join("\n");
}
