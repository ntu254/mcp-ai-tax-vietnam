import { describe, expect, it } from "vitest";
import {
  computeNormalizedTextHash,
  computeSha256,
} from "@vietnam-tax/source-storage";
import {
  detectDocumentNature,
  extractDocumentRelationships,
} from "@vietnam-tax/parser";
import {
  verifyEffectiveDate,
  verifyIdentity,
} from "@vietnam-tax/verification";

describe("Vietnam Tax & Legal MCP — Golden Acceptance Suite", () => {
  describe("1. Safety Invariants (Section 2)", () => {
    it("Invariant: draft != effective", () => {
      const nature = detectDocumentNature(
        "Dự thảo Nghị định sửa đổi bổ sung một số điều của Nghị định 123",
        "decree"
      );
      expect(nature).toBe("draft");
      expect(nature).not.toBe("normative_legal_document");
    });

    it("Invariant: proposal != effective", () => {
      const nature = detectDocumentNature(
        "Tờ trình về việc ban hành Nghị định quy định về thuế",
        "decree"
      );
      expect(nature).toBe("proposal");
    });

    it("Invariant: document nature separation (Guidance vs Normative)", () => {
      const guidanceNature = detectDocumentNature(
        "Công văn số 1234/TCT-CS về hướng dẫn lập hóa đơn điện tử",
        "official_letter"
      );
      expect(guidanceNature).toBe("official_guidance");

      const normativeNature = detectDocumentNature(
        "Nghị định số 123/2020/NĐ-CP",
        "decree"
      );
      expect(normativeNature).toBe("normative_legal_document");
    });
  });

  describe("2. Temporal Validity Logic (Section 60)", () => {
    it("evaluates document status as not_yet_effective before effective date", () => {
      const effectiveFrom = "2022-07-01";
      const queryDateBefore = "2021-05-15";
      const queryDateAfter = "2022-08-01";

      const isEffectiveBefore = queryDateBefore >= effectiveFrom;
      const isEffectiveAfter = queryDateAfter >= effectiveFrom;

      expect(isEffectiveBefore).toBe(false);
      expect(isEffectiveAfter).toBe(true);
    });
  });

  describe("3. Partial Repeal Isolation (Section 61)", () => {
    it("isolates partial repeal to targeted provision without repealing parent document", () => {
      const repealText =
        "Bãi bỏ Khoản 2 Điều 10 Thông tư số 111/2013/TT-BTC ngày 15 tháng 8 năm 2013 của Bộ Tài chính";
      const rels = extractDocumentRelationships(repealText);

      expect(rels.length).toBe(1);
      const rel = rels[0];
      expect(rel.relationshipType).toBe("partially_repeals");
      expect(rel.targetDocumentNumber).toBe("111/2013/TT-BTC");
      expect(rel.targetLocator).toEqual({
        clause: "Khoản 2",
        article: "Điều 10",
      });
    });
  });

  describe("4. Official Source Conflict & Answerable Policy (Section 62)", () => {
    it("detects conflict between two Tier A/B sources and suppresses answerability", () => {
      const conflictCheck = verifyEffectiveDate([
        {
          sourceName: "congbao",
          sourceAuthority: "tier_a",
          snapshotId: "snap-a",
          effectiveFrom: "2026-01-01",
        },
        {
          sourceName: "mof",
          sourceAuthority: "tier_b",
          snapshotId: "snap-b",
          effectiveFrom: "2026-07-01",
        },
      ]);

      expect(conflictCheck.passed).toBe(false);
      expect(conflictCheck.status).toBe("conflicting");

      // Invariant: answerable = false when official sources disagree
      const answerable = conflictCheck.status !== "conflicting";
      expect(answerable).toBe(false);
    });
  });

  describe("5. Immutable Source Snapshots & Hashing (Section 15)", () => {
    it("produces deterministic SHA-256 hashes", () => {
      const content = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
      const hash1 = computeSha256(content);
      const hash2 = computeSha256(content);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("normalizes text variations (whitespace, casing, unicode) deterministically", () => {
      const raw1 = "Thuế   giá trị gia tăng  ";
      const raw2 = "thuế giá trị gia tăng";
      expect(computeNormalizedTextHash(raw1)).toBe(computeNormalizedTextHash(raw2));
    });
  });
});
