import { XMLParser } from "fast-xml-parser";
import {
  VbplAttachmentDto,
  VbplDocumentDto,
  VbplHistoryEntryDto,
  VbplRelationshipDto,
} from "./types.js";

function normalizeDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  // Case YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Case DD/MM/YYYY
  const vnMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vnMatch) {
    const d = vnMatch[1].padStart(2, "0");
    const m = vnMatch[2].padStart(2, "0");
    const y = vnMatch[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return undefined;
}

function findValue(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      return obj[k];
    }
    // Also try case-insensitive match
    const lowerKey = k.toLowerCase();
    for (const actualKey of Object.keys(obj)) {
      if (actualKey.toLowerCase() === lowerKey) {
        const val = obj[actualKey];
        if (val !== undefined && val !== null && val !== "") return val;
      }
    }
  }
  return undefined;
}

export class VbplXmlParser {
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
    });
  }

  /**
   * Parse SOAP XML response from GetVanBanById, GetListVanBanByListSKH, or TimKiemVanBan
   */
  public parseDocumentXml(xmlContent: string): VbplDocumentDto[] {
    if (!xmlContent || typeof xmlContent !== "string") return [];

    let parsed: any;
    try {
      parsed = this.parser.parse(xmlContent);
    } catch {
      // If full XML parsing fails, fall back to regex extraction
      return this.parseDocumentWithRegex(xmlContent);
    }

    // Locate the payload nodes
    const docNodes: any[] = [];
    this.extractDocNodes(parsed, docNodes);

    if (docNodes.length === 0) {
      // Check if inner content is an escaped XML string (common in ASMX results)
      const innerString = this.findInnerEscapedXml(parsed);
      if (innerString) {
        try {
          const innerParsed = this.parser.parse(innerString);
          this.extractDocNodes(innerParsed, docNodes);
        } catch {
          // ignore
        }
      }
    }

    if (docNodes.length === 0) {
      return this.parseDocumentWithRegex(xmlContent);
    }

    return docNodes.map((node) => this.mapNodeToDto(node, xmlContent));
  }

  /**
   * Parse history events from GetLichSuVB SOAP response
   */
  public parseHistoryXml(xmlContent: string): VbplHistoryEntryDto[] {
    if (!xmlContent) return [];
    let parsed: any;
    try {
      parsed = this.parser.parse(xmlContent);
    } catch {
      return [];
    }

    const historyEntries: VbplHistoryEntryDto[] = [];
    const collectHistory = (node: any) => {
      if (!node || typeof node !== "object") return;
      const hasDate =
        node.Ngay !== undefined ||
        node.NgayCapNhat !== undefined ||
        node.NgaySuKien !== undefined ||
        node.EventDate !== undefined;
      const hasEventInfo =
        node.LoaiSuKien !== undefined ||
        node.SuKien !== undefined ||
        node.EventType !== undefined ||
        node.NoiDung !== undefined ||
        node.Description !== undefined ||
        node.MoTa !== undefined;
      const isEntry = hasDate && hasEventInfo;
      if (isEntry) {
        historyEntries.push({
          eventDate: normalizeDate(
            findValue(node, ["NgaySuKien", "Ngay", "NgayCapNhat", "EventDate", "NgayTao"])
          ),
          eventType: findValue(node, [
            "LoaiSuKien",
            "SuKien",
            "EventType",
            "TrangThai",
          ]),
          description: findValue(node, ["NoiDung", "MoTa", "Description", "GhiChu"]),
          actor: findValue(node, ["NguoiThucHien", "Actor", "CoQuan"]),
        });
        return;
      }
      for (const k of Object.keys(node)) {
        if (typeof node[k] === "object") {
          if (Array.isArray(node[k])) {
            node[k].forEach(collectHistory);
          } else {
            collectHistory(node[k]);
          }
        }
      }
    };

    collectHistory(parsed);
    return historyEntries;
  }

  private extractDocNodes(current: any, results: any[]) {
    if (!current || typeof current !== "object") return;

    // Direct match for document objects
    if (
      current.SoKyHieu ||
      current.DocumentNumber ||
      current.SoHieu ||
      current.ItemID ||
      current.VanBanID ||
      (current.TrichYeu && current.NgayBanHanh)
    ) {
      results.push(current);
      return;
    }

    for (const key of Object.keys(current)) {
      const val = current[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          this.extractDocNodes(item, results);
        }
      } else if (typeof val === "object") {
        this.extractDocNodes(val, results);
      }
    }
  }

  private findInnerEscapedXml(obj: any): string | null {
    if (!obj || typeof obj !== "object") return null;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (
        typeof val === "string" &&
        val.includes("<") &&
        (val.includes("SoKyHieu") || val.includes("ItemID") || val.includes("VanBan"))
      ) {
        return val;
      }
      if (typeof val === "object") {
        const found = this.findInnerEscapedXml(val);
        if (found) return found;
      }
    }
    return null;
  }

  private mapNodeToDto(node: any, rawXml: string): VbplDocumentDto {
    const vbplId = findValue(node, ["ItemID", "VanBanID", "Id", "DocID", "ID"]);
    const documentNumber = findValue(node, [
      "SoKyHieu",
      "DocumentNumber",
      "SoHieu",
      "DocNumber",
    ]);
    const title =
      findValue(node, ["TrichYeu", "Title", "TenVanBan", "TieuDe"]) ??
      (documentNumber ? `Văn bản số ${documentNumber}` : "Văn bản quy phạm pháp luật");

    const issuer = findValue(node, [
      "CoQuanBanHanh",
      "Issuer",
      "TenCQBH",
      "CoQuan",
    ]);
    const issuedDate = normalizeDate(
      findValue(node, ["NgayBanHanh", "IssuedDate", "NgayKy"])
    );
    const effectiveDate = normalizeDate(
      findValue(node, ["NgayHieuLuc", "EffectiveDate", "NgayCoHieuLuc"])
    );
    const expirationDate = normalizeDate(
      findValue(node, ["NgayHetHieuLuc", "ExpirationDate", "NgayHetLuc"])
    );
    const statusMetadata = findValue(node, [
      "TinhTrangHieuLuc",
      "Status",
      "TrangThai",
      "HieuLuc",
    ]);
    const documentType = findValue(node, [
      "LoaiVanBan",
      "DocumentType",
      "TenLoaiVB",
    ]);
    const signer = findValue(node, ["NguoiKy", "Signer", "HoTenNguoiKy"]);
    const scope = findValue(node, ["PhamVi", "PhamViDieuChinh", "Scope"]);
    const gazetteNumber = findValue(node, [
      "SoCongBao",
      "GazetteNumber",
      "CongBao",
    ]);
    const gazetteDate = normalizeDate(
      findValue(node, ["NgayDangCongBao", "GazetteDate"])
    );

    // Relationships
    const relationships: VbplRelationshipDto[] = [];
    const replaced = findValue(node, [
      "VanBanBiThayThe",
      "ThayThe",
      "Replaces",
    ]);
    if (replaced) {
      relationships.push({
        targetDocNumber: typeof replaced === "string" ? replaced : undefined,
        relationshipType: "replaces",
        rawRelationshipText: String(replaced),
      });
    }

    const repealed = findValue(node, [
      "VanBanBiBaiBo",
      "BaiBo",
      "Repeals",
    ]);
    if (repealed) {
      relationships.push({
        targetDocNumber: typeof repealed === "string" ? repealed : undefined,
        relationshipType: "repeals",
        rawRelationshipText: String(repealed),
      });
    }

    const amended = findValue(node, [
      "VanBanSuaDoiBoSung",
      "SuaDoiBoSung",
      "Amends",
    ]);
    if (amended) {
      relationships.push({
        targetDocNumber: typeof amended === "string" ? amended : undefined,
        relationshipType: "amends",
        rawRelationshipText: String(amended),
      });
    }

    // Attachments
    const attachments: VbplAttachmentDto[] = [];
    const rawFiles = findValue(node, [
      "FileDinhKem",
      "Files",
      "Attachments",
      "LinkFile",
    ]);

    let fileList: any[] = [];
    if (Array.isArray(rawFiles)) {
      fileList = rawFiles;
    } else if (rawFiles && typeof rawFiles === "object") {
      if (rawFiles.File) {
        fileList = Array.isArray(rawFiles.File) ? rawFiles.File : [rawFiles.File];
      } else {
        fileList = [rawFiles];
      }
    } else if (typeof rawFiles === "string" && rawFiles.startsWith("http")) {
      attachments.push({
        filename: rawFiles.split("/").pop() || "attachment.pdf",
        url: rawFiles,
      });
    }

    for (const f of fileList) {
      const url = findValue(f, ["DuongDan", "Url", "Link", "FilePath"]);
      const filename =
        findValue(f, ["TenFile", "FileName", "Name"]) ||
        (url ? url.split("/").pop() : "attachment.pdf");
      if (url) {
        attachments.push({ filename, url });
      }
    }

    // Direct detail URL
    const sourceUrl = vbplId
      ? `https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=${vbplId}`
      : "https://vbpl.vn";

    return {
      vbplId,
      documentNumber,
      title,
      issuer,
      issuedDate,
      effectiveDate,
      expirationDate,
      statusMetadata,
      documentType,
      signer,
      scope,
      gazetteNumber,
      gazetteDate,
      relationships,
      history: [],
      attachments,
      rawXml,
      sourceUrl,
      sourceAuthority: "tier_a",
    };
  }

  private parseDocumentWithRegex(xmlContent: string): VbplDocumentDto[] {
    const extract = (tag: string) => {
      const match = xmlContent.match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
      );
      return match ? match[1].trim() : undefined;
    };

    const docNumber =
      extract("SoKyHieu") || extract("DocumentNumber") || extract("SoHieu");
    const title =
      extract("TrichYeu") ||
      extract("Title") ||
      extract("TenVanBan") ||
      (docNumber ? `Văn bản số ${docNumber}` : "Văn bản quy phạm pháp luật");

    const vbplId = extract("ItemID") || extract("VanBanID") || extract("Id");
    const issuer = extract("CoQuanBanHanh") || extract("Issuer");
    const issuedDate = normalizeDate(
      extract("NgayBanHanh") || extract("IssuedDate")
    );
    const effectiveDate = normalizeDate(
      extract("NgayHieuLuc") || extract("EffectiveDate")
    );
    const expirationDate = normalizeDate(
      extract("NgayHetHieuLuc") || extract("ExpirationDate")
    );
    const statusMetadata =
      extract("TinhTrangHieuLuc") || extract("Status");

    if (!docNumber && !title && !vbplId) return [];

    return [
      {
        vbplId,
        documentNumber: docNumber,
        title,
        issuer,
        issuedDate,
        effectiveDate,
        expirationDate,
        statusMetadata,
        relationships: [],
        history: [],
        attachments: [],
        rawXml: xmlContent,
        sourceUrl: vbplId
          ? `https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=${vbplId}`
          : "https://vbpl.vn",
        sourceAuthority: "tier_a",
      },
    ];
  }
}
