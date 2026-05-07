import { BaseSkill, SkillContext, SkillResult } from './base-skill';
import { TaskPlannerSkill } from './task-planner';
import { FullstackEngineSkill } from './fullstack-engine';
import { TestingMasterSkill } from './testing-master';
import { SecurityAuditorSkill } from './security-auditor';
import { CodeQualityExpertSkill } from './code-quality-expert';
import { BugHunterSkill } from './bug-hunter';
import { DevOpsEngineerSkill } from './devops-engineer';
import { MessageBus } from '../agentMessageBus';
import * as yaml from 'js-yaml';

export interface OrchestratorConfig {
  maxIterations: number;
  timeout: number;
  enableParallel: boolean;
}

export interface WorkflowExecution {
  id: string;
  name: string;
  currentStep: number;
  totalSteps: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: SkillResult[];
  startTime: number;
  endTime?: number;
}

export class SkillOrchestrator {
  private skills: Map<string, BaseSkill> = new Map();
  private messageBus: MessageBus;
  private config: OrchestratorConfig;
  private currentExecution: WorkflowExecution | null = null;

  constructor(messageBus: MessageBus, config?: Partial<OrchestratorConfig>) {
    this.messageBus = messageBus;
    this.config = {
      maxIterations: 10,
      timeout: 60000,
      enableParallel: false,
      ...config
    };

    // Initialize all core skills
    this.registerSkill(new TaskPlannerSkill(messageBus));
    this.registerSkill(new FullstackEngineSkill(messageBus));
    this.registerSkill(new TestingMasterSkill(messageBus));
    this.registerSkill(new SecurityAuditorSkill(messageBus));
    this.registerSkill(new CodeQualityExpertSkill(messageBus));
    this.registerSkill(new BugHunterSkill(messageBus));
    this.registerSkill(new DevOpsEngineerSkill(messageBus));
  }

  registerSkill(skill: BaseSkill): void {
    this.skills.set(skill.skillId, skill);
    console.log(`[Orchestrator] Registered skill: ${skill.skillId}`);
  }

  getSkill(skillId: string): BaseSkill | undefined {
    return this.skills.get(skillId);
  }

  getAllSkills(): { skillId: string; skillName: string; description: string }[] {
    return Array.from(this.skills.values()).map(skill => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      description: skill.description
    }));
  }

  async executeWorkflow(
    workflow: any,
    userInput: string,
    availableTools: string[] = []
  ): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      id: `workflow-${Date.now()}`,
      name: workflow.name || 'Unnamed Workflow',
      currentStep: 0,
      totalSteps: workflow.stages?.length || 0,
      status: 'pending',
      results: [],
      startTime: Date.now()
    };

    this.currentExecution = execution;
    console.log(`[Orchestrator] Starting workflow: ${execution.name}`);

    try {
      execution.status = 'running';

      // Start with task planner if no stages
      if (!workflow.stages || workflow.stages.length === 0) {
        const result = await this.executeSkill(
          'task-planner',
          userInput,
          availableTools
        );
        execution.results.push(result);

        // Follow suggested next skills
        for (const nextSkill of result.nextSkills || []) {
          const nextResult = await this.executeSkill(
            nextSkill,
            userInput,
            availableTools
          );
          execution.results.push(nextResult);
        }
      } else {
        // Execute each stage in sequence
        for (let i = 0; i < workflow.stages.length; i++) {
          const stage = workflow.stages[i];
          execution.currentStep = i;

          console.log(`[Orchestrator] Executing stage ${i + 1}/${workflow.stages.length}: ${stage.name}`);

          // Determine which skill to use
          const skillId = stage.skill || this.determineSkillForStage(stage, userInput);

          if (skillId) {
            const result = await this.executeSkill(
              skillId,
              userInput,
              availableTools
            );
            execution.results.push(result);

            if (!result.success) {
              execution.status = 'failed';
              break;
            }
          }
        }
      }

      execution.status = execution.results.every(r => r.success) ? 'completed' : 'failed';

    } catch (error) {
      console.error('[Orchestrator] Workflow execution failed:', error);
      execution.status = 'failed';
    }

    execution.endTime = Date.now();
    this.currentExecution = null;
    return execution;
  }

  async executeSkill(
    skillId: string,
    userInput: string,
    availableTools: string[]
  ): Promise<SkillResult> {
    const skill = this.skills.get(skillId);

    if (!skill) {
      console.warn(`[Orchestrator] Skill not found: ${skillId}`);
      return {
        success: false,
        outputs: [],
        confidence: 0,
        errors: [`Skill not found: ${skillId}`]
      };
    }

    const context: SkillContext = {
      taskId: `task-${Date.now()}`,
      userInput,
      tools: availableTools
    };

    const canExecute = await skill.canExecute(context);
    if (!canExecute) {
      console.warn(`[Orchestrator] Skill cannot execute, missing required tools: ${skillId}`);
      return {
        success: false,
        outputs: [],
        confidence: 0,
        errors: [`Missing required tools for skill: ${skillId}`]
      };
    }

    return await skill.execute(context);
  }

  private determineSkillForStage(stage: any, userInput: string): string | null {
    const stageName = stage.name?.toLowerCase() || '';
    const stageDescription = stage.description?.toLowerCase() || '';

    if (stageName.includes('design') || stageDescription.includes('plan')) {
      return 'task-planner';
    }
    if (stageName.includes('test') || stageDescription.includes('test')) {
      return 'testing-master';
    }
    if (stageName.includes('security') || stageDescription.includes('security')) {
      return 'security-auditor';
    }
    if (stageName.includes('review') || stageName.includes('quality') || stageDescription.includes('review')) {
      return 'code-quality-expert';
    }
    if (stageName.includes('implement') || stageDescription.includes('code')) {
      return 'fullstack-engine';
    }
    if (stageName.includes('bug') || stageDescription.includes('bug')) {
      return 'bug-hunter';
    }
    if (stageName.includes('deploy') || stageDescription.includes('deploy')) {
      return 'devops-engineer';
    }

    return 'fullstack-engine'; // Default
  }

  getCurrentExecution(): WorkflowExecution | null {
    return this.currentExecution;
  }

  async loadWorkflowFromFile(filePath: string): Promise<any> {
    // In real implementation, would read from filesystem
    return {
      name: 'Default Workflow',
      stages: [
        { id: 'analysis', name: 'Task Analysis', required: true },
        { id: 'development', name: 'Implementation', required: true },
        { id: 'testing', name: 'Testing', required: true }
      ]
    };
  }
}
