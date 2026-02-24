// import { InferenceClient } from "@huggingface/inference";

// export async function createHuggingFaceEmbeddings(
//   chunks: string[]
// ): Promise<{ content: string; embedding: number[] }[]> {
//   const token = process.env.HF_API_TOKEN;
//   if (!token) {
//     throw new Error("HF_API_TOKEN is not defined");
//   }

//   const client = new InferenceClient(token);

//   const results = await client.featureExtraction({
//     model: "sentence-transformers/all-MiniLM-L6-v2",
//     inputs: chunks,
//   });

//   return chunks.map((text, index) => ({
//     content: text,
//     embedding: results[index] as number[],
//   }));
// }

import { InferenceClient } from "@huggingface/inference";

/**
 * Return shape for compatibility with your existing code.
 */
export type EmbeddingItem = {
  content: string;
  embedding: number[];
};

let _hfClient: InferenceClient | null = null;
function getHFClient(token?: string) {
  if (_hfClient) return _hfClient;
  const envToken = token ?? process.env.HF_API_TOKEN;
  if (!envToken) throw new Error("HF_API_TOKEN is not defined");
  _hfClient = new InferenceClient(envToken);
  return _hfClient;
}

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (!isFinite(norm) || norm === 0) return vec;
  return vec.map((v) => v / norm);
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Embed a batch of texts (with retries + simple validation).
 */
async function embedBatch(
  client: InferenceClient,
  inputs: string[],
  model = "sentence-transformers/all-MiniLM-L6-v2",
  maxRetries = 3,
  retryDelayMs = 400
): Promise<number[][]> {
  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt <= maxRetries) {
    try {
      const res = await client.featureExtraction({ model, inputs }) as number[][] | number[];
      if (res == null) throw new Error("Empty response from inference API");

      // Normalize shapes:
      // - expected number[][]
      // - sometimes single number[] for single input
      if (Array.isArray(res)) {
        const first = res[0];
        if (Array.isArray(first) && typeof first[0] === "number") {
          return res as number[][];
        }
        if (typeof first === "number") {
          // single embedding returned as flat array (only valid if inputs.length === 1)
          if (inputs.length === 1) return [res as number[]];
        }
      }

      throw new Error("Unexpected embedding shape from inference API");
    } catch (err: unknown) {
      lastErr = err;
      attempt++;
      console.debug(`Embedding attempt ${attempt} failed:`, err);
      if (attempt > maxRetries) break;
      // exponential backoff with jitter
      const jitter = 0.5 + Math.random() * 0.5;
      const wait = Math.round(retryDelayMs * Math.pow(2, attempt - 1) * jitter);
      await sleep(wait);
    }
  }

  throw new Error(`Failed embedding batch after retries: ${String(lastErr)}`);
}

/**
 * Main exported function.
 * - Batches the 'chunks' array into batchSize
 * - Runs up to 'concurrency' batches in parallel
 * - Preserves original ordering in the returned array
 */
export async function createHuggingFaceEmbeddings(
  chunks: string[],
  opts?: {
    model?: string;
    batchSize?: number; // number of texts per API call
    concurrency?: number; // number of batches to run in parallel
    normalize?: boolean;
    token?: string;
    maxRetries?: number;
    retryDelayMs?: number;
  }
): Promise<EmbeddingItem[]> {
  if (!Array.isArray(chunks)) throw new TypeError("chunks must be a string[]");

  const {
    model = "sentence-transformers/all-MiniLM-L6-v2",
    batchSize = 16,
    concurrency = 3,
    normalize = true,
    token,
    maxRetries = 3,
    retryDelayMs = 400,
  } = opts ?? {};

  const client = getHFClient(token);

  // early return
  if (chunks.length === 0) return [];

  // create batches with original start index so we can preserve order
  const batches: { start: number; inputs: string[] }[] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    batches.push({ start: i, inputs: chunks.slice(i, i + batchSize) });
  }

  // prepare output array and fill as we get embeddings
  const outputs: (EmbeddingItem | null)[] = new Array(chunks.length).fill(null);

  // process batches in "concurrency" groups
  for (let i = 0; i < batches.length; i += concurrency) {
    const group = batches.slice(i, i + concurrency);

    const groupPromises = group.map(async (batch) => {
      if (batch.inputs.length === 0) return;
      const embeddingsBatch = await embedBatch(
        client,
        batch.inputs,
        model,
        maxRetries,
        retryDelayMs
      );

      if (embeddingsBatch.length !== batch.inputs.length) {
        // defensive check
        throw new Error(
          `Embeddings count (${embeddingsBatch.length}) != inputs count (${batch.inputs.length})`
        );
      }

      for (let j = 0; j < batch.inputs.length; j++) {
        const emb = embeddingsBatch[j];
        if (!Array.isArray(emb) || emb.some((v) => typeof v !== "number")) {
          throw new Error(`Invalid embedding vector at global index ${batch.start + j}`);
        }
        const finalEmb = normalize ? l2Normalize(emb) : emb;
        outputs[batch.start + j] = {
          content: batch.inputs[j],
          embedding: finalEmb,
        };
      }
    });

    // run this group of batch-promises in parallel
    await Promise.all(groupPromises);
  }

  // convert to typed array (non-null checked)
  return outputs.map((o, idx) => {
    if (o === null) {
      // should never happen, defensive fallback
      throw new Error(`Missing embedding for input index ${idx}`);
    }
    return o;
  });
}