import {
  getDb,
  legalDocuments,
  legalProvisions,
  documentRelationships,
} from "@vietnam-tax/db";
import { eq, or, and } from "drizzle-orm";

async function main() {
  const db = getDb();
  console.log("=== Inspecting Provisions & Relationships for 123/2020/NĐ-CP ===");

  const [doc] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.document_number, "123/2020/NĐ-CP"));

  if (!doc) {
    console.log("Document 123/2020/NĐ-CP not found");
    return;
  }

  console.log(`Document: ${doc.document_number} (${doc.id})`);

  // Provisions for this doc
  const provisions = await db
    .select()
    .from(legalProvisions)
    .where(eq(legalProvisions.document_id, doc.id));

  console.log(`Total provisions: ${provisions.length}`);
  const article15Provisions = provisions.filter(
    (p) => p.article?.includes("15") || p.heading?.includes("15")
  );

  console.log(`Provisions matching Article 15: ${article15Provisions.length}`);
  for (const p of article15Provisions) {
    console.log({
      id: p.id,
      article: p.article,
      heading: p.heading,
      valid_from: p.valid_from,
      valid_to: p.valid_to,
      status_override: p.status_override,
      contentSnippet: p.content.slice(0, 120),
    });
  }

  // Check all provisions to see what headings exist
  console.log("\nSample provision headings (first 10):");
  for (const p of provisions.slice(0, 10)) {
    console.log(`  - ${p.article}: "${p.heading}"`);
  }

  // Relationships affecting this doc
  const relationships = await db
    .select()
    .from(documentRelationships)
    .where(
      or(
        eq(documentRelationships.source_document_id, doc.id),
        eq(documentRelationships.target_document_id, doc.id)
      )
    );

  console.log(`\nRelationships targeting or sourced by 123/2020/NĐ-CP: ${relationships.length}`);
  for (const r of relationships) {
    console.log({
      id: r.id,
      type: r.relationship_type,
      sourceId: r.source_document_id,
      targetId: r.target_document_id,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      sourceLocator: r.source_locator,
      targetLocator: r.target_locator,
    });
  }

  process.exit(0);
}

main().catch(console.error);
