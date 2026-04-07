import { addEmbedding } from "agent-swarm-kit";
import { tidy, mul, norm, sum, tensor1d, div } from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-wasm";
import { OpenAIClient } from "@langchain/openai";
import { EmbeddingName } from "../enum/EmbeddingName";
import { CC_OPENAI_API_KEY, CC_OPENAI_EMBEDDING_MODEL } from "../config/params";

const openai = new OpenAIClient({
  apiKey: CC_OPENAI_API_KEY,
});

addEmbedding({
  embeddingName: EmbeddingName.OpenAIEmbedding,
  calculateSimilarity: async (a, b) => {
    return tidy(() => {
      const tensorA = tensor1d(a);
      const tensorB = tensor1d(b);
      const dotProduct = sum(mul(tensorA, tensorB));
      const normA = norm(tensorA);
      const normB = norm(tensorB);
      const cosineData = div(dotProduct, mul(normA, normB)).dataSync();
      const cosineSimilarity = cosineData[0];
      return cosineSimilarity;
    });
  },
  createEmbedding: async (text) => {
    const response = await openai.embeddings.create({
      model: CC_OPENAI_EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  },
});
