import { logger } from "@vietnam-tax/observability";
import { RobustFetcher } from "../../fetcher.js";
import { VbplAttachmentDto, VbplDocumentDto, VbplRelationshipDto } from "../types.js";

function normalizeDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  // Case YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  // Case DD/MM/YYYY
  const vnMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vnMatch) {
    return `${vnMatch[3]}-${vnMatch[2].padStart(2, "0")}-${vnMatch[1].padStart(2, "0")}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return undefined;
}

export class HtmlFallbackStrategy {
  private readonly baseUrl = "https://vbpl.vn";
  private readonly fetcher: RobustFetcher;

  constructor(fetcher?: RobustFetcher) {
    this.fetcher = fetcher ?? new RobustFetcher();
  }

  /**
   * Fetch and parse document details from HTML page
   */
  public async fetchDetail(
    urlOrItemId: string | number
  ): Promise<{ document: VbplDocumentDto | null; html?: string; binary?: Buffer; binaryFilename?: "original.pdf" | "original.docx"; success: boolean; error?: string }> {
    const url =
      typeof urlOrItemId === "number" || /^\d+$/.test(String(urlOrItemId))
        ? `${this.baseUrl}/TW/Pages/vbpq-toanvan.aspx?ItemID=${urlOrItemId}`
        : String(urlOrItemId).startsWith("http")
        ? String(urlOrItemId)
        : `${this.baseUrl}${urlOrItemId}`;

    logger.debug({ url }, "Fetching VBPL document via HTML fallback");

    try {
      const res = await this.fetcher.fetchWithRetry(url);
      const html = res.text;
      const doc = this.parseDocumentHtml(html, url);

      // Attempt attachment download if available
      let binary: Buffer | undefined;
      let binaryFilename: "original.pdf" | "original.docx" | undefined;

      if (doc.attachments.length > 0) {
        const firstPdf = doc.attachments.find((a) => a.url.toLowerCase().endsWith(".pdf"));
        const targetAttach = firstPdf ?? doc.attachments[0];
        if (targetAttach && targetAttach.url) {
          try {
            const binRes = await this.fetcher.fetchWithRetry(targetAttach.url);
            binary = binRes.buffer;
            binaryFilename = targetAttach.url.toLowerCase().endsWith(".docx")
              ? "original.docx"
              : "original.pdf";
          } catch (binErr) {
            logger.warn({ url: targetAttach.url, err: binErr }, "Failed to fetch attachment binary");
          }
        }
      }

      return {
        document: doc,
        html,
        binary,
        binaryFilename,
        success: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ url, err: msg }, "HTML fallback fetch failed");
      return {
        document: null,
        success: false,
        error: msg,
      };
    }
  }

  /**
   * Parse VBPL document properties table from HTML
   */
  public parseDocumentHtml(html: string, sourceUrl: string): VbplDocumentDto {
    const cleanText = (s?: string) =>
      s
        ? s
            .replace(/<[^>]+>/g, " ")
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
              String.fromCodePoint(parseInt(hex, 16))
            )
            .replace(/&#([0-9]+);/g, (_, dec) =>
              String.fromCodePoint(parseInt(dec, 10))
            )
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        : undefined;

    // Extract item ID from URL or page
    const idMatch = sourceUrl.match(/ItemID=(\d+)/i) || html.match(/ItemID=(\d+)/i);
    const vbplId = idMatch ? idMatch[1] : undefined;

    // Extract title
    const titleMatch =
      html.match(/<h1[^>]*>(.*?)<\/h1>/is) ||
      html.match(/<title>([^<]+)<\/title>/i);
    let title = cleanText(titleMatch ? titleMatch[1] : undefined) ?? "";
    if (title.includes("|")) {
      title = title.split("|")[0].trim();
    }

    // Extract table key-value properties
    const propMap: Record<string, string> = {};
    const rowMatches = Array.from(
      html.matchAll(/<tr[^>]*>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>/gis)
    );
    for (const r of rowMatches) {
      const key = cleanText(r[1])?.toLowerCase();
      const val = cleanText(r[2]);
      if (key && val) {
        propMap[key] = val;
      }
    }

    // Fallback regex for common VBPL metadata labels
    const extractLabel = (pattern: RegExp) => {
      const m = html.match(pattern);
      return m ? cleanText(m[1]) : undefined;
    };

    const documentNumber =
      propMap["số ký hiệu"] ||
      propMap["số hiệu"] ||
      extractLabel(/Số ký hiệu:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i) ||
      extractLabel(/Số ký hiệu:\s*<b>(.*?)<\/b>/i);

    const issuer =
      propMap["cơ quan ban hành"] ||
      extractLabel(/Cơ quan ban hành:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i);

    const issuedDate = normalizeDate(
      propMap["ngày ban hành"] ||
      extractLabel(/Ngày ban hành:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i)
    );

    const effectiveDate = normalizeDate(
      propMap["ngày có hiệu lực"] ||
      propMap["ngày hiệu lực"] ||
      extractLabel(/Ngày có hiệu lực:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i)
    );

    const expirationDate = normalizeDate(
      propMap["ngày hết hiệu lực"] ||
      extractLabel(/Ngày hết hiệu lực:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i)
    );

    const statusMetadata =
      propMap["tình trạng hiệu lực"] ||
      propMap["hiệu lực"] ||
      extractLabel(/Tình trạng hiệu lực:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i);

    const documentType =
      propMap["loại văn bản"] ||
      extractLabel(/Loại văn bản:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i);

    const signer =
      propMap["người ký"] ||
      extractLabel(/Người ký:\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i);

    // Relationships
    const relationships: VbplRelationshipDto[] = [];
    const replacedText = propMap["văn bản bị thay thế"] || propMap["thay thế cho"];
    if (replacedText) {
      relationships.push({
        targetDocNumber: replacedText,
        relationshipType: "replaces",
        rawRelationshipText: replacedText,
      });
    }

    const repealedText = propMap["văn bản bị bãi bỏ"] || propMap["bãi bỏ"];
    if (repealedText) {
      relationships.push({
        targetDocNumber: repealedText,
        relationshipType: "repeals",
        rawRelationshipText: repealedText,
      });
    }

    const amendedText =
      propMap["văn bản sửa đổi, bổ sung"] ||
      propMap["sửa đổi bổ sung cho"];
    if (amendedText) {
      relationships.push({
        targetDocNumber: amendedText,
        relationshipType: "amends",
        rawRelationshipText: amendedText,
      });
    }

    // Attachments
    const attachments: VbplAttachmentDto[] = [];
    const fileMatches = Array.from(
      html.matchAll(/href=["']([^"']+\.(?:pdf|docx|doc))["'][^>]*>(.*?)<\/a>/gis)
    );
    for (const f of fileMatches) {
      const rawHref = f[1];
      const linkText = cleanText(f[2]) || rawHref.split("/").pop() || "original.pdf";
      const fullUrl = rawHref.startsWith("http")
        ? rawHref
        : new URL(rawHref, this.baseUrl).toString();
      attachments.push({
        filename: linkText,
        url: fullUrl,
      });
    }

    return {
      vbplId,
      documentNumber,
      title: title || (documentNumber ? `Văn bản số ${documentNumber}` : "Văn bản quy phạm pháp luật"),
      issuer,
      issuedDate,
      effectiveDate,
      expirationDate,
      statusMetadata,
      documentType,
      signer,
      relationships,
      history: [],
      attachments,
      rawHtml: html,
      sourceUrl,
      sourceAuthority: "tier_a",
    };
  }
}
