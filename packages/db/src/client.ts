import "dotenv/config";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { logger } from "@vietnam-tax/observability";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export type DatabaseInstance = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let dbInstance: DatabaseInstance | null = null;

export function getDbPool(): pg.Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/vietnam_tax_legal";

    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err: Error) => {
      logger.error({ err }, "Unexpected error on idle database client");
    });
  }

  return pool;
}

export function getDb(): DatabaseInstance {
  if (!dbInstance) {
    dbInstance = drizzle(getDbPool(), { schema });
  }

  return dbInstance;
}

export async function checkDbHealth(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const client = await getDbPool().connect();
    try {
      await client.query("SELECT 1");
      return { ok: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
    logger.info("Database pool closed");
  }
}
