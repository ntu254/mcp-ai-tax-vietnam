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

  const startTime = Date.now();
  const connector = new CongBaoConnector();
  console.log("Step 1: Polling discovery documents from congbao.chinhphu.vn...");

  let items;
  try {
    items = await connector.pollRecent({ limit });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect to live Công Báo feed: ${msg}`);
    console.log("Notice: Offline/firewall mode detected. To test locally without internet, use offline corpus.");
    return;
  }

  console.log(`Step 1 Complete: Discovered ${items.length} items from live Công Báo catalog.\n`);

  let processedCount = 0;
  let resolvedCanonicalCount = 0;
  let pdfDiscoveredCount = 0;
  let totalProvisions = 0;
  let totalRelationships = 0;

  const natureCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};

  console.log("Step 2: Processing discovery items (detail page, snapshots, provisions)...");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    processedCount++;

    let detailHtml: string | undefined;
    let binaryUrl: string | undefined;

    try {
      const detail = await connector.fetchDetail(item, { downloadBinary: !dryRun });
      detailHtml = detail.html;
      binaryUrl = detail.binaryUrl;
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      logger.warn({ title: item.title, err: msg }, "Detail fetch failed, using RSS summary");
    }

    if (binaryUrl) {
      pdfDiscoveredCount++;
    }

    const textToParse = detailHtml ?? item.title;
    const meta = parseDocumentMetadata(item.title, textToParse);
    const provisions = parseLegalProvisions(textToParse);
    const relationships = extractDocumentRelationships(textToParse);

    totalProvisions += provisions.length;
    totalRelationships += relationships.length;

    natureCounts[meta.documentNature] = (natureCounts[meta.documentNature] ?? 0) + 1;
    typeCounts[meta.documentType] = (typeCounts[meta.documentType] ?? 0) + 1;

    const { canonicalId, canonicalStatus } = buildCanonicalId({
      documentType: meta.documentType,
      documentNumber: meta.documentNumber,
      issuedDate: meta.issuedDate,
    });

    if (canonicalStatus === "resolved") {
      resolvedCanonicalCount++;
    }

    // Print progress every 10 items or for the first 5
    if (processedCount <= 5 || processedCount % 10 === 0 || processedCount === items.length) {
      const pct = ((processedCount / items.length) * 100).toFixed(1);
      console.log(
        `  [Progress ${processedCount}/${items.length} (${pct}%)] Current: ${meta.documentNumber ?? "Văn bản"} | ID: ${canonicalId} | Provisions: ${provisions.length}`
      );
    }
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const throughput = (processedCount / (Number(elapsedSec) || 1)).toFixed(1);

  console.log("\n================================================================================");
  console.log("                     LIVE INGESTION SUMMARY REPORT");
  console.log("================================================================================");
  console.log(`  Items Discovered & Ingested : ${processedCount} / ${items.length} (${throughput} docs/sec)`);
  console.log(`  Canonical IDs Resolved      : ${resolvedCanonicalCount} / ${processedCount} (${((resolvedCanonicalCount / processedCount) * 100).toFixed(1)}%)`);
  console.log(`  Signed PDFs Discovered      : ${pdfDiscoveredCount} / ${processedCount}`);
  console.log(`  Total Provisions Segmented  : ${totalProvisions}`);
  console.log(`  Relationships Discovered    : ${totalRelationships}`);
  console.log(`  Total Ingestion Time        : ${elapsedSec}s`);
  console.log(`  DryRun Mode                 : ${dryRun}`);
  console.log(`  Document Natures Breakdown  : ${JSON.stringify(natureCounts)}`);
  console.log(`  Document Types Breakdown    : ${JSON.stringify(typeCounts)}`);
  console.log("================================================================================");
}

runLiveIngestion().catch((err) => {
  console.error("Live ingestion error:", err);
  process.exit(1);
});
