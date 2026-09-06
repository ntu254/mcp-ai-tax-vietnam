import "dotenv/config";
import { eq } from "drizzle-orm";
import {
  closeDbPool,
  DatabaseInstance,
  documentTopics,
  getDb,
  legalDocuments,
  legalEvents,
  legalProvisions,
} from "@vietnam-tax/db";
import { logger } from "@vietnam-tax/observability";
import { ObjectStorageService, SnapshotManager } from "@vietnam-tax/source-storage";
import {
  CheckpointManager,
  CongBaoConnector,
  IngestionPipeline,
  IngestionResultItem,
} from "@vietnam-tax/ingestion";
import {
  buildCanonicalId,
  normalizeDocumentNumber,
} from "@vietnam-tax/canonicalization";
import {
  EvidenceCollector,
  extractDocumentRelationships,
  extractPdfText,
  parseDocumentMetadata,
  parseLegalProvisions,
} from "@vietnam-tax/parser";
import { VerificationEngine } from "@vietnam-tax/verification";

export interface ProcessingMetrics {
  documentsProcessed: number;
  documentsWithStructuredBody: number;
  articlesDetected: number;
  clausesDetected: number;
  pointsDetected: number;
  totalProvisions: number;
  fallbackOnlyDocuments: number;
  relationshipsDetected: number;
}

async function processIngestedItem(
  db: DatabaseInstance,
  item: IngestionResultItem
): Promise<{ provisionsCount: number; articlesCount: number; clausesCount: number; relationshipsCount: number }> {
  // 1. Extract full text: prioritize signed PDF binary if available
  let textContent = item.html ?? item.discovered.title;
  if (item.binary && item.binary.byteLength > 0) {
    const pdfText = await extractPdfText(item.binary);
    if (pdfText && pdfText.length > 200) {
      textContent = pdfText;
    }
  }

  // 2. Parse metadata, provisions, and relationships
  const parsedMeta = parseDocumentMetadata(item.discovered.title, textContent);
  const provisions = parseLegalProvisions(textContent);
  const relationships = extractDocumentRelationships(textContent);

  const { canonicalId, canonicalStatus } = buildCanonicalId({
    documentType: parsedMeta.documentType,
    documentNumber: parsedMeta.documentNumber,
    issuedDate: parsedMeta.issuedDate,
  });

  const now = new Date();
  const documentId = item.documentId;

  // 3. Update the existing document created by pipeline (guarantees exactly 1 document per item, 0 stubs!)
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
    .where(eq(legalDocuments.id, documentId));

  // 4. Insert topics
  for (const topic of parsedMeta.topics) {
    await db
      .insert(documentTopics)
      .values({
        document_id: documentId,
        topic,
        is_primary: true,
      })
      .onConflictDoNothing();
  }

  // 5. Insert structured provisions (Điều / Khoản / Điểm)
  const insertedProvisions: Array<{
    id: string;
    parsed: (typeof provisions)[number];
  }> = [];

  let articlesCount = 0;
  let clausesCount = 0;

  for (const prov of provisions) {
    const pId = crypto.randomUUID();
    if (prov.article) articlesCount++;
    if (prov.clause) clausesCount++;

    await db.insert(legalProvisions).values({
      id: pId,
      document_id: documentId,
      chapter: prov.chapter,
      section: prov.section,
      article: prov.article,
      clause: prov.clause,
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
  const evidenceCollector = new EvidenceCollector(db);
  await evidenceCollector.recordDocumentEvidence({
    documentId,
    sourceSnapshotId: item.snapshotId,
    metadata: parsedMeta,
    provisions: insertedProvisions,
  });

  // 7. Record publication legal event
  await db.insert(legalEvents).values({
    id: crypto.randomUUID(),
    document_id: documentId,
    event_type: "published",
    event_date: item.discovered.publicationDate ?? now.toISOString().slice(0, 10),
    effective_from: parsedMeta.effectiveFrom,
    description: `Document published: ${parsedMeta.title}`,
    source_snapshot_id: item.snapshotId,
    created_at: now,
  });

  // 8. Run verification engine
  const verificationEngine = new VerificationEngine(db);
  await verificationEngine.verifyDocument(documentId);

  return {
    provisionsCount: provisions.length,
    articlesCount,
    clausesCount,
    relationshipsCount: relationships.length,
  };
}

export async function runWorkerIteration(limit = 10): Promise<ProcessingMetrics> {
  const db = getDb();
  const storage = new ObjectStorageService();
  await storage.ensureBucket();

  const snapshotManager = new SnapshotManager(db, storage);
  const checkpointManager = new CheckpointManager(db);
  const pipeline = new IngestionPipeline(db, checkpointManager, snapshotManager);
  const connector = new CongBaoConnector();

  logger.info({ limit }, "Worker polling Công Báo feed...");
  const ingestedItems = await pipeline.runConnector(connector, { limit });

  const metrics: ProcessingMetrics = {
    documentsProcessed: ingestedItems.length,
    documentsWithStructuredBody: 0,
    articlesDetected: 0,
    clausesDetected: 0,
    pointsDetected: 0,
    totalProvisions: 0,
    fallbackOnlyDocuments: 0,
    relationshipsDetected: 0,
  };

  for (const item of ingestedItems) {
    try {
      const res = await processIngestedItem(db, item);
      metrics.totalProvisions += res.provisionsCount;
      metrics.articlesDetected += res.articlesCount;
      metrics.clausesDetected += res.clausesCount;
      metrics.relationshipsDetected += res.relationshipsCount;

      if (res.provisionsCount > 1) {
        metrics.documentsWithStructuredBody++;
      } else {
        metrics.fallbackOnlyDocuments++;
      }
    } catch (processErr) {
      logger.error(
        { title: item.discovered.title, err: processErr },
        "Error processing ingested item"
      );
    }
  }

  logger.info(
    {
      processed: metrics.documentsProcessed,
      structuredDocs: metrics.documentsWithStructuredBody,
      totalProvisions: metrics.totalProvisions,
      articles: metrics.articlesDetected,
      clauses: metrics.clausesDetected,
    },
    "Worker finished iteration processing"
  );

  return metrics;
}

async function main() {
  logger.info("Starting Vietnam Tax & Legal MCP ingestion worker...");

  const intervalMinutes =
    Number(process.env.INGESTION_INTERVAL_MINUTES) || 15;
  const intervalMs = intervalMinutes * 60 * 1000;

  // Run initial iteration
  try {
    await runWorkerIteration(10);
  } catch (err) {
    logger.error({ err }, "Error during initial worker run");
  }

  // Scheduled periodic timer
  const timer = setInterval(async () => {
    try {
      await runWorkerIteration(10);
    } catch (err) {
      logger.error({ err }, "Error during scheduled worker run");
    }
  }, intervalMs);

  const handleShutdown = async (signal: string) => {
    logger.info({ signal }, "Stopping worker...");
    clearInterval(timer);
    await closeDbPool();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

if (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js")) {
  main().catch((err) => {
    logger.error({ err }, "Fatal worker crash");
    process.exit(1);
  });
}
