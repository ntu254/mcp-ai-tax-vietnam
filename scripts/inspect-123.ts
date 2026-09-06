import {
  getDb,
  legalDocuments,
  documentSources,
  sourceSnapshots,
  legalProvisions,
  legalEvidence,
} from "@vietnam-tax/db";
import { eq, and } from "drizzle-orm";

async function main() {
  const db = getDb();
  console.log("=== Inspecting 123/2020/ND-CP ===");

  const docs = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.document_number, "123/2020/NĐ-CP"));

  console.log("Documents matching 123/2020/NĐ-CP:", docs.length);
  for (const d of docs) {
    console.log({
      id: d.id,
      canonical_id: d.canonical_id,
      document_number: d.document_number,
      title: d.title,
      issued_date: d.issued_date,
      default_effective_from: d.default_effective_from,
      verification_status: d.verification_status,
      current_status_cached: d.current_status_cached,
    });

    const sources = await db
      .select()
      .from(documentSources)
      .where(eq(documentSources.document_id, d.id));
    console.log(`  Sources (${sources.length}):`);
    for (const s of sources) {
      console.log(`    - [${s.source_name}] id=${s.id}, current_snapshot_id=${s.current_snapshot_id}`);
      const snaps = await db
        .select()
        .from(sourceSnapshots)
        .where(eq(sourceSnapshots.source_id, s.id));
      for (const snap of snaps) {
        console.log(`      * snapshot id=${snap.id}, page_hash=${snap.page_hash}, raw_key=${snap.raw_object_key}`);
      }
    }

    const provisions = await db
      .select()
      .from(legalProvisions)
      .where(eq(legalProvisions.document_id, d.id));
    console.log(`  Provisions (${provisions.length}):`);
    for (const p of provisions.slice(0, 3)) {
      console.log(`    - Article ${p.article}: ${p.heading} -> ${p.content.slice(0, 80)}...`);
    }

    const evidence = await db
      .select()
      .from(legalEvidence)
      .where(eq(legalEvidence.document_id, d.id));
    console.log(`  Evidence items count: ${evidence.length}`);
  }

  process.exit(0);
}

main().catch(console.error);
