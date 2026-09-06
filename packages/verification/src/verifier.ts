import { and, eq } from "drizzle-orm";
import {
  DatabaseInstance,
  documentSources,
  legalDocuments,
  sourceSnapshots,
  legalEvidence,
  verificationConflicts,
} from "@vietnam-tax/db";
import { SourceAuthority, VerificationStatus } from "@vietnam-tax/common";
import { buildAuditEvent, logger } from "@vietnam-tax/observability";
import {
  SourceAssertion,
  verifyEffectiveDate,
  verifyIdentity,
  verifyStatusAndValidity,
} from "./rules.js";

export interface DocumentVerificationSummary {
  documentId: string;
  finalStatus: VerificationStatus;
  answerable: boolean;
  officialSourceCount: number;
  conflictsCount: number;
  warnings: string[];
}

export class VerificationEngine {
  constructor(private readonly db: DatabaseInstance) {}

  public async verifyDocument(
    documentId: string
  ): Promise<DocumentVerificationSummary> {
    const docRows = await this.db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.id, documentId))
      .limit(1);

    if (docRows.length === 0) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const doc = docRows[0];

    // Fetch all sources and their current snapshots
    const sources = await this.db
      .select()
      .from(documentSources)
      .where(eq(documentSources.document_id, documentId));

    const assertions: SourceAssertion[] = [];

    for (const s of sources) {
      const snapshots = await this.db
        .select()
        .from(sourceSnapshots)
        .where(eq(sourceSnapshots.source_id, s.id));

      const current =
        (s.current_snapshot_id
          ? snapshots.find((snap) => snap.id === s.current_snapshot_id)
          : undefined) ??
        snapshots.find((snap) => snap.is_current) ??
        snapshots[0];
      if (current) {
        // 3-Layer Defense in Depth:
        // Layer 1 & 2: SQL column filtering on environment, quarantine, and origin
        const rawEvidenceItems = await this.db
          .select()
          .from(legalEvidence)
          .where(
            and(
              eq(legalEvidence.source_snapshot_id, current.id),
              eq(legalEvidence.is_quarantined, false),
              eq(legalEvidence.environment, "production")
            )
          );

        // Layer 3: Application-level locator and origin invariant check
        const evidenceItems = rawEvidenceItems.filter((e) => {
          const locator = e.evidence_locator as Record<string, unknown> | null;
          const isOriginValid =
            e.evidence_origin === "live_official" ||
            e.evidence_origin === "imported_official";
          const isFixture =
            !isOriginValid ||
            e.evidence_type === "test_fixture" ||
            e.evidence_type === "synthetic_test" ||
            locator?.is_fixture === true ||
            locator?.evidence_origin === "test_fixture" ||
            locator?.quarantined === true;
          return !isFixture;
        });

        const getEvidenceVal = (fieldName: string): any => {
          const item = evidenceItems.find((e) => e.field_name === fieldName);
          return item?.asserted_value;
        };

        const assertedDocNum =
          getEvidenceVal("document_number") ?? doc.document_number ?? undefined;
        const assertedEffDate =
          getEvidenceVal("default_effective_from") ??
          getEvidenceVal("effective_date") ??
          doc.default_effective_from ??
          undefined;
        const assertedIssuedDate =
          getEvidenceVal("issued_date") ?? doc.issued_date ?? undefined;
        const assertedTitle =
          getEvidenceVal("title") ?? doc.title;
        const assertedIssuer =
          getEvidenceVal("issuer") ?? doc.issuer_name ?? undefined;

        assertions.push({
          sourceName: s.source_name,
          sourceAuthority: s.source_authority as SourceAuthority,
          snapshotId: current.id,
          documentNumber: assertedDocNum,
          documentType: doc.document_type,
          title: assertedTitle,
          issuer: assertedIssuer,
          issuedDate: assertedIssuedDate,
          effectiveFrom: assertedEffDate,
          effectiveTo:
            getEvidenceVal("default_effective_to") ??
            doc.default_effective_to ??
            undefined,
          statusMetadata: getEvidenceVal("status_metadata") ?? undefined,
          relationships: getEvidenceVal("relationships") ?? undefined,
          history: getEvidenceVal("history") ?? undefined,
          attachments: getEvidenceVal("attachments") ?? undefined,
          vbplId: getEvidenceVal("vbpl_item_id") ?? undefined,
          rawTextHash: current.normalized_text_hash ?? current.page_hash ?? undefined,
        });
      }
    }

    const identityRes = verifyIdentity(assertions);
    const dateRes = verifyEffectiveDate(assertions);
    const validityRes = verifyStatusAndValidity(assertions);

    const allConflicts = [
      ...identityRes.conflicts,
      ...dateRes.conflicts,
      ...validityRes.conflicts,
    ];
    const allWarnings = [
      ...identityRes.warnings,
      ...dateRes.warnings,
      ...validityRes.warnings,
    ];

    let finalStatus: VerificationStatus = "unverified";

    if (allConflicts.length > 0) {
      finalStatus = "conflicting";
    } else if (identityRes.passed && dateRes.passed && validityRes.passed) {
      finalStatus =
        assertions.length >= 2 ? "cross_verified" : "single_source_verified";
    } else if (identityRes.passed) {
      finalStatus = "single_source_verified";
    }

    // Effect-affecting conflicts disable answerable
    const hasHighConflict = allConflicts.some((c) => c.severity === "high");
    const answerable =
      !hasHighConflict &&
      (finalStatus === "cross_verified" || finalStatus === "single_source_verified");

    // Record conflicts in DB
    const now = new Date();
    for (const c of allConflicts) {
      await this.db.insert(verificationConflicts).values({
        id: crypto.randomUUID(),
        document_id: documentId,
        field_name: c.fieldName,
        source_a_snapshot_id: c.sourceA.snapshotId,
        source_a_value: c.sourceA.value,
        source_b_snapshot_id: c.sourceB.snapshotId,
        source_b_value: c.sourceB.value,
        conflict_type: "VALUE_MISMATCH",
        severity: c.severity,
        resolved: false,
        created_at: now,
        updated_at: now,
      });
    }

    // Update document verification status
    await this.db
      .update(legalDocuments)
      .set({
        verification_status: finalStatus,
        last_verified_at: now,
        updated_at: now,
      })
      .where(eq(legalDocuments.id, documentId));

    buildAuditEvent({
      eventName: "DOCUMENT_VERIFIED",
      entityType: "legal_documents",
      entityId: documentId,
      actor: "verification_engine",
      details: {
        status: finalStatus,
        answerable,
        conflictsCount: allConflicts.length,
      },
    });

    logger.info(
      { documentId, finalStatus, answerable, conflictsCount: allConflicts.length },
      "Document verification completed"
    );

    return {
      documentId,
      finalStatus,
      answerable,
      officialSourceCount: assertions.filter(
        (a) => a.sourceAuthority === "tier_a" || a.sourceAuthority === "tier_b"
      ).length,
      conflictsCount: allConflicts.length,
      warnings: allWarnings,
    };
  }
}
