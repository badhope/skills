import { MEMORY_DIR } from '../utils/index.js';
import { MemoryManager } from './manager.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * 记忆摘要与反思模块
 * 定期从记忆中提炼高层次认知，减少噪音
 */

interface MemoryInsight {
  id: string;
  type: 'preference' | 'fact' | 'pattern' | 'summary';
  content: string;
  sourceIds: string[];     // 来源记忆 ID
  confidence: number;      // 置信度 0-1
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

interface ReflectionReport {
  id: string;
  createdAt: number;
  totalMemories: number;
  insightsGenerated: number;
  insights: MemoryInsight[];
}

/**
 * 从一组记忆文本中提取高频主题
 */
function extractThemes(texts: string[]): Array<{ theme: string; count: number }> {
  const themeMap = new Map<string, number>();

  for (const text of texts) {
    // 提取中文 2-4 字子串
    const chineseSegments = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    // 提取英文单词
    const englishWords = text.match(/[a-zA-Z]{2,}/g) || [];

    const allTokens = [...chineseSegments, ...englishWords.map(w => w.toLowerCase())];
    for (const token of allTokens) {
      // 过滤常见停用词
      const stopWords = new Set([
        '什么', '怎么', '如何', '可以', '这个', '那个', '一个', '没有',
        '不是', '就是', '已经', '如果', '但是', '因为', '所以', '或者',
        'the', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'do',
        'can', 'will', 'would', 'should', 'could', 'may', 'might',
      ]);
      if (stopWords.has(token)) continue;
      themeMap.set(token, (themeMap.get(token) || 0) + 1);
    }
  }

  return Array.from(themeMap.entries())
    .map(([theme, count]) => ({ theme, count }))
    .filter(t => t.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/**
 * 从记忆中生成洞察
 */
function generateInsights(
  memories: Array<{ id: string; input: string; output: string; timestamp: string }>
): MemoryInsight[] {
  const insights: MemoryInsight[] = [];

  // 1. 提取用户偏好（"喜欢/偏好/常用 + X"模式）
  const preferencePatterns = [
    /(?:喜欢|偏好|常用|最爱|习惯|倾向于|更愿意)(.{2,20}?)(?:[。，！？\n]|$)/g,
    /(?:用|使用|采用|选择)(.{2,20}?)(?:来|去|做|写|开发|编程)/g,
  ];

  for (const mem of memories) {
    const text = `${mem.input} ${mem.output}`;
    for (const pattern of preferencePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'preference',
          content: `用户偏好: ${match[0].trim()}`,
          sourceIds: [mem.id],
          confidence: 0.7,
          createdAt: Date.now(),
          accessedAt: Date.now(),
          accessCount: 0,
        });
      }
    }
  }

  // 2. 提取事实（"我是/叫/名字是 + X"模式）
  const factPatterns = [
    /(?:我是|我叫|我的名字是|我姓)(.{2,10}?)(?:[。，！？\n]|$)/g,
  ];

  for (const mem of memories) {
    const text = mem.input;
    for (const pattern of factPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'fact',
          content: `用户信息: ${match[0].trim()}`,
          sourceIds: [mem.id],
          confidence: 0.9,
          createdAt: Date.now(),
          accessedAt: Date.now(),
          accessCount: 0,
        });
      }
    }
  }

  // 3. 提取模式（高频主题）
  const themes = extractThemes(memories.map(m => `${m.input} ${m.output}`));
  if (themes.length > 0) {
    const topThemes = themes.slice(0, 5);
    insights.push({
      id: crypto.randomUUID(),
      type: 'pattern',
      content: `用户常讨论的主题: ${topThemes.map(t => t.theme).join('、')}（出现 ${topThemes.reduce((s, t) => s + t.count, 0)} 次）`,
      sourceIds: memories.map(m => m.id),
      confidence: Math.min(1, topThemes[0].count / memories.length),
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
    });
  }

  // 4. 生成摘要
  if (memories.length >= 3) {
    const timeRange = memories.length >= 2
      ? `${memories[memories.length - 1].timestamp} ~ ${memories[0].timestamp}`
      : memories[0].timestamp;

    insights.push({
      id: crypto.randomUUID(),
      type: 'summary',
      content: `用户在 ${timeRange} 期间进行了 ${memories.length} 次对话，主要涉及: ${themes.slice(0, 3).map(t => t.theme).join('、')}`,
      sourceIds: memories.map(m => m.id),
      confidence: 0.8,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
    });
  }

  return insights;
}

export class MemoryReflector {
  private storagePath: string;
  private insights: MemoryInsight[] = [];
  private reports: ReflectionReport[] = [];
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    this.storagePath = MEMORY_DIR;
    this.memoryManager = memoryManager;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(path.join(this.storagePath, 'insights.json'), 'utf-8');
      const parsed = JSON.parse(data);
      this.insights = parsed.insights || [];
      this.reports = parsed.reports || [];
    } catch { /* 首次使用 */ }
  }

  private async save(): Promise<void> {
    await fs.writeFile(
      path.join(this.storagePath, 'insights.json'),
      JSON.stringify({ insights: this.insights, reports: this.reports }, null, 2)
    );
  }

  /**
   * 执行反思：从所有记忆中提炼洞察
   */
  async reflect(): Promise<ReflectionReport> {
    await this.init();

    // 加载所有记忆
    const records = await this.memoryManager.loadAllRecords();
    if (records.length === 0) {
      return {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        totalMemories: 0,
        insightsGenerated: 0,
        insights: [],
      };
    }

    // 生成新洞察
    const memories = records.map(r => ({
      id: r.id,
      input: r.input,
      output: r.output,
      timestamp: new Date(r.timestamp).toLocaleString('zh-CN'),
    }));

    const newInsights = generateInsights(memories);

    // 去重：与已有洞察比较，相似内容不重复添加
    for (const insight of newInsights) {
      const isDuplicate = this.insights.some(existing =>
        existing.type === insight.type &&
        existing.content === insight.content
      );
      if (!isDuplicate) {
        this.insights.push(insight);
      }
    }

    // 更新访问计数
    for (const insight of this.insights) {
      for (const newInsight of newInsights) {
        if (newInsight.sourceIds.some(id => insight.sourceIds.includes(id))) {
          insight.accessCount++;
          insight.accessedAt = Date.now();
        }
      }
    }

    // 保留最近 100 条洞察
    if (this.insights.length > 100) {
      this.insights.sort((a, b) => b.createdAt - a.createdAt);
      this.insights = this.insights.slice(0, 100);
    }

    const report: ReflectionReport = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      totalMemories: records.length,
      insightsGenerated: newInsights.length,
      insights: newInsights,
    };

    this.reports.push(report);
    // 保留最近 20 份报告
    if (this.reports.length > 20) {
      this.reports = this.reports.slice(-20);
    }

    await this.save();
    return report;
  }

  /**
   * 获取所有洞察
   */
  getInsights(type?: string): MemoryInsight[] {
    if (!type) return this.insights;
    return this.insights.filter(i => i.type === type);
  }

  /**
   * 获取上下文摘要（用于注入 system prompt）
   */
  async getContextSummary(): Promise<string> {
    await this.init();
    if (this.insights.length === 0) return '';

    // 按类型优先级排序：fact > preference > pattern > summary
    const priority = { fact: 0, preference: 1, pattern: 2, summary: 3 };
    const sorted = [...this.insights].sort((a, b) =>
      (priority[a.type] || 9) - (priority[b.type] || 9)
    );

    const lines = sorted.slice(0, 10).map(i => i.content);
    return lines.join('\n');
  }

  /**
   * 获取反思报告
   */
  getReports(): ReflectionReport[] {
    return this.reports;
  }

  /**
   * 清空所有洞察
   */
  async clear(): Promise<void> {
    this.insights = [];
    this.reports = [];
    await this.save();
  }
}
