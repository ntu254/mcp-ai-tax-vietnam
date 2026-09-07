# HƯỚNG DẪN SỬ DỤNG CHUẨN: VIETNAM TAX & LEGAL MCP
> **Version:** 1.1.0  
> **Jurisdiction:** Việt Nam (`Asia/Ho_Chi_Minh`)  
> **Domains:** Thuế (VAT, CIT, PIT, FCT...), Kế toán, Hóa đơn điện tử, Quản lý thuế, Hải quan & Doanh nghiệp.

---

## 1. Bản Chất & Triết Lý An Toàn Cốt Lõi

Hệ thống **Vietnam Tax & Legal MCP** là hạ tầng truy xuất quy chuẩn pháp lý và thuế dựa trên **kiểm chứng thời gian thực (Temporal Legal Retrieval)** và **bằng chứng snapshot bất biến (Immutable Evidence)**.

Đây **KHÔNG PHẢI** là công cụ vector search hay semantic similarity (RAG) thông thường. AI Agent khi kết nối với MCP này bắt buộc phải vận hành dưới các bất biến an toàn (Safety Invariants):

```text
draft != effective                      (Dự thảo không phải là luật có hiệu lực)
issued != effective                     (Ngày ký ban hành khác ngày có hiệu lực)
latest != currently applicable          (Văn bản mới nhất chưa chắc đang áp dụng)
semantic similarity != legal authority  (Độ tương đồng ngữ nghĩa không tạo ra giá trị pháp lý)
LLM inference != legal evidence         (LLM suy diễn không được coi là bằng chứng pháp lý)
document-level != provision-level       (Văn bản còn hiệu lực không đồng nghĩa mọi Điều/Khoản đều còn hiệu lực)
```

> **Nguyên tắc "Fail-Safe":** Nếu hệ thống không thể chứng minh một kết luận pháp lý bằng bằng chứng snapshot chính thức đã kiểm chứng, tool sẽ trả về `answerable: false`. AI Agent tuyệt đối không được tự suy đoán hoặc bịa ra quy định.

---

## 2. Chuẩn Bị Môi Trường & Hạ Tầng

### 2.1. Yêu cầu tiên quyết
- **Node.js**: >= 20.0.0
- **pnpm**: >= 10.0.0
- **Docker & Docker Compose**: Để chạy PostgreSQL 17 và MinIO (S3 compatible)

### 2.2. Khởi động hạ tầng dịch vụ
Mở terminal tại thư mục gốc của dự án (`mcp-ai-tax`):

```bash
# 1. Khởi động PostgreSQL và MinIO
docker compose up -d postgres minio

# 2. Kiểm tra container đã healthy
docker compose ps

# 3. Chạy migration khởi tạo cấu trúc cơ sở dữ liệu (13 bảng)
pnpm db:migrate

# 4. (Tùy chọn) Nạp dữ liệu kiểm thử hoặc chạy pipeline ingestion
pnpm ingest:persistent
```

---

## 3. Hướng Dẫn Tích Hợp Vào AI Agent / MCP Client

Server hỗ trợ giao thức **stdio** (mặc định cho local clients) và HTTP streamable.

### 3.1. Cấu hình cho Cursor IDE
Tạo hoặc chỉnh sửa file `.cursor/mcp.json` tại thư mục dự án hoặc trong thiết lập toàn cục của Cursor:

```json
{
  "mcpServers": {
    "vietnam-tax-legal": {
      "command": "node",
      "args": [
        "--import",
        "tsx",
        "E:/05_AI/Projects/mcp-ai-tax/apps/mcp-server/src/index.ts"
      ],
      "env": {
        "NODE_ENV": "development",
        "MCP_TRANSPORT": "stdio",
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5433/vietnam_tax_legal",
        "OBJECT_STORAGE_ENDPOINT": "http://localhost:9000",
        "OBJECT_STORAGE_BUCKET": "vietnam-tax-legal",
        "OBJECT_STORAGE_ACCESS_KEY": "minioadmin",
        "OBJECT_STORAGE_SECRET_KEY": "minioadmin",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 3.2. Cấu hình cho Claude Desktop
Mở file cấu hình Claude Desktop:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vietnam-tax-legal": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "E:/05_AI/Projects/mcp-ai-tax/apps/mcp-server/src/index.ts"
      ],
      "env": {
        "NODE_ENV": "development",
        "MCP_TRANSPORT": "stdio",
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5433/vietnam_tax_legal",
        "OBJECT_STORAGE_ENDPOINT": "http://localhost:9000",
        "OBJECT_STORAGE_BUCKET": "vietnam-tax-legal",
        "OBJECT_STORAGE_ACCESS_KEY": "minioadmin",
        "OBJECT_STORAGE_SECRET_KEY": "minioadmin"
      }
    }
  }
}
```

---

## 4. Chi Tiết 4 MCP Legal Tools Chuẩn

Hệ thống expose đúng 4 công cụ pháp lý cốt lõi. Hãy chọn tool phù hợp theo bảng ma trận sau:

| Tool Name | Mục đích sử dụng | Khi nào nên dùng? | Khi nào KHÔNG nên dùng? |
|---|---|---|---|
| `get_effective_tax_rules` | Truy xuất quy định pháp luật và hướng dẫn áp dụng tại ngày `effective_at` | Hỏi về chính sách, nghĩa vụ thuế, điều kiện được khấu trừ, tỷ lệ thuế hiện hành hoặc trong quá khứ | Không dùng khi chỉ muốn tìm số hiệu hoặc danh sách văn bản ban hành |
| `search_legal_docs` | Tìm kiếm văn bản theo từ khóa, số hiệu (`document_number`), cơ quan ban hành (`issuer`), chủ đề (`topics`) | Tìm văn bản cụ thể (VD: "123/2020/NĐ-CP"), lấy UUID hoặc `canonical_id` | Không dùng để kết luận một điều luật có đang áp dụng hay không |
| `get_legal_document` | Lấy chi tiết toàn văn, Điều/Khoản, quan hệ pháp lý (`amends`, `repeals`, `guides`) và bằng chứng snapshot | Khi đã có ID văn bản, cần audit sâu từng điều khoản hoặc xem lịch sử bị sửa đổi | Không dùng để tìm kiếm diện rộng |
| `latest_tax_updates` | Lấy các sự kiện pháp lý mới trong N ngày qua (`published`, `became_effective`, `amended`, `repealed`) | Cập nhật bản tin chính sách mới ban hành, tổng hợp biến động pháp lý gần đây | Tuyệt đối không dùng để trả lời câu hỏi "Luật hiện hành quy định thế nào?" |

---

### 4.1. Tool 1: `get_effective_tax_rules` (Quan Trọng Nhất)

Đây là tool chủ lực để trả lời mọi câu hỏi tư vấn áp dụng luật thuế.

#### Input Parameters:
- `query` (string, required): Vấn đề pháp lý hoặc nội dung thuế cần tra cứu (VD: `"thuế hộ kinh doanh phương pháp khoán"`).
- `effective_at` (string, optional, format `YYYY-MM-DD`): Mốc thời gian đánh giá hiệu lực. Mặc định là ngày hiện tại theo múi giờ `Asia/Ho_Chi_Minh`.
- `topics` (array of string, optional): `["vat", "cit", "pit", "invoice", "household_business", "tax_administration", "customs", "accounting"]`.
- `include_official_guidance` (boolean, default `true`): Bao gồm cả Công văn hướng dẫn nghiệp vụ cùng với Văn bản quy phạm pháp luật (VBQPPL).
- `limit` (number, default `10`): Số lượng quy tắc tối đa trả về.

#### Output Structure:
- `effective_at`: Mốc ngày đánh giá hiệu lực.
- `answerable`: `true` nếu có đủ bằng chứng snapshot; `false` nếu dữ liệu chưa đủ hoặc mâu thuẫn.
- `rules`: Danh sách các quy tắc thuộc VBQPPL (Luật, Nghị định, Thông tư) đang có hiệu lực thi hành tại `effective_at`.
  - Kèm `provision`: Nội dung cụ thể của Điều, Khoản, Điểm.
  - Kèm `evidence`: Snapshot ID, SHA-256 hash, URL nguồn chính thức.
- `official_guidance`: Các công văn hướng dẫn hành chính của Tổng cục Thuế / Cục Thuế liên quan (được phân tách rõ ràng, không đánh đồng với VBQPPL).
- `warnings`: Cảnh báo rủi ro (nếu có xung đột hoặc điều khoản chuyển tiếp).

---

### 4.2. Tool 2: `search_legal_docs`

Dùng để định danh văn bản, tra cứu số hiệu hoặc tìm kiếm danh mục văn bản liên quan.

#### Input Parameters:
- `query` (string, required): Từ khóa hoặc số hiệu văn bản (VD: `"123/2020/NĐ-CP"`, `"khấu trừ thuế GTGT"`).
- `document_number` (string, optional): Lọc chính xác theo số hiệu (VD: `"78/2014/TT-BTC"`).
- `issuer` (string, optional): Cơ quan ban hành (VD: `"Bộ Tài chính"`, `"Chính phủ"`).
- `document_type` (string, optional): `"law"`, `"decree"`, `"circular"`, `"decision"`, `"official_letter"`.
- `document_nature` (string, optional): `"normative_legal_document"`, `"official_guidance"`.
- `issued_from` / `issued_to` (string, optional): Khoảng ngày ban hành `YYYY-MM-DD`.
- `topics` (array of string, optional): Lọc theo chủ đề thuế.
- `limit` (number, default `20`).

---

### 4.3. Tool 3: `get_legal_document`

Dùng để xem chi tiết cấu trúc văn bản, cây Điều/Khoản và mạng lưới quan hệ hiệu lực.

#### Input Parameters:
- `document_id` (string, required): UUID hoặc Canonical ID (VD: `"VN:ND:2020:123-ND-CP"`).
- `include_provisions` (boolean, default `true`): Lấy toàn bộ danh sách Điều/Khoản đã bóc tách.
- `include_relationships` (boolean, default `true`): Lấy quan hệ sửa đổi (`amends`), bãi bỏ (`repeals`), thay thế (`replaces`), hướng dẫn (`guides`).
- `include_evidence` (boolean, default `true`): Lấy chi tiết bằng chứng nguồn snapshot.

---

### 4.4. Tool 4: `latest_tax_updates`

Dùng để theo dõi dòng sự kiện (legal events feed) mới nhất.

#### Input Parameters:
- `topic` (string, optional): Chủ đề thuế cần theo dõi.
- `days` (number, default `30`): Số ngày gần đây cần lấy sự kiện (1 đến 365).
- `event_types` (array of string, optional):
  - `"published"` (được đăng Công báo)
  - `"issued"` (được ký ban hành)
  - `"became_effective"` (bắt đầu có hiệu lực thi hành)
  - `"amended"` (bị sửa đổi)
  - `"repealed"` (bị bãi bỏ toàn bộ hoặc một phần)
- `limit` (number, default `20`).

---

## 5. Quy Trình Vận Hành Tiêu Chuẩn (SOP) Cho AI Agent

### Kịch bản 1: Người dùng hỏi quy định hiện hành
> **Câu hỏi:** *"Hộ kinh doanh doanh thu dưới 100 triệu có phải nộp thuế GTGT không?"*

```mermaid
graph TD
    A[Nhận câu hỏi của User] --> B[Gọi get_effective_tax_rules]
    B -->|effective_at = Hôm nay| C{answerable == true?}
    C -->|Có| D[Tách riêng VBQPPL và Công văn]
    D --> E[Trích dẫn Điều/Khoản & Số hiệu văn bản]
    E --> F[Trả lời theo cấu trúc chuẩn]
    C -->|Không| G[Thông báo chưa đủ chứng cứ nguồn đã xác thực]
```

1. **Bước 1**: Gọi ngay `get_effective_tax_rules` với `query="ngưỡng doanh thu nộp thuế GTGT hộ kinh doanh"` (không cần truyền `effective_at`, server tự lấy ngày hiện tại ở Việt Nam).
2. **Bước 2**: Kiểm tra `answerable`:
   - Nếu `false`: Trả lời từ chối kèm lý do hệ thống chưa có đủ snapshot kiểm chứng.
   - Nếu `true`: Đọc kết quả trong `rules`.
3. **Bước 3**: Trích dẫn chính xác tên văn bản (VD: Thông tư 40/2021/TT-BTC), Điều khoản cụ thể và ngày hiệu lực.

### Kịch bản 2: Người dùng hỏi về kỳ tính thuế trong quá khứ
> **Câu hỏi:** *"Năm 2021 chi phí lãi vay của giao dịch liên kết khống chế ở mức bao nhiêu phần trăm?"*

1. **Sai lầm chết người**: Không truyền `effective_at`, khiến hệ thống lấy luật năm 2026 trả lời cho kỳ thuế 2021.
2. **Cách làm chuẩn**:
   - Xác định năm tính thuế là 2021 (mốc thời điểm kết thúc năm tài chính: `2021-12-31`).
   - Gọi `get_effective_tax_rules` với `effective_at: "2021-12-31"`.
   - Kết quả sẽ trỏ đúng Nghị định 132/2020/NĐ-CP (có hiệu lực từ 20/12/2020) và loại bỏ các văn bản sửa đổi phát sinh sau năm 2021.

---

## 6. System Prompt Mẫu Cho AI Agent

Để đưa vào **System Prompt** của ứng dụng hoặc file `.cursorrules` / `AGENT.md`:

```markdown
Bạn là Chuyên viên Pháp chế & Thuế Việt Nam cấp cao, tích hợp Vietnam Tax & Legal MCP.
Khi trả lời câu hỏi chuyên môn, bạn TUÂN THỦ NGHIÊM NGẶT các quy tắc:

1. QUY TẮC HIỆU LỰC THỜI GIAN:
   - Với mọi câu hỏi về quyền, nghĩa vụ, điều kiện, biểu thuế: BẮT BUỘC gọi tool `get_effective_tax_rules`.
   - Nếu vụ việc diễn ra trong quá khứ (VD: kỳ thuế 2022), BẮT BUỘC đặt tham số `effective_at` tương ứng với mốc thời gian đó (VD: "2022-12-31").

2. PHÂN BIỆT ĐẲNG CẤP VĂN BẢN:
   - VBQPPL (Luật, Nghị quyết, Nghị định, Thông tư): Có giá trị bắt buộc chung, là căn cứ pháp lý cao nhất.
   - Công văn hướng dẫn (Official Guidance): Chỉ có giá trị tham khảo cách giải quyết hành chính của cơ quan thuế cho trường hợp cụ thể, KHÔNG phải là nguồn quy phạm pháp luật. Không được coi công văn là luật bắt buộc chung.

3. NGUYÊN TẮC BẰNG CHỨNG (FAIL-SAFE):
   - Nếu MCP trả về `answerable: false` hoặc mã lỗi `INSUFFICIENT_EVIDENCE`: TUYỆT ĐỐI KHÔNG tự suy đoán câu trả lời. Hãy trả lời trung thực: "Hệ thống chưa có đủ bằng chứng snapshot chính thức để kết luận chắc chắn về điều khoản này."
   - Nếu phát hiện `verification.conflicts` hoặc `warnings`: Phải công khai sự khác biệt giữa các nguồn chính thức cho người dùng.

4. CẤU TRÚC PHẢN HỒI CHUẨN:
   Mọi câu trả lời kết luận thuế phải tuân thủ form:
   - 📌 **Kết luận**: (Câu trả lời trực tiếp, rõ ràng)
   - 📜 **Căn cứ pháp lý**: (Số hiệu văn bản, Cơ quan ban hành, Ngày ban hành)
   - 🔍 **Điều / Khoản áp dụng**: (Trích dẫn nguyên văn hoặc tóm lược chính xác)
   - ⏱️ **Tình trạng hiệu lực**: (Ngày có hiệu lực tại mốc thời gian được hỏi)
   - 📑 **Công văn hướng dẫn liên quan**: (Nếu có)
   - ⚠️ **Lưu ý / Rủi ro**: (Cảnh báo điều khoản chuyển tiếp, xung đột nếu có)
```

---

## 7. Bảng Mã Lỗi MCP Thường Gặp & Cách Xử Lý

Khi tool trả về lỗi (`isError: true`), mã lỗi nằm trong payload `error.code`:

| Error Code | Ý nghĩa | Cách Agent xử lý |
|---|---|---|
| `DOCUMENT_NOT_FOUND` | Không tìm thấy văn bản theo ID cung cấp | Gọi `search_legal_docs` với từ khóa rộng hơn để tìm đúng số hiệu |
| `INSUFFICIENT_EVIDENCE` | Nguồn dữ liệu chưa đủ snapshot để chứng minh hiệu lực | Không tự bịa; thông báo rõ cho người dùng dữ liệu chưa được nạp/xác thực |
| `LEGAL_STATUS_CONFLICT` | Có sự mâu thuẫn trạng thái hiệu lực giữa các nguồn chính thức | Liệt kê cả 2 nguồn và khuyến nghị tham vấn cơ quan thuế địa phương |
| `DATE_OUT_OF_RANGE` | Ngày `effective_at` vượt quá phạm vi dữ liệu hoặc sai định dạng | Chuẩn hóa lại ngày về format `YYYY-MM-DD` |
| `VERIFICATION_PENDING` | Dữ liệu vừa ingest nhưng chưa qua bộ kiểm tra Rule A/B/C/D | Báo cho người dùng tài liệu đang trong hàng đợi kiểm duyệt |

---

## 8. Danh Mục Anti-Patterns (Những Việc Cấm Làm)

1. ❌ **CẤM:** Dùng `latest_tax_updates` để trả lời câu hỏi "Luật hiện hành quy định gì?".  
   *(Một luật ban hành từ năm 2019 vẫn đang áp dụng nhưng không nằm trong update 30 ngày qua).*
2. ❌ **CẤM:** Lấy trạng thái văn bản áp dụng chung cho mọi Điều/Khoản.  
   *(Một Nghị định đang hiệu lực nhưng Điều 15 có thể đã bị bãi bỏ từ năm ngoái).*
3. ❌ **CẤM:** Tự ý kết luận hiệu lực dựa trên tiêu đề văn bản hoặc tin tức báo chí.  
   *(Báo chí có thể giật tít "Chính phủ đề xuất giảm thuế", nhưng đề xuất đó chưa phải luật ban hành).*
4. ❌ **CẤM:** Bỏ qua tham số `effective_at` khi người dùng hỏi tình huống quá khứ.
5. ❌ **CẤM:** Trộn lẫn nội dung Công văn hỏi đáp với quy định Thông tư/Nghị định thành một nhóm.
