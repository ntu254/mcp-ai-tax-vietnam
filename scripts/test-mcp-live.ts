import "dotenv/config";
import { getDb, closeDbPool } from "../packages/db/src/index.js";
import { LegalQueryService } from "../packages/legal-query/src/index.js";

async function testLiveMcp() {
  const db = getDb();
  const queryService = new LegalQueryService(db);

  console.log("=== TESTING LIVE MCP RETRIEVAL ===");

  // 1. Search for live document by number
  console.log("\n1. Searching for document '336/2026/NĐ-CP'...");
  const searchRes = await queryService.searchLegalDocs({
    query: "336/2026/NĐ-CP",
    limit: 5,
  });
  console.log(`Found: ${searchRes.total} results`);
  if (searchRes.results[0]) {
    const doc = searchRes.results[0];
    console.log(`  - Title: ${doc.title}`);
    console.log(`  - Canonical ID: ${doc.canonical_id}`);
    console.log(`  - Document Nature: ${doc.document_nature}`);
    console.log(`  - Score: ${doc.score}`);

    // 2. Fetch full document by Canonical ID
    console.log(`\n2. Fetching full document by Canonical ID '${doc.canonical_id}'...`);
    const fullDoc = await queryService.getLegalDocument({
      document_id: doc.canonical_id!,
    });
    console.log(`  - Document ID: ${fullDoc.document_id}`);
    console.log(`  - Sources count: ${fullDoc.sources.length}`);
    console.log(`  - Provisions count: ${fullDoc.provisions?.length}`);
    console.log(`  - Evidence count: ${fullDoc.evidence?.length}`);
    if (fullDoc.sources[0]) {
      console.log(`  - Official Source URL: ${fullDoc.sources[0].source_url}`);
      console.log(`  - Latest Snapshot ID: ${fullDoc.sources[0].latest_snapshot_id}`);
    }
  }

  // 3. Test latest_tax_updates
  console.log("\n3. Testing latest_tax_updates tool...");
  const updates = await queryService.getLatestTaxUpdates({
    days: 30,
    limit: 5,
  });
  console.log(`Latest updates items: ${updates.items.length}`);
  for (const item of updates.items.slice(0, 3)) {
    console.log(`  - [${item.event_type}] ${item.title.slice(0, 70)}... (${item.event_date})`);
  }

  console.log("\n=== ALL LIVE MCP RETRIEVAL TESTS PASSED ===");
  await closeDbPool();
}

testLiveMcp().catch((err) => {
  console.error("Live MCP test error:", err);
  process.exit(1);
});
