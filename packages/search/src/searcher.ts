import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import {
  DatabaseInstance,
  documentTopics,
  legalDocuments,
  legalProvisions,
} from "@vietnam-tax/db";
import {
  DocumentNature,
  DocumentType,
  SearchLegalDocsInput,
  SearchLegalDocsItem,
  TaxTopic,
  VerificationStatus,
} from "@vietnam-tax/common";
import { normalizeDocumentNumber } from "@vietnam-tax/canonicalization";
import { logger } from "@vietnam-tax/observability";

export interface SearchOptions extends SearchLegalDocsInput {
  effectiveOnly?: boolean;
}

export class LegalSearchEngine {
  constructor(private readonly db: DatabaseInstance) {}

  public async search(options: SearchOptions): Promise<SearchLegalDocsItem[]> {
    const query = options.query.trim();
    const limit = options.limit ?? 20;

    // Check if query looks like a document number e.g. "123/2020/NĐ-CP"
    const docNumMatch = query.match(
      /([0-9]+(?:\/[0-9]+)?\/[A-Za-z0-9Đđ_.-]+)/i
    );
    const candidateDocNum = options.document_number ?? (docNumMatch ? docNumMatch[1] : undefined);
    const normalizedCandidateNumber = candidateDocNum
      ? normalizeDocumentNumber(candidateDocNum)
      : undefined;

    // Build conditions
    const conditions = [];

    // Filter by document nature if requested
    if (options.document_nature) {
      conditions.push(eq(legalDocuments.document_nature, options.document_nature));
    } else if (options.effectiveOnly) {
      // Hard legal filter: exclude drafts and proposals
      conditions.push(
        sql`${legalDocuments.document_nature} NOT IN ('draft', 'proposal', 'consultation')`
      );
    }

    if (options.document_type) {
      conditions.push(eq(legalDocuments.document_type, options.document_type));
    }

    if (options.issued_from) {
      conditions.push(gte(legalDocuments.issued_date, options.issued_from));
    }

    if (options.issued_to) {
      conditions.push(lte(legalDocuments.issued_date, options.issued_to));
    }

    if (options.issuer) {
      conditions.push(ilike(legalDocuments.issuer_name, `%${options.issuer}%`));
    }

    // Text search condition: title, document_number, or FTS
    const sanitizedTerms = query
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .join(" & ");

    if (sanitizedTerms.length > 0) {
      conditions.push(
        or(
          normalizedCandidateNumber
            ? eq(legalDocuments.normalized_document_number, normalizedCandidateNumber)
            : undefined,
          ilike(legalDocuments.title, `%${query}%`),
          sql`to_tsvector('simple', ${legalDocuments.title} || ' ' || COALESCE(${legalDocuments.normalized_text}, '')) @@ to_tsquery('simple', ${sanitizedTerms})`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Execute query
    const results = await this.db
      .select()
      .from(legalDocuments)
      .where(whereClause)
      .limit(limit * 2);

    // Score and rank results
    const scoredResults: SearchLegalDocsItem[] = [];

    for (const doc of results) {
      let score = 0.1;

      // Exact number match = highest score
      if (
        normalizedCandidateNumber &&
        doc.normalized_document_number === normalizedCandidateNumber
      ) {
        score += 0.8;
      }

      // Title exact phrase match
      if (doc.title.toLowerCase().includes(query.toLowerCase())) {
        score += 0.4;
      }

      // Precedence boost for normative documents
      if (doc.document_nature === "normative_legal_document") {
        score += 0.15;
      } else if (doc.document_nature === "official_guidance") {
        score += 0.05;
      }

      // Fetch matching provision snippets
      const matchingProvisions = await this.db
        .select({
          article: legalProvisions.article,
          heading: legalProvisions.heading,
          content: legalProvisions.content,
        })
        .from(legalProvisions)
        .where(
          and(
            eq(legalProvisions.document_id, doc.id),
            ilike(legalProvisions.content, `%${query}%`)
          )
        )
        .limit(2);

      const snippets = matchingProvisions.map(
        (p) =>
          `[${p.article ?? "Điều"}${p.heading ? ` - ${p.heading}` : ""}] ${p.content.slice(0, 200)}...`
      );

      scoredResults.push({
        document_id: doc.id,
        canonical_id: doc.canonical_id,
        document_number: doc.document_number,
        title: doc.title,
        issuer: doc.issuer_name,
        document_type: doc.document_type as DocumentType,
        document_nature: doc.document_nature as DocumentNature,
        issued_date: doc.issued_date,
        publication_date: doc.publication_date,
        default_effective_from: doc.default_effective_from,
        default_effective_to: doc.default_effective_to,
        verification_status: doc.verification_status as VerificationStatus,
        official_source_summary: doc.source_count > 0 ? `${doc.source_count} official source(s)` : undefined,
        matching_snippets: snippets,
        score,
      });
    }
    // Sort descending by score
    scoredResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    logger.debug(
      { query, resultsCount: scoredResults.length },
      "Legal search completed"
    );

    return scoredResults.slice(0, limit);
  }
}
