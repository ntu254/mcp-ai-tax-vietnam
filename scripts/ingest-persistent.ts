import "dotenv/config";
import { count, eq, sql } from "drizzle-orm";
import {
  closeDbPool,
  DatabaseInstance,
  documentSources,
  documentTopics,
  getDb,
  legalDocuments,
  legalEvents,
  legalEvidence,
  legalProvisions,
  sourceSnapshots,
} from "../packages/db/src/index.js";
import {
  CheckpointManager,
  CongBaoConnector,
  IngestionPipeline,
} from "../packages/ingestion/src/index.js";
import { ObjectStorageService, SnapshotManager } from "../packages/source-storage/src/index.js";
import {
  buildCanonicalId,
  normalizeDocumentNumber,
} from "../packages/canonicalization/src/index.js";
import {
  EvidenceCollector,
  extractDocumentRelationships,
  extractPdfText,
  parseDocumentMetadata,
  parseLegalProvisions,
} from "../packages/parser/src/index.js";
import { VerificationEngine } from "../packages/verification/src/index.js";

interface TableStats {
  documents: number;
  sources: number;
  snapshots: number;
  provisions: number;
  evidence: number;
}

async function getTableStats(db: DatabaseInstance): Promise<TableStats> {
  const [docRes] = await db.select({ val: count() }).from(legalDocuments);
  const [srcRes] = await db.select({ val: count() }).from(documentSources);
  const [snpRes] = await db.select({ val: count() }).from(sourceSnapshots);
  const [prvRes] = await db.select({ val: count() }).from(legalProvisions);
  const [eviRes] = await db.select({ val: count() }).from(legalEvidence);

  return {
    documents: Number(docRes.val),
    sources: Number(srcRes.val),
    snapshots: Number(snpRes.val),
    provisions: Number(prvRes.val),
    evidence: Number(eviRes.val),
  };
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function runPersistentIngestion() {
  const args = process.argv.slice(2);
  let limit = 50;
  let forceRerun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Math.min(Number(args[i + 1]), 300);
      i++;
    } else if (args[i] === "--rerun") {
      forceRerun = true;
    }
  }

  const runId = `RUN#${new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14)}`;

  console.log("================================================================================");
  console.log(`        VIETNAM TAX & LEGAL MCP — PERSISTENT LIVE INGESTION [${runId}]`);
  console.log(`        Limit: ${limit} | Force Rerun Idempotency Test: ${forceRerun}`);
  console.log("================================================================================");

  const db = getDb();
  const storage = new ObjectStorageService();
  await storage.ensureBucket();

  const beforeStats = await getTableStats(db);
  console.log("Current Database Baseline Snapshot:");
  console.log(`  Documents: ${beforeStats.documents} | Sources: ${beforeStats.sources} | Snapshots: ${beforeStats.snapshots} | Provisions: ${beforeStats.provisions}`);

  const snapshotManager = new SnapshotManager(db, storage);
  const checkpointManager = new CheckpointManager(db);
  const pipeline = new IngestionPipeline(db, checkpointManager, snapshotManager);
  const connector = new CongBaoConnector();

  const startTime = Date.now();
  console.log(`\nStep 1: Polling ${limit} live documents from congbao.chinhphu.vn...`);

  const ingestedItems = await pipeline.runConnector(connector, {
    limit,
    forceRecheck: forceRerun,
  });

  console.log(`Step 1 Complete: Received ${ingestedItems.length} items from connector.\n`);
  console.log("Step 2: Processing, parsing provisions, and writing to PostgreSQL + MinIO...");

  let documentsWithStructuredBody = 0;
  let articlesDetected = 0;
  let clausesDetected = 0;
  let pointsDetected = 0;
  let totalProvisions = 0;
  let fallbackOnlyDocuments = 0;
  let parserFailures = 0;
  const provisionsPerDoc: number[] = [];

  const verificationEngine = new VerificationEngine(db);
  const evidenceCollector = new EvidenceCollector(db);

  for (let idx = 0; idx < ingestedItems.length; idx++) {
    const item = ingestedItems[idx];

    try {
      // 1. Full text extraction
      let textContent = item.html ?? item.discovered.title;
      if (item.binary && item.binary.byteLength > 0) {
        const pdfText = await extractPdfText(item.binary);
        if (pdfText && pdfText.length > 100) {
          textContent = pdfText;
        }
      }

      // 2. Parse metadata, provisions, and relationships
      const parsedMeta = parseDocumentMetadata(item.discovered.title, textContent);
      const provisions = parseLegalProvisions(textContent);
      const relationships = extractDocumentRelationships(textContent);

      const provCount = provisions.length;
      totalProvisions += provCount;
      provisionsPerDoc.push(provCount);

      if (provCount > 1) {
        documentsWithStructuredBody++;
      } else {
        fallbackOnlyDocuments++;
      }

      for (const p of provisions) {
        if (p.article) articlesDetected++;
        if (p.clause) clausesDetected++;
        if (p.point) pointsDetected++;
      }

      const { canonicalId, canonicalStatus } = buildCanonicalId({
        documentType: parsedMeta.documentType,
        documentNumber: parsedMeta.documentNumber,
        issuedDate: parsedMeta.issuedDate,
      });

      const now = new Date();

      // Check if canonical_id already exists on an earlier document
      const existingWithCanonical = await db
        .select({ id: legalDocuments.id })
        .from(legalDocuments)
        .where(eq(legalDocuments.canonical_id, canonicalId))
        .limit(1);

      let targetDocId = item.documentId;
      if (
        existingWithCanonical.length > 0 &&
        existingWithCanonical[0].id !== item.documentId
      ) {
        targetDocId = existingWithCanonical[0].id;
        await db
          .update(documentSources)
          .set({ document_id: targetDocId })
          .where(eq(documentSources.id, item.documentSourceId));
        await db
          .delete(legalDocuments)
          .where(eq(legalDocuments.id, item.documentId));
      }

      // 3. Update document record (guarantees strictly 1 document per item, 0 stubs!)
      await db
        .update(legalDocuments)
        .set({
          canonical_id: canonicalId,
          canonical_status: canonicalStatus,
          document_number: parsedMeta.documentNumber,
          normalized_document_number: parsedMeta.documentNumber
            ? normalizeDocumentNumber(parsedMeta.documentNumber)
            : null,
          document_type: parsedMeta.documentType,
          document_nature: parsedMeta.documentNature,
          title: parsedMeta.title,
          issuer_name: parsedMeta.issuerName,
          issued_date: parsedMeta.issuedDate,
          publication_date: item.discovered.publicationDate,
          default_effective_from: parsedMeta.effectiveFrom,
          verification_status: "unverified",
          language: "vi",
          raw_text: textContent.slice(0, 50000),
          updated_at: now,
        })
        .where(eq(legalDocuments.id, targetDocId));

      // 4. Insert topics
      for (const topic of parsedMeta.topics) {
        await db
          .insert(documentTopics)
          .values({
            document_id: targetDocId,
            topic,
            is_primary: true,
          })
          .onConflictDoNothing();
      }

      // 5. Insert provisions (replace existing provisions for this doc if rerun)
      if (forceRerun) {
        await db
          .delete(legalProvisions)
          .where(eq(legalProvisions.document_id, targetDocId));
      }

      const insertedProvisions: Array<{
        id: string;
        parsed: (typeof provisions)[number];
      }> = [];

      for (const prov of provisions) {
        const pId = crypto.randomUUID();
        await db.insert(legalProvisions).values({
          id: pId,
          document_id: targetDocId,
          chapter: prov.chapter,
          section: prov.section,
          article: prov.article,
          clause: prov.clause,
          point: prov.point,
          heading: prov.heading,
          content: prov.content,
          normalized_content: prov.normalizedContent,
          content_hash: prov.contentHash,
          valid_from: prov.validFrom ?? parsedMeta.effectiveFrom,
          valid_to: prov.validTo,
          status_override: prov.statusOverride,
          sort_key: prov.sortKey,
          created_at: now,
          updated_at: now,
        });
        insertedProvisions.push({ id: pId, parsed: prov });
      }

      // 6. Record snapshot evidence
      await evidenceCollector.recordDocumentEvidence({
        documentId: targetDocId,
        sourceSnapshotId: item.snapshotId,
        metadata: parsedMeta,
        provisions: insertedProvisions,
      });

      // 7. Verify document
      await verificationEngine.verifyDocument(targetDocId);
      if ((idx + 1) % 10 === 0 || idx + 1 === ingestedItems.length) {
        console.log(`  [Progress ${idx + 1}/${ingestedItems.length}] Synced: ${parsedMeta.documentNumber ?? "Văn bản"} | ID: ${canonicalId} | Provisions: ${provCount}`);
      }
    } catch (docErr) {
      parserFailures++;
      console.error(`  [Error] Document index ${idx} failed:`, docErr);
    }
  }

  const afterStats = await getTableStats(db);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  const delta = {
    discovered: ingestedItems.length,
    newDocuments: afterStats.documents - beforeStats.documents,
    existingDocuments: ingestedItems.length - (afterStats.documents - beforeStats.documents),
    newSources: afterStats.sources - beforeStats.sources,
    newSnapshots: afterStats.snapshots - beforeStats.snapshots,
    newProvisions: afterStats.provisions - beforeStats.provisions,
    newEvidence: afterStats.evidence - beforeStats.evidence,
    failed: parserFailures,
  };

  const medianProvisions = calculateMedian(provisionsPerDoc);

  console.log("\n================================================================================");
  console.log(`                  PERSISTENT RUN DELTA REPORT [${runId}]`);
  console.log("================================================================================");
  console.log(`  Discovered                  : ${delta.discovered}`);
  console.log(`  New Documents               : ${delta.newDocuments}`);
  console.log(`  Existing Documents (Merged) : ${delta.existingDocuments}`);
  console.log(`  New Sources                 : ${delta.newSources}`);
  console.log(`  New Snapshots               : ${delta.newSnapshots}`);
  console.log(`  New Provisions              : ${delta.newProvisions}`);
  console.log(`  New Evidence Items          : ${delta.newEvidence}`);
  console.log(`  Failed                      : ${delta.failed}`);
  console.log("────────────────────────────────────────────────────────────────────────────────");
  console.log("  Structured Provision Segmentation Metrics:");
  console.log(`    Documents with structured body : ${documentsWithStructuredBody} / ${ingestedItems.length}`);
  console.log(`    Articles detected (Điều)       : ${articlesDetected}`);
  console.log(`    Clauses detected (Khoản)       : ${clausesDetected}`);
  console.log(`    Points detected (Điểm)         : ${pointsDetected}`);
  console.log(`    Total provisions segmented     : ${totalProvisions}`);
  console.log(`    Fallback-only documents        : ${fallbackOnlyDocuments}`);
  console.log(`    Median provisions / document   : ${medianProvisions}`);
  console.log(`    Parser failures                : ${parserFailures}`);
  console.log(`  Elapsed Time                     : ${elapsedSec}s`);
  console.log("================================================================================");

  await closeDbPool();
}

runPersistentIngestion().catch((err) => {
  console.error("Persistent run fatal error:", err);
  process.exit(1);
});
