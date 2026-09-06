import { describe, expect, it } from "vitest";
import {
  classifyTaxTopics,
  detectDocumentNature,
  detectDocumentType,
  extractDocumentRelationships,
  parseDocumentMetadata,
  parseLegalProvisions,
  parseVietnameseDate,
} from "@vietnam-tax/parser";

describe("Legal Parser", () => {
  it("parses Vietnamese dates in long and slash format", () => {
    expect(parseVietnameseDate("ngày 19 tháng 10 năm 2020")).toBe("2020-10-19");
    expect(parseVietnameseDate("19/10/2020")).toBe("2020-10-19");
    expect(parseVietnameseDate("Ban hành ngày 01 tháng 07 năm 2022")).toBe("2022-07-01");
  });

  it("accurately detects document type and nature", () => {
    expect(detectDocumentType("Nghị định số 123/2020/NĐ-CP")).toBe("decree");
    expect(detectDocumentType("Thông tư số 78/2021/TT-BTC")).toBe("circular");
    expect(detectDocumentType("Công văn số 1234/TCT-CS")).toBe("official_letter");
    expect(detectDocumentType("Luật Quản lý thuế số 38/2019/QH14")).toBe("law");

    expect(
      detectDocumentNature("Nghị định số 123/2020/NĐ-CP", "decree")
    ).toBe("normative_legal_document");

    expect(
      detectDocumentNature("Công văn hướng dẫn chính sách thuế", "official_letter")
    ).toBe("official_guidance");

    expect(
      detectDocumentNature("Dự thảo Luật Thuế GTGT (sửa đổi)", "law")
    ).toBe("draft");

    expect(
      detectDocumentNature("Tờ trình về việc ban hành Nghị định", "other")
    ).toBe("proposal");
  });

  it("classifies tax topics correctly", () => {
    expect(classifyTaxTopics("Quy định về hóa đơn điện tử")).toContain("invoice");
    expect(classifyTaxTopics("Hướng dẫn thuế giá trị gia tăng và TNDN")).toEqual(
      expect.arrayContaining(["vat", "cit"])
    );
    expect(classifyTaxTopics("Chính sách thuế đối với hộ kinh doanh cá thể")).toContain(
      "household_business"
    );
  });

  it("parses provisions into structured Điều / Khoản", () => {
    const rawLegalText = `
Chương I
QUY ĐỊNH CHUNG

Điều 1. Phạm vi điều chỉnh
Nghị định này quy định việc quản lý, sử dụng hóa đơn, chứng từ.

Điều 2. Đối tượng áp dụng
1. Doanh nghiệp, tổ chức kinh tế.
2. Hộ, cá nhân kinh doanh.
3. Cơ quan quản lý thuế.

Điều 15. Hiệu lực thi hành
1. Nghị định này có hiệu lực từ ngày 01 tháng 07 năm 2022.
2. Khoản 2 Điều này có hiệu lực từ ngày 01 tháng 01 năm 2026.
`;

    const provisions = parseLegalProvisions(rawLegalText);

    expect(provisions.length).toBeGreaterThanOrEqual(4);

    const article1 = provisions.find((p) => p.article === "Điều 1");
    expect(article1).toBeDefined();
    expect(article1?.chapter).toBe("Chương I");
    expect(article1?.heading).toBe("Phạm vi điều chỉnh");

    const article2Clause1 = provisions.find(
      (p) => p.article === "Điều 2" && p.clause === "1"
    );
    expect(article2Clause1).toBeDefined();
    expect(article2Clause1?.content).toContain("Doanh nghiệp");

    const article15Clause2 = provisions.find(
      (p) => p.article === "Điều 15" && p.clause === "2"
    );
    expect(article15Clause2).toBeDefined();
    expect(article15Clause2?.validFrom).toBe("2026-01-01");
  });

  it("extracts document relationships (repeals, amends, partial repeals)", () => {
    const text = `
Điều 15. Hiệu lực thi hành
1. Bãi bỏ Nghị định số 51/2010/NĐ-CP ngày 14 tháng 5 năm 2010.
2. Bãi bỏ Khoản 2 Điều 10 Thông tư số 111/2013/TT-BTC ngày 15/8/2013.
3. Sửa đổi, bổ sung một số điều của Nghị định số 123/2020/NĐ-CP.
`;

    const rels = extractDocumentRelationships(text);

    expect(rels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationshipType: "repeals",
          targetDocumentNumber: "51/2010/ND-CP",
        }),
        expect.objectContaining({
          relationshipType: "partially_repeals",
          targetDocumentNumber: "111/2013/TT-BTC",
          targetLocator: { article: "Điều 10", clause: "Khoản 2" },
        }),
        expect.objectContaining({
          relationshipType: "amends",
          targetDocumentNumber: "123/2020/ND-CP",
        }),
      ])
    );
  });
});
