import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb, closeDbPool, checkDbHealth } from "@vietnam-tax/db";
import { logger } from "@vietnam-tax/observability";
import { createMcpServer } from "./server.js";

async function main() {
  const transportMode = process.env.MCP_TRANSPORT || "stdio";
  logger.info({ transportMode }, "Starting Vietnam Tax & Legal MCP server...");

  // Health check database connection if available
  const health = await checkDbHealth();
  if (!health.ok) {
    logger.warn(
      { error: health.error },
      "Database connection not ready yet; server will attempt queries upon request."
    );
  } else {
    logger.info({ latencyMs: health.latencyMs }, "Database connected");
  }

  const db = getDb();
  const server = createMcpServer(db);

  if (transportMode === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("Vietnam Tax & Legal MCP server running on stdio transport");
  } else {
    logger.info(
      "Configured for stdio transport by default. Additional remote HTTP transport available."
    );
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  // Graceful shutdown
  const handleShutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down MCP server...");
    try {
      await server.close();
      await closeDbPool();
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error starting MCP server");
  process.exit(1);
});
