import { logger } from "@vietnam-tax/observability";

export interface FetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
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

  constructor(options?: FetchOptions) {
    this.defaultTimeoutMs =
      options?.timeoutMs ??
      (Number(process.env.HTTP_TIMEOUT_MS) || 15000);
    this.defaultMaxRetries = options?.maxRetries ?? 3;
    this.maxBytes =
      options?.maxBytes ??
      (Number(process.env.MAX_SOURCE_BYTES) || 52428800);
  }

  public async fetchWithRetry(
    url: string,
    options?: FetchOptions
  ): Promise<FetchResult> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options?.maxRetries ?? this.defaultMaxRetries;
    const headers = options?.headers ?? {
      "User-Agent":
        "VietnamTaxLegalMCP/1.1 (+https://github.com/vietnam-tax/mcp-server)",
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
        const response = await fetch(url, {
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
            { url, attempt, maxRetries, delayMs, err: lastError.message },
            "Retrying HTTP fetch"
          );
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, delayMs);
          await promise;
        }
      }
    }

    throw new Error(
      `Failed to fetch ${url} after ${maxRetries + 1} attempts: ${lastError?.message}`
    );
  }
}
