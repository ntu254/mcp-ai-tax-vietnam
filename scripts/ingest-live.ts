import "dotenv/config";
import { CongBaoConnector } from "../packages/ingestion/src/index.js";
import {
  extractDocumentRelationships,
  parseDocumentMetadata,
  parseLegalProvisions,
} from "../packages/parser/src/index.js";
import {
  buildCanonicalId,
  normalizeDocumentNumber,
} from "../packages/canonicalization/src/index.js";
import { computeSha256 } from "../packages/source-storage/src/index.js";
import { logger } from "../packages/observability/src/index.js";

async function runLiveIngestion() {
  const args = process.argv.slice(2);
  let limit = 20;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Math.min(Number(args[i + 1]), 300);
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  console.log("================================================================================");
  console.log("             VIETNAM TAX & LEGAL MCP — LIVE INGESTION RUNNER");
  console.log(`             Target: congbao.chinhphu.vn | Limit: ${limit} | DryRun: ${dryRun}`);
  console.log("================================================================================");

  const connector = new CongBaoConnector();
  console.log("Step 1: Polling live RSS feed from congbao.chinhphu.vn...");

  let items;
  try {
    items = await connector.pollRecent({ limit });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect to live Công Báo feed: ${msg}`);
    console.log("Notice: Offline/firewall mode detected. To test locally without internet, use offline corpus.");
    return;
  }

  console.log(`Step 1 Complete: Discovered ${items.length} items from live Công Báo feed.\n`);

  let processedCount = 0;
  let totalProvisions = 0;
  let totalRelationships = 0;

  console.log("Step 2: Processing discovery items (detail page, snapshots, provisions)...");

  for (const item of items) {
    processedCount++;
    console.log(`[${processedCount}/${items.length}] Processing: ${item.title.slice(0, 80)}...`);

    let detailHtml: string | undefined;
    let binaryBuffer: Buffer | undefined;

    try {
      const detail = await connector.fetchDetail(item);
      detailHtml = detail.html;
      binaryBuffer = detail.binary;
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      logger.warn({ title: item.title, err: msg }, "Detail fetch failed, using RSS summary");
    }

    const textToParse = detailHtml ?? item.title;
    const meta = parseDocumentMetadata(item.title, textToParse);
    const provisions = parseLegalProvisions(textToParse);
    const relationships = extractDocumentRelationships(textToParse);

    totalProvisions += provisions.length;
    totalRelationships += relationships.length;

    const { canonicalId, canonicalStatus } = buildCanonicalId({
      documentType: meta.documentType,
      documentNumber: meta.documentNumber,
      issuedDate: meta.issuedDate,
    });

    const snapshotHash = computeSha256(textToParse);

    console.log(`    ├── Canonical ID : ${canonicalId} (${canonicalStatus})`);
    console.log(`    ├── Nature       : ${meta.documentNature} | Type: ${meta.documentType}`);
    console.log(`    ├── Dates        : Issued: ${meta.issuedDate ?? "N/A"} | Eff: ${meta.effectiveFrom ?? "N/A"}`);
    console.log(`    ├── Provisions   : ${provisions.length} Điều/Khoản parsed`);
    console.log(`    ├── Relationships: ${relationships.length} links found`);
    console.log(`    └── Snapshot SHA : ${snapshotHash.slice(0, 16)}...`);
  }

  console.log("\n================================================================================");
  console.log("                     LIVE INGESTION SUMMARY REPORT");
  console.log("================================================================================");
  console.log(`  Items Discovered & Ingested : ${processedCount} / ${items.length}`);
  console.log(`  Total Provisions Segmented  : ${totalProvisions}`);
  console.log(`  Relationships Discovered    : ${totalRelationships}`);
  console.log(`  DryRun Mode                 : ${dryRun}`);
  console.log("================================================================================");
}

runLiveIngestion().catch((err) => {
  console.error("Live ingestion error:", err);
  process.exit(1);
});
