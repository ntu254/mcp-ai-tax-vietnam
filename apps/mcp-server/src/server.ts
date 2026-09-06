import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  GetEffectiveTaxRulesInputSchema,
  GetLegalDocumentInputSchema,
  LatestTaxUpdatesInputSchema,
  LegalDomainError,
  McpErrorPayload,
  SearchLegalDocsInputSchema,
} from "@vietnam-tax/common";
import { DatabaseInstance } from "@vietnam-tax/db";
import { LegalQueryService } from "@vietnam-tax/legal-query";
import { logger } from "@vietnam-tax/observability";

export const TOOLS_DEFINITION: Tool[] = [
  {
    name: "latest_tax_updates",
    description:
      "Retrieve recent legal events and status changes in Vietnamese tax and legal corpus (published, issued, became_effective, amended, repealed) filtered by topic and time window.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Tax topic filter (vat, cit, pit, invoice, household_business, tax_administration, etc.)",
        },
        days: {
          type: "number",
          description: "Number of days in the past to look for events (1 to 365, default 30)",
          default: 30,
        },
        event_types: {
          type: "array",
          items: { type: "string" },
          description: "Filter by legal event types (published, became_effective, amended, repealed, etc.)",
        },
        document_natures: {
          type: "array",
          items: { type: "string" },
          description: "Filter by nature (normative_legal_document, official_guidance, etc.)",
        },
        limit: {
          type: "number",
          description: "Max items to return (default 20)",
          default: 20,
        },
      },
    },
  },
  {
    name: "search_legal_docs",
    description:
      "Search Vietnamese legal documents by keywords, document number, issuer, dates, or topics. Supports exact document number lookup and full-text search.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Search keywords or exact document number (e.g. '123/2020/NĐ-CP' or 'thuế hộ kinh doanh')",
        },
        document_number: {
          type: "string",
          description: "Optional exact document number filter",
        },
        issuer: {
          type: "string",
          description: "Issuing authority (e.g. 'Bộ Tài chính', 'Chính phủ')",
        },
        document_type: {
          type: "string",
          description: "law, decree, circular, decision, official_letter, etc.",
        },
        document_nature: {
          type: "string",
          description: "normative_legal_document, official_guidance, etc.",
        },
        issued_from: { type: "string", description: "YYYY-MM-DD" },
        issued_to: { type: "string", description: "YYYY-MM-DD" },
        topics: {
          type: "array",
          items: { type: "string" },
          description: "List of tax topics",
        },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "get_legal_document",
    description:
      "Retrieve full canonical details of a Vietnamese legal document by UUID or canonical ID (e.g. 'VN:ND:2020:123-ND-CP'), including provisions, official source snapshots, and relationships.",
    inputSchema: {
      type: "object",
      required: ["document_id"],
      properties: {
        document_id: {
          type: "string",
          description: "Document UUID or canonical_id",
        },
        include_provisions: {
          type: "boolean",
          description: "Include parsed Điều/Khoản/Điểm provisions (default true)",
          default: true,
        },
        include_relationships: {
          type: "boolean",
          description: "Include legal relationships (amends, replaces, repeals, guides) (default true)",
          default: true,
        },
        include_evidence: {
          type: "boolean",
          description: "Include snapshot-level evidence provenance (default true)",
          default: true,
        },
      },
    },
  },
  {
    name: "get_effective_tax_rules",
    description:
      "Core legal retrieval tool: Retrieve normative tax rules (VBQPPL) and official guidance applicable at a specific date (defaults to current date in Asia/Ho_Chi_Minh). Resolves temporal status, filters out drafts and repealed rules, separates guidance from normative law, and attaches snapshot evidence.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Tax topic or question (e.g. 'thuế hộ kinh doanh', 'khấu trừ thuế GTGT đầu vào')",
        },
        effective_at: {
          type: "string",
          description: "Date for which legal status is evaluated (YYYY-MM-DD, defaults to current Vietnam date)",
        },
        topics: {
          type: "array",
          items: { type: "string" },
          description: "List of tax topics (vat, cit, pit, invoice, household_business, etc.)",
        },
        include_official_guidance: {
          type: "boolean",
          description: "Whether to include official guidance (Công văn) alongside normative rules (default true)",
          default: true,
        },
        limit: {
          type: "number",
          description: "Max rules to retrieve (default 10)",
          default: 10,
        },
      },
    },
  },
];

export function createMcpServer(db: DatabaseInstance): Server {
  const queryService = new LegalQueryService(db);

  const server = new Server(
    {
      name: "vietnam-tax-legal-mcp",
      version: "1.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS_DEFINITION };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    logger.info({ tool: name }, "MCP tool call received");

    try {
      switch (name) {
        case "latest_tax_updates": {
          const parsed = LatestTaxUpdatesInputSchema.parse(rawArgs ?? {});
          const result = await queryService.getLatestTaxUpdates(parsed);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "search_legal_docs": {
          const parsed = SearchLegalDocsInputSchema.parse(rawArgs ?? {});
          const result = await queryService.searchLegalDocs(parsed);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_legal_document": {
          const parsed = GetLegalDocumentInputSchema.parse(rawArgs ?? {});
          const result = await queryService.getLegalDocument(parsed);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_effective_tax_rules": {
          const parsed = GetEffectiveTaxRulesInputSchema.parse(rawArgs ?? {});
          const result = await queryService.getEffectiveTaxRules(parsed);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown MCP tool: ${name}`);
      }
    } catch (err: unknown) {
      logger.error({ tool: name, err }, "Error executing MCP tool");

      let payload: McpErrorPayload;

      if (err instanceof LegalDomainError) {
        payload = err.toMcpPayload();
      } else {
        const message = err instanceof Error ? err.message : String(err);
        payload = {
          code: "INSUFFICIENT_EVIDENCE",
          message,
          retryable: false,
          evidence: [],
        };
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: payload }, null, 2),
          },
        ],
      };
    }
  });

  return server;
}
