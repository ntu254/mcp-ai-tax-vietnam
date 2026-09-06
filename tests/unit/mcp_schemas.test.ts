import { describe, expect, it } from "vitest";
import {
  GetEffectiveTaxRulesInputSchema,
  GetLegalDocumentInputSchema,
  LatestTaxUpdatesInputSchema,
  SearchLegalDocsInputSchema,
} from "@vietnam-tax/common";

describe("MCP Tool Schemas Validation", () => {
  it("validates latest_tax_updates input and applies defaults", () => {
    const emptyInput = {};
    const parsed = LatestTaxUpdatesInputSchema.parse(emptyInput);

    expect(parsed.days).toBe(30);
    expect(parsed.limit).toBe(20);

    const fullInput = {
      topic: "vat",
      days: 60,
      event_types: ["published", "amended"],
      limit: 10,
    };
    const parsedFull = LatestTaxUpdatesInputSchema.parse(fullInput);
    expect(parsedFull.topic).toBe("vat");
    expect(parsedFull.days).toBe(60);
  });

  it("validates search_legal_docs input", () => {
    expect(() => SearchLegalDocsInputSchema.parse({})).toThrow();

    const valid = SearchLegalDocsInputSchema.parse({
      query: "thuế hộ kinh doanh",
      topics: ["household_business"],
    });
    expect(valid.query).toBe("thuế hộ kinh doanh");
    expect(valid.limit).toBe(20);
  });

  it("validates get_legal_document input with defaults", () => {
    expect(() => GetLegalDocumentInputSchema.parse({})).toThrow();

    const valid = GetLegalDocumentInputSchema.parse({
      document_id: "VN:ND:2020:123-ND-CP",
    });
    expect(valid.include_provisions).toBe(true);
    expect(valid.include_relationships).toBe(true);
    expect(valid.include_evidence).toBe(true);
  });

  it("validates get_effective_tax_rules input with defaults", () => {
    expect(() => GetEffectiveTaxRulesInputSchema.parse({})).toThrow();

    const valid = GetEffectiveTaxRulesInputSchema.parse({
      query: "khấu trừ thuế GTGT",
    });
    expect(valid.include_official_guidance).toBe(true);
    expect(valid.limit).toBe(10);
  });
});
