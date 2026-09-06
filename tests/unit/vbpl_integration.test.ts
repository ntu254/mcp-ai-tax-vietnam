import { describe, expect, it } from "vitest";
import {
  VbplXmlParser,
  VbplSoapClient,
  VbplConnector,
  HtmlFallbackStrategy,
} from "@vietnam-tax/ingestion";
import {
  verifyIdentity,
  verifyEffectiveDate,
  SourceAssertion,
} from "@vietnam-tax/verification";
import { computeSha256 } from "@vietnam-tax/source-storage";

describe("VBPL Integration & SOAP Discovery Strategy", () => {
  const sampleVanBanSoapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetVanBanByIdResponse xmlns="http://tempuri.org/">
      <GetVanBanByIdResult>
        <VanBan>
          <ItemID>26500</ItemID>
          <SoKyHieu>219/2013/TT-BTC</SoKyHieu>
          <TrichYeu>Hướng dẫn thi hành Luật Thuế giá trị gia tăng và Nghị định số 209/2013/NĐ-CP</TrichYeu>
          <CoQuanBanHanh>Bộ Tài chính</CoQuanBanHanh>
          <NgayBanHanh>2013-12-31</NgayBanHanh>
          <NgayHieuLuc>2014-01-01</NgayHieuLuc>
          <NgayHetHieuLuc></NgayHetHieuLuc>
          <TinhTrangHieuLuc>Còn hiệu lực</TinhTrangHieuLuc>
          <LoaiVanBan>Thông tư</LoaiVanBan>
          <NguoiKy>Đỗ Hoàng Anh Tuấn</NguoiKy>
          <PhamVi>Toàn quốc</PhamVi>
          <SoCongBao>55+56</SoCongBao>
          <NgayDangCongBao>2014-01-15</NgayDangCongBao>
          <VanBanBiThayThe>06/2012/TT-BTC</VanBanBiThayThe>
          <VanBanBiBaiBo>65/2013/TT-BTC</VanBanBiBaiBo>
          <VanBanSuaDoiBoSung>119/2014/TT-BTC</VanBanSuaDoiBoSung>
          <FileDinhKem>
            <File>
              <TenFile>219_2013_TT-BTC.pdf</TenFile>
              <DuongDan>https://vbpl.vn/attachments/219_2013_TT-BTC.pdf</DuongDan>
            </File>
          </FileDinhKem>
        </VanBan>
      </GetVanBanByIdResult>
    </GetVanBanByIdResponse>
  </soap:Body>
</soap:Envelope>`;

  const sampleHistorySoapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetLichSuVBResponse xmlns="http://tempuri.org/">
      <GetLichSuVBResult>
        <LichSu>
          <SuKien>
            <Ngay>2013-12-31</Ngay>
            <LoaiSuKien>Ban hành</LoaiSuKien>
            <NoiDung>Bộ Tài chính ban hành Thông tư số 219/2013/TT-BTC</NoiDung>
            <NguoiThucHien>Bộ Tài chính</NguoiThucHien>
          </SuKien>
          <SuKien>
            <Ngay>2014-01-01</Ngay>
            <LoaiSuKien>Có hiệu lực</LoaiSuKien>
            <NoiDung>Thông tư chính thức có hiệu lực thi hành</NoiDung>
            <NguoiThucHien>Hệ thống</NguoiThucHien>
          </SuKien>
          <SuKien>
            <Ngay>2014-08-25</Ngay>
            <LoaiSuKien>Sửa đổi, bổ sung</LoaiSuKien>
            <NoiDung>Thông tư 119/2014/TT-BTC sửa đổi, bổ sung một số điều</NoiDung>
            <NguoiThucHien>Bộ Tài chính</NguoiThucHien>
          </SuKien>
        </LichSu>
      </GetLichSuVBResult>
    </GetLichSuVBResponse>
  </soap:Body>
</soap:Envelope>`;

  const parser = new VbplXmlParser();

  describe("5. Parse SOAP XML into typed internal DTO", () => {
    it("parses all required VBPL fields accurately from SOAP XML", () => {
      const docs = parser.parseDocumentXml(sampleVanBanSoapXml);
      expect(docs).toHaveLength(1);
      const doc = docs[0];

      // Verify all prioritized fields
      expect(doc.documentNumber).toBe("219/2013/TT-BTC");
      expect(doc.title).toContain("Hướng dẫn thi hành Luật Thuế giá trị gia tăng");
      expect(doc.issuer).toBe("Bộ Tài chính");
      expect(doc.issuedDate).toBe("2013-12-31");
      expect(doc.effectiveDate).toBe("2014-01-01");
      expect(doc.expirationDate).toBeUndefined();
      expect(doc.statusMetadata).toBe("Còn hiệu lực");
      expect(doc.vbplId).toBe("26500");
      expect(doc.signer).toBe("Đỗ Hoàng Anh Tuấn");
      expect(doc.scope).toBe("Toàn quốc");
      expect(doc.gazetteNumber).toBe("55+56");
      expect(doc.gazetteDate).toBe("2014-01-15");

      // Verify relationships
      expect(doc.relationships).toHaveLength(3);
      const relTypes = doc.relationships.map((r) => r.relationshipType);
      expect(relTypes).toContain("replaces");
      expect(relTypes).toContain("repeals");
      expect(relTypes).toContain("amends");

      // Verify attachments
      expect(doc.attachments).toHaveLength(1);
      expect(doc.attachments[0].filename).toBe("219_2013_TT-BTC.pdf");
      expect(doc.attachments[0].url).toBe(
        "https://vbpl.vn/attachments/219_2013_TT-BTC.pdf"
      );
    });

    it("parses document history events from GetLichSuVB XML", () => {
      const history = parser.parseHistoryXml(sampleHistorySoapXml);
      expect(history).toHaveLength(3);
      expect(history[0].eventDate).toBe("2013-12-31");
      expect(history[0].eventType).toBe("Ban hành");
      expect(history[1].eventDate).toBe("2014-01-01");
      expect(history[1].eventType).toBe("Có hiệu lực");
      expect(history[2].eventType).toBe("Sửa đổi, bổ sung");
    });
  });

  describe("2. Authentication & UserDetails Handling", () => {
    it("flags TimKiemVanBan as requiring authentication when UserDetails missing", async () => {
      const client = new VbplSoapClient({
        endpoint: "https://ws.vbpl.vn/vbqppl.asmx",
        timeoutMs: 500,
      });

      // Without credentials, timKiemVanBan should report requiresAuth without bypass
      const res = await client.timKiemVanBan({ keyword: "thuế" });
      expect(res.requiresAuth).toBe(true);
      expect(res.operation).toBe("TimKiemVanBan");
    });
  });

  describe("7. Immutable snapshot for response SOAP as legal evidence", () => {
    it("computes SHA-256 for response.xml and follows canonical storage key pattern", () => {
      const hash = computeSha256(sampleVanBanSoapXml);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      const sourceId = "vbpl-doc-26500";
      const snapshotId = "snap-uuid-1234";
      const d = new Date("2026-09-06T12:00:00Z");
      const year = d.getFullYear().toString();
      const month = (d.getMonth() + 1).toString().padStart(2, "0");

      const expectedKey = `raw/vbpl/${year}/${month}/${sourceId}/${snapshotId}/response.xml`;
      expect(expectedKey).toBe(
        `raw/vbpl/2026/09/vbpl-doc-26500/snap-uuid-1234/response.xml`
      );
    });
  });

  describe("8. Cross-verification with Công báo (Congbao assertion + VBPL assertion)", () => {
    it("marks cross_verified when Công báo and VBPL agree on identity and effective date", () => {
      const congBaoAssertion: SourceAssertion = {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "cb-snap-01",
        documentNumber: "219/2013/TT-BTC",
        title: "Thông tư 219/2013/TT-BTC hướng dẫn thuế GTGT",
        issuedDate: "2013-12-31",
        effectiveFrom: "2014-01-01",
      };

      const vbplAssertion: SourceAssertion = {
        sourceName: "vbpl",
        sourceAuthority: "tier_a",
        snapshotId: "vbpl-snap-01",
        documentNumber: "219/2013/TT-BTC",
        title: "Thông tư số 219/2013/TT-BTC của Bộ Tài chính",
        issuedDate: "2013-12-31",
        effectiveFrom: "2014-01-01",
        statusMetadata: "Còn hiệu lực",
      };

      const assertions = [congBaoAssertion, vbplAssertion];
      const identityRes = verifyIdentity(assertions);
      const dateRes = verifyEffectiveDate(assertions);

      expect(identityRes.passed).toBe(true);
      expect(identityRes.status).toBe("cross_verified");
      expect(identityRes.conflicts).toHaveLength(0);

      expect(dateRes.passed).toBe(true);
      expect(dateRes.status).toBe("cross_verified");
      expect(dateRes.conflicts).toHaveLength(0);
    });

    it("marks conflicting and answerable=false when effective date disagrees between Tier A sources", () => {
      const congBaoAssertion: SourceAssertion = {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "cb-snap-02",
        documentNumber: "123/2020/NĐ-CP",
        effectiveFrom: "2022-07-01",
      };

      const vbplConflictingAssertion: SourceAssertion = {
        sourceName: "vbpl",
        sourceAuthority: "tier_a",
        snapshotId: "vbpl-snap-02",
        documentNumber: "123/2020/NĐ-CP",
        effectiveFrom: "2022-01-01", // Mismatch!
      };

      const assertions = [congBaoAssertion, vbplConflictingAssertion];
      const dateRes = verifyEffectiveDate(assertions);

      expect(dateRes.passed).toBe(false);
      expect(dateRes.status).toBe("conflicting");
      expect(dateRes.conflicts).toHaveLength(1);
      expect(dateRes.conflicts[0].fieldName).toBe("default_effective_from");
      expect(dateRes.conflicts[0].severity).toBe("high");
    });

    it("marks conflicting when document number disagrees between Tier A sources", () => {
      const congBaoAssertion: SourceAssertion = {
        sourceName: "congbao",
        sourceAuthority: "tier_a",
        snapshotId: "cb-snap-03",
        documentNumber: "123/2020/NĐ-CP",
      };

      const vbplConflictingAssertion: SourceAssertion = {
        sourceName: "vbpl",
        sourceAuthority: "tier_a",
        snapshotId: "vbpl-snap-03",
        documentNumber: "123/2020/ND-CP-TYPO",
      };

      const assertions = [congBaoAssertion, vbplConflictingAssertion];
      const identityRes = verifyIdentity(assertions);

      expect(identityRes.passed).toBe(false);
      expect(identityRes.status).toBe("conflicting");
      expect(identityRes.conflicts).toHaveLength(1);
      expect(identityRes.conflicts[0].fieldName).toBe("document_number");
      expect(identityRes.conflicts[0].severity).toBe("high");
    });
  });

  describe("4. VbplConnector Architecture & HTML Fallback", () => {
    it("instantiates VbplConnector with all modular strategies", () => {
      const connector = new VbplConnector();
      expect(connector.sourceName).toBe("vbpl");
      expect(connector.sourceAuthority).toBe("tier_a");
      expect(connector.soapClient).toBeDefined();
      expect(connector.soapSearch).toBeDefined();
      expect(connector.soapDetail).toBeDefined();
      expect(connector.soapHistory).toBeDefined();
      expect(connector.htmlFallback).toBeDefined();
    });

    it("parses HTML properties table via HtmlFallbackStrategy accurately", () => {
      const sampleHtml = `
        <html>
          <head><title>Nghị định số 123/2020/NĐ-CP | CSDL Quốc gia</title></head>
          <body>
            <h1>Nghị định số 123/2020/NĐ-CP quy định về hóa đơn, chứng từ</h1>
            <table class="table-doc-props">
              <tr><td>Số ký hiệu</td><td>123/2020/NĐ-CP</td></tr>
              <tr><td>Ngày ban hành</td><td>19/10/2020</td></tr>
              <tr><td>Ngày có hiệu lực</td><td>01/07/2022</td></tr>
              <tr><td>Cơ quan ban hành</td><td>Chính phủ</td></tr>
              <tr><td>Tình trạng hiệu lực</td><td>Còn hiệu lực</td></tr>
              <tr><td>Loại văn bản</td><td>Nghị định</td></tr>
              <tr><td>Người ký</td><td>Nguyễn Xuân Phúc</td></tr>
              <tr><td>Văn bản bị thay thế</td><td>51/2010/NĐ-CP</td></tr>
            </table>
            <a href="/van-ban/123_2020_ND_CP.pdf">Tải về toàn văn PDF</a>
          </body>
        </html>
      `;

      const strategy = new HtmlFallbackStrategy();
      const doc = strategy.parseDocumentHtml(sampleHtml, "https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=143210");

      expect(doc.documentNumber).toBe("123/2020/NĐ-CP");
      expect(doc.issuedDate).toBe("2020-10-19");
      expect(doc.effectiveDate).toBe("2022-07-01");
      expect(doc.issuer).toBe("Chính phủ");
      expect(doc.statusMetadata).toBe("Còn hiệu lực");
      expect(doc.documentType).toBe("Nghị định");
      expect(doc.signer).toBe("Nguyễn Xuân Phúc");
      expect(doc.relationships).toHaveLength(1);
      expect(doc.relationships[0].relationshipType).toBe("replaces");
      expect(doc.attachments).toHaveLength(1);
      expect(doc.attachments[0].url).toBe("https://vbpl.vn/van-ban/123_2020_ND_CP.pdf");
    });
  });
});
