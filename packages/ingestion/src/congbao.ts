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

export class CongBaoConnector implements SourceConnector {
  public readonly sourceName = "congbao";
  public readonly sourceAuthority: SourceAuthority = "tier_a";
  private readonly rssUrl: string;
  private readonly fetcher: RobustFetcher;
  private readonly xmlParser: XMLParser;

  constructor(rssUrl?: string, fetcher?: RobustFetcher) {
    this.rssUrl =
      rssUrl ||
      process.env.CONGBAO_RSS_URL ||
      "https://congbao.chinhphu.vn/rss";
    this.fetcher = fetcher ?? new RobustFetcher();
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
    });
  }

  public async pollRecent(
    options?: ConnectorPollOptions
  ): Promise<DiscoveredItem[]> {
    logger.info({ url: this.rssUrl }, "Polling Cong Bao RSS feed");
    const result = await this.fetcher.fetchWithRetry(this.rssUrl);
    const parsed = this.xmlParser.parse(result.text);

    const channel = parsed?.rss?.channel;
    if (!channel) {
      logger.warn("No RSS channel found in response");
      return [];
    }

    const itemsRaw: RssItemRaw[] = Array.isArray(channel.item)
      ? channel.item
      : channel.item
      ? [channel.item]
      : [];

    const discovered: DiscoveredItem[] = [];

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

      // Extract document number if present in title e.g. "Nghị định số 123/2020/NĐ-CP"
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

      if (options?.limit && discovered.length >= options.limit) {
        break;
      }
    }

    logger.info(
      { count: discovered.length },
      "Finished parsing Cong Bao RSS feed"
    );
    return discovered;
  }

  public async fetchDetail(
    item: DiscoveredItem
  ): Promise<{
    html?: string;
    binary?: Buffer;
    binaryFilename?: "original.pdf" | "original.docx";
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

    if (binaryUrl && binaryFilename) {
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

    return { html, binary, binaryFilename };
  }
}
