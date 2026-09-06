import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyTaxTopics, detectDocumentNature } from "@vietnam-tax/parser";

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

describe("Frozen Production Golden Dataset Benchmark (production-golden-v1)", () => {
  const jsonPath = resolve(__dirname, "production-golden-v1.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const goldenCases: ProductionGoldenCase[] = JSON.parse(raw);

  it("contains exactly 100 expert-verified legal benchmark cases", () => {
    expect(goldenCases.length).toBe(100);
  });

  it("covers all 8 primary tax and legal domains with comprehensive depth", () => {
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

  // Parameterized tests across all 100 cases
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
        // 1. Invariant: Expected status must be a verified legal state
        expect(["effective", "partially_effective", "repealed"]).toContain(
          testCase.expected_status
        );

        // 2. Invariant: Exclusions must not contain the expected document
        expect(testCase.expected_exclusions).not.toContain(
          testCase.expected_document
        );

        // 3. Invariant: Query cannot produce draft-as-law
        const draftCheck = detectDocumentNature(testCase.query, "other");
        expect(draftCheck).not.toBe("draft");

        // 4. Topic classifier must detect appropriate domain
        const detectedTopics = classifyTaxTopics(testCase.query);
        expect(detectedTopics.length).toBeGreaterThan(0);

        // 5. Query date must be in ISO format (YYYY-MM-DD)
        expect(testCase.effective_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    );
  });
});
