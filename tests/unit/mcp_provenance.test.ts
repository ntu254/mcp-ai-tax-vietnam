import { describe, expect, it } from "vitest";
import {
  VerificationProvenanceSchema,
  GetLegalDocumentOutputSchema,
  SearchLegalDocsOutputSchema,
  GetEffectiveTaxRulesOutputSchema,
  LatestTaxUpdatesOutputSchema,
} from "@vietnam-tax/common";

describe("MCP Tool Responses — Verification & Provenance Contract (Step 2)", () => {
  it("validates VerificationProvenanceSchema with multi-source metadata", () => {
    const sampleProvenance = {
      status: "cross_verified",
      sources: [
        {
          source: "congbao",
          transport: "https",
          format: "html",
          strategy: "rss",
          snapshot_id: "72860430-a86e-40cc-87bf-7d8d69986e7c",
          verification_status: "cross_verified",
          retrieved_at: "2026-09-06T12:00:00Z",
        },
        {
          source: "vbpl",
          transport: "https",
          format: "html",
          strategy: "html_fallback",
          snapshot_id: "75450b7c-3d6f-4afa-902e-2f3e0031b1a3",
          verification_status: "cross_verified",
          retrieved_at: "2026-09-06T12:00:00Z",
        },
      ],
    };

    const parsed = VerificationProvenanceSchema.safeParse(sampleProvenance);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("cross_verified");
      expect(parsed.data.sources).toHaveLength(2);
      expect(parsed.data.sources[0].source).toBe("congbao");
      expect(parsed.data.sources[0].transport).toBe("https");
      expect(parsed.data.sources[0].strategy).toBe("rss");
      expect(parsed.data.sources[1].source).toBe("vbpl");
      expect(parsed.data.sources[1].strategy).toBe("html_fallback");
      expect(parsed.data.sources[1].format).toBe("html");
    }
  });

  it("validates get_legal_document output schema with provenance metadata", () => {
    const sampleOutput = {
      document_id: "926554dc-502d-4355-8025-b44c66711586",
      canonical_id: "VN:ND:2026:329-2026-ND-CP",
      document_number: "329/2026/NĐ-CP",
      title: "Nghị định quy định về lực lượng bảo vệ an ninh trật tự",
      summary: null,
      issuer: "Chính phủ",
      document_type: "decree",
      document_nature: "normative_legal_document",
      issued_date: "2026-08-20",
      publication_date: "2026-08-20",
      default_effective_from: "2026-08-20",
      default_effective_to: null,
      verification_status: "cross_verified",
      verification: {
        status: "cross_verified",
        sources: [
          {
            source: "congbao",
            channel: "html",
            transport: "https",
            snapshot_id: "72860430-a86e-40cc-87bf-7d8d69986e7c",
            verification_status: "cross_verified",
          },
          {
            source: "vbpl",
            channel: "html",
            transport: "html_fallback",
            snapshot_id: "75450b7c-3d6f-4afa-902e-2f3e0031b1a3",
            verification_status: "cross_verified",
          },
        ],
      },
      sources: [
        {
          id: "72860430-a86e-40cc-87bf-7d8d69986e7c",
          source_name: "congbao",
          source_type: "rss",
          source_authority: "tier_a",
          source_url: "https://congbao.chinhphu.vn/van-ban/329-2026-ND-CP",
          is_official: true,
          snapshots_count: 1,
          latest_snapshot_id: "75450b7c-3d6f-4afa-902e-2f3e0031b1a3",
          channel: "html",
          transport: "https",
        },
      ],
      conflicts: [],
      dataset_version: "2026.09.06-v1.1-prod",
      retrieved_at: "2026-09-06T12:30:00Z",
    };

    const parsed = GetLegalDocumentOutputSchema.safeParse(sampleOutput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.verification?.status).toBe("cross_verified");
      expect(parsed.data.verification?.sources).toHaveLength(2);
    }
  });

  it("validates search_legal_docs item schema with provenance metadata", () => {
    const sampleOutput = {
      query: "thuế",
      total: 1,
      dataset_version: "2026.09.06-v1.1-prod",
      results: [
        {
          document_id: "926554dc-502d-4355-8025-b44c66711586",
          canonical_id: "VN:ND:2026:329-2026-ND-CP",
          document_number: "329/2026/NĐ-CP",
          title: "Nghị định quy định về an ninh",
          issuer: "Chính phủ",
          document_type: "decree",
          document_nature: "normative_legal_document",
          issued_date: "2026-08-20",
          publication_date: "2026-08-20",
          default_effective_from: "2026-08-20",
          default_effective_to: null,
          verification_status: "cross_verified",
          verification: {
            status: "cross_verified",
            sources: [
              {
                source: "congbao",
                channel: "html",
                transport: "https",
              },
            ],
          },
          matching_snippets: [],
        },
      ],
    };

    const parsed = SearchLegalDocsOutputSchema.safeParse(sampleOutput);
    expect(parsed.success).toBe(true);
  });

  it("validates get_effective_tax_rules output schema with provenance metadata", () => {
    const sampleOutput = {
      effective_at: "2026-09-06",
      answerable: true,
      dataset_version: "2026.09.06-v1.1-prod",
      candidates_considered: 10,
      rules_returned: 1,
      rules: [
        {
          document_id: "926554dc-502d-4355-8025-b44c66711586",
          canonical_id: "VN:ND:2026:123-2020-ND-CP",
          document_number: "123/2020/NĐ-CP",
          title: "Nghị định về hóa đơn chứng từ",
          document_type: "decree",
          document_nature: "normative_legal_document",
          issuer: "Chính phủ",
          effective_from: "2022-07-01",
          effective_to: null,
          provision: {
            id: "11111111-1111-1111-1111-111111111111",
            content: "Quy định về hóa đơn điện tử",
          },
          evidence: [
            {
              field_name: "default_effective_from",
              asserted_value: "2022-07-01",
              source_snapshot_id: "75450b7c-3d6f-4afa-902e-2f3e0031b1a3",
              evidence_type: "source_extraction",
            },
          ],
          verification: {
            status: "cross_verified",
            sources: [
              { source: "congbao", channel: "html", transport: "https" },
              { source: "vbpl", channel: "html", transport: "html_fallback" },
            ],
          },
        },
      ],
      official_guidance: [],
      verification: {
        status: "cross_verified",
        sources: [
          { source: "congbao", channel: "html", transport: "https" },
          { source: "vbpl", channel: "html", transport: "html_fallback" },
        ],
      },
      warnings: [],
      evaluated_timezone: "Asia/Ho_Chi_Minh",
    };

    const parsed = GetEffectiveTaxRulesOutputSchema.safeParse(sampleOutput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.verification?.status).toBe("cross_verified");
      expect(parsed.data.verification?.sources).toHaveLength(2);
    }
  });

  it("validates latest_tax_updates output schema with provenance metadata across all items", () => {
    const sampleOutput = {
      as_of: "2026-09-06",
      dataset_version: "2026.09.06-v1.1-prod",
      items: [
        {
          event_id: "11111111-1111-1111-1111-111111111111",
          event_type: "became_effective",
          event_date: "2026-08-20",
          document_id: "926554dc-502d-4355-8025-b44c66711586",
          canonical_id: "VN:ND:2026:329-2026-ND-CP",
          document_number: "329/2026/NĐ-CP",
          title: "Nghị định quy định về an ninh trật tự",
          document_type: "decree",
          document_nature: "normative_legal_document",
          issuer: "Chính phủ",
          effective_from: "2026-08-20",
          evidence_snapshot_id: "75450b7c-3d6f-4afa-902e-2f3e0031b1a3",
          source_name: "congbao",
          verification: {
            status: "single_source_verified",
            sources: [
              {
                source: "congbao",
                transport: "https",
                format: "html",
                strategy: "rss",
                snapshot_id: "75450b7c-3d6f-4afa-902e-2f3e0031b1a3",
                verification_status: "single_source_verified",
              },
            ],
          },
        },
      ],
      verification: {
        status: "single_source_verified",
        sources: [
          {
            source: "congbao",
            transport: "https",
            format: "html",
            strategy: "rss",
          },
        ],
      },
    };

    const parsed = LatestTaxUpdatesOutputSchema.safeParse(sampleOutput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.verification?.status).toBe("single_source_verified");
      expect(parsed.data.items[0].verification?.sources[0].strategy).toBe("rss");
    }
  });
});
