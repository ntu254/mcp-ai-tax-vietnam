import {
  getDb,
  legalDocuments,
  documentSources,
  sourceSnapshots,
  legalEvidence,
  verificationConflicts,
  DatabaseInstance,
} from "@vietnam-tax/db";
import { VerificationEngine } from "@vietnam-tax/verification";
import { eq, or, and, sql } from "drizzle-orm";

async function main() {
  const db: DatabaseInstance = getDb();
  const verifier = new VerificationEngine(db);

  console.log("================================================================================");
  console.log("       TEST-DATA CONTAMINATION AUDIT & FIXTURE QUARANTINE RUNNER");
  console.log("================================================================================\n");

  // 1. Find all evidence items containing synthetic test dates (2029-01-01, 2026-12-31)
  const syntheticEvidence = await db
    .select()
    .from(legalEvidence)
    .where(
      or(
        eq(legalEvidence.asserted_value, "2029-01-01"),
        eq(legalEvidence.asserted_value, "2026-12-31")
      )
    );

  console.log(`Step 1: Found ${syntheticEvidence.length} synthetic test fixture evidence rows in DB.`);

  for (const ev of syntheticEvidence) {
    const existingLocator = (ev.evidence_locator as Record<string, unknown>) || {};
    await db
      .update(legalEvidence)
      .set({
        evidence_type: "test_fixture",
        evidence_locator: {
          ...existingLocator,
          is_fixture: true,
          evidence_origin: "test_fixture",
          quarantined: true,
          quarantined_at: new Date().toISOString(),
          reason: "Synthetic test date fixture injected during earlier test runs; strictly excluded from legal verification.",
        },
      })
      .where(eq(legalEvidence.id, ev.id));
  }
  console.log(`  ✓ Quarantined ${syntheticEvidence.length} evidence items (evidence_type='test_fixture', is_fixture=true)`);

  // 2. Resolve and reclassify contaminated conflict rows in verificationConflicts
  const contaminatedConflicts = await db
    .select()
    .from(verificationConflicts)
    .where(
      or(
        eq(verificationConflicts.source_a_value, "2029-01-01"),
        eq(verificationConflicts.source_b_value, "2029-01-01"),
        eq(verificationConflicts.source_a_value, "2026-12-31"),
        eq(verificationConflicts.source_b_value, "2026-12-31")
      )
    );

  console.log(`\nStep 2: Found ${contaminatedConflicts.length} contaminated conflict records in verificationConflicts.`);

  for (const c of contaminatedConflicts) {
    await db
      .update(verificationConflicts)
      .set({
        conflict_type: "SYNTHETIC_TEST_CONFLICT",
        resolved: true,
        resolution_note: "Quarantined & Resolved: Test-data contamination. Originated from synthetic test fixture, not an authoritative dispute between live official sources.",
        updated_at: new Date(),
      })
      .where(eq(verificationConflicts.id, c.id));
  }
  console.log(`  ✓ Marked ${contaminatedConflicts.length} conflict records as SYNTHETIC_TEST_CONFLICT and resolved=true`);

  // 3. For the 4 affected documents (123, 332, 295, 327), ensure current_snapshot_id points to clean live snapshots
  const targetNumbers = ["123/2020/NĐ-CP", "332/2026/NĐ-CP", "295/2026/NĐ-CP", "327/2026/NĐ-CP"];
  console.log(`\nStep 3: Re-aligning snapshots and re-verifying ${targetNumbers.length} documents...`);

  for (const num of targetNumbers) {
    const [doc] = await db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.document_number, num));

    if (!doc) continue;

    const sources = await db
      .select()
      .from(documentSources)
      .where(eq(documentSources.document_id, doc.id));

    // For VBPL source, point to the HTML snapshot (detail.html), not the test fixture (response.xml)
    for (const s of sources) {
      if (s.source_name === "vbpl") {
        const snaps = await db
          .select()
          .from(sourceSnapshots)
          .where(eq(sourceSnapshots.source_id, s.id));

        const htmlSnap = snaps.find((snap) => snap.raw_object_key?.includes("detail.html"));
        if (htmlSnap) {
          await db
            .update(documentSources)
            .set({ current_snapshot_id: htmlSnap.id })
            .where(eq(documentSources.id, s.id));
        }
      }
    }

    // Run verification with the new fixture-isolation filter
    const summary = await verifier.verifyDocument(doc.id);
    console.log(`  - [${doc.document_number}] verification_status = ${summary.finalStatus} | answerable = ${summary.answerable} | active conflicts = ${summary.conflictsCount}`);
  }

  // 4. Verify that real authoritative conflicts in DB is now EXACTLY 0
  const activeUnresolvedConflicts = await db
    .select({ count: sql<number>`count(*)` })
    .from(verificationConflicts)
    .where(
      and(
        eq(verificationConflicts.resolved, false),
        eq(verificationConflicts.conflict_type, "REAL_AUTHORITATIVE_CONFLICT")
      )
    );

  const realCount = Number(activeUnresolvedConflicts[0].count);
  console.log(`\n================================================================================`);
  console.log(`Real Authoritative Conflicts remaining in DB: ${realCount}`);
  console.log(`================================================================================`);

  if (realCount !== 0) {
    throw new Error(`INVARIANT VIOLATION: Expected 0 real conflicts after quarantine, found ${realCount}`);
  }

  console.log("✓ All synthetic fixtures quarantined successfully. Real authoritative conflicts = 0.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error in quarantine runner:", err);
  process.exit(1);
});
