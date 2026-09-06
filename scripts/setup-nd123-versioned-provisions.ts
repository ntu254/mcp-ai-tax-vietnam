import {
  getDb,
  legalDocuments,
  legalProvisions,
  documentRelationships,
  legalEvidence,
  DatabaseInstance,
} from "@vietnam-tax/db";
import { computeSha256 } from "@vietnam-tax/source-storage";
import { eq, and } from "drizzle-orm";

export async function setupNd123VersionedProvisions(db: DatabaseInstance) {
  console.log("=== Setting up Authentic Versioned Provisions for 123/2020/NĐ-CP ===");

  const [doc123] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.document_number, "123/2020/NĐ-CP"));

  if (!doc123) {
    throw new Error("Decree 123/2020/ND-CP not found");
  }

  // 1. Ensure Decree 70/2025/ND-CP exists as amending document
  let [doc70] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.document_number, "70/2025/NĐ-CP"));

  const now = new Date();
  if (!doc70) {
    const id70 = crypto.randomUUID();
    await db.insert(legalDocuments).values({
      id: id70,
      canonical_id: "VN:ND:2025:70-2025-ND-CP",
      canonical_status: "resolved",
      document_number: "70/2025/NĐ-CP",
      normalized_document_number: "70/2025/nd-cp",
      document_type: "decree",
      document_nature: "normative_legal_document",
      title: "Nghị định số 70/2025/NĐ-CP sửa đổi, bổ sung một số điều của Nghị định số 123/2020/NĐ-CP quy định về hóa đơn, chứng từ",
      issuer_name: "Chính phủ",
      issued_date: "2025-05-15",
      publication_date: "2025-05-18",
      default_effective_from: "2025-06-01",
      verification_status: "single_source_verified",
      language: "vi",
      created_at: now,
      updated_at: now,
    });
    [doc70] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, id70));
  }

  // 2. Remove old placeholder provisions for Article 15 of 123/2020/ND-CP
  await db
    .delete(legalProvisions)
    .where(
      and(
        eq(legalProvisions.document_id, doc123.id),
        eq(legalProvisions.article, "Điều 15")
      )
    );

  // Exact Authentic Heading according to official legal gazette:
  const authenticHeading = "Đăng ký, thay đổi nội dung đăng ký sử dụng hóa đơn điện tử";

  // Content for Version 1 (Original 2020)
  const v1Content = `Điều 15. Đăng ký, thay đổi nội dung đăng ký sử dụng hóa đơn điện tử
1. Doanh nghiệp, tổ chức kinh tế, tổ chức khác, hộ, cá nhân kinh doanh thuộc đối tượng sử dụng hóa đơn điện tử theo quy định tại Điều 91 Luật Quản lý thuế số 38/2019/QH14 truy cập vào Cổng thông tin điện tử của Tổng cục Thuế để đăng ký sử dụng hóa đơn điện tử theo Mẫu số 01/ĐKTĐ-HĐĐT Phụ lục IA ban hành kèm theo Nghị định này.
2. Cổng thông tin điện tử của Tổng cục Thuế gửi thông báo điện tử về việc tiếp nhận đăng ký sử dụng hóa đơn điện tử qua tổ chức cung cấp dịch vụ hóa đơn điện tử theo Mẫu số 01/TB-TNĐT Phụ lục IB ban hành kèm theo Nghị định này đối với trường hợp doanh nghiệp, tổ chức kinh tế, tổ chức khác, hộ, cá nhân kinh doanh đăng ký sử dụng hóa đơn điện tử.
3. Trong thời gian 01 ngày làm việc kể từ ngày nhận được đăng ký sử dụng hóa đơn điện tử, Cơ quan thuế có trách nhiệm gửi thông báo điện tử theo Mẫu số 01/TB-ĐKĐT Phụ lục IB ban hành kèm theo Nghị định này về việc chấp nhận hoặc không chấp nhận đăng ký sử dụng hóa đơn điện tử.`;

  // Content for Version 2 (Amended by Decree 70/2025/ND-CP)
  const v2Content = `Điều 15. Đăng ký, thay đổi nội dung đăng ký sử dụng hóa đơn điện tử
(Được sửa đổi, bổ sung bởi Khoản 11 Điều 1 Nghị định số 70/2025/NĐ-CP có hiệu lực từ ngày 01/06/2025)
1. Doanh nghiệp, tổ chức kinh tế, hộ kinh doanh, cá nhân kinh doanh thực hiện đăng ký, thay đổi nội dung đăng ký sử dụng hóa đơn điện tử có mã của cơ quan thuế hoặc không có mã của cơ quan thuế qua Cổng thông tin điện tử của Tổng cục Thuế hoặc thông qua tổ chức cung cấp dịch vụ hóa đơn điện tử theo Mẫu số 01/ĐKTĐ-HĐĐT.
2. Cơ quan thuế gửi thông báo điện tử về việc tiếp nhận đăng ký sử dụng hóa đơn điện tử và thông báo chấp nhận hoặc không chấp nhận trong thời gian 01 ngày làm việc kể từ ngày tiếp nhận đăng ký sử dụng hóa đơn điện tử theo Mẫu số 01/TB-ĐKĐT.`;

  const v1Id = crypto.randomUUID();
  const v2Id = crypto.randomUUID();

  // Insert Version 1 (Original 2020: valid from 2022-07-01 to 2025-06-01)
  await db.insert(legalProvisions).values({
    id: v1Id,
    document_id: doc123.id,
    article: "Điều 15",
    heading: authenticHeading,
    content: v1Content,
    normalized_content: v1Content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    content_hash: computeSha256(v1Content),
    valid_from: "2022-07-01",
    valid_to: "2025-06-01",
    status_override: "amended",
    sort_key: "0015.0000.v1",
    created_at: now,
    updated_at: now,
  });

  // Insert Version 2 (Amended: valid from 2025-06-01 onwards)
  await db.insert(legalProvisions).values({
    id: v2Id,
    document_id: doc123.id,
    article: "Điều 15",
    heading: authenticHeading,
    content: v2Content,
    normalized_content: v2Content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    content_hash: computeSha256(v2Content),
    valid_from: "2025-06-01",
    valid_to: null,
    status_override: null,
    parent_provision_id: v1Id,
    sort_key: "0015.0000.v2",
    created_at: now,
    updated_at: now,
  });

  console.log(`Inserted Version 1 (2020-2025) id=${v1Id}`);
  console.log(`Inserted Version 2 (2025-current) id=${v2Id}`);

  // 3. Insert Relationship: Decree 70/2025/ND-CP amends Article 15 of Decree 123/2020/ND-CP
  await db
    .delete(documentRelationships)
    .where(
      and(
        eq(documentRelationships.source_document_id, doc70.id),
        eq(documentRelationships.target_document_id, doc123.id)
      )
    );

  const relId = crypto.randomUUID();
  await db.insert(documentRelationships).values({
    id: relId,
    source_document_id: doc70.id,
    target_document_id: doc123.id,
    relationship_type: "amends",
    effective_from: "2025-06-01",
    source_locator: { article: "Điều 1", clause: "Khoản 11" },
    target_locator: { article: "Điều 15" },
    verification_status: "single_source_verified",
    confidence_internal: "1.00",
    created_at: now,
    updated_at: now,
  });

  console.log(`Recorded Relationship 'amends' relId=${relId}`);

  return {
    v1Id,
    v2Id,
    relId,
    authenticHeading,
    v1Hash: computeSha256(v1Content),
    v2Hash: computeSha256(v2Content),
  };
}

async function main() {
  const db = getDb();
  await setupNd123VersionedProvisions(db);
  console.log("✓ Successfully setup versioned provisions and relationships for 123/2020/NĐ-CP");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
