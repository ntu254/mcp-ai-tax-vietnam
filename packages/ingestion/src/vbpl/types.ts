import { SourceAuthority } from "@vietnam-tax/common";

/**
 * Legal document relationship parsed from VBPL (e.g., replaces, repeals, amends)
 */
export interface VbplRelationshipDto {
  targetDocNumber?: string;
  targetDocTitle?: string;
  relationshipType: "amends" | "replaces" | "repeals" | "guides" | "referenced_by" | "other";
  rawRelationshipText?: string;
}

/**
 * Historical event entry parsed from VBPL
 */
export interface VbplHistoryEntryDto {
  eventDate?: string;
  eventType?: string;
  description?: string;
  actor?: string;
}

/**
 * File attachment associated with a document on VBPL
 */
export interface VbplAttachmentDto {
  filename: string;
  url: string;
  buffer?: Buffer;
  sizeBytes?: number;
}

/**
 * Typed Internal DTO representing legal document metadata extracted from VBPL
 * (via SOAP or HTML fallback)
 */
export interface VbplDocumentDto {
  vbplId?: string | number;
  documentNumber?: string;
  title: string;
  issuer?: string;
  issuedDate?: string;
  effectiveDate?: string;
  expirationDate?: string;
  statusMetadata?: string; // e.g. "Còn hiệu lực", "Hết hiệu lực toàn bộ", "Hết hiệu lực một phần", "Chưa có hiệu lực"
  documentType?: string;
  signer?: string;
  scope?: string;
  gazetteNumber?: string;
  gazetteDate?: string;
  relationships: VbplRelationshipDto[];
  history: VbplHistoryEntryDto[];
  attachments: VbplAttachmentDto[];
  rawXml?: string;
  rawHtml?: string;
  sourceUrl: string;
  sourceAuthority: SourceAuthority;
}

/**
 * Result of executing a SOAP operation against VBPL ASMX service
 */
export interface SoapCallResult<T = any> {
  success: boolean;
  operation: "GetVanBanById" | "GetListVanBanByListSKH" | "GetLichSuVB" | "TimKiemVanBan" | string;
  statusCode?: number;
  requiresAuth: boolean;
  rawXml?: string;
  data?: T;
  error?: string;
  isAvailable: boolean;
}

/**
 * Operation support matrix / live status
 */
export interface SoapOperationStatus {
  operation: string;
  isCallableAnonymous: boolean;
  requiresAuth: boolean;
  liveStatus: "available" | "authenticated" | "unavailable" | "error" | "timeout";
  notes: string;
}
