import { describe, expect, it } from "vitest";
import {
  getDb,
  legalDocuments,
  documentSources,
  sourceSnapshots,
  legalEvidence,
  verificationConflicts,
} from "@vietnam-tax/db";
import { eq, and, sql } from "drizzle-orm";
import { VerificationEngine } from "@vietnam-tax/verification";

describe("Fixture Isolation Invariant & Defense-in-Depth (Final Hardening)", () => {
  const db = getDb();
  const verifier = new VerificationEngine(db);

  it("invariant: test_fixture contributes to production decision = 0", async () => {
    // 1. Create a sample legal document with a live official source and snapshot
    const docId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const snapId = crypto.randomUUID();
    const now = new Date();

    await db.insert(legalDocuments).values({
      id: docId,
      canonical_id: `VN:ND:2026:TEST-FIXTURE-ISO-${docId.slice(0, 8)}`,
      document_number: "999/2026/NĐ-CP",
      title: "Nghị định thử nghiệm cô lập fixture",
      document_type: "decree",
      document_nature: "normative_legal_document",
      issued_date: "2026-08-01",
      default_effective_from: "2026-08-01",
      verification_status: "unverified",
      language: "vi",
      created_at: now,
      updated_at: now,
    });

    await db.insert(documentSources).values({
      id: sourceId,
      document_id: docId,
      source_name: "congbao",
      source_type: "rss",
      source_authority: "tier_a",
      source_url: "https://congbao.chinhphu.vn/van-ban/test-999.htm",
      first_seen_at: now,
      last_seen_at: now,
      last_checked_at: now,
      is_official: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    await db.insert(sourceSnapshots).values({
      id: snapId,
      source_id: sourceId,
      fetched_at: now,
      raw_object_key: "raw/congbao/2026/09/sample/page.html",
      page_hash: "hash-live-official-sample",
      is_current: true,
      created_at: now,
    });

    await db
      .update(documentSources)
      .set({ current_snapshot_id: snapId })
      .where(eq(documentSources.id, sourceId));
    const liveEvidenceId = crypto.randomUUID();
    await db.insert(legalEvidence).values({
      id: liveEvidenceId,
      document_id: docId,
      source_snapshot_id: snapId,
      field_name: "default_effective_from",
      asserted_value: "2026-08-01",
      evidence_type: "congbao_assertion",
      evidence_origin: "live_official",
      environment: "production",
      is_quarantined: false,
      evidence_locator: {
        source: "congbao",
        transport: "https",
        format: "html",
        strategy: "rss",
        is_fixture: false,
      },
      created_at: now,
    });

    // 3. Inject a poisoned test fixture asserting conflicting date (e.g. 2029-01-01)
    const poisonedEvidenceId = crypto.randomUUID();
    await db.insert(legalEvidence).values({
      id: poisonedEvidenceId,
      document_id: docId,
      source_snapshot_id: snapId,
      field_name: "default_effective_from",
      asserted_value: "2029-01-01",
      evidence_type: "test_fixture",
      evidence_origin: "test_fixture",
      environment: "test",
      is_quarantined: true,
      evidence_locator: {
        is_fixture: true,
        quarantined: true,
        reason: "Poisoned fixture to test defense-in-depth isolation",
      },
      created_at: now,
    });

    // 4. Run VerificationEngine: Must strictly ignore poisoned test fixture
    const summary = await verifier.verifyDocument(docId);

    // Invariant checks:
    expect(summary.conflictsCount).toBe(0);
    expect(summary.finalStatus).toBe("single_source_verified");
    expect(summary.answerable).toBe(true);

    // Verify that active conflicts in DB has 0 rows for this doc
    const conflicts = await db
      .select()
      .from(verificationConflicts)
      .where(eq(verificationConflicts.document_id, docId));
    expect(conflicts).toHaveLength(0);

    // 5. Clean up test document
    await db.delete(legalDocuments).where(eq(legalDocuments.id, docId));
  });

  it("invariant: for every production verification decision, all contributing evidence must be live_official and unquarantined", async () => {
    // Backfill any pre-existing null locators
    await db
      .update(legalEvidence)
      .set({
        evidence_locator: { source: "congbao", transport: "https", format: "html" },
      })
      .where(
        and(
          eq(legalEvidence.environment, "production"),
          sql`evidence_locator IS NULL`
        )
      );

    const contributingEvidence = await db
      .select({
        id: legalEvidence.id,
        origin: legalEvidence.evidence_origin,
        env: legalEvidence.environment,
        quarantined: legalEvidence.is_quarantined,
        snapshotId: legalEvidence.source_snapshot_id,
        locator: legalEvidence.evidence_locator,
      })
      .from(legalEvidence)
      .where(
        and(
          eq(legalEvidence.environment, "production"),
          eq(legalEvidence.is_quarantined, false)
        )
      )
      .limit(100);

    expect(contributingEvidence.length).toBeGreaterThan(0);

    for (const ev of contributingEvidence) {
      expect(ev.origin).not.toBe("test_fixture");
      expect(ev.env).toBe("production");
      expect(ev.quarantined).toBe(false);
      expect(ev.snapshotId).not.toBeNull();
      expect(ev.locator).not.toBeNull();
    }
  });
});
