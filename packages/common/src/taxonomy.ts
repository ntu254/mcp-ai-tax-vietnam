import { z } from "zod";

/**
 * 6.2 Legal / Instrument Nature
 * Controlled taxonomy
 */
export const DOCUMENT_NATURES = [
  "normative_legal_document", // Văn bản quy phạm pháp luật (Luật, Nghị định, Thông tư...)
  "consolidated_document",    // Văn bản hợp nhất
  "implementing_document",    // Văn bản triển khai thi hành
  "official_guidance",        // Công văn, hướng dẫn nghiệp vụ
  "administrative_document",  // Văn bản hành chính cá biệt
  "correction",               // Đính chính
  "draft",                    // Dự thảo
  "proposal",                 // Tờ trình, đề xuất
  "consultation",             // Văn bản lấy ý kiến
  "other",
] as const;

export type DocumentNature = (typeof DOCUMENT_NATURES)[number];
export const DocumentNatureSchema = z.enum(DOCUMENT_NATURES);

/**
 * 7. Document Type Taxonomy
 */
export const DOCUMENT_TYPES = [
  "constitution",    // Hiến pháp
  "law",             // Luật, Bộ luật
  "resolution",      // Nghị quyết
  "ordinance",       // Pháp lệnh
  "decree",          // Nghị định
  "decision",        // Quyết định
  "circular",        // Thông tư
  "joint_circular",  // Thông tư liên tịch
  "official_letter", // Công văn
  "dispatch",        // Công điện
  "guidance",        // Hướng dẫn
  "announcement",    // Thông báo
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);

/**
 * 6.1 Source Authority Tiers
 */
export const SOURCE_AUTHORITIES = [
  "tier_a",          // Highest: Công báo điện tử CP, CSDL Quốc gia về VBPL
  "tier_b",          // Very high: Cơ quan ban hành (Bộ Tài chính, Tổng cục Thuế...)
  "tier_c",          // Medium: Nguồn thứ cấp uy tín (chỉ dùng cho discovery / cross-ref)
  "news",            // Low: Báo chí (không dùng làm căn cứ hiệu lực)
  "unknown",
] as const;

export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];
export const SourceAuthoritySchema = z.enum(SOURCE_AUTHORITIES);

/**
 * 8. Evaluated Legal Status at query date
 */
export const EVALUATED_LEGAL_STATUSES = [
  "effective",            // Đang có hiệu lực
  "partially_effective",  // Có hiệu lực một phần
  "not_yet_effective",    // Chưa có hiệu lực
  "suspended",            // Bị đình chỉ hiệu lực
  "partially_suspended",  // Bị đình chỉ một phần
  "repealed",             // Hết hiệu lực / Bị bãi bỏ hoàn toàn
  "partially_repealed",   // Hết hiệu lực / Bị bãi bỏ một phần
  "replaced",             // Bị thay thế hoàn toàn
  "expired",              // Hết thời hạn áp dụng
  "unknown",              // Không đủ bằng chứng để xác định
] as const;

export type EvaluatedLegalStatus = (typeof EVALUATED_LEGAL_STATUSES)[number];
export const EvaluatedLegalStatusSchema = z.enum(EVALUATED_LEGAL_STATUSES);

/**
 * 9. Verification Status
 */
export const VERIFICATION_STATUSES = [
  "cross_verified",          // Đã đối soát chéo ≥2 nguồn chính thức độc lập
  "single_source_verified",  // Đã xác thực từ 1 nguồn chính thức Tier A/B
  "conflicting",             // Có xung đột giữa các nguồn chính thức
  "unverified",              // Chưa được xác minh đủ điều kiện
  "rejected",                // Dữ liệu bị bác bỏ do sai lệch/không hợp lệ
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const VerificationStatusSchema = z.enum(VERIFICATION_STATUSES);

/**
 * 18. Document Relationships
 */
export const RELATIONSHIP_TYPES = [
  "amends",            // Sửa đổi
  "supplements",       // Bổ sung
  "replaces",          // Thay thế
  "repeals",           // Bãi bỏ toàn bộ
  "partially_repeals", // Bãi bỏ một phần
  "suspends",          // Đình chỉ thi hành
  "corrects",          // Đính chính
  "guides",            // Hướng dẫn
  "implements",        // Quy định chi tiết / Thi hành
  "references",        // Viện dẫn
  "based_on",          // Căn cứ
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export const RelationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);

/**
 * 20. Legal Events
 */
export const LEGAL_EVENT_TYPES = [
  "published",           // Đăng Công báo
  "issued",              // Ban hành
  "became_effective",    // Bắt đầu có hiệu lực
  "amended",             // Bị sửa đổi
  "supplemented",        // Được bổ sung
  "repealed",            // Bị bãi bỏ
  "partially_repealed",  // Bị bãi bỏ một phần
  "suspended",           // Bị đình chỉ
  "corrected",           // Bị đính chính
] as const;

export type LegalEventType = (typeof LEGAL_EVENT_TYPES)[number];
export const LegalEventTypeSchema = z.enum(LEGAL_EVENT_TYPES);

/**
 * 21. Topic Classification
 */
export const TAX_TOPICS = [
  "vat",                         // Thuế giá trị gia tăng
  "cit",                         // Thuế thu nhập doanh nghiệp
  "pit",                         // Thuế thu nhập cá nhân
  "fct",                         // Thuế nhà thầu nước ngoài
  "invoice",                     // Hóa đơn, chứng từ
  "tax_administration",          // Quản lý thuế
  "special_consumption_tax",     // Thuế tiêu thụ đặc biệt
  "import_export_duty",          // Thuế xuất nhập khẩu
  "land_tax",                    // Thuế sử dụng đất / tiền thuê đất
  "natural_resources_tax",       // Thuế tài nguyên
  "environmental_protection_tax",// Thuế bảo vệ môi trường
  "license_fee",                 // Lệ phí môn bài
  "household_business",          // Hộ, cá nhân kinh doanh
  "transfer_pricing",            // Giao dịch liên kết
  "penalties_and_enforcement",   // Xử phạt VPHC & cưỡng chế thuế
  "customs",                     // Hải quan
  "accounting",                  // Kế toán doanh nghiệp liên quan thuế
  "other",
] as const;

export type TaxTopic = (typeof TAX_TOPICS)[number];
export const TaxTopicSchema = z.enum(TAX_TOPICS);

/**
 * 13. Canonical Status
 */
export const CANONICAL_STATUSES = [
  "resolved",
  "unresolved",
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];
export const CanonicalStatusSchema = z.enum(CANONICAL_STATUSES);
