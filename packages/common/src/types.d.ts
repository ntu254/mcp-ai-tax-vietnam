import { CanonicalStatus, DocumentNature, DocumentType, EvaluatedLegalStatus, LegalEventType, RelationshipType, SourceAuthority, TaxTopic, VerificationStatus } from "./taxonomy.js";
export interface Issuer {
    id: string;
    name: string;
    normalized_name: string;
    issuer_type?: string | null;
    parent_issuer_id?: string | null;
    created_at: Date;
    updated_at: Date;
}
export interface LegalDocument {
    id: string;
    canonical_id: string | null;
    canonical_status: CanonicalStatus;
    document_number: string | null;
    normalized_document_number: string | null;
    document_type: DocumentType;
    document_nature: DocumentNature;
    title: string;
    summary?: string | null;
    issuer_id?: string | null;
    issuer_name?: string | null;
    issued_date?: string | null;
    publication_date?: string | null;
    default_effective_from?: string | null;
    default_effective_to?: string | null;
    verification_status: VerificationStatus;
    current_status_cached?: EvaluatedLegalStatus | null;
    current_status_as_of?: string | null;
    language: string;
    raw_text?: string | null;
    normalized_text?: string | null;
    normalized_text_hash?: string | null;
    source_count: number;
    created_at: Date;
    updated_at: Date;
    last_verified_at?: Date | null;
}
export interface DocumentSource {
    id: string;
    document_id: string;
    source_name: string;
    source_type: string;
    source_authority: SourceAuthority;
    source_url: string;
    detail_url?: string | null;
    pdf_url?: string | null;
    docx_url?: string | null;
    source_document_id?: string | null;
    current_snapshot_id?: string | null;
    first_seen_at: Date;
    last_seen_at: Date;
    last_checked_at: Date;
    is_official: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface SourceSnapshot {
    id: string;
    source_id: string;
    fetched_at: Date;
    http_status?: number | null;
    content_type?: string | null;
    page_hash?: string | null;
    metadata_hash?: string | null;
    binary_hash?: string | null;
    normalized_text_hash?: string | null;
    raw_object_key?: string | null;
    metadata_object_key?: string | null;
    binary_object_key?: string | null;
    is_current: boolean;
    created_at: Date;
}
export interface LegalProvision {
    id: string;
    document_id: string;
    chapter?: string | null;
    section?: string | null;
    article?: string | null;
    clause?: string | null;
    point?: string | null;
    appendix?: string | null;
    heading?: string | null;
    content: string;
    normalized_content: string;
    content_hash: string;
    valid_from?: string | null;
    valid_to?: string | null;
    status_override?: string | null;
    parent_provision_id?: string | null;
    sort_key?: string | null;
    created_at: Date;
    updated_at: Date;
}
export interface DocumentRelationship {
    id: string;
    source_document_id: string;
    target_document_id: string;
    relationship_type: RelationshipType;
    effective_from?: string | null;
    effective_to?: string | null;
    source_locator?: Record<string, unknown> | null;
    target_locator?: Record<string, unknown> | null;
    verification_status: VerificationStatus;
    confidence_internal?: number | null;
    evidence_id?: string | null;
    created_at: Date;
    updated_at: Date;
}
export interface LegalEvidence {
    id: string;
    document_id?: string | null;
    provision_id?: string | null;
    relationship_id?: string | null;
    field_name: string;
    asserted_value: unknown;
    source_snapshot_id: string;
    evidence_type: string;
    evidence_text?: string | null;
    evidence_locator?: Record<string, unknown> | null;
    verification_result?: string | null;
    created_at: Date;
}
export interface LegalEvent {
    id: string;
    document_id: string;
    event_type: LegalEventType;
    event_date: string;
    effective_from?: string | null;
    description?: string | null;
    evidence_id?: string | null;
    source_snapshot_id?: string | null;
    created_at: Date;
}
export interface DocumentTopic {
    document_id: string;
    topic: TaxTopic;
    is_primary: boolean;
}
export interface VerificationConflict {
    id: string;
    document_id: string;
    field_name: string;
    source_a_snapshot_id: string;
    source_a_value: unknown;
    source_b_snapshot_id: string;
    source_b_value: unknown;
    conflict_type: string;
    severity: "high" | "medium" | "low";
    resolved: boolean;
    resolution_note?: string | null;
    created_at: Date;
    updated_at: Date;
}
export interface SourceCheckpoint {
    id: string;
    source_name: string;
    last_success_at?: Date | null;
    last_item_id?: string | null;
    last_item_publication_date?: Date | null;
    last_full_backfill_at?: Date | null;
    last_reconciliation_at?: Date | null;
    updated_at: Date;
}
export interface IngestionJob {
    id: string;
    source_name: string;
    job_type: "rss" | "backfill" | "reconciliation" | "file_fetch";
    status: "queued" | "running" | "completed" | "failed";
    payload?: Record<string, unknown> | null;
    error_message?: string | null;
    started_at?: Date | null;
    finished_at?: Date | null;
    created_at: Date;
}
export interface AuditEvent {
    id: string;
    event_name: string;
    entity_type: string;
    entity_id?: string | null;
    actor: string;
    details?: Record<string, unknown> | null;
    created_at: Date;
}
//# sourceMappingURL=types.d.ts.map