// Option 1: Keep using the SDK but note it doesn't support abort (fallback)

// import { InferenceClient } from "@huggingface/inference";

// const client = new InferenceClient(process.env.HF_API_TOKEN);

// export async function getEmbedding(text: string): Promise<number[]> {
//  const result = await client.featureExtraction({
//       model: "sentence-transformers/all-MiniLM-L6-v2",
//       inputs: text,
//     });
//   return result as number[];
// }

import { InferenceClient } from "@huggingface/inference";

let client: InferenceClient | null = null;

function getClient(): InferenceClient {
  if (!client) {
    const token = process.env.HF_API_TOKEN;
    if (!token) throw new Error("HF_API_TOKEN is not defined");
    client = new InferenceClient(token);
  }
  return client;
}

export async function getEmbedding(
  text: string,
  options?: { signal?: AbortSignal } // signal is accepted but not used by SDK
): Promise<number[]> {
  const c = getClient();

  // Use Promise.race to add a timeout (5 seconds by default)
  const timeoutMs = 5000;
  const result = await Promise.race([
    c.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: text, // SDK accepts a single string
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Embedding timeout")), timeoutMs)
    ),
  ]);

  // The SDK returns a number[] for a single input
  return result as number[];
}