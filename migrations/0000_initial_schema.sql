-- 0000_initial_schema.sql
-- Production schema for Vietnam Tax & Legal MCP

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. issuers
CREATE TABLE IF NOT EXISTS issuers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    issuer_type VARCHAR(100),
    parent_issuer_id UUID REFERENCES issuers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. legal_documents
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_id VARCHAR(255) UNIQUE,
    canonical_status VARCHAR(50) NOT NULL DEFAULT 'resolved',

    document_number VARCHAR(100),
    normalized_document_number VARCHAR(100),

    document_type VARCHAR(100) NOT NULL,
    document_nature VARCHAR(100) NOT NULL,

    title TEXT NOT NULL,
    summary TEXT,

    issuer_id UUID REFERENCES issuers(id) ON DELETE SET NULL,
    issuer_name VARCHAR(255),

    issued_date DATE,
    publication_date DATE,
    default_effective_from DATE,
    default_effective_to DATE,

    verification_status VARCHAR(50) NOT NULL,

    current_status_cached VARCHAR(50),
    current_status_as_of DATE,

    language VARCHAR(10) NOT NULL DEFAULT 'vi',

    raw_text TEXT,
    normalized_text TEXT,
    normalized_text_hash VARCHAR(64),

    source_count INT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_legal_docs_norm_doc_num ON legal_documents(normalized_document_number);
CREATE INDEX IF NOT EXISTS idx_legal_docs_issuer_id ON legal_documents(issuer_id);
CREATE INDEX IF NOT EXISTS idx_legal_docs_issued_date ON legal_documents(issued_date);
CREATE INDEX IF NOT EXISTS idx_legal_docs_publication_date ON legal_documents(publication_date);
CREATE INDEX IF NOT EXISTS idx_legal_docs_eff_from ON legal_documents(default_effective_from);
CREATE INDEX IF NOT EXISTS idx_legal_docs_eff_to ON legal_documents(default_effective_to);
CREATE INDEX IF NOT EXISTS idx_legal_docs_ver_status ON legal_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_legal_docs_doc_nature ON legal_documents(document_nature);

-- Full-text search index (GIN)
CREATE INDEX IF NOT EXISTS idx_legal_docs_fts ON legal_documents USING GIN (
    to_tsvector('simple', title || ' ' || COALESCE(normalized_text, ''))
);

-- 3. document_sources
CREATE TABLE IF NOT EXISTS document_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,

    source_name VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_authority VARCHAR(50) NOT NULL,

    source_url TEXT NOT NULL,
    detail_url TEXT,
    pdf_url TEXT,
    docx_url TEXT,
    source_document_id VARCHAR(255),

    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    last_checked_at TIMESTAMPTZ NOT NULL,

    is_official BOOLEAN NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_sources_doc_id ON document_sources(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_sources_source_name ON document_sources(source_name);

-- 4. source_snapshots
CREATE TABLE IF NOT EXISTS source_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES document_sources(id) ON DELETE CASCADE,

    fetched_at TIMESTAMPTZ NOT NULL,
    http_status INT,
    content_type VARCHAR(100),

    page_hash VARCHAR(64),
    metadata_hash VARCHAR(64),
    binary_hash VARCHAR(64),
    normalized_text_hash VARCHAR(64),

    raw_object_key TEXT,
    metadata_object_key TEXT,
    binary_object_key TEXT,

    is_current BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_source_id ON source_snapshots(source_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_is_current ON source_snapshots(is_current);
CREATE INDEX IF NOT EXISTS idx_snapshots_page_hash ON source_snapshots(page_hash);
CREATE INDEX IF NOT EXISTS idx_snapshots_binary_hash ON source_snapshots(binary_hash);

-- 5. legal_provisions
CREATE TABLE IF NOT EXISTS legal_provisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,

    chapter VARCHAR(50),
    section VARCHAR(50),
    article VARCHAR(50),
    clause VARCHAR(50),
    point VARCHAR(50),
    appendix VARCHAR(50),

    heading TEXT,
    content TEXT NOT NULL,
    normalized_content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,

    valid_from DATE,
    valid_to DATE,
    status_override VARCHAR(50),

    parent_provision_id UUID REFERENCES legal_provisions(id) ON DELETE SET NULL,
    sort_key VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provisions_doc_id ON legal_provisions(document_id);
CREATE INDEX IF NOT EXISTS idx_provisions_article ON legal_provisions(article);
CREATE INDEX IF NOT EXISTS idx_provisions_valid_from ON legal_provisions(valid_from);
CREATE INDEX IF NOT EXISTS idx_provisions_valid_to ON legal_provisions(valid_to);

-- 6. document_relationships
CREATE TABLE IF NOT EXISTS document_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL,

    effective_from DATE,
    effective_to DATE,

    source_locator JSONB,
    target_locator JSONB,

    verification_status VARCHAR(50) NOT NULL,
    confidence_internal NUMERIC(5, 2),

    evidence_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_rel_source ON document_relationships(source_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_rel_target ON document_relationships(target_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_rel_type ON document_relationships(relationship_type);

-- 7. legal_evidence
CREATE TABLE IF NOT EXISTS legal_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE,
    provision_id UUID REFERENCES legal_provisions(id) ON DELETE CASCADE,
    relationship_id UUID REFERENCES document_relationships(id) ON DELETE CASCADE,

    field_name VARCHAR(100) NOT NULL,
    asserted_value JSONB NOT NULL,

    source_snapshot_id UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,

    evidence_type VARCHAR(50) NOT NULL,
    evidence_text TEXT,
    evidence_locator JSONB,

    verification_result VARCHAR(50),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_doc_id ON legal_evidence(document_id);
CREATE INDEX IF NOT EXISTS idx_evidence_provision_id ON legal_evidence(provision_id);
CREATE INDEX IF NOT EXISTS idx_evidence_rel_id ON legal_evidence(relationship_id);
CREATE INDEX IF NOT EXISTS idx_evidence_snapshot_id ON legal_evidence(source_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_evidence_field_name ON legal_evidence(field_name);

-- 8. legal_events
CREATE TABLE IF NOT EXISTS legal_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_date DATE NOT NULL,
    effective_from DATE,
    description TEXT,

    evidence_id UUID REFERENCES legal_evidence(id) ON DELETE SET NULL,
    source_snapshot_id UUID REFERENCES source_snapshots(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_doc_id ON legal_events(document_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON legal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date ON legal_events(event_date);

-- 9. document_topics
CREATE TABLE IF NOT EXISTS document_topics (
    document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
    topic VARCHAR(100) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (document_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_doc_topics_topic ON document_topics(topic);

-- 10. verification_conflicts
CREATE TABLE IF NOT EXISTS verification_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,

    source_a_snapshot_id UUID NOT NULL REFERENCES source_snapshots(id),
    source_a_value JSONB NOT NULL,

    source_b_snapshot_id UUID NOT NULL REFERENCES source_snapshots(id),
    source_b_value JSONB NOT NULL,

    conflict_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'high',

    resolved BOOLEAN NOT NULL DEFAULT false,
    resolution_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflicts_doc_id ON verification_conflicts(document_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_field ON verification_conflicts(field_name);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON verification_conflicts(resolved);

-- 11. source_checkpoints
CREATE TABLE IF NOT EXISTS source_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name VARCHAR(100) UNIQUE NOT NULL,
    last_success_at TIMESTAMPTZ,
    last_item_id VARCHAR(255),
    last_item_publication_date TIMESTAMPTZ,
    last_full_backfill_at TIMESTAMPTZ,
    last_reconciliation_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. ingestion_jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    payload JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_source_name ON ingestion_jobs(source_name);

-- 13. audit_events
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    actor VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_name ON audit_events(event_name);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_events(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON audit_events(entity_id);
