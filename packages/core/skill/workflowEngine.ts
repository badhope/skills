import { SkillDefinition, TaskContext, TaskStep, TaskResult, Workflow, WorkflowPhase, WorkflowStep } from './types';
import { SkillRegistry } from './registry';
import { globalToolExecutor, ToolExecutor } from './toolExecutor';
import { globalToolDiscovery } from './toolDiscovery';

export interface WorkflowExecutionConfig {
  parallelTasks: boolean;
  stopOnError: boolean;
  logProgress: boolean;
}

export class WorkflowEngine {
  private registry: SkillRegistry;
  private executor: ToolExecutor;
  private config: WorkflowExecutionConfig;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
    this.executor = globalToolExecutor;
    this.config = {
      parallelTasks: true,
      stopOnError: true,
      logProgress: true
    };
  }

  async execute(workflow: Workflow, context: TaskContext): Promise<TaskResult> {
    const steps: TaskStep[] = [];
    const startTime = Date.now();

    this.log(`[WorkflowEngine] 开始执行工作流: ${workflow.name}`);

    try {
      for (let phaseIndex = 0; phaseIndex < workflow.phases.length; phaseIndex++) {
        const phase = workflow.phases[phaseIndex];
        this.log(`[WorkflowEngine] 执行阶段 ${phaseIndex + 1}/${workflow.phases.length}: ${phase.name}`);

        const phaseResult = await this.executePhase(phase, context);
        steps.push(...phaseResult.steps);

        if (!phaseResult.success && this.config.stopOnError) {
          return {
            success: false,
            error: `Phase "${phase.name}" failed: ${phaseResult.error}`,
            steps
          };
        }
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

  private async executePhase(phase: WorkflowPhase, context: TaskContext): Promise<{
    success: boolean;
    error?: string;
    steps: TaskStep[];
  }> {
    const steps: TaskStep[] = [];
    const completedTaskIds = new Set<string>();

    const independentTasks = phase.tasks.filter(t => t.dependencies.length === 0);
    const dependentTasks = phase.tasks.filter(t => t.dependencies.length > 0);

    if (this.config.parallelTasks && independentTasks.length > 0) {
      this.log(`[WorkflowEngine] 并行执行 ${independentTasks.length} 个独立任务`);

      const parallelResults = await Promise.all(
        independentTasks.map(task => this.executeTask(task, context))
      );

      for (let i = 0; i < independentTasks.length; i++) {
        const task = independentTasks[i];
        const result = parallelResults[i];
        
        steps.push(result);
        completedTaskIds.add(task.id);
        context.results[task.id] = result.output;

        if (result.status === 'failed' && this.config.stopOnError) {
          return {
            success: false,
            error: `Task "${task.description}" failed: ${result.output?.error}`,
            steps
          };
        }
      }
    } else {
      for (const task of independentTasks) {
        const result = await this.executeTask(task, context);
        steps.push(result);
        completedTaskIds.add(task.id);
        context.results[task.id] = result.output;

        if (result.status === 'failed' && this.config.stopOnError) {
          return {
            success: false,
            error: `Task "${task.description}" failed`,
            steps
          };
        }
      }
    }

    for (const task of dependentTasks) {
      const dependenciesMet = task.dependencies.every(dep => completedTaskIds.has(dep));

      if (!dependenciesMet) {
        const missing = task.dependencies.filter(dep => !completedTaskIds.has(dep));
        return {
          success: false,
          error: `Task "${task.id}" 依赖未完成: ${missing.join(', ')}`,
          steps
        };
      }

      const result = await this.executeTask(task, context);
      steps.push(result);
      completedTaskIds.add(task.id);
      context.results[task.id] = result.output;

      if (result.status === 'failed' && this.config.stopOnError) {
        return {
          success: false,
          error: `Task "${task.description}" failed`,
          steps
        };
      }
    }

    return { success: true, steps };
  }

  private async executeTask(task: WorkflowStep, context: TaskContext): Promise<TaskStep> {
    const timestamp = new Date();

    this.log(`[WorkflowEngine] 执行任务 [${task.type || 'action'}]: ${task.description}`);

    try {
      switch (task.type) {
        case 'loop':
          return await this.executeLoop(task, context, timestamp);
        case 'conditional':
          return await this.executeConditional(task, context, timestamp);
        case 'invoke':
          return await this.executeSubSkill(task, context, timestamp);
        case 'workflow':
          return await this.executeSubWorkflow(task, context, timestamp);
        case 'tool':
          return await this.executeToolTask(task, context, timestamp);
        case 'wait':
          return await this.executeWait(task, context, timestamp);
        case 'end':
          return this.executeEnd(task, context, timestamp);
        case 'action':
        default:
          if (task.skill && task.skill !== context.currentSkill) {
            return await this.executeSubSkill(task, context, timestamp);
          }
          return await this.executeDirectTask(task, context, timestamp);
      }
    } catch (error) {
      return {
        skillName: context.currentSkill,
        input: task.description,
        output: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp,
        status: 'failed'
      };
    }
  }

  private async executeSubSkill(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): Promise<TaskStep> {
    const subSkill = this.registry.getSkill(task.skill);

    if (!subSkill) {
      return {
        skillName: context.currentSkill,
        input: task.description,
        output: { error: `Skill "${task.skill}" not found` },
        timestamp,
        status: 'failed'
      };
    }

    const subContext: TaskContext = {
      id: `${context.id}-sub-${task.id}`,
      description: task.description,
      complexity: Math.max(1, context.complexity - 1),
      currentSkill: task.skill,
      history: [...context.history],
      results: { ...context.results }
    };

    this.log(`[WorkflowEngine] 调用子技能: ${task.skill}`);

    if (subSkill.workflows.length > 0) {
      const subEngine = new WorkflowEngine(this.registry);
      const result = await subEngine.execute(subSkill.workflows[0], subContext);

      return {
        skillName: task.skill,
        input: task.description,
        output: result.data || result.error,
        timestamp,
        status: result.success ? 'success' : 'failed'
      };
    }

    return {
      skillName: task.skill,
      input: task.description,
      output: { executed: true, skill: task.skill },
      timestamp,
      status: 'success'
    };
  }

  private async executeDirectTask(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): Promise<TaskStep> {
    const tools = globalToolDiscovery.suggestTools(context.currentSkill, task.description);

    if (tools.length === 0) {
      this.log(`[WorkflowEngine] 未找到匹配工具，执行模拟: ${task.description}`);

      return {
        skillName: context.currentSkill,
        input: task.description,
        output: {
          executed: true,
          task: task.description,
          mode: 'simulation',
          message: 'No tools available, task simulated'
        },
        timestamp,
        status: 'success'
      };
    }

    const bestTool = tools[0];
    const params = this.buildTaskParams(task, context);

    this.log(`[WorkflowEngine] 调用工具: ${bestTool.serverId}/${bestTool.toolId}`);

    const result = await this.executor.execute(bestTool, params);

    return {
      skillName: context.currentSkill,
      input: task.description,
      output: result.result || result.error,
      timestamp,
      status: result.success ? 'success' : 'failed'
    };
  }

  private buildTaskParams(task: WorkflowStep, context: TaskContext): Record<string, any> {
    const params: Record<string, any> = {
      task: task.description,
      taskId: task.id,
      priority: task.priority
    };

    if (task.dependencies.length > 0) {
      params.dependencies = task.dependencies.map(depId => context.results[depId]).filter(Boolean);
    }

    return params;
  }

  private log(message: string): void {
    if (this.config.logProgress) {
      console.log(message);
    }
  }

  private async executeLoop(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): Promise<TaskStep> {
    const loopCount = task.loopCount || 1;
    const results: any[] = [];

    this.log(`[WorkflowEngine] 执行循环 ${loopCount} 次`);

    for (let i = 0; i < loopCount; i++) {
      const loopContext = {
        ...context,
        results: { ...context.results, loopIndex: i, totalLoops: loopCount }
      };

      const result = await this.executeDirectTask(task, loopContext, new Date());
      results.push(result.output);

      if (result.status === 'failed' && this.config.stopOnError) {
        return {
          skillName: context.currentSkill,
          input: task.description,
          output: { error: 'Loop failed', results, failedAt: i },
          timestamp,
          status: 'failed'
        };
      }
    }

    return {
      skillName: context.currentSkill,
      input: task.description,
      output: { success: true, loopCount, results },
      timestamp,
      status: 'success'
    };
  }

  private async executeConditional(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): Promise<TaskStep> {
    const condition = task.condition || 'true';
    let conditionMet = false;

    try {
      conditionMet = this.evaluateCondition(condition, context);
    } catch {
      conditionMet = false;
    }

    this.log(`[WorkflowEngine] 条件判断: "${condition}" = ${conditionMet}`);

    if (conditionMet) {
      return await this.executeDirectTask(task, context, timestamp);
    }

    return {
      skillName: context.currentSkill,
      input: task.description,
      output: { skipped: true, condition: condition, evaluated: conditionMet },
      timestamp,
      status: 'success'
    };
  }

  private evaluateCondition(condition: string, context: TaskContext): boolean {
    const trimmed = condition.toLowerCase().trim();

    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    if (context.results && Object.keys(context.results).length > 0) {
      const hasKey = Object.keys(context.results).some(k => trimmed.includes(k.toLowerCase()));
      if (hasKey) {
        const key = Object.keys(context.results).find(k => trimmed.includes(k.toLowerCase()))!;
        const value = context.results[key];
        if (value === undefined || value === null) return false;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.length > 0;
        if (typeof value === 'number') return value > 0;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return value !== null && Object.keys(value).length > 0;
      }
    }

    if (trimmed.startsWith('!')) {
      return !this.evaluateCondition(trimmed.slice(1), context);
    }

    return true;
  }

  private async executeSubWorkflow(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): Promise<TaskStep> {
    const skillName = context.currentSkill;
    const skill = this.registry.getSkill(skillName);

    if (!skill) {
      return {
        skillName: context.currentSkill,
        input: task.description,
        output: { error: `Skill "${skillName}" not found` },
        timestamp,
        status: 'failed'
      };
    }

    const workflowId = task.workflow || '0';
    const workflow = skill.workflows.find(w => w.id === workflowId) || skill.workflows[0];

    if (!workflow) {
      return {
        skillName: context.currentSkill,
        input: task.description,
        output: { error: `Workflow "${workflowId}" not found` },
        timestamp,
        status: 'failed'
      };
    }

    const result = await this.execute(workflow, context);
    return {
      skillName: context.currentSkill,
      input: task.description,
      output: result.data || result.error,
      timestamp,
      status: result.success ? 'success' : 'failed'
    };
  }

  private async executeToolTask(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): Promise<TaskStep> {
    const tools = globalToolDiscovery.suggestTools(context.currentSkill, task.description);
    
    let toolToExecute = tools.find(t => t.toolId === task.tool);
    
    if (!toolToExecute && tools.length > 0) {
      toolToExecute = tools[0];
      this.log(`[WorkflowEngine] 未指定工具，使用推荐工具: ${toolToExecute.toolId}`);
    }
    
    if (toolToExecute) {
      const result = await this.executor.execute(toolToExecute, task.params || {});
      
      if (result.success) {
        return {
          skillName: context.currentSkill,
          input: task.description,
          output: result.result,
          timestamp,
          status: 'success'
        };
      } else {
        this.log(`[WorkflowEngine] 工具执行失败: ${toolToExecute.toolId} - ${result.error}`);
        
        const fallback = tools.find(t => t.toolId !== toolToExecute!.toolId);
        if (fallback) {
          this.log(`[WorkflowEngine] 尝试备用工具: ${fallback.toolId}`);
          const fallbackResult = await this.executor.execute(fallback, task.params || {});
          return {
            skillName: context.currentSkill,
            input: task.description,
            output: fallbackResult.result || fallbackResult.error,
            timestamp,
            status: fallbackResult.success ? 'success' : 'failed'
          };
        }
        
        return {
          skillName: context.currentSkill,
          input: task.description,
          output: result.error,
          timestamp,
          status: 'failed'
        };
      }
    }

    this.log(`[WorkflowEngine] 未找到可用工具，执行直接任务`);
    return await this.executeDirectTask(task, context, timestamp);
  }

  private async executeWait(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): Promise<TaskStep> {
    const waitTime = task.waitDuration || 1000;
    this.log(`[WorkflowEngine] 等待 ${waitTime}ms`);
    await this.sleep(waitTime);

    return {
      skillName: context.currentSkill,
      input: task.description,
      output: { waited: waitTime },
      timestamp,
      status: 'success'
    };
  }

  private executeEnd(
    task: WorkflowStep,
    context: TaskContext,
    timestamp: Date
  ): TaskStep {
    this.log(`[WorkflowEngine] 任务结束`);
    return {
      skillName: context.currentSkill,
      input: task.description,
      output: { finished: true, taskId: context.id, results: context.results },
      timestamp,
      status: 'success'
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setConfig(config: Partial<WorkflowExecutionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}