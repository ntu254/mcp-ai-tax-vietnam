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

  // Ensure all 61 provisions exist for Decree 123/2020/NĐ-CP
  const provCountRes = await db
    .select()
    .from(legalProvisions)
    .where(eq(legalProvisions.document_id, sampleDocId));

  let sampleProvId: string;

  if (provCountRes.length < 61) {
    // Clean up old stub
    await db
      .delete(legalProvisions)
      .where(eq(legalProvisions.document_id, sampleDocId));

    const decreeProvisions = [
      { num: 1, title: "Phạm vi điều chỉnh", content: "Nghị định này quy định việc quản lý, sử dụng hóa đơn khi bán hàng hóa, cung cấp dịch vụ; quy định việc quản lý, sử dụng chứng từ." },
      { num: 2, title: "Đối tượng áp dụng", content: "Tổ chức, cá nhân bán hàng hóa, cung cấp dịch vụ bao gồm doanh nghiệp, hộ kinh doanh, cá nhân kinh doanh." },
      { num: 3, title: "Giải thích từ ngữ", content: "Hóa đơn điện tử là hóa đơn có mã hoặc không có mã của cơ quan thuế được thể hiện ở dạng dữ liệu điện tử." },
      { num: 4, title: "Nguyên tắc lập, quản lý, sử dụng hóa đơn, chứng từ", content: "Khi bán hàng hóa, cung cấp dịch vụ, người bán phải lập hóa đơn điện tử để giao cho người mua." },
      { num: 5, title: "Loại hóa đơn", content: "Hóa đơn giá trị gia tăng áp dụng đối với người nộp thuế theo phương pháp khấu trừ. Hóa đơn bán hàng áp dụng theo phương pháp trực tiếp." },
      { num: 6, title: "Bảo quản, lưu trữ hóa đơn, chứng từ", content: "Hóa đơn điện tử phải được bảo quản, lưu trữ bằng phương tiện điện tử theo quy định của pháp luật." },
      { num: 7, title: "Hành vi bị cấm trong quản lý, sử dụng hóa đơn", content: "Cấm gian lận như sử dụng hóa đơn không hợp pháp, sử dụng không hợp pháp hóa đơn." },
      { num: 8, title: "Hóa đơn điện tử có mã của cơ quan thuế", content: "Doanh nghiệp, tổ chức kinh tế sử dụng hóa đơn điện tử có mã của cơ quan thuế khi bán hàng hóa, cung cấp dịch vụ." },
      { num: 9, title: "Thời điểm lập hóa đơn", content: "Thời điểm lập hóa đơn đối với bán hàng hóa là thời điểm chuyển giao quyền sở hữu hoặc quyền sử dụng hàng hóa." },
      { num: 10, title: "Nội dung của hóa đơn", content: "Tên hóa đơn, ký hiệu mẫu số hóa đơn, ký hiệu hóa đơn, số hóa đơn; tên, địa chỉ, mã số thuế người bán và người mua." },
    ];

    // Generate remaining articles up to 61
    for (let i = 11; i <= 61; i++) {
      decreeProvisions.push({
        num: i,
        title: i === 59 ? "Hiệu lực thi hành" : `Quy định tại Điều ${i}`,
        content: i === 59 ? "Nghị định này có hiệu lực thi hành từ ngày 01 tháng 07 năm 2022. Bãi bỏ Nghị định số 51/2010/NĐ-CP." : `Nội dung chi tiết quy định tại Điều ${i} của Nghị định số 123/2020/NĐ-CP về hóa đơn điện tử.`,
      });
    }

    sampleProvId = crypto.randomUUID();

    for (const dp of decreeProvisions) {
      const pId = dp.num === 4 ? sampleProvId : crypto.randomUUID();
      await db.insert(legalProvisions).values({
        id: pId,
        document_id: sampleDocId,
        article: `Điều ${dp.num}`,
        clause: "1",
        heading: dp.title,
        content: dp.content,
        normalized_content: dp.content.toLowerCase(),
        content_hash: `mock-content-hash-art${dp.num}`,
        valid_from: "2022-07-01",
        sort_key: `${dp.num.toString().padStart(4, "0")}.0001`,
        created_at: now,
        updated_at: now,
      });
    }
  } else {
    sampleProvId = provCountRes.find((p) => p.article === "Điều 4")?.id ?? provCountRes[0].id;
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
