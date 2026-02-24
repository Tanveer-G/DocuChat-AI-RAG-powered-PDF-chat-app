/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEmbedding } from "@/lib/pdf/getEmbedding";
import { NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/buildSystemPrompt";
import { Role } from "@/types/chat";
import { randomUUID } from "node:crypto";
import { withTimeoutPromise } from "@/lib/withTimeoutPromise";

// Types
interface ChunkFromDb {
  id: string;
  content: string;
  page_number: number;
  similarity: number | string | null;
}

interface Chunk {
  id: string;
  content: string;
  page_number: number;
  similarity: number;
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  sessionId: string;
  role: Role;
}

// Initialize provider
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Configurable thresholds (documented)
const MIN_SIMILARITY = Number.parseFloat(process.env.MIN_SIMILARITY ?? "0.35");
const MATCH_COUNT = Number.parseInt(process.env.MATCH_COUNT ?? "8", 10);
const MATCH_THRESHOLD = Number.parseFloat(
  process.env.MATCH_THRESHOLD ?? "0.25",
);
const FALLBACK_THRESHOLD = Number.parseFloat(
  process.env.FALLBACK_THRESHOLD ?? "0.10",
);
const FALLBACK_COUNT = Number.parseInt(process.env.FALLBACK_COUNT ?? "20", 10);
const MATCH_COUNT_FINAL = Number.parseInt(
  process.env.MATCH_COUNT_FINAL ?? "12",
  10,
);
const PER_CHUNK_CHARS = Number.parseInt(
  process.env.PER_CHUNK_CHARS ?? "2000",
  10,
);
const EMBEDDING_TIMEOUT_MS = Number.parseInt(
  process.env.EMBEDDING_TIMEOUT_MS ?? "5000",
  10,
);
const RPC_TIMEOUT_MS = Number.parseInt(
  process.env.RPC_TIMEOUT_MS ?? "5000",
  10,
);
const RPC_FALLBACK_TIMEOUT_MS = Number.parseInt(
  process.env.RPC_FALLBACK_TIMEOUT_MS ?? "7000",
  10,
);

/**
 * Convert raw supabase rows to typed chunks (defensive)
 */
function normalizeChunks(rows: ChunkFromDb[] = []): Chunk[] {
  return rows.map((r) => {
    const sim =
      typeof r.similarity === "string"
        ? Number.parseFloat(r.similarity)
        : typeof r.similarity === "number"
          ? r.similarity
          : 0;
    return {
      id: r.id,
      content: String(r.content ?? ""),
      page_number: Number(r.page_number ?? 0),
      similarity: Number.isFinite(sim) ? sim : 0,
    };
  });
}

/**
 * Promise timeout with AbortController (for fetch‑based operations)
 */
function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  ms: number,
  errorMsg = "timeout",
): Promise<T> {
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutId = setTimeout(() => controller.abort(), ms);

  return promiseFactory(signal)
    .then((result) => {
      clearTimeout(timeoutId);
      return result;
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(errorMsg);
      }
      throw err;
    });
}

/**
 * Basic sanitize for user text: remove control chars, collapse whitespace, limit length.
 */
export function sanitizeText(s: string, maxLen = 3000): string {
  if (!s) return "";

  const cleaned = String(s)
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

  if (cleaned.length > maxLen) {
    return cleaned.slice(0, maxLen - 3).trimEnd() + "...";
  }

  return cleaned;
}

// Service for retrieving chunks (adaptive)
async function retrieveChunks(
  question: string,
  sessionId: string,
  requestId: string,
): Promise<Chunk[]> {
  try {
    // 1. Embedding with timeout and validation
    let questionEmbedding: number[];
    try {
      questionEmbedding = await withTimeout(
        (signal) => getEmbedding(question, { signal }), // uses updated getEmbedding with abort
        EMBEDDING_TIMEOUT_MS,
        "getEmbedding timeout",
      );
    } catch (err) {
      console.error(`[${requestId}] Embedding failure:`, err);
      throw new Error("Failed to compute query embedding.");
    }
    if (!Array.isArray(questionEmbedding) || questionEmbedding.length === 0) {
      throw new Error("Invalid embedding returned.");
    }
    if (questionEmbedding.length !== 384) {
      console.warn(
        `[${requestId}] Unexpected embedding dimension: ${questionEmbedding.length}`,
      );
      // still proceed, but warn
    }

    // 2. Initial attempt (strict)
    let raw1: any;
    try {
      const p = supabaseAdmin.rpc("match_chunks", {
        query_embedding: questionEmbedding,
        session_id: sessionId,
        match_threshold: MATCH_THRESHOLD,
        match_count: MATCH_COUNT,
      });
      raw1 = await withTimeoutPromise(
        Promise.resolve(p),
        RPC_TIMEOUT_MS,
        "Supabase initial timeout",
      );
    } catch (error_: any) {
      throw new Error(
        `Supabase error (initial): ${error_?.message ?? String(error_)}`,
      );
    }

    const chunks1 = normalizeChunks((raw1?.data as ChunkFromDb[]) || []);
    const topSim1 = chunks1.length
      ? Math.max(...chunks1.map((c) => c.similarity))
      : 0;

    if (topSim1 >= MIN_SIMILARITY) return chunks1;

    // 3. Fallback attempt
    let raw2: any;
    try {
      const p2 = supabaseAdmin.rpc("match_chunks", {
        query_embedding: questionEmbedding,
        session_id: sessionId,
        match_threshold: FALLBACK_THRESHOLD,
        match_count: FALLBACK_COUNT,
      });
      raw2 = await withTimeoutPromise(
        Promise.resolve(p2),
        RPC_FALLBACK_TIMEOUT_MS,
        "Supabase fallback timeout",
      );
    } catch (error_: any) {
      console.warn(`[${requestId}] Supabase fallback error:`, error_);
      return chunks1;
    }
    const chunks2 = normalizeChunks((raw2?.data as ChunkFromDb[]) || []);

    // Merge, dedupe, sort, limit
    const map = new Map<string, Chunk>();
    [...chunks1, ...chunks2].forEach((c) => {
      const existing = map.get(c.id);
      if (!existing || c.similarity > existing.similarity) map.set(c.id, c);
    });
    const merged = Array.from(map.values()).sort(
      (a, b) => b.similarity - a.similarity,
    );
    return merged.slice(0, MATCH_COUNT_FINAL);
  } catch (err) {
    console.error(`[${requestId}] Chunk retrieval failed:`, err);
    throw new Error("Failed to retrieve relevant content from PDF.");
  }
}

export async function POST(req: Request) {
  const requestId = randomUUID(); // unique ID for this request
  try {
    const { messages, sessionId, role } = (await req.json()) as ChatRequest;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 },
      );
    }

    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage?.role !== "user") {
      return NextResponse.json(
        { error: "Last message must be from the user" },
        { status: 400 },
      );
    }

    // Sanitize user input
    const userQuestion = sanitizeText(lastMessage.content, 3000);

    // Retrieve chunks (with requestId for logging)
    const chunks = await retrieveChunks(userQuestion, sessionId, requestId);

    // Build sources for frontend
    const sources = (chunks || []).map((c) => ({
      page: c.page_number,
      similarity: Number(c.similarity.toFixed(4)),
      excerpt:
        c.content.length > 200
          ? `${c.content.substring(0, 200)}...`
          : c.content,
    }));

    const topSim = chunks.length
      ? Math.max(...chunks.map((c) => c.similarity))
      : 0;
    console.info(`[${requestId}] RAG stats:`, {
      count: chunks.length,
      topSim,
      sessionId,
    });

    // Gate on similarity
    if (!chunks.length || topSim < MIN_SIMILARITY) {
      return NextResponse.json(
        {
          answer: "INSUFFICIENT_CONTEXT",
          reason: !chunks.length ? "no_chunks_found" : "low_similarity",
          topSimilarity: topSim,
          sources,
        },
        { status: 200 },
      );
    }

    // Truncate each chunk to per‑chunk cap and sanitise content
    const truncatedChunksForPrompt = chunks.map((c) => ({
      page_number: c.page_number,
      content: sanitizeText(
        c.content.length > PER_CHUNK_CHARS
          ? c.content.slice(0, PER_CHUNK_CHARS - 3).trimEnd() + "..."
          : c.content,
        PER_CHUNK_CHARS,
      ),
    }));

    // Build system prompt with dynamic role
    const systemPrompt = buildSystemPrompt(truncatedChunksForPrompt, role, {
      maxContextChars: 14000,
      perChunkChars: PER_CHUNK_CHARS,
    });

    // Custom stream: sources JSON + delimiter + text stream
    const encoder = new TextEncoder();
const customStream = new ReadableStream({
  async start(controller) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      // Send sources first
      controller.enqueue(
        encoder.encode(JSON.stringify({ sources }) + "\n---\n")
      );

      const temp = role === "strict_qa" ? 0.2 : 0.5;

      const result = streamText({
        model: openrouter("openrouter/free"),
        system: systemPrompt,
        messages: [{ role: "user", content: userQuestion }],
        temperature: temp,
      });

      const textResponse = result.toTextStreamResponse();

      if (!textResponse?.body) {
        throw new Error("No stream body from model");
      }

      reader = textResponse.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          controller.enqueue(value);
        }
      }

      controller.close();
    } catch (err: unknown) {
      console.error(`[${requestId}] Streaming error:`, err);

      try {
        controller.enqueue(
          encoder.encode("\n\n[STREAM_ERROR]\n")
        );
      } catch (enqueueErr: unknown) {
        console.error(
          `[${requestId}] Failed to enqueue stream error:`,
          enqueueErr
        );
      }

      controller.close();
    } finally {
      if (reader) {
        try {
          await reader.cancel();
        } catch (cancelErr: unknown) {
          console.warn(
            `[${requestId}] Failed to cancel reader:`,
            cancelErr
          );
        }
      }
    }
  },

  cancel(reason: unknown) {
    console.info(
      `[${requestId}] Stream cancelled:`,
      reason
    );
  },
});

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Request-Id": requestId,
      },
    });
  } catch (error: unknown) {
    console.error(`[${requestId}] Chat API error:`, error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
