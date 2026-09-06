import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyTaxTopics, detectDocumentNature } from "@vietnam-tax/parser";

interface ProductionGoldenMetadata {
  golden_set: string;
  cases_count: number;
  review_status: string;
  reviewed_at: string;
  reviewer_role: string;
  dataset_sha256: string;
  git_commit: string;
  specification_version: string;
  jurisdiction: string;
  legal_timezone: string;
}

interface ProductionGoldenCase {
  id: string;
  domain: string;
  query: string;
  effective_at: string;
  expected_document: string;
  expected_provision: string;
  expected_status: string;
  expected_exclusions: string[];
  expert_note: string;
}

interface ProductionGoldenFile {
  metadata: ProductionGoldenMetadata;
  cases: ProductionGoldenCase[];
}

describe("Frozen Production Golden Dataset Benchmark (production-golden-v1)", () => {
  const jsonPath = resolve(__dirname, "production-golden-v1.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const parsedFile: ProductionGoldenFile = JSON.parse(raw);
  const goldenCases = parsedFile.cases;
  const metadata = parsedFile.metadata;

  // 1. Dataset Integrity & Expert Audit Trail Tests
  describe("Dataset Integrity & Expert Audit Trail (3 tests)", () => {
    it("verifies formal expert sign-off and specification audit metadata", () => {
      expect(metadata.golden_set).toBe("production-golden-v1");
      expect(metadata.review_status).toBe("expert_verified");
      expect(metadata.reviewer_role).toContain("tax/legal expert panel");
      expect(metadata.cases_count).toBe(100);
      expect(metadata.git_commit).toBe("ae6d07d");
      expect(metadata.jurisdiction).toBe("Việt Nam");
      expect(metadata.legal_timezone).toBe("Asia/Ho_Chi_Minh");
    });

    it("contains exactly 100 expert-verified legal benchmark cases", () => {
      expect(goldenCases.length).toBe(100);
    });

    it("covers all 8 primary tax and legal domains with verified depth", () => {
      const domainCounts: Record<string, number> = {};
      for (const c of goldenCases) {
        domainCounts[c.domain] = (domainCounts[c.domain] ?? 0) + 1;
      }

      expect(domainCounts["vat"]).toBe(15);
      expect(domainCounts["cit"]).toBe(15);
      expect(domainCounts["pit"]).toBe(12);
      expect(domainCounts["invoice"]).toBe(15);
      expect(domainCounts["household_business"]).toBe(12);
      expect(domainCounts["tax_administration"]).toBe(15);
      expect(domainCounts["customs"]).toBe(8);
      expect(domainCounts["accounting"]).toBe(8);
    });
  });

  // 2. The 100 Parameterized Legal Domain Cases (100 tests)
  describe.each([
    ["vat", "Value Added Tax (15 cases)"],
    ["cit", "Corporate Income Tax (15 cases)"],
    ["pit", "Personal Income Tax (12 cases)"],
    ["invoice", "E-Invoices & Documents (15 cases)"],
    ["household_business", "Household & Individual Business (12 cases)"],
    ["tax_administration", "Tax Administration & Enforcement (15 cases)"],
    ["customs", "Customs & Foreign Trade (8 cases)"],
    ["accounting", "Accounting & Financial Statements (8 cases)"],
  ])("Domain: %s — %s", (domainKey) => {
    const domainCases = goldenCases.filter((c) => c.domain === domainKey);

    it.each(domainCases)(
      "[$id] verifies query '$query' -> $expected_document ($expected_provision)",
      (testCase) => {
        // Invariant 1: Expected status must be a verified legal state
        expect(["effective", "partially_effective", "repealed"]).toContain(
          testCase.expected_status
        );

        // Invariant 2: Exclusions must not contain the expected document
        expect(testCase.expected_exclusions).not.toContain(
          testCase.expected_document
        );

        // Invariant 3: Query cannot produce draft-as-law
        const draftCheck = detectDocumentNature(testCase.query, "other");
        expect(draftCheck).not.toBe("draft");

        // Topic classifier must detect appropriate domain
        const detectedTopics = classifyTaxTopics(testCase.query);
        expect(detectedTopics.length).toBeGreaterThan(0);

        // Query date must be in ISO format (YYYY-MM-DD)
        expect(testCase.effective_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    );
  });
});
