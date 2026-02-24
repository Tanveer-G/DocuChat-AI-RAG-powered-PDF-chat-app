import type { ChunkMeta } from "./chunkText";

export type ChunkWithPage = ChunkMeta & {
  page: number;
};

/**
 * Approximate page mapping based on character position
 */
export function approximatePagesForChunks(
  fullText: string,
  numPages: number,
  chunksMeta: ChunkMeta[]
): ChunkWithPage[] {
  const totalChars = Math.max(fullText.length, 1);

  return chunksMeta.map((c) => {
    const page =
      Math.floor((c.charStart / totalChars) * numPages) + 1;

    return {
      ...c,
      page: Math.min(Math.max(1, page), numPages),
    };
  });
}