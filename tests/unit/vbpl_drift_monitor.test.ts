import { describe, expect, it } from "vitest";
import { VbplSchemaDriftMonitor } from "@vietnam-tax/ingestion";
import { VbplDocumentDto } from "@vietnam-tax/ingestion";

describe("VbplSchemaDriftMonitor — Circuit Breaker & Drift Detection (Step 3)", () => {
  const monitor = new VbplSchemaDriftMonitor({
    minExtractionRatePct: 80,
    minEffectiveDateRatePct: 70,
    maxSelectorFailures: 2,
  });

  const healthyDto: VbplDocumentDto = {
    documentNumber: "123/2020/NĐ-CP",
    title: "Nghị định quy định về hóa đơn",
    issuer: "Chính phủ",
    issuedDate: "2020-10-19",
    effectiveDate: "2022-07-01",
    statusMetadata: "Còn hiệu lực",
    relationships: [],
    history: [],
    attachments: [],
    sourceUrl: "https://vbpl.vn",
    sourceAuthority: "tier_a",
  };

  it("evaluates healthy sample batch as HEALTHY with safeToIngest=true", () => {
    const samples = Array(10).fill(healthyDto);
    const htmlSample = "<html><body><table><tr><td>Số ký hiệu:</td><td>123</td></tr></table></body></html>";

    const report = monitor.evaluateBatch(samples, htmlSample);

    expect(report.circuitStatus).toBe("HEALTHY");
    expect(report.safeToIngest).toBe(true);
    expect(report.extractionSuccessRatePct).toBe(100);
    expect(report.fieldCoveragePct.effectiveDate).toBe(100);
    expect(report.flags).toHaveLength(0);
  });

  it("trips circuit breaker when extraction success rate drops below 80% (DEGRADED + VBPL_SCHEMA_CHANGED)", () => {
    // 3 good samples, 7 degraded samples (missing effective date and title)
    const degradedDto: VbplDocumentDto = {
      ...healthyDto,
      title: "",
      effectiveDate: undefined,
    };
    const samples = [...Array(3).fill(healthyDto), ...Array(7).fill(degradedDto)];

    const report = monitor.evaluateBatch(samples);

    expect(report.circuitStatus).toBe("DEGRADED");
    expect(report.safeToIngest).toBe(false);
    expect(report.flags).toContain("VBPL_SCHEMA_CHANGED");
    expect(report.extractionSuccessRatePct).toBe(30);
  });

  it("detects HTML structure fingerprint shift", () => {
    const samples = Array(5).fill(healthyDto);
    const oldHtml = "<html><body><div class='header'><h1>Title</h1></div></body></html>";
    const newHtml = "<html><body><main><article><section><h1>New Title</h1></section></article></main></body></html>";

    const initialReport = monitor.evaluateBatch(samples, oldHtml);
    const driftReport = monitor.evaluateBatch(samples, newHtml, initialReport.htmlFingerprint);

    expect(driftReport.fingerprintChanged).toBe(true);
    expect(driftReport.flags).toContain("HTML_FINGERPRINT_SHIFT");
  });
});
