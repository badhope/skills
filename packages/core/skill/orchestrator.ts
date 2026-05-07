import { SkillRegistry } from './registry';
import { SkillDefinition, TaskAnalysis, TaskContext, TaskStep, TaskResult, WorkflowPhase } from './types';

export class SkillOrchestrator {
  constructor(private registry: SkillRegistry) {}

  analyzeTask(description: string): TaskAnalysis {
    const matches = this.registry.matchSkills(description);
    
    if (matches.length === 0) {
      return {
        complexity: 1,
        factors: ['simple'],
        estimatedTime: '1-2 minutes',
        confidence: 0.5,
        matchedSkill: 'unknown',
        recommendedWorkflow: 'default'
      };
    }

    const bestMatch = matches[0];
    const skill = bestMatch.skill;
    const complexity = this.calculateComplexity(description, skill);

    return {
      complexity,
      factors: this.identifyComplexityFactors(description),
      estimatedTime: this.estimateTime(complexity),
      confidence: Math.min(0.95, bestMatch.score / 10),
      matchedSkill: skill.metadata.name,
      recommendedWorkflow: skill.workflows[0]?.name || 'default'
    };
  }

  async executeTask(description: string): Promise<TaskResult> {
    const analysis = this.analyzeTask(description);
    const skill = this.registry.getSkill(analysis.matchedSkill);
    
    if (!skill) {
      return {
        success: false,
        error: `No skill found for task: ${description}`,
        steps: []
      };
    }

    const context: TaskContext = {
      id: `task-${Date.now()}`,
      description,
      complexity: analysis.complexity,
      currentSkill: skill.metadata.name,
      history: [],
      results: {}
    };

    return this.executeSkill(skill, context);
  }

  private async executeSkill(skill: SkillDefinition, context: TaskContext): Promise<TaskResult> {
    const steps: TaskStep[] = [];

    try {
      if (skill.workflows.length > 0) {
        for (const workflow of skill.workflows) {
          for (const phase of workflow.phases) {
            const phaseResult = await this.executePhase(phase, skill, context);
            steps.push(...phaseResult.steps);
            
            if (!phaseResult.success) {
              return {
                success: false,
                error: phaseResult.error,
                steps
              };
            }
          }
        }
      } else {
        const step = await this.executeDirectSkill(skill, context);
        steps.push(step);
      }

      return {
        success: true,
        data: context.results,
        steps
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        steps
      };
    }
  }

  private async executePhase(phase: WorkflowPhase, skill: SkillDefinition, context: TaskContext): Promise<{
    success: boolean;
    error?: string;
    steps: TaskStep[];
  }> {
    const steps: TaskStep[] = [];
    const pendingTasks = [...phase.tasks];
    const completedTasks = new Set<string>();

    while (pendingTasks.length > 0) {
      let progressed = false;

      for (let i = pendingTasks.length - 1; i >= 0; i--) {
        const task = pendingTasks[i];
        const dependenciesMet = task.dependencies.every(d => completedTasks.has(d));

        if (dependenciesMet) {
          pendingTasks.splice(i, 1);
          progressed = true;

          const step = await this.executeWorkflowStep(task, skill, context);
          steps.push(step);
          completedTasks.add(task.id);

          if (step.status === 'failed') {
            return {
              success: false,
              error: step.output?.error || 'Task failed',
              steps
            };
          }
        }
      }

      if (!progressed && pendingTasks.length > 0) {
        return {
          success: false,
          error: 'Circular dependency detected or missing dependencies',
          steps
        };
      }
    }

    return { success: true, steps };
  }

  private async executeWorkflowStep(task: { id: string; description: string; skill?: string }, 
                                    parentSkill: SkillDefinition, context: TaskContext): Promise<TaskStep> {
    const timestamp = new Date();

    try {
      let output: any;

      if (task.skill && task.skill !== parentSkill.metadata.name) {
        const subSkill = this.registry.getSkill(task.skill);
        if (subSkill) {
          const subContext: TaskContext = {
            ...context,
            currentSkill: task.skill,
            description: task.description
          };
          const result = await this.executeSkill(subSkill, subContext);
          output = result.data;
          context.results[task.id] = result.data;
        } else {
          output = { warning: `Skill ${task.skill} not found, skipping` };
        }
      } else {
        output = { executed: true, task: task.description };
        context.results[task.id] = output;
      }

      return {
        skillName: task.skill || parentSkill.metadata.name,
        input: task.description,
        output,
        timestamp,
        status: 'success'
      };
    } catch (error) {
      return {
        skillName: task.skill || parentSkill.metadata.name,
        input: task.description,
        output: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp,
        status: 'failed'
      };
    }
  }

  private async executeDirectSkill(skill: SkillDefinition, context: TaskContext): Promise<TaskStep> {
    const timestamp = new Date();

    try {
      const output = {
        skill: skill.metadata.name,
        capabilities: skill.metadata.capabilities,
        tools: skill.tools.map(t => t.name),
        message: `Executing ${skill.metadata.name}`
      };

      context.results[skill.metadata.name] = output;

      return {
        skillName: skill.metadata.name,
        input: context.description,
        output,
        timestamp,
        status: 'success'
      };
    } catch (error) {
      return {
        skillName: skill.metadata.name,
        input: context.description,
        output: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp,
        status: 'failed'
      };
    }
  }

  invokeSkill(skillName: string, input: any): Promise<any> {
    const skill = this.registry.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill ${skillName} not found`);
    }

    const context: TaskContext = {
      id: `invoke-${Date.now()}`,
      description: typeof input === 'string' ? input : JSON.stringify(input),
      complexity: 1,
      currentSkill: skillName,
      history: [],
      results: {}
    };

    return this.executeSkill(skill, context).then(result => result.data);
  }

  evaluateDecisionTree(skill: SkillDefinition, context: TaskContext): string {
    for (const tree of skill.decisionTrees) {
      const result = this.traverseDecisionTree(tree.root, context);
      if (result) return result;
    }
    return skill.metadata.name;
  }

  private traverseDecisionTree(node: any, context: TaskContext): string | null {
    if (!node) return null;

    if (node.question === 'START') {
      for (const child of node.children || []) {
        const result = this.traverseDecisionTree(child, context);
        if (result) return result;
      }
      return node.default || null;
    }

    if (node.yes && node.no) {
      const answer = this.evaluateCondition(node.question, context);
      const nextNodeId = answer ? node.yes : node.no;
      
      for (const child of node.children || []) {
        if (this.matchesNode(child, nextNodeId)) {
          return this.traverseDecisionTree(child, context);
        }
      }
      return nextNodeId;
    }

    if (node.default) {
      return node.default;
    }

    return null;
  }

  private evaluateCondition(question: string, context: TaskContext): boolean {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('bug') || lowerQuestion.includes('error')) {
      return context.description.toLowerCase().includes('bug') || 
             context.description.toLowerCase().includes('error');
    }
    if (lowerQuestion.includes('feature') || lowerQuestion.includes('implement')) {
      return context.description.toLowerCase().includes('feature') || 
             context.description.toLowerCase().includes('implement');
    }
    if (lowerQuestion.includes('refactor')) {
      return context.description.toLowerCase().includes('refactor');
    }
    if (lowerQuestion.includes('research') || lowerQuestion.includes('analyze')) {
      return context.description.toLowerCase().includes('research') || 
             context.description.toLowerCase().includes('analyze');
    }
    
    return false;
  }

  private matchesNode(node: any, target: string): boolean {
    return node.question?.toLowerCase().includes(target.toLowerCase()) || 
           node.yes === target || 
           node.no === target;
  }

  transformOutput(sourceSkill: string, targetSkill: string, output: any): any {
    const source = this.registry.getSkill(sourceSkill);
    const target = this.registry.getSkill(targetSkill);

    if (!source || !target) {
      return output;
    }

    const transformed: Record<string, any> = {};

    if (typeof output === 'object' && output !== null) {
      for (const key of Object.keys(output)) {
        const transformedKey = this.mapKey(key, source, target);
        transformed[transformedKey] = output[key];
      }
    }

    return transformed;
  }

  private mapKey(key: string, source: SkillDefinition, target: SkillDefinition): string {
    const keyMap: Record<string, string> = {
      'result': 'input',
      'output': 'input',
      'data': 'params',
      'response': 'input',
      'task': 'task'
    };
    return keyMap[key] || key;
  }

  private calculateComplexity(description: string, skill: SkillDefinition): number {
    let complexity = 1;
    
    if (description.includes(' and ') || description.includes(' then ')) complexity++;
    if (description.includes('multiple') || description.includes('several')) complexity++;
    if (description.includes('complex') || description.includes('comprehensive')) complexity++;
    if (skill.metadata.capabilities.length > 5) complexity++;
    if (skill.metadata.invokes.length > 3) complexity++;

    return Math.min(10, complexity);
  }

  private identifyComplexityFactors(description: string): string[] {
    const factors: string[] = [];
    
    if (description.includes(' and ') || description.includes(' also ')) factors.push('multi-step');
    if (description.includes('file') || description.includes('module')) factors.push('cross-file');
    if (description.includes('API') || description.includes('service')) factors.push('external-api');
    if (description.includes('security') || description.includes('auth')) factors.push('security-critical');
    if (description.includes('database') || description.includes('data')) factors.push('data-intensive');
    
    return factors;
  }

  private estimateTime(complexity: number): string {
    const timeMap: Record<number, string> = {
      1: '1-2 minutes',
      2: '2-5 minutes',
      3: '5-10 minutes',
      4: '10-15 minutes',
      5: '15-20 minutes',
      6: '20-30 minutes',
      7: '30-45 minutes',
      8: '45-60 minutes',
      9: '1-2 hours',
      10: '2+ hours'
    };
    return timeMap[complexity] || 'unknown';
  }
}