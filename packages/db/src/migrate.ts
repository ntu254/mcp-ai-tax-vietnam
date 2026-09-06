import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDbPool, closeDbPool } from "./client.js";
import { logger } from "@vietnam-tax/observability";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations(): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    logger.info("Running database migrations...");
    await client.query("BEGIN");

    // Ensure migration tracker table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = join(__dirname, "../../../migrations");
    let sqlFiles: string[] = [];

    try {
      sqlFiles = readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();
    } catch {
      logger.warn(`Migrations directory not found at ${migrationsDir}`);
    }

    for (const file of sqlFiles) {
      const res = await client.query(
        "SELECT version FROM _schema_migrations WHERE version = $1",
        [file]
      );

      if (res.rows.length === 0) {
        logger.info(`Applying migration: ${file}`);
        const sql = readFileSync(join(migrationsDir, file), "utf-8");
        await client.query(sql);
        await client.query(
          "INSERT INTO _schema_migrations (version) VALUES ($1)",
          [file]
        );
        logger.info(`Applied migration: ${file}`);
      } else {
        logger.debug(`Migration already applied: ${file}`);
      }
    }

    await client.query("COMMIT");
    logger.info("Database migrations completed successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Migration failed, rolled back");
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct execution
if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => closeDbPool())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
