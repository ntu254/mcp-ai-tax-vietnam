import { z } from "zod";
import {
  DocumentNatureSchema,
  DocumentTypeSchema,
  EvaluatedLegalStatusSchema,
  LegalEventTypeSchema,
  TaxTopicSchema,
  VerificationStatusSchema,
} from "./taxonomy.js";

/**
 * 66. MCP Error Codes
 */
export const MCP_ERROR_CODES = [
  "DOCUMENT_NOT_FOUND",
  "SOURCE_UNAVAILABLE",
  "LEGAL_STATUS_UNKNOWN",
  "LEGAL_STATUS_CONFLICT",
  "DATE_OUT_OF_RANGE",
  "INSUFFICIENT_EVIDENCE",
  "PARSER_FAILED",
  "VERIFICATION_PENDING",
  "DOCUMENT_IDENTITY_UNRESOLVED",
] as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];
export const McpErrorCodeSchema = z.enum(MCP_ERROR_CODES);

export const McpErrorPayloadSchema = z.object({
  code: McpErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean().default(false),
  document_id: z.string().optional(),
  evidence: z.array(z.unknown()).default([]),
});

export type McpErrorPayload = z.infer<typeof McpErrorPayloadSchema>;

/**
 * 19. Snapshot-level Evidence item
 */
export const EvidenceItemSchema = z.object({
  id: z.string().uuid().optional(),
  document_id: z.string().uuid().optional().nullable(),
  provision_id: z.string().uuid().optional().nullable(),
  relationship_id: z.string().uuid().optional().nullable(),
  field_name: z.string(),
  asserted_value: z.unknown(),
  source_snapshot_id: z.string().uuid(),
  source_name: z.string().optional(),
  source_url: z.string().optional(),
  evidence_type: z.string(),
  evidence_text: z.string().optional().nullable(),
  evidence_locator: z.record(z.unknown()).optional().nullable(),
  verification_result: z.string().optional().nullable(),
  created_at: z.string().optional(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * Provision summary in responses
 */
export const ProvisionResultSchema = z.object({
  id: z.string().uuid(),
  chapter: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  article: z.string().nullable().optional(),
  clause: z.string().nullable().optional(),
  point: z.string().nullable().optional(),
  appendix: z.string().nullable().optional(),
  heading: z.string().nullable().optional(),
  content: z.string(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  status_override: z.string().nullable().optional(),
  evaluated_status: EvaluatedLegalStatusSchema.optional(),
  evidence: z.array(EvidenceItemSchema).optional().default([]),
});

export type ProvisionResult = z.infer<typeof ProvisionResultSchema>;

/**
 * 40. Standard Legal Result Contract
 */
export const StandardLegalResultContractSchema = z.object({
  answerable: z.boolean(),
  evaluated_at: z.string(), // YYYY-MM-DD
  dataset_version: z.string(),
  document: z.object({
    id: z.string().uuid().optional(),
    canonical_id: z.string().optional().nullable(),
    document_number: z.string().nullable(),
    title: z.string(),
    issuer: z.string().nullable(),
    document_type: DocumentTypeSchema.optional(),
    document_nature: DocumentNatureSchema,
    issued_date: z.string().nullable().optional(),
    publication_date: z.string().nullable().optional(),
    default_effective_from: z.string().nullable().optional(),
    default_effective_to: z.string().nullable().optional(),
  }),
  status: EvaluatedLegalStatusSchema,
  verification: z.object({
    status: VerificationStatusSchema,
    official_source_count: z.number().int().nonnegative(),
    conflicts: z.array(z.string()).optional().default([]),
  }),
  provisions: z.array(ProvisionResultSchema).default([]),
  evidence: z.array(EvidenceItemSchema).default([]),
  warnings: z.array(z.string()).default([]),
  retrieved_at: z.string(),
});

export type StandardLegalResultContract = z.infer<
  typeof StandardLegalResultContractSchema
>;

/**
 * 35. Tool 1: latest_tax_updates
 */
export const LatestTaxUpdatesInputSchema = z.object({
  topic: TaxTopicSchema.optional(),
  days: z.number().int().min(1).max(365).default(30),
  event_types: z.array(LegalEventTypeSchema).optional(),
  document_natures: z.array(DocumentNatureSchema).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type LatestTaxUpdatesInput = z.infer<typeof LatestTaxUpdatesInputSchema>;

export const LatestTaxUpdateItemSchema = z.object({
  event_id: z.string().uuid(),
  event_type: LegalEventTypeSchema,
  event_date: z.string(),
  document_id: z.string().uuid(),
  canonical_id: z.string().nullable().optional(),
  document_number: z.string().nullable(),
  title: z.string(),
  document_type: DocumentTypeSchema,
  document_nature: DocumentNatureSchema,
  issuer: z.string().nullable(),
  effective_from: z.string().nullable().optional(),
  evidence_snapshot_id: z.string().uuid().optional().nullable(),
  source_name: z.string().optional().nullable(),
});

export type LatestTaxUpdateItem = z.infer<typeof LatestTaxUpdateItemSchema>;

export const LatestTaxUpdatesOutputSchema = z.object({
  as_of: z.string(),
  dataset_version: z.string(),
  items: z.array(LatestTaxUpdateItemSchema),
});

export type LatestTaxUpdatesOutput = z.infer<typeof LatestTaxUpdatesOutputSchema>;

/**
 * 36. Tool 2: search_legal_docs
 */
export const SearchLegalDocsInputSchema = z.object({
  query: z.string().min(1),
  document_number: z.string().nullable().optional(),
  issuer: z.string().nullable().optional(),
  document_type: DocumentTypeSchema.nullable().optional(),
  document_nature: DocumentNatureSchema.nullable().optional(),
  issued_from: z.string().nullable().optional(),
  issued_to: z.string().nullable().optional(),
  topics: z.array(TaxTopicSchema).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type SearchLegalDocsInput = z.infer<typeof SearchLegalDocsInputSchema>;

export const SearchLegalDocsItemSchema = z.object({
  document_id: z.string().uuid(),
  canonical_id: z.string().nullable().optional(),
  document_number: z.string().nullable(),
  title: z.string(),
  issuer: z.string().nullable(),
  document_type: DocumentTypeSchema,
  document_nature: DocumentNatureSchema,
  issued_date: z.string().nullable(),
  publication_date: z.string().nullable(),
  default_effective_from: z.string().nullable(),
  default_effective_to: z.string().nullable(),
  verification_status: VerificationStatusSchema,
  official_source_summary: z.string().nullable().optional(),
  matching_snippets: z.array(z.string()).default([]),
  score: z.number().optional(),
});

export type SearchLegalDocsItem = z.infer<typeof SearchLegalDocsItemSchema>;

export const SearchLegalDocsOutputSchema = z.object({
  query: z.string(),
  total: z.number().int().nonnegative(),
  dataset_version: z.string(),
  results: z.array(SearchLegalDocsItemSchema),
});

export type SearchLegalDocsOutput = z.infer<typeof SearchLegalDocsOutputSchema>;

/**
 * 37. Tool 3: get_legal_document
 */
export const GetLegalDocumentInputSchema = z.object({
  document_id: z.string().min(1), // UUID or canonical_id
  include_provisions: z.boolean().default(true),
  include_relationships: z.boolean().default(true),
  include_evidence: z.boolean().default(true),
});

export type GetLegalDocumentInput = z.infer<typeof GetLegalDocumentInputSchema>;

export const DocumentRelationshipViewSchema = z.object({
  id: z.string().uuid(),
  relationship_type: z.string(),
  target_document_id: z.string().uuid(),
  target_document_number: z.string().nullable().optional(),
  target_title: z.string().optional(),
  effective_from: z.string().nullable().optional(),
  effective_to: z.string().nullable().optional(),
  source_locator: z.record(z.unknown()).nullable().optional(),
  target_locator: z.record(z.unknown()).nullable().optional(),
  verification_status: VerificationStatusSchema,
});

export type DocumentRelationshipView = z.infer<
  typeof DocumentRelationshipViewSchema
>;

export const DocumentSourceViewSchema = z.object({
  id: z.string().uuid(),
  source_name: z.string(),
  source_type: z.string(),
  source_authority: z.string(),
  source_url: z.string(),
  pdf_url: z.string().nullable().optional(),
  docx_url: z.string().nullable().optional(),
  is_official: z.boolean(),
  snapshots_count: z.number().int().nonnegative(),
  latest_snapshot_id: z.string().uuid().nullable().optional(),
});

export type DocumentSourceView = z.infer<typeof DocumentSourceViewSchema>;

export const GetLegalDocumentOutputSchema = z.object({
  document_id: z.string().uuid(),
  canonical_id: z.string().nullable(),
  document_number: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  issuer: z.string().nullable(),
  document_type: DocumentTypeSchema,
  document_nature: DocumentNatureSchema,
  issued_date: z.string().nullable(),
  publication_date: z.string().nullable(),
  default_effective_from: z.string().nullable(),
  default_effective_to: z.string().nullable(),
  verification_status: VerificationStatusSchema,
  current_status_cached: EvaluatedLegalStatusSchema.nullable().optional(),
  current_status_as_of: z.string().nullable().optional(),
  sources: z.array(DocumentSourceViewSchema).default([]),
  provisions: z.array(ProvisionResultSchema).optional(),
  relationships: z.array(DocumentRelationshipViewSchema).optional(),
  evidence: z.array(EvidenceItemSchema).optional(),
  conflicts: z.array(z.string()).default([]),
  dataset_version: z.string(),
  retrieved_at: z.string(),
});

export type GetLegalDocumentOutput = z.infer<typeof GetLegalDocumentOutputSchema>;

/**
 * 38. Tool 4: get_effective_tax_rules
 */
export const GetEffectiveTaxRulesInputSchema = z.object({
  query: z.string().min(1),
  effective_at: z.string().optional(), // YYYY-MM-DD, defaults to current date Asia/Ho_Chi_Minh
  topics: z.array(TaxTopicSchema).optional(),
  include_official_guidance: z.boolean().default(true),
  limit: z.number().int().min(1).max(50).default(10),
});

export type GetEffectiveTaxRulesInput = z.infer<
  typeof GetEffectiveTaxRulesInputSchema
>;

export const EffectiveRuleItemSchema = z.object({
  document_id: z.string().uuid(),
  canonical_id: z.string().nullable().optional(),
  document_number: z.string().nullable(),
  title: z.string(),
  document_type: DocumentTypeSchema,
  document_nature: DocumentNatureSchema,
  issuer: z.string().nullable(),
  effective_from: z.string().nullable(),
  effective_to: z.string().nullable(),
  provision: ProvisionResultSchema,
  evidence: z.array(EvidenceItemSchema),
  relevance_snippet: z.string().optional(),
});

export type EffectiveRuleItem = z.infer<typeof EffectiveRuleItemSchema>;

export const OfficialGuidanceItemSchema = z.object({
  document_id: z.string().uuid(),
  document_number: z.string().nullable(),
  title: z.string(),
  document_nature: z.literal("official_guidance"),
  issuer: z.string().nullable(),
  issued_date: z.string().nullable(),
  guidance_summary: z.string(),
  provision: ProvisionResultSchema.optional(),
  evidence: z.array(EvidenceItemSchema),
  note: z.string().default(
    "Official guidance reflects administrative execution interpretation and is not a normative legal document (VBQPPL)."
  ),
});

export type OfficialGuidanceItem = z.infer<typeof OfficialGuidanceItemSchema>;

export const GetEffectiveTaxRulesOutputSchema = z.object({
  effective_at: z.string(),
  answerable: z.boolean(),
  dataset_version: z.string(),
  candidates_considered: z.number().int().nonnegative().optional(),
  rules_returned: z.number().int().nonnegative().optional(),
  rules: z.array(EffectiveRuleItemSchema),
  official_guidance: z.array(OfficialGuidanceItemSchema).default([]),
  warnings: z.array(z.string()).default([]),
  evaluated_timezone: z.string().default("Asia/Ho_Chi_Minh"),
});
export type GetEffectiveTaxRulesOutput = z.infer<
  typeof GetEffectiveTaxRulesOutputSchema
>;
