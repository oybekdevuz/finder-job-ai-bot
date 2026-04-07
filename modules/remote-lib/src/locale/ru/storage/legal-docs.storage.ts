import { addStorage } from "agent-swarm-kit";
import fs from "fs/promises";
import path from "path";
import { StorageName } from 'src/enum/StorageName';
import { EmbeddingName } from 'src/enum/EmbeddingName';

interface ILegalDocData {
  id: string;
  source: string;
  content: string;
}

// Load chunks from JSON file
async function loadLegalChunks(): Promise<ILegalDocData[]> {
  try {
    const chunksPath = path.resolve(process.cwd(), "data/legal-chunks/ru/_all_chunks.json");
    const data = await fs.readFile(chunksPath, "utf-8");
    return JSON.parse(data) as ILegalDocData[];
  } catch (error) {
    console.error("Failed to load legal chunks:", error);
    return [];
  }
}

// Cache for loaded chunks
let cachedChunks: ILegalDocData[] | null = null;

addStorage<ILegalDocData>({
  storageName: StorageName.LegalDocsStorageRu,
  embedding: EmbeddingName.OpenAIEmbedding,
  shared: true, // Share across all clients
  createIndex: (doc) => doc.content,
  getData: async () => {
    if (!cachedChunks) {
      cachedChunks = await loadLegalChunks();
      console.log(`Loaded ${cachedChunks.length} legal document chunks`);
    }
    return cachedChunks;
  },
  setData: async () => {
    // Read-only storage, no writes needed
  },
});

