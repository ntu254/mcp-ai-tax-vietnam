import { logger } from "@vietnam-tax/observability";

export const ALLOWED_OFFICIAL_DOMAINS = [
  "congbao.chinhphu.vn",
  "chinhphu.vn",
  "vanban.chinhphu.vn",
  "mof.gov.vn",
  "gdt.gov.vn",
  "customs.gov.vn",
  "moj.gov.vn",
  "data.gov.vn",
] as const;

export interface FetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  allowLocalhost?: boolean;
}

export interface FetchResult {
  status: number;
  statusText: string;
  headers: Headers;
  buffer: Buffer;
  text: string;
}

export class RobustFetcher {
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly maxBytes: number;
  private readonly allowLocalhost: boolean;

  constructor(options?: FetchOptions) {
    this.defaultTimeoutMs =
      options?.timeoutMs ?? (Number(process.env.HTTP_TIMEOUT_MS) || 15000);
    this.defaultMaxRetries = options?.maxRetries ?? 3;
    this.maxBytes =
      options?.maxBytes ?? (Number(process.env.MAX_SOURCE_BYTES) || 52428800);
    this.allowLocalhost =
      options?.allowLocalhost ??
      (process.env.NODE_ENV !== "production" ||
        process.env.ALLOW_LOCAL_FETCH === "true");
  }

  public validateUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid URL format: ${rawUrl}`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `SSRF defense: Protocol '${parsed.protocol}' is not permitted. Only HTTP/HTTPS allowed.`
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check localhost / private IP if allowLocalhost is enabled
    if (
      this.allowLocalhost &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".local"))
    ) {
      return parsed;
    }

    // SSRF checks: block cloud metadata and private IP addresses
    if (
      hostname === "169.254.169.254" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      throw new Error(
        `SSRF defense: Fetching internal/metadata IP '${hostname}' is strictly prohibited.`
      );
    }

    // Domain allowlist verification: must match or be a subdomain of an official legal domain
    const isAllowed = ALLOWED_OFFICIAL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      throw new Error(
        `SSRF defense: Hostname '${hostname}' is not in the official legal domain allowlist.`
      );
    }

    return parsed;
  }

  public async fetchWithRetry(
    url: string,
    options?: FetchOptions
  ): Promise<FetchResult> {
    const validatedUrl = this.validateUrl(url);
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options?.maxRetries ?? this.defaultMaxRetries;
    const headers = options?.headers ?? {
      "User-Agent":
        "VietnamTaxLegalMCP/1.1 (+https://github.com/ntu254/mcp-ai-tax-vietnam)",
      Accept:
        "text/html,application/xhtml+xml,application/xml,application/pdf,*/*",
    };

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(validatedUrl.toString(), {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok && response.status >= 500) {
          throw new Error(
            `Server returned HTTP ${response.status} ${response.statusText}`
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > this.maxBytes) {
          throw new Error(
            `Response size ${arrayBuffer.byteLength} exceeds maximum allowed bytes ${this.maxBytes}`
          );
        }

        const buffer = Buffer.from(arrayBuffer);
        const text = buffer.toString("utf-8");

        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          buffer,
          text,
        };
      } catch (err: unknown) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt <= maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          logger.warn(
            { url: validatedUrl.hostname, attempt, maxRetries, delayMs, err: lastError.message },
            "Retrying HTTP fetch"
          );
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, delayMs);
          await promise;
        }
      }
    }

    throw new Error(
      `Failed to fetch ${validatedUrl.hostname} after ${maxRetries + 1} attempts: ${lastError?.message}`
    );
  }
}
