import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  tools: string[];
}

export interface SkillToolMapping {
  required_tools: string[];
  recommended_tools: string[];
}

export interface FallbackStrategy {
  unavailable: string;
  partial: string;
}

export interface PlatformToolAdapter {
  [toolType: string]: {
    [operation: string]: string;
  };
}

export interface CapabilityEntry {
  tools: string[];
  skills: string[];
}

export interface ToolSkillMappingConfig {
  version: string;
  description: string;
  tool_categories: ToolCategory[];
  skill_tool_mapping: Record<string, SkillToolMapping>;
  fallback_strategies: Record<string, FallbackStrategy>;
  platform_adapters: Record<string, PlatformToolAdapter>;
  capability_matrix: Record<string, CapabilityEntry>;
  auto_discovery: {
    enabled: boolean;
    cache_ttl: number;
    fallback_skill: string;
    discovery_endpoints: string[];
  };
}

export class ToolSkillMapper {
  private config: ToolSkillMappingConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(
      __dirname, '../../..', '.agent-skills', 'skills', 'config', 'tool-skill-mapping.yaml'
    );
    this.config = this.loadConfig();
  }

  private loadConfig(): ToolSkillMappingConfig {
    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      return yaml.load(content) as ToolSkillMappingConfig;
    } catch (error) {
      console.warn(`Failed to load tool-skill mapping config: ${error}`);
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): ToolSkillMappingConfig {
    return {
      version: '3.0',
      description: 'Default Tool-Skill Mapping',
      tool_categories: [],
      skill_tool_mapping: {},
      fallback_strategies: {},
      platform_adapters: {},
      capability_matrix: {},
      auto_discovery: {
        enabled: true,
        cache_ttl: 300000,
        fallback_skill: 'fullstack-engine',
        discovery_endpoints: []
      }
    };
  }

  getToolCategories(): ToolCategory[] {
    return this.config.tool_categories;
  }

  getCategoryTools(categoryId: string): string[] {
    const category = this.config.tool_categories.find(c => c.id === categoryId);
    return category?.tools || [];
  }

  getSkillTools(skillId: string): SkillToolMapping | undefined {
    return this.config.skill_tool_mapping[skillId];
  }

  getRequiredTools(skillId: string): string[] {
    return this.config.skill_tool_mapping[skillId]?.required_tools || [];
  }

  getRecommendedTools(skillId: string): string[] {
    return this.config.skill_tool_mapping[skillId]?.recommended_tools || [];
  }

  getFallbackStrategy(toolCategory: string): FallbackStrategy | undefined {
    return this.config.fallback_strategies[toolCategory];
  }

  getPlatformAdapter(platform: string): PlatformToolAdapter | undefined {
    return this.config.platform_adapters[platform];
  }

  getPlatformToolName(platform: string, toolType: string, operation: string): string | undefined {
    const adapter = this.config.platform_adapters[platform];
    if (!adapter) return undefined;
    
    const toolAdapter = adapter[toolType];
    if (!toolAdapter) return undefined;
    
    return toolAdapter[operation];
  }

  getCapabilityTools(capability: string): string[] {
    return this.config.capability_matrix[capability]?.tools || [];
  }

  getCapabilitySkills(capability: string): string[] {
    return this.config.capability_matrix[capability]?.skills || [];
  }

  findSkillsByTool(toolName: string): string[] {
    const matchingSkills: string[] = [];
    
    for (const [skillId, mapping] of Object.entries(this.config.skill_tool_mapping)) {
      if (mapping.required_tools.includes(toolName) || 
          mapping.recommended_tools.includes(toolName)) {
        matchingSkills.push(skillId);
      }
    }
    
    return matchingSkills;
  }

  findSkillsByCapability(capability: string): string[] {
    return this.getCapabilitySkills(capability);
  }

  validateSkillTools(skillId: string, availableTools: string[]): {
    missingRequired: string[];
    missingRecommended: string[];
    availableRequired: string[];
    availableRecommended: string[];
  } {
    const mapping = this.getSkillTools(skillId);
    if (!mapping) {
      return {
        missingRequired: [],
        missingRecommended: [],
        availableRequired: [],
        availableRecommended: []
      };
    }

    const missingRequired = mapping.required_tools.filter(t => !availableTools.includes(t));
    const missingRecommended = mapping.recommended_tools.filter(t => !availableTools.includes(t));
    const availableRequired = mapping.required_tools.filter(t => availableTools.includes(t));
    const availableRecommended = mapping.recommended_tools.filter(t => availableTools.includes(t));

    return {
      missingRequired,
      missingRecommended,
      availableRequired,
      availableRecommended
    };
  }

  suggestSkills(availableTools: string[]): {
    skillId: string;
    score: number;
    requiredCoverage: number;
    recommendedCoverage: number;
    missingRequired: string[];
    missingRecommended: string[];
  }[] {
    const results: {
      skillId: string;
      score: number;
      requiredCoverage: number;
      recommendedCoverage: number;
      missingRequired: string[];
      missingRecommended: string[];
    }[] = [];

    for (const [skillId, mapping] of Object.entries(this.config.skill_tool_mapping)) {
      const validation = this.validateSkillTools(skillId, availableTools);
      
      const requiredCoverage = mapping.required_tools.length > 0
        ? validation.availableRequired.length / mapping.required_tools.length
        : 1;
      
      const recommendedCoverage = mapping.recommended_tools.length > 0
        ? validation.availableRecommended.length / mapping.recommended_tools.length
        : 1;

      const score = (requiredCoverage * 0.7) + (recommendedCoverage * 0.3);

      results.push({
        skillId,
        score,
        requiredCoverage,
        recommendedCoverage,
        missingRequired: validation.missingRequired,
        missingRecommended: validation.missingRecommended
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  suggestToolsForCapability(capability: string): string[] {
    return this.getCapabilityTools(capability);
  }

  suggestSkillsForCapability(capability: string): string[] {
    return this.getCapabilitySkills(capability);
  }

  getAutoDiscoveryConfig() {
    return this.config.auto_discovery;
  }

  getFallbackSkill(): string {
    return this.config.auto_discovery.fallback_skill;
  }

  reloadConfig(): void {
    this.config = this.loadConfig();
  }
}

export const toolSkillMapper = new ToolSkillMapper();

export default ToolSkillMapper;
