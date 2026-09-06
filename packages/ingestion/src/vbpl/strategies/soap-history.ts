import { logger } from "@vietnam-tax/observability";
import { VbplSoapClient } from "../soap-client.js";
import { VbplHistoryEntryDto } from "../types.js";

export class SoapHistoryStrategy {
  constructor(private readonly client: VbplSoapClient) {}

  /**
   * Fetch document event and amendment history via GetLichSuVB
   */
  public async fetchHistory(
    vbplId: string | number
  ): Promise<{ history: VbplHistoryEntryDto[]; rawXml?: string; success: boolean; error?: string }> {
    logger.debug({ vbplId }, "Fetching VBPL document history via GetLichSuVB");
    const res = await this.client.getLichSuVB(vbplId);

    if (res.success && res.data) {
      return {
        history: res.data,
        rawXml: res.rawXml,
        success: true,
      };
    }

    return {
      history: [],
      rawXml: res.rawXml,
      success: false,
      error: res.error ?? "Failed to fetch document history via SOAP",
    };
  }
}
