import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type EmbeddingSaveRow = {
  id: string; // uuid
  document_id: string;
  chunk_index: number;
  page_number: number;
  content: string;
  embedding: number[]; // vector array for pgvector
  char_start?: number;
  char_end?: number;
  created_at?: string;
};

/**
 * Save embeddings to supabase in batches.
 *
 * - Validates that all embeddings share the same vector length.
 * - Inserts in batches to avoid payload size limits.
 * - Throws on first failure with a helpful message.
 *
 */
export async function saveEmbeddings(
  rows: EmbeddingSaveRow[],
  opts?: { batchSize?: number }
): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const batchSize = opts?.batchSize ?? 50; // adjust to your environment

  // Verify consistent embedding dimension
  const dims = rows.map((r) => r.embedding?.length ?? 0);
  const uniqueDims = Array.from(new Set(dims));
  if (uniqueDims.length !== 1) {
    throw new Error(
      `Inconsistent embedding dimensions found: ${JSON.stringify(
        uniqueDims
      )}. All embeddings must have same length`
    );
  }
  const dim = uniqueDims[0];
  if (dim <= 0) {
    throw new Error("Invalid embedding dimension (0). Check embedding generation.");
  }

  // Insert in batches
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    // Optional: add created_at server side in DB with default now()
    const { error } = await supabaseAdmin.from("pdf_chunks").insert(chunk);
    if (error) {
      // include helpful context for debugging
      throw new Error(
        `Failed to insert embeddings batch starting at ${i}: ${error.message}`
      );
    }
  }
}