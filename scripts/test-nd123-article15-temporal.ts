import { getDb, legalDocuments, legalProvisions } from "@vietnam-tax/db";
import { LegalStateEngine } from "@vietnam-tax/legal-state";
import { eq, and } from "drizzle-orm";

async function main() {
  const db = getDb();
  const engine = new LegalStateEngine(db);

  const [doc123] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.document_number, "123/2020/NĐ-CP"));

  if (!doc123) throw new Error("123/2020/ND-CP not found");

  const provs = await db
    .select()
    .from(legalProvisions)
    .where(
      and(
        eq(legalProvisions.document_id, doc123.id),
        eq(legalProvisions.article, "Điều 15")
      )
    )
    .orderBy(legalProvisions.valid_from);

  console.log(`Provisions for Article 15 of 123/2020/NĐ-CP: ${provs.length}\n`);

  for (let i = 0; i < provs.length; i++) {
    const p = provs[i];
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Version ${i + 1} (ID: ${p.id}):`);
    console.log(`  Heading    : "${p.heading}"`);
    console.log(`  Valid From : ${p.valid_from} -> Valid To: ${p.valid_to ?? "null (current)"}`);
    console.log(`  Override   : ${p.status_override ?? "none"}`);
    console.log(`  Content Snippet: ${p.content.slice(0, 100).replace(/\n/g, " ")}...`);

    const s2021 = await engine.evaluateProvisionStatus(p.id, "2021-01-01");
    const s2023 = await engine.evaluateProvisionStatus(p.id, "2023-01-01");
    const s2026 = await engine.evaluateProvisionStatus(p.id, "2026-09-06");

    console.log(`  Evaluation across time:`);
    console.log(`    - at 2021-01-01: status=${s2021.status}, isEffective=${s2021.isEffective}`);
    console.log(`    - at 2023-01-01: status=${s2023.status}, isEffective=${s2023.isEffective}`);
    console.log(`    - at 2026-09-06: status=${s2026.status}, isEffective=${s2026.isEffective}`);
  }

  process.exit(0);
}

main().catch(console.error);
