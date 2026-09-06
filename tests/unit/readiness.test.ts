import { describe, expect, it } from "vitest";
import { evaluateSystemReadiness } from "@vietnam-tax/observability";

describe("System Readiness Diagnostic Evaluator", () => {
  it("returns status: ready when all dependencies are healthy and checkpoint is fresh", async () => {
    const diagnostic = await evaluateSystemReadiness({
      checkDb: async () => ({ ok: true, latencyMs: 3, migrationsCount: 1 }),
      checkStorage: async () => ({ ok: true }),
      getLastCheckpoint: async () => ({
        lastSuccessAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      }),
    });

    expect(diagnostic.status).toBe("ready");
    expect(diagnostic.database).toBe("ok");
    expect(diagnostic.object_storage).toBe("ok");
    expect(diagnostic.ingestion_stale).toBe(false);
    expect(diagnostic.warnings.length).toBe(0);
  });

  it("returns status: unhealthy when database connection fails", async () => {
    const diagnostic = await evaluateSystemReadiness({
      checkDb: async () => ({
        ok: false,
        error: "Connection refused: 5432",
      }),
      checkStorage: async () => ({ ok: true }),
      getLastCheckpoint: async () => null,
    });

    expect(diagnostic.status).toBe("unhealthy");
    expect(diagnostic.database).toBe("failed");
    expect(diagnostic.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Database check failed")])
    );
  });

  it("returns status: degraded when ingestion checkpoint is stale (>24h)", async () => {
    const diagnostic = await evaluateSystemReadiness(
      {
        checkDb: async () => ({ ok: true, latencyMs: 5 }),
        checkStorage: async () => ({ ok: true }),
        getLastCheckpoint: async () => ({
          lastSuccessAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
        }),
      },
      24 // 24h threshold
    );

    expect(diagnostic.status).toBe("degraded");
    expect(diagnostic.ingestion_stale).toBe(true);
    expect(diagnostic.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Ingestion checkpoint is stale"),
      ])
    );
  });
});
