import { logger } from "@vietnam-tax/observability";
import {
  SoapCallResult,
  SoapOperationStatus,
  VbplDocumentDto,
  VbplHistoryEntryDto,
} from "./types.js";
import { VbplXmlParser } from "./xml-parser.js";

export interface SoapClientOptions {
  endpoint?: string;
  timeoutMs?: number;
  namespace?: string;
}

export class VbplSoapClient {
  public readonly endpoint: string;
  public readonly namespace: string;
  private readonly timeoutMs: number;
  private readonly parser: VbplXmlParser;

  constructor(options?: SoapClientOptions) {
    this.endpoint =
      options?.endpoint ||
      process.env.VBPL_SOAP_ENDPOINT ||
      "https://ws.vbpl.vn/vbqppl.asmx";
    this.namespace = options?.namespace || "http://tempuri.org/";
    this.timeoutMs = options?.timeoutMs || 12000;
    this.parser = new VbplXmlParser();
  }

  /**
   * Execute raw SOAP 1.1 / 1.2 request to VBPL ASMX endpoint
   */
  public async executeRawSoap(
    operation: string,
    bodyInnerXml: string,
    soapActionOverride?: string
  ): Promise<SoapCallResult<string>> {
    const actionUri = soapActionOverride ?? `${this.namespace}${operation}`;

    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operation} xmlns="${this.namespace}">
      ${bodyInnerXml}
    </${operation}>
  </soap:Body>
</soap:Envelope>`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      logger.debug(
        { endpoint: this.endpoint, operation, actionUri },
        "Sending SOAP request to VBPL"
      );

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"${actionUri}"`,
          "User-Agent":
            "VietnamTaxLegalMCP/1.1 (+https://github.com/ntu254/mcp-ai-tax-vietnam)",
          Accept: "text/xml, application/xml, */*",
        },
        body: envelope,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const statusCode = response.status;
      const rawText = await response.text();

      // Check for authentication requirement or Access Denied in SOAP fault
      const requiresAuth =
        statusCode === 401 ||
        statusCode === 403 ||
        rawText.toLowerCase().includes("userdetails") ||
        rawText.toLowerCase().includes("access denied") ||
        rawText.toLowerCase().includes("unauthorized") ||
        rawText.toLowerCase().includes("yêu cầu xác thực") ||
        rawText.toLowerCase().includes("chưa đăng nhập");

      if (statusCode === 200) {
        return {
          success: true,
          operation,
          statusCode,
          requiresAuth: false,
          rawXml: rawText,
          data: rawText,
          isAvailable: true,
        };
      }

      return {
        success: false,
        operation,
        statusCode,
        requiresAuth,
        rawXml: rawText,
        error: `HTTP ${statusCode}: ${response.statusText}`,
        isAvailable: statusCode !== 502 && statusCode !== 503 && statusCode !== 504,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("aborted") || msg.includes("timeout");
      const isTlsError =
        msg.includes("certificate") ||
        msg.includes("ERR_TLS_CERT_ALTNAME_INVALID") ||
        msg.includes("CERT_COMMON_NAME_INVALID") ||
        msg.includes("Hostname/IP does not match") ||
        msg.includes("altnames");

      logger.warn(
        { operation, err: msg, isTimeout, isTlsError },
        "VBPL SOAP call failed"
      );

      return {
        success: false,
        operation,
        requiresAuth: false,
        error: isTlsError
          ? "TLS_HOSTNAME_MISMATCH: Server certificate SAN (*.moj.gov.vn) does not match requested hostname ws.vbpl.vn. Production TLS validation prohibits connection without valid certificate."
          : isTimeout
          ? `TIMEOUT: Server did not respond within ${this.timeoutMs}ms`
          : msg,
        isAvailable: false,
      };
    }
  }

  /**
   * 1. GetVanBanById
   */
  public async getVanBanById(
    id: string | number
  ): Promise<SoapCallResult<VbplDocumentDto | null>> {
    const res = await this.executeRawSoap("GetVanBanById", `<id>${id}</id>`);

    if (!res.success || !res.rawXml) {
      return {
        ...res,
        data: null,
      };
    }

    const docs = this.parser.parseDocumentXml(res.rawXml);
    return {
      ...res,
      data: docs[0] ?? null,
    };
  }

  /**
   * 2. GetListVanBanByListSKH
   */
  public async getListVanBanByListSKH(
    skhList: string | string[]
  ): Promise<SoapCallResult<VbplDocumentDto[]>> {
    const listString = Array.isArray(skhList) ? skhList.join(",") : skhList;
    const res = await this.executeRawSoap(
      "GetListVanBanByListSKH",
      `<listSKH>${listString}</listSKH>`
    );

    if (!res.success || !res.rawXml) {
      return {
        ...res,
        data: [],
      };
    }

    const docs = this.parser.parseDocumentXml(res.rawXml);
    return {
      ...res,
      data: docs,
    };
  }

  /**
   * 3. GetLichSuVB
   */
  public async getLichSuVB(
    id: string | number
  ): Promise<SoapCallResult<VbplHistoryEntryDto[]>> {
    const res = await this.executeRawSoap("GetLichSuVB", `<id>${id}</id>`);

    if (!res.success || !res.rawXml) {
      return {
        ...res,
        data: [],
      };
    }

    const history = this.parser.parseHistoryXml(res.rawXml);
    return {
      ...res,
      data: history,
    };
  }

  /**
   * 4. TimKiemVanBan
   * Note: The schema of TimKiemVanBan includes UserDetails.
   * If credentials are not provided or server rejects anonymous queries,
   * it cleanly records as authenticated/unavailable without attempting bypass.
   */
  public async timKiemVanBan(params: {
    keyword?: string;
    userDetails?: { username?: string; password?: string; token?: string };
  }): Promise<SoapCallResult<VbplDocumentDto[]>> {
    let body = "";
    if (params.userDetails) {
      body += `<UserDetails>
        <UserName>${params.userDetails.username ?? ""}</UserName>
        <Password>${params.userDetails.password ?? ""}</Password>
      </UserDetails>`;
    }
    if (params.keyword) {
      body += `<Keyword>${params.keyword}</Keyword>`;
    }

    const res = await this.executeRawSoap("TimKiemVanBan", body);

    // If missing userDetails or fault indicates auth requirement
    const requiresAuth =
      !params.userDetails ||
      res.requiresAuth ||
      (res.rawXml?.includes("UserDetails") ?? false);

    if (!res.success || !res.rawXml) {
      return {
        ...res,
        requiresAuth,
        data: [],
      };
    }

    const docs = this.parser.parseDocumentXml(res.rawXml);
    return {
      ...res,
      requiresAuth,
      data: docs,
    };
  }

  /**
   * Test live anonymous access across the 4 key operations
   */
  public async testLiveAnonymousAccess(): Promise<
    Record<string, SoapOperationStatus>
  > {
    const statusMap: Record<string, SoapOperationStatus> = {};

    // 1. GetVanBanById
    const resId = await this.getVanBanById(1);
    statusMap["GetVanBanById"] = {
      operation: "GetVanBanById",
      isCallableAnonymous: resId.success && !resId.requiresAuth,
      requiresAuth: resId.requiresAuth,
      liveStatus: resId.success
        ? "available"
        : resId.requiresAuth
        ? "authenticated"
        : resId.error?.includes("TIMEOUT")
        ? "timeout"
        : "unavailable",
      notes: resId.error ?? (resId.success ? "Callable anonymous" : "Unavailable"),
    };

    // 2. GetListVanBanByListSKH
    const resSkh = await this.getListVanBanByListSKH("219/2013/TT-BTC");
    statusMap["GetListVanBanByListSKH"] = {
      operation: "GetListVanBanByListSKH",
      isCallableAnonymous: resSkh.success && !resSkh.requiresAuth,
      requiresAuth: resSkh.requiresAuth,
      liveStatus: resSkh.success
        ? "available"
        : resSkh.requiresAuth
        ? "authenticated"
        : resSkh.error?.includes("TIMEOUT")
        ? "timeout"
        : "unavailable",
      notes: resSkh.error ?? (resSkh.success ? "Callable anonymous" : "Unavailable"),
    };

    // 3. GetLichSuVB
    const resHist = await this.getLichSuVB(1);
    statusMap["GetLichSuVB"] = {
      operation: "GetLichSuVB",
      isCallableAnonymous: resHist.success && !resHist.requiresAuth,
      requiresAuth: resHist.requiresAuth,
      liveStatus: resHist.success
        ? "available"
        : resHist.requiresAuth
        ? "authenticated"
        : resHist.error?.includes("TIMEOUT")
        ? "timeout"
        : "unavailable",
      notes: resHist.error ?? (resHist.success ? "Callable anonymous" : "Unavailable"),
    };

    // 4. TimKiemVanBan
    const resSearch = await this.timKiemVanBan({ keyword: "thuế" });
    statusMap["TimKiemVanBan"] = {
      operation: "TimKiemVanBan",
      isCallableAnonymous: resSearch.success && !resSearch.requiresAuth,
      requiresAuth: resSearch.requiresAuth || true, // schema mandates UserDetails
      liveStatus: resSearch.success
        ? "available"
        : resSearch.requiresAuth
        ? "authenticated"
        : "unavailable",
      notes: resSearch.error ?? "Schema requires UserDetails; recorded as authenticated/unavailable anonymously",
    };

    return statusMap;
  }
}
