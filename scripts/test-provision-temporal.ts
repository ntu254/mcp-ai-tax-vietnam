import { getDb, legalProvisions } from "@vietnam-tax/db";
import { LegalStateEngine } from "@vietnam-tax/legal-state";
import { eq } from "drizzle-orm";

async function main() {
  const db = getDb();
  const engine = new LegalStateEngine(db);

  const provs = await db
    .select()
    .from(legalProvisions)
    .where(eq(legalProvisions.article, "Điều 15"));

  console.log(`Found ${provs.length} provisions for Article 15:`);
  for (const p of provs) {
    console.log(`\nTesting provision ${p.id} (${p.valid_from} -> ${p.valid_to ?? 'present'}):`);
    
    const state2021 = await engine.evaluateProvisionStatus(p.id, "2021-01-01");
    console.log(`  At 2021-01-01: status=${state2021.status}, isEffective=${state2021.isEffective}`);

    const state2023 = await engine.evaluateProvisionStatus(p.id, "2023-01-01");
    console.log(`  At 2023-01-01: status=${state2023.status}, isEffective=${state2023.isEffective}`);

    const state2026 = await engine.evaluateProvisionStatus(p.id, "2026-09-06");
    console.log(`  At 2026-09-06: status=${state2026.status}, isEffective=${state2026.isEffective}`);
  }

  process.exit(0);
}

main().catch(console.error);
