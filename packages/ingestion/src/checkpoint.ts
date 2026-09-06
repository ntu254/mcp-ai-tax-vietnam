import { eq } from "drizzle-orm";
import { DatabaseInstance, sourceCheckpoints } from "@vietnam-tax/db";
import { SourceCheckpoint } from "@vietnam-tax/common";
import { logger } from "@vietnam-tax/observability";

export class CheckpointManager {
  constructor(private readonly db: DatabaseInstance) {}

  public async getCheckpoint(
    sourceName: string
  ): Promise<SourceCheckpoint | null> {
    const rows = await this.db
      .select()
      .from(sourceCheckpoints)
      .where(eq(sourceCheckpoints.source_name, sourceName))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      source_name: row.source_name,
      last_success_at: row.last_success_at,
      last_item_id: row.last_item_id,
      last_item_publication_date: row.last_item_publication_date,
      last_full_backfill_at: row.last_full_backfill_at,
      last_reconciliation_at: row.last_reconciliation_at,
      updated_at: row.updated_at,
    };
  }

  public async updateSuccess(
    sourceName: string,
    lastItemId?: string,
    lastPublicationDate?: Date
  ): Promise<void> {
    const now = new Date();
    const existing = await this.getCheckpoint(sourceName);

    if (existing) {
      await this.db
        .update(sourceCheckpoints)
        .set({
          last_success_at: now,
          last_item_id: lastItemId ?? existing.last_item_id,
          last_item_publication_date:
            lastPublicationDate ?? existing.last_item_publication_date,
          updated_at: now,
        })
        .where(eq(sourceCheckpoints.source_name, sourceName));
    } else {
      await this.db.insert(sourceCheckpoints).values({
        source_name: sourceName,
        last_success_at: now,
        last_item_id: lastItemId,
        last_item_publication_date: lastPublicationDate,
        updated_at: now,
      });
    }

    logger.debug({ sourceName, lastItemId }, "Updated source checkpoint");
  }

  public async recordBackfill(sourceName: string): Promise<void> {
    const now = new Date();
    const existing = await this.getCheckpoint(sourceName);

    if (existing) {
      await this.db
        .update(sourceCheckpoints)
        .set({
          last_full_backfill_at: now,
          updated_at: now,
        })
        .where(eq(sourceCheckpoints.source_name, sourceName));
    } else {
      await this.db.insert(sourceCheckpoints).values({
        source_name: sourceName,
        last_full_backfill_at: now,
        updated_at: now,
      });
    }
  }

  public async recordReconciliation(sourceName: string): Promise<void> {
    const now = new Date();
    const existing = await this.getCheckpoint(sourceName);

    if (existing) {
      await this.db
        .update(sourceCheckpoints)
        .set({
          last_reconciliation_at: now,
          updated_at: now,
        })
        .where(eq(sourceCheckpoints.source_name, sourceName));
    } else {
      await this.db.insert(sourceCheckpoints).values({
        source_name: sourceName,
        last_reconciliation_at: now,
        updated_at: now,
      });
    }
  }
}
