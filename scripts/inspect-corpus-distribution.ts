import { getDb, legalDocuments } from "@vietnam-tax/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();

  const total = await db.select({ count: sql<number>`count(*)` }).from(legalDocuments);
  console.log(`Total legal documents in DB: ${total[0].count}`);

  const byType = await db
    .select({ type: legalDocuments.document_type, count: sql<number>`count(*)` })
    .from(legalDocuments)
    .groupBy(legalDocuments.document_type);
  console.log("\nBreakdown by document_type:");
  console.table(byType);

  const byNature = await db
    .select({ nature: legalDocuments.document_nature, count: sql<number>`count(*)` })
    .from(legalDocuments)
    .groupBy(legalDocuments.document_nature);
  console.log("\nBreakdown by document_nature:");
  console.table(byNature);

  const byIssuer = await db
    .select({ issuer: legalDocuments.issuer_name, count: sql<number>`count(*)` })
    .from(legalDocuments)
    .groupBy(legalDocuments.issuer_name);
  console.log("\nBreakdown by issuer_name:");
  console.table(byIssuer);

  const byYear = await db
    .select({
      year: sql<string>`coalesce(substring(issued_date::text, 1, 4), substring(publication_date::text, 1, 4), 'UNKNOWN')`,
      count: sql<number>`count(*)`,
    })
    .from(legalDocuments)
    .groupBy(sql`coalesce(substring(issued_date::text, 1, 4), substring(publication_date::text, 1, 4), 'UNKNOWN')`);
  console.log("\nBreakdown by year:");
  console.table(byYear);

  const byStatus = await db
    .select({ status: legalDocuments.verification_status, count: sql<number>`count(*)` })
    .from(legalDocuments)
    .groupBy(legalDocuments.verification_status);
  console.log("\nBreakdown by verification_status:");
  console.table(byStatus);

  // Check for any documents with missing fields
  const missingDocNum = await db
    .select({ count: sql<number>`count(*)` })
    .from(legalDocuments)
    .where(sql`document_number is null or trim(document_number) = ''`);
  console.log(`\nDocuments missing document_number: ${missingDocNum[0].count}`);

  const missingTitle = await db
    .select({ count: sql<number>`count(*)` })
    .from(legalDocuments)
    .where(sql`title is null or trim(title) = ''`);
  console.log(`Documents missing title: ${missingTitle[0].count}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error inspecting corpus:", err);
  process.exit(1);
});
