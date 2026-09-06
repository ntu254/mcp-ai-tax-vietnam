import pino from "pino";

const logLevel = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export interface LogContext {
  module?: string;
  document_id?: string;
  source_id?: string;
  snapshot_id?: string;
  action?: string;
  [key: string]: unknown;
}

export function createChildLogger(bindings: LogContext) {
  return logger.child(bindings);
}
