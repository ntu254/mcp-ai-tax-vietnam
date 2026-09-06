import { computeNormalizedTextHash, computeSha256 } from "@vietnam-tax/source-storage";
import { parseVietnameseDate } from "./metadata.js";

export interface ParsedProvision {
  chapter?: string;
  section?: string;
  article?: string;
  clause?: string;
  point?: string;
  appendix?: string;
  heading?: string;
  content: string;
  normalizedContent: string;
  contentHash: string;
  validFrom?: string;
  validTo?: string;
  statusOverride?: string;
  sortKey: string;
}

export function parseLegalProvisions(rawText: string): ParsedProvision[] {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }

  const lines = rawText.split(/\r?\n/);
  const provisions: ParsedProvision[] = [];

  let currentChapter: string | undefined;
  let currentSection: string | undefined;
  let currentArticle: string | undefined;
  let currentHeading: string | undefined;
  let currentArticleLines: string[] = [];
  let articleIndex = 0;

  function flushArticle() {
    if (!currentArticle || currentArticleLines.length === 0) return;

    const fullArticleContent = currentArticleLines.join("\n").trim();
    articleIndex++;

    // Parse clauses inside this article
    const clauseRegex = /^(?:Khoản\s+)?([0-9]+)\.\s*(.*)/;
    const clauseLines = fullArticleContent.split("\n");

    let currentClauseNum: string | undefined;
    let currentClauseLines: string[] = [];
    let clauseIndex = 0;

    function flushClause() {
      if (currentClauseLines.length === 0) return;
      clauseIndex++;
      const clauseContent = currentClauseLines.join("\n").trim();

      // Check for provision-specific validity inside the clause text
      // e.g. "Khoản này có hiệu lực từ ngày 01/01/2026" or "bãi bỏ từ ngày..."
      let validFrom: string | undefined;
      let validTo: string | undefined;
      let statusOverride: string | undefined;

      const effMatch = clauseContent.match(
        /(?:có hiệu lực|áp dụng)(?:\s+kể)?\s+từ\s+ngày\s+([0-9]{1,2}\s+tháng\s+[0-9]{1,2}\s+năm\s+[0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i
      );
      if (effMatch) {
        validFrom = parseVietnameseDate("ngày " + effMatch[1]);
      }

      const repealMatch = clauseContent.match(
        /(?:bãi bỏ|hết hiệu lực)(?:\s+kể)?\s+từ\s+ngày\s+([0-9]{1,2}\s+tháng\s+[0-9]{1,2}\s+năm\s+[0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i
      );
      if (repealMatch) {
        validTo = parseVietnameseDate("ngày " + repealMatch[1]);
        statusOverride = "repealed";
      }

      const normalized = clauseContent
        .normalize("NFC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      const sortKey = `${articleIndex.toString().padStart(4, "0")}.${clauseIndex.toString().padStart(4, "0")}`;

      provisions.push({
        chapter: currentChapter,
        section: currentSection,
        article: currentArticle,
        clause: currentClauseNum,
        heading: currentHeading,
        content: clauseContent,
        normalizedContent: normalized,
        contentHash: computeSha256(clauseContent),
        validFrom,
        validTo,
        statusOverride,
        sortKey,
      });

      currentClauseLines = [];
    }

    let hasExplicitClauses = false;

    for (const l of clauseLines) {
      const trimmed = l.trim();
      const match = trimmed.match(clauseRegex);

      if (match) {
        hasExplicitClauses = true;
        flushClause();
        currentClauseNum = match[1];
        currentClauseLines.push(trimmed);
      } else {
        currentClauseLines.push(trimmed);
      }
    }

    if (hasExplicitClauses) {
      flushClause();
    } else {
      // Entire article is a single provision
      const normalized = fullArticleContent
        .normalize("NFC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      const sortKey = `${articleIndex.toString().padStart(4, "0")}.0000`;

      provisions.push({
        chapter: currentChapter,
        section: currentSection,
        article: currentArticle,
        heading: currentHeading,
        content: fullArticleContent,
        normalizedContent: normalized,
        contentHash: computeSha256(fullArticleContent),
        sortKey,
      });
    }

    currentArticleLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect Chapter: "Chương I ...", "Chương 1 ..."
    const chapterMatch = trimmed.match(/^Chương\s+([IVXLCDM0-9]+)[\s:.-]*(.*)/i);
    if (chapterMatch) {
      flushArticle();
      currentChapter = `Chương ${chapterMatch[1]}`;
      continue;
    }

    // Detect Section: "Mục 1 ...", "Mục I ..."
    const sectionMatch = trimmed.match(/^Mục\s+([IVXLCDM0-9]+)[\s:.-]*(.*)/i);
    if (sectionMatch) {
      flushArticle();
      currentSection = `Mục ${sectionMatch[1]}`;
      continue;
    }

    // Detect Article: "Điều 1.", "Điều 12: Quy định..."
    const articleMatch = trimmed.match(/^Điều\s+([0-9]+[a-z]?)[\s:.-]*(.*)/i);
    if (articleMatch) {
      flushArticle();
      currentArticle = `Điều ${articleMatch[1]}`;
      currentHeading = articleMatch[2]?.trim() || undefined;
      currentArticleLines = [trimmed];
      continue;
    }

    if (currentArticle) {
      currentArticleLines.push(trimmed);
    }
  }

  flushArticle();

  // If no "Điều" was parsed (e.g. short official letter), treat whole text as paragraphs
  if (provisions.length === 0 && rawText.trim().length > 0) {
    const normalized = rawText
      .normalize("NFC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    provisions.push({
      article: "Toàn văn",
      content: rawText.trim(),
      normalizedContent: normalized,
      contentHash: computeSha256(rawText.trim()),
      sortKey: "0001.0000",
    });
  }

  return provisions;
}
