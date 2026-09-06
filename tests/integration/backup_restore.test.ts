import { describe, expect, it } from "vitest";
import { computeSha256 } from "@vietnam-tax/source-storage";
import { simulateBackupAndRestore } from "../../scripts/backup-restore-verify.js";

describe("Database & Object Storage Backup and Restore Verification (Point 5)", () => {
  it("verifies 100% data integrity between primary and restored database", async () => {
    const primaryCounts = {
      legal_documents: 50,
      document_sources: 50,
      source_snapshots: 50,
      legal_provisions: 300,
      legal_evidence: 600,
    };

    const objectPayload = Buffer.from("RAW-OFFICIAL-CONG-BAO-PDF-BINARY");
    const sampleObjects = [
      {
        key: "raw/congbao/2026/09/doc1/snap1/original.pdf",
        originalBuffer: objectPayload,
        hash: computeSha256(objectPayload),
      },
    ];

    const result = await simulateBackupAndRestore(primaryCounts, sampleObjects);

    expect(result.integrityMatches).toBe(true);
    expect(result.objectStorageIntegrityMatches).toBe(true);
    expect(result.restoredSnapshot.legal_documents).toBe(50);
    expect(result.restoredSnapshot.legal_provisions).toBe(300);
    expect(result.tablesVerified).toBe(5);
  });

  it("detects corrupted backup or missing rows upon restore", async () => {
    const primaryCounts = {
      legal_documents: 50,
      document_sources: 50,
      source_snapshots: 50,
      legal_provisions: 300,
      legal_evidence: 600,
    };

    // Corrupted object payload: hash mismatch
    const badObjects = [
      {
        key: "raw/congbao/2026/09/doc1/snap1/original.pdf",
        originalBuffer: Buffer.from("ALTERED-CONTENT"),
        hash: "expected-hash-that-does-not-match",
      },
    ];

    const result = await simulateBackupAndRestore(primaryCounts, badObjects);
    expect(result.objectStorageIntegrityMatches).toBe(false);
  });
});
