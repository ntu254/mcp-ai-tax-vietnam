import { RelationshipType } from "@vietnam-tax/common";
import { normalizeDocumentNumber } from "@vietnam-tax/canonicalization";

export interface ParsedRelationship {
  relationshipType: RelationshipType;
  targetDocumentNumber: string;
  sourceLocator?: Record<string, unknown>;
  targetLocator?: Record<string, unknown>;
  rawSnippet: string;
}

export function extractDocumentRelationships(text: string): ParsedRelationship[] {
  const relationships: ParsedRelationship[] = [];
  const lines = text.split(/\r?\n/);

  // Regex patterns for Vietnamese legal relationship assertions
  // e.g.:
  // "Bãi bỏ Thông tư số 78/2021/TT-BTC"
  // "Bãi bỏ Khoản 2 Điều 10 Thông tư số 111/2013/TT-BTC"
  // "Thay thế Nghị định số 51/2010/NĐ-CP"
  // "Sửa đổi, bổ sung một số điều của Nghị định số 123/2020/NĐ-CP"
  // "Hướng dẫn thi hành Nghị định số 123/2020/NĐ-CP"

  const docNumPattern =
    /(?:số\s+)?([0-9]+(?:\/[0-9]+)?\/[A-Za-z0-9Đđ_.-]+)/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Partial repeal: "Bãi bỏ Khoản... Điều... của..."
    const partialRepealMatch = trimmed.match(
      /bãi\s+bỏ\s+(?:khoản\s+([0-9]+)\s+)?(?:điều\s+([0-9]+)\s+)?(?:của\s+)?(?:thông\s+tư|nghị\s+định|luật(?:\s+[^\d\n]+)?|quyết\s+định)\s+(?:số\s+)?([0-9]+(?:\/[0-9]+)?\/[A-Za-z0-9Đđ_.-]+)/i
    );
    if (partialRepealMatch && (partialRepealMatch[1] || partialRepealMatch[2])) {
      const clause = partialRepealMatch[1];
      const article = partialRepealMatch[2];
      const targetDocNum = partialRepealMatch[3];

      relationships.push({
        relationshipType: "partially_repeals",
        targetDocumentNumber: normalizeDocumentNumber(targetDocNum),
        targetLocator: {
          article: article ? `Điều ${article}` : undefined,
          clause: clause ? `Khoản ${clause}` : undefined,
        },
        rawSnippet: trimmed,
      });
      continue;
    }

    // Full repeal: "bãi bỏ Nghị định số..."
    const repealMatch = trimmed.match(
      /bãi\s+bỏ\s+(?:thông\s+tư|nghị\s+định|luật|quyết\s+định)\s+(?:số\s+)?([0-9]+(?:\/[0-9]+)?\/[A-Za-z0-9Đđ_.-]+)/i
    );
    if (repealMatch) {
      relationships.push({
        relationshipType: "repeals",
        targetDocumentNumber: normalizeDocumentNumber(repealMatch[1]),
        rawSnippet: trimmed,
      });
      continue;
    }

    // Replace: "thay thế Nghị định số..."
    const replaceMatch = trimmed.match(
      /thay\s+thế\s+(?:thông\s+tư|nghị\s+định|luật|quyết\s+định)\s+(?:số\s+)?([0-9]+(?:\/[0-9]+)?\/[A-Za-z0-9Đđ_.-]+)/i
    );
    if (replaceMatch) {
      relationships.push({
        relationshipType: "replaces",
        targetDocumentNumber: normalizeDocumentNumber(replaceMatch[1]),
        rawSnippet: trimmed,
      });
      continue;
    }

    // Amend / Supplement: "sửa đổi, bổ sung một số điều của..."
    const amendMatch = trimmed.match(
      /(?:sửa\s+đổi|bổ\s+sung|sửa\s+đổi,\s*bổ\s+sung)\s+.*?(?:thông\s+tư|nghị\s+định|luật|quyết\s+định)\s+(?:số\s+)?([0-9]+(?:\/[0-9]+)?\/[A-Za-z0-9Đđ_.-]+)/i
    );
    if (amendMatch) {
      relationships.push({
        relationshipType: "amends",
        targetDocumentNumber: normalizeDocumentNumber(amendMatch[1]),
        rawSnippet: trimmed,
      });
      continue;
    }

    // Guides: "hướng dẫn thi hành Nghị định số..."
    const guideMatch = trimmed.match(
      /hướng\s+dẫn\s+(?:thi\s+hành\s+)?(?:thông\s+tư|nghị\s+định|luật)\s+(?:số\s+)?([0-9]+(?:\/[0-9]+)?\/[A-Za-z0-9Đđ_.-]+)/i
    );
    if (guideMatch) {
      relationships.push({
        relationshipType: "guides",
        targetDocumentNumber: normalizeDocumentNumber(guideMatch[1]),
        rawSnippet: trimmed,
      });
      continue;
    }
  }

  return relationships;
}
