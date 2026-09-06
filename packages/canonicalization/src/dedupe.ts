import { eq } from "drizzle-orm";
import { DatabaseInstance, legalDocuments } from "@vietnam-tax/db";
import { normalizeDocumentNumber } from "./canonical-id.js";
import { logger } from "@vietnam-tax/observability";

export function generateTitleFingerprint(title: string): string {
  return title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DocumentCandidate {
  documentNumber?: string | null;
  title: string;
  issuerName?: string | null;
  issuedDate?: string | null;
  normalizedTextHash?: string | null;
}

export interface DedupeMatchResult {
  isDuplicate: boolean;
  matchedDocumentId?: string;
  confidence: number;
  matchSignals: string[];
}

export class DeduplicationEngine {
  constructor(private readonly db: DatabaseInstance) {}

  public async findExistingDocument(
    candidate: DocumentCandidate
  ): Promise<DedupeMatchResult> {
    const signals: string[] = [];

    // Signal 1: Normalized Document Number
    if (candidate.documentNumber) {
      const normalizedNumber = normalizeDocumentNumber(candidate.documentNumber);
      const docsByNumber = await this.db
        .select()
        .from(legalDocuments)
        .where(eq(legalDocuments.normalized_document_number, normalizedNumber))
        .limit(5);

      for (const existing of docsByNumber) {
        let score = 0.5; // Base score for identical document number
        signals.push(`document_number:${normalizedNumber}`);

        if (
          candidate.issuedDate &&
          existing.issued_date === candidate.issuedDate
        ) {
          score += 0.3;
          signals.push("issued_date_match");
        }

        if (
          candidate.normalizedTextHash &&
          existing.normalized_text_hash === candidate.normalizedTextHash
        ) {
          score += 0.2;
          signals.push("content_hash_match");
        }

        const candidateFp = generateTitleFingerprint(candidate.title);
        const existingFp = generateTitleFingerprint(existing.title);
        if (candidateFp === existingFp) {
          score += 0.2;
          signals.push("title_fingerprint_match");
        }

        if (score >= 0.7) {
          logger.info(
            {
              matchedId: existing.id,
              score,
              signals,
            },
            "Duplicate document identified by signals"
          );
          return {
            isDuplicate: true,
            matchedDocumentId: existing.id,
            confidence: Math.min(score, 1.0),
            matchSignals: signals,
          };
        }
      }
    }

    // Signal 2: Content hash match
    if (candidate.normalizedTextHash) {
      const docsByHash = await this.db
        .select()
        .from(legalDocuments)
        .where(eq(legalDocuments.normalized_text_hash, candidate.normalizedTextHash))
        .limit(1);

      if (docsByHash.length > 0) {
        return {
          isDuplicate: true,
          matchedDocumentId: docsByHash[0].id,
          confidence: 0.95,
          matchSignals: ["exact_normalized_text_hash_match"],
        };
      }
    }

    return {
      isDuplicate: false,
      confidence: 0,
      matchSignals: [],
    };
  }
}
