-- 0001_append_only_snapshots.sql
-- Add current_snapshot_id to document_sources to guarantee source_snapshots row immutability

ALTER TABLE document_sources
ADD COLUMN IF NOT EXISTS current_snapshot_id UUID REFERENCES source_snapshots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doc_sources_current_snapshot ON document_sources(current_snapshot_id);
