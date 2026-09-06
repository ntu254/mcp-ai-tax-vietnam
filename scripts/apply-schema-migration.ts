import { getDb } from "@vietnam-tax/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  console.log("=== Applying Defense-in-Depth Schema Migration to legal_evidence ===");

  await db.execute(sql`
    ALTER TABLE legal_evidence 
    ADD COLUMN IF NOT EXISTS evidence_origin varchar(50) DEFAULT 'live_official' NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE legal_evidence 
    ADD COLUMN IF NOT EXISTS environment varchar(20) DEFAULT 'production' NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE legal_evidence 
    ADD COLUMN IF NOT EXISTS is_quarantined boolean DEFAULT false NOT NULL;
  `);

  console.log("✓ Added columns: evidence_origin, environment, is_quarantined to legal_evidence");

  // Sync existing quarantined fixtures
  await db.execute(sql`
    UPDATE legal_evidence
    SET 
      evidence_origin = 'test_fixture',
      environment = 'test',
      is_quarantined = true
    WHERE 
      evidence_type = 'test_fixture' 
      OR evidence_locator->>'is_fixture' = 'true'
      OR evidence_locator->>'quarantined' = 'true'
      OR asserted_value IN ('"2029-01-01"', '"2026-12-31"');
  `);

  console.log("✓ Synchronized existing test fixtures to is_quarantined=true and evidence_origin='test_fixture'");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
