import { XMLParser } from "fast-xml-parser";
import {
  ConnectorPollOptions,
  DiscoveredItem,
  SourceConnector,
} from "./connector.js";
import { RobustFetcher } from "./fetcher.js";
import { SourceAuthority } from "@vietnam-tax/common";
import { logger } from "@vietnam-tax/observability";

interface RssItemRaw {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string | { "#text"?: string };
  author?: string;
  category?: string;
}

export const CONGBAO_OFFICIAL_CATEGORIES = [
  "chinh-phu-c1",          // Chính phủ (Nghị định, Nghị quyết)
  "bo-tai-chinh-c9",       // Bộ Tài chính (Thông tư)
  "thu-tuong-chinh-phu-c2",// Thủ tướng Chính phủ (Quyết định, Chỉ thị)
  "quoc-hoi-c31",          // Quốc hội (Luật, Nghị quyết)
] as const;

export class CongBaoConnector implements SourceConnector {
  public readonly sourceName = "congbao";
  public readonly sourceAuthority: SourceAuthority = "tier_a";
  private readonly baseUrl = "https://congbao.chinhphu.vn";
  private readonly rssUrl: string;
  private readonly fetcher: RobustFetcher;
  private readonly xmlParser: XMLParser;

  constructor(rssUrl?: string, fetcher?: RobustFetcher) {
    this.rssUrl =
      rssUrl ||
      process.env.CONGBAO_RSS_URL ||
      "https://congbao.chinhphu.vn/home.rss";
    this.fetcher = fetcher ?? new RobustFetcher();
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
    });
  }

  public async pollRecent(
    options?: ConnectorPollOptions
  ): Promise<DiscoveredItem[]> {
    const limit = options?.limit ?? 50;
    logger.info({ url: this.rssUrl, limit }, "Polling Cong Bao feed...");

    let discovered: DiscoveredItem[] = [];

    // Attempt RSS discovery first
    try {
      const result = await this.fetcher.fetchWithRetry(this.rssUrl);
      const parsed = this.xmlParser.parse(result.text);
      const channel = parsed?.rss?.channel;

      if (channel && channel.item) {
        const itemsRaw: RssItemRaw[] = Array.isArray(channel.item)
          ? channel.item
          : [channel.item];

        for (const raw of itemsRaw) {
          const title = raw.title?.trim() ?? "";
          const sourceUrl = raw.link?.trim() ?? "";
          if (!title || !sourceUrl) continue;

          let guid = "";
          if (typeof raw.guid === "string") {
            guid = raw.guid.trim();
          } else if (raw.guid && typeof raw.guid["#text"] === "string") {
            guid = raw.guid["#text"].trim();
          } else {
            guid = sourceUrl;
          }

          const publicationDate = raw.pubDate
            ? new Date(raw.pubDate).toISOString().slice(0, 10)
            : undefined;

          const docNumMatch = title.match(
            /số\s+([0-9A-Za-z_./-]+(?:\/[0-9A-Za-z_./-]+)*)/i
          );
          const documentNumber = docNumMatch ? docNumMatch[1] : undefined;

          discovered.push({
            sourceId: guid,
            sourceName: this.sourceName,
            sourceAuthority: this.sourceAuthority,
            title,
            documentNumber,
            publicationDate,
            sourceUrl,
            detailUrl: sourceUrl,
            rawPayload: {
              description: raw.description,
              category: raw.category,
              pubDate: raw.pubDate,
            },
          });

          if (discovered.length >= limit) break;
        }
      }
    } catch (rssErr: unknown) {
      const msg = rssErr instanceof Error ? rssErr.message : String(rssErr);
      logger.warn({ err: msg }, "RSS feed poll failed or empty, falling back to paged category crawl");
    }

    // If RSS had 0 items (as observed when server empty), crawl paged official listings
    if (discovered.length === 0) {
      logger.info({ limit }, "Ingesting via official Công Báo category pagination listings");
      discovered = await this.pollPagedListing({ limit });
    }

    logger.info(
      { count: discovered.length },
      "Finished Công Báo document discovery"
    );
    return discovered;
  }

  public async pollPagedListing(options: {
    limit?: number;
    categories?: string[];
  }): Promise<DiscoveredItem[]> {
    const limit = options.limit ?? 50;
    const categories = options.categories ?? Array.from(CONGBAO_OFFICIAL_CATEGORIES);
    const discovered: DiscoveredItem[] = [];
    const seenUrls = new Set<string>();

    for (const cat of categories) {
      if (discovered.length >= limit) break;

      // Crawl up to 20 pages per category (15 docs per page)
      for (let page = 1; page <= 20; page++) {
        if (discovered.length >= limit) break;

        const pageUrl =
          page === 1
            ? `${this.baseUrl}/van-ban-dang-cong-bao/${cat}.htm`
            : `${this.baseUrl}/van-ban-dang-cong-bao/${cat}/trang-${page}.htm`;

        logger.debug({ pageUrl }, "Fetching category listing page");

        let html: string;
        try {
          const res = await this.fetcher.fetchWithRetry(pageUrl);
          html = res.text;
        } catch (pageErr: unknown) {
          const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
          logger.warn({ pageUrl, err: msg }, "Failed to fetch category page, moving to next");
          break;
        }

        const docLinkMatches = Array.from(
          html.matchAll(
            /<a[^>]+href=["'](\/van-ban\/[a-z0-9-]+-([0-9]+)\.htm)["'][^>]*>(.*?)<\/a>/gis
          )
        );

        for (const match of docLinkMatches) {
          if (discovered.length >= limit) break;

          const relativeUrl = match[1];
          const docId = match[2];
          const rawLinkText = match[3]
            .replace(/<[^>]+>/g, "")
            .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) =>
              String.fromCodePoint(parseInt(hex, 16))
            )
            .replace(/&#([0-9]+);/g, (_: string, dec: string) =>
              String.fromCodePoint(parseInt(dec, 10))
            )
            .replace(/\s+/g, " ")
            .trim();
          const fullUrl = new URL(relativeUrl, this.baseUrl).toString();
          if (seenUrls.has(fullUrl) || !rawLinkText || rawLinkText.length < 5) {
            continue;
          }
          seenUrls.add(fullUrl);

          const docNumMatch = rawLinkText.match(
            /số\s+([0-9A-Za-zĐđ_./-]+(?:\/[0-9A-Za-zĐđ_./-]+)*)/i
          );
          const documentNumber = docNumMatch ? docNumMatch[1] : undefined;

          discovered.push({
            sourceId: docId || fullUrl,
            sourceName: this.sourceName,
            sourceAuthority: this.sourceAuthority,
            title: rawLinkText,
            documentNumber,
            sourceUrl: fullUrl,
            detailUrl: fullUrl,
          });
        }
      }
    }

    return discovered;
  }

  public async fetchDetail(
    item: DiscoveredItem,
    options?: { downloadBinary?: boolean }
  ): Promise<{
    html?: string;
    binary?: Buffer;
    binaryFilename?: "original.pdf" | "original.docx";
    binaryUrl?: string;
  }> {
    const detailUrl = item.detailUrl ?? item.sourceUrl;
    logger.debug({ url: detailUrl }, "Fetching Cong Bao detail page");

    const pageRes = await this.fetcher.fetchWithRetry(detailUrl);
    const html = pageRes.text;

    // Detect PDF or DOCX links in HTML
    let binary: Buffer | undefined;
    let binaryFilename: "original.pdf" | "original.docx" | undefined;

    const pdfMatch = html.match(
      /href=["'](https?:\/\/[^"']+\.pdf|\/[^"']+\.pdf)["']/i
    );
    const docxMatch = html.match(
      /href=["'](https?:\/\/[^"']+\.docx|\/[^"']+\.docx)["']/i
    );

    let binaryUrl: string | undefined;
    if (pdfMatch) {
      binaryUrl = pdfMatch[1].startsWith("http")
        ? pdfMatch[1]
        : new URL(pdfMatch[1], detailUrl).toString();
      binaryFilename = "original.pdf";
    } else if (docxMatch) {
      binaryUrl = docxMatch[1].startsWith("http")
        ? docxMatch[1]
        : new URL(docxMatch[1], detailUrl).toString();
      binaryFilename = "original.docx";
    }

    if (binaryUrl && binaryFilename && options?.downloadBinary !== false) {
      try {
        const binRes = await this.fetcher.fetchWithRetry(binaryUrl);
        binary = binRes.buffer;
      } catch (binErr) {
        logger.warn(
          { binaryUrl, err: binErr },
          "Failed to download attachment binary file"
        );
      }
    }

    return { html, binary, binaryFilename, binaryUrl };

  }
}
