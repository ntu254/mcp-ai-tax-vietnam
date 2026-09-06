import "dotenv/config";
import { eq } from "drizzle-orm";
import {
  DatabaseInstance,
  closeDbPool,
  documentTopics,
  getDb,
  legalDocuments,
  legalEvents,
  legalProvisions,
} from "@vietnam-tax/db";
import {
  CheckpointManager,
  CongBaoConnector,
  IngestionPipeline,
} from "@vietnam-tax/ingestion";
import {
  buildCanonicalId,
  DeduplicationEngine,
  normalizeDocumentNumber,
} from "@vietnam-tax/canonicalization";
import {
  EvidenceCollector,
  extractDocumentRelationships,
  parseDocumentMetadata,
  parseLegalProvisions,
} from "@vietnam-tax/parser";
import { logger } from "@vietnam-tax/observability";
import { ObjectStorageService, SnapshotManager } from "@vietnam-tax/source-storage";
import { VerificationEngine } from "@vietnam-tax/verification";
async function processIngestedItem(
  db: DatabaseInstance,
  item: {
    documentSourceId: string;
    snapshotId: string;
    html?: string;
    discovered: {
      title: string;
      documentNumber?: string;
      publicationDate?: string;
    };
  }
) {
  const textContent = item.html ?? item.discovered.title;
  const parsedMeta = parseDocumentMetadata(item.discovered.title, textContent);
  const provisions = parseLegalProvisions(textContent);
  const relationships = extractDocumentRelationships(textContent);

  const dedupeEngine = new DeduplicationEngine(db);
  const dedupeRes = await dedupeEngine.findExistingDocument({
    documentNumber: parsedMeta.documentNumber,
    title: parsedMeta.title,
    issuedDate: parsedMeta.issuedDate,
  });

  let documentId: string;

  if (dedupeRes.isDuplicate && dedupeRes.matchedDocumentId) {
    documentId = dedupeRes.matchedDocumentId;
    logger.info(
      { matchedDocumentId: documentId, signals: dedupeRes.matchSignals },
      "Item matched existing canonical document"
    );
  } else {
    documentId = crypto.randomUUID();
    const { canonicalId, canonicalStatus } = buildCanonicalId({
      documentType: parsedMeta.documentType,
      documentNumber: parsedMeta.documentNumber,
      issuedDate: parsedMeta.issuedDate,
    });

    const now = new Date();

    await db.insert(legalDocuments).values({
      id: documentId,
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
      raw_text: textContent.slice(0, 50000), // safety bound
      source_count: 1,
      created_at: now,
      updated_at: now,
    });

    // Insert topics
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

    // Insert provisions
    const insertedProvisions: Array<{
      id: string;
      parsed: (typeof provisions)[number];
    }> = [];

    for (const prov of provisions) {
      const pId = crypto.randomUUID();
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

    // Collect snapshot evidence
    const evidenceCollector = new EvidenceCollector(db);
    await evidenceCollector.recordDocumentEvidence({
      documentId,
      sourceSnapshotId: item.snapshotId,
      metadata: parsedMeta,
      provisions: insertedProvisions,
    });

    // Record publication legal event
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

    // Run verification engine
    const verificationEngine = new VerificationEngine(db);
    await verificationEngine.verifyDocument(documentId);
  }
}

async function runWorkerIteration() {
  const db = getDb();
  const storage = new ObjectStorageService();
  await storage.ensureBucket();

  const snapshotManager = new SnapshotManager(db, storage);
  const checkpointManager = new CheckpointManager(db);
  const pipeline = new IngestionPipeline(db, checkpointManager, snapshotManager);
  const connector = new CongBaoConnector();

  logger.info("Worker polling Công Báo RSS feed...");
  const ingestedItems = await pipeline.runConnector(connector, { limit: 10 });

  for (const item of ingestedItems) {
    try {
      await processIngestedItem(db, item);
    } catch (processErr) {
      logger.error(
        { title: item.discovered.title, err: processErr },
        "Error processing ingested item"
      );
    }
  }

  logger.info(
    { count: ingestedItems.length },
    "Worker finished iteration processing"
  );
}

async function main() {
  logger.info("Starting Vietnam Tax & Legal MCP ingestion worker...");

  const intervalMinutes =
    Number(process.env.INGESTION_INTERVAL_MINUTES) || 15;
  const intervalMs = intervalMinutes * 60 * 1000;

  // Run immediately once
  try {
    await runWorkerIteration();
  } catch (err) {
    logger.error({ err }, "Error during initial worker run");
  }

  // Periodic loop
  const timer = setInterval(async () => {
    try {
      await runWorkerIteration();
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
