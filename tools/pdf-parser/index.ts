import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create require from root to access node_modules
const rootDir = path.resolve(__dirname, "../..");
const require = createRequire(path.join(rootDir, "package.json"));
const { PDFParse } = require("pdf-parse");

const LEGAL_DOCS_DIR = "../../data/legal-docs/uz";
const OUTPUT_DIR = "../../data/legal-chunks/uz";

// Chunk size configuration
const CHUNK_SIZE = 1500; // characters per chunk
const CHUNK_OVERLAP = 200; // overlap between chunks

interface LegalChunk {
  id: string;
  source: string;
  content: string;
}

function splitIntoChunks(text: string, source: string): LegalChunk[] {
  const chunks: LegalChunk[] = [];

  // Clean up text - add spaces between words that are stuck together
  const cleanText = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Add space before uppercase Uzbek/Cyrillic letters that follow lowercase
    .replace(/([a-zа-яўқғҳ])([A-ZА-ЯЎҚҒҲ])/g, "$1 $2")
    // Add space before numbers that follow letters
    .replace(/([a-zA-Zа-яА-ЯўҚғҲ])(\d)/g, "$1 $2")
    // Add space after period/colon if followed by letter
    .replace(/([.;:])([a-zA-Zа-яА-ЯўҚғҲ])/g, "$1 $2")
    // Fix common patterns
    .replace(/(\d+)-modda\./gi, "\n$1-modda. ")
    .replace(/(\d+)-bob\./gi, "\n$1-bob. ")
    .replace(/\s+/g, " ")
    .trim();

  // Simple chunking with overlap
  let start = 0;
  let chunkIndex = 0;

  while (start < cleanText.length) {
    let end = Math.min(start + CHUNK_SIZE, cleanText.length);
    let chunkText = cleanText.slice(start, end);

    // Try to end at sentence boundary
    if (end < cleanText.length) {
      const lastPeriod = chunkText.lastIndexOf(".");
      if (lastPeriod > CHUNK_SIZE * 0.6) {
        chunkText = chunkText.slice(0, lastPeriod + 1);
      }
    }

    if (chunkText.trim().length > 100) {
      chunks.push({
        id: `${source}_${chunkIndex}`,
        source,
        content: chunkText.trim(),
      });
      chunkIndex++;
    }

    start += chunkText.length - CHUNK_OVERLAP;
    if (start <= 0 || chunkText.length <= CHUNK_OVERLAP) {
      start += CHUNK_OVERLAP + 100; // Prevent infinite loop
    }
  }

  return chunks;
}

async function parsePDF(filePath: string): Promise<string> {
  const dataBuffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function main() {
  const legalDocsPath = path.resolve(__dirname, LEGAL_DOCS_DIR);
  const outputPath = path.resolve(__dirname, OUTPUT_DIR);

  // Create output directory
  await fs.mkdir(outputPath, { recursive: true });

  // Get all PDF files
  const files = await fs.readdir(legalDocsPath);
  const pdfFiles = files.filter((f) => f.endsWith(".pdf"));

  console.log(`Found ${pdfFiles.length} PDF files`);

  const allChunks: LegalChunk[] = [];

  for (const file of pdfFiles) {
    const filePath = path.join(legalDocsPath, file);
    const source = file.replace(".pdf", "");

    console.log(`Processing: ${file}`);

    try {
      const text = await parsePDF(filePath);
      console.log(`  Extracted ${text.length} characters`);

      const chunks = splitIntoChunks(text, source);
      console.log(`  Created ${chunks.length} chunks`);

      allChunks.push(...chunks);

      // Save individual file chunks
      await fs.writeFile(
        path.join(outputPath, `${source}.json`),
        JSON.stringify(chunks, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error(`  Error processing ${file}:`, error);
    }
  }

  // Save combined chunks file
  await fs.writeFile(
    path.join(outputPath, "_all_chunks.json"),
    JSON.stringify(allChunks, null, 2),
    "utf-8"
  );

  console.log(`\nTotal: ${allChunks.length} chunks saved to ${outputPath}`);
}

main().catch(console.error);
