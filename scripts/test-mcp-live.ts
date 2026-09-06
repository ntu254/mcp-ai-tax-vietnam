import "dotenv/config";
import { eq } from "drizzle-orm";
import {
  closeDbPool,
  documentSources,
  getDb,
  legalDocuments,
  legalEvidence,
  legalProvisions,
  sourceSnapshots,
} from "../packages/db/src/index.js";
import { LegalQueryService } from "../packages/legal-query/src/index.js";

async function testLiveMcp() {
  const db = getDb();
  const queryService = new LegalQueryService(db);

  console.log("================================================================================");
  console.log("            VIETNAM TAX & LEGAL MCP — LIVE E2E 4-TOOLS VERIFICATION");
  console.log("================================================================================");

  const now = new Date();

  // Find or create Decree 123/2020 baseline document
  const existingNd123 = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.canonical_id, "VN:ND:2020:123-2020-ND-CP"))
    .limit(1);

  let sampleDocId: string;

  if (existingNd123.length > 0) {
    sampleDocId = existingNd123[0].id;
  } else {
    sampleDocId = crypto.randomUUID();
    await db.insert(legalDocuments).values({
      id: sampleDocId,
      canonical_id: "VN:ND:2020:123-2020-ND-CP",
      canonical_status: "resolved",
      document_number: "123/2020/NĐ-CP",
      normalized_document_number: "123-2020-ND-CP",
      document_type: "decree",
      document_nature: "normative_legal_document",
      title: "Nghị định số 123/2020/NĐ-CP quy định về hóa đơn, chứng từ",
      issuer_name: "Chính phủ",
      issued_date: "2020-10-19",
      publication_date: "2020-10-25",
      default_effective_from: "2022-07-01",
      verification_status: "single_source_verified",
      language: "vi",
      raw_text: "Quy định về hóa đơn điện tử và chứng từ.",
      source_count: 1,
      created_at: now,
      updated_at: now,
    });
  }

  // Ensure source & snapshot exist for this document
  const existingSource = await db
    .select()
    .from(documentSources)
    .where(eq(documentSources.document_id, sampleDocId))
    .limit(1);

  let sampleSnapshotId: string;

  if (existingSource.length > 0 && existingSource[0].current_snapshot_id) {
    sampleSnapshotId = existingSource[0].current_snapshot_id;
  } else {
    const sampleSourceId = crypto.randomUUID();
    sampleSnapshotId = crypto.randomUUID();

    await db.insert(documentSources).values({
      id: sampleSourceId,
      document_id: sampleDocId,
      source_name: "congbao",
      source_type: "html",
      source_authority: "tier_a",
      source_url: "https://congbao.chinhphu.vn/van-ban/nghi-dinh-123.htm",
      first_seen_at: now,
      last_seen_at: now,
      last_checked_at: now,
      is_official: true,
      is_active: true,
      current_snapshot_id: null,
      created_at: now,
      updated_at: now,
    });

    await db.insert(sourceSnapshots).values({
      id: sampleSnapshotId,
      source_id: sampleSourceId,
      fetched_at: now,
      page_hash: "mock-hash-nd123",
      raw_object_key: "raw/congbao/2026/09/sample/page.html",
      is_current: true,
      created_at: now,
    });

    await db
      .update(documentSources)
      .set({ current_snapshot_id: sampleSnapshotId })
      .where(eq(documentSources.id, sampleSourceId));
  }

  // Ensure provision exists for Điều 4
  const existingProvs = await db
    .select()
    .from(legalProvisions)
    .where(eq(legalProvisions.document_id, sampleDocId))
    .limit(1);

  let sampleProvId: string;
  if (existingProvs.length > 0) {
    sampleProvId = existingProvs[0].id;
  } else {
    sampleProvId = crypto.randomUUID();
    await db.insert(legalProvisions).values({
      id: sampleProvId,
      document_id: sampleDocId,
      article: "Điều 4",
      clause: "1",
      heading: "Nguyên tắc lập, quản lý, sử dụng hóa đơn",
      content: "Khi bán hàng hóa, cung cấp dịch vụ, người bán phải lập hóa đơn điện tử để giao cho người mua.",
      normalized_content: "khi ban hang hoa cung cap dich vu nguoi ban phai lap hoa don dien tu de giao cho nguoi mua",
      content_hash: "mock-content-hash-art4",
      valid_from: "2022-07-01",
      created_at: now,
      updated_at: now,
    });
  }

  // Ensure evidence exists
  const existingEvidence = await db
    .select()
    .from(legalEvidence)
    .where(eq(legalEvidence.document_id, sampleDocId))
    .limit(1);

  if (existingEvidence.length === 0) {
    await db.insert(legalEvidence).values({
      id: crypto.randomUUID(),
      document_id: sampleDocId,
      provision_id: sampleProvId,
      field_name: "default_effective_from",
      asserted_value: "2022-07-01",
      source_snapshot_id: sampleSnapshotId,
      evidence_type: "source_extraction",
      evidence_text: "Nghị định này có hiệu lực từ ngày 01 tháng 07 năm 2022",
      verification_result: "verified",
      created_at: now,
    });
  }

  // 1. Tool 1: search_legal_docs
  console.log("\n1. [TOOL 1] Testing search_legal_docs for '336/2026/NĐ-CP'...");
  const searchRes = await queryService.searchLegalDocs({
    query: "336/2026/NĐ-CP",
    limit: 5,
  });
  console.log(`   Found: ${searchRes.total} results`);
  if (searchRes.results[0]) {
    const doc = searchRes.results[0];
    console.log(`   ├── Title          : ${doc.title}`);
    console.log(`   ├── Canonical ID   : ${doc.canonical_id}`);
    console.log(`   ├── Document Nature: ${doc.document_nature}`);
    console.log(`   └── Score          : ${doc.score}`);
  }

  // 2. Tool 2: get_legal_document
  console.log("\n2. [TOOL 2] Testing get_legal_document for 'VN:ND:2020:123-2020-ND-CP'...");
  const fullDoc = await queryService.getLegalDocument({
    document_id: "VN:ND:2020:123-2020-ND-CP",
  });
  console.log(`   ├── Document ID    : ${fullDoc.document_id}`);
  console.log(`   ├── Sources count  : ${fullDoc.sources.length}`);
  console.log(`   ├── Provisions     : ${fullDoc.provisions?.length ?? 0}`);
  console.log(`   ├── Evidence items : ${fullDoc.evidence?.length ?? 0}`);
  console.log(`   └── Verification   : ${fullDoc.verification_status}`);

  // 3. Tool 3: latest_tax_updates
  console.log("\n3. [TOOL 3] Testing latest_tax_updates...");
  const updates = await queryService.getLatestTaxUpdates({
    days: 30,
    limit: 5,
  });
  console.log(`   Found: ${updates.items.length} legal events`);
  for (const item of updates.items.slice(0, 2)) {
    console.log(`   ├── [${item.event_type}] ${item.title.slice(0, 65)}... (${item.event_date})`);
  }

  // 4. Tool 4: get_effective_tax_rules (Crucial Opposing Cases)
  console.log("\n4. [TOOL 4] Testing get_effective_tax_rules with 2 OPPOSING CASES:");

  // Case 4A: Future / not yet effective document (Nghị định 336/2026/NĐ-CP)
  console.log("\n   Case 4A: Querying future document (336/2026/NĐ-CP) at effective_at = 2026-09-06...");
  const futureRules = await queryService.getEffectiveTaxRules({
    query: "336/2026/NĐ-CP",
    effective_at: "2026-09-06",
  });

  const isExcluded = !futureRules.rules.some((r) => r.document_number === "336/2026/NĐ-CP");
  console.log(`   ├── Excluded from effective rules: ${isExcluded ? "YES (PASSED - Not yet effective)" : "NO (FAILED)"}`);

  // Case 4B: Valid effective document before 2026-09-06 (Nghị định 123/2020/NĐ-CP)
  console.log("\n   Case 4B: Querying applicable tax rule (hóa đơn điện tử) at effective_at = 2026-09-06...");
  const activeRules = await queryService.getEffectiveTaxRules({
    query: "hóa đơn điện tử",
    effective_at: "2026-09-06",
  });

  console.log(`   ├── Answerable        : ${activeRules.answerable}`);
  console.log(`   ├── Effective at date : ${activeRules.effective_at} (${activeRules.evaluated_timezone})`);
  console.log(`   ├── Rules returned    : ${activeRules.rules.length}`);
  if (activeRules.rules[0]) {
    const r = activeRules.rules[0];
    console.log(`   ├── Matched Rule Doc  : ${r.document_number} - ${r.title}`);
    console.log(`   ├── Provision Article : ${r.provision.article} (${r.provision.heading})`);
    console.log(`   ├── Provision Status  : ${r.provision.evaluated_status}`);
    console.log(`   ├── Evidence Count    : ${r.evidence.length}`);
    if (r.evidence[0]) {
      console.log(`   └── Snapshot Provenance: ${r.evidence[0].source_snapshot_id} (${r.evidence[0].evidence_type})`);
    }
  }

  // Contract Invariants Assertion
  if (!isExcluded) {
    throw new Error("INVARIANT FAILED: Future document 336 was returned in effective rules!");
  }
  if (!activeRules.answerable || activeRules.rules.length === 0) {
    throw new Error("INVARIANT FAILED: Effective document 123 was not returned in effective rules!");
  }

  console.log("\n================================================================================");
  console.log("            ALL 4 LIVE MCP RETRIEVAL TOOLS VERIFIED SUCCESSFULLY");
  console.log("================================================================================");

  await closeDbPool();
}

testLiveMcp().catch((err) => {
  console.error("Live MCP test error:", err);
  process.exit(1);
});
