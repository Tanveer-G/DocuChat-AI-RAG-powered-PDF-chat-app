import pdfParse, { Result as PdfParseResult } from "@cedrugs/pdf-parse";

export type ExtractResult = {
  text: string;
  numPages: number;
};

export async function extractTextFromPDF(
  inputFile: File | Buffer,
): Promise<ExtractResult> {
  const buffer: Buffer = Buffer.isBuffer(inputFile)
    ? inputFile
    : Buffer.from(await inputFile.arrayBuffer());

  const raw: PdfParseResult = await pdfParse(buffer);

  return {
    text: (raw.text ?? "").trim(),
    numPages: raw.numpages ?? 0, // normalize here
  };
}
