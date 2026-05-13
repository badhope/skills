import { MEMORY_DIR } from '../utils/index.js';
import { ragModule } from './rag.js';
import fs from 'fs/promises';
import path from 'path';
import type { MemoryInteraction, MemoryRecord, MemoryStats } from './memory-types.js';

// Re-export 类型
export type { MemoryInteraction, MemoryRecord, MemoryStats };

/**
 * 统一记忆管理器
 * 基于文件系统的对话记忆存储
 */
export class MemoryManager {
  private storagePath: string;
  private initialized = false;
  private ragEnabled: boolean = false;
  private ragInitialized: boolean = false;

  constructor() {
    this.storagePath = MEMORY_DIR;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.storagePath, { recursive: true });
    this.initialized = true;
  }

  /**
   * 初始化 RAG 模块
   */
  async initRAG(apiKey?: string): Promise<boolean> {
    try {
      const key = apiKey || processDELETE.ALIYUN_API_KEY || processDELETE.DASHSCOPE_API_KEY;
      if (!key) {
        console.warn('[记忆] 未配置阿里云 API Key，RAG 功能已禁用');
        return false;
      }
      await ragModule.init(key);
      this.ragInitialized = true;
      this.ragEnabled = true;
      return true;
    } catch (error) {
      console.error('[记忆] RAG 初始化失败:', error);
      return false;
    }
  }

  /**
   * 启用/禁用 RAG 功能
   */
  setRAGEnabled(enabled: boolean): void {
    if (enabled && !this.ragInitialized) {
      console.warn('[记忆] RAG 未初始化，请先调用 initRAG()');
      return;
    }
    this.ragEnabled = enabled;
  }

  /**
   * 检查 RAG 是否启用
   */
  isRAGEnabled(): boolean {
    return this.ragEnabled && this.ragInitialized;
  }

  /**
   * 记录一次对话交互
   */
  async rememberChat(params: {
    input: string;
    output: string;
    provider: string;
    model: string;
    taskId?: string;
    tags?: string[];
  }): Promise<void> {
    await this.init();

    const id = crypto.randomUUID();
    const record: MemoryInteraction = {
      id,
      taskId: params.taskId || `chat-${Date.now()}`,
      input: params.input,
      output: params.output,
      skillUsed: `chat:${params.provider}:${params.model}`,
      context: { provider: params.provider, model: params.model },
      tags: params.tags || ['chat', params.provider, params.model],
      timestamp: new Date(),
    };

    const filePath = path.join(this.storagePath, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2));

    // 自动索引到 RAG（如果启用）
    if (this.ragEnabled && this.ragInitialized) {
      const text = `${params.input} ${params.output || ''}`;
      await ragModule.addDocument(id, text).catch(err => {
        console.warn('[记忆] RAG 索引失败:', err);
      });
    }
  }

  /**
   * 获取所有记忆记录
   */
  async loadAllRecords(): Promise<MemoryInteraction[]> {
    await this.init();
    try {
      const files = await fs.readdir(this.storagePath);
      const records: MemoryInteraction[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const data = await fs.readFile(path.join(this.storagePath, file), 'utf-8');
          const record = JSON.parse(data);
          // 验证记录有效性
          if (record.id && record.timestamp && (record.input || record.output)) {
            records.push(record);
          } else {
            // 删除无效记录文件
            await fs.unlink(path.join(this.storagePath, file)).catch(() => {});
          }
        } catch { /* skip */ }
      }

      return records.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * 根据上下文搜索相关记忆（关键词匹配 + 中文分词 + 语义搜索）
   */
  async recall(context: string, limit = 10): Promise<MemoryRecord[]> {
    const records = await this.loadAllRecords();
    if (!context) {
      return records.slice(0, limit).map(r => ({ interaction: r, relevance: 1 }));
    }

    // 1. 关键词匹配（始终执行）
    const keywords = this.tokenize(context);
    const keywordScores: Map<string, number> = new Map();
    
    for (const record of records) {
      const text = `${record.input} ${record.output}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (kw.length < 2) continue;
        const occurrences = text.split(kw).length - 1;
        if (occurrences > 0) score += occurrences * (kw.length >= 4 ? 2 : 1);
      }
      keywordScores.set(record.id, score);
    }

    // 2. 语义搜索（如果启用）
    let semanticScores: Map<string, number> = new Map();
    if (this.ragEnabled && this.ragInitialized && ragModule.size() > 0) {
      try {
        const results = await ragModule.search(context, limit * 2);
        for (const result of results) {
          semanticScores.set(result.id, result.score * 10); // 归一化到与关键词分数相近
        }
      } catch (error) {
        console.warn('[记忆] 语义搜索失败，降级到关键词搜索');
      }
    }

    // 3. 混合评分
    const scored: MemoryRecord[] = records.map(record => {
      const keywordScore = keywordScores.get(record.id) || 0;
      const semanticScore = semanticScores.get(record.id) || 0;
      
      // 混合公式：关键词分数 + 语义分数 * 权重
      // 如果只有关键词，使用关键词分数
      // 如果只有语义，使用语义分数
      // 如果两者都有，加权合并
      const relevance = semanticScores.size > 0
        ? keywordScore * 0.4 + semanticScore * 0.6  // 混合模式
        : keywordScore;  // 纯关键词模式
      
      return { interaction: record, relevance };
    });

    return scored
      .filter(r => r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * 简单分词：英文按空格，中文提取 2-4 字子串
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    // 英文词
    const englishWords = text.match(/[a-zA-Z0-9]+/g);
    if (englishWords) tokens.push(...englishWords.map(w => w.toLowerCase()));
    // 中文字符提取 2-4 字子串
    const chineseChars = text.match(/[\u4e00-\u9fa5]+/g);
    if (chineseChars) {
      for (const segment of chineseChars) {
        if (segment.length >= 2) tokens.push(segment); // 整段
        if (segment.length >= 4) {
          // 2字窗口
          for (let i = 0; i <= segment.length - 2; i++) {
            tokens.push(segment.substring(i, i + 2));
          }
        }
      }
    }
    return tokens;
  }

  /**
   * 获取最近对话
   */
  async getRecent(limit = 10): Promise<Array<{
    input: string;
    output: string;
    time: string;
    skill: string;
  }>> {
    const records = await this.loadAllRecords();
    return records.slice(0, limit).map((r: MemoryInteraction) => ({
      input: r.input || '',
      output: (r.output || '').slice(0, 200),
      time: new Date(r.timestamp).toLocaleString('zh-CN'),
      skill: r.skillUsed,
    }));
  }

  /**
   * 获取记忆统计
   */
  async getStats(): Promise<MemoryStats> {
    const records = await this.loadAllRecords();
    const skillUsage: Record<string, number> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const uniqueTasks = new Set<string>();
    const skillsUsed = new Set<string>();

    for (const r of records) {
      skillUsage[r.skillUsed] = (skillUsage[r.skillUsed] || 0) + 1;
      if (r.taskId) uniqueTasks.add(r.taskId);
      skillsUsed.add(r.skillUsed);
    }

    return {
      totalInteractions: records.length,
      uniqueTasks: uniqueTasks.size,
      interactionsToday: records.filter(r => new Date(r.timestamp).toDateString() === today).length,
      interactionsYesterday: records.filter(r => new Date(r.timestamp).toDateString() === yesterday).length,
      indexSize: Object.keys(skillUsage).length,
      skillUsage,
      skillsUsed: Array.from(skillsUsed),
    };
  }

  /**
   * 清空所有记忆
   */
  async clear(): Promise<void> {
    await this.init();
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.storagePath, file));
        }
      }
    } catch { /* ignore */ }
  }
}

// 全局单例
export const memoryManager = new MemoryManager();
