import { MEMORY_DIR } from '../utils/index.js';
import path from 'path';
import fs from 'fs/promises';
import type { VectorDocument, SearchResult, RAGStats, EmbeddingApiResponse } from './rag-types.js';
import {
  EMBEDDING_API_URL,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  BATCH_SIZE,
  API_TIMEOUT,
} from './rag-types.js';

// Re-export 类型
export type { VectorDocument, SearchResult, RAGStats, EmbeddingApiResponse };

// ============================================================
// RAGModule 类
// ============================================================

/**
 * RAG 向量检索模块
 *
 * 接入阿里云百炼 text-embedding-v3 模型，生成 1024 维向量，
 * 支持内存存储 + 磁盘持久化，提供余弦相似度搜索。
 *
 * 设计原则：
 * - API 调用失败时优雅降级，返回 null 向量，不抛错
 * - 零外部依赖，仅使用 Node.js 内置 fetch
 * - ES Module 格式，import 使用 .js 后缀
 */
export class RAGModule {
  /** 阿里云百炼 API Key */
  private apiKey = '';

  /** 向量存储文件路径 */
  private storagePath: string;

  /** 内存中的文档向量库 */
  private documents: Map<string, VectorDocument> = new Map();

  /** 是否已初始化 */
  private initialized = false;

  constructor() {
    this.storagePath = path.join(MEMORY_DIR, 'vectors.json');
  }

  // ----------------------------------------------------------
  // 初始化
  // ----------------------------------------------------------

  /**
   * 初始化 RAG 模块
   * @param apiKey - 阿里云百炼 API Key
   * @description 加载已有的向量数据，确保存储目录存在
   */
  async init(apiKey: string): Promise<void> {
    this.apiKey = apiKey;

    // 确保存储目录存在
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    // 从磁盘加载已有向量
    await this.load();

    this.initialized = true;
  }

  // ----------------------------------------------------------
  // Embedding 生成
  // ----------------------------------------------------------

  /**
   * 生成单个文本的向量
   * @param text - 输入文本
   * @returns 1024 维向量数组，API 调用失败时返回 null
   */
  async embed(text: string): Promise<number[] | null> {
    if (!text || !text.trim()) return null;

    try {
      const response = await fetch(EMBEDDING_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text.trim(),
          dimensions: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(API_TIMEOUT),
      });

      if (!response.ok) {
        console.error(`[RAG] Embedding API 请求失败: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as EmbeddingApiResponse;

      if (!data.data || data.data.length === 0) {
        console.error('[RAG] Embedding API 返回空数据');
        return null;
      }

      return data.data[0].embedding;
    } catch (error) {
      // 优雅降级：不抛错，仅记录日志
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[RAG] Embedding API 调用异常: ${message}`);
      return null;
    }
  }

  /**
   * 批量生成向量
   * @param texts - 输入文本数组
   * @returns 向量数组，每项对应输入文本，失败项为 null
   * @description 自动分批处理，每批最多 BATCH_SIZE 条
   */
  async embedBatch(texts: string[]): Promise<Array<number[] | null>> {
    if (!texts || texts.length === 0) return [];

    const results: Array<number[] | null> = new Array(texts.length).fill(null);

    // 分批调用 API
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const validTexts = batch.map(t => (t && t.trim()) ? t.trim() : '');

      try {
        const response = await fetch(EMBEDDING_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: validTexts,
            dimensions: EMBEDDING_DIMENSIONS,
          }),
          signal: AbortSignal.timeout(API_TIMEOUT),
        });

        if (!response.ok) {
          console.error(`[RAG] 批量 Embedding API 请求失败: ${response.status} ${response.statusText}`);
          // 当前批次全部为 null，已在初始化时设置
          continue;
        }

        const data = await response.json() as EmbeddingApiResponse;

        if (data.data && data.data.length > 0) {
          for (let j = 0; j < data.data.length && (i + j) < texts.length; j++) {
            results[i + j] = data.data[j].embedding;
          }
        }
      } catch (error) {
        // 优雅降级：当前批次全部为 null
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[RAG] 批量 Embedding API 调用异常: ${message}`);
      }
    }

    return results;
  }

  // ----------------------------------------------------------
  // 文档管理
  // ----------------------------------------------------------

  /**
   * 添加文档并生成向量
   * @param id - 文档唯一标识
   * @param text - 文档文本内容
   * @description 如果 ID 已存在则更新，自动生成向量并保存
   */
  async addDocument(id: string, text: string): Promise<void> {
    if (!id || !text) return;

    const now = new Date().toISOString();
    const existing = this.documents.get(id);

    // 生成向量
    const embedding = await this.embed(text);

    const doc: VectorDocument = {
      id,
      text,
      embedding,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.documents.set(id, doc);

    // 自动持久化
    await this.save();
  }

  /**
   * 批量添加文档
   * @param items - 文档数组 [{id, text}]
   * @description 使用批量 Embedding API 提升效率
   */
  async addDocuments(items: Array<{ id: string; text: string }>): Promise<void> {
    if (!items || items.length === 0) return;

    const texts = items.map(item => item.text);
    const embeddings = await this.embedBatch(texts);
    const now = new Date().toISOString();

    for (let i = 0; i < items.length; i++) {
      const { id, text } = items[i];
      const existing = this.documents.get(id);

      const doc: VectorDocument = {
        id,
        text,
        embedding: embeddings[i],
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      this.documents.set(id, doc);
    }

    // 自动持久化
    await this.save();
  }

  /**
   * 删除文档
   * @param id - 文档 ID
   * @returns 是否成功删除
   */
  async removeDocument(id: string): Promise<boolean> {
    const deleted = this.documents.delete(id);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  /**
   * 获取文档
   * @param id - 文档 ID
   * @returns 文档数据或 undefined
   */
  getDocument(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * 获取所有文档 ID
   * @returns 文档 ID 数组
   */
  getAllDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  // ----------------------------------------------------------
  // 向量搜索
  // ----------------------------------------------------------

  /**
   * 余弦相似度搜索
   * @param query - 查询文本
   * @param topK - 返回最相似的前 K 个结果，默认 5
   * @returns 按相似度降序排列的搜索结果
   * @description 将查询文本转为向量后，与所有有效向量计算余弦相似度
   */
  async search(query: string, topK = 5): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];

    // 生成查询向量
    const queryEmbedding = await this.embed(query);
    if (!queryEmbedding) {
      console.error('[RAG] 查询向量生成失败，无法执行搜索');
      return [];
    }

    // 计算与所有有效向量的相似度
    const scored: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (!doc.embedding) continue; // 跳过空向量

      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      scored.push({
        id: doc.id,
        text: doc.text,
        score,
      });
    }

    // 按相似度降序排列，取 topK
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 余弦相似度计算
   * @param a - 向量 A
   * @param b - 向量 B
   * @returns 相似度分数（-1 ~ 1，通常 0 ~ 1）
   * @description 公式：cos(θ) = (A·B) / (|A| * |B|)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  // ----------------------------------------------------------
  // 持久化
  // ----------------------------------------------------------

  /**
   * 保存向量数据到磁盘
   * @description 将内存中的所有文档向量序列化为 JSON 写入文件
   */
  async save(): Promise<void> {
    try {
      const data: Record<string, VectorDocument> = {};
      for (const [id, doc] of this.documents) {
        data[id] = doc;
      }

      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(
        this.storagePath,
        JSON.stringify(data, null, 2),
        'utf-8',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[RAG] 保存向量数据失败: ${message}`);
    }
  }

  /**
   * 从磁盘加载向量数据
   * @description 读取 JSON 文件并恢复到内存
   */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, VectorDocument>;

      this.documents.clear();
      for (const [id, doc] of Object.entries(data)) {
        this.documents.set(id, doc);
      }
    } catch (error) {
      // 文件不存在或解析失败时，初始化空库
      this.documents.clear();
    }
  }

  // ----------------------------------------------------------
  // 统计信息
  // ----------------------------------------------------------

  /**
   * 获取统计信息
   * @returns RAG 模块的运行统计数据
   */
  getStats(): RAGStats {
    let validVectors = 0;
    let nullVectors = 0;

    for (const doc of this.documents.values()) {
      if (doc.embedding) {
        validVectors++;
      } else {
        nullVectors++;
      }
    }

    return {
      totalDocuments: this.documents.size,
      validVectors,
      nullVectors,
      dimensions: EMBEDDING_DIMENSIONS,
      storagePath: this.storagePath,
      initialized: this.initialized,
    };
  }

  // ----------------------------------------------------------
  // 工具方法
  // ----------------------------------------------------------

  /**
   * 清空所有文档
   */
  async clear(): Promise<void> {
    this.documents.clear();
    await this.save();
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取文档总数
   */
  size(): number {
    return this.documents.size;
  }
}

// ============================================================
// 全局单例
// ============================================================

/** RAG 模块全局单例 */
export const ragModule = new RAGModule();
