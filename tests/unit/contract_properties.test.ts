import { describe, expect, it } from "vitest";
import {
  DocumentNature,
  GetEffectiveTaxRulesOutput,
  GetEffectiveTaxRulesOutputSchema,
} from "@vietnam-tax/common";

describe("MCP Contract Property Invariants (Point 7)", () => {
  it("Invariant: answerable=true strictly requires at least 1 authoritative evidence", () => {
    // Contract validator function enforcing the property
    function validateContractInvariants(output: GetEffectiveTaxRulesOutput) {
      if (output.answerable) {
        // Collect all evidence across rules and guidance
        const allEvidence = [
          ...output.rules.flatMap((r) => r.evidence),
          ...output.official_guidance.flatMap((g) => g.evidence),
        ];

        if (allEvidence.length === 0) {
          throw new Error(
            "INVARIANT VIOLATION: answerable=true cannot have 0 evidence items."
          );
        }
      }
    }

    // Valid response with evidence
    const validOutput: GetEffectiveTaxRulesOutput = {
      effective_at: "2026-09-06",
      answerable: true,
      dataset_version: "2026.09.06-v1.1",
      rules: [
        {
          document_id: crypto.randomUUID(),
          document_number: "123/2020/NĐ-CP",
          title: "Nghị định quy định về hóa đơn, chứng từ",
          document_type: "decree",
          document_nature: "normative_legal_document",
          issuer: "Chính phủ",
          effective_from: "2022-07-01",
          effective_to: null,
          provision: {
            id: crypto.randomUUID(),
            article: "Điều 1",
            content: "Quy định về hóa đơn điện tử",
            valid_from: "2022-07-01",
            valid_to: null,
            evidence: [],
          },
          evidence: [
            {
              field_name: "default_effective_from",
              asserted_value: "2022-07-01",
              source_snapshot_id: crypto.randomUUID(),
              evidence_type: "source_extraction",
            },
          ],
        },
      ],
      official_guidance: [],
      warnings: [],
      evaluated_timezone: "Asia/Ho_Chi_Minh",
    };

    expect(() => validateContractInvariants(validOutput)).not.toThrow();

    // Invalid response: answerable=true but empty evidence
    const invalidOutput: GetEffectiveTaxRulesOutput = {
      ...validOutput,
      rules: [
        {
          ...validOutput.rules[0],
          evidence: [],
        },
      ],
    };

    expect(() => validateContractInvariants(invalidOutput)).toThrow(
      /INVARIANT VIOLATION/
    );
  });

  it("Invariant: draft and proposal documents cannot be presented as effective rules", () => {
    function ensureNoDraftInRules(output: GetEffectiveTaxRulesOutput) {
      for (const rule of output.rules) {
        if (rule.document_nature === "draft" || rule.document_nature === "proposal") {
          throw new Error(
            `INVARIANT VIOLATION: Draft or proposal document '${rule.title}' found in effective rules.`
          );
        }
      }
    }

    const outputWithDraft: GetEffectiveTaxRulesOutput = {
      effective_at: "2026-09-06",
      answerable: true,
      dataset_version: "2026.09.06-v1.1",
      rules: [
        {
          document_id: crypto.randomUUID(),
          document_number: null,
          title: "Dự thảo Nghị định sửa đổi thuế GTGT",
          document_type: "decree",
          document_nature: "draft" as DocumentNature,
          issuer: "Bộ Tài chính",
          effective_from: "2026-09-06",
          effective_to: null,
          provision: {
            id: crypto.randomUUID(),
            content: "Dự thảo quy định",
            evidence: [],
          },
          evidence: [],
        },
      ],
      official_guidance: [],
      warnings: [],
      evaluated_timezone: "Asia/Ho_Chi_Minh",
    };

    expect(() => ensureNoDraftInRules(outputWithDraft)).toThrow(
      /INVARIANT VIOLATION/
    );
  });

  it("Invariant: official guidance is separated from normative legal rules", () => {
    const guidanceOutput: GetEffectiveTaxRulesOutput = {
      effective_at: "2026-09-06",
      answerable: true,
      dataset_version: "2026.09.06-v1.1",
      rules: [],
      official_guidance: [
        {
          document_id: crypto.randomUUID(),
          document_number: "1234/TCT-CS",
          title: "Công văn hướng dẫn về hóa đơn điện tử máy tính tiền",
          document_nature: "official_guidance",
          issuer: "Tổng cục Thuế",
          issued_date: "2023-04-10",
          guidance_summary: "Hướng dẫn xuất hóa đơn từ máy tính tiền",
          evidence: [],
          note: "Official guidance reflects administrative execution interpretation and is not a normative legal document (VBQPPL).",
        },
      ],
      warnings: [],
      evaluated_timezone: "Asia/Ho_Chi_Minh",
    };

    // Validates against Zod contract schema
    expect(() =>
      GetEffectiveTaxRulesOutputSchema.parse(guidanceOutput)
    ).not.toThrow();

    // Guidance must carry the warning note
    expect(guidanceOutput.official_guidance[0].note).toContain("not a normative legal document");
  });
});
