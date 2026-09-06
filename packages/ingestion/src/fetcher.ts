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
  maxRedirects?: number;
  headers?: Record<string, string>;
  allowLocalhost?: boolean;
}

export interface FetchResult {
  status: number;
  statusText: string;
  headers: Headers;
  buffer: Buffer;
  text: string;
  finalUrl: string;
  redirectsCount: number;
}

export class RobustFetcher {
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly allowLocalhost: boolean;

  constructor(options?: FetchOptions) {
    this.defaultTimeoutMs =
      options?.timeoutMs ?? (Number(process.env.HTTP_TIMEOUT_MS) || 15000);
    this.defaultMaxRetries = options?.maxRetries ?? 3;
    this.maxBytes =
      options?.maxBytes ?? (Number(process.env.MAX_SOURCE_BYTES) || 52428800);
    this.maxRedirects = options?.maxRedirects ?? 5;
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

    // Protocol check: Only http and https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `SSRF defense: Protocol '${parsed.protocol}' is prohibited. Only HTTP and HTTPS are allowed.`
      );
    }

    // Userinfo check: Reject credentials in URL e.g. user:pass@host
    if (parsed.username || parsed.password) {
      throw new Error(
        "SSRF defense: URLs with embedded userinfo (credentials) are strictly prohibited."
      );
    }

    // Hostname normalization: lowercase and strip trailing dots (e.g. domain.com.)
    let hostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");

    // Port check: strictly enforce standard ports (80/443) unless localhost testing
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    if (port !== 80 && port !== 443) {
      if (!this.allowLocalhost) {
        throw new Error(
          `SSRF defense: Non-standard port '${port}' is prohibited in production.`
        );
      }
    }

    // Localhost / Loopback allowance
    if (this.allowLocalhost) {
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".local")
      ) {
        return parsed;
      }
    }

    // Comprehensive IPv4 & IPv6 Private / Link-Local / Metadata Address Blocking
    if (
      // Cloud metadata address
      hostname === "169.254.169.254" ||
      // IPv4 private ranges
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname === "127.0.0.1" ||
      // IPv6 private & loopback ranges
      hostname === "::1" ||
      hostname.startsWith("fe80:") ||
      hostname.startsWith("fc00:") ||
      hostname.startsWith("fd00:") ||
      hostname.startsWith("::ffff:")
    ) {
      throw new Error(
        `SSRF defense: Direct access to internal, loopback, or metadata address '${hostname}' is prohibited.`
      );
    }

    // Domain allowlist verification
    const isAllowed = ALLOWED_OFFICIAL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      throw new Error(
        `SSRF defense: Target domain '${hostname}' is not permitted by official government legal domain allowlist.`
      );
    }

    return parsed;
  }

  public async fetchWithRetry(
    initialUrl: string,
    options?: FetchOptions
  ): Promise<FetchResult> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options?.maxRetries ?? this.defaultMaxRetries;
    const maxRedirects = options?.maxRedirects ?? this.maxRedirects;
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
      let currentUrl = this.validateUrl(initialUrl).toString();
      let redirectCount = 0;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Manual redirect following loop to re-validate URL on every hop
        while (redirectCount <= maxRedirects) {
          const response = await fetch(currentUrl, {
            headers,
            signal: controller.signal,
            redirect: "manual", // Prevent blind automatic redirect
          });

          // Handle 3xx Redirects
          if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.has("location")
          ) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              throw new Error(
                `Exceeded maximum allowed redirects of ${maxRedirects}`
              );
            }

            const rawLocation = response.headers.get("location")!;
            const targetUrl = new URL(rawLocation, currentUrl).toString();

            // CRUCIAL: Validate redirect target against allowlist and private IP filters
            const validatedTarget = this.validateUrl(targetUrl);
            logger.debug(
              { from: currentUrl, to: validatedTarget.toString() },
              "Validated safe redirect hop"
            );
            currentUrl = validatedTarget.toString();
            continue;
          }

          clearTimeout(timer);

          if (!response.ok && response.status >= 500) {
            throw new Error(
              `Server returned HTTP ${response.status} ${response.statusText}`
            );
          }

          // Progressive streaming size check to prevent decompression bombs
          const reader = response.body?.getReader();
          const chunks: Uint8Array[] = [];
          let totalBytes = 0;

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                totalBytes += value.byteLength;
                if (totalBytes > this.maxBytes) {
                  throw new Error(
                    `Response stream exceeded maximum allowed size of ${this.maxBytes} bytes (decompression bomb protection).`
                  );
                }
                chunks.push(value);
              }
            }
          }

          const buffer = Buffer.concat(chunks);
          const text = buffer.toString("utf-8");

          return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            buffer,
            text,
            finalUrl: currentUrl,
            redirectsCount: redirectCount,
          };
        }
      } catch (err: unknown) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));

        // If it's a security/SSRF violation, DO NOT RETRY — fail fast!
        if (lastError.message.includes("SSRF defense")) {
          throw lastError;
        }

        if (attempt <= maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          logger.warn(
            { attempt, maxRetries, delayMs, err: lastError.message },
            "Retrying fetch operation"
          );
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, delayMs);
          await promise;
        }
      }
    }

    throw new Error(
      `Failed to fetch after ${maxRetries + 1} attempts: ${lastError?.message}`
    );
  }
}
