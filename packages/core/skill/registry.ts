import { SkillDefinition, SkillMetadata } from './types';

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private skillGraph: Map<string, string[]> = new Map();
  private reverseGraph: Map<string, string[]> = new Map();
  private keywordIndex: Map<string, string[]> = new Map();

  registerSkill(skill: SkillDefinition): void {
    const name = skill.metadata.name;
    this.skills.set(name, skill);
    
    this.skillGraph.set(name, skill.metadata.invokes || []);
    
    for (const invoked of skill.metadata.invokes || []) {
      if (!this.reverseGraph.has(invoked)) {
        this.reverseGraph.set(invoked, []);
      }
      this.reverseGraph.get(invoked)!.push(name);
    }
    
    this.buildKeywordIndex(skill);
  }

  unregisterSkill(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    
    this.skills.delete(name);
    this.skillGraph.delete(name);
    
    for (const invoked of skill.metadata.invokes || []) {
      const callers = this.reverseGraph.get(invoked);
      if (callers) {
        this.reverseGraph.set(invoked, callers.filter(c => c !== name));
      }
    }
    
    this.reverseGraph.forEach((callers, invoked) => {
      this.reverseGraph.set(invoked, callers.filter(c => c !== name));
    });
    
    this.rebuildKeywordIndex();
    return true;
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkillsByLayer(layer: 'meta' | 'engine' | 'workflow' | 'action'): SkillDefinition[] {
    return Array.from(this.skills.values()).filter(s => s.metadata.layer === layer);
  }

  matchSkills(taskDescription: string): Array<{
    skill: SkillDefinition;
    score: number;
    matchedTriggers: string[];
  }> {
    const results: Array<{
      skill: SkillDefinition;
      score: number;
      matchedTriggers: string[];
    }> = [];

    for (const skill of this.skills.values()) {
      const { score, matchedTriggers } = this.calculateMatchScore(skill, taskDescription);
      if (score > 0) {
        results.push({ skill, score, matchedTriggers });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private calculateMatchScore(skill: SkillDefinition, taskDescription: string): {
    score: number;
    matchedTriggers: string[];
  } {
    let score = 0;
    const matchedTriggers: string[] = [];
    const lowerTask = taskDescription.toLowerCase();

    for (const keyword of skill.metadata.triggers.keywords) {
      if (lowerTask.includes(keyword.toLowerCase())) {
        score += 2;
        matchedTriggers.push(keyword);
      }
    }

    for (const pattern of skill.metadata.triggers.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(taskDescription)) {
          score += 3;
          matchedTriggers.push(pattern);
        }
      } catch {
        continue;
      }
    }

    for (const capability of skill.metadata.capabilities) {
      if (lowerTask.includes(capability.toLowerCase())) {
        score += 1;
      }
    }

    return { score, matchedTriggers };
  }

  findCallers(skillName: string): SkillDefinition[] {
    const callers = this.reverseGraph.get(skillName) || [];
    return callers.map(name => this.skills.get(name)).filter(Boolean) as SkillDefinition[];
  }

  findCallees(skillName: string): SkillDefinition[] {
    const callees = this.skillGraph.get(skillName) || [];
    return callees.map(name => this.skills.get(name)).filter(Boolean) as SkillDefinition[];
  }

  getCallChain(targetSkill: string, maxDepth: number = 5): string[][] {
    const chains: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[]) => {
      if (path.length > maxDepth) return;
      if (current === targetSkill) {
        chains.push([...path, current]);
        return;
      }
      if (visited.has(current)) return;

      visited.add(current);
      const callees = this.skillGraph.get(current) || [];
      
      for (const callee of callees) {
        dfs(callee, [...path, current]);
      }
      visited.delete(current);
    };

    for (const skill of this.skills.keys()) {
      dfs(skill, []);
    }

    return chains;
  }

  getSkillGraph(): { nodes: string[]; edges: Array<{ from: string; to: string }> } {
    const nodes = Array.from(this.skills.keys());
    const edges: Array<{ from: string; to: string }> = [];

    for (const [from, tos] of this.skillGraph) {
      for (const to of tos) {
        if (this.skills.has(to)) {
          edges.push({ from, to });
        }
      }
    }

    return { nodes, edges };
  }

  findSkillsByCapability(capability: string): SkillDefinition[] {
    return Array.from(this.skills.values()).filter(skill =>
      skill.metadata.capabilities.some(c => 
        c.toLowerCase().includes(capability.toLowerCase())
      )
    );
  }

  findSkillsByTool(toolName: string): SkillDefinition[] {
    return Array.from(this.skills.values()).filter(skill =>
      skill.tools.some(t => t.name.toLowerCase() === toolName.toLowerCase())
    );
  }

  private buildKeywordIndex(skill: SkillDefinition): void {
    const allKeywords = [
      ...skill.metadata.triggers.keywords,
      ...skill.metadata.capabilities
    ];

    for (const keyword of allKeywords) {
      const normalized = keyword.toLowerCase();
      if (!this.keywordIndex.has(normalized)) {
        this.keywordIndex.set(normalized, []);
      }
      this.keywordIndex.get(normalized)!.push(skill.metadata.name);
    }
  }

  private rebuildKeywordIndex(): void {
    this.keywordIndex.clear();
    for (const skill of this.skills.values()) {
      this.buildKeywordIndex(skill);
    }
  }

  suggestSkills(taskDescription: string, topN: number = 5): SkillDefinition[] {
    const matches = this.matchSkills(taskDescription);
    return matches.slice(0, topN).map(m => m.skill);
  }

  validateSkillDependencies(skill: SkillDefinition): string[] {
    const missing: string[] = [];
    for (const invoked of skill.metadata.invokes) {
      if (!this.skills.has(invoked)) {
        missing.push(invoked);
      }
    }
    return missing;
  }

  getSkillSummary(name: string): Partial<SkillMetadata> | null {
    const skill = this.skills.get(name);
    if (!skill) return null;

    const { name: skillName, description, layer, role, capabilities, version } = skill.metadata;
    return { name: skillName, description, layer, role, capabilities, version };
  }
}