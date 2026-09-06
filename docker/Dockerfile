# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Dependencies stage
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/common/package.json ./packages/common/
COPY packages/observability/package.json ./packages/observability/
COPY packages/db/package.json ./packages/db/
COPY packages/source-storage/package.json ./packages/source-storage/
COPY packages/canonicalization/package.json ./packages/canonicalization/
COPY packages/parser/package.json ./packages/parser/
COPY packages/ingestion/package.json ./packages/ingestion/
COPY packages/verification/package.json ./packages/verification/
COPY packages/legal-state/package.json ./packages/legal-state/
COPY packages/search/package.json ./packages/search/
COPY packages/legal-query/package.json ./packages/legal-query/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

# Build stage
FROM dependencies AS build
COPY tsconfig.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm run build

# MCP Server Runner
FROM base AS mcp-server
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
CMD ["node", "apps/mcp-server/dist/index.js"]

# Worker Runner
FROM base AS worker
WORKDIR /app
COPY --from=build /app ./
CMD ["node", "apps/worker/dist/index.js"]
