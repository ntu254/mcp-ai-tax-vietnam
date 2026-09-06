import { SourceAuthority } from "@vietnam-tax/common";

export interface DiscoveredItem {
  sourceId: string;
  sourceName: string;
  sourceAuthority: SourceAuthority;
  title: string;
  documentNumber?: string;
  issuedDate?: string;
  publicationDate?: string;
  effectiveDate?: string;
  issuerName?: string;
  sourceUrl: string;
  detailUrl?: string;
  pdfUrl?: string;
  docxUrl?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ConnectorPollOptions {
  since?: Date;
  limit?: number;
}

export interface SourceConnector {
  readonly sourceName: string;
  readonly sourceAuthority: SourceAuthority;
  pollRecent(options?: ConnectorPollOptions): Promise<DiscoveredItem[]>;
  fetchDetail(
    item: DiscoveredItem
  ): Promise<{
    html?: string;
    rawXml?: string;
    binary?: Buffer;
    binaryFilename?: "original.pdf" | "original.docx";
  }>;
}
