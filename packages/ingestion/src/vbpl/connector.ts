import { SourceAuthority } from "@vietnam-tax/common";
import { logger } from "@vietnam-tax/observability";
import {
  ConnectorPollOptions,
  DiscoveredItem,
  SourceConnector,
} from "../connector.js";
import { RobustFetcher } from "../fetcher.js";
import { VbplSoapClient } from "./soap-client.js";
import { HtmlFallbackStrategy } from "./strategies/html-fallback.js";
import { SoapDetailStrategy } from "./strategies/soap-detail.js";
import { SoapHistoryStrategy } from "./strategies/soap-history.js";
import { SoapSearchStrategy } from "./strategies/soap-search.js";
import { VbplDocumentDto } from "./types.js";

export interface VbplConnectorOptions {
  soapEndpoint?: string;
  fetcher?: RobustFetcher;
  forceHtmlFallback?: boolean;
}

export class VbplConnector implements SourceConnector {
  public readonly sourceName = "vbpl";
  public readonly sourceAuthority: SourceAuthority = "tier_a";

  public readonly soapClient: VbplSoapClient;
  public readonly soapSearch: SoapSearchStrategy;
  public readonly soapDetail: SoapDetailStrategy;
  public readonly soapHistory: SoapHistoryStrategy;
  public readonly htmlFallback: HtmlFallbackStrategy;

  private readonly forceHtmlFallback: boolean;

  constructor(options?: VbplConnectorOptions) {
    this.soapClient = new VbplSoapClient({
      endpoint: options?.soapEndpoint,
    });
    this.soapSearch = new SoapSearchStrategy(this.soapClient);
    this.soapDetail = new SoapDetailStrategy(this.soapClient);
    this.soapHistory = new SoapHistoryStrategy(this.soapClient);
    this.htmlFallback = new HtmlFallbackStrategy(options?.fetcher);
    this.forceHtmlFallback = options?.forceHtmlFallback ?? false;
  }

  /**
   * Discover recent or target documents from VBPL
   */
  public async pollRecent(
    options?: ConnectorPollOptions & {
      targetDocNumbers?: string[];
      keyword?: string;
      userDetails?: { username?: string; password?: string };
    }
  ): Promise<DiscoveredItem[]> {
    const limit = options?.limit ?? 20;
    const discovered: DiscoveredItem[] = [];

    if (!this.forceHtmlFallback) {
      logger.info("Attempting discovery via VBPL SOAP service");
      const searchRes = await this.soapSearch.search({
        documentNumbers: options?.targetDocNumbers,
        keyword: options?.keyword,
        userDetails: options?.userDetails,
      });

      if (searchRes.success && searchRes.documents.length > 0) {
        for (const doc of searchRes.documents.slice(0, limit)) {
          discovered.push(this.mapDtoToDiscoveredItem(doc));
        }
        logger.info(
          { count: discovered.length },
          "Successfully discovered documents via SOAP"
        );
        return discovered;
      }

      if (searchRes.requiresAuth) {
        logger.warn(
          { error: searchRes.error },
          "VBPL SOAP search requires credentials (UserDetails). Falling back to HTML/direct discovery."
        );
      } else {
        logger.warn(
          { error: searchRes.error },
          "VBPL SOAP service unavailable. Engaging HTML fallback strategy."
        );
      }
    }

    return discovered;
  }

  /**
   * Fetch full legal document detail and evidence from VBPL
   */
  public async fetchDetail(
    item: DiscoveredItem
  ): Promise<{
    html?: string;
    rawXml?: string;
    binary?: Buffer;
    binaryFilename?: "original.pdf" | "original.docx";
    document?: VbplDocumentDto;
  }> {
    const vbplId = item.sourceId;

    // 1. If not forcing HTML fallback and numeric ID is available, try SOAP GetVanBanById
    if (!this.forceHtmlFallback && vbplId && /^\d+$/.test(vbplId)) {
      logger.info({ vbplId }, "Attempting SOAP GetVanBanById detail retrieval");
      const detailRes = await this.soapDetail.fetchDetail(vbplId);

      if (detailRes.success && detailRes.document) {
        // Also fetch history
        const histRes = await this.soapHistory.fetchHistory(vbplId);
        if (histRes.success) {
          detailRes.document.history = histRes.history;
        }

        return {
          rawXml: detailRes.rawXml,
          document: detailRes.document,
        };
      }

      logger.warn(
        { vbplId, error: detailRes.error },
        "SOAP GetVanBanById unavailable. Falling back to HTML strategy."
      );
    }

    // 2. Fall back to HTML extraction
    const targetUrl = item.detailUrl ?? item.sourceUrl ?? vbplId;
    const htmlRes = await this.htmlFallback.fetchDetail(targetUrl);

    return {
      html: htmlRes.html,
      binary: htmlRes.binary,
      binaryFilename: htmlRes.binaryFilename,
      document: htmlRes.document ?? undefined,
    };
  }

  public mapDtoToDiscoveredItem(doc: VbplDocumentDto): DiscoveredItem {
    return {
      sourceId: String(doc.vbplId ?? doc.documentNumber ?? doc.sourceUrl),
      sourceName: this.sourceName,
      sourceAuthority: this.sourceAuthority,
      title: doc.title,
      documentNumber: doc.documentNumber,
      issuedDate: doc.issuedDate,
      effectiveDate: doc.effectiveDate,
      issuerName: doc.issuer,
      sourceUrl: doc.sourceUrl,
      detailUrl: doc.sourceUrl,
      rawPayload: {
        vbplId: doc.vbplId,
        statusMetadata: doc.statusMetadata,
        documentType: doc.documentType,
        signer: doc.signer,
        scope: doc.scope,
        expirationDate: doc.expirationDate,
        gazetteNumber: doc.gazetteNumber,
        gazetteDate: doc.gazetteDate,
        relationships: doc.relationships,
        history: doc.history,
        attachments: doc.attachments,
      },
    };
  }
}
