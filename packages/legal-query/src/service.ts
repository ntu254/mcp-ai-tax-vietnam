import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import {
  DatabaseInstance,
  documentRelationships,
  documentSources,
  documentTopics,
  legalDocuments,
  legalEvents,
  legalEvidence,
  legalProvisions,
  sourceSnapshots,
  verificationConflicts,
} from "@vietnam-tax/db";
import {
  DocumentNature,
  DocumentRelationshipView,
  DocumentSourceView,
  DocumentType,
  EffectiveRuleItem,
  EvaluatedLegalStatus,
  EvidenceItem,
  GetEffectiveTaxRulesInput,
  GetEffectiveTaxRulesOutput,
  GetLegalDocumentInput,
  GetLegalDocumentOutput,
  LatestTaxUpdatesInput,
  LatestTaxUpdatesOutput,
  LegalEventType,
  OfficialGuidanceItem,
  ProvisionResult,
  SearchLegalDocsInput,
  SearchLegalDocsOutput,
  TaxTopic,
  VerificationStatus,
} from "@vietnam-tax/common";
import { LegalSearchEngine } from "@vietnam-tax/search";
import {
  getCurrentDateInVietnam,
  LegalStateEngine,
} from "@vietnam-tax/legal-state";
import { logger } from "@vietnam-tax/observability";

export const DATASET_VERSION = "2026.09.06-v1.1-prod";

export class LegalQueryService {
  private readonly searchEngine: LegalSearchEngine;
  private readonly stateEngine: LegalStateEngine;

  constructor(private readonly db: DatabaseInstance) {
    this.searchEngine = new LegalSearchEngine(db);
    this.stateEngine = new LegalStateEngine(db);
  }

  /**
   * Tool 1: latest_tax_updates
   */
  public async getLatestTaxUpdates(
    input: LatestTaxUpdatesInput
  ): Promise<LatestTaxUpdatesOutput> {
    const days = input.days ?? 30;
    const limit = input.limit ?? 20;
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const conditions = [gte(legalEvents.event_date, cutoffDate)];

    if (input.event_types && input.event_types.length > 0) {
      conditions.push(inArray(legalEvents.event_type, input.event_types));
    }

    if (input.document_natures && input.document_natures.length > 0) {
      conditions.push(
        inArray(legalDocuments.document_nature, input.document_natures)
      );
    }

    if (input.topic) {
      const docIdsForTopic = await this.db
        .select({ document_id: documentTopics.document_id })
        .from(documentTopics)
        .where(eq(documentTopics.topic, input.topic));

      const ids = docIdsForTopic.map((r) => r.document_id);
      if (ids.length === 0) {
        return {
          as_of: getCurrentDateInVietnam(),
          dataset_version: DATASET_VERSION,
          items: [],
        };
      }
      conditions.push(inArray(legalDocuments.id, ids));
    }

    const rows = await this.db
      .select({
        event: legalEvents,
        doc: legalDocuments,
      })
      .from(legalEvents)
      .innerJoin(legalDocuments, eq(legalEvents.document_id, legalDocuments.id))
      .where(and(...conditions))
      .orderBy(desc(legalEvents.event_date))
      .limit(limit);

    const items = rows.map((r) => ({
      event_id: r.event.id,
      event_type: r.event.event_type as LegalEventType,
      event_date: r.event.event_date,
      document_id: r.doc.id,
      canonical_id: r.doc.canonical_id,
      document_number: r.doc.document_number,
      title: r.doc.title,
      document_type: r.doc.document_type as DocumentType,
      document_nature: r.doc.document_nature as DocumentNature,
      issuer: r.doc.issuer_name,
      effective_from: r.event.effective_from ?? r.doc.default_effective_from ?? undefined,
      evidence_snapshot_id: r.event.source_snapshot_id ?? undefined,
    }));

    return {
      as_of: getCurrentDateInVietnam(),
      dataset_version: DATASET_VERSION,
      items,
    };
  }

  /**
   * Tool 2: search_legal_docs
   */
  public async searchLegalDocs(
    input: SearchLegalDocsInput
  ): Promise<SearchLegalDocsOutput> {
    const results = await this.searchEngine.search(input);

    return {
      query: input.query,
      total: results.length,
      dataset_version: DATASET_VERSION,
      results,
    };
  }

  /**
   * Tool 3: get_legal_document
   */
  public async getLegalDocument(
    input: GetLegalDocumentInput
  ): Promise<GetLegalDocumentOutput> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.document_id
      );

    const docRows = await this.db
      .select()
      .from(legalDocuments)
      .where(
        isUuid
          ? eq(legalDocuments.id, input.document_id)
          : eq(legalDocuments.canonical_id, input.document_id)
      )
      .limit(1);

    if (docRows.length === 0) {
      throw new Error(`Document not found: ${input.document_id}`);
    }

    const doc = docRows[0];

    // Load sources
    const sourcesRows = await this.db
      .select()
      .from(documentSources)
      .where(eq(documentSources.document_id, doc.id));

    const sources: DocumentSourceView[] = [];
    for (const s of sourcesRows) {
      const snapshots = await this.db
        .select()
        .from(sourceSnapshots)
        .where(eq(sourceSnapshots.source_id, s.id));

      const latest = snapshots.find((snap) => snap.is_current) ?? snapshots[0];
      sources.push({
        id: s.id,
        source_name: s.source_name,
        source_type: s.source_type,
        source_authority: s.source_authority,
        source_url: s.source_url,
        pdf_url: s.pdf_url,
        docx_url: s.docx_url,
        is_official: s.is_official,
        snapshots_count: snapshots.length,
        latest_snapshot_id: latest?.id ?? null,
      });
    }

    // Load provisions
    let provisions: ProvisionResult[] | undefined;
    if (input.include_provisions ?? true) {
      const pRows = await this.db
        .select()
        .from(legalProvisions)
        .where(eq(legalProvisions.document_id, doc.id))
        .orderBy(legalProvisions.sort_key);

      provisions = pRows.map((p) => ({
        id: p.id,
        chapter: p.chapter,
        section: p.section,
        article: p.article,
        clause: p.clause,
        point: p.point,
        appendix: p.appendix,
        heading: p.heading,
        content: p.content,
        valid_from: p.valid_from,
        valid_to: p.valid_to,
        status_override: p.status_override,
        evidence: [],
      }));
    }

    // Load relationships
    let relationships: DocumentRelationshipView[] | undefined;
    if (input.include_relationships ?? true) {
      const relRows = await this.db
        .select({
          rel: documentRelationships,
          targetDoc: legalDocuments,
        })
        .from(documentRelationships)
        .innerJoin(
          legalDocuments,
          eq(documentRelationships.target_document_id, legalDocuments.id)
        )
        .where(
          or(
            eq(documentRelationships.source_document_id, doc.id),
            eq(documentRelationships.target_document_id, doc.id)
          )
        );

      relationships = relRows.map((r) => ({
        id: r.rel.id,
        relationship_type: r.rel.relationship_type,
        target_document_id: r.rel.target_document_id,
        target_document_number: r.targetDoc.document_number,
        target_title: r.targetDoc.title,
        effective_from: r.rel.effective_from,
        effective_to: r.rel.effective_to,
        source_locator: r.rel.source_locator as Record<string, unknown> | null,
        target_locator: r.rel.target_locator as Record<string, unknown> | null,
        verification_status: r.rel.verification_status as VerificationStatus,
      }));
    }

    // Load evidence
    let evidence: EvidenceItem[] | undefined;
    if (input.include_evidence ?? true) {
      const evRows = await this.db
        .select()
        .from(legalEvidence)
        .where(eq(legalEvidence.document_id, doc.id));

      evidence = evRows.map((e) => ({
        id: e.id,
        document_id: e.document_id,
        provision_id: e.provision_id,
        relationship_id: e.relationship_id,
        field_name: e.field_name,
        asserted_value: e.asserted_value,
        source_snapshot_id: e.source_snapshot_id,
        evidence_type: e.evidence_type,
        evidence_text: e.evidence_text,
        evidence_locator: e.evidence_locator as Record<string, unknown> | null,
        verification_result: e.verification_result,
        created_at: e.created_at.toISOString(),
      }));
    }

    // Load conflicts
    const conflictRows = await this.db
      .select()
      .from(verificationConflicts)
      .where(
        and(
          eq(verificationConflicts.document_id, doc.id),
          eq(verificationConflicts.resolved, false)
        )
      );

    const conflicts = conflictRows.map(
      (c) =>
        `Conflict on '${c.field_name}' between snapshot ${c.source_a_snapshot_id} and ${c.source_b_snapshot_id}`
    );

    return {
      document_id: doc.id,
      canonical_id: doc.canonical_id,
      document_number: doc.document_number,
      title: doc.title,
      summary: doc.summary,
      issuer: doc.issuer_name,
      document_type: doc.document_type as DocumentType,
      document_nature: doc.document_nature as DocumentNature,
      issued_date: doc.issued_date,
      publication_date: doc.publication_date,
      default_effective_from: doc.default_effective_from,
      default_effective_to: doc.default_effective_to,
      verification_status: doc.verification_status as VerificationStatus,
      current_status_cached: (doc.current_status_cached as EvaluatedLegalStatus) ?? null,
      current_status_as_of: doc.current_status_as_of,
      sources,
      provisions,
      relationships,
      evidence,
      conflicts,
      dataset_version: DATASET_VERSION,
      retrieved_at: new Date().toISOString(),
    };
  }

  /**
   * Tool 4: get_effective_tax_rules
   */
  public async getEffectiveTaxRules(
    input: GetEffectiveTaxRulesInput
  ): Promise<GetEffectiveTaxRulesOutput> {
    const effectiveAt = input.effective_at ?? getCurrentDateInVietnam();
    const warnings: string[] = [];

    // Search candidate documents (filtering out drafts/proposals)
    const candidateDocs = await this.searchEngine.search({
      query: input.query,
      topics: input.topics,
      limit: input.limit ?? 10,
      effectiveOnly: true,
    });

    const effectiveRules: EffectiveRuleItem[] = [];
    const officialGuidanceList: OfficialGuidanceItem[] = [];

    for (const candidate of candidateDocs) {
      // Evaluate document temporal status
      const docEval = await this.stateEngine.evaluateDocumentStatus(
        candidate.document_id,
        effectiveAt
      );

      if (!docEval.isEffective) {
        logger.debug(
          { docId: candidate.document_id, status: docEval.status },
          "Candidate document not effective at target date"
        );
        continue;
      }

      // Load provisions for this document
      const provisions = await this.db
        .select()
        .from(legalProvisions)
        .where(eq(legalProvisions.document_id, candidate.document_id))
        .orderBy(legalProvisions.sort_key);

      // Load evidence items for this document
      const evidenceRows = await this.db
        .select()
        .from(legalEvidence)
        .where(eq(legalEvidence.document_id, candidate.document_id));

      const evidenceItems: EvidenceItem[] = evidenceRows.map((e) => ({
        id: e.id,
        document_id: e.document_id,
        provision_id: e.provision_id,
        relationship_id: e.relationship_id,
        field_name: e.field_name,
        asserted_value: e.asserted_value,
        source_snapshot_id: e.source_snapshot_id,
        evidence_type: e.evidence_type,
        evidence_text: e.evidence_text,
        evidence_locator: e.evidence_locator as Record<string, unknown> | null,
        created_at: e.created_at.toISOString(),
      }));

      // Filter provisions matching query or topic
      for (const prov of provisions) {
        const provEval = await this.stateEngine.evaluateProvisionStatus(
          prov.id,
          effectiveAt
        );

        if (!provEval.isEffective) {
          continue; // Provision repealed or not yet effective
        }

        const provEvidence = evidenceItems.filter(
          (e) => !e.provision_id || e.provision_id === prov.id
        );

        const provResult: ProvisionResult = {
          id: prov.id,
          chapter: prov.chapter,
          section: prov.section,
          article: prov.article,
          clause: prov.clause,
          point: prov.point,
          appendix: prov.appendix,
          heading: prov.heading,
          content: prov.content,
          valid_from: prov.valid_from ?? candidate.default_effective_from,
          valid_to: prov.valid_to ?? candidate.default_effective_to,
          evaluated_status: provEval.status,
          evidence: provEvidence,
        };

        if (candidate.document_nature === "official_guidance") {
          if (input.include_official_guidance) {
            officialGuidanceList.push({
              document_id: candidate.document_id,
              document_number: candidate.document_number,
              title: candidate.title,
              document_nature: "official_guidance",
              issuer: candidate.issuer,
              issued_date: candidate.issued_date,
              guidance_summary: prov.content.slice(0, 300),
              provision: provResult,
              evidence: provEvidence,
              note: "Official guidance reflects administrative execution interpretation and is not a normative legal document (VBQPPL).",
            });
          }
        } else {
          // Normative legal document (Law, Decree, Circular...)
          effectiveRules.push({
            document_id: candidate.document_id,
            canonical_id: candidate.canonical_id,
            document_number: candidate.document_number,
            title: candidate.title,
            document_type: candidate.document_type,
            document_nature: candidate.document_nature,
            issuer: candidate.issuer,
            effective_from: candidate.default_effective_from,
            effective_to: candidate.default_effective_to,
            provision: provResult,
            evidence: provEvidence,
            relevance_snippet: prov.content.slice(0, 250),
          });
        }
      }
    }

    // Section 41: answerable policy
    // answerable=false if no evidence or conflict
    const answerable = effectiveRules.length > 0 || officialGuidanceList.length > 0;
    if (!answerable) {
      warnings.push("INSUFFICIENT_EVIDENCE");
    }

    return {
      effective_at: effectiveAt,
      answerable,
      dataset_version: DATASET_VERSION,
      rules: effectiveRules,
      official_guidance: officialGuidanceList,
      warnings,
      evaluated_timezone: "Asia/Ho_Chi_Minh",
    };
  }
}
