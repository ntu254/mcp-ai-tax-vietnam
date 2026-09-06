import { describe, expect, it } from "vitest";
import {
  SourceAssertion,
  verifyEffectiveDate,
  verifyIdentity,
  verifyStatusAndValidity,
} from "@vietnam-tax/verification";
import { VbplDocumentDto } from "@vietnam-tax/ingestion";

describe("VBPL Source Assertion Mapping & Cross-Verification Engine (Points 6 & 8)", () => {
  const sampleVbplDto: VbplDocumentDto = {
    vbplId: 158920,
    documentNumber: "123/2020/NĐ-CP",
    title: "Nghị định quy định về hóa đơn, chứng từ",
    issuer: "Chính phủ",
    issuedDate: "2020-10-19",
    effectiveDate: "2022-07-01",
    expirationDate: "2030-12-31",
    statusMetadata: "Còn hiệu lực",
    documentType: "Nghị định",
    relationships: [
      {
        targetDocNumber: "51/2010/NĐ-CP",
        relationshipType: "replaces",
        rawRelationshipText: "Thay thế Nghị định 51/2010/NĐ-CP",
      },
    ],
    history: [
      {
        eventDate: "2020-10-19",
        eventType: "Ban hành",
        description: "Ban hành nghị định",
      },
    ],
    attachments: [
      {
        filename: "123_2020_ND_CP.pdf",
        url: "https://vbpl.vn/FileData/123_2020_ND_CP.pdf",
      },
    ],
    sourceUrl: "https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=158920",
    sourceAuthority: "tier_a",
  };

  it("maps all 11 priority VBPL fields into a valid SourceAssertion", () => {
    const assertion: SourceAssertion = {
      sourceName: "vbpl",
      sourceAuthority: "tier_a",
      snapshotId: "snapshot-vbpl-001",
      documentNumber: sampleVbplDto.documentNumber,
      title: sampleVbplDto.title,
      issuer: sampleVbplDto.issuer,
      issuedDate: sampleVbplDto.issuedDate,
      effectiveFrom: sampleVbplDto.effectiveDate,
      effectiveTo: sampleVbplDto.expirationDate,
      statusMetadata: sampleVbplDto.statusMetadata,
      relationships: sampleVbplDto.relationships,
      history: sampleVbplDto.history,
      attachments: sampleVbplDto.attachments,
      vbplId: sampleVbplDto.vbplId,
    };

    expect(assertion.documentNumber).toBe("123/2020/NĐ-CP");
    expect(assertion.title).toBe("Nghị định quy định về hóa đơn, chứng từ");
    expect(assertion.issuer).toBe("Chính phủ");
    expect(assertion.issuedDate).toBe("2020-10-19");
    expect(assertion.effectiveFrom).toBe("2022-07-01");
    expect(assertion.effectiveTo).toBe("2030-12-31");
    expect(assertion.statusMetadata).toBe("Còn hiệu lực");
    expect(assertion.relationships).toHaveLength(1);
    expect(assertion.history).toHaveLength(1);
    expect(assertion.attachments).toHaveLength(1);
    expect(assertion.vbplId).toBe(158920);
  });

  it("cross-verifies Congbao + VBPL when all validity fields match -> cross_verified, answerable=true", () => {
    const congbaoAssertion: SourceAssertion = {
      sourceName: "congbao",
      sourceAuthority: "tier_a",
      snapshotId: "snap-congbao-001",
      documentNumber: "123/2020/NĐ-CP",
      issuedDate: "2020-10-19",
      effectiveFrom: "2022-07-01",
      statusMetadata: "Còn hiệu lực",
    };

    const vbplAssertion: SourceAssertion = {
      sourceName: "vbpl",
      sourceAuthority: "tier_a",
      snapshotId: "snap-vbpl-001",
      documentNumber: "123/2020/NĐ-CP",
      issuedDate: "2020-10-19",
      effectiveFrom: "2022-07-01",
      statusMetadata: "Còn hiệu lực",
    };

    const assertions = [congbaoAssertion, vbplAssertion];

    const idRes = verifyIdentity(assertions);
    const dateRes = verifyEffectiveDate(assertions);
    const validRes = verifyStatusAndValidity(assertions);

    expect(idRes.passed).toBe(true);
    expect(dateRes.passed).toBe(true);
    expect(validRes.passed).toBe(true);

    const conflicts = [...idRes.conflicts, ...dateRes.conflicts, ...validRes.conflicts];
    expect(conflicts).toHaveLength(0);

    const finalStatus =
      idRes.passed && dateRes.passed && validRes.passed && assertions.length >= 2
        ? "cross_verified"
        : "single_source_verified";
    expect(finalStatus).toBe("cross_verified");

    const answerable = conflicts.length === 0 && finalStatus === "cross_verified";
    expect(answerable).toBe(true);
  });

  it("detects conflict when VBPL disagrees on effective date -> conflicting, answerable=false", () => {
    const congbaoAssertion: SourceAssertion = {
      sourceName: "congbao",
      sourceAuthority: "tier_a",
      snapshotId: "snap-congbao-001",
      documentNumber: "123/2020/NĐ-CP",
      issuedDate: "2020-10-19",
      effectiveFrom: "2022-07-01",
    };

    const vbplAssertion: SourceAssertion = {
      sourceName: "vbpl",
      sourceAuthority: "tier_a",
      snapshotId: "snap-vbpl-002",
      documentNumber: "123/2020/NĐ-CP",
      issuedDate: "2020-10-19",
      effectiveFrom: "2022-08-01", // Disagreement on effective date
    };

    const assertions = [congbaoAssertion, vbplAssertion];
    const dateRes = verifyEffectiveDate(assertions);

    expect(dateRes.passed).toBe(false);
    expect(dateRes.status).toBe("conflicting");
    expect(dateRes.conflicts).toHaveLength(1);
    expect(dateRes.conflicts[0].fieldName).toBe("default_effective_from");
    expect(dateRes.conflicts[0].severity).toBe("high");

    // Invariant: answerable = false when official sources disagree on effective date
    const hasHighConflict = dateRes.conflicts.some((c) => c.severity === "high");
    const answerable = !hasHighConflict;
    expect(answerable).toBe(false);
  });

  it("detects conflict when VBPL disagrees on document status -> conflicting, answerable=false", () => {
    const congbaoAssertion: SourceAssertion = {
      sourceName: "congbao",
      sourceAuthority: "tier_a",
      snapshotId: "snap-congbao-001",
      documentNumber: "123/2020/NĐ-CP",
      effectiveFrom: "2022-07-01",
      statusMetadata: "Còn hiệu lực",
    };

    const vbplAssertion: SourceAssertion = {
      sourceName: "vbpl",
      sourceAuthority: "tier_a",
      snapshotId: "snap-vbpl-003",
      documentNumber: "123/2020/NĐ-CP",
      effectiveFrom: "2022-07-01",
      statusMetadata: "Hết hiệu lực toàn bộ", // Status conflict
    };

    const assertions = [congbaoAssertion, vbplAssertion];
    const validRes = verifyStatusAndValidity(assertions);

    expect(validRes.passed).toBe(false);
    expect(validRes.status).toBe("conflicting");
    expect(validRes.conflicts).toHaveLength(1);
    expect(validRes.conflicts[0].fieldName).toBe("status_metadata");
    expect(validRes.conflicts[0].severity).toBe("high");

    // Invariant: answerable = false
    const answerable = validRes.status !== "conflicting";
    expect(answerable).toBe(false);
  });
});
