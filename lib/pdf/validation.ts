import { extractTextFromPDF } from "@/lib/pdf/extractText";

export const DEFAULTS = {
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME: ["application/pdf", "application/x-pdf"],
  MIN_EXTRACTED_CHARS: 50,
  MIN_PAGES: 1,
  MAX_PAGES: 12,
  MAX_CHUNKS: 2000,
  MIN_CHUNK_COUNT: 1,
  DEFAULT_CHUNK_SIZE_CHARS: 500,
  DEFAULT_CHUNK_OVERLAP_CHARS: 200,
};

export class ValidationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.status = status;
  }
}

/**
 * File-level validation
 */
export async function validateFileToBuffer(
  file: File | null
): Promise<Buffer> {
  if (!file) {
    throw new ValidationError("NO_FILE", "No file uploaded", 400);
  }

  if (!DEFAULTS.ALLOWED_MIME.includes(file.type)) {
    throw new ValidationError("INVALID_MIME", "Only PDF files are allowed", 400);
  }

  if (file.size > DEFAULTS.MAX_FILE_BYTES) {
    throw new ValidationError("FILE_TOO_LARGE", "File exceeds 10MB limit", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!buffer.slice(0, 4).toString("utf8").startsWith("%PDF")) {
    throw new ValidationError("INVALID_PDF_HEADER", "Invalid PDF file", 400);
  }

  return buffer;
}

/**
 * Full validation
 */
export async function validatePdfQuick(
  file: File | null,
  opts?: Partial<typeof DEFAULTS>
) {
  const merged = { ...DEFAULTS, ...(opts ?? {}) };

  // 1️⃣ Validate file
  const buffer = await validateFileToBuffer(file);

  // 2️⃣ Parse PDF (single read)
  let parsed;
  try {
    parsed = await extractTextFromPDF(buffer);
  } catch {
    throw new ValidationError(
      "PDF_PARSE_ERROR",
      "Unable to parse PDF (corrupted or unsupported)",
      400
    );
  }

  const text = (parsed.text ?? "").trim();
  const numPages = parsed.numPages ?? 0;

  // 3️⃣ Content validations

  if (numPages < merged.MIN_PAGES) {
    throw new ValidationError(
      "PDF_TOO_FEW_PAGES",
      `PDF must have at least ${merged.MIN_PAGES} page(s)`,
      400
    );
  }

  if (numPages > merged.MAX_PAGES) {
    throw new ValidationError(
      "PDF_TOO_MANY_PAGES",
      `PDF exceeds ${merged.MAX_PAGES} page limit`,
      413
    );
  }

  if (!text || text.length < merged.MIN_EXTRACTED_CHARS) {
    throw new ValidationError(
      "PDF_NO_EXTRACTABLE_TEXT",
      "PDF does not contain extractable text (image-only PDFs not supported)",
      400
    );
  }

  // 4️⃣ Chunk estimation
  const effectiveChunkSize =
    merged.DEFAULT_CHUNK_SIZE_CHARS -
    merged.DEFAULT_CHUNK_OVERLAP_CHARS;

  const estimatedChunks = Math.max(
    merged.MIN_CHUNK_COUNT,
    Math.ceil(text.length / Math.max(1, effectiveChunkSize))
  );

  if (estimatedChunks > merged.MAX_CHUNKS) {
    throw new ValidationError(
      "TOO_MANY_CHUNKS",
      `Document would create ~${estimatedChunks} chunks (limit ${merged.MAX_CHUNKS})`,
      413
    );
  }

  return {
    text,
    numPages,
    estimatedChunks,
    buffer,
  };
}