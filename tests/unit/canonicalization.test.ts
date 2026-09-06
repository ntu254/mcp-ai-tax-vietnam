import { describe, expect, it } from "vitest";
import {
  buildCanonicalId,
  generateTitleFingerprint,
  normalizeDocumentNumber,
} from "@vietnam-tax/canonicalization";

describe("Canonicalization & Deduplication", () => {
  it("normalizes document numbers according to Vietnamese conventions", () => {
    expect(normalizeDocumentNumber("123/2020/NĐ-CP")).toBe("123/2020/ND-CP");
    expect(normalizeDocumentNumber(" 78/2021/TT-BTC ")).toBe("78/2021/TT-BTC");
    expect(normalizeDocumentNumber("45/2019/QH14")).toBe("45/2019/QH14");
    expect(normalizeDocumentNumber("15–2022/NĐ-CP")).toBe("15-2022/ND-CP");
  });

  it("builds correct canonical ID format VN:{type}:{year}:{normalized_number}", () => {
    const res1 = buildCanonicalId({
      documentType: "decree",
      documentNumber: "123/2020/NĐ-CP",
      issuedDate: "2020-10-19",
    });

    expect(res1.canonicalStatus).toBe("resolved");
    expect(res1.canonicalId).toBe("VN:ND:2020:123-2020-ND-CP");

    const res2 = buildCanonicalId({
      documentType: "circular",
      documentNumber: "78/2021/TT-BTC",
      issuedDate: "2021-09-17",
    });

    expect(res2.canonicalStatus).toBe("resolved");
    expect(res2.canonicalId).toBe("VN:TT:2021:78-2021-TT-BTC");
  });

  it("handles unresolved documents gracefully", () => {
    const res = buildCanonicalId({
      documentType: "other",
      documentNumber: null,
    });

    expect(res.canonicalStatus).toBe("unresolved");
    expect(res.canonicalId).toMatch(/^VN:UNRESOLVED:/);
  });

  it("generates deterministic title fingerprints", () => {
    const title1 = "Nghị định quy định về hóa đơn, chứng từ!";
    const title2 = "nghị định quy định về hóa đơn  chứng từ";

    expect(generateTitleFingerprint(title1)).toBe(generateTitleFingerprint(title2));
  });
});
