import { PDFParse } from "pdf-parse";
import { logger } from "@vietnam-tax/observability";

export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  if (!pdfBuffer || pdfBuffer.byteLength === 0) {
    return "";
  }

  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    await parser.destroy();

    const extracted = result?.text ?? "";
    logger.debug(
      {
        byteLength: pdfBuffer.byteLength,
        textLength: extracted.length,
        pages: result?.total,
      },
      "Extracted text from official PDF"
    );
    return extracted;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: msg },
      "Failed to extract text from PDF buffer, falling back to empty"
    );
    return "";
  }
}
