/**
 * DevFlow Agent SDK - Agent Module
 *
 * Provides programmatic access to the DevFlow Agent for running
 * AI-powered development tasks.
 */

import type { AgentOptions, AgentResult, AgentStep } from './types.js';

/**
 * DevFlowAgent - Main agent class for executing development tasks.
 *
 * @example
 * ```typescript
 * const agent = new DevFlowAgent({ model: 'claude-3-5-sonnet' });
 * agent.on('step', (step) => console.log(step));
 * const result = await agent.run('Add error handling to the auth module');
 * ```
 */
export class DevFlowAgent {
  private options: AgentOptions;
  private stepHandlers: Map<string, Set<Function>> = new Map();

  /**
   * Create a new DevFlowAgent instance.
   *
   * @param options - Configuration options for the agent
   */
  constructor(options?: AgentOptions) {
    this.options = {
      model: 'claude-3-5-sonnet',
      temperature: 0.3,
      maxTokens: 2048,
      planFirst: true,
      autoCheckpoint: true,
      ...options,
    };
  }

  /**
   * Run the agent on a task.
   *
   * This executes the full agent loop: understanding, planning,
   * executing, verifying, and reflecting.
   *
   * @param input - The task description or user input
   * @returns The execution result
   */
  async run(input: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    const changedFiles: string[] = [];

    // Dynamic import of core module
    const { AgentExecutor } = await import('../../dist/agent/core.js');

    const onStepChange = (step: any): void => {
      steps[step.id] = step;
      this.options.onStep?.(step);
      this.emit('step', step);
    };

    const onOutput = (text: string): void => {
      this.options.onOutput?.(text);
      this.emit('output', text);
    };

    try {
      const executor = new AgentExecutor(input, onStepChange, onOutput);
      const task = await executor.run();

      const duration = Date.now() - startTime;

      return {
        success: task.status === 'completed',
        output: task.result || '',
        steps: task.steps,
        changedFiles: this.extractChangedFiles(task.steps),
        duration,
        taskId: task.id,
        intent: task.intent,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        steps,
        changedFiles,
        duration,
      };
    }
  }

  /**
   * Plan a task without executing it.
   *
   * @param input - The task description
   * @returns The generated plan
   */
  async plan(input: string): Promise<any> {
    const { recognizeIntent } = await import('../../dist/agent/intent-recognizer.js');
    const { planTask } = await import('../../dist/agent/task-planner.js');

    const { intent } = recognizeIntent(input);
    const steps = await planTask(input, intent);

    return { intent, steps };
  }

  /**
   * Execute a pre-generated plan.
   *
   * @param plan - The plan to execute
   * @returns The execution result
   */
  async execute(plan: any): Promise<AgentResult> {
    // For now, delegate to run() with the plan description
    // In a full implementation, this would execute the plan steps directly
    return this.run(plan.description || 'Execute plan');
  }

  /**
   * Set the LLM model to use.
   *
   * @param model - Model identifier (e.g., 'claude-3-5-sonnet')
   */
  setModel(model: string): void {
    this.options.model = model;
  }

  /**
   * Set the generation temperature.
   *
   * @param temp - Temperature value (0-1)
   */
  setTemperature(temp: number): void {
    this.options.temperature = temp;
  }

  /**
   * Register an event handler.
   *
   * @param event - Event name ('step', 'output', 'error')
   * @param handler - Handler function
   */
  on(event: 'step' | 'output' | 'error', handler: Function): void {
    if (!this.stepHandlers.has(event)) {
      this.stepHandlers.set(event, new Set());
    }
    this.stepHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event handler.
   *
   * @param event - Event name
   * @param handler - Handler to remove
   */
  off(event: string, handler: Function): void {
    this.stepHandlers.get(event)?.delete(handler);
  }

  /**
   * Get current options.
   */
  getOptions(): Readonly<AgentOptions> {
    return { ...this.options };
  }

  private emit(event: string, data: any): void {
    this.stepHandlers.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in ${event} handler:`, e);
      }
    });
  }

  private extractChangedFiles(steps: any[]): string[] {
    const files: string[] = [];
    for (const step of steps) {
      if (step.tool === 'write_file' && step.args?.path) {
        files.push(String(step.args.path));
      }
    }
    return files;
  }
}

/**
 * Convenience function to run an agent task.
 *
 * @param input - The task description
 * @param options - Optional agent configuration
 * @returns The execution result
 *
 * @example
 * ```typescript
 * const result = await runAgent('Refactor the database module');
 * console.log(result.output);
 * ```
 */
export async function runAgent(input: string, options?: AgentOptions): Promise<AgentResult> {
  const agent = new DevFlowAgent(options);
  return agent.run(input);
}
