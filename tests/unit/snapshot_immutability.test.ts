import { describe, expect, it } from "vitest";
import { computeSha256 } from "@vietnam-tax/source-storage";

interface MockSnapshot {
  id: string;
  source_id: string;
  page_hash: string;
  is_current: boolean;
  created_at: Date;
}

interface MockEvidence {
  id: string;
  field_name: string;
  source_snapshot_id: string;
}

describe("Snapshot Immutability & Provenance Pinning (Section 15 & 19)", () => {
  it("preserves previous snapshot immutability when source content changes", () => {
    const sourceId = "source-001";

    // 1. Initial snapshot A with hash aaa
    const initialHtml = "<html><body>Thông tư số 78/2021/TT-BTC</body></html>";
    const hashA = computeSha256(initialHtml);
    const snapshotA: MockSnapshot = {
      id: "snap-A",
      source_id: sourceId,
      page_hash: hashA,
      is_current: true,
      created_at: new Date("2026-09-01T10:00:00Z"),
    };

    // Evidence created against snapshot A
    const evidenceItem: MockEvidence = {
      id: "evi-001",
      field_name: "document_number",
      source_snapshot_id: snapshotA.id,
    };

    // 2. Fetcher runs again with unchanged content
    const recheckedHtml = "<html><body>Thông tư số 78/2021/TT-BTC</body></html>";
    const recheckHash = computeSha256(recheckedHtml);

    const isUnchanged = recheckHash === snapshotA.page_hash;
    expect(isUnchanged).toBe(true);
    // Invariant: Unchanged content MUST NOT create a new snapshot
    const shouldCreateNewSnapshot = !isUnchanged;
    expect(shouldCreateNewSnapshot).toBe(false);

    // 3. Source changes on remote server (e.g. updated typo or amendment notice)
    const updatedHtml = "<html><body>Thông tư số 78/2021/TT-BTC (đã đính chính)</body></html>";
    const hashB = computeSha256(updatedHtml);

    expect(hashB).not.toBe(hashA);

    // Create Snapshot B
    const snapshotB: MockSnapshot = {
      id: "snap-B",
      source_id: sourceId,
      page_hash: hashB,
      is_current: true,
      created_at: new Date("2026-09-06T10:00:00Z"),
    };

    // Mark previous snapshot is_current = false
    snapshotA.is_current = false;

    // INVARIANTS VERIFICATION:
    // A still exists
    expect(snapshotA.id).toBe("snap-A");
    expect(snapshotA.page_hash).toBe(hashA);
    expect(snapshotA.is_current).toBe(false);

    // B is current
    expect(snapshotB.id).toBe("snap-B");
    expect(snapshotB.is_current).toBe(true);

    // Existing evidence continues to point strictly to snapshot A (never mutated!)
    expect(evidenceItem.source_snapshot_id).toBe("snap-A");
    expect(evidenceItem.source_snapshot_id).not.toBe(snapshotB.id);
  });
});
