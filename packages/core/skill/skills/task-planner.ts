import { BaseSkill, SkillContext, SkillResult } from './base-skill';
import { MessageBus } from '../agentMessageBus';

export class TaskPlannerSkill extends BaseSkill {
  readonly skillId = 'task-planner';
  readonly skillName = 'Task Planner';
  readonly description = 'Analyze requirements and create execution plans';
  readonly requiredTools = ['thinking', 'search'];
  readonly recommendedTools = ['memory', 'filesystem'];

  constructor(messageBus: MessageBus) {
    super(messageBus);
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    this.log(`Starting task planning for: ${context.userInput}`);

    const outputs = [];

    // Step 1: Analyze requirements
    const requirements = await this.analyzeRequirements(context.userInput);
    outputs.push({ type: 'requirements', data: requirements });

    // Step 2: Create task breakdown
    const taskBreakdown = await this.createTaskBreakdown(requirements);
    outputs.push({ type: 'taskBreakdown', data: taskBreakdown });

    // Step 3: Generate timeline
    const timeline = this.generateTimeline(taskBreakdown);
    outputs.push({ type: 'timeline', data: timeline });

    // Step 4: Determine skill requirements
    const skillRequirements = this.determineSkillRequirements(taskBreakdown);

    this.log('Task planning complete');

    return {
      success: true,
      outputs,
      confidence: 0.9,
      nextSkills: skillRequirements
    };
  }

  private async analyzeRequirements(input: string): Promise<{
    objectives: string[];
    constraints: string[];
    priority: 'high' | 'medium' | 'low';
    estimatedComplexity: 'simple' | 'medium' | 'complex';
  }> {
    const objectives: string[] = [];
    const constraints: string[] = [];

    // Simple keyword-based analysis
    const inputLower = input.toLowerCase();

    if (inputLower.includes('create') || inputLower.includes('build')) {
      objectives.push('Create a new project/component');
    }
    if (inputLower.includes('react')) {
      objectives.push('Use React as frontend framework');
    }
    if (inputLower.includes('typescript')) {
      objectives.push('Use TypeScript for type safety');
    }

    if (inputLower.includes('time') || inputLower.includes('deadline')) {
      constraints.push('Time-sensitive task');
    }
    if (inputLower.includes('budget') || inputLower.includes('cost')) {
      constraints.push('Cost constraints to consider');
    }

    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (inputLower.includes('urgent') || inputLower.includes('asap')) {
      priority = 'high';
    }

    let complexity: 'simple' | 'medium' | 'complex' = 'medium';
    if (inputLower.includes('simple') || inputLower.includes('basic')) {
      complexity = 'simple';
    } else if (inputLower.includes('complex') || inputLower.includes('large')) {
      complexity = 'complex';
    }

    return {
      objectives,
      constraints,
      priority,
      estimatedComplexity: complexity
    };
  }

  private async createTaskBreakdown(requirements: any): Promise<{
    phases: { name: string; tasks: string[]; dependencies: string[] }[];
  }> {
    const phases = [];

    // Phase 1: Setup
    phases.push({
      name: 'Project Setup',
      tasks: ['Initialize repository', 'Configure tooling', 'Set up dependencies'],
      dependencies: []
    });

    // Phase 2: Development
    phases.push({
      name: 'Core Development',
      tasks: ['Implement core features', 'Write tests', 'Code quality checks'],
      dependencies: ['Project Setup']
    });

    // Phase 3: Testing
    phases.push({
      name: 'Testing',
      tasks: ['Run all tests', 'Fix issues', 'Performance validation'],
      dependencies: ['Core Development']
    });

    // Phase 4: Delivery
    phases.push({
      name: 'Delivery',
      tasks: ['Prepare deployment', 'Create documentation'],
      dependencies: ['Testing']
    });

    return { phases };
  }

  private generateTimeline(taskBreakdown: any): {
    phases: { name: string; estimatedDuration: string }[];
    totalDuration: string;
  } {
    const phases = taskBreakdown.phases.map((phase: any) => ({
      name: phase.name,
      estimatedDuration: phase.tasks.length * 10 + ' minutes'
    }));

    const totalMinutes = phases.reduce((sum: number, p: any) => {
      const match = p.estimatedDuration.match(/\d+/);
      return sum + (match ? parseInt(match[0]) : 0);
    }, 0);

    return {
      phases,
      totalDuration: totalMinutes + ' minutes'
    };
  }

  private determineSkillRequirements(taskBreakdown: any): string[] {
    const skills: string[] = [];
    const taskText = JSON.stringify(taskBreakdown).toLowerCase();

    if (taskText.includes('code') || taskText.includes('develop')) {
      skills.push('fullstack-engine');
    }
    if (taskText.includes('test')) {
      skills.push('testing-master');
    }
    if (taskText.includes('document')) {
      skills.push('documentation-suite');
    }

    return skills;
  }
}
