import fs from 'fs/promises';
import path from 'path';
import { SkillDefinition, SkillMetadata, Workflow, WorkflowPhase, WorkflowStep, DecisionTree, DecisionNode, ToolReference } from './types';

export class SkillLoader {
  async loadFromDirectory(dirPath: string): Promise<SkillDefinition[]> {
    const definitions: SkillDefinition[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dirPath, entry.name, 'SKILL.md');
          try {
            await fs.access(skillPath);
            const content = await fs.readFile(skillPath, 'utf-8');
            const definition = this.parseSKILLmd(content, entry.name);
            definitions.push(definition);
          } catch {
            continue;
          }
        }
      }
    } catch (error) {
      console.error(`Failed to load skills from ${dirPath}:`, error);
    }
    
    return definitions;
  }

  async loadFromSkillDir(basePath: string): Promise<SkillDefinition[]> {
    const definitions: SkillDefinition[] = [];
    const skillDirs = ['engines', 'meta'];
    
    for (const dir of skillDirs) {
      const dirPath = path.join(basePath, dir);
      const skills = await this.loadFromDirectory(dirPath);
      definitions.push(...skills);
    }
    
    return definitions;
  }

  parseSKILLmd(content: string, defaultName?: string): SkillDefinition {
    const metadata = this.extractMetadata(content, defaultName);
    
    const workflows = this.parseWorkflows(content);
    const decisionTrees = this.parseDecisionTrees(content);
    const tools = this.parseTools(content);
    const examples = this.parseExamples(content);
    const constraints = this.parseConstraints(content);
    
    return {
      metadata,
      content,
      workflows,
      decisionTrees,
      tools,
      examples,
      constraints
    };
  }

  extractMetadata(content: string, defaultName?: string): SkillMetadata {
    const lines = content.split('\n');
    
    let name = defaultName || 'unknown';
    let description = '';
    let version = '3.0.0';
    let layer = 'engine';
    let role = name;
    
    let triggers: {
      keywords: string[];
      patterns: string[];
      conditions: string[];
    } = {
      keywords: [],
      patterns: [],
      conditions: []
    };
    
    let capabilities: string[] = [];
    let invokes: string[] = [];
    let invoked_by: string[] = [];
    
    let inIdentity = false;
    let inCoreCapabilities = false;
    let inActivationTriggers = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('# ') && !line.startsWith('##')) {
        const title = line.replace(/^#\s*/, '').replace(/^[^\w]*\s*/, '');
        name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        role = title;
        description = title;
      } else if (line.startsWith('>')) {
        if (description === title) {
          description = line.replace(/^>\s*/, '');
        }
      } else if (line.includes('Identity') || line.includes('身份') || line.includes('身份')) {
        inIdentity = true;
        inCoreCapabilities = false;
        inActivationTriggers = false;
      } else if (line.includes('Core Capabilities') || line.includes('核心能力')) {
        inIdentity = false;
        inCoreCapabilities = true;
        inActivationTriggers = false;
      } else if (line.includes('Activation Triggers') || line.includes('触发条件') || line.includes('触发器')) {
        inCoreCapabilities = false;
        inActivationTriggers = true;
        inIdentity = false;
      } else if (line.startsWith('##')) {
        inIdentity = false;
        inCoreCapabilities = false;
        inActivationTriggers = false;
      } else if (inIdentity) {
        const versionMatch = line.match(/^[*]*Version[*]*:\s*([^\s]+)/i);
        const layerMatch = line.match(/Layer[*]*:\s*([^\s]+)/i);
        if (versionMatch) {
          version = versionMatch[1];
        }
        if (layerMatch) {
          layer = layerMatch[1].toLowerCase() as any;
        }
      } else if (inCoreCapabilities) {
        if (line.startsWith('- **')) {
          const match = line.match(/- \*\*([^*]+)\*\*/);
          if (match) {
            capabilities.push(match[1]);
          }
        }
      } else if (inActivationTriggers) {
        if (line.startsWith('- **')) {
          const match = line.match(/- \*\*([^*]+)\*\*:\s*(.+)/);
          if (match) {
            const lang = match[1];
            const keywords = match[2].split(/,\s*/);
            triggers.keywords = keywords;
          }
        } else if (line.startsWith('-')) {
          const pattern = line.replace(/^-\s*/, '');
          if (pattern) {
            triggers.patterns.push(pattern);
          }
        }
      }
    }
    
    if (name.includes('planner')) layer = 'meta';
    if (name.includes('orchestrator')) layer = 'meta';
    if (name.includes('reflector')) layer = 'meta';
    if (name.includes('skill')) layer = 'meta';
    if (name.includes('learning')) layer = 'meta';
    
    return {
      name,
      description,
      version,
      layer,
      role,
      invokes,
      invoked_by,
      capabilities,
      triggers
    };
  }

  parseWorkflows(content: string): Workflow[] {
    const workflows: Workflow[] = [];
    const lines = content.split('\n');
    
    let workflowName = 'Main Workflow';
    let currentPhase: WorkflowPhase | null = null;
    const phases: WorkflowPhase[] = [];
    
    let inPhaseSection = false;
    let phaseIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('📋') || line.includes('Procedure') || line.includes('流程') || line.includes('工作流') || line.match(/^##\s*(Standard\s*Operating|WORKFLOW|PROCEDURE)/i)) {
        inPhaseSection = true;
        workflowName = line.replace(/^##\s*/, '');
      } else if (line.startsWith('### ')) {
        if (inPhaseSection) {
          if (currentPhase) {
            phases.push(currentPhase);
          }
          currentPhase = {
            id: `phase-${++phaseIndex}`,
            name: line.replace(/^###\s*/, ''),
            description: '',
            tasks: []
          };
        }
      } else if (inPhaseSection && currentPhase) {
        if (line.match(/^\d+\.\s*/) || line.match(/^▢\s*/) || line.startsWith('-')) {
          const task = this.parseWorkflowStep(line, currentPhase.tasks.length + 1);
          if (task) {
            currentPhase.tasks.push(task);
          }
        }
      } else if (line.startsWith('##') && inPhaseSection) {
        if (currentPhase) {
          phases.push(currentPhase);
        }
        inPhaseSection = false;
      }
    }
    
    if (currentPhase) {
      phases.push(currentPhase);
    }
    
    if (phases.length > 0) {
      workflows.push({
        id: 'workflow-main',
        name: workflowName,
        description: '',
        phases
      });
    }
    
    return workflows;
  }

  private parseWorkflowStep(content: string, stepNumber: number): WorkflowStep | null {
    const step: Partial<WorkflowStep> = {
      id: `step-${stepNumber}`,
      type: 'action',
      description: '',
      dependencies: [],
      priority: 'medium',
      retries: 3,
      timeout: 30000
    };
    
    let cleaned = content;
    
    cleaned = cleaned.replace(/^\d+\.\s*/, '');
    cleaned = cleaned.replace(/^▢\s*/, '');
    cleaned = cleaned.replace(/^-\s*/, '');
    cleaned = cleaned.replace(/^```/, '');
    
    if (!cleaned) return null;
    
    const loopMatch = cleaned.match(/^\s*LOOP\s+(\d+)\s+TIMES\s*[:-]\s*(.+)/i);
    if (loopMatch) {
      step.type = 'loop';
      step.description = loopMatch[2];
      step.loopCount = Math.min(Math.max(parseInt(loopMatch[1]) || 1, 1), 100);
      return step as WorkflowStep;
    }
    
    const ifMatch = cleaned.match(/^\s*IF\s+([^\n:+-]{1,200})\s*[:-]\s*(.+)/i);
    if (ifMatch) {
      step.type = 'conditional';
      step.condition = ifMatch[1];
      step.description = ifMatch[2];
      return step as WorkflowStep;
    }
    
    const invokeMatch = cleaned.match(/^\s*INVOKE\s+([\w-]+)\s*[:-]\s*(.+)/i);
    if (invokeMatch) {
      step.type = 'invoke';
      step.skill = invokeMatch[1];
      step.description = invokeMatch[2];
      return step as WorkflowStep;
    }
    
    const useMatch = cleaned.match(/^\s*USE\s+([\w-]+)\s*[:-]\s*(.+)/i);
    if (useMatch) {
      step.type = 'tool';
      step.tool = useMatch[1];
      step.description = useMatch[2];
      return step as WorkflowStep;
    }
    
    const waitMatch = cleaned.match(/^\s*WAIT\s+(\d+)\s*(ms|s|m|h)\s*[:-]\s*(.+)/i);
    if (waitMatch) {
      step.type = 'wait';
      let duration = parseInt(waitMatch[1]);
      const unit = waitMatch[2].toLowerCase();
      switch(unit) {
        case 'm': duration *= 60; 
        case 's': duration *= 1000;
        case 'h': duration *= 60 * 60 * 1000;
      }
      step.waitDuration = duration;
      step.description = waitMatch[3];
      return step as WorkflowStep;
    }
    
    const endMatch = cleaned.match(/^\s*(END|FINISH|RETURN)\s*[:-]*(.*)/i);
    if (endMatch) {
      step.type = 'end';
      step.description = endMatch[2] || 'Finish task';
      return step as WorkflowStep;
    }
    
    step.description = cleaned;
    return step as WorkflowStep;
  }

  parseDecisionTrees(content: string): DecisionTree[] {
    return [];
  }

  parseTools(content: string): ToolReference[] {
    const tools: ToolReference[] = [];

    const tableMatch = content.match(/\|[^|\n]*Tool[^|\n]*\|[^|\n]*Purpose[^|\n]*\|[^|\n]*Fallback[^|\n]*\|[\s\S]{0,5000}(?:\n{2,}|$)/i);
    if (tableMatch) {
      const table = tableMatch[0];
      const lines = table.split('\n').filter(l => l.includes('|'));

      for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 3 && !cells[0].match(/Tool/i)) {
          tools.push({
            name: cells[0],
            purpose: cells[1],
            fallback: cells[2]
          });
        }
      }
    }

    return tools;
  }

  parseExamples(content: string): string[] {
    const examples: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('>')) {
        examples.push(line.replace(/^>\s*/, ''));
      }
    }
    
    return examples;
  }

  parseConstraints(content: string): Record<string, any> {
    const constraints: Record<string, any> = {};
    const lines = content.split('\n');
    
    let inConstraints = false;
    for (const line of lines) {
      if (line.startsWith('## ⚠️')) {
        inConstraints = true;
      } else if (line.startsWith('##') && inConstraints) {
        inConstraints = false;
      } else if (inConstraints) {
        if (line.trim().startsWith('-') || line.trim().startsWith('I will ')) {
          const key = `rule-${Object.keys(constraints).length + 1}`;
          constraints[key] = line.trim();
        }
      }
    }
    
    return constraints;
  }
}
