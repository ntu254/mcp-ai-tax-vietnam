import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// 1. issuers
export const issuers = pgTable("issuers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  normalized_name: varchar("normalized_name", { length: 255 }).notNull(),
  issuer_type: varchar("issuer_type", { length: 100 }),
  parent_issuer_id: uuid("parent_issuer_id"),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 2. legal_documents
export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonical_id: varchar("canonical_id", { length: 255 }),
    canonical_status: varchar("canonical_status", { length: 50 })
      .default("resolved")
      .notNull(),

    document_number: varchar("document_number", { length: 100 }),
    normalized_document_number: varchar("normalized_document_number", {
      length: 100,
    }),

    document_type: varchar("document_type", { length: 100 }).notNull(),
    document_nature: varchar("document_nature", { length: 100 }).notNull(),

    title: text("title").notNull(),
    summary: text("summary"),

    issuer_id: uuid("issuer_id").references(() => issuers.id),
    issuer_name: varchar("issuer_name", { length: 255 }),

    issued_date: date("issued_date"),
    publication_date: date("publication_date"),
    default_effective_from: date("default_effective_from"),
    default_effective_to: date("default_effective_to"),

    verification_status: varchar("verification_status", {
      length: 50,
    }).notNull(),

    current_status_cached: varchar("current_status_cached", { length: 50 }),
    current_status_as_of: date("current_status_as_of"),

    language: varchar("language", { length: 10 }).default("vi").notNull(),

    raw_text: text("raw_text"),
    normalized_text: text("normalized_text"),
    normalized_text_hash: varchar("normalized_text_hash", { length: 64 }),

    source_count: integer("source_count").default(0).notNull(),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("legal_docs_canonical_id_idx").on(table.canonical_id),
    index("legal_docs_norm_doc_num_idx").on(table.normalized_document_number),
    index("legal_docs_issuer_id_idx").on(table.issuer_id),
    index("legal_docs_issued_date_idx").on(table.issued_date),
    index("legal_docs_pub_date_idx").on(table.publication_date),
    index("legal_docs_eff_from_idx").on(table.default_effective_from),
    index("legal_docs_eff_to_idx").on(table.default_effective_to),
    index("legal_docs_ver_status_idx").on(table.verification_status),
    index("legal_docs_doc_nature_idx").on(table.document_nature),
  ]
);

// 3. document_sources
export const documentSources = pgTable(
  "document_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    document_id: uuid("document_id")
      .references(() => legalDocuments.id, { onDelete: "cascade" })
      .notNull(),

    source_name: varchar("source_name", { length: 100 }).notNull(),
    source_type: varchar("source_type", { length: 50 }).notNull(),
    source_authority: varchar("source_authority", { length: 50 }).notNull(),

    source_url: text("source_url").notNull(),
    detail_url: text("detail_url"),
    pdf_url: text("pdf_url"),
    docx_url: text("docx_url"),
    source_document_id: varchar("source_document_id", { length: 255 }),
    current_snapshot_id: uuid("current_snapshot_id"),

    first_seen_at: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    last_checked_at: timestamp("last_checked_at", {
      withTimezone: true,
    }).notNull(),

    is_official: boolean("is_official").notNull(),
    is_active: boolean("is_active").default(true).notNull(),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("doc_sources_doc_id_idx").on(table.document_id),
    index("doc_sources_source_name_idx").on(table.source_name),
  ]
);

// 4. source_snapshots
export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source_id: uuid("source_id")
      .references(() => documentSources.id, { onDelete: "cascade" })
      .notNull(),

    fetched_at: timestamp("fetched_at", { withTimezone: true }).notNull(),
    http_status: integer("http_status"),
    content_type: varchar("content_type", { length: 100 }),

    page_hash: varchar("page_hash", { length: 64 }),
    metadata_hash: varchar("metadata_hash", { length: 64 }),
    binary_hash: varchar("binary_hash", { length: 64 }),
    normalized_text_hash: varchar("normalized_text_hash", { length: 64 }),

    raw_object_key: text("raw_object_key"),
    metadata_object_key: text("metadata_object_key"),
    binary_object_key: text("binary_object_key"),

    is_current: boolean("is_current").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("snapshots_source_id_idx").on(table.source_id),
    index("snapshots_is_current_idx").on(table.is_current),
    index("snapshots_page_hash_idx").on(table.page_hash),
    index("snapshots_binary_hash_idx").on(table.binary_hash),
  ]
);

// 5. legal_provisions
export const legalProvisions = pgTable(
  "legal_provisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    document_id: uuid("document_id")
      .references(() => legalDocuments.id, { onDelete: "cascade" })
      .notNull(),

    chapter: varchar("chapter", { length: 50 }),
    section: varchar("section", { length: 50 }),
    article: varchar("article", { length: 50 }),
    clause: varchar("clause", { length: 50 }),
    point: varchar("point", { length: 50 }),
    appendix: varchar("appendix", { length: 50 }),

    heading: text("heading"),
    content: text("content").notNull(),
    normalized_content: text("normalized_content").notNull(),
    content_hash: varchar("content_hash", { length: 64 }).notNull(),

    valid_from: date("valid_from"),
    valid_to: date("valid_to"),
    status_override: varchar("status_override", { length: 50 }),

    parent_provision_id: uuid("parent_provision_id"),
    sort_key: varchar("sort_key", { length: 100 }),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("provisions_doc_id_idx").on(table.document_id),
    index("provisions_article_idx").on(table.article),
    index("provisions_valid_from_idx").on(table.valid_from),
    index("provisions_valid_to_idx").on(table.valid_to),
  ]
);

// 6. document_relationships
export const documentRelationships = pgTable(
  "document_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source_document_id: uuid("source_document_id")
      .references(() => legalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    target_document_id: uuid("target_document_id")
      .references(() => legalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    relationship_type: varchar("relationship_type", { length: 50 }).notNull(),

    effective_from: date("effective_from"),
    effective_to: date("effective_to"),

    source_locator: jsonb("source_locator"),
    target_locator: jsonb("target_locator"),

    verification_status: varchar("verification_status", {
      length: 50,
    }).notNull(),
    confidence_internal: numeric("confidence_internal", {
      precision: 5,
      scale: 2,
    }),

    evidence_id: uuid("evidence_id"),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("doc_rel_source_idx").on(table.source_document_id),
    index("doc_rel_target_idx").on(table.target_document_id),
    index("doc_rel_type_idx").on(table.relationship_type),
  ]
);

// 7. legal_evidence
export const legalEvidence = pgTable(
  "legal_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    document_id: uuid("document_id").references(() => legalDocuments.id, {
      onDelete: "cascade",
    }),
    provision_id: uuid("provision_id").references(() => legalProvisions.id, {
      onDelete: "cascade",
    }),
    relationship_id: uuid("relationship_id").references(
      () => documentRelationships.id,
      { onDelete: "cascade" }
    ),

    field_name: varchar("field_name", { length: 100 }).notNull(),
    asserted_value: jsonb("asserted_value").notNull(),

    source_snapshot_id: uuid("source_snapshot_id")
      .references(() => sourceSnapshots.id, { onDelete: "cascade" })
      .notNull(),

    evidence_type: varchar("evidence_type", { length: 50 }).notNull(),
    evidence_text: text("evidence_text"),
    evidence_locator: jsonb("evidence_locator"),

    verification_result: varchar("verification_result", { length: 50 }),

    evidence_origin: varchar("evidence_origin", { length: 50 })
      .default("live_official")
      .notNull(),
    environment: varchar("environment", { length: 20 })
      .default("production")
      .notNull(),
    is_quarantined: boolean("is_quarantined").default(false).notNull(),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("evidence_doc_id_idx").on(table.document_id),
    index("evidence_provision_id_idx").on(table.provision_id),
    index("evidence_rel_id_idx").on(table.relationship_id),
    index("evidence_snapshot_id_idx").on(table.source_snapshot_id),
    index("evidence_field_name_idx").on(table.field_name),
    index("evidence_origin_idx").on(table.evidence_origin),
    index("evidence_env_idx").on(table.environment),
    index("evidence_quarantined_idx").on(table.is_quarantined),
  ]
);

// 8. legal_events
export const legalEvents = pgTable(
  "legal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    document_id: uuid("document_id")
      .references(() => legalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    event_type: varchar("event_type", { length: 50 }).notNull(),
    event_date: date("event_date").notNull(),
    effective_from: date("effective_from"),
    description: text("description"),

    evidence_id: uuid("evidence_id").references(() => legalEvidence.id),
    source_snapshot_id: uuid("source_snapshot_id").references(
      () => sourceSnapshots.id
    ),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("events_doc_id_idx").on(table.document_id),
    index("events_type_idx").on(table.event_type),
    index("events_date_idx").on(table.event_date),
  ]
);

// 9. document_topics
export const documentTopics = pgTable(
  "document_topics",
  {
    document_id: uuid("document_id")
      .references(() => legalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    topic: varchar("topic", { length: 100 }).notNull(),
    is_primary: boolean("is_primary").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.document_id, table.topic] }),
    index("doc_topics_topic_idx").on(table.topic),
  ]
);

// 10. verification_conflicts
export const verificationConflicts = pgTable(
  "verification_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    document_id: uuid("document_id")
      .references(() => legalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    field_name: varchar("field_name", { length: 100 }).notNull(),

    source_a_snapshot_id: uuid("source_a_snapshot_id")
      .references(() => sourceSnapshots.id)
      .notNull(),
    source_a_value: jsonb("source_a_value").notNull(),

    source_b_snapshot_id: uuid("source_b_snapshot_id")
      .references(() => sourceSnapshots.id)
      .notNull(),
    source_b_value: jsonb("source_b_value").notNull(),

    conflict_type: varchar("conflict_type", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 20 }).default("high").notNull(),

    resolved: boolean("resolved").default(false).notNull(),
    resolution_note: text("resolution_note"),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("conflicts_doc_id_idx").on(table.document_id),
    index("conflicts_field_idx").on(table.field_name),
    index("conflicts_resolved_idx").on(table.resolved),
  ]
);

// 11. source_checkpoints
export const sourceCheckpoints = pgTable("source_checkpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  source_name: varchar("source_name", { length: 100 }).unique().notNull(),
  last_success_at: timestamp("last_success_at", { withTimezone: true }),
  last_item_id: varchar("last_item_id", { length: 255 }),
  last_item_publication_date: timestamp("last_item_publication_date", {
    withTimezone: true,
  }),
  last_full_backfill_at: timestamp("last_full_backfill_at", {
    withTimezone: true,
  }),
  last_reconciliation_at: timestamp("last_reconciliation_at", {
    withTimezone: true,
  }),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 12. ingestion_jobs
export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source_name: varchar("source_name", { length: 100 }).notNull(),
    job_type: varchar("job_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).default("queued").notNull(),
    payload: jsonb("payload"),
    error_message: text("error_message"),
    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("jobs_status_idx").on(table.status),
    index("jobs_source_name_idx").on(table.source_name),
  ]
);

// 13. audit_events
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    event_name: varchar("event_name", { length: 100 }).notNull(),
    entity_type: varchar("entity_type", { length: 50 }).notNull(),
    entity_id: uuid("entity_id"),
    actor: varchar("actor", { length: 100 }).notNull(),
    details: jsonb("details"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_event_name_idx").on(table.event_name),
    index("audit_entity_type_idx").on(table.entity_type),
    index("audit_entity_id_idx").on(table.entity_id),
  ]
);
