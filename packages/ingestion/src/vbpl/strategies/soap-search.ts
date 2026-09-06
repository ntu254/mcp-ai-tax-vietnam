import { logger } from "@vietnam-tax/observability";
import { VbplSoapClient } from "../soap-client.js";
import { VbplDocumentDto } from "../types.js";

export class SoapSearchStrategy {
  constructor(private readonly client: VbplSoapClient) {}

  /**
   * Search VBPL by SKH or keyword using SOAP.
   * If SOAP operations fail (unavailable or requires auth), returns null.
   */
  public async search(criteria: {
    documentNumbers?: string[];
    keyword?: string;
    userDetails?: { username?: string; password?: string };
  }): Promise<{ documents: VbplDocumentDto[]; success: boolean; requiresAuth: boolean; error?: string }> {
    // 1. If document numbers provided, prefer GetListVanBanByListSKH
    if (criteria.documentNumbers && criteria.documentNumbers.length > 0) {
      logger.debug(
        { count: criteria.documentNumbers.length },
        "Attempting SOAP discovery via GetListVanBanByListSKH"
      );
      const res = await this.client.getListVanBanByListSKH(criteria.documentNumbers);
      if (res.success && res.data) {
        return {
          documents: res.data,
          success: true,
          requiresAuth: false,
        };
      }
      if (res.requiresAuth) {
        return {
          documents: [],
          success: false,
          requiresAuth: true,
          error: "GetListVanBanByListSKH requires authentication",
        };
      }
    }

    // 2. Try TimKiemVanBan if keyword is present
    if (criteria.keyword || criteria.userDetails) {
      logger.debug(
        { keyword: criteria.keyword },
        "Attempting SOAP discovery via TimKiemVanBan"
      );
      const res = await this.client.timKiemVanBan({
        keyword: criteria.keyword,
        userDetails: criteria.userDetails,
      });
      if (res.success && res.data) {
        return {
          documents: res.data,
          success: true,
          requiresAuth: false,
        };
      }
      return {
        documents: [],
        success: false,
        requiresAuth: res.requiresAuth,
        error: res.error ?? "TimKiemVanBan requires UserDetails authentication",
      };
    }

    return {
      documents: [],
      success: false,
      requiresAuth: false,
      error: "No valid SOAP search criteria provided",
    };
  }
}
