import { logger } from "@vietnam-tax/observability";
import { VbplSoapClient } from "../soap-client.js";
import { VbplDocumentDto } from "../types.js";

export class SoapDetailStrategy {
  constructor(private readonly client: VbplSoapClient) {}

  /**
   * Fetch full document detail via GetVanBanById
   */
  public async fetchDetail(
    vbplId: string | number
  ): Promise<{ document: VbplDocumentDto | null; rawXml?: string; success: boolean; error?: string }> {
    logger.debug({ vbplId }, "Fetching VBPL document detail via GetVanBanById");
    const res = await this.client.getVanBanById(vbplId);

    if (res.success && res.data) {
      return {
        document: res.data,
        rawXml: res.rawXml,
        success: true,
      };
    }

    return {
      document: null,
      rawXml: res.rawXml,
      success: false,
      error: res.error ?? "Failed to fetch document detail via SOAP",
    };
  }
}
