import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { v4 as uuidv4 } from "uuid";

export type ChunkMeta = {
  id: string;
  content: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
};

/**
 * Splits text into chunks and tracks char positions
 */
export async function chunkText(
  text: string,
  chunkSize = 500,
  chunkOverlap = 200
): Promise<ChunkMeta[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });

  const chunks = await splitter.splitText(text);

  const chunksMeta: ChunkMeta[] = [];

  let cursor = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const foundAt = text.indexOf(chunk, cursor);
    const start = foundAt >= 0 ? foundAt : cursor;
    const end = start + chunk.length;

    chunksMeta.push({
      id: uuidv4(),
      content: chunk,
      chunkIndex: i,
      charStart: start,
      charEnd: end,
    });

    cursor = end;
  }

  return chunksMeta;
}