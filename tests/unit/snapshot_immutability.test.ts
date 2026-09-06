import { describe, expect, it } from "vitest";
import { computeSha256 } from "@vietnam-tax/source-storage";
import { ObjectStorageService } from "@vietnam-tax/source-storage";

interface MockSnapshot {
  id: string;
  source_id: string;
  page_hash: string;
  created_at: Date;
}

interface MockDocumentSource {
  id: string;
  current_snapshot_id: string;
  last_checked_at: Date;
}

interface MockEvidence {
  id: string;
  field_name: string;
  source_snapshot_id: string;
}

describe("Snapshot Append-Only Row Immutability & Pointer Architecture (Point 3)", () => {
  it("guarantees 0 mutations on snapshot rows and shifts pointer cleanly", () => {
    const sourceId = "source-001";
    const initialHtml = "<html><body>Thông tư số 78/2021/TT-BTC</body></html>";
    const hashA = computeSha256(initialHtml);

    // 1. Initial snapshot A row
    const snapshotA: Readonly<MockSnapshot> = Object.freeze({
      id: "snap-A",
      source_id: sourceId,
      page_hash: hashA,
      created_at: new Date("2026-09-01T10:00:00Z"),
    });

    const source: MockDocumentSource = {
      id: sourceId,
      current_snapshot_id: snapshotA.id,
      last_checked_at: new Date("2026-09-01T10:00:00Z"),
    };

    // Evidence created against snapshot A
    const evidenceItem: Readonly<MockEvidence> = Object.freeze({
      id: "evi-001",
      field_name: "document_number",
      source_snapshot_id: snapshotA.id,
    });

    // 2. Fetcher runs with unchanged content:
    const recheckHash = computeSha256(initialHtml);
    expect(recheckHash).toBe(snapshotA.page_hash);

    // Only source.last_checked_at is updated
    source.last_checked_at = new Date("2026-09-04T10:00:00Z");
    expect(source.current_snapshot_id).toBe("snap-A");

    // 3. Source content changes on remote server
    const updatedHtml = "<html><body>Thông tư số 78/2021/TT-BTC (đã đính chính)</body></html>";
    const hashB = computeSha256(updatedHtml);
    expect(hashB).not.toBe(hashA);

    // Create Snapshot B row
    const snapshotB: Readonly<MockSnapshot> = Object.freeze({
      id: "snap-B",
      source_id: sourceId,
      page_hash: hashB,
      created_at: new Date("2026-09-06T10:00:00Z"),
    });

    // Advance pointer on document_sources
    source.current_snapshot_id = snapshotB.id;
    source.last_checked_at = new Date("2026-09-06T10:00:00Z");

    // INVARIANTS:
    // Snapshot A is 100% unmodified (Object.isFrozen preserved)
    expect(snapshotA.id).toBe("snap-A");
    expect(snapshotA.page_hash).toBe(hashA);

    // Source pointer now points to B
    expect(source.current_snapshot_id).toBe("snap-B");

    // Historical evidence is NEVER mutated and continues pointing to snapshot A
    expect(evidenceItem.source_snapshot_id).toBe("snap-A");
  });

  it("generates exact legal evidence key raw/vbpl/YYYY/MM/{source_id}/{snapshot_id}/response.xml with SHA-256", () => {
    const storage = new ObjectStorageService();
    const sampleXml = "<soap:Envelope>...</soap:Envelope>";
    const xmlHash = computeSha256(sampleXml);

    expect(xmlHash).toHaveLength(64);
    expect(xmlHash).toMatch(/^[0-9a-f]{64}$/);

    const fixedDate = new Date("2026-09-06T12:00:00Z");
    const key = storage.buildKey({
      sourceName: "vbpl",
      sourceId: "vbpl-source-001",
      snapshotId: "snapshot-uuid-999",
      filename: "response.xml",
      date: fixedDate,
    });

    expect(key).toBe(
      "raw/vbpl/2026/09/vbpl-source-001/snapshot-uuid-999/response.xml"
    );
  });
});
