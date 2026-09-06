import { DocumentType } from "@vietnam-tax/common";

const TYPE_CODE_MAP: Record<DocumentType, string> = {
  constitution: "HP",
  law: "LUAT",
  resolution: "NQ",
  ordinance: "PL",
  decree: "ND",
  decision: "QD",
  circular: "TT",
  joint_circular: "TTLT",
  official_letter: "CV",
  dispatch: "CD",
  guidance: "HD",
  announcement: "TB",
  other: "VB",
};

export function normalizeDocumentNumber(docNum: string): string {
  return docNum
    .normalize("NFC")
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    // Remove Vietnamese accents from suffixes like NĐ-CP -> ND-CP
    .replace(/Đ/g, "D")
    .replace(/[ÀÁẢÃẠÂẦẤẨẪẬĂẰẮẲẴẶ]/g, "A")
    .replace(/[ÈÉẺẼẸÊỀẾỂỄỆ]/g, "E")
    .replace(/[ÌÍỈĨỊ]/g, "I")
    .replace(/[ÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ]/g, "O")
    .replace(/[ÙÚỦŨỤƯỪỨỬỮỰ]/g, "U")
    .replace(/[ỲÝỶỸỴ]/g, "Y")
    .replace(/[.,;:]+$/, "")
    .trim();
}

export interface CanonicalIdParams {
  documentType: DocumentType;
  documentNumber?: string | null;
  issuedDate?: string | null; // YYYY-MM-DD
  issuerCode?: string | null;
}

export function buildCanonicalId(
  params: CanonicalIdParams
): { canonicalId: string; canonicalStatus: "resolved" | "unresolved" } {
  if (!params.documentNumber) {
    return {
      canonicalId: `VN:UNRESOLVED:${crypto.randomUUID()}`,
      canonicalStatus: "unresolved",
    };
  }

  const normalizedNumber = normalizeDocumentNumber(params.documentNumber);
  const typeCode = TYPE_CODE_MAP[params.documentType] || "VB";

  // Extract year from document number e.g. "123/2020/ND-CP" -> 2020
  const yearMatch = normalizedNumber.match(/\/((?:19|20)\d{2})\//);
  let year: string | undefined;

  if (yearMatch) {
    year = yearMatch[1];
  } else if (params.issuedDate) {
    year = params.issuedDate.slice(0, 4);
  } else {
    year = new Date().getFullYear().toString();
  }

  // Sanitize number segment for ID: replace / with -
  const slugNumber = normalizedNumber.replace(/\//g, "-");

  const canonicalId = `VN:${typeCode}:${year}:${slugNumber}`;
  return {
    canonicalId,
    canonicalStatus: "resolved",
  };
}
