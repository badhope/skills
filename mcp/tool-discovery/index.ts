export interface ToolInfo {
  toolId: string;
  serverId: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  category: string;
}

export interface ToolMatch {
  toolId: string;
  serverId: string;
  name: string;
  relevance: number;
  description: string;
  parameters: Record<string, any>;
  category: string;
}

export interface ToolRecommendation {
  tool: ToolMatch;
  confidence: number;
  reasoning: string;
}

export class ToolDiscoveryEngine {
  private tools: ToolInfo[] = [];
  private toolKeywords: Map<string, Set<string>> = new Map();
  private categoryIndex: Map<string, string[]> = new Map();

  registerTool(tool: ToolInfo): void {
    const existingIndex = this.tools.findIndex(
      t => t.serverId === tool.serverId && t.toolId === tool.toolId
    );

    if (existingIndex >= 0) {
      this.tools[existingIndex] = tool;
    } else {
      this.tools.push(tool);
    }

    this.buildIndex();
  }

  registerTools(tools: ToolInfo[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  private buildIndex(): void {
    this.toolKeywords.clear();
    this.categoryIndex.clear();

    for (const tool of this.tools) {
      const keywords = this.extractKeywords(tool.name, tool.description);
      const toolKey = `${tool.serverId}/${tool.toolId}`;

      for (const keyword of keywords) {
        if (!this.toolKeywords.has(keyword)) {
          this.toolKeywords.set(keyword, new Set());
        }
        this.toolKeywords.get(keyword)!.add(toolKey);
      }

      if (!this.categoryIndex.has(tool.category)) {
        this.categoryIndex.set(tool.category, []);
      }
      if (!this.categoryIndex.get(tool.category)!.includes(toolKey)) {
        this.categoryIndex.get(tool.category)!.push(toolKey);
      }
    }
  }

  private extractKeywords(name: string, description: string): string[] {
    const allText = `${name} ${description}`.toLowerCase();
    const words = allText.split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/).filter(w => w.length > 2);

    const stopWords = new Set([
      'the', 'and', 'is', 'are', 'be', 'to', 'of', 'for', 'in', 'with', 'on', 'at',
      'from', 'by', 'as', 'this', 'that', 'these', 'those', 'can', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'need', 'have', 'has', 'had',
      'file', 'use', 'get', 'set', 'create', 'read', 'write', 'delete', 'update',
      'list', 'find', 'search', 'query', 'execute', 'run', 'call', 'make', 'do',
      '工具', '功能', '操作', '管理', '处理', '获取', '设置', '创建', '读取', '写入',
      '删除', '更新', '列表', '查询', '搜索', '执行', '运行', '调用', '生成'
    ]);

    return [...new Set(words.filter(w => !stopWords.has(w)))];
  }

  discoverTools(taskDescription: string): ToolMatch[] {
    const taskKeywords = this.extractKeywords('', taskDescription);
    const matches: Map<string, number> = new Map();

    for (const keyword of taskKeywords) {
      const tools = this.toolKeywords.get(keyword);
      if (tools) {
        for (const toolKey of tools) {
          matches.set(toolKey, (matches.get(toolKey) || 0) + 1);
        }
      }
    }

    const results: ToolMatch[] = [];

    for (const [toolKey, score] of matches) {
      const [serverId, toolId] = toolKey.split('/');
      const toolInfo = this.tools.find(t => t.serverId === serverId && t.toolId === toolId);

      if (toolInfo) {
        const relevance = this.calculateRelevance(score, taskKeywords.length, toolInfo.description);
        if (relevance > 0.1) {
          results.push({
            toolId: toolInfo.toolId,
            serverId: toolInfo.serverId,
            name: toolInfo.name,
            relevance,
            description: toolInfo.description,
            parameters: toolInfo.parameters,
            category: toolInfo.category
          });
        }
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  private calculateRelevance(matches: number, totalKeywords: number, description: string): number {
    const baseScore = matches / Math.max(totalKeywords, 1);
    const lengthBonus = Math.min(description.length / 50, 1);
    return baseScore * (0.8 + lengthBonus * 0.2);
  }

  findToolsByCapability(capability: string): ToolMatch[] {
    const capabilityLower = capability.toLowerCase();

    return this.tools
      .filter(tool =>
        tool.name.toLowerCase().includes(capabilityLower) ||
        tool.description.toLowerCase().includes(capabilityLower) ||
        tool.category.toLowerCase().includes(capabilityLower)
      )
      .map(tool => ({
        toolId: tool.toolId,
        serverId: tool.serverId,
        name: tool.name,
        relevance: 0.7,
        description: tool.description,
        parameters: tool.parameters,
        category: tool.category
      }));
  }

  findToolsByCategory(category: string): ToolMatch[] {
    const categoryLower = category.toLowerCase();
    const toolKeys = this.categoryIndex.get(category) || [];

    return toolKeys
      .map(key => {
        const [serverId, toolId] = key.split('/');
        return this.tools.find(t => t.serverId === serverId && t.toolId === toolId);
      })
      .filter((t): t is ToolInfo => t !== undefined)
      .map(tool => ({
        toolId: tool.toolId,
        serverId: tool.serverId,
        name: tool.name,
        relevance: 0.8,
        description: tool.description,
        parameters: tool.parameters,
        category: tool.category
      }));
  }

  suggestTools(taskDescription: string, topN: number = 5): ToolRecommendation[] {
    const discoveredTools = this.discoverTools(taskDescription);
    const recommendations: ToolRecommendation[] = [];

    for (const tool of discoveredTools.slice(0, topN)) {
      const confidence = this.calculateConfidence(tool, taskDescription);
      const reasoning = this.generateReasoning(tool, taskDescription);

      recommendations.push({
        tool,
        confidence,
        reasoning
      });
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  private calculateConfidence(tool: ToolMatch, taskDescription: string): number {
    const description = taskDescription.toLowerCase();
    const toolName = tool.name.toLowerCase();
    const toolDesc = tool.description.toLowerCase();

    let score = tool.relevance;

    if (description.includes(toolName)) {
      score += 0.2;
    }

    const toolKeywords = this.extractKeywords(tool.name, tool.description);
    const taskKeywords = this.extractKeywords('', taskDescription);
    const matchedKeywords = taskKeywords.filter(k => toolKeywords.includes(k)).length;
    score += (matchedKeywords / Math.max(taskKeywords.length, 1)) * 0.1;

    return Math.min(score, 1);
  }

  private generateReasoning(tool: ToolMatch, taskDescription: string): string {
    const reasons: string[] = [];

    if (taskDescription.toLowerCase().includes(tool.name.toLowerCase())) {
      reasons.push(`任务描述中提到了工具名称 "${tool.name}"`);
    }

    if (tool.relevance > 0.5) {
      reasons.push(`工具与任务的关键词匹配度较高 (${(tool.relevance * 100).toFixed(0)}%)`);
    }

    const categoryMatch = taskDescription.toLowerCase().includes(tool.category.toLowerCase());
    if (categoryMatch) {
      reasons.push(`工具类别 "${tool.category}" 与任务相关`);
    }

    if (reasons.length === 0) {
      reasons.push(`工具 "${tool.name}" 与任务描述有一定相关性`);
    }

    return reasons.join('；');
  }

  getToolsForCategory(category: string): ToolMatch[] {
    return this.findToolsByCategory(category);
  }

  getAllTools(): ToolInfo[] {
    return [...this.tools];
  }

  getCategories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }

  unregisterTool(serverId: string, toolId: string): boolean {
    const index = this.tools.findIndex(t => t.serverId === serverId && t.toolId === toolId);
    if (index >= 0) {
      this.tools.splice(index, 1);
      this.buildIndex();
      return true;
    }
    return false;
  }

  clearTools(): void {
    this.tools = [];
    this.toolKeywords.clear();
    this.categoryIndex.clear();
  }
}

export const globalToolDiscoveryEngine = new ToolDiscoveryEngine();

export const tools = {
  registerTool: (tool: ToolInfo) => {
    globalToolDiscoveryEngine.registerTool(tool);
    return { success: true };
  },

  registerTools: (tools: ToolInfo[]) => {
    globalToolDiscoveryEngine.registerTools(tools);
    return { success: true };
  },

  discoverTools: (taskDescription: string) => {
    const matches = globalToolDiscoveryEngine.discoverTools(taskDescription);
    return { tools: matches };
  },

  findToolsByCapability: (capability: string) => {
    const tools = globalToolDiscoveryEngine.findToolsByCapability(capability);
    return { tools };
  },

  findToolsByCategory: (category: string) => {
    const tools = globalToolDiscoveryEngine.findToolsByCategory(category);
    return { tools };
  },

  suggestTools: (taskDescription: string, topN: number = 5) => {
    const recommendations = globalToolDiscoveryEngine.suggestTools(taskDescription, topN);
    return { recommendations };
  },

  getAllTools: () => {
    const tools = globalToolDiscoveryEngine.getAllTools();
    return { tools };
  },

  getCategories: () => {
    const categories = globalToolDiscoveryEngine.getCategories();
    return { categories };
  },

  unregisterTool: (serverId: string, toolId: string) => {
    const result = globalToolDiscoveryEngine.unregisterTool(serverId, toolId);
    return { success: result };
  },

  clearTools: () => {
    globalToolDiscoveryEngine.clearTools();
    return { success: true };
  }
};

export default {
  ToolDiscoveryEngine,
  globalToolDiscoveryEngine,
  tools
};