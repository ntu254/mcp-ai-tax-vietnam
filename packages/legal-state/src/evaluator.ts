import { and, eq, lte, or, isNull } from "drizzle-orm";
import {
  DatabaseInstance,
  documentRelationships,
  legalDocuments,
  legalEvidence,
  legalProvisions,
} from "@vietnam-tax/db";
import {
  EvaluatedLegalStatus,
  EvidenceItem,
  RelationshipType,
} from "@vietnam-tax/common";
import { logger } from "@vietnam-tax/observability";

export interface DocumentStatusEvaluation {
  documentId: string;
  evaluatedAt: string; // YYYY-MM-DD
  status: EvaluatedLegalStatus;
  isEffective: boolean;
  warnings: string[];
  relationshipsAffecting: Array<{
    type: RelationshipType;
    sourceDocumentId: string;
    targetDocumentId: string;
    effectiveFrom?: string | null;
  }>;
}

export interface ProvisionStatusEvaluation {
  provisionId: string;
  documentId: string;
  article?: string | null;
  clause?: string | null;
  evaluatedAt: string;
  status: EvaluatedLegalStatus;
  isEffective: boolean;
  warnings: string[];
  statusOverride?: string | null;
}

export function getCurrentDateInVietnam(): string {
  // Format current date in Asia/Ho_Chi_Minh (UTC+7)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export class LegalStateEngine {
  constructor(private readonly db: DatabaseInstance) {}

  public async evaluateDocumentStatus(
    documentId: string,
    queryDate?: string
  ): Promise<DocumentStatusEvaluation> {
    const evaluatedAt = queryDate ?? getCurrentDateInVietnam();
    const warnings: string[] = [];

    const docRows = await this.db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.id, documentId))
      .limit(1);

    if (docRows.length === 0) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const doc = docRows[0];

    // Invariant 1: Draft or Proposal can NEVER be effective law
    if (
      doc.document_nature === "draft" ||
      doc.document_nature === "proposal" ||
      doc.document_nature === "consultation"
    ) {
      return {
        documentId,
        evaluatedAt,
        status: "not_yet_effective",
        isEffective: false,
        warnings: [
          `Document nature is '${doc.document_nature}'. Drafts and proposals are not effective law.`,
        ],
        relationshipsAffecting: [],
      };
    }

    // Invariant 2: Check effective date interval
    if (!doc.default_effective_from) {
      return {
        documentId,
        evaluatedAt,
        status: "unknown",
        isEffective: false,
        warnings: [
          "MISSING_EFFECTIVE_DATE: Document has no verified default effective date.",
        ],
        relationshipsAffecting: [],
      };
    }

    if (evaluatedAt < doc.default_effective_from) {
      return {
        documentId,
        evaluatedAt,
        status: "not_yet_effective",
        isEffective: false,
        warnings: [
          `Document effective date (${doc.default_effective_from}) is in the future relative to query date (${evaluatedAt}).`,
        ],
        relationshipsAffecting: [],
      };
    }

    if (doc.default_effective_to && evaluatedAt > doc.default_effective_to) {
      return {
        documentId,
        evaluatedAt,
        status: "expired",
        isEffective: false,
        warnings: [
          `Document expired on ${doc.default_effective_to} before query date ${evaluatedAt}.`,
        ],
        relationshipsAffecting: [],
      };
    }

    // Check relationships where THIS document is the TARGET (affected by other documents)
    const incomingRelationships = await this.db
      .select()
      .from(documentRelationships)
      .where(eq(documentRelationships.target_document_id, documentId));

    const activeAffectingRels: DocumentStatusEvaluation["relationshipsAffecting"] =
      [];

    let isRepealed = false;
    let isReplaced = false;
    let isSuspended = false;
    let hasPartialRepeal = false;

    for (const rel of incomingRelationships) {
      // Check if relationship is active at evaluatedAt
      if (rel.effective_from && evaluatedAt < rel.effective_from) {
        continue; // Not yet effective
      }
      if (rel.effective_to && evaluatedAt > rel.effective_to) {
        continue; // Expired relationship
      }

      const relType = rel.relationship_type as RelationshipType;

      if (relType === "repeals") {
        isRepealed = true;
        activeAffectingRels.push({
          type: relType,
          sourceDocumentId: rel.source_document_id,
          targetDocumentId: rel.target_document_id,
          effectiveFrom: rel.effective_from,
        });
      } else if (relType === "replaces") {
        isReplaced = true;
        activeAffectingRels.push({
          type: relType,
          sourceDocumentId: rel.source_document_id,
          targetDocumentId: rel.target_document_id,
          effectiveFrom: rel.effective_from,
        });
      } else if (relType === "suspends") {
        isSuspended = true;
        activeAffectingRels.push({
          type: relType,
          sourceDocumentId: rel.source_document_id,
          targetDocumentId: rel.target_document_id,
          effectiveFrom: rel.effective_from,
        });
      } else if (relType === "partially_repeals") {
        hasPartialRepeal = true;
        activeAffectingRels.push({
          type: relType,
          sourceDocumentId: rel.source_document_id,
          targetDocumentId: rel.target_document_id,
          effectiveFrom: rel.effective_from,
        });
      }
    }

    if (isRepealed) {
      return {
        documentId,
        evaluatedAt,
        status: "repealed",
        isEffective: false,
        warnings: ["Document has been repealed by a subsequent legal document."],
        relationshipsAffecting: activeAffectingRels,
      };
    }

    if (isReplaced) {
      return {
        documentId,
        evaluatedAt,
        status: "replaced",
        isEffective: false,
        warnings: ["Document has been replaced by a subsequent legal document."],
        relationshipsAffecting: activeAffectingRels,
      };
    }

    if (isSuspended) {
      return {
        documentId,
        evaluatedAt,
        status: "suspended",
        isEffective: false,
        warnings: ["Document validity is currently suspended."],
        relationshipsAffecting: activeAffectingRels,
      };
    }

    if (hasPartialRepeal) {
      return {
        documentId,
        evaluatedAt,
        status: "partially_effective",
        isEffective: true,
        warnings: [
          "Specific provisions of this document have been repealed; unrepealed provisions remain in force.",
        ],
        relationshipsAffecting: activeAffectingRels,
      };
    }
    return {
      documentId,
      evaluatedAt,
      status: "effective",
      isEffective: true,
      warnings: [],
      relationshipsAffecting: activeAffectingRels,
    };
  }

  public async evaluateProvisionStatus(
    provisionId: string,
    queryDate?: string
  ): Promise<ProvisionStatusEvaluation> {
    const evaluatedAt = queryDate ?? getCurrentDateInVietnam();
    const warnings: string[] = [];

    const provRows = await this.db
      .select()
      .from(legalProvisions)
      .where(eq(legalProvisions.id, provisionId))
      .limit(1);

    if (provRows.length === 0) {
      throw new Error(`Provision not found: ${provisionId}`);
    }

    const prov = provRows[0];

    // Evaluate parent document first
    const docEvaluation = await this.evaluateDocumentStatus(
      prov.document_id,
      evaluatedAt
    );

    // If whole document is repealed, replaced, or not yet effective, provision inherits it
    if (
      docEvaluation.status === "repealed" ||
      docEvaluation.status === "replaced" ||
      docEvaluation.status === "not_yet_effective" ||
      docEvaluation.status === "expired" ||
      docEvaluation.status === "suspended"
    ) {
      return {
        provisionId,
        documentId: prov.document_id,
        article: prov.article,
        clause: prov.clause,
        evaluatedAt,
        status: docEvaluation.status,
        isEffective: false,
        warnings: [
          `Provision inherited parent document status '${docEvaluation.status}'.`,
          ...docEvaluation.warnings,
        ],
        statusOverride: prov.status_override,
      };
    }

    // Check provision-specific explicit overrides
    if (prov.status_override === "repealed") {
      return {
        provisionId,
        documentId: prov.document_id,
        article: prov.article,
        clause: prov.clause,
        evaluatedAt,
        status: "repealed",
        isEffective: false,
        warnings: ["Provision marked as repealed by explicit provision-level override."],
        statusOverride: prov.status_override,
      };
    }

    // Check provision-specific effective interval
    if (prov.valid_from && evaluatedAt < prov.valid_from) {
      return {
        provisionId,
        documentId: prov.document_id,
        article: prov.article,
        clause: prov.clause,
        evaluatedAt,
        status: "not_yet_effective",
        isEffective: false,
        warnings: [
          `Provision-specific effective date (${prov.valid_from}) is in the future.`,
        ],
        statusOverride: prov.status_override,
      };
    }

    if (prov.valid_to && evaluatedAt > prov.valid_to) {
      return {
        provisionId,
        documentId: prov.document_id,
        article: prov.article,
        clause: prov.clause,
        evaluatedAt,
        status: "expired",
        isEffective: false,
        warnings: [
          `Provision-specific expiration date (${prov.valid_to}) has passed.`,
        ],
        statusOverride: prov.status_override,
      };
    }

    // Check partial repeal relationships targeting this specific provision
    const partialRepeals = await this.db
      .select()
      .from(documentRelationships)
      .where(
        and(
          eq(documentRelationships.target_document_id, prov.document_id),
          eq(documentRelationships.relationship_type, "partially_repeals")
        )
      );

    for (const rel of partialRepeals) {
      if (rel.effective_from && evaluatedAt < rel.effective_from) continue;
      if (rel.effective_to && evaluatedAt > rel.effective_to) continue;

      const targetLocator = rel.target_locator as Record<string, unknown> | null;
      if (targetLocator) {
        const articleMatch =
          !targetLocator.article || targetLocator.article === prov.article;
        const clauseMatch =
          !targetLocator.clause || targetLocator.clause === prov.clause;

        if (articleMatch && clauseMatch) {
          return {
            provisionId,
            documentId: prov.document_id,
            article: prov.article,
            clause: prov.clause,
            evaluatedAt,
            status: "repealed",
            isEffective: false,
            warnings: [
              `Provision repealed by relationship ${rel.id} from source document ${rel.source_document_id}.`,
            ],
            statusOverride: "repealed",
          };
        }
      }
    }

    return {
      provisionId,
      documentId: prov.document_id,
      article: prov.article,
      clause: prov.clause,
      evaluatedAt,
      status: "effective",
      isEffective: true,
      warnings: [],
      statusOverride: prov.status_override,
    };
  }
}
