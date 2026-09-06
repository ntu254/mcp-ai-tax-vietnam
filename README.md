# Vietnam Tax & Legal MCP Server

> Production-Grade Legal and Tax Retrieval Infrastructure for AI Agents  
> **Jurisdiction:** Vietnam (`Asia/Ho_Chi_Minh`)  
> **Target Domains:** Thuế (VAT, CIT, PIT, FCT...), Kế toán, Hóa đơn điện tử, Quản lý thuế, Doanh nghiệp & Hải quan.  
> **Specification:** v1.1 Practical / Consistent

---

## 1. Core Safety Invariants

This system is built around strict legal data invariants:

```text
draft != effective
issued != effective
latest != currently applicable
semantic similarity != legal authority
LLM inference != legal evidence
document-level validity != every provision validity
source authority != legal/instrument authority
```

If the system cannot prove a legal conclusion with verified official snapshot evidence:
```text
answerable = false
```

---

## 2. Architecture & Components

```text
                       OFFICIAL SOURCES
                (Công báo CP, VBPL, Bộ Tài chính...)
                               │
                               ▼
               packages/ingestion (Connectors + Checkpoints)
                               │
                               ▼
               packages/source-storage (MinIO / S3 Immutable Snapshots)
                               │
                               ▼
               packages/parser (Metadata + Điều/Khoản + Evidence)
                               │
                               ▼
               packages/canonicalization (Deduplication + Canonical ID)
                               │
                               ▼
               packages/verification (Rules A, B, C, D + Conflict Checks)
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
      packages/legal-state             packages/search
   status_at(document/provision, date)    Exact + PostgreSQL FTS
              │                                 │
              └────────────────┬────────────────┘
                               ▼
                    packages/legal-query
                               │
                               ▼
                      apps/mcp-server
                    (stdio / streamable HTTP)
                               │
                               ▼
                           AI Agent
```

---

## 3. The 4 MCP Legal Tools (MVP)

| Tool | Purpose | Key Input |
|---|---|---|
| `latest_tax_updates` | Retrieve recent legal events and status changes (published, effective, amended, repealed) | `topic`, `days`, `event_types`, `limit` |
| `search_legal_docs` | Search legal documents by keywords, document number, issuer, and tax topics | `query`, `document_number`, `topics` |
| `get_legal_document` | Retrieve full canonical details (provisions, sources, snapshots, relationships) | `document_id` (UUID or Canonical ID) |
| `get_effective_tax_rules` | Retrieve effective rules & official guidance evaluated at `effective_at` (Asia/Ho_Chi_Minh) | `query`, `effective_at`, `topics`, `include_official_guidance` |

---

## 4. Repository Structure

```text
mcp-ai-tax/
├── apps/
│   ├── mcp-server/          # MCP Server (stdio / HTTP)
│   └── worker/              # Periodic Ingestion Worker
│
├── packages/
│   ├── common/              # Taxonomies, Types, Result Contracts, Errors
│   ├── observability/       # Structured logger (pino) & Audit trail
│   ├── db/                  # Drizzle ORM Schema (13 tables) & PostgreSQL Client
│   ├── source-storage/      # S3/MinIO Client, Hasher (SHA-256), Snapshot Manager
│   ├── canonicalization/    # Canonical ID (VN:ND:...) & Deduplication Engine
│   ├── parser/              # Metadata & Provisions (Điều/Khoản) & Evidence
│   ├── ingestion/           # Source Connectors (Công báo RSS), Checkpoints
│   ├── verification/        # Verification Engine (Rules A, B, C, D)
│   ├── legal-state/         # Temporal Legal State Engine (status_at)
│   ├── search/              # Exact number match & PostgreSQL FTS
│   └── legal-query/         # Core Query Orchestration Service
│
├── migrations/              # Initial SQL Migrations
├── tests/
│   ├── golden/              # Acceptance Golden Scenarios
│   └── unit/                # Unit Tests (Parser, Verification, Canonicalization)
│
├── docker/                  # Multi-stage Dockerfile
├── docker-compose.yml       # PostgreSQL 17, MinIO, MCP Server & Worker
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

---

## 5. Getting Started

### Prerequisites
- Node.js 20+
- pnpm 10+
- Docker & Docker Compose

### Local Development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Run tests:**
   ```bash
   pnpm test
   ```

3. **Start infrastructure via Docker Compose:**
   ```bash
   docker compose up -d postgres minio
   ```

4. **Run migrations:**
   ```bash
   pnpm db:migrate
   ```

5. **Start MCP Server locally (stdio mode):**
   ```bash
   pnpm mcp
   ```

---

## 6. License
Internal / Proprietary production specification.
