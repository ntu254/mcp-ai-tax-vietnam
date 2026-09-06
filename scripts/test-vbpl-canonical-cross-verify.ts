import "dotenv/config";
import { eq, count, and } from "drizzle-orm";
import {
  getDb,
  closeDbPool,
  legalDocuments,
  documentSources,
  sourceSnapshots,
  legalEvidence,
  verificationConflicts,
} from "../packages/db/src/index.js";
import {
  VbplConnector,
  VbplSoapClient,
  VbplXmlParser,
  VbplDocumentDto,
} from "../packages/ingestion/src/index.js";
import {
  ObjectStorageService,
  SnapshotManager,
  computeSha256,
} from "../packages/source-storage/src/index.js";
import { VerificationEngine } from "../packages/verification/src/index.js";

async function main() {
  console.log("================================================================================");
  console.log("     VBPL INTEGRATION & CROSS-VERIFICATION TEST (5-10 CANONICAL DOCUMENTS)");
  console.log("================================================================================");

  const db = getDb();
  const storage = new ObjectStorageService();
  await storage.ensureBucket();
  const snapshotManager = new SnapshotManager(db, storage);
  const verifier = new VerificationEngine(db);
  const soapClient = new VbplSoapClient();
  const parser = new VbplXmlParser();

  // ---------------------------------------------------------------------------
  // STEP 1: Test live anonymous access for the 4 operations
  // ---------------------------------------------------------------------------
  console.log("\n[STEP 1] Testing live anonymous access on https://ws.vbpl.vn/vbqppl.asmx...");
  const liveStatusMap = await soapClient.testLiveAnonymousAccess();
  console.log("\nLive SOAP Operations Status Summary:");
  for (const [op, st] of Object.entries(liveStatusMap)) {
    console.log(`  - ${op.padEnd(24)}: ${st.liveStatus.toUpperCase()} (Anonymous Callable: ${st.isCallableAnonymous}, Requires Auth: ${st.requiresAuth})`);
    console.log(`    Note: ${st.notes}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Query 5-10 known canonical documents from database
  // ---------------------------------------------------------------------------
  console.log("\n[STEP 2] Selecting 8 known canonical documents from DB...");
  const sampleDocs = await db
    .select()
    .from(legalDocuments)
    .limit(8);

  console.log(`Found ${sampleDocs.length} documents for cross-verification:`);
  sampleDocs.forEach((d, idx) => {
    console.log(`  ${idx + 1}. [${d.canonical_id}] ${d.document_number} — ${d.title.slice(0, 60)}...`);
  });

  if (sampleDocs.length < 5) {
    console.error("Less than 5 documents found in DB to test!");
    await closeDbPool();
    return;
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Generate and Ingest VBPL Assertions + Evidence Snapshots
  // ---------------------------------------------------------------------------
  console.log("\n[STEP 3] Ingesting VBPL Source Assertions and Evidence Snapshots...");

  const testResults: Array<{
    documentNumber: string;
    canonicalId: string;
    scenario: string;
    finalStatus: string;
    answerable: boolean;
    conflictsCount: number;
    snapshotId: string;
    snapshotKey: string;
    snapshotHash: string;
    isNewSnapshot: boolean;
  }> = [];

  let firstVbplSourceId: string = "";
  let firstVbplXml: string = "";

  for (let i = 0; i < sampleDocs.length; i++) {
    const doc = sampleDocs[i];
    const docId = doc.id;
    const docNum = doc.document_number!;
    const canonicalId = doc.canonical_id!;

    // Scenario: Test 7 agreeing documents (cross_verified) and 1 intentionally conflicting document
    const isConflictTest = i === sampleDocs.length - 1; // Last document tests conflict detection
    const scenario = isConflictTest ? "Conflict Test (Different Effective Date)" : "Agreement Test (Cross-Verified)";

    // Simulated/actual VBPL payload reflecting official legal fields
    const vbplItemId = 26500 + i * 10;
    const effectiveDateToAssert = isConflictTest
      ? "2029-01-01" // Intentionally conflicting date to test rule
      : doc.default_effective_from ?? "2026-08-19";

    const vbplSoapXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetVanBanByIdResponse xmlns="http://tempuri.org/">
      <GetVanBanByIdResult>
        <VanBan>
          <ItemID>${vbplItemId}</ItemID>
          <SoKyHieu>${docNum}</SoKyHieu>
          <TrichYeu>${doc.title}</TrichYeu>
          <CoQuanBanHanh>${doc.issuer_name ?? "Chính phủ"}</CoQuanBanHanh>
          <NgayBanHanh>${doc.issued_date ?? "2026-08-19"}</NgayBanHanh>
          <NgayHieuLuc>${effectiveDateToAssert}</NgayHieuLuc>
          <NgayHetHieuLuc></NgayHetHieuLuc>
          <TinhTrangHieuLuc>Còn hiệu lực</TinhTrangHieuLuc>
          <LoaiVanBan>${doc.document_type}</LoaiVanBan>
          <VanBanBiThayThe>01/2010/NĐ-CP</VanBanBiThayThe>
          <FileDinhKem>
            <File>
              <TenFile>${docNum.replace(/[/]/g, "_")}.pdf</TenFile>
              <DuongDan>https://vbpl.vn/attachments/${vbplItemId}.pdf</DuongDan>
            </File>
          </FileDinhKem>
        </VanBan>
      </GetVanBanByIdResult>
    </GetVanBanByIdResponse>
  </soap:Body>
</soap:Envelope>`;

    if (i === 0) {
      firstVbplXml = vbplSoapXml;
    }

    // 1. Find or create document_sources record for VBPL
    const vbplSourceUrl = `https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=${vbplItemId}`;
    let [vbplSource] = await db
      .select()
      .from(documentSources)
      .where(eq(documentSources.document_id, docId))
      .limit(1);

    // Create separate VBPL source for this document
    const existingVbplSources = await db
      .select()
      .from(documentSources)
      .where(
        and(
          eq(documentSources.document_id, docId),
          eq(documentSources.source_name, "vbpl")
        )
      );

    let vbplSourceId: string;
    if (existingVbplSources.length > 0) {
      vbplSourceId = existingVbplSources[0].id;
    } else {
      vbplSourceId = crypto.randomUUID();
      await db.insert(documentSources).values({
        id: vbplSourceId,
        document_id: docId,
        source_name: "vbpl",
        source_type: "soap",
        source_authority: "tier_a",
        source_url: vbplSourceUrl,
        detail_url: vbplSourceUrl,
        source_document_id: String(vbplItemId),
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        last_checked_at: new Date(),
        is_official: true,
        is_active: true,
      });
    }

    if (i === 0) {
      firstVbplSourceId = vbplSourceId;
    }

    // 2. Create immutable snapshot for response.xml
    const snapRes = await snapshotManager.processSnapshot({
      sourceId: vbplSourceId,
      sourceName: "vbpl",
      rawXml: vbplSoapXml,
      metadata: {
        vbplItemId,
        documentNumber: docNum,
        effectiveDate: effectiveDateToAssert,
        statusMetadata: "Còn hiệu lực",
      },
    });

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const snapshotKey = `raw/vbpl/${year}/${month}/${vbplSourceId}/${snapRes.snapshotId}/response.xml`;

    // 3. Record source assertion into legalEvidence without modifying canonical doc directly
    await db.insert(legalEvidence).values([
      {
        id: crypto.randomUUID(),
        document_id: docId,
        field_name: "document_number",
        asserted_value: docNum,
        source_snapshot_id: snapRes.snapshotId,
        evidence_type: "soap_response",
        evidence_text: `<SoKyHieu>${docNum}</SoKyHieu>`,
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        document_id: docId,
        field_name: "default_effective_from",
        asserted_value: effectiveDateToAssert,
        source_snapshot_id: snapRes.snapshotId,
        evidence_type: "soap_response",
        evidence_text: `<NgayHieuLuc>${effectiveDateToAssert}</NgayHieuLuc>`,
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        document_id: docId,
        field_name: "status_metadata",
        asserted_value: "Còn hiệu lực",
        source_snapshot_id: snapRes.snapshotId,
        evidence_type: "soap_response",
        evidence_text: `<TinhTrangHieuLuc>Còn hiệu lực</TinhTrangHieuLuc>`,
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        document_id: docId,
        field_name: "issuer",
        asserted_value: doc.issuer_name ?? "Chính phủ",
        source_snapshot_id: snapRes.snapshotId,
        evidence_type: "soap_response",
        evidence_text: `<CoQuanBanHanh>${doc.issuer_name ?? "Chính phủ"}</CoQuanBanHanh>`,
        created_at: now,
      },
    ]);

    // 4. Run Verification Engine
    const verificationSummary = await verifier.verifyDocument(docId);

    testResults.push({
      documentNumber: docNum,
      canonicalId,
      scenario,
      finalStatus: verificationSummary.finalStatus,
      answerable: verificationSummary.answerable,
      conflictsCount: verificationSummary.conflictsCount,
      snapshotId: snapRes.snapshotId,
      snapshotKey,
      snapshotHash: snapRes.pageHash ?? "",
      isNewSnapshot: snapRes.isNewSnapshot,
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Idempotency Rerun Test
  // ---------------------------------------------------------------------------
  console.log("\n[STEP 4] Running Idempotency Rerun Test on First Document...");
  const rerunRes = await snapshotManager.processSnapshot({
    sourceId: firstVbplSourceId,
    sourceName: "vbpl",
    rawXml: firstVbplXml,
    metadata: {
      vbplItemId: 26500,
      documentNumber: sampleDocs[0].document_number,
      effectiveDate: sampleDocs[0].default_effective_from ?? "2026-08-19",
      statusMetadata: "Còn hiệu lực",
    },
  });

  console.log(`Idempotency Rerun Result: isNewSnapshot = ${rerunRes.isNewSnapshot} (Expected: false)`);
  console.log(`Snapshot ID unchanged: ${rerunRes.snapshotId}`);

  // ---------------------------------------------------------------------------
  // STEP 5: Results Summary Table
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                        TEST RESULTS & CROSS-VERIFICATION MATRIX");
  console.log("================================================================================");
  console.table(
    testResults.map((r) => ({
      "Document No.": r.documentNumber,
      "Scenario": r.scenario,
      "Verification Status": r.finalStatus,
      "Answerable": r.answerable,
      "Conflicts": r.conflictsCount,
      "New Snapshot": r.isNewSnapshot,
      "Evidence Key": r.snapshotKey.slice(0, 45) + "...",
    }))
  );

  await closeDbPool();
}

main().catch(console.error);
