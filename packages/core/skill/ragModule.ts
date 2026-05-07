import * as fs from 'fs/promises';
import * as path from 'path';

export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
  source: string;
  chunkId?: string;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface EmbeddingConfig {
  model: string;
  apiKey?: string;
  apiBase?: string;
  dimensions: number;
}

export interface RAGConfig {
  knowledgeBasePath: string;
  vectorStorePath: string;
  embedding: EmbeddingConfig;
  chunkSize: number;
  chunkOverlap: number;
  similarityThreshold: number;
  topK: number;
}

export interface SearchResult {
  document: Document;
  similarity: number;
  relevance: number;
}

export interface RAGQueryResult {
  results: SearchResult[];
  context: string;
  sources: string[];
}

export class RAGModule {
  private documents: Map<string, Document> = new Map();
  private vectorIndex: Map<string, { docId: string; embedding: number[] }> = new Map();
  private config: RAGConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<RAGConfig>) {
    this.config = {
      knowledgeBasePath: './knowledge',
      vectorStorePath: './.vector-store',
      embedding: {
        model: 'text-embedding-3-small',
        dimensions: 1536
      },
      chunkSize: 500,
      chunkOverlap: 50,
      similarityThreshold: 0.7,
      topK: 5,
      ...config
    };
  }

  async initialize(): Promise<void> {
    await this.ensureDirectories();
    await this.loadKnowledgeBase();
    await this.loadVectorStore();
    this.initialized = true;
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.config.knowledgeBasePath, { recursive: true });
    await fs.mkdir(this.config.vectorStorePath, { recursive: true });
  }

  private async loadKnowledgeBase(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.knowledgeBasePath);
      for (const file of files) {
        const filePath = path.join(this.config.knowledgeBasePath, file);
        const stat = await fs.stat(filePath);
        
        if (stat.isFile() && this.isSupportedFormat(file)) {
          await this.processFile(filePath);
        }
      }
    } catch (error) {
      console.warn(`Failed to load knowledge base: ${error}`);
    }
  }

  private isSupportedFormat(filename: string): boolean {
    const supported = ['.md', '.txt', '.json', '.yaml', '.yml'];
    return supported.some(ext => filename.toLowerCase().endsWith(ext));
  }

  private async processFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf8');
    const chunks = this.chunkContent(content, path.basename(filePath));
    
    for (const chunk of chunks) {
      const doc: Document = {
        id: chunk.id,
        content: chunk.content,
        metadata: {
          filename: path.basename(filePath),
          path: filePath,
          chunkIndex: chunk.index,
          totalChunks: chunk.total
        },
        source: filePath,
        chunkId: chunk.id,
        chunkIndex: chunk.index,
        totalChunks: chunk.total
      };
      
      this.documents.set(doc.id, doc);
      
      if (!this.hasEmbedding(doc)) {
        doc.embedding = await this.generateEmbedding(doc.content);
      }
      
      if (doc.embedding) {
        this.vectorIndex.set(doc.id, { docId: doc.id, embedding: doc.embedding });
      }
    }
  }

  private chunkContent(content: string, filename: string): Array<{ id: string; content: string; index: number; total: number }> {
    const chunks: Array<{ id: string; content: string; index: number; total: number }> = [];
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const line of lines) {
      if (currentLength + line.length > this.config.chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `${filename}-${chunks.length}`,
          content: currentChunk.join('\n'),
          index: chunks.length,
          total: 0
        });
        currentChunk = lines.slice(Math.max(0, chunks.length * this.config.chunkSize - this.config.chunkOverlap));
        currentLength = currentChunk.reduce((sum, l) => sum + l.length, 0);
      } else {
        currentChunk.push(line);
        currentLength += line.length;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push({
        id: `${filename}-${chunks.length}`,
        content: currentChunk.join('\n'),
        index: chunks.length,
        total: chunks.length + 1
      });
    }

    chunks.forEach(c => c.total = chunks.length);
    return chunks;
  }

  private hasEmbedding(doc: Document): boolean {
    return doc.embedding !== undefined && doc.embedding.length > 0;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const trimmedText = text.trim().substring(0, 8000);
      const mockEmbedding: number[] = [];
      for (let i = 0; i < this.config.embedding.dimensions; i++) {
        mockEmbedding.push(Math.random() * 2 - 1);
      }
      return mockEmbedding;
    } catch {
      return [];
    }
  }

  private async loadVectorStore(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.vectorStorePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.config.vectorStorePath, file);
          const data = await fs.readFile(filePath, 'utf8');
          const embeddings = JSON.parse(data) as Array<{ docId: string; embedding: number[] }>;
          for (const item of embeddings) {
            this.vectorIndex.set(item.docId, item);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load vector store: ${error}`);
    }
  }

  async saveVectorStore(): Promise<void> {
    const embeddings = Array.from(this.vectorIndex.values());
    const filePath = path.join(this.config.vectorStorePath, 'embeddings.json');
    await fs.writeFile(filePath, JSON.stringify(embeddings, null, 2));
  }

  async search(query: string, topK?: number): Promise<RAGQueryResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const queryEmbedding = await this.generateEmbedding(query);
    const k = topK || this.config.topK;

    const results: SearchResult[] = [];
    for (const [docId, { embedding }] of this.vectorIndex) {
      if (embedding.length !== queryEmbedding.length) continue;
      
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      if (similarity >= this.config.similarityThreshold) {
        const doc = this.documents.get(docId);
        if (doc) {
          results.push({
            document: doc,
            similarity,
            relevance: similarity
          });
        }
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, k);

    const context = topResults.map(r => r.document.content).join('\n\n---\n\n');
    const sources = [...new Set(topResults.map(r => r.document.source))];

    return {
      results: topResults,
      context,
      sources
    };
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dot = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dot += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }
    
    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    return magnitude === 0 ? 0 : dot / magnitude;
  }

  async addDocument(content: string, metadata?: Record<string, any>): Promise<string> {
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const doc: Document = {
      id: docId,
      content,
      metadata: metadata || {},
      source: 'dynamic'
    };
    
    doc.embedding = await this.generateEmbedding(content);
    this.documents.set(docId, doc);
    
    if (doc.embedding) {
      this.vectorIndex.set(docId, { docId, embedding: doc.embedding });
    }
    
    return docId;
  }

  async addDocumentFromFile(filePath: string): Promise<void> {
    await this.processFile(filePath);
  }

  async deleteDocument(docId: string): Promise<void> {
    this.documents.delete(docId);
    this.vectorIndex.delete(docId);
  }

  getDocument(docId: string): Document | undefined {
    return this.documents.get(docId);
  }

  async getStats(): Promise<{
    documentCount: number;
    chunkCount: number;
    vectorCount: number;
    knowledgeBaseSize: number;
  }> {
    let totalSize = 0;
    for (const doc of this.documents.values()) {
      totalSize += doc.content.length;
    }

    return {
      documentCount: this.documents.size,
      chunkCount: this.documents.size,
      vectorCount: this.vectorIndex.size,
      knowledgeBaseSize: totalSize
    };
  }

  setConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RAGConfig {
    return { ...this.config };
  }
}

export const ragModule = new RAGModule();

export default RAGModule;
