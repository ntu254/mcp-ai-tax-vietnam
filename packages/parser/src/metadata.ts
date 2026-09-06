import {
  DocumentNature,
  DocumentType,
  TaxTopic,
} from "@vietnam-tax/common";

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export interface ParsedMetadata {
  documentNumber?: string;
  documentType: DocumentType;
  documentNature: DocumentNature;
  title: string;
  issuerName?: string;
  issuedDate?: string; // YYYY-MM-DD
  publicationDate?: string; // YYYY-MM-DD
  effectiveFrom?: string; // YYYY-MM-DD
  topics: TaxTopic[];
}

export function parseVietnameseDate(text: string): string | undefined {
  // Matches "ngày 19 tháng 10 năm 2020" or "ngày 19/10/2020"
  const longMatch = text.match(
    /ngày\s+0?([1-9]|[12][0-9]|3[01])\s+tháng\s+0?([1-9]|1[0-2])\s+năm\s+((?:19|20)\d{2})/i
  );
  if (longMatch) {
    const day = longMatch[1].padStart(2, "0");
    const month = longMatch[2].padStart(2, "0");
    const year = longMatch[3];
    return `${year}-${month}-${day}`;
  }

  const slashMatch = text.match(
    /0?([1-9]|[12][0-9]|3[01])\/0?([1-9]|1[0-2])\/((?:19|20)\d{2})/
  );
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

export function detectDocumentType(title: string, rawText?: string): DocumentType {
  const t = title.toLowerCase();

  if (t.includes("luật") || t.includes("bộ luật")) return "law";
  if (t.includes("nghị định")) return "decree";
  if (t.includes("thông tư liên tịch")) return "joint_circular";
  if (t.includes("thông tư")) return "circular";
  if (t.includes("nghị quyết")) return "resolution";
  if (t.includes("pháp lệnh")) return "ordinance";
  if (t.includes("quyết định")) return "decision";
  if (t.includes("công văn")) return "official_letter";
  if (t.includes("công điện")) return "dispatch";
  if (t.includes("hướng dẫn")) return "guidance";
  if (t.includes("thông báo")) return "announcement";

  if (rawText) {
    const r = rawText.slice(0, 1000).toLowerCase();
    if (r.includes("nghị định")) return "decree";
    if (r.includes("thông tư")) return "circular";
    if (r.includes("luật")) return "law";
  }

  return "other";
}

export function detectDocumentNature(
  title: string,
  docType: DocumentType,
  rawText?: string
): DocumentNature {
  const combined = `${title} ${rawText?.slice(0, 1000) ?? ""}`.toLowerCase();

  if (combined.includes("lấy ý kiến") || combined.includes("góp ý")) return "consultation";
  if (combined.includes("dự thảo")) return "draft";
  if (combined.includes("tờ trình")) return "proposal";
  if (combined.includes("văn bản hợp nhất")) return "consolidated_document";
  if (combined.includes("đính chính")) return "correction";

  if (
    docType === "law" ||
    docType === "decree" ||
    docType === "circular" ||
    docType === "joint_circular" ||
    docType === "resolution" ||
    docType === "ordinance"
  ) {
    return "normative_legal_document";
  }

  if (
    docType === "official_letter" ||
    docType === "dispatch" ||
    docType === "guidance" ||
    combined.includes("hướng dẫn")
  ) {
    return "official_guidance";
  }

  if (docType === "decision") {
    if (
      combined.includes("quy phạm pháp luật") ||
      combined.includes("ban hành quy định") ||
      combined.includes("quy chế")
    ) {
      return "normative_legal_document";
    }
    return "administrative_document";
  }

  if (docType === "announcement") {
    return "administrative_document";
  }

  return "other";
}

export function classifyTaxTopics(title: string, rawText?: string): TaxTopic[] {
  const content = `${title} ${rawText ?? ""}`.toLowerCase();
  const topics: Set<TaxTopic> = new Set();

  if (content.includes("giá trị gia tăng") || content.includes("gtgt") || content.includes("vat")) {
    topics.add("vat");
  }
  if (content.includes("thu nhập doanh nghiệp") || content.includes("tndn") || content.includes("cit")) {
    topics.add("cit");
  }
  if (content.includes("thu nhập cá nhân") || content.includes("tncn") || content.includes("pit")) {
    topics.add("pit");
  }
  if (content.includes("hóa đơn") || content.includes("chứng từ") || content.includes("hóa đơn điện tử")) {
    topics.add("invoice");
  }
  if (content.includes("quản lý thuế")) {
    topics.add("tax_administration");
  }
  if (content.includes("hộ kinh doanh") || content.includes("cá nhân kinh doanh")) {
    topics.add("household_business");
  }
  if (content.includes("tiêu thụ đặc biệt") || content.includes("ttđb")) {
    topics.add("special_consumption_tax");
  }
  if (content.includes("xuất khẩu") || content.includes("nhập khẩu") || content.includes("hải quan")) {
    topics.add("import_export_duty");
    if (content.includes("hải quan")) topics.add("customs");
  }
  if (content.includes("giao dịch liên kết") || content.includes("chuyển giá")) {
    topics.add("transfer_pricing");
  }
  if (content.includes("nhà thầu") || content.includes("fct")) {
    topics.add("fct");
  }
  if (content.includes("xử phạt") || content.includes("vi phạm hành chính") || content.includes("cưỡng chế")) {
    topics.add("penalties_and_enforcement");
  }
  if (content.includes("tiền thuê đất") || content.includes("sử dụng đất")) {
    topics.add("land_tax");
  }
  if (content.includes("kế toán")) {
    topics.add("accounting");
  }

  if (topics.size === 0) {
    topics.add("other");
  }

  return Array.from(topics);
}

export function parseDocumentMetadata(
  rawTitle: string,
  rawText?: string
): ParsedMetadata {
  const title = decodeHtmlEntities(rawTitle);
  const text = rawText ? decodeHtmlEntities(rawText) : undefined;

  const docType = detectDocumentType(title, text);
  const docNature = detectDocumentNature(title, docType, text);
  const topics = classifyTaxTopics(title, text);
  // Extract document number: e.g. "123/2020/NĐ-CP" or "số 78/2021/TT-BTC"
  const docNumMatch =
    title.match(/số\s*[:.]?\s*([0-9A-Za-zĐđ_./-]+(?:\/[0-9A-Za-zĐđ_./-]+)*)/i) ||
    rawText?.slice(0, 1500).match(/Số\s*:\s*([0-9A-Za-zĐđ_./-]+)/i);
  const documentNumber = docNumMatch ? docNumMatch[1].trim() : undefined;

  // Extract issued date
  const issuedDate = parseVietnameseDate(
    title + (rawText ? " " + rawText.slice(0, 1500) : "")
  );

  // Extract effective date from text if available
  let effectiveFrom: string | undefined;
  if (rawText) {
    const effMatch = rawText.match(
      /(?:có hiệu lực|hiệu lực thi hành|áp dụng)(?:\s+kể)?\s+từ\s+ngày\s+([0-9]{1,2}\s+tháng\s+[0-9]{1,2}\s+năm\s+[0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i
    );
    if (effMatch) {
      effectiveFrom = parseVietnameseDate("ngày " + effMatch[1]);
    }
  }

  // Extract issuer
  let issuerName: string | undefined;
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("chính phủ")) issuerName = "Chính phủ";
  else if (lowerTitle.includes("bộ tài chính")) issuerName = "Bộ Tài chính";
  else if (lowerTitle.includes("tổng cục thuế")) issuerName = "Tổng cục Thuế";
  else if (lowerTitle.includes("quốc hội")) issuerName = "Quốc hội";
  else if (lowerTitle.includes("thủ tướng")) issuerName = "Thủ tướng Chính phủ";

  return {
    documentNumber,
    documentType: docType,
    documentNature: docNature,
    title: title.trim(),
    issuerName,
    issuedDate,
    effectiveFrom,
    topics,
  };
}
