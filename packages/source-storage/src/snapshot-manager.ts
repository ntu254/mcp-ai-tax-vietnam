import { eq, and } from "drizzle-orm";
import {
  DatabaseInstance,
  documentSources,
  sourceSnapshots,
} from "@vietnam-tax/db";
import { logger, buildAuditEvent } from "@vietnam-tax/observability";
import { ObjectStorageService } from "./storage.js";
import { computeSha256 } from "./hasher.js";

export interface SaveSnapshotInput {
  sourceId: string;
  sourceName: string;
  rawHtml?: string;
  metadata?: Record<string, unknown>;
  binaryBuffer?: Buffer;
  binaryFilename?: "original.pdf" | "original.docx";
  httpStatus?: number;
  contentType?: string;
}

export interface SaveSnapshotResult {
  snapshotId: string;
  isNewSnapshot: boolean;
  pageHash?: string;
  binaryHash?: string;
  metadataHash?: string;
}

export class SnapshotManager {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly storage: ObjectStorageService
  ) {}

  public async processSnapshot(
    input: SaveSnapshotInput
  ): Promise<SaveSnapshotResult> {
    const pageHash = input.rawHtml ? computeSha256(input.rawHtml) : undefined;
    const metadataHash = input.metadata
      ? computeSha256(JSON.stringify(input.metadata))
      : undefined;
    const binaryHash = input.binaryBuffer
      ? computeSha256(input.binaryBuffer)
      : undefined;

    // Find current active snapshot for this source
    const existingSnapshots = await this.db
      .select()
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.source_id, input.sourceId),
          eq(sourceSnapshots.is_current, true)
        )
      )
      .limit(1);

    const currentSnapshot = existingSnapshots[0];

    // Check if hashes are unchanged
    if (
      currentSnapshot &&
      currentSnapshot.page_hash === (pageHash ?? currentSnapshot.page_hash) &&
      currentSnapshot.binary_hash ===
        (binaryHash ?? currentSnapshot.binary_hash) &&
      currentSnapshot.metadata_hash ===
        (metadataHash ?? currentSnapshot.metadata_hash)
    ) {
      // old hash == new hash: only update last_checked_at on source
      await this.db
        .update(documentSources)
        .set({
          last_checked_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(documentSources.id, input.sourceId));

      logger.debug(
        { sourceId: input.sourceId, snapshotId: currentSnapshot.id },
        "Source unchanged; updated last_checked_at"
      );

      return {
        snapshotId: currentSnapshot.id,
        isNewSnapshot: false,
        pageHash: currentSnapshot.page_hash ?? undefined,
        binaryHash: currentSnapshot.binary_hash ?? undefined,
        metadataHash: currentSnapshot.metadata_hash ?? undefined,
      };
    }

    // old hash != new hash (or initial snapshot): create new immutable snapshot
    const snapshotId = crypto.randomUUID();
    const now = new Date();

    let rawKey: string | undefined;
    let metadataKey: string | undefined;
    let binaryKey: string | undefined;

    if (input.rawHtml) {
      rawKey = this.storage.buildKey({
        sourceName: input.sourceName,
        sourceId: input.sourceId,
        snapshotId,
        filename: "page.html",
        date: now,
      });
      await this.storage.putObject(rawKey, input.rawHtml, "text/html; charset=utf-8");
    }

    if (input.metadata) {
      metadataKey = this.storage.buildKey({
        sourceName: input.sourceName,
        sourceId: input.sourceId,
        snapshotId,
        filename: "metadata.json",
        date: now,
      });
      await this.storage.putObject(
        metadataKey,
        JSON.stringify(input.metadata, null, 2),
        "application/json"
      );
    }

    if (input.binaryBuffer) {
      const filename = input.binaryFilename ?? "original.pdf";
      binaryKey = this.storage.buildKey({
        sourceName: input.sourceName,
        sourceId: input.sourceId,
        snapshotId,
        filename,
        date: now,
      });
      const mime = filename.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
      await this.storage.putObject(binaryKey, input.binaryBuffer, mime);
    }

    // Mark previous snapshots is_current = false
    if (currentSnapshot) {
      await this.db
        .update(sourceSnapshots)
        .set({ is_current: false })
        .where(eq(sourceSnapshots.source_id, input.sourceId));
    }

    // Insert new snapshot
    await this.db.insert(sourceSnapshots).values({
      id: snapshotId,
      source_id: input.sourceId,
      fetched_at: now,
      http_status: input.httpStatus ?? 200,
      content_type: input.contentType ?? "text/html",
      page_hash: pageHash,
      metadata_hash: metadataHash,
      binary_hash: binaryHash,
      raw_object_key: rawKey,
      metadata_object_key: metadataKey,
      binary_object_key: binaryKey,
      is_current: true,
      created_at: now,
    });

    // Update document_sources timestamps
    await this.db
      .update(documentSources)
      .set({
        last_seen_at: now,
        last_checked_at: now,
        updated_at: now,
      })
      .where(eq(documentSources.id, input.sourceId));

    buildAuditEvent({
      eventName: currentSnapshot ? "SOURCE_CHANGED" : "SOURCE_CREATED",
      entityType: "source_snapshots",
      entityId: snapshotId,
      actor: "ingestion_worker",
      details: {
        sourceId: input.sourceId,
        sourceName: input.sourceName,
        pageHash,
        binaryHash,
      },
    });

    logger.info(
      { sourceId: input.sourceId, snapshotId },
      "Created new immutable source snapshot"
    );

    return {
      snapshotId,
      isNewSnapshot: true,
      pageHash,
      binaryHash,
      metadataHash,
    };
  }
}
