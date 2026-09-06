import {
  getDb,
  legalDocuments,
  documentSources,
  sourceSnapshots,
  verificationConflicts,
} from "@vietnam-tax/db";
import { ObjectStorageService } from "@vietnam-tax/source-storage";
import { eq } from "drizzle-orm";

async function main() {
  const db = getDb();
  const storage = new ObjectStorageService();

  console.log("=== Inspecting Decree 332/2026/NĐ-CP Snapshots & Locator ===");

  const [doc332] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.document_number, "332/2026/NĐ-CP"));

  if (!doc332) {
    console.log("332/2026/ND-CP not found");
    return;
  }

  console.log(`Document: ${doc332.document_number} (${doc332.id})`);

  const sources = await db
    .select()
    .from(documentSources)
    .where(eq(documentSources.document_id, doc332.id));

  for (const s of sources) {
    console.log(`\nSource: [${s.source_name}] (${s.id}) URL: ${s.source_url}`);
    const snaps = await db
      .select()
      .from(sourceSnapshots)
      .where(eq(sourceSnapshots.source_id, s.id));

    for (const snap of snaps) {
      console.log(`  Snapshot ID: ${snap.id}`);
      console.log(`  Raw Key: ${snap.raw_object_key}`);
      console.log(`  Hash: ${snap.page_hash}`);
      if (snap.raw_object_key) {
        try {
          const buf = await storage.getObject(snap.raw_object_key);
          const text = buf.toString("utf-8");
          console.log(`  Content size: ${buf.length} bytes`);
          console.log(`  Snippet: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
        } catch (e: any) {
          console.log(`  Failed to read object: ${e.message}`);
        }
      }
    }
  }

  const conflicts = await db
    .select()
    .from(verificationConflicts)
    .where(eq(verificationConflicts.document_id, doc332.id));

  console.log(`\nConflicts for 332/2026/ND-CP (${conflicts.length}):`);
  for (const c of conflicts) {
    console.log({
      field: c.field_name,
      sourceA: c.source_a_value,
      sourceB: c.source_b_value,
      note: c.resolution_note,
    });
  }

  process.exit(0);
}

main().catch(console.error);
