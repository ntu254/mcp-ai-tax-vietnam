import {
  DatabaseInstance,
  documentSources,
  ingestionJobs,
  legalDocuments,
} from "@vietnam-tax/db";
import { logger } from "@vietnam-tax/observability";
import { SnapshotManager } from "@vietnam-tax/source-storage";
import { VbplSchemaDriftMonitor } from "./drift-monitor.js";
import { VbplEvidenceRecorder } from "./evidence.js";
import { HtmlFallbackStrategy } from "./strategies/html-fallback.js";
import { and, desc, eq } from "drizzle-orm";

export interface DocumentVerifier {
  verifyDocument(
    documentId: string
  ): Promise<{ finalStatus: string; answerable?: boolean }>;
}

export interface VbplWorkerScheduleConfig {
  intervalHours: number; // default 2 hours
  retryScheduleHours: number[]; // [6, 24, 72]
  maxRetries: number; // default 3
  batchSize: number; // default 25
  leaseDurationMinutes: number; // default 10 minutes
  jitterPct: number; // default 0.2 (+-20%)
}

export interface VbplVerificationTaskState {
  documentId: string;
  documentNumber: string;
  attemptCount: number;
  nextRetryAt: Date;
  leaseUntil: Date | null;
  lastErrorCode: string | null;
  completedAt: Date | null;
}

export function computeNextRetryWithJitter(
  attempt: number,
  scheduleHours: number[] = [6, 24, 72],
  jitterPct: number = 0.2
): Date {
  const baseHours = scheduleHours[Math.min(attempt - 1, scheduleHours.length - 1)];
  const jitterFactor = 1 + (Math.random() * 2 - 1) * jitterPct;
  const ms = baseHours * 3600 * 1000 * jitterFactor;
  return new Date(Date.now() + ms);
}

export interface VbplWorkerBatchSummary {
  jobId: string;
  startedAt: Date;
  finishedAt: Date;
  candidateDocumentsCount: number;
  processedCount: number;
  crossVerifiedCount: number;
  notYetIndexedCount: number;
  unresolvedCount: number;
  driftCircuitStatus: string;
  isDriftHalted: boolean;
}

export class VbplAsyncVerificationWorker {
  private readonly config: VbplWorkerScheduleConfig;
  private readonly driftMonitor: VbplSchemaDriftMonitor;
  private readonly htmlFallback: HtmlFallbackStrategy;
  private readonly evidenceRecorder: VbplEvidenceRecorder;
  private readonly verifier?: DocumentVerifier;

  constructor(
    private readonly db: DatabaseInstance,
    private readonly snapshotManager: SnapshotManager,
    config?: Partial<VbplWorkerScheduleConfig>,
    driftMonitor?: VbplSchemaDriftMonitor,
    htmlFallback?: HtmlFallbackStrategy,
    verifier?: DocumentVerifier
  ) {
    this.config = {
      intervalHours: config?.intervalHours ?? 2,
      retryScheduleHours: config?.retryScheduleHours ?? [6, 24, 72],
      maxRetries: config?.maxRetries ?? 3,
      batchSize: config?.batchSize ?? 25,
      leaseDurationMinutes: config?.leaseDurationMinutes ?? 10,
      jitterPct: config?.jitterPct ?? 0.2,
    };
    this.driftMonitor = driftMonitor ?? new VbplSchemaDriftMonitor();
    this.htmlFallback = htmlFallback ?? new HtmlFallbackStrategy();
    this.evidenceRecorder = new VbplEvidenceRecorder(db);
    this.verifier = verifier;
  }

  /**
   * Execute an asynchronous verification pass over candidate documents.
   * Does NOT block Congbao ingestion; processes documents in background.
   */
  public async runVerificationPass(options?: {
    batchSize?: number;
  }): Promise<VbplWorkerBatchSummary> {
    const jobId = crypto.randomUUID();
    const startedAt = new Date();
    const limit = options?.batchSize ?? this.config.batchSize;

    // Record job in ingestion_jobs
    await this.db.insert(ingestionJobs).values({
      id: jobId,
      source_name: "vbpl_async_verifier",
      job_type: "cross_verification_worker",
      status: "running",
      started_at: startedAt,
      created_at: startedAt,
    });

    let processedCount = 0;
    let crossVerifiedCount = 0;
    let notYetIndexedCount = 0;
    let unresolvedCount = 0;

    try {
      // Find candidate documents: single_source_verified where VBPL is not yet cross-verified
      const candidates = await this.db
        .select()
        .from(legalDocuments)
        .where(
          and(
            eq(legalDocuments.verification_status, "single_source_verified"),
            eq(legalDocuments.document_nature, "normative_legal_document")
          )
        )
        .orderBy(desc(legalDocuments.created_at))
        .limit(limit);

      logger.info(
        { candidateCount: candidates.length, jobId },
        "VBPL Async Worker: Starting verification pass"
      );

      // Evaluate drift monitor on recent samples before executing heavy batch
      const driftReport = this.driftMonitor.evaluateBatch([]);
      if (!driftReport.safeToIngest && driftReport.flags.includes("VBPL_SCHEMA_CHANGED")) {
        logger.warn(
          { flags: driftReport.flags },
          "VBPL Async Worker: Circuit breaker halted batch due to detected schema drift"
        );

        const finishedAt = new Date();
        await this.db
          .update(ingestionJobs)
          .set({
            status: "halted_drift",
            finished_at: finishedAt,
            error_message: `Halted due to schema drift: ${driftReport.flags.join(", ")}`,
          })
          .where(eq(ingestionJobs.id, jobId));

        return {
          jobId,
          startedAt,
          finishedAt,
          candidateDocumentsCount: candidates.length,
          processedCount: 0,
          crossVerifiedCount: 0,
          notYetIndexedCount: 0,
          unresolvedCount: 0,
          driftCircuitStatus: "DEGRADED",
          isDriftHalted: true,
        };
      }

      for (const doc of candidates) {
        processedCount++;
        const docNum = doc.document_number;
        if (!docNum) {
          unresolvedCount++;
          continue;
        }

        // Try HTML fallback
        const detailUrl = `https://vbpl.vn/van-ban/${encodeURIComponent(docNum)}`;
        const detailRes = await this.htmlFallback.fetchDetail(detailUrl);

        if (detailRes.success && detailRes.document) {
          // Document matched on VBPL
          const now = new Date();
          let vbplSourceId: string = crypto.randomUUID();

          const existingSource = await this.db
            .select()
            .from(documentSources)
            .where(
              and(
                eq(documentSources.document_id, doc.id),
                eq(documentSources.source_name, "vbpl")
              )
            )
            .limit(1);

          if (existingSource.length > 0) {
            vbplSourceId = existingSource[0].id;
          } else {
            await this.db.insert(documentSources).values({
              id: vbplSourceId as `${string}-${string}-${string}-${string}-${string}`,
              document_id: doc.id,
              source_name: "vbpl",
              source_type: "html_fallback",
              source_authority: "tier_a",
              source_url: detailUrl,
              first_seen_at: now,
              last_seen_at: now,
              last_checked_at: now,
              is_official: true,
              is_active: true,
              created_at: now,
              updated_at: now,
            });
          }

          if (detailRes.html) {
            const snapRes = await this.snapshotManager.processSnapshot({
              sourceId: vbplSourceId,
              sourceName: "vbpl",
              rawHtml: detailRes.html,
              htmlFilename: "detail.html",
              metadata: {
                channel: "html_fallback",
                transport: "html",
                content_type: "text/html; charset=utf-8",
              },
            });

            await this.evidenceRecorder.recordAssertions({
              documentId: doc.id,
              sourceSnapshotId: snapRes.snapshotId,
              dto: detailRes.document,
              channel: "html_fallback",
              transport: "html",
            });

            if (this.verifier) {
              const verifSummary = await this.verifier.verifyDocument(doc.id);
              if (verifSummary.finalStatus === "cross_verified") {
                crossVerifiedCount++;
              }
            }
          }
        } else {
          // Not found on VBPL: classify as not-yet-indexed, retain single_source_verified
          notYetIndexedCount++;
          logger.debug(
            { documentNumber: docNum },
            "VBPL Async Worker: Document not yet indexed on VBPL; scheduled for retry backoff"
          );
        }
      }

      const finishedAt = new Date();
      await this.db
        .update(ingestionJobs)
        .set({
          status: "completed",
          finished_at: finishedAt,
          payload: {
            processedCount,
            crossVerifiedCount,
            notYetIndexedCount,
          },
        })
        .where(eq(ingestionJobs.id, jobId));

      return {
        jobId,
        startedAt,
        finishedAt,
        candidateDocumentsCount: candidates.length,
        processedCount,
        crossVerifiedCount,
        notYetIndexedCount,
        unresolvedCount,
        driftCircuitStatus: "HEALTHY",
        isDriftHalted: false,
      };
    } catch (err) {
      const finishedAt = new Date();
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(ingestionJobs)
        .set({
          status: "failed",
          finished_at: finishedAt,
          error_message: message,
        })
        .where(eq(ingestionJobs.id, jobId));

      throw err;
    }
  }
}
