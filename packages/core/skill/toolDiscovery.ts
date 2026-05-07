import { globalMCPRegistry } from '../mcp/registry';
import { SkillRegistry } from './registry';
import { SkillDefinition } from './types';

export interface ToolMatch {
  toolId: string;
  serverId: string;
  relevance: number;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolRecommendation {
  tool: ToolMatch;
  skill: SkillDefinition;
  confidence: number;
}

export class ToolDiscoveryEngine {
  private toolKeywords: Map<string, Set<string>> = new Map();
  private skillToolIndex: Map<string, string[]> = new Map();

  constructor(private skillRegistry: SkillRegistry) {
    this.buildIndex();
  }

  private buildIndex(): void {
    this.toolKeywords.clear();
    this.skillToolIndex.clear();

    const tools = globalMCPRegistry.listAllTools();
    
    for (const tool of tools) {
      const keywords = this.extractKeywords(tool.name, tool.description);
      for (const keyword of keywords) {
        if (!this.toolKeywords.has(keyword)) {
          this.toolKeywords.set(keyword, new Set());
        }
        this.toolKeywords.get(keyword)!.add(`${tool.serverId}/${tool.toolId}`);
      }
    }

    for (const skill of this.skillRegistry.getAllSkills()) {
      const toolNames = skill.tools.map(t => t.name);
      this.skillToolIndex.set(skill.metadata.name, toolNames);
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

    const allTools = globalMCPRegistry.listAllTools();
    const results: ToolMatch[] = [];

    for (const [toolKey, score] of matches) {
      const [serverId, toolId] = toolKey.split('/');
      const toolInfo = allTools.find(t => t.serverId === serverId && t.name === toolId);
      
      if (toolInfo) {
        const relevance = this.calculateRelevance(score, taskKeywords.length, toolInfo.description);
        if (relevance > 0.1) {
          results.push({
            toolId,
            serverId,
            relevance,
            description: toolInfo.description,
            parameters: {}
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
    const tools = globalMCPRegistry.listAllTools();
    const capabilityLower = capability.toLowerCase();
    
    return tools
      .filter(tool => 
        tool.name.toLowerCase().includes(capabilityLower) ||
        tool.description.toLowerCase().includes(capabilityLower)
      )
      .map(tool => ({
        toolId: tool.name,
        serverId: tool.serverId,
        relevance: 0.7,
        description: tool.description,
        parameters: {}
      }));
  }

  suggestTools(skillName: string, taskDescription: string): ToolRecommendation[] {
    const skill = this.skillRegistry.getSkill(skillName);
    if (!skill) return [];

    const skillTools = skill.tools.map(t => t.name);
    const discoveredTools = this.discoverTools(taskDescription);
    
    const recommendations: ToolRecommendation[] = [];

    for (const tool of discoveredTools) {
      const isSkillTool = skillTools.some(st => 
        st.toLowerCase() === tool.toolId.toLowerCase() ||
        st.toLowerCase() === tool.serverId.toLowerCase()
      );
      
      const confidence = isSkillTool ? 0.9 + tool.relevance * 0.1 : tool.relevance * 0.8;
      
      recommendations.push({
        tool,
        skill,
        confidence
      });
    }

    for (const skillTool of skillTools) {
      const existing = recommendations.find(r => 
        r.tool.toolId.toLowerCase() === skillTool.toLowerCase() ||
        r.tool.serverId.toLowerCase() === skillTool.toLowerCase()
      );
      
      if (!existing) {
        const tools = globalMCPRegistry.listAllTools();
        const toolInfo = tools.find(t => 
          t.name.toLowerCase() === skillTool.toLowerCase() ||
          t.serverId.toLowerCase() === skillTool.toLowerCase()
        );
        
        if (toolInfo) {
          recommendations.push({
            tool: {
              toolId: toolInfo.name,
              serverId: toolInfo.serverId,
              relevance: 0.6,
              description: toolInfo.description,
              parameters: {}
            },
            skill,
            confidence: 0.7
          });
        }
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  learnFromUsage(skillName: string, toolId: string, success: boolean): void {
    const skill = this.skillRegistry.getSkill(skillName);
    if (!skill) return;

    const existingTool = skill.tools.find(t => t.name.toLowerCase() === toolId.toLowerCase());
    
    if (!existingTool && success) {
      const tools = globalMCPRegistry.listAllTools();
      const toolInfo = tools.find(t => 
        t.name.toLowerCase() === toolId.toLowerCase() ||
        `${t.serverId}/${t.name}` === toolId
      );
      
      if (toolInfo) {
        skill.tools.push({
          name: toolId,
          purpose: toolInfo.description,
          fallback: 'Manual fallback'
        });
      }
    }
  }

  getToolsForSkill(skillName: string): ToolMatch[] {
    const skill = this.skillRegistry.getSkill(skillName);
    if (!skill) return [];

    const tools = globalMCPRegistry.listAllTools();
    const results: ToolMatch[] = [];

    for (const skillTool of skill.tools) {
      const toolInfo = tools.find(t => 
        t.name.toLowerCase() === skillTool.name.toLowerCase() ||
        t.serverId.toLowerCase() === skillTool.name.toLowerCase()
      );
      
      if (toolInfo) {
        results.push({
          toolId: toolInfo.name,
          serverId: toolInfo.serverId,
          relevance: 0.85,
          description: skillTool.purpose,
          parameters: {}
        });
      }
    }

    return results;
  }

  getRecommendedTools(taskDescription: string, topN: number = 5): ToolMatch[] {
    const tools = this.discoverTools(taskDescription);
    return tools.slice(0, topN);
  }

  getSkillToolsWithFallback(skillName: string): Array<{
    tool: ToolMatch;
    fallback: string;
  }> {
    const skill = this.skillRegistry.getSkill(skillName);
    if (!skill) return [];

    const tools = globalMCPRegistry.listAllTools();
    const results: Array<{ tool: ToolMatch; fallback: string }> = [];

    for (const skillTool of skill.tools) {
      const toolInfo = tools.find(t => 
        t.name.toLowerCase() === skillTool.name.toLowerCase()
      );
      
      if (toolInfo) {
        results.push({
          tool: {
            toolId: toolInfo.name,
            serverId: toolInfo.serverId,
            relevance: 0.9,
            description: skillTool.purpose,
            parameters: {}
          },
          fallback: skillTool.fallback
        });
      }
    }

    return results;
  }
}