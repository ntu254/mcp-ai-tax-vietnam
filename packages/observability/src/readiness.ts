export interface ReadinessDiagnostic {
  status: "ready" | "degraded" | "unhealthy";
  database: "ok" | "failed";
  database_latency_ms?: number;
  migrations_applied_count?: number;
  object_storage: "ok" | "failed";
  object_storage_error?: string;
  congbao_last_success: string | null;
  ingestion_stale: boolean;
  warnings: string[];
  evaluated_at: string;
}

export interface ReadinessCheckers {
  checkDb: () => Promise<{
    ok: boolean;
    latencyMs?: number;
    migrationsCount?: number;
    error?: string;
  }>;
  checkStorage: () => Promise<{ ok: boolean; error?: string }>;
  getLastCheckpoint: (
    sourceName: string
  ) => Promise<{ lastSuccessAt?: Date | null } | null>;
}

export async function evaluateSystemReadiness(
  checkers: ReadinessCheckers,
  staleThresholdHours = 24
): Promise<ReadinessDiagnostic> {
  const warnings: string[] = [];
  const evaluatedAt = new Date().toISOString();

  // 1. Check Database
  const dbHealth = await checkers.checkDb();
  const dbStatus = dbHealth.ok ? "ok" : "failed";
  if (!dbHealth.ok) {
    warnings.push(`Database check failed: ${dbHealth.error ?? "Unknown error"}`);
  }

  // 2. Check Object Storage
  const storageHealth = await checkers.checkStorage();
  const storageStatus = storageHealth.ok ? "ok" : "failed";
  if (!storageHealth.ok) {
    warnings.push(
      `Object storage check failed: ${storageHealth.error ?? "Unknown error"}`
    );
  }

  // 3. Check Checkpoint Staleness
  let congbaoLastSuccess: string | null = null;
  let ingestionStale = false;

  try {
    const cp = await checkers.getLastCheckpoint("congbao");
    if (cp?.lastSuccessAt) {
      congbaoLastSuccess = cp.lastSuccessAt.toISOString();
      const ageHours =
        (Date.now() - cp.lastSuccessAt.getTime()) / (1000 * 60 * 60);

      if (ageHours > staleThresholdHours) {
        ingestionStale = true;
        warnings.push(
          `Ingestion checkpoint is stale (${ageHours.toFixed(1)}h > threshold ${staleThresholdHours}h)`
        );
      }
    } else {
      ingestionStale = true;
      warnings.push("No successful ingestion checkpoint recorded yet for congbao.");
    }
  } catch (cpErr: unknown) {
    ingestionStale = true;
    const msg = cpErr instanceof Error ? cpErr.message : String(cpErr);
    warnings.push(`Failed to verify ingestion checkpoint: ${msg}`);
  }

  // Determine overall status
  let status: ReadinessDiagnostic["status"] = "ready";
  if (dbStatus === "failed") {
    status = "unhealthy";
  } else if (storageStatus === "failed" || ingestionStale) {
    status = "degraded";
  }

  return {
    status,
    database: dbStatus,
    database_latency_ms: dbHealth.latencyMs,
    migrations_applied_count: dbHealth.migrationsCount,
    object_storage: storageStatus,
    object_storage_error: storageHealth.error,
    congbao_last_success: congbaoLastSuccess,
    ingestion_stale: ingestionStale,
    warnings,
    evaluated_at: evaluatedAt,
  };
}
