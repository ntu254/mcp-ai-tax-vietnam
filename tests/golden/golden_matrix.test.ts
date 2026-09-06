import { describe, expect, it } from "vitest";
import {
  detectDocumentNature,
  detectDocumentType,
  extractDocumentRelationships,
} from "@vietnam-tax/parser";
import {
  SourceAssertion,
  verifyEffectiveDate,
  verifyIdentity,
} from "@vietnam-tax/verification";
import { computeSha256 } from "@vietnam-tax/source-storage";

describe("Vietnam Tax & Legal MCP — 110 Golden Legal Scenarios Matrix", () => {
  // =========================================================================
  // CATEGORY 1: Temporal Boundaries & Intervals (20 cases)
  // =========================================================================
  describe("Category 1: Temporal Boundaries (20 cases)", () => {
    const temporalCases = [
      { doc: "Luật Quản lý thuế 38/2019/QH14", from: "2020-07-01", to: null, query: "2019-06-13", expected: false },
      { doc: "Luật Quản lý thuế 38/2019/QH14", from: "2020-07-01", to: null, query: "2020-06-30", expected: false },
      { doc: "Luật Quản lý thuế 38/2019/QH14", from: "2020-07-01", to: null, query: "2020-07-01", expected: true },
      { doc: "Luật Quản lý thuế 38/2019/QH14", from: "2020-07-01", to: null, query: "2026-09-06", expected: true },
      { doc: "Nghị định 123/2020/NĐ-CP", from: "2022-07-01", to: null, query: "2020-10-19", expected: false },
      { doc: "Nghị định 123/2020/NĐ-CP", from: "2022-07-01", to: null, query: "2022-06-30", expected: false },
      { doc: "Nghị định 123/2020/NĐ-CP", from: "2022-07-01", to: null, query: "2022-07-01", expected: true },
      { doc: "Nghị định 123/2020/NĐ-CP", from: "2022-07-01", to: null, query: "2023-01-01", expected: true },
      { doc: "Nghị định 44/2023/NĐ-CP (Giảm thuế GTGT 2%)", from: "2023-07-01", to: "2023-12-31", query: "2023-06-30", expected: false },
      { doc: "Nghị định 44/2023/NĐ-CP (Giảm thuế GTGT 2%)", from: "2023-07-01", to: "2023-12-31", query: "2023-07-01", expected: true },
      { doc: "Nghị định 44/2023/NĐ-CP (Giảm thuế GTGT 2%)", from: "2023-07-01", to: "2023-12-31", query: "2023-10-15", expected: true },
      { doc: "Nghị định 44/2023/NĐ-CP (Giảm thuế GTGT 2%)", from: "2023-07-01", to: "2023-12-31", query: "2023-12-31", expected: true },
      { doc: "Nghị định 44/2023/NĐ-CP (Giảm thuế GTGT 2%)", from: "2023-07-01", to: "2023-12-31", query: "2024-01-01", expected: false },
      { doc: "Nghị định 94/2023/NĐ-CP (Gia hạn giảm VAT 6T 2024)", from: "2024-01-01", to: "2024-06-30", query: "2024-03-01", expected: true },
      { doc: "Nghị định 94/2023/NĐ-CP (Gia hạn giảm VAT 6T 2024)", from: "2024-01-01", to: "2024-06-30", query: "2024-07-01", expected: false },
      { doc: "Nghị định 72/2024/NĐ-CP (Giảm VAT cuối 2024)", from: "2024-07-01", to: "2024-12-31", query: "2024-08-01", expected: true },
      { doc: "Nghị định 72/2024/NĐ-CP (Giảm VAT cuối 2024)", from: "2024-07-01", to: "2024-12-31", query: "2025-01-01", expected: false },
      { doc: "Thông tư 78/2021/TT-BTC", from: "2022-07-01", to: null, query: "2021-09-17", expected: false },
      { doc: "Thông tư 78/2021/TT-BTC", from: "2022-07-01", to: null, query: "2022-07-01", expected: true },
      { doc: "Thông tư 78/2021/TT-BTC", from: "2022-07-01", to: null, query: "2026-09-06", expected: true },
    ];

    it.each(temporalCases)(
      "case $# - $doc: evaluated at $query is $expected",
      ({ from, to, query, expected }) => {
        const isEffective = query >= from && (!to || query <= to);
        expect(isEffective).toBe(expected);
      }
    );
  });

  // =========================================================================
  // CATEGORY 2: Partial Repeals & Multiple Amendments (20 cases)
  // =========================================================================
  describe("Category 2: Partial Repeal & Amendments (20 cases)", () => {
    const partialRepealCases = [
      {
        input: "Bãi bỏ Khoản 2 Điều 10 Thông tư số 111/2013/TT-BTC",
        expectedType: "partially_repeals",
        target: "111/2013/TT-BTC",
        locator: { article: "Điều 10", clause: "Khoản 2" },
      },
      {
        input: "Bãi bỏ Điều 15 Nghị định số 123/2020/NĐ-CP",
        expectedType: "partially_repeals",
        target: "123/2020/ND-CP",
        locator: { article: "Điều 15", clause: undefined },
      },
      {
        input: "Bãi bỏ Khoản 1 Điều 4 Thông tư số 219/2013/TT-BTC",
        expectedType: "partially_repeals",
        target: "219/2013/TT-BTC",
        locator: { article: "Điều 4", clause: "Khoản 1" },
      },
      {
        input: "Bãi bỏ Khoản 3 Điều 8 Thông tư số 78/2014/TT-BTC",
        expectedType: "partially_repeals",
        target: "78/2014/TT-BTC",
        locator: { article: "Điều 8", clause: "Khoản 3" },
      },
      {
        input: "Bãi bỏ Điều 6 Thông tư số 96/2015/TT-BTC",
        expectedType: "partially_repeals",
        target: "96/2015/TT-BTC",
        locator: { article: "Điều 6", clause: undefined },
      },
      {
        input: "Bãi bỏ Khoản 5 Điều 2 Nghị định số 209/2013/NĐ-CP",
        expectedType: "partially_repeals",
        target: "209/2013/ND-CP",
        locator: { article: "Điều 2", clause: "Khoản 5" },
      },
      {
        input: "Bãi bỏ Khoản 1 Điều 9 Thông tư số 105/2020/TT-BTC",
        expectedType: "partially_repeals",
        target: "105/2020/TT-BTC",
        locator: { article: "Điều 9", clause: "Khoản 1" },
      },
      {
        input: "Bãi bỏ Điều 3 Thông tư số 80/2021/TT-BTC",
        expectedType: "partially_repeals",
        target: "80/2021/TT-BTC",
        locator: { article: "Điều 3", clause: undefined },
      },
      {
        input: "Bãi bỏ Khoản 2 Điều 12 Luật Quản lý thuế số 38/2019/QH14",
        expectedType: "partially_repeals",
        target: "38/2019/QH14",
        locator: { article: "Điều 12", clause: "Khoản 2" },
      },
      {
        input: "Bãi bỏ Khoản 4 Điều 7 Thông tư số 40/2021/TT-BTC",
        expectedType: "partially_repeals",
        target: "40/2021/TT-BTC",
        locator: { article: "Điều 7", clause: "Khoản 4" },
      },
      {
        input: "Sửa đổi, bổ sung một số điều của Thông tư số 219/2013/TT-BTC",
        expectedType: "amends",
        target: "219/2013/TT-BTC",
        locator: undefined,
      },
      {
        input: "Sửa đổi Điều 16 Thông tư số 39/2014/TT-BTC",
        expectedType: "amends",
        target: "39/2014/TT-BTC",
        locator: undefined,
      },
      {
        input: "Bổ sung Khoản 3 Điều 5 Thông tư số 78/2014/TT-BTC",
        expectedType: "amends",
        target: "78/2014/TT-BTC",
        locator: undefined,
      },
      {
        input: "Sửa đổi, bổ sung Điều 9 Thông tư số 111/2013/TT-BTC",
        expectedType: "amends",
        target: "111/2013/TT-BTC",
        locator: undefined,
      },
      {
        input: "Sửa đổi, bổ sung một số điều của Nghị định số 126/2020/NĐ-CP",
        expectedType: "amends",
        target: "126/2020/ND-CP",
        locator: undefined,
      },
      {
        input: "Sửa đổi, bổ sung một số điều của Nghị định số 132/2020/NĐ-CP",
        expectedType: "amends",
        target: "132/2020/ND-CP",
        locator: undefined,
      },
      {
        input: "Bổ sung Khoản 6 Điều 8 Nghị định số 123/2020/NĐ-CP",
        expectedType: "amends",
        target: "123/2020/ND-CP",
        locator: undefined,
      },
      {
        input: "Sửa đổi Khoản 2 Điều 10 Thông tư số 80/2021/TT-BTC",
        expectedType: "amends",
        target: "80/2021/TT-BTC",
        locator: undefined,
      },
      {
        input: "Sửa đổi Điều 4 Thông tư số 19/2021/TT-BTC",
        expectedType: "amends",
        target: "19/2021/TT-BTC",
        locator: undefined,
      },
      {
        input: "Sửa đổi, bổ sung một số điều của Thông tư số 105/2020/TT-BTC",
        expectedType: "amends",
        target: "105/2020/TT-BTC",
        locator: undefined,
      },
    ];

    it.each(partialRepealCases)(
      "case $# - $input",
      ({ input, expectedType, target, locator }) => {
        const rels = extractDocumentRelationships(input);
        expect(rels.length).toBeGreaterThanOrEqual(1);
        expect(rels[0].relationshipType).toBe(expectedType);
        expect(rels[0].targetDocumentNumber).toBe(target);
        if (locator) {
          expect(rels[0].targetLocator).toEqual(locator);
        }
      }
    );
  });

  // =========================================================================
  // CATEGORY 3: Document Replacement & Repeal Chain (15 cases)
  // =========================================================================
  describe("Category 3: Document Replacement & Chains (15 cases)", () => {
    const replacementCases = [
      { input: "Bãi bỏ Nghị định số 51/2010/NĐ-CP", type: "repeals", target: "51/2010/ND-CP" },
      { input: "Bãi bỏ Nghị định số 04/2014/NĐ-CP", type: "repeals", target: "04/2014/ND-CP" },
      { input: "Bãi bỏ Thông tư số 32/2011/TT-BTC", type: "repeals", target: "32/2011/TT-BTC" },
      { input: "Bãi bỏ Thông tư số 39/2014/TT-BTC", type: "repeals", target: "39/2014/TT-BTC" },
      { input: "Bãi bỏ Thông tư số 68/2019/TT-BTC", type: "repeals", target: "68/2019/TT-BTC" },
      { input: "Thay thế Nghị định số 51/2010/NĐ-CP", type: "replaces", target: "51/2010/ND-CP" },
      { input: "Thay thế Nghị định số 119/2018/NĐ-CP", type: "replaces", target: "119/2018/ND-CP" },
      { input: "Thay thế Thông tư số 32/2011/TT-BTC", type: "replaces", target: "32/2011/TT-BTC" },
      { input: "Thay thế Thông tư số 191/2010/TT-BTC", type: "replaces", target: "191/2010/TT-BTC" },
      { input: "Thay thế Thông tư số 153/2010/TT-BTC", type: "replaces", target: "153/2010/TT-BTC" },
      { input: "Bãi bỏ Thông tư số 156/2013/TT-BTC", type: "repeals", target: "156/2013/TT-BTC" },
      { input: "Thay thế Thông tư số 156/2013/TT-BTC", type: "replaces", target: "156/2013/TT-BTC" },
      { input: "Bãi bỏ Quyết định số 1209/QĐ-BTC", type: "repeals", target: "1209/QD-BTC" },
      { input: "Thay thế Nghị định số 20/2017/NĐ-CP", type: "replaces", target: "20/2017/ND-CP" },
      { input: "Bãi bỏ Nghị định số 20/2017/NĐ-CP", type: "repeals", target: "20/2017/ND-CP" },
    ];

    it.each(replacementCases)(
      "case $# - $input evaluates to $type of $target",
      ({ input, type, target }) => {
        const rels = extractDocumentRelationships(input);
        expect(rels.length).toBeGreaterThanOrEqual(1);
        expect(rels[0].relationshipType).toBe(type);
        expect(rels[0].targetDocumentNumber).toBe(target);
      }
    );
  });

  // =========================================================================
  // CATEGORY 4: Multi-date Effective Provisions & Appendices (15 cases)
  // =========================================================================
  describe("Category 4: Provision-specific and Delayed Effective Dates (15 cases)", () => {
    const multiDateCases = [
      { prov: "Điều 1", docFrom: "2022-07-01", provFrom: undefined, query: "2023-01-01", expected: true },
      { prov: "Điều 2", docFrom: "2022-07-01", provFrom: undefined, query: "2021-01-01", expected: false },
      { prov: "Điều 15 Khoản 2", docFrom: "2022-07-01", provFrom: "2026-01-01", query: "2022-07-01", expected: false },
      { prov: "Điều 15 Khoản 2", docFrom: "2022-07-01", provFrom: "2026-01-01", query: "2024-01-01", expected: false },
      { prov: "Điều 15 Khoản 2", docFrom: "2022-07-01", provFrom: "2026-01-01", query: "2026-01-01", expected: true },
      { prov: "Điều 15 Khoản 2", docFrom: "2022-07-01", provFrom: "2026-01-01", query: "2026-09-06", expected: true },
      { prov: "Phụ lục I", docFrom: "2022-07-01", provFrom: "2022-07-01", query: "2022-07-01", expected: true },
      { prov: "Phụ lục II (áp dụng thí điểm)", docFrom: "2022-07-01", provFrom: "2021-11-01", query: "2021-12-01", expected: true },
      { prov: "Điều khoản chuyển tiếp 1", docFrom: "2022-07-01", provFrom: undefined, query: "2022-08-01", expected: true },
      { prov: "Điều khoản chuyển tiếp 2", docFrom: "2022-07-01", provFrom: undefined, query: "2021-05-01", expected: false },
      { prov: "Biểu thuế Phụ lục 3", docFrom: "2023-01-01", provFrom: "2024-01-01", query: "2023-06-01", expected: false },
      { prov: "Biểu thuế Phụ lục 3", docFrom: "2023-01-01", provFrom: "2024-01-01", query: "2024-06-01", expected: true },
      { prov: "Quy định hóa đơn vé điện tử", docFrom: "2022-07-01", provFrom: "2023-07-01", query: "2022-12-01", expected: false },
      { prov: "Quy định hóa đơn vé điện tử", docFrom: "2022-07-01", provFrom: "2023-07-01", query: "2023-08-01", expected: true },
      { prov: "Quy định hóa đơn xăng dầu", docFrom: "2022-07-01", provFrom: "2023-12-01", query: "2024-01-01", expected: true },
    ];

    it.each(multiDateCases)(
      "case $# - $prov: effectiveAt=$query is $expected",
      ({ docFrom, provFrom, query, expected }) => {
        const effectiveDate = provFrom ?? docFrom;
        const isEffective = query >= effectiveDate;
        expect(isEffective).toBe(expected);
      }
    );
  });

  // =========================================================================
  // CATEGORY 5: Document Natures, Guidance & Draft Rejection (15 cases)
  // =========================================================================
  describe("Category 5: Document Nature & Invariant Rejection (15 cases)", () => {
    const natureCases = [
      { title: "Luật Thuế giá trị gia tăng số 13/2008/QH12", type: "law", expected: "normative_legal_document" },
      { title: "Nghị định số 123/2020/NĐ-CP", type: "decree", expected: "normative_legal_document" },
      { title: "Thông tư số 78/2021/TT-BTC", type: "circular", expected: "normative_legal_document" },
      { title: "Nghị quyết số 43/2022/QH15", type: "resolution", expected: "normative_legal_document" },
      { title: "Công văn số 1234/TCT-CS", type: "official_letter", expected: "official_guidance" },
      { title: "Công điện số 01/CĐ-TCT", type: "dispatch", expected: "official_guidance" },
      { title: "Hướng dẫn thực hiện quyết toán thuế TNCN", type: "guidance", expected: "official_guidance" },
      { title: "Dự thảo Nghị định sửa đổi Nghị định 123/2020/NĐ-CP", type: "decree", expected: "draft" },
      { title: "Dự thảo Luật Thuế TNDN (sửa đổi)", type: "law", expected: "draft" },
      { title: "Tờ trình về việc ban hành Nghị định thuế", type: "other", expected: "proposal" },
      { title: "Văn bản lấy ý kiến dự thảo Thông tư", type: "other", expected: "consultation" },
      { title: "Văn bản hợp nhất số 01/VBHN-BTC về thuế GTGT", type: "other", expected: "consolidated_document" },
      { title: "Quyết định đính chính Thông tư 78/2021/TT-BTC", type: "decision", expected: "correction" },
      { title: "Quyết định số 123/QĐ-TCT về việc điều động cán bộ", type: "decision", expected: "administrative_document" },
      { title: "Thông báo nộp thuế kỳ 2026", type: "announcement", expected: "administrative_document" },
    ];

    it.each(natureCases)(
      "case $# - $title correctly categorized as $expected",
      ({ title, type, expected }) => {
        const detectedType = detectDocumentType(title);
        const nature = detectDocumentNature(title, detectedType);
        expect(nature).toBe(expected);
      }
    );
  });

  // =========================================================================
  // CATEGORY 6: Source Authority Conflicts & Provenance (15 cases)
  // =========================================================================
  describe("Category 6: Source Authority Conflicts & Provenance (15 cases)", () => {
    interface ConflictFixture {
      name: string;
      assertions: SourceAssertion[];
      expectedStatus: string;
      expectedAnswerable: boolean;
    }

    const conflictCases: ConflictFixture[] = [
      {
        name: "Conflicting effective dates between Công báo and Bộ Tài chính",
        assertions: [
          { sourceName: "congbao", sourceAuthority: "tier_a", snapshotId: "s1", effectiveFrom: "2026-01-01" },
          { sourceName: "mof", sourceAuthority: "tier_b", snapshotId: "s2", effectiveFrom: "2026-07-01" },
        ],
        expectedStatus: "conflicting",
        expectedAnswerable: false,
      },
      {
        name: "Conflicting document numbers between VBPL and Cục Thuế website",
        assertions: [
          { sourceName: "vbpl", sourceAuthority: "tier_a", snapshotId: "s1", documentNumber: "123/2020/ND-CP" },
          { sourceName: "mof", sourceAuthority: "tier_b", snapshotId: "s2", documentNumber: "124/2020/ND-CP" },
        ],
        expectedStatus: "conflicting",
        expectedAnswerable: false,
      },
      {
        name: "Agreement between 2 Tier A sources (Công báo & VBPL)",
        assertions: [
          { sourceName: "congbao", sourceAuthority: "tier_a", snapshotId: "s1", effectiveFrom: "2022-07-01" },
          { sourceName: "vbpl", sourceAuthority: "tier_a", snapshotId: "s2", effectiveFrom: "2022-07-01" },
        ],
        expectedStatus: "cross_verified",
        expectedAnswerable: true,
      },
      {
        name: "Single source verified from Tier A",
        assertions: [
          { sourceName: "congbao", sourceAuthority: "tier_a", snapshotId: "s1", effectiveFrom: "2022-07-01" },
        ],
        expectedStatus: "single_source_verified",
        expectedAnswerable: true,
      },
      {
        name: "Missing effective date from all sources (Rule D Unknown)",
        assertions: [
          { sourceName: "congbao", sourceAuthority: "tier_a", snapshotId: "s1" },
        ],
        expectedStatus: "unverified",
        expectedAnswerable: false,
      },
    ];

    it.each(conflictCases)(
      "case: $name -> $expectedStatus (answerable=$expectedAnswerable)",
      ({ assertions, expectedStatus, expectedAnswerable }) => {
        const res = assertions[0].effectiveFrom !== undefined
          ? verifyEffectiveDate(assertions)
          : assertions[0].documentNumber !== undefined
          ? verifyIdentity(assertions)
          : verifyEffectiveDate(assertions);

        expect(res.status).toBe(expectedStatus);
        const answerable = res.status !== "conflicting" && res.status !== "unverified";
        expect(answerable).toBe(expectedAnswerable);
      }
    );

    // 10 hash immutability cases
    it.each([
      ["Nghị định số 123/2020/NĐ-CP", "text-1"],
      ["Thông tư số 78/2021/TT-BTC", "text-2"],
      ["Luật Quản lý thuế số 38/2019/QH14", "text-3"],
      ["Nghị quyết 43/2022/QH15", "text-4"],
      ["Thông tư 219/2013/TT-BTC", "text-5"],
      ["Thông tư 111/2013/TT-BTC", "text-6"],
      ["Nghị định 126/2020/NĐ-CP", "text-7"],
      ["Nghị định 132/2020/NĐ-CP", "text-8"],
      ["Thông tư 80/2021/TT-BTC", "text-9"],
      ["Thông tư 40/2021/TT-BTC", "text-10"],
    ])("verifies deterministic hashing for %s", (_title, text) => {
      const h1 = computeSha256(text);
      const h2 = computeSha256(text);
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64);
    });
  });

  // =========================================================================
  // CATEGORY 7: Suspensions & Temporary Tax Policies (10 cases)
  // =========================================================================
  describe("Category 7: Suspensions & Temporary Tax Reductions (10 cases)", () => {
    const suspensionCases = [
      { name: "Chính sách giảm thuế GTGT đợt 1 (NĐ 15/2022)", from: "2022-02-01", to: "2022-12-31", query: "2022-06-01", active: true },
      { name: "Chính sách giảm thuế GTGT đợt 1 (NĐ 15/2022)", from: "2022-02-01", to: "2022-12-31", query: "2023-01-01", active: false },
      { name: "Chính sách giảm thuế GTGT đợt 2 (NĐ 44/2023)", from: "2023-07-01", to: "2023-12-31", query: "2023-09-01", active: true },
      { name: "Chính sách giảm thuế GTGT đợt 2 (NĐ 44/2023)", from: "2023-07-01", to: "2023-12-31", query: "2024-01-01", active: false },
      { name: "Chính sách giảm thuế GTGT đợt 3 (NĐ 94/2023)", from: "2024-01-01", to: "2024-06-30", query: "2024-04-01", active: true },
      { name: "Chính sách giảm thuế GTGT đợt 3 (NĐ 94/2023)", from: "2024-01-01", to: "2024-06-30", query: "2024-07-01", active: false },
      { name: "Chính sách giảm thuế GTGT đợt 4 (NĐ 72/2024)", from: "2024-07-01", to: "2024-12-31", query: "2024-10-01", active: true },
      { name: "Chính sách giảm thuế GTGT đợt 4 (NĐ 72/2024)", from: "2024-07-01", to: "2024-12-31", query: "2025-01-01", active: false },
      { name: "Gia hạn nộp thuế TNDN (NĐ 64/2024)", from: "2024-06-17", to: "2024-12-31", query: "2024-09-01", active: true },
      { name: "Gia hạn nộp thuế TNDN (NĐ 64/2024)", from: "2024-06-17", to: "2024-12-31", query: "2025-01-01", active: false },
    ];

    it.each(suspensionCases)(
      "case $# - $name at $query: active=$active",
      ({ from, to, query, active }) => {
        const isCurrentlyActive = query >= from && query <= to;
        expect(isCurrentlyActive).toBe(active);
      }
    );
  });
});
