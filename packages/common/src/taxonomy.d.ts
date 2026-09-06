import { z } from "zod";
/**
 * 6.2 Legal / Instrument Nature
 * Controlled taxonomy
 */
export declare const DOCUMENT_NATURES: readonly ["normative_legal_document", "consolidated_document", "implementing_document", "official_guidance", "administrative_document", "correction", "draft", "proposal", "consultation", "other"];
export type DocumentNature = (typeof DOCUMENT_NATURES)[number];
export declare const DocumentNatureSchema: z.ZodEnum<["normative_legal_document", "consolidated_document", "implementing_document", "official_guidance", "administrative_document", "correction", "draft", "proposal", "consultation", "other"]>;
/**
 * 7. Document Type Taxonomy
 */
export declare const DOCUMENT_TYPES: readonly ["constitution", "law", "resolution", "ordinance", "decree", "decision", "circular", "joint_circular", "official_letter", "dispatch", "guidance", "announcement", "other"];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export declare const DocumentTypeSchema: z.ZodEnum<["constitution", "law", "resolution", "ordinance", "decree", "decision", "circular", "joint_circular", "official_letter", "dispatch", "guidance", "announcement", "other"]>;
/**
 * 6.1 Source Authority Tiers
 */
export declare const SOURCE_AUTHORITIES: readonly ["tier_a", "tier_b", "tier_c", "news", "unknown"];
export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];
export declare const SourceAuthoritySchema: z.ZodEnum<["tier_a", "tier_b", "tier_c", "news", "unknown"]>;
/**
 * 8. Evaluated Legal Status at query date
 */
export declare const EVALUATED_LEGAL_STATUSES: readonly ["effective", "partially_effective", "not_yet_effective", "suspended", "partially_suspended", "repealed", "partially_repealed", "replaced", "expired", "unknown"];
export type EvaluatedLegalStatus = (typeof EVALUATED_LEGAL_STATUSES)[number];
export declare const EvaluatedLegalStatusSchema: z.ZodEnum<["effective", "partially_effective", "not_yet_effective", "suspended", "partially_suspended", "repealed", "partially_repealed", "replaced", "expired", "unknown"]>;
/**
 * 9. Verification Status
 */
export declare const VERIFICATION_STATUSES: readonly ["cross_verified", "single_source_verified", "conflicting", "unverified", "rejected"];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export declare const VerificationStatusSchema: z.ZodEnum<["cross_verified", "single_source_verified", "conflicting", "unverified", "rejected"]>;
/**
 * 18. Document Relationships
 */
export declare const RELATIONSHIP_TYPES: readonly ["amends", "supplements", "replaces", "repeals", "partially_repeals", "suspends", "corrects", "guides", "implements", "references", "based_on"];
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export declare const RelationshipTypeSchema: z.ZodEnum<["amends", "supplements", "replaces", "repeals", "partially_repeals", "suspends", "corrects", "guides", "implements", "references", "based_on"]>;
/**
 * 20. Legal Events
 */
export declare const LEGAL_EVENT_TYPES: readonly ["published", "issued", "became_effective", "amended", "supplemented", "repealed", "partially_repealed", "suspended", "corrected"];
export type LegalEventType = (typeof LEGAL_EVENT_TYPES)[number];
export declare const LegalEventTypeSchema: z.ZodEnum<["published", "issued", "became_effective", "amended", "supplemented", "repealed", "partially_repealed", "suspended", "corrected"]>;
/**
 * 21. Topic Classification
 */
export declare const TAX_TOPICS: readonly ["vat", "cit", "pit", "fct", "invoice", "tax_administration", "special_consumption_tax", "import_export_duty", "land_tax", "natural_resources_tax", "environmental_protection_tax", "license_fee", "household_business", "transfer_pricing", "penalties_and_enforcement", "customs", "accounting", "other"];
export type TaxTopic = (typeof TAX_TOPICS)[number];
export declare const TaxTopicSchema: z.ZodEnum<["vat", "cit", "pit", "fct", "invoice", "tax_administration", "special_consumption_tax", "import_export_duty", "land_tax", "natural_resources_tax", "environmental_protection_tax", "license_fee", "household_business", "transfer_pricing", "penalties_and_enforcement", "customs", "accounting", "other"]>;
/**
 * 13. Canonical Status
 */
export declare const CANONICAL_STATUSES: readonly ["resolved", "unresolved"];
export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];
export declare const CanonicalStatusSchema: z.ZodEnum<["resolved", "unresolved"]>;
//# sourceMappingURL=taxonomy.d.ts.map