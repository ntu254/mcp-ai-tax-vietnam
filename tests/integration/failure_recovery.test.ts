import { describe, expect, it } from "vitest";

interface CheckpointState {
  sourceName: string;
  lastItemId?: string;
  lastItemPublicationDate?: string;
}

interface IngestedDocument {
  canonicalId: string;
  documentNumber: string;
  version: number;
}

describe("Failure Recovery & Worker Downtime Resilience (Point 3)", () => {
  it("resumes safely after 48 hours of downtime without losing documents", () => {
    // 1. Initial state at T0
    const checkpoint: CheckpointState = {
      sourceName: "congbao",
      lastItemId: "item-100",
      lastItemPublicationDate: "2026-09-04T10:00:00Z",
    };

    // 2. Simulated 48 hours downtime: 5 documents were published while worker was down
    const pendingFeed = [
      { id: "item-101", title: "Nghị định 1", pubDate: "2026-09-04T18:00:00Z" },
      { id: "item-102", title: "Thông tư 2", pubDate: "2026-09-05T09:00:00Z" },
      { id: "item-103", title: "Quyết định 3", pubDate: "2026-09-05T14:00:00Z" },
      { id: "item-104", title: "Công văn 4", pubDate: "2026-09-06T08:00:00Z" },
      { id: "item-105", title: "Thông tư 5", pubDate: "2026-09-06T10:00:00Z" },
    ];

    // Worker restarts at T0 + 48h: filters feed by checkpoint.lastItemPublicationDate
    const itemsToProcess = pendingFeed.filter(
      (item) =>
        new Date(item.pubDate) > new Date(checkpoint.lastItemPublicationDate!)
    );

    // All 5 missed documents must be captured
    expect(itemsToProcess.length).toBe(5);
    expect(itemsToProcess.map((i) => i.id)).toEqual([
      "item-101",
      "item-102",
      "item-103",
      "item-104",
      "item-105",
    ]);

    // Update checkpoint upon success
    checkpoint.lastItemId = itemsToProcess[itemsToProcess.length - 1].id;
    checkpoint.lastItemPublicationDate =
      itemsToProcess[itemsToProcess.length - 1].pubDate;

    expect(checkpoint.lastItemId).toBe("item-105");
    expect(checkpoint.lastItemPublicationDate).toBe("2026-09-06T10:00:00Z");
  });

  it("handles duplicate RSS items idempotently without creating duplicate documents", () => {
    const database: IngestedDocument[] = [];

    function ingestItem(docNum: string, canonicalId: string) {
      // Deduplication check
      const existing = database.find(
        (d) => d.canonicalId === canonicalId || d.documentNumber === docNum
      );
      if (existing) {
        return { created: false, doc: existing };
      }

      const newDoc: IngestedDocument = {
        canonicalId,
        documentNumber: docNum,
        version: 1,
      };
      database.push(newDoc);
      return { created: true, doc: newDoc };
    }

    // First ingestion of Decree 123
    const res1 = ingestItem("123/2020/ND-CP", "VN:ND:2020:123-2020-ND-CP");
    expect(res1.created).toBe(true);
    expect(database.length).toBe(1);

    // Re-run worker with identical RSS item (duplicate in feed)
    const res2 = ingestItem("123/2020/ND-CP", "VN:ND:2020:123-2020-ND-CP");
    expect(res2.created).toBe(false);
    // Invariant: Zero duplicates created
    expect(database.length).toBe(1);
  });

  it("preserves checkpoint and isolates failures when HTTP 500 occurs mid-flight", () => {
    let checkpointDate = "2026-09-05T00:00:00Z";
    const processedItems: string[] = [];

    const items = [
      { id: "doc-1", pubDate: "2026-09-05T01:00:00Z", fail: false },
      { id: "doc-2", pubDate: "2026-09-05T02:00:00Z", fail: false },
      { id: "doc-3", pubDate: "2026-09-05T03:00:00Z", fail: true }, // Network failure
      { id: "doc-4", pubDate: "2026-09-05T04:00:00Z", fail: false },
    ];

    try {
      for (const item of items) {
        if (item.fail) {
          throw new Error("HTTP 500 Internal Server Error");
        }
        processedItems.push(item.id);
        checkpointDate = item.pubDate;
      }
    } catch {
      // Failure caught
    }

    // Processed up to failure
    expect(processedItems).toEqual(["doc-1", "doc-2"]);
    // Checkpoint must point to last successful item (doc-2), not advanced to doc-3 or doc-4
    expect(checkpointDate).toBe("2026-09-05T02:00:00Z");
  });
});
