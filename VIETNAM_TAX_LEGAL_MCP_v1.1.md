# VIETNAM TAX & LEGAL MCP

## Production Build Specification v1.1 — Practical / Consistent

**Document status:** Build-ready  
**Target:** Production-grade legal/tax retrieval infrastructure for AI Agents  
**Primary jurisdiction:** Việt Nam  
**Primary domains:** Thuế, kế toán, hóa đơn, quản lý thuế, doanh nghiệp, hải quan và văn bản pháp luật liên quan  
**Reference date:** 06/09/2026  
**Default legal timezone:** `Asia/Ho_Chi_Minh`

---

# 1. PRODUCT OBJECTIVE

Xây dựng một hệ thống dữ liệu pháp luật và thuế Việt Nam cho AI Agent có khả năng:

- phát hiện văn bản/chính sách mới từ nguồn chính thức;
- lưu bản nguồn bất biến để audit;
- chuẩn hóa metadata pháp lý;
- xác định văn bản/điều khoản áp dụng tại một ngày cụ thể;
- phân biệt văn bản đã ban hành, chưa hiệu lực, đang hiệu lực, bị đình chỉ, hết hiệu lực, bị bãi bỏ;
- phân biệt văn bản quy phạm pháp luật với công văn/hướng dẫn/dự thảo;
- truy vết từng kết luận về nguồn và snapshot cụ thể;
- phát hiện xung đột nguồn;
- từ chối kết luận khi bằng chứng không đủ;
- expose dữ liệu qua MCP cho AI Agent.

Hệ thống **không coi LLM là nguồn xác định hiệu lực pháp lý**.

Core principles:

> No legal claim without evidence.

> No effective-law answer without temporal verification.

> No draft or proposal may be presented as effective law.

> Legal status is evaluated at a date; it is not an immutable document property.

---

# 2. CORE SAFETY INVARIANTS

Các invariant sau không được phá ở bất kỳ layer nào:

```text
draft != effective
issued != effective
latest != currently applicable
semantic similarity != legal authority
LLM inference != legal evidence
document-level validity != every provision validity
source authority != legal/instrument authority
```

Nếu hệ thống không chứng minh được một kết luận pháp lý bằng evidence đủ mạnh:

```text
answerable = false
```

---

# 3. NON-GOALS — PHASE 1

MVP không nhằm:

- thay thế luật sư/chuyên gia thuế;
- crawl toàn bộ Internet;
- dùng báo chí làm nguồn xác định hiệu lực;
- dùng vector similarity để quyết định văn bản có hiệu lực;
- dùng LLM để tự suy luận `legal_status`;
- xây graph database riêng;
- xây microservices phức tạp;
- OCR toàn bộ corpus;
- hỗ trợ đầy đủ mọi quan hệ pháp lý hiếm gặp;
- cung cấp legal advice tự động không có căn cứ;
- lưu dữ liệu thuế cá nhân/doanh nghiệp riêng tư trong public legal corpus.

---

# 4. TARGET ARCHITECTURE

```text
                        OFFICIAL SOURCES
                               │
               ┌───────────────┼────────────────┐
               │               │                │
               ▼               ▼                ▼
         Công báo CP          VBPL       Chính phủ/Bộ/Ngành
               │               │                │
               └───────────────┴────────────────┘
                               │
                               ▼
                     Source Connectors
                     RSS / HTML / PDF / DOCX
                               │
                               ▼
                    Immutable Source Store
                     + source snapshots
                               │
                               ▼
                         Legal Parser
                     metadata + provisions
                               │
                               ▼
                      Canonicalization
                               │
                               ▼
                     Verification Engine
                    evidence + conflict check
                               │
                  ┌────────────┴─────────────┐
                  │                          │
                  ▼                          ▼
           Legal State Engine          Search Index
           status_at(date)         Exact + FTS + optional vector
                  │                          │
                  └────────────┬─────────────┘
                               ▼
                       Legal Query Layer
                               │
                               ▼
                         MCP Server
                               │
                               ▼
                         AI Agent
```

MCP là **controlled retrieval interface**, không phải nơi chứa business logic pháp lý chính.

---

# 5. OFFICIAL DATA SOURCES

## 5.1 Tier A — Primary authority

### A1. Công báo điện tử Chính phủ

Use cases:

- phát hiện văn bản mới;
- ngày đăng Công báo;
- metadata;
- file chính thức;
- số Công báo;
- ngày ban hành/ngày hiệu lực khi nguồn thể hiện;
- nguồn evidence mạnh.

RSS dùng cho incremental discovery, **không dùng RSS như cơ chế duy nhất để đảm bảo coverage**.

### A2. Cơ sở dữ liệu quốc gia về văn bản pháp luật / VBPL

Use cases:

- kiểm tra tình trạng hiệu lực;
- lịch sử;
- loại văn bản;
- cơ quan ban hành;
- quan hệ sửa đổi/thay thế/bãi bỏ;
- cross-verification.

## 5.2 Tier B — Issuing authority / official government source

Ví dụ:

- `vanban.chinhphu.vn`;
- Bộ Tài chính;
- cơ quan Thuế;
- Hải quan;
- Bộ Tư pháp;
- cơ quan trực tiếp ban hành văn bản.

Use cases:

- bản ký;
- metadata bổ sung;
- hướng dẫn;
- công văn;
- tài liệu triển khai;
- cross-verification.

## 5.3 Tier C — Secondary legal information

Ví dụ:

- cơ sở dữ liệu pháp luật thương mại;
- website tổng hợp pháp luật có uy tín.

Chỉ dùng cho:

- discovery;
- cross-reference;
- hỗ trợ tìm văn bản bị thiếu.

Tier C **không override** kết luận đã được xác nhận từ Tier A/B.

---

# 6. TWO DIFFERENT AUTHORITY DIMENSIONS

Không được trộn hai khái niệm sau:

## 6.1 Source authority

Độ tin cậy của nơi cung cấp dữ liệu.

```text
official publication / national legal DB = highest
direct issuing authority               = very high
other government source                = high
licensed secondary source              = medium
news/media                             = low
LLM inference                          = zero
```

`source_authority` dùng cho verification/ranking/conflict handling.

## 6.2 Legal / instrument nature

Bản chất của chính tài liệu.

Controlled taxonomy:

```text
normative_legal_document
consolidated_document
implementing_document
official_guidance
administrative_document
correction
draft
proposal
consultation
other
```

Một công văn từ website chính thức có thể có `source_authority` rất cao nhưng **không vì vậy mà trở thành văn bản quy phạm pháp luật**.

`get_effective_tax_rules` mặc định ưu tiên:

```text
normative_legal_document
```

`official_guidance` có thể được trả riêng để giải thích cách cơ quan thực thi đang hướng dẫn.

---

# 7. DOCUMENT TYPE TAXONOMY

Lưu `document_type` riêng với `document_nature`.

Ví dụ:

```text
constitution
law
resolution
ordinance
decree
decision
circular
joint_circular
official_letter
dispatch
guidance
announcement
other
```

Không hard-code thứ bậc pháp lý chỉ từ chuỗi title.

---

# 8. LEGAL STATUS IS TEMPORAL

`legal_status` không phải source-of-truth bất biến trên `legal_documents`.

Status phải được tính:

```text
status_at(document/provision, effective_at)
```

Input tối thiểu:

```text
effective_from
effective_to
suspension events
repeal/replacement relationships
partial repeal relationships
transition provisions
provision-specific validity
query date
```

Evaluated status taxonomy:

```text
draft
proposed
issued_not_effective
effective
partially_effective
suspended
expired
repealed
superseded
unknown
```

Database có thể lưu cache:

```text
current_status_cached
current_status_as_of
```

nhưng cache **không phải legal source of truth**.

---

# 9. VERIFICATION STATUS

Verification status là khái niệm độc lập với legal status.

```text
unverified
single_source
cross_verified
conflicting
manual_review_required
manual_verified
rejected
```

Ví dụ:

```text
status_at(2026-09-06) = effective
verification_status   = cross_verified
```

Không trộn hai khái niệm.

---

# 10. CORE DATA MODEL — PRACTICAL MVP

MVP ưu tiên khoảng 12–15 bảng cốt lõi. Không cần graph DB riêng.

Core tables:

```text
issuers
legal_documents
document_sources
source_snapshots
legal_provisions
document_relationships
legal_evidence
legal_events
document_topics
verification_conflicts
source_checkpoints
ingestion_jobs
audit_events
```

Optional later:

```text
provision_relationships
embeddings
manual_review_tasks
```

---

# 11. `issuers`

```sql
issuers
-------
id UUID PK
name VARCHAR NOT NULL
normalized_name VARCHAR NOT NULL
issuer_type VARCHAR
parent_issuer_id UUID NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 12. `legal_documents`

```sql
legal_documents
---------------
id UUID PK
canonical_id VARCHAR UNIQUE
canonical_status VARCHAR NOT NULL DEFAULT 'resolved'

document_number VARCHAR
normalized_document_number VARCHAR

document_type VARCHAR NOT NULL
document_nature VARCHAR NOT NULL

title TEXT NOT NULL
summary TEXT NULL

issuer_id UUID NULL
issuer_name VARCHAR

issued_date DATE NULL
publication_date DATE NULL
default_effective_from DATE NULL
default_effective_to DATE NULL

verification_status VARCHAR NOT NULL

current_status_cached VARCHAR NULL
current_status_as_of DATE NULL

language VARCHAR NOT NULL DEFAULT 'vi'

raw_text TEXT NULL
normalized_text TEXT NULL
normalized_text_hash VARCHAR NULL

source_count INT NOT NULL DEFAULT 0

created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
last_verified_at TIMESTAMPTZ NULL
```

Important:

- `current_status_cached` chỉ là cache;
- `default_effective_*` là document-level default, không override validity riêng của provision;
- `summary` là derived data, không phải legal source.

---

# 13. CANONICAL IDENTIFIER

Không dùng URL làm ID.

Primary DB identity:

```text
UUID
```

Canonical external identifier khi resolve được:

```text
VN:{document_type}:{year}:{normalized_number}:{issuer_code?}
```

Ví dụ:

```text
VN:TT:2026:110-TT-BTC
VN:ND:2026:123-ND-CP
```

Nếu identity chưa chắc chắn:

```text
canonical_id = generated opaque identifier
canonical_status = unresolved
```

Duplicate detection dùng nhiều tín hiệu:

```text
normalized_document_number
issuer
issued_date
title fingerprint
file hash
```

Không merge nếu evidence còn conflict.

---

# 14. `document_sources`

Một canonical document có thể có nhiều nguồn.

```sql
document_sources
----------------
id UUID PK
document_id UUID FK

source_name VARCHAR NOT NULL
source_type VARCHAR NOT NULL
source_authority VARCHAR NOT NULL

source_url TEXT NOT NULL
detail_url TEXT NULL
pdf_url TEXT NULL
docx_url TEXT NULL
source_document_id VARCHAR NULL

first_seen_at TIMESTAMPTZ NOT NULL
last_seen_at TIMESTAMPTZ NOT NULL
last_checked_at TIMESTAMPTZ NOT NULL

is_official BOOLEAN NOT NULL
is_active BOOLEAN NOT NULL DEFAULT true

created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Không lưu mutable hash trực tiếp làm evidence duy nhất tại table này.

---

# 15. `source_snapshots` — IMMUTABLE

Mỗi lần source thay đổi nội dung/hash phải tạo snapshot mới.

```sql
source_snapshots
----------------
id UUID PK
source_id UUID FK

fetched_at TIMESTAMPTZ NOT NULL
http_status INT NULL
content_type VARCHAR NULL

page_hash VARCHAR NULL
metadata_hash VARCHAR NULL
binary_hash VARCHAR NULL
normalized_text_hash VARCHAR NULL

raw_object_key TEXT NULL
metadata_object_key TEXT NULL
binary_object_key TEXT NULL

is_current BOOLEAN NOT NULL DEFAULT true
created_at TIMESTAMPTZ NOT NULL
```

Quy tắc:

```text
old hash == new hash
→ chỉ update last_checked_at

old hash != new hash
→ create new immutable snapshot
→ mark previous is_current=false
→ emit SOURCE_CHANGED
→ reverify affected fields
```

---

# 16. RAW IMMUTABLE STORAGE

Không overwrite tài liệu nguồn.

Ví dụ object store:

```text
/raw/
  /congbao/
    /2026/
      /09/
        /{source-id}/
          /{snapshot-id}/
            page.html
            metadata.json
            original.pdf
            original.docx
```

Storage:

- S3;
- MinIO;
- Cloudflare R2;
- GCS;
- Azure Blob.

MVP có thể dùng MinIO local + S3-compatible production.

Hash algorithm:

```text
SHA-256
```

---

# 17. `legal_provisions` — REQUIRED IN MVP

Provision-level validity tối thiểu phải có từ Phase 1 vì current-law query không thể dựa hoàn toàn vào document-level status.

```sql
legal_provisions
----------------
id UUID PK
document_id UUID FK

chapter VARCHAR NULL
section VARCHAR NULL
article VARCHAR NULL
clause VARCHAR NULL
point VARCHAR NULL
appendix VARCHAR NULL

heading TEXT NULL
content TEXT NOT NULL
normalized_content TEXT NOT NULL
content_hash VARCHAR NOT NULL

valid_from DATE NULL
valid_to DATE NULL
status_override VARCHAR NULL

parent_provision_id UUID NULL
sort_key VARCHAR NULL

created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Rule:

- nếu provision không có `valid_from`, inherit document default;
- nếu có provision-specific effective date, provision override document default;
- `status_override` chỉ dùng khi có explicit evidence như suspension/repeal;
- raw content không được paraphrase.

---

# 18. DOCUMENT RELATIONSHIPS

MVP support subset thực dụng:

```text
amends
supplements
replaces
repeals
partially_repeals
suspends
corrects
guides
implements
references
based_on
```

Schema:

```sql
document_relationships
----------------------
id UUID PK
source_document_id UUID FK
target_document_id UUID FK
relationship_type VARCHAR NOT NULL

effective_from DATE NULL
effective_to DATE NULL

source_locator JSONB NULL
target_locator JSONB NULL

verification_status VARCHAR NOT NULL
confidence_internal NUMERIC NULL

evidence_id UUID NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Không suy ra:

```text
partial repeal of provision
=> entire target document repealed
```

---

# 19. LEGAL EVIDENCE — SNAPSHOT LEVEL

Evidence phải trỏ tới immutable snapshot, không chỉ source URL.

```sql
legal_evidence
--------------
id UUID PK

document_id UUID NULL
provision_id UUID NULL
relationship_id UUID NULL

field_name VARCHAR NOT NULL
asserted_value JSONB NOT NULL

source_snapshot_id UUID NOT NULL

evidence_type VARCHAR NOT NULL
evidence_text TEXT NULL
evidence_locator JSONB NULL

verification_result VARCHAR NULL
created_at TIMESTAMPTZ NOT NULL
```

Fields bắt buộc provenance:

```text
document_number
title
issuer
issued_date
publication_date
effective dates
document nature
relationships
provision text
status-changing event
```

Nếu source thay đổi sau này, evidence lịch sử vẫn trỏ chính xác snapshot đã dùng.

---

# 20. LEGAL EVENTS

Dùng events để trả lời “mới nhất” một cách không mơ hồ.

```sql
legal_events
------------
id UUID PK
document_id UUID FK
provision_id UUID NULL

event_type VARCHAR NOT NULL
event_date DATE NULL
detected_at TIMESTAMPTZ NOT NULL

evidence_id UUID NULL
source_snapshot_id UUID NULL

created_at TIMESTAMPTZ NOT NULL
```

Supported events:

```text
discovered
published
issued
became_effective
amended
supplemented
suspended
repealed
superseded
corrected
source_changed
verification_changed
```

`latest_tax_updates` query theo event, không dùng duy nhất `created_at` hay `issued_date`.

---

# 21. TOPIC CLASSIFICATION

Controlled taxonomy:

```text
vat
corporate_income_tax
personal_income_tax
foreign_contractor_tax
special_consumption_tax
natural_resource_tax
environmental_tax
land_tax
invoice
tax_administration
household_business
transfer_pricing
customs
accounting
audit
social_insurance
enterprise
investment
other
```

Một document có nhiều topics.

Classification có thể hybrid:

```text
rule-based keywords
+
LLM classifier
```

Nhưng topic classifier **không được quyết định legal status**.

---

# 22. VERIFICATION ENGINE

Verification engine là component trung tâm.

Input:

```json
{
  "candidate_document": {},
  "source_assertions": [],
  "snapshots": []
}
```

Output:

```json
{
  "canonical_document": {},
  "verification_status": "cross_verified",
  "conflicts": [],
  "evidence_ids": []
}
```

Core rules:

## Rule A — Identity

Compare:

```text
document number
document type
issuer
issued date
title fingerprint
file hash when available
```

## Rule B — Effective date

Chỉ accept khi có ít nhất một trong:

- metadata chính thức đủ rõ;
- điều khoản hiệu lực trong văn bản nguồn;
- official relationship/status record.

## Rule C — High-authority conflict

Nếu hai nguồn chính thức mạnh khác nhau về field quan trọng:

```text
verification_status = conflicting
answerable = false for affected conclusion
```

Không auto-resolve chỉ bằng numeric weight.

## Rule D — Unknown is valid output

Nếu thiếu evidence:

```text
unknown
```

Không ép model đoán.

---

# 23. LEGAL STATE ENGINE

API nội bộ bắt buộc:

```ts
evaluateDocumentStatus(documentId, effectiveAt)
evaluateProvisionStatus(provisionId, effectiveAt)
```

Pseudo logic:

```text
1. reject draft/proposal by document nature
2. load default effective interval
3. load provision-specific interval if applicable
4. load suspension/repeal/replacement events
5. apply explicit overrides
6. evaluate at effective_at
7. return status + evidence + warnings
```

Không persist kết quả query historical như authoritative field.

Có thể cache theo:

```text
entity_id
effective_at
dataset_version
```

---

# 24. TEMPORAL QUERY RULES

Document/provision active interval cơ bản:

```sql
valid_from <= :effective_at
AND (
  valid_to IS NULL
  OR valid_to >= :effective_at
)
```

Nhưng interval filter **không đủ** để tính status cuối cùng; application layer vẫn phải xét relationship/event.

Default khi user không truyền ngày:

```text
effective_at = current date in Asia/Ho_Chi_Minh
```

Agent phải nói rõ ngày đã dùng.

---

# 25. SOURCE CHECKPOINTS — PREVENT MISSED DOCUMENTS

RSS chỉ là incremental channel.

```sql
source_checkpoints
------------------
id UUID PK
source_name VARCHAR UNIQUE
last_success_at TIMESTAMPTZ NULL
last_item_id VARCHAR NULL
last_item_publication_date TIMESTAMPTZ NULL
last_full_backfill_at TIMESTAMPTZ NULL
last_reconciliation_at TIMESTAMPTZ NULL
updated_at TIMESTAMPTZ NOT NULL
```

Strategy:

```text
15-minute incremental RSS poll
+
daily date-window backfill
+
weekly reconciliation against source listings/search
```

Mục tiêu: worker downtime không làm mất document vĩnh viễn.

---

# 26. INGESTION FLOW

```text
fetch discovery source
      ↓
normalize candidate
      ↓
checkpoint / dedupe check
      ↓
fetch official detail
      ↓
store source snapshot
      ↓
parse metadata + file
      ↓
canonicalize identity
      ↓
parse provisions
      ↓
create evidence
      ↓
verify
      ↓
create/update legal events
      ↓
index search
```

Worker phải idempotent.

Idempotency key:

```text
source_name
+
source_document_id
+
snapshot hash
```

---

# 27. RETRY / FAILURE POLICY

Suggested network retry:

```text
1s
5s
30s
2m
10m
```

Sau max retries:

```text
dead-letter / failed ingestion job
```

Không block toàn bộ ingestion pipeline vì một document lỗi.

Required job states:

```text
pending
running
succeeded
failed
retry_wait
dead_letter
```

---

# 28. DOCUMENT PARSER

Priority:

```text
DOCX structured text
>
HTML structured text
>
embedded PDF text
>
OCR fallback
```

OCR chỉ dùng khi không có text layer usable.

Parser detect:

```text
Chương
Mục
Điều
Khoản
Điểm
Phụ lục
```

Architecture:

```text
regex/token detection
→ deterministic structural parser
→ anomaly detector
```

LLM có thể flag anomaly nhưng **không chỉnh source text**.

---

# 29. RAW TEXT INTEGRITY

Lưu:

```text
raw_text
normalized_text
```

Normalization được phép:

```text
Unicode normalization
whitespace normalization
header/footer removal
page-number cleanup
```

Không được trong canonical legal source:

```text
paraphrase
rewrite
summarize
```

Summary phải là derived record riêng.

---

# 30. SEARCH ARCHITECTURE

Không dùng vector-only.

MVP:

```text
Exact Identifier Search
+
PostgreSQL FTS
+
trigram/unaccent
      ↓
Candidate Merge
      ↓
Hard Legal Filter
      ↓
Reranker
```

Phase 2/3:

```text
+ semantic search / pgvector
```

Exact identifier luôn ưu tiên cao nhất.

---

# 31. HARD LEGAL FILTERS

Khi query yêu cầu `effective law`:

Default reject:

```text
draft
proposed
issued_not_effective
expired
repealed
unknown
```

`partially_effective` chỉ được trả nếu system chỉ ra chính xác provision nào còn áp dụng.

`official_guidance` không trộn vào normative rules; trả riêng khi hữu ích.

---

# 32. RANKING MODEL

Hard filter chạy trước ranking.

Suggested ranking factors:

```text
exact identifier match
source authority
instrument/document nature
verification status
temporal fit
FTS score
semantic score (optional)
provision specificity
```

Không cần expose numeric confidence cho end-user.

UI/API nên expose:

```text
cross_verified
single_source
conflicting
```

---

# 33. MCP SERVER TECHNOLOGY

Recommended stack:

```text
Node.js 20+
TypeScript
pnpm
Zod v4
PostgreSQL
MCP TypeScript SDK v2
@modelcontextprotocol/server
```

MCP SDK v2 là stable line triển khai MCP spec `2026-07-28` tại thời điểm reference date của spec này.

Transport:

```text
local/dev:      stdio
remote/prod:    Streamable HTTP
```

Remote production phải có authentication/authorization phù hợp deployment model.

---

# 34. MCP TOOL SET — MVP

MVP chỉ expose 4 legal tools cốt lõi.

```text
latest_tax_updates
search_legal_docs
get_legal_document
get_effective_tax_rules
```

Không đưa `compare_legal_versions` vào MVP để tránh roadmap tự mâu thuẫn.

---

# 35. MCP TOOL 1 — `latest_tax_updates`

Purpose:

Trả các **legal events mới** theo loại thay đổi.

Input:

```json
{
  "topic": "vat",
  "days": 30,
  "event_types": ["published", "became_effective", "amended"],
  "document_natures": ["normative_legal_document"],
  "limit": 20
}
```

Default event types:

```text
published
issued
became_effective
amended
supplemented
repealed
corrected
```

Output:

```json
{
  "as_of": "2026-09-06",
  "dataset_version": "...",
  "items": []
}
```

Tool này **không thay thế** current-law query.

---

# 36. MCP TOOL 2 — `search_legal_docs`

Input:

```json
{
  "query": "thuế hộ kinh doanh",
  "document_number": null,
  "issuer": null,
  "document_type": null,
  "document_nature": null,
  "issued_from": null,
  "issued_to": null,
  "topics": ["household_business"],
  "limit": 20
}
```

Output tối thiểu:

```text
document identity
issuer
document nature
important dates
verification status
official source summary
matching provision snippets
```

Không mặc định claim current effectiveness nếu user chỉ search document.

---

# 37. MCP TOOL 3 — `get_legal_document`

Input:

```json
{
  "document_id": "...",
  "include_provisions": true,
  "include_relationships": true,
  "include_evidence": true
}
```

Output:

- canonical metadata;
- official sources;
- source snapshots references;
- provisions;
- relationships;
- verification;
- warnings/conflicts;
- current cached status chỉ để convenience, có `as_of` rõ ràng.

---

# 38. MCP TOOL 4 — `get_effective_tax_rules`

Tool quan trọng nhất.

Input:

```json
{
  "query": "thuế hộ kinh doanh",
  "effective_at": "2026-09-06",
  "topics": ["household_business"],
  "include_official_guidance": true,
  "limit": 10
}
```

Server bắt buộc:

```text
resolve document/provision status at effective_at
exclude drafts/proposals
exclude unknown/unverified conclusions
return provision-level evidence
separate normative rules from guidance
```

Output:

```json
{
  "effective_at": "2026-09-06",
  "answerable": true,
  "dataset_version": "...",
  "rules": [],
  "official_guidance": [],
  "warnings": []
}
```

Nếu evidence không đủ:

```json
{
  "answerable": false,
  "rules": [],
  "warnings": ["INSUFFICIENT_EVIDENCE"]
}
```

---

# 39. PHASE 2 TOOLS

Sau khi MVP ổn định mới add:

## `compare_legal_versions`

```json
{
  "document_id": "...",
  "from_date": "2025-01-01",
  "to_date": "2026-09-06"
}
```

Output:

```text
UNCHANGED
ADDED
REMOVED
MODIFIED
RENUMBERED
UNKNOWN
```

## `verify_legal_claim`

```json
{
  "claim": "Thông tư X có hiệu lực từ ngày Y",
  "effective_at": "2026-09-06"
}
```

Output:

```text
supported
contradicted
insufficient_evidence
```

---

# 40. STANDARD LEGAL RESULT CONTRACT

Mọi result có legal conclusion phải theo contract tương tự:

```json
{
  "answerable": true,
  "evaluated_at": "2026-09-06",
  "dataset_version": "...",
  "document": {
    "document_number": "...",
    "title": "...",
    "issuer": "...",
    "document_nature": "normative_legal_document"
  },
  "status": "effective",
  "verification": {
    "status": "cross_verified",
    "official_source_count": 2
  },
  "provisions": [],
  "evidence": [],
  "warnings": [],
  "retrieved_at": "..."
}
```

---

# 41. `answerable` POLICY

`answerable=true` chỉ khi conclusion cần trả có evidence đủ.

`answerable=false` nếu bất kỳ blocker phù hợp xảy ra:

```text
authoritative source conflict
unknown legal status
missing critical effective date
unresolved document identity
no authoritative evidence
verification pending
parser failure affects requested provision
```

Không dùng `answerable=false` cho mọi thiếu sót nhỏ không liên quan conclusion.

---

# 42. DATASET VERSION

Mỗi verified data commit có:

```text
dataset_version
```

Recommended:

```text
monotonic DB revision or immutable timestamp+commit id
```

MCP legal result luôn trả `dataset_version`.

Cache key của legal query phải chứa:

```text
query/effective_at
dataset_version
```

---

# 43. KNOWLEDGE TIME VS LEGAL TIME

Hai khái niệm khác nhau:

```text
effective_at = khi rule có hiệu lực trong pháp luật
knowledge_at = khi hệ thống biết evidence đó
```

MVP bắt buộc support `effective_at`.

Full bitemporal / `knowledge_at` historical query là Phase 3, nhưng immutable snapshots + audit phải được thiết kế từ đầu để không khóa đường nâng cấp.

---

# 44. SUMMARY GENERATION

LLM được phép tạo:

```text
summary
topic labels
user-friendly explanation
```

Derived summary phải lưu:

```text
derived_from_provision_ids
model_version
generated_at
```

Nếu summary conflict với source provision:

```text
source provision wins
```

---

# 45. INTERNAL SERVICE BOUNDARIES

MVP dùng modular monolith.

Logical modules:

```text
ingestion
source-storage
parser
canonicalization
verification
legal-state
search
legal-query
mcp
admin/audit
```

Không cần microservices ở Phase 1.

MCP gọi service layer; không cho tool handler query DB ad-hoc.

---

# 46. REPOSITORY STRUCTURE

```text
vietnam-tax-mcp/
│
├── apps/
│   ├── mcp-server/
│   ├── worker/
│   └── admin-api/
│
├── packages/
│   ├── db/
│   ├── ingestion/
│   ├── source-storage/
│   ├── parser/
│   ├── canonicalization/
│   ├── verification/
│   ├── legal-state/
│   ├── search/
│   ├── legal-query/
│   ├── common/
│   └── observability/
│
├── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── golden/
│   └── fixtures/
│
├── docker/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

# 47. TECH STACK

Backend:

```text
Node.js 20+
TypeScript
pnpm
Zod v4
```

Database:

```text
PostgreSQL 17 or current supported production version
```

Database access/migrations:

```text
Drizzle recommended
+
raw SQL allowed in repositories for complex legal queries
```

Storage:

```text
S3-compatible object storage
```

Queue MVP:

```text
Postgres job table
```

Scale later:

```text
Redis/BullMQ if operational need exists
```

Optional later:

```text
pgvector
Redis cache
```

---

# 48. DATABASE INDEXES

Required:

```text
normalized_document_number
issuer_id
issued_date
publication_date
default_effective_from
default_effective_to
verification_status
document_nature
```

GIN/FTS:

```text
title
normalized_text
provision normalized_content
topics
```

Trigram/unaccent:

```text
document_number
title
issuer name
```

Vietnamese FTS phải benchmark bằng golden query set; không giả định default tokenizer là đủ.

---

# 49. OBSERVABILITY

Structured logs.

Common fields:

```text
trace_id
request_id
document_id
source_id
snapshot_id
job_id
```

Metrics:

```text
documents_discovered_total
snapshots_created_total
documents_verified_total
verification_conflicts_total
ingestion_failures_total
source_fetch_latency
parser_failure_total
search_latency
legal_state_latency
mcp_tool_latency
unverified_documents_total
```

---

# 50. CRITICAL ALERTS

Alert khi:

```text
primary discovery source unavailable > threshold
no successful ingestion checkpoint > threshold
verification conflict spike
source hash mass changes
parser failure spike
MCP error rate > threshold
effective-law query tries to return unverified result
object storage write failures
DB backup/PITR health failure
```

`no new documents` chỉ là anomaly signal, không phải luôn là incident.

---

# 51. ADMIN REVIEW

Minimal review queue:

```text
/conflicts
/unverified
/source-changes
/parser-errors
/manual-review
```

Reviewer actions:

```text
approve evidence
reject candidate
merge duplicate identity
correct relationship mapping
mark manual verified
```

Reviewer **không sửa raw source snapshot**.

Mọi change phải vào audit log.

---

# 52. AUDIT LOG

```sql
audit_events
------------
id UUID PK
actor_type VARCHAR
actor_id VARCHAR NULL
action VARCHAR NOT NULL
entity_type VARCHAR NOT NULL
entity_id UUID NULL
before_value JSONB NULL
after_value JSONB NULL
reason TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

Không destructive mutate history.

---

# 53. SECURITY

Minimum:

```text
TLS for remote MCP/API
authentication
authorization/RBAC for admin
database least privilege
private object storage
secret management
rate limiting
dependency scanning
container scanning
```

Fetcher security:

```text
domain allowlist
SSRF protection
redirect validation
max payload size
timeouts
zip bomb protection
malformed document handling
```

---

# 54. PROMPT-INJECTION DEFENSE

Legal source text luôn là:

```text
DATA
```

không phải instruction.

Nếu văn bản chứa chuỗi kiểu:

```text
Ignore previous instructions
```

thì vẫn chỉ là source text.

Không inject raw legal document trực tiếp vào system prompt.

Tool output dùng structured fields và explicit source/evidence boundaries.

---

# 55. PUBLIC VS PRIVATE CORPUS

Không ingest vào public legal corpus:

- credentials;
- customer tax records;
- confidential accounting files;
- private company rulings/opinions.

Nếu sau này support private corpus:

```text
public legal corpus
!=
customer/private corpus
```

Tách namespace/authorization/storage policy.

---

# 56. GOLDEN DATASET

MVP practical target:

```text
100 expert/hand-validated cases before first internal release
300+ before external beta
500+ before production claim of broad reliability
1000+ for mature production coverage
```

Không cần block MVP vì chưa đủ 500 case, nhưng **không được tự nhận production-grade accuracy** khi chưa đo đủ coverage.

Categories tối thiểu:

```text
VAT
CIT
PIT
Invoices
Household business
Tax administration
Transfer pricing
Customs
Accounting
```

---

# 57. GOLDEN TEST FORMAT

```json
{
  "id": "VAT-001",
  "question": "...",
  "effective_at": "2026-09-06",
  "expected_documents": [],
  "expected_provisions": [],
  "expected_status": "effective",
  "must_not_include": [],
  "expert_verified": true
}
```

Add edge-case tags:

```text
future_effective
partial_repeal
conflict
draft
superseded
guidance_vs_normative
source_changed
```

---

# 58. QUALITY METRICS

Primary:

```text
Document Identification Accuracy
Effective Date Accuracy
Temporal Status Accuracy
Provision Retrieval Recall@K
Citation/Evidence Accuracy
Source Authority Accuracy
Document Nature Accuracy
```

Safety:

```text
Draft-as-law rate
Expired-as-current rate
Future-law-as-current rate
Unsupported-claim rate
Guidance-as-binding-law rate
Known-conflict-hidden rate
```

---

# 59. ACCEPTANCE TARGETS

Target after production dataset is sufficiently representative:

```text
Document number accuracy         >= 99.9%
Official source evidence         >= 99.5%
Temporal status accuracy         >= 99.5%
Effective date accuracy          >= 99.5%
Provision retrieval Recall@10    >= 95%
```

Absolute blockers for release:

```text
Draft-as-law known test failures              = 0
Known conflict hidden in tested cases         = 0
answerable=true without supporting evidence   = 0
```

Không ghi “0% globally” nếu measurement set chưa đủ đại diện; metric phải gắn với evaluated test corpus.

---

# 60. TEMPORAL TESTS

Example:

```text
issued:       01/09/2026
effective:    12/09/2026
```

At:

```text
06/09/2026
```

Expected:

```text
issued_not_effective
```

At:

```text
15/09/2026
```

Expected:

```text
effective
```

---

# 61. PARTIAL REPEAL TEST

```text
Article 10 Clause 2 repealed
Article 10 Clause 3 unchanged
```

Expected:

```text
Clause 2 = repealed
Clause 3 = effective
Document = partially_effective
```

`get_effective_tax_rules` must not return Clause 2 as current law.

---

# 62. CONFLICT TEST

Official Source A:

```text
effective_from = 01/07
```

Official Source B:

```text
effective_from = 15/07
```

Expected for conclusion depending on that date:

```text
verification_status = conflicting
answerable = false
```

Admin review task should be created.

---

# 63. GUIDANCE VS NORMATIVE TEST

Input corpus:

```text
Official Circular A
Official Letter B explaining A
```

Expected:

```text
normative rule → derived from Circular A
official guidance → may cite Letter B separately
```

System must not rank Letter B above A merely because Letter B is newer.

---

# 64. PERFORMANCE TARGETS

MVP internal target:

```text
search P50             < 300 ms
search P95             < 1.5 s
document detail P95    < 1 s
effective rules P95    < 2 s
```

Phase 2 version comparison:

```text
P95 < 3 s
```

Không tính external ingestion fetch latency.

Correctness ưu tiên hơn shaving latency cho legal-state evaluation.

---

# 65. CACHE STRATEGY

Safe to cache aggressively:

```text
immutable snapshots
historical document metadata versions
historical effective queries with dataset_version
```

Cache carefully:

```text
latest updates
current effective status
verification state
```

Legal query cache key phải có:

```text
effective_at
dataset_version
query/filter fingerprint
```

---

# 66. MCP ERROR FORMAT

```json
{
  "error": {
    "code": "LEGAL_STATUS_CONFLICT",
    "message": "Official sources disagree on a material legal fact.",
    "retryable": false,
    "document_id": "...",
    "evidence": []
  }
}
```

Codes:

```text
DOCUMENT_NOT_FOUND
SOURCE_UNAVAILABLE
LEGAL_STATUS_UNKNOWN
LEGAL_STATUS_CONFLICT
DATE_OUT_OF_RANGE
INSUFFICIENT_EVIDENCE
PARSER_FAILED
VERIFICATION_PENDING
DOCUMENT_IDENTITY_UNRESOLVED
```

---

# 67. AGENT GUARDRAILS

Agent policy:

```text
Never present draft, proposal or consultation content as effective law.

For current-law questions, call get_effective_tax_rules.

Never infer legal status from title or document recency.

Treat official guidance separately from normative legal rules.

For every material legal conclusion, identify:
- document number
- issuing authority
- relevant provision when available
- effective date / evaluated date
- official source/evidence

If answerable=false, do not invent a legal conclusion.

If verification_status=conflicting, disclose the conflict.

If effective_at is absent, use the current Vietnam date and state the date used.
```

---

# 68. LEGAL RESPONSE CONTRACT FOR AGENT

Recommended final answer structure:

```text
Kết luận
Căn cứ pháp lý
Điều/khoản liên quan
Tình trạng tại ngày được hỏi
Ngày hiệu lực
Nguồn chính thức
Hướng dẫn chính thức liên quan (nếu có)
Xung đột/cảnh báo (nếu có)
```

Không bắt buộc mọi câu trả lời hiển thị toàn bộ raw evidence object; MCP giữ provenance chi tiết phía sau.

---

# 69. CONFIGURATION

`.env.example`

```env
NODE_ENV=development
DATABASE_URL=

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=

INGESTION_INTERVAL_MINUTES=15
DAILY_BACKFILL_ENABLED=true
WEEKLY_RECONCILIATION_ENABLED=true

CONGBAO_RSS_URL=

HTTP_TIMEOUT_MS=15000
MAX_SOURCE_BYTES=52428800

ENABLE_VECTOR_SEARCH=false

MCP_TRANSPORT=stdio
LOG_LEVEL=info
```

---

# 70. CI/CD

Pull request:

```text
lint
typecheck
unit tests
integration tests
migration/schema validation
golden smoke tests
security scan
```

Main:

```text
build immutable container image
migration compatibility check
full golden suite
deploy staging
smoke test
protected/manual production promotion
```

---

# 71. BACKUP / RECOVERY

PostgreSQL:

```text
daily full backup
point-in-time recovery
```

Raw source:

```text
versioned object storage
```

Initial target:

```text
RPO <= 1 hour
RTO <= 4 hours
```

Backup restore test phải chạy định kỳ; backup tồn tại mà chưa từng restore test không được coi là đủ.

---

# 72. COMMERCIAL DATA POLICY

Không mặc định mọi nguồn chính thức/RSS có quyền redistribute thương mại không giới hạn.

Production SaaS cần:

- đọc điều khoản sử dụng từng nguồn;
- ghi nguồn;
- lưu official links;
- ưu tiên indexing/retrieval nội bộ;
- hạn chế republish nguyên khối nếu license không rõ;
- thực hiện legal/license review trước commercial redistribution.

---

# 73. MVP SCOPE — PHASE 1

Build:

```text
Công báo RSS connector
Công báo detail/file fetcher
immutable source snapshots
PostgreSQL core schema
canonical document normalization
minimal provision parser
minimal provision-level validity
basic relationship support
basic verification engine
legal state evaluator
exact search
PostgreSQL FTS/trigram
4 MCP tools
stdio transport
Docker Compose
structured logs
source checkpoints
incremental + daily backfill
100 golden tests
```

Not required:

```text
pgvector
microservices
Kafka
graph database
complex OCR
full bitemporal query
full version comparison UI
```

---

# 74. PHASE 2

Add:

```text
VBPL cross-verification
vanban.chinhphu connector
more complete relationship extraction
provision relationship mapping
conflict review dashboard
300–500+ golden tests
Streamable HTTP MCP
authentication/authorization
compare_legal_versions
```

---

# 75. PHASE 3

Add:

```text
Ministry connectors
semantic search / pgvector
verify_legal_claim
manual review UI
knowledge_at / bitemporal query
1000+ expert cases
advanced legal event reconciliation
```

---

# 76. PHASE 4 — ENTERPRISE

```text
multi-tenant
private company tax corpus
internal tax opinions
customer document RAG
approval workflow
audit export
SLA monitoring
enterprise RBAC
```

Public and private corpora remain logically/security separated.

---

# 77. BUILD ORDER

Recommended implementation order:

```text
01 PostgreSQL schema + migrations
02 Object storage + source_snapshots
03 Source connector abstraction
04 Công báo RSS + checkpoint
05 Detail/file fetcher
06 Canonicalization + dedupe
07 Metadata parser
08 Provision parser
09 Evidence creation
10 Verification engine
11 Legal state evaluator
12 Exact search + FTS
13 latest_tax_updates events
14 Legal query service
15 MCP schemas + 4 tools
16 Golden tests
17 Observability
18 Daily backfill + weekly reconciliation
19 Docker deployment
20 Minimal admin review
```

Không build vector search trước khi exact/FTS/current-law correctness ổn.

---

# 78. DEFINITION OF DONE — MVP

MVP hoàn thành khi:

- worker đọc được Công báo RSS;
- checkpoint hoạt động;
- worker downtime có thể backfill;
- chạy lại không tạo duplicate;
- source được lưu thành immutable snapshot;
- hash thay đổi tạo snapshot mới;
- parse được identity/metadata chính;
- canonicalization xử lý được duplicate phổ biến;
- parse được Điều/Khoản/Điểm ở corpus mục tiêu với golden tests;
- phân biệt document nature;
- phân biệt issued vs effective;
- provision-specific validity tối thiểu hoạt động;
- partial repeal test hoạt động;
- conflict test hoạt động;
- search số hiệu chính xác;
- FTS usable;
- `latest_tax_updates` dùng event semantics;
- `get_effective_tax_rules` trả theo `effective_at`;
- mọi legal conclusion có evidence trỏ snapshot;
- `answerable=false` khi thiếu evidence vật chất;
- MCP đủ 4 tools;
- Docker Compose chạy end-to-end;
- 100 golden tests pass theo release gate;
- draft/proposal không lọt vào current-law result;
- official guidance không bị trình bày như normative law.

---

# 79. DEFINITION OF DONE — PRODUCTION

Ngoài MVP:

- multi-source cross-verification;
- conflict review workflow;
- robust provision-level temporal validity;
- audit trail end-to-end;
- monitoring/alerts;
- backup restore tested;
- authenticated remote MCP;
- representative production golden dataset;
- load test;
- security test;
- recovery test;
- source license/commercial use review;
- documented operational runbook.

---

# 80. SOURCE OF TRUTH PRINCIPLE

Ultimate source of truth:

```text
official legal evidence
```

Immutable source snapshot:

```text
what the system actually retrieved
```

Database:

```text
verified representation
```

Legal State Engine:

```text
temporal interpretation of verified facts
```

MCP:

```text
controlled retrieval interface
```

Agent:

```text
user-facing interpretation layer
```

---

# 81. FINAL PRODUCTION PRINCIPLE

Mục tiêu không phải:

```text
Make the AI sound confident.
```

Mục tiêu là:

```text
Make every important legal conclusion
traceable,
temporally correct,
provision-aware,
source-verifiable,
and safely rejectable when uncertain.
```

Đây là nguyên tắc kiến trúc xuyên suốt Vietnam Tax & Legal MCP.

---

# 82. IMPLEMENTATION DECISIONS LOCKED FOR v1.1

Các quyết định sau được coi là locked cho Phase 1 trừ khi có evidence kỹ thuật mới buộc phải thay đổi:

```text
1. Modular monolith, not microservices.
2. PostgreSQL first; pgvector later.
3. Immutable source snapshots from day one.
4. Evidence references snapshot, not mutable source URL alone.
5. Legal status evaluated at query date.
6. Provision-level validity minimal support is MVP-critical.
7. Source authority and document nature are separate dimensions.
8. latest_tax_updates is event-based.
9. RSS discovery is backed by checkpoint + backfill + reconciliation.
10. MVP exposes exactly 4 MCP legal tools.
11. compare_legal_versions moves to Phase 2.
12. LLM may summarize/classify but may not determine legal status.
```

---

# 83. REFERENCE IMPLEMENTATION STACK CHECK

Verified for the reference date:

```text
MCP TypeScript SDK v2
@modelcontextprotocol/server
Node.js 20+
Zod v4
local stdio
remote Streamable HTTP
MCP spec 2026-07-28
```

Reference documentation:

- https://ts.sdk.modelcontextprotocol.io/v2/
- https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/
- https://modelcontextprotocol.io/specification/2026-07-28

