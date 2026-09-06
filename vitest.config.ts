import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@vietnam-tax/common": resolve(__dirname, "packages/common/src/index.ts"),
      "@vietnam-tax/observability": resolve(
        __dirname,
        "packages/observability/src/index.ts"
      ),
      "@vietnam-tax/db": resolve(__dirname, "packages/db/src/index.ts"),
      "@vietnam-tax/source-storage": resolve(
        __dirname,
        "packages/source-storage/src/index.ts"
      ),
      "@vietnam-tax/canonicalization": resolve(
        __dirname,
        "packages/canonicalization/src/index.ts"
      ),
      "@vietnam-tax/parser": resolve(__dirname, "packages/parser/src/index.ts"),
      "@vietnam-tax/ingestion": resolve(
        __dirname,
        "packages/ingestion/src/index.ts"
      ),
      "@vietnam-tax/verification": resolve(
        __dirname,
        "packages/verification/src/index.ts"
      ),
      "@vietnam-tax/legal-state": resolve(
        __dirname,
        "packages/legal-state/src/index.ts"
      ),
      "@vietnam-tax/search": resolve(__dirname, "packages/search/src/index.ts"),
      "@vietnam-tax/legal-query": resolve(
        __dirname,
        "packages/legal-query/src/index.ts"
      ),
    },
  },
});
