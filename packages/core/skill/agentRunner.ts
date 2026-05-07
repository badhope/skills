import crypto from 'crypto';
import { SkillRegistry } from './registry';
import { SkillOrchestrator } from './orchestrator';
import { WorkflowEngine } from './workflowEngine';
import { ToolDiscoveryEngine } from './toolDiscovery';
import { ErrorHandler } from './errorHandler';
import { Monitor, globalMonitor } from './monitor';
import { TaskContext, TaskResult, SkillDefinition } from './types';

export interface AgentConfig {
  name?: string;
  version?: string;
  enableMonitor?: boolean;
  enableErrorRecovery?: boolean;
  maxRetries?: number;
}

export interface AgentResponse {
  success: boolean;
  taskId: string;
  skillUsed: string;
  result?: any;
  error?: string;
  metrics?: {
    duration: number;
    steps: number;
    toolsUsed: string[];
    errors: number;
  };
  logs?: any[];
}

export class AgentRunner {
  private registry: SkillRegistry;
  private orchestrator: SkillOrchestrator;
  private workflowEngine: WorkflowEngine;
  private errorHandler: ErrorHandler;
  private monitor: Monitor;
  private config: Required<AgentConfig>;

  constructor(skillRegistry: SkillRegistry, config: AgentConfig = {}) {
    this.registry = skillRegistry;
    this.orchestrator = new SkillOrchestrator(skillRegistry);
    this.workflowEngine = new WorkflowEngine(skillRegistry);
    this.errorHandler = new ErrorHandler();
    this.monitor = globalMonitor;
    
    this.config = {
      name: config.name || 'AgentRunner',
      version: config.version || '1.0.0',
      enableMonitor: config.enableMonitor ?? true,
      enableErrorRecovery: config.enableErrorRecovery ?? true,
      maxRetries: config.maxRetries ?? 3
    };
  }

  async run(taskDescription: string): Promise<AgentResponse> {
    const taskId = `task-${Date.now()}-${crypto.randomUUID()}`;
    const startTime = Date.now();
    const toolsUsed: string[] = [];
    const errors: number[] = [];

    this.monitor.recordStart(taskId, 'skill', `Agent: ${taskDescription}`);
    this.monitor.info(taskId, `AgentRunner 开始处理任务: ${taskDescription}`);

    const context: TaskContext = {
      id: taskId,
      description: taskDescription,
      complexity: 1,
      currentSkill: 'unknown',
      history: [],
      results: {}
    };

    try {
      const matches = this.registry.matchSkills(taskDescription);

      if (matches.length === 0) {
        this.monitor.warn(taskId, '未找到匹配的技能，使用默认处理');
        return this.createFallbackResponse(taskId, taskDescription, startTime, []);
      }

      const bestMatch = matches[0];
      const skill = bestMatch.skill;
      context.currentSkill = skill.metadata.name;

      this.monitor.info(taskId, `选择技能: ${skill.metadata.name} (匹配度: ${bestMatch.score})`);

      let result: TaskResult;

      if (skill.workflows.length > 0) {
        result = await this.executeWithWorkflow(skill, context);
      } else {
        result = await this.orchestrator.executeTask(taskDescription);
      }

      if (!result.success && this.config.enableErrorRecovery) {
        result = await this.handleError(result, context);
      }

      for (const step of result.steps) {
        if (step.output?.tool) {
          toolsUsed.push(step.output.tool);
        }
        if (step.status === 'failed') {
          errors.push(result.steps.indexOf(step));
        }
      }

      this.monitor.recordEnd(taskId, result.success ? 'completed' : 'failed', result.error);

      return {
        success: result.success,
        taskId,
        skillUsed: skill.metadata.name,
        result: result.data || result.error,
        error: result.error,
        metrics: {
          duration: Date.now() - startTime,
          steps: result.steps.length,
          toolsUsed: [...new Set(toolsUsed)],
          errors: errors.length
        },
        logs: this.monitor.getLogs(undefined, 50)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.monitor.recordEnd(taskId, 'failed', errorMessage);
      this.monitor.error(taskId, 'Agent 执行失败', error as Error);

      return {
        success: false,
        taskId,
        skillUsed: context.currentSkill,
        error: errorMessage,
        metrics: {
          duration: Date.now() - startTime,
          steps: context.history.length,
          toolsUsed: [...new Set(toolsUsed)],
          errors: errors.length + 1
        },
        logs: this.monitor.getLogs('error', 20)
      };
    }
  }

  private async executeWithWorkflow(skill: SkillDefinition, context: TaskContext): Promise<TaskResult> {
    this.monitor.recordStart(`${context.id}-workflow`, 'workflow', skill.workflows[0]?.name || 'main');

    try {
      const result = await this.workflowEngine.execute(skill.workflows[0], context);
      this.monitor.recordEnd(`${context.id}-workflow`, result.success ? 'completed' : 'failed', result.error);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Workflow execution failed';
      this.monitor.recordEnd(`${context.id}-workflow`, 'failed', errorMessage);
      return {
        success: false,
        error: errorMessage,
        steps: context.history
      };
    }
  }

  private async handleError(result: TaskResult, context: TaskContext): Promise<TaskResult> {
    const error = new Error(result.error || 'Unknown error');
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      const recovery = await this.errorHandler.handle(error, context);
      const applied = await this.errorHandler.applyRecovery(recovery, context);

      if (!applied && recovery.action === 'request_input') {
        return {
          success: false,
          error: recovery.message,
          steps: context.history
        };
      }

      if (recovery.action === 'retry') {
        this.monitor.info(context.id, `重试 attempt ${attempt + 1}/${this.config.maxRetries}`);
        context.results['__retryCount__'] = attempt + 1;
        continue;
      }

      if (recovery.action === 'fail') {
        return {
          success: false,
          error: recovery.message,
          steps: context.history
        };
      }

      break;
    }

    return result;
  }

  private createFallbackResponse(taskId: string, taskDescription: string, startTime: number, toolsUsed: string[]): AgentResponse {
    return {
      success: false,
      taskId,
      skillUsed: 'none',
      error: `无法理解任务: "${taskDescription}"。请尝试更明确的描述。`,
      metrics: {
        duration: Date.now() - startTime,
        steps: 0,
        toolsUsed,
        errors: 0
      }
    };
  }

  async diagnose(taskDescription: string): Promise<{
    matchedSkills: Array<{ name: string; score: number }>;
    suggestedTools: Array<{ serverId: string; toolId: string; description: string }>;
    estimatedComplexity: number;
    recommendations: string[];
  }> {
    const matches = this.registry.matchSkills(taskDescription);
    const toolDiscovery = new ToolDiscoveryEngine(this.registry);
    const tools = toolDiscovery.getRecommendedTools(taskDescription, 5);
    const analysis = this.orchestrator.analyzeTask(taskDescription);

    const recommendations: string[] = [];

    if (matches.length === 0) {
      recommendations.push('未找到精确匹配，请尝试使用更具体的关键词');
    } else if (matches.length > 3) {
      recommendations.push('找到多个可能匹配的技能，系统将选择最佳匹配');
    }

    if (analysis.complexity > 7) {
      recommendations.push('任务复杂度较高，可能需要多个技能协作完成');
    }

    if (tools.length === 0) {
      recommendations.push('未找到直接可用的工具，可能需要手动操作');
    }

    return {
      matchedSkills: matches.slice(0, 5).map(m => ({
        name: m.skill.metadata.name,
        score: m.score
      })),
      suggestedTools: tools.map(t => ({
        serverId: t.serverId,
        toolId: t.toolId,
        description: t.description
      })),
      estimatedComplexity: analysis.complexity,
      recommendations
    };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<AgentConfig>): void {
    Object.assign(this.config, config);
  }

  getMonitor(): Monitor {
    return this.monitor;
  }
}