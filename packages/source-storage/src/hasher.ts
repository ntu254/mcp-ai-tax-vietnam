import { createHash } from "node:crypto";

export function computeSha256(data: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function computeNormalizedTextHash(text: string): string {
  // Normalize whitespace, casing, and unicode NFC
  const normalized = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return createHash("sha256").update(normalized, "utf-8").digest("hex");
}

export function computeObjectHash(obj: Record<string, unknown>): string {
  // Deterministic JSON serialization: sorted keys
  const sortedKeys = Object.keys(obj).sort();
  const canonicalEntries = sortedKeys.map((key) => [key, obj[key]]);
  const serialized = JSON.stringify(canonicalEntries);

  return createHash("sha256").update(serialized, "utf-8").digest("hex");
}
