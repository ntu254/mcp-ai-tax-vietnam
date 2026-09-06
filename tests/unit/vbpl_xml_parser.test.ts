import { describe, expect, it } from "vitest";
import { VbplXmlParser } from "@vietnam-tax/ingestion";

describe("VbplXmlParser — SOAP XML to Typed Internal DTO", () => {
  const parser = new VbplXmlParser();

  it("parses GetVanBanById SOAP 1.1 response with all priority fields", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetVanBanByIdResponse xmlns="http://tempuri.org/">
      <GetVanBanByIdResult>
        <VanBan>
          <ItemID>158920</ItemID>
          <SoKyHieu>123/2020/NĐ-CP</SoKyHieu>
          <TrichYeu>Nghị định quy định về hóa đơn, chứng từ</TrichYeu>
          <CoQuanBanHanh>Chính phủ</CoQuanBanHanh>
          <NgayBanHanh>19/10/2020</NgayBanHanh>
          <NgayHieuLuc>01/07/2022</NgayHieuLuc>
          <NgayHetHieuLuc></NgayHetHieuLuc>
          <TinhTrangHieuLuc>Còn hiệu lực</TinhTrangHieuLuc>
          <LoaiVanBan>Nghị định</LoaiVanBan>
          <NguoiKy>Nguyễn Xuân Phúc</NguoiKy>
          <VanBanBiThayThe>51/2010/NĐ-CP</VanBanBiThayThe>
          <VanBanSuaDoiBoSung>04/2014/NĐ-CP</VanBanSuaDoiBoSung>
          <FileDinhKem>
            <File>
              <TenFile>123_2020_ND_CP.pdf</TenFile>
              <DuongDan>https://vbpl.vn/FileData/123_2020_ND_CP.pdf</DuongDan>
            </File>
          </FileDinhKem>
        </VanBan>
      </GetVanBanByIdResult>
    </GetVanBanByIdResponse>
  </soap:Body>
</soap:Envelope>`;

    const docs = parser.parseDocumentXml(xml);
    expect(docs).toHaveLength(1);
    const doc = docs[0];

    // Priority field verifications:
    expect(String(doc.vbplId)).toBe("158920");
    expect(doc.documentNumber).toBe("123/2020/NĐ-CP");
    expect(doc.title).toBe("Nghị định quy định về hóa đơn, chứng từ");
    expect(doc.issuer).toBe("Chính phủ");
    expect(doc.issuedDate).toBe("2020-10-19");
    expect(doc.effectiveDate).toBe("2022-07-01");
    expect(doc.statusMetadata).toBe("Còn hiệu lực");
    expect(doc.documentType).toBe("Nghị định");
    expect(doc.signer).toBe("Nguyễn Xuân Phúc");

    // Relationships:
    expect(doc.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetDocNumber: "51/2010/NĐ-CP",
          relationshipType: "replaces",
        }),
        expect.objectContaining({
          targetDocNumber: "04/2014/NĐ-CP",
          relationshipType: "amends",
        }),
      ])
    );

    // Attachments:
    expect(doc.attachments).toHaveLength(1);
    expect(doc.attachments[0].filename).toBe("123_2020_ND_CP.pdf");
    expect(doc.attachments[0].url).toBe("https://vbpl.vn/FileData/123_2020_ND_CP.pdf");
  });

  it("parses GetListVanBanByListSKH ADO.NET DiffGram Dataset response", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GetListVanBanByListSKHResponse xmlns="http://tempuri.org/">
      <GetListVanBanByListSKHResult>
        <diffgr:diffgram xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1">
          <NewDataSet>
            <Table diffgr:id="Table1">
              <DocID>2001</DocID>
              <SoHieu>274/2026/NĐ-CP</SoHieu>
              <TieuDe>Nghị định quy định chi tiết Luật Đấu thầu</TieuDe>
              <TenCQBH>Chính phủ</TenCQBH>
              <NgayKy>2026-07-07T00:00:00</NgayKy>
              <NgayCoHieuLuc>2026-08-21T00:00:00</NgayCoHieuLuc>
              <TrangThai>Còn hiệu lực</TrangThai>
            </Table>
            <Table diffgr:id="Table2">
              <DocID>2002</DocID>
              <SoHieu>335/2026/NĐ-CP</SoHieu>
              <TieuDe>Nghị định quy định chính sách trợ giúp xã hội</TieuDe>
              <TenCQBH>Chính phủ</TenCQBH>
              <NgayKy>2026-08-21T00:00:00</NgayKy>
              <NgayCoHieuLuc>2026-09-01T00:00:00</NgayCoHieuLuc>
              <TrangThai>Chưa có hiệu lực</TrangThai>
            </Table>
          </NewDataSet>
        </diffgr:diffgram>
      </GetListVanBanByListSKHResult>
    </GetListVanBanByListSKHResponse>
  </soap12:Body>
</soap12:Envelope>`;

    const docs = parser.parseDocumentXml(xml);
    expect(docs).toHaveLength(2);

    expect(docs[0].documentNumber).toBe("274/2026/NĐ-CP");
    expect(docs[0].issuedDate).toBe("2026-07-07");
    expect(docs[0].effectiveDate).toBe("2026-08-21");
    expect(docs[0].statusMetadata).toBe("Còn hiệu lực");

    expect(docs[1].documentNumber).toBe("335/2026/NĐ-CP");
    expect(docs[1].issuedDate).toBe("2026-08-21");
    expect(docs[1].effectiveDate).toBe("2026-09-01");
    expect(docs[1].statusMetadata).toBe("Chưa có hiệu lực");
  });

  it("parses GetLichSuVB history events", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetLichSuVBResponse xmlns="http://tempuri.org/">
      <GetLichSuVBResult>
        <LichSu>
          <SuKien>
            <NgaySuKien>19/10/2020</NgaySuKien>
            <LoaiSuKien>Ban hành</LoaiSuKien>
            <NoiDung>Chính phủ ban hành Nghị định 123/2020/NĐ-CP</NoiDung>
            <CoQuan>Chính phủ</CoQuan>
          </SuKien>
          <SuKien>
            <NgaySuKien>01/07/2022</NgaySuKien>
            <LoaiSuKien>Hiệu lực</LoaiSuKien>
            <NoiDung>Bắt đầu có hiệu lực thi hành toàn bộ</NoiDung>
          </SuKien>
          <SuKien>
            <NgaySuKien>15/09/2024</NgaySuKien>
            <LoaiSuKien>Sửa đổi</LoaiSuKien>
            <NoiDung>Bị sửa đổi bổ sung bởi Nghị định 72/2024/NĐ-CP</NoiDung>
          </SuKien>
        </LichSu>
      </GetLichSuVBResult>
    </GetLichSuVBResponse>
  </soap:Body>
</soap:Envelope>`;

    const history = parser.parseHistoryXml(xml);
    expect(history).toHaveLength(3);
    expect(history[0].eventDate).toBe("2020-10-19");
    expect(history[0].eventType).toBe("Ban hành");
    expect(history[0].actor).toBe("Chính phủ");

    expect(history[1].eventDate).toBe("2022-07-01");
    expect(history[1].eventType).toBe("Hiệu lực");

    expect(history[2].eventDate).toBe("2024-09-15");
    expect(history[2].eventType).toBe("Sửa đổi");
  });

  it("extracts nested escaped XML within SOAP response", () => {
    const innerXml = `<VanBan><ItemID>999</ItemID><SoKyHieu>15/2026/TT-BTC</SoKyHieu><TrichYeu>Thông tư hướng dẫn thuế</TrichYeu><NgayBanHanh>2026-03-01</NgayBanHanh><NgayHieuLuc>2026-04-15</NgayHieuLuc></VanBan>`;
    const escaped = innerXml.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const outerXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetVanBanByIdResponse xmlns="http://tempuri.org/">
      <GetVanBanByIdResult>${escaped}</GetVanBanByIdResult>
    </GetVanBanByIdResponse>
  </soap:Body>
</soap:Envelope>`;

    const docs = parser.parseDocumentXml(outerXml);
    expect(docs).toHaveLength(1);
    expect(docs[0].documentNumber).toBe("15/2026/TT-BTC");
    expect(docs[0].title).toBe("Thông tư hướng dẫn thuế");
    expect(docs[0].issuedDate).toBe("2026-03-01");
    expect(docs[0].effectiveDate).toBe("2026-04-15");
  });
});
