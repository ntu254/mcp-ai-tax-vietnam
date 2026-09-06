import { DatabaseInstance, legalEvidence } from "@vietnam-tax/db";
import { ParsedMetadata } from "./metadata.js";
import { ParsedProvision } from "./provisions.js";
import { logger } from "@vietnam-tax/observability";

export interface GenerateEvidenceParams {
  documentId: string;
  sourceSnapshotId: string;
  metadata: ParsedMetadata;
  provisions: { id: string; parsed: ParsedProvision }[];
}

export class EvidenceCollector {
  constructor(private readonly db: DatabaseInstance) {}

  public async recordDocumentEvidence(
    params: GenerateEvidenceParams
  ): Promise<string[]> {
    const evidenceIds: string[] = [];
    const now = new Date();

    const fieldEntries: Array<{
      fieldName: string;
      value: unknown;
      textSnippet?: string;
    }> = [
      { fieldName: "title", value: params.metadata.title, textSnippet: params.metadata.title },
      { fieldName: "document_nature", value: params.metadata.documentNature },
    ];

    if (params.metadata.documentNumber) {
      fieldEntries.push({
        fieldName: "document_number",
        value: params.metadata.documentNumber,
        textSnippet: params.metadata.documentNumber,
      });
    }

    if (params.metadata.issuerName) {
      fieldEntries.push({
        fieldName: "issuer",
        value: params.metadata.issuerName,
        textSnippet: params.metadata.issuerName,
      });
    }

    if (params.metadata.issuedDate) {
      fieldEntries.push({
        fieldName: "issued_date",
        value: params.metadata.issuedDate,
      });
    }

    if (params.metadata.effectiveFrom) {
      fieldEntries.push({
        fieldName: "default_effective_from",
        value: params.metadata.effectiveFrom,
      });
    }

    // Insert document-level evidence
    for (const entry of fieldEntries) {
      const id = crypto.randomUUID();
      await this.db.insert(legalEvidence).values({
        id,
        document_id: params.documentId,
        field_name: entry.fieldName,
        asserted_value: entry.value,
        source_snapshot_id: params.sourceSnapshotId,
        evidence_type: "source_extraction",
        evidence_text: entry.textSnippet,
        verification_result: "pending",
        created_at: now,
      });
      evidenceIds.push(id);
    }

    // Insert provision-level evidence for key provisions (articles)
    for (const prov of params.provisions) {
      const id = crypto.randomUUID();
      await this.db.insert(legalEvidence).values({
        id,
        document_id: params.documentId,
        provision_id: prov.id,
        field_name: "provision_content",
        asserted_value: {
          article: prov.parsed.article,
          clause: prov.parsed.clause,
          content_hash: prov.parsed.contentHash,
        },
        source_snapshot_id: params.sourceSnapshotId,
        evidence_type: "provision_text",
        evidence_text: prov.parsed.content.slice(0, 500),
        evidence_locator: {
          sort_key: prov.parsed.sortKey,
          article: prov.parsed.article,
          clause: prov.parsed.clause,
        },
        verification_result: "pending",
        created_at: now,
      });
      evidenceIds.push(id);
    }

    logger.debug(
      { documentId: params.documentId, count: evidenceIds.length },
      "Recorded snapshot-level legal evidence items"
    );

    return evidenceIds;
  }
}
