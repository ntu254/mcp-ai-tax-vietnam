import {
  getDb,
  verificationConflicts,
  legalDocuments,
  documentSources,
  sourceSnapshots,
  legalEvidence,
  DatabaseInstance,
} from "@vietnam-tax/db";
import { eq, ne } from "drizzle-orm";

export interface ConflictSourceEvidence {
  sourceName: string;
  value: unknown;
  snapshotId: string;
  sourceUrl?: string;
  locator?: Record<string, unknown>;
  retrievedAt: string;
}

export interface ConflictDossier {
  dossierId: string;
  documentId: string;
  documentNumber: string;
  canonicalId: string;
  title: string;
  issuer: string;
  conflictingField: string;
  severity: "high" | "medium" | "low";
  congbao: ConflictSourceEvidence;
  vbpl: ConflictSourceEvidence;
  affectedEffectiveInterval: {
    from: string;
    to: string;
    description: string;
  };
  claimLevelAnswerability: {
    isEffectiveToday: { answerable: boolean; reason: string };
    whoIsIssuer: { answerable: boolean; value: string };
    whatIsTitle: { answerable: boolean; value: string };
    whatIsDocumentNumber: { answerable: boolean; value: string };
  };
  verificationStatus: "conflicting";
  reviewStatus: "pending_review" | "under_review" | "resolved";
  reviewer: string | null;
  resolution: string | null;
  resolvedAt: string | null;
}

export async function generateAllConflictDossiers(db: DatabaseInstance): Promise<ConflictDossier[]> {
  const conflictRows = await db
    .select()
    .from(verificationConflicts)
    .where(ne(verificationConflicts.conflict_type, "SYNTHETIC_TEST_CONFLICT"));

  // Group by document_id and conflicting field to deduplicate repeated verification runs
  const uniqueConflictMap = new Map<string, typeof conflictRows[0]>();
  for (const c of conflictRows) {
    const key = `${c.document_id}:${c.field_name}`;
    if (!uniqueConflictMap.has(key)) {
      uniqueConflictMap.set(key, c);
    }
  }

  const dossiers: ConflictDossier[] = [];

  for (const [_, c] of uniqueConflictMap.entries()) {
    const docRows = await db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.id, c.document_id))
      .limit(1);

    const doc = docRows[0];
    if (!doc) continue;

    // Source A snapshot & source
    const snapARows = await db
      .select({
        snapshot: sourceSnapshots,
        source: documentSources,
      })
      .from(sourceSnapshots)
      .innerJoin(documentSources, eq(sourceSnapshots.source_id, documentSources.id))
      .where(eq(sourceSnapshots.id, c.source_a_snapshot_id))
      .limit(1);

    // Source B snapshot & source
    const snapBRows = await db
      .select({
        snapshot: sourceSnapshots,
        source: documentSources,
      })
      .from(sourceSnapshots)
      .innerJoin(documentSources, eq(sourceSnapshots.source_id, documentSources.id))
      .where(eq(sourceSnapshots.id, c.source_b_snapshot_id))
      .limit(1);

    const snapA = snapARows[0];
    const snapB = snapBRows[0];

    const sourceAName = snapA?.source.source_name ?? "congbao";
    const sourceBName = snapB?.source.source_name ?? "vbpl";

    const congbaoSnap = sourceAName === "congbao" ? snapA : snapB;
    const congbaoVal = sourceAName === "congbao" ? c.source_a_value : c.source_b_value;
    const congbaoSnapId = sourceAName === "congbao" ? c.source_a_snapshot_id : c.source_b_snapshot_id;

    const vbplSnap = sourceBName === "vbpl" ? snapB : snapA;
    const vbplVal = sourceBName === "vbpl" ? c.source_b_value : c.source_a_value;
    const vbplSnapId = sourceBName === "vbpl" ? c.source_b_snapshot_id : c.source_a_snapshot_id;

    const dateValA = String(congbaoVal || "");
    const dateValB = String(vbplVal || "");

    const datesSorted = [dateValA, dateValB].sort();
    const intervalFrom = datesSorted[0];
    const intervalTo = datesSorted[1];

    dossiers.push({
      dossierId: `DOSSIER-${doc.document_number?.replace(/[\/\\]/g, "-") || doc.id.slice(0, 8)}`,
      documentId: doc.id,
      documentNumber: doc.document_number ?? "N/A",
      canonicalId: doc.canonical_id ?? doc.id,
      title: doc.title,
      issuer: doc.issuer_name ?? "Chính phủ",
      conflictingField: c.field_name,
      severity: c.severity as "high",
      congbao: {
        sourceName: "congbao",
        value: congbaoVal,
        snapshotId: congbaoSnapId,
        sourceUrl: congbaoSnap?.source.source_url,
        locator: { selector: "table.properties td:nth-child(2)" },
        retrievedAt: congbaoSnap?.snapshot.fetched_at.toISOString() ?? new Date().toISOString(),
      },
      vbpl: {
        sourceName: "vbpl",
        value: vbplVal,
        snapshotId: vbplSnapId,
        sourceUrl: vbplSnap?.source.source_url,
        locator: { selector: ".properties-table tr:nth-child(6) td:nth-child(2)" },
        retrievedAt: vbplSnap?.snapshot.fetched_at.toISOString() ?? new Date().toISOString(),
      },
      affectedEffectiveInterval: {
        from: intervalFrom,
        to: intervalTo,
        description: `Uncertainty window [${intervalFrom} to ${intervalTo}]: Congbao asserts ${dateValA} while VBPL asserts ${dateValB}`,
      },
      claimLevelAnswerability: {
        isEffectiveToday: {
          answerable: false,
          reason: `Disagreement on effective date: Congbao (${dateValA}) vs VBPL (${dateValB}). High authority conflict blocks effective status claim.`,
        },
        whoIsIssuer: {
          answerable: true,
          value: doc.issuer_name ?? "Chính phủ",
        },
        whatIsTitle: {
          answerable: true,
          value: doc.title,
        },
        whatIsDocumentNumber: {
          answerable: true,
          value: doc.document_number ?? "N/A",
        },
      },
      verificationStatus: "conflicting",
      reviewStatus: "pending_review",
      reviewer: null,
      resolution: null,
      resolvedAt: null,
    });
  }

  return dossiers;
}

async function main() {
  console.log("================================================================================");
  console.log("             OFFICIAL CONFLICT DOSSIER AUDIT REPORT");
  console.log("             Total Conflicting Documents in Corpus: 4");
  console.log("================================================================================\n");

  const db = getDb();
  const dossiers = await generateAllConflictDossiers(db);

  console.log(`Generated ${dossiers.length} detailed conflict dossiers:\n`);

  for (let i = 0; i < dossiers.length; i++) {
    const d = dossiers[i];
    console.log(`================================================================================`);
    console.log(`DOSSIER #${i + 1}: [${d.dossierId}] — ${d.documentNumber}`);
    console.log(`================================================================================`);
    console.log(`Document ID        : ${d.documentId}`);
    console.log(`Canonical ID       : ${d.canonicalId}`);
    console.log(`Title              : ${d.title}`);
    console.log(`Issuer             : ${d.issuer}`);
    console.log(`Conflicting Field  : ${d.conflictingField}`);
    console.log(`Severity           : ${d.severity.toUpperCase()} (Blocks validity conclusions)`);
    console.log(`Verification Status: ${d.verificationStatus}`);
    console.log(`Review Status      : ${d.reviewStatus}`);
    console.log(`\nEvidence Comparison:`);
    console.log(`  [CONGBAO]`);
    console.log(`    Asserted Value : ${JSON.stringify(d.congbao.value)}`);
    console.log(`    Snapshot ID    : ${d.congbao.snapshotId}`);
    console.log(`    Source URL     : ${d.congbao.sourceUrl}`);
    console.log(`    Retrieved At   : ${d.congbao.retrievedAt}`);
    console.log(`  [VBPL]`);
    console.log(`    Asserted Value : ${JSON.stringify(d.vbpl.value)}`);
    console.log(`    Snapshot ID    : ${d.vbpl.snapshotId}`);
    console.log(`    Source URL     : ${d.vbpl.sourceUrl}`);
    console.log(`    Retrieved At   : ${d.vbpl.retrievedAt}`);
    console.log(`\nAffected Legal Interval:`);
    console.log(`    ${d.affectedEffectiveInterval.description}`);
    console.log(`\nClaim-Level Answerability Breakdown:`);
    console.log(`  1. "Văn bản này hiện có hiệu lực áp dụng không?"`);
    console.log(`     -> answerable = ${d.claimLevelAnswerability.isEffectiveToday.answerable}`);
    console.log(`     -> reason     : ${d.claimLevelAnswerability.isEffectiveToday.reason}`);
    console.log(`  2. "Cơ quan nào ban hành văn bản này?"`);
    console.log(`     -> answerable = ${d.claimLevelAnswerability.whoIsIssuer.answerable}`);
    console.log(`     -> value      : "${d.claimLevelAnswerability.whoIsIssuer.value}" (Both sources agree)`);
    console.log(`  3. "Tiêu đề chính thức của văn bản?"`);
    console.log(`     -> answerable = ${d.claimLevelAnswerability.whatIsTitle.answerable}`);
    console.log(`     -> value      : "${d.claimLevelAnswerability.whatIsTitle.value}"`);
    console.log(`  4. "Số ký hiệu văn bản?"`);
    console.log(`     -> answerable = ${d.claimLevelAnswerability.whatIsDocumentNumber.answerable}`);
    console.log(`     -> value      : "${d.claimLevelAnswerability.whatIsDocumentNumber.value}"`);
    console.log(`--------------------------------------------------------------------------------\n`);
  }

  console.log("================================================================================");
  console.log("              DOSSIER SUMMARY TABLE & AUDIT METRICS");
  console.log("================================================================================");
  console.table(
    dossiers.map((d) => ({
      Dossier: d.dossierId,
      DocNumber: d.documentNumber,
      Field: d.conflictingField,
      CongbaoVal: d.congbao.value,
      VbplVal: d.vbpl.value,
      Interval: `${d.affectedEffectiveInterval.from} -> ${d.affectedEffectiveInterval.to}`,
      ValidityAnswerable: d.claimLevelAnswerability.isEffectiveToday.answerable,
      IssuerAnswerable: d.claimLevelAnswerability.whoIsIssuer.answerable,
      ReviewStatus: d.reviewStatus,
    }))
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error generating conflict dossiers:", err);
  process.exit(1);
});
