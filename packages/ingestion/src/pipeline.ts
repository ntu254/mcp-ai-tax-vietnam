import { and, eq } from "drizzle-orm";
import {
  DatabaseInstance,
  documentSources,
  ingestionJobs,
  legalDocuments,
} from "@vietnam-tax/db";
import { logger } from "@vietnam-tax/observability";
import { SnapshotManager } from "@vietnam-tax/source-storage";
import { CheckpointManager } from "./checkpoint.js";
import { DiscoveredItem, SourceConnector } from "./connector.js";

export interface PipelineRunOptions {
  limit?: number;
  forceRecheck?: boolean;
}

export interface IngestionResultItem {
  discovered: DiscoveredItem;
  documentId: string;
  documentSourceId: string;
  snapshotId: string;
  isNewSnapshot: boolean;
  html?: string;
  binary?: Buffer;
}

export class IngestionPipeline {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly checkpointManager: CheckpointManager,
    private readonly snapshotManager: SnapshotManager
  ) {}

  public async runConnector(
    connector: SourceConnector,
    options?: PipelineRunOptions
  ): Promise<IngestionResultItem[]> {
    const sourceName = connector.sourceName;
    const jobId = crypto.randomUUID();
    const now = new Date();

    // Record job start
    await this.db.insert(ingestionJobs).values({
      id: jobId,
      source_name: sourceName,
      job_type: "rss",
      status: "running",
      started_at: now,
      created_at: now,
    });

    const results: IngestionResultItem[] = [];

    try {
      const checkpoint = await this.checkpointManager.getCheckpoint(sourceName);
      const items = await connector.pollRecent({ limit: options?.limit });

      logger.info(
        { sourceName, itemsCount: items.length },
        "Processing discovered items"
      );

      let latestProcessedPubDate: Date | undefined;
      let latestProcessedId: string | undefined;

      for (const item of items) {
        // Checkpoint filter: if publicationDate is older than checkpoint and not forceRecheck
        if (
          !options?.forceRecheck &&
          checkpoint?.last_item_publication_date &&
          item.publicationDate &&
          new Date(item.publicationDate) <
            new Date(checkpoint.last_item_publication_date)
        ) {
          logger.debug(
            { title: item.title },
            "Skipping item older than checkpoint"
          );
          continue;
        }

        // Find or create document_sources record
        const existingSources = await this.db
          .select()
          .from(documentSources)
          .where(
            and(
              eq(documentSources.source_name, item.sourceName),
              eq(documentSources.source_url, item.sourceUrl)
            )
          )
          .limit(1);

        let sourceId: string;
        let documentId: string;

        if (existingSources.length > 0) {
          sourceId = existingSources[0].id;
          documentId = existingSources[0].document_id;
        } else {
          // Create stub legal document if not existing yet (will be populated by parser)
          documentId = crypto.randomUUID();
          await this.db.insert(legalDocuments).values({
            id: documentId,
            canonical_status: "unresolved",
            document_type: "other",
            document_nature: "other",
            title: item.title,
            document_number: item.documentNumber,
            publication_date: item.publicationDate,
            verification_status: "unverified",
            language: "vi",
            source_count: 1,
            created_at: now,
            updated_at: now,
          });

          sourceId = crypto.randomUUID();
          await this.db.insert(documentSources).values({
            id: sourceId,
            document_id: documentId,
            source_name: item.sourceName,
            source_type: "rss",
            source_authority: item.sourceAuthority,
            source_url: item.sourceUrl,
            detail_url: item.detailUrl,
            pdf_url: item.pdfUrl,
            docx_url: item.docxUrl,
            source_document_id: item.sourceId,
            first_seen_at: now,
            last_seen_at: now,
            last_checked_at: now,
            is_official:
              item.sourceAuthority === "tier_a" ||
              item.sourceAuthority === "tier_b",
            is_active: true,
            created_at: now,
            updated_at: now,
          });
        }

        // Fetch detail and binary
        const detail = await connector.fetchDetail(item);

        // Process immutable snapshot
        const snapshotRes = await this.snapshotManager.processSnapshot({
          sourceId,
          sourceName: item.sourceName,
          rawHtml: detail.html,
          binaryBuffer: detail.binary,
          binaryFilename: detail.binaryFilename,
          metadata: item.rawPayload,
        });

        results.push({
          discovered: item,
          documentId,
          documentSourceId: sourceId,
          snapshotId: snapshotRes.snapshotId,
          isNewSnapshot: snapshotRes.isNewSnapshot,
          html: detail.html,
          binary: detail.binary,
        });
        latestProcessedId = item.sourceId;
        if (item.publicationDate) {
          const pDate = new Date(item.publicationDate);
          if (!latestProcessedPubDate || pDate > latestProcessedPubDate) {
            latestProcessedPubDate = pDate;
          }
        }
      }

      // Update checkpoint on success
      await this.checkpointManager.updateSuccess(
        sourceName,
        latestProcessedId,
        latestProcessedPubDate
      );
      await this.db
        .update(ingestionJobs)
        .set({
          status: "completed",
          finished_at: new Date(),
          payload: { items_processed: results.length },
        })
        .where(eq(ingestionJobs.id, jobId));

      logger.info(
        { sourceName, processedCount: results.length },
        "Ingestion job completed successfully"
      );
      return results;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(ingestionJobs)
        .set({
          status: "failed",
          finished_at: new Date(),
          error_message: message,
        })
        .where(eq(ingestionJobs.id, jobId));

      logger.error({ sourceName, err: message }, "Ingestion job failed");
      throw err;
    }
  }
}
