import {
  getDb,
  verificationConflicts,
  legalDocuments,
  documentSources,
  sourceSnapshots,
  legalEvidence,
} from "@vietnam-tax/db";
import { eq, ne, sql } from "drizzle-orm";

async function main() {
  const db = getDb();

  console.log("================================================================================");
  console.log("          PART 1: AUDIT OF REAL AUTHORITATIVE CONFLICTS IN DB");
  console.log("================================================================================\n");

  const conflicts = await db
    .select()
    .from(verificationConflicts)
    .where(ne(verificationConflicts.conflict_type, "SYNTHETIC_TEST_CONFLICT"));

  console.log(`Found ${conflicts.length} real authoritative conflict records in DB:\n`);

  for (let i = 0; i < conflicts.length; i++) {
    const c = conflicts[i];
    const doc = await db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.id, c.document_id))
      .limit(1);

    const docRow = doc[0];

    // Find source details for snapshot A
    const snapA = await db
      .select({
        snapshot: sourceSnapshots,
        source: documentSources,
      })
      .from(sourceSnapshots)
      .innerJoin(documentSources, eq(sourceSnapshots.source_id, documentSources.id))
      .where(eq(sourceSnapshots.id, c.source_a_snapshot_id))
      .limit(1);

    // Find source details for snapshot B
    const snapB = await db
      .select({
        snapshot: sourceSnapshots,
        source: documentSources,
      })
      .from(sourceSnapshots)
      .innerJoin(documentSources, eq(sourceSnapshots.source_id, documentSources.id))
      .where(eq(sourceSnapshots.id, c.source_b_snapshot_id))
      .limit(1);

    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Conflict #${i + 1}:`);
    console.log(`  Document ID     : ${c.document_id}`);
    console.log(`  Document Number : ${docRow?.document_number ?? "N/A"}`);
    console.log(`  Canonical ID    : ${docRow?.canonical_id ?? "N/A"}`);
    console.log(`  Title           : ${docRow?.title ?? "N/A"}`);
    console.log(`  Conflicting Field: ${c.field_name}`);
    console.log(`  Severity        : ${c.severity}`);
    console.log(`  Conflict Type   : ${c.conflict_type}`);
    console.log(`  Resolved        : ${c.resolved} (Note: ${c.resolution_note ?? "none"})`);
    console.log(`  Source A:`);
    console.log(`    Source Name   : ${snapA[0]?.source.source_name ?? "unknown"}`);
    console.log(`    Snapshot ID   : ${c.source_a_snapshot_id}`);
    console.log(`    Asserted Value: ${JSON.stringify(c.source_a_value)}`);
    console.log(`    Fetched At    : ${snapA[0]?.snapshot.fetched_at?.toISOString() ?? "N/A"}`);
    console.log(`  Source B:`);
    console.log(`    Source Name   : ${snapB[0]?.source.source_name ?? "unknown"}`);
    console.log(`    Snapshot ID   : ${c.source_b_snapshot_id}`);
    console.log(`    Asserted Value: ${JSON.stringify(c.source_b_value)}`);
    console.log(`    Fetched At    : ${snapB[0]?.snapshot.fetched_at?.toISOString() ?? "N/A"}`);
  }

  console.log("\n================================================================================");
  console.log("          PART 2: INVESTIGATION OF 48 UNKNOWN YEAR DOCUMENTS");
  console.log("================================================================================\n");

  const allDocs = await db.select().from(legalDocuments);
  const unknownDocs = allDocs.filter((d) => {
    const hasIssued = d.issued_date && d.issued_date.length >= 4;
    const hasPub = d.publication_date && d.publication_date.length >= 4;
    const hasYearInNum = d.document_number?.match(/[\/\-_](\d{4})[\/\-_]/);
    return !hasIssued && !hasPub && !hasYearInNum;
  });

  console.log(`Total documents without explicit year in dates/numbers: ${unknownDocs.length}`);
  for (let i = 0; i < Math.min(unknownDocs.length, 10); i++) {
    const d = unknownDocs[i];
    console.log(`  [${i + 1}] ID: ${d.id}`);
    console.log(`      DocNumber: "${d.document_number}"`);
    console.log(`      Canonical: "${d.canonical_id}"`);
    console.log(`      Nature   : "${d.document_nature}", Type: "${d.document_type}"`);
    console.log(`      Title    : "${d.title.slice(0, 70)}"`);
    console.log(`      Status   : "${d.verification_status}"`);
  }

  // Also check documents where year was UNKNOWN in previous script
  const prevUnknownDocs = allDocs.filter((d) => {
    const hasIssued = d.issued_date && d.issued_date.length >= 4;
    const hasPub = d.publication_date && d.publication_date.length >= 4;
    const m = d.document_number?.match(/\/(\d{4})\//) || d.document_number?.match(/[-_](\d{4})[-_]/);
    return !hasIssued && !hasPub && !m;
  });
  console.log(`\nExact count matching previous script's UNKNOWN criteria: ${prevUnknownDocs.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error in audit script:", err);
  process.exit(1);
});
