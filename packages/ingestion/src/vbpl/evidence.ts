import { DatabaseInstance, legalEvidence } from "@vietnam-tax/db";
import { logger } from "@vietnam-tax/observability";
import { VbplDocumentDto } from "./types.js";

export interface RecordVbplEvidenceInput {
  documentId: string;
  sourceSnapshotId: string;
  dto: VbplDocumentDto;
  channel?: "html_fallback" | "soap_asmx";
  transport?: "html" | "soap_xml";
}

export interface VbplEvidenceRecorderResult {
  evidenceIds: string[];
  recordedFields: string[];
}

export class VbplEvidenceRecorder {
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * Map actual VBPL fields into source assertions in legal_evidence,
   * without overwriting canonical legal_documents directly.
   */
  public async recordAssertions(
    input: RecordVbplEvidenceInput
  ): Promise<VbplEvidenceRecorderResult> {
    const { documentId, sourceSnapshotId, dto } = input;
    if (!dto.documentNumber || !dto.title) {
      throw new Error(
        "FAIL_CLOSED: Refusing to create VBPL assertions without valid documentNumber and title"
      );
    }
    const now = new Date();
    const evidenceIds: string[] = [];
    const recordedFields: string[] = [];

    const fieldMap: Array<{
      fieldName: string;
      value: unknown;
      textSnippet?: string;
    }> = [];

    // 1. document number
    if (dto.documentNumber) {
      fieldMap.push({
        fieldName: "document_number",
        value: dto.documentNumber,
        textSnippet: dto.documentNumber,
      });
    }

    // 2. title
    if (dto.title) {
      fieldMap.push({
        fieldName: "title",
        value: dto.title,
        textSnippet: dto.title,
      });
    }

    // 3. issuer
    if (dto.issuer) {
      fieldMap.push({
        fieldName: "issuer",
        value: dto.issuer,
        textSnippet: dto.issuer,
      });
    }

    // 4. issued date
    if (dto.issuedDate) {
      fieldMap.push({
        fieldName: "issued_date",
        value: dto.issuedDate,
        textSnippet: `Ngày ban hành: ${dto.issuedDate}`,
      });
    }

    // 5. effective date
    if (dto.effectiveDate) {
      fieldMap.push({
        fieldName: "default_effective_from",
        value: dto.effectiveDate,
        textSnippet: `Ngày hiệu lực: ${dto.effectiveDate}`,
      });
    }

    // 6. expiration date
    if (dto.expirationDate) {
      fieldMap.push({
        fieldName: "default_effective_to",
        value: dto.expirationDate,
        textSnippet: `Ngày hết hiệu lực: ${dto.expirationDate}`,
      });
    }

    // 7. status metadata
    if (dto.statusMetadata) {
      fieldMap.push({
        fieldName: "status_metadata",
        value: dto.statusMetadata,
        textSnippet: `Tình trạng hiệu lực: ${dto.statusMetadata}`,
      });
    }

    // 8. replaced/repealed/amended relationships
    if (dto.relationships && dto.relationships.length > 0) {
      fieldMap.push({
        fieldName: "relationships",
        value: dto.relationships,
        textSnippet: JSON.stringify(dto.relationships),
      });
    }

    // 9. history
    if (dto.history && dto.history.length > 0) {
      fieldMap.push({
        fieldName: "history",
        value: dto.history,
        textSnippet: JSON.stringify(dto.history),
      });
    }

    // 10. attachments
    if (dto.attachments && dto.attachments.length > 0) {
      fieldMap.push({
        fieldName: "attachments",
        value: dto.attachments,
        textSnippet: JSON.stringify(dto.attachments.map((a) => a.url)),
      });
    }

    // 11. VBPL item ID
    if (dto.vbplId !== undefined && dto.vbplId !== null) {
      fieldMap.push({
        fieldName: "vbpl_item_id",
        value: dto.vbplId,
        textSnippet: `VBPL ItemID: ${dto.vbplId}`,
      });
    }

    // Insert all assertions atomically / iteratively into legalEvidence
    for (const item of fieldMap) {
      const id = crypto.randomUUID();
      await this.db.insert(legalEvidence).values({
        id,
        document_id: documentId,
        source_snapshot_id: sourceSnapshotId,
        field_name: item.fieldName,
        asserted_value: item.value,
        evidence_type:
          input.channel === "soap_asmx"
            ? "vbpl_soap_assertion"
            : "vbpl_html_assertion",
        evidence_locator: {
          source: "vbpl",
          channel: input.channel ?? "html_fallback",
          transport: input.transport ?? "html",
        },
        evidence_origin: "live_official",
        environment: "production",
        is_quarantined: false,
        evidence_text: item.textSnippet,
        verification_result: "pending",
        created_at: now,
      });
      evidenceIds.push(id);
      recordedFields.push(item.fieldName);
    }

    logger.debug(
      {
        documentId,
        sourceSnapshotId,
        recordedFieldsCount: recordedFields.length,
      },
      "Recorded VBPL source assertions in legalEvidence"
    );

    return {
      evidenceIds,
      recordedFields,
    };
  }
}
