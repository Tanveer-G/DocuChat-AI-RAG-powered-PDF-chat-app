import { NextRequest, NextResponse } from "next/server";
import { validatePdfQuick, ValidationError } from "@/lib/pdf/validation";
import { chunkText } from "@/lib/pdf/chunkText";
import { approximatePagesForChunks } from "@/lib/pdf/pageMapping";
import { createHuggingFaceEmbeddings } from "@/lib/pdf/createEmbedding";
import { saveEmbeddings } from "@/lib/pdf/saveEmbeddings";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    // 1️⃣ Validate + extract
    let validated;
    try {
      validated = await validatePdfQuick(file);
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.status }
        );
      }
      throw err;
    }

    const { text, numPages } = validated;

    // 2️⃣ Chunk
    const chunks = await chunkText(text);

    // 3️⃣ Page mapping
    const chunksWithPages = approximatePagesForChunks(
      text,
      numPages,
      chunks
    );

    // 4️⃣ Embeddings
    const contents = chunksWithPages.map((c) => c.content);
    const embeddings = await createHuggingFaceEmbeddings(contents);

    // 5️⃣ Insert document
    const sessionId = uuidv4();

    const { data: document, error } = await supabaseAdmin
      .from("pdf_documents")
      .insert({
        user_session: sessionId,
        file_name: file?.name,
        total_pages: numPages,
      })
      .select()
      .single();

    if (error || !document?.id) {
      throw new Error("Failed to create document");
    }

    // 6️⃣ Save chunks
    await saveEmbeddings(
      embeddings.map((e, idx) => ({
        id: chunksWithPages[idx].id,
        document_id: document.id,
        chunk_index: chunksWithPages[idx].chunkIndex,
        page: chunksWithPages[idx].page,
        content: e.content,
        embedding: e.embedding,
        char_start: chunksWithPages[idx].charStart,
        char_end: chunksWithPages[idx].charEnd,
      }))
    );

    return NextResponse.json({
      success: true,
      sessionId,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}