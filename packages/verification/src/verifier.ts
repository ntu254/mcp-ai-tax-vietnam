import { eq } from "drizzle-orm";
import {
  DatabaseInstance,
  documentSources,
  legalDocuments,
  sourceSnapshots,
  verificationConflicts,
} from "@vietnam-tax/db";
import { SourceAuthority, VerificationStatus } from "@vietnam-tax/common";
import { buildAuditEvent, logger } from "@vietnam-tax/observability";
import {
  SourceAssertion,
  verifyEffectiveDate,
  verifyIdentity,
} from "./rules.js";

export interface DocumentVerificationSummary {
  documentId: string;
  finalStatus: VerificationStatus;
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

      const current = snapshots.find((snap) => snap.is_current) ?? snapshots[0];
      if (current) {
        assertions.push({
          sourceName: s.source_name,
          sourceAuthority: s.source_authority as SourceAuthority,
          snapshotId: current.id,
          documentNumber: doc.document_number ?? undefined,
          documentType: doc.document_type,
          title: doc.title,
          issuedDate: doc.issued_date ?? undefined,
          effectiveFrom: doc.default_effective_from ?? undefined,
          effectiveTo: doc.default_effective_to ?? undefined,
          rawTextHash: current.normalized_text_hash ?? current.page_hash ?? undefined,
        });
      }
    }

    const identityRes = verifyIdentity(assertions);
    const dateRes = verifyEffectiveDate(assertions);

    const allConflicts = [...identityRes.conflicts, ...dateRes.conflicts];
    const allWarnings = [...identityRes.warnings, ...dateRes.warnings];

    let finalStatus: VerificationStatus = "unverified";

    if (allConflicts.length > 0) {
      finalStatus = "conflicting";
    } else if (identityRes.passed && dateRes.passed) {
      finalStatus =
        assertions.length >= 2 ? "cross_verified" : "single_source_verified";
    } else if (identityRes.passed) {
      finalStatus = "single_source_verified";
    }

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
        conflictsCount: allConflicts.length,
      },
    });

    logger.info(
      { documentId, finalStatus, conflictsCount: allConflicts.length },
      "Document verification completed"
    );

    return {
      documentId,
      finalStatus,
      officialSourceCount: assertions.filter(
        (a) => a.sourceAuthority === "tier_a" || a.sourceAuthority === "tier_b"
      ).length,
      conflictsCount: allConflicts.length,
      warnings: allWarnings,
    };
  }
}
