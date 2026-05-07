import { globalMCPRegistry } from '../mcp/registry';
import { ToolMatch } from './toolDiscovery';
import { TaskContext } from './types';

export interface ToolExecutionResult {
  success: boolean;
  toolId: string;
  serverId: string;
  result?: any;
  error?: string;
  duration: number;
}

export interface ExecutionOptions {
  timeout?: number;
  retries?: number;
  fallback?: ToolMatch;
}

export class ToolExecutor {
  private timeout = 30000;
  private retries = 3;

  async execute(
    tool: ToolMatch,
    params: Record<string, any>,
    options: ExecutionOptions = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const timeout = options.timeout || this.timeout;
    const maxRetries = options.retries ?? this.retries;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(tool, params, timeout);
        
        return {
          success: true,
          toolId: tool.toolId,
          serverId: tool.serverId,
          result,
          duration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[ToolExecutor] Retry ${attempt + 1}/${maxRetries} after ${delay}ms for ${tool.serverId}/${tool.toolId}`);
          await this.sleep(delay);
        }
      }
    }

    if (options.fallback) {
      console.log(`[ToolExecutor] Falling back to ${options.fallback.serverId}/${options.fallback.toolId}`);
      return this.execute(options.fallback, params, { ...options, fallback: undefined });
    }

    return {
      success: false,
      toolId: tool.toolId,
      serverId: tool.serverId,
      error: lastError?.message || 'Unknown error',
      duration: Date.now() - startTime
    };
  }

  async executeAll(
    matches: ToolMatch[],
    context: TaskContext,
    options: ExecutionOptions = {}
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const tool of matches) {
      const params = this.buildParams(tool, context);
      const result = await this.execute(tool, params, options);
      results.push(result);

      if (!result.success && !options.fallback) {
        console.warn(`[ToolExecutor] Tool ${tool.serverId}/${tool.toolId} failed, continuing with next tool`);
      }
    }

    return results;
  }

  async executeParallel(
    matches: ToolMatch[],
    context: TaskContext,
    options: ExecutionOptions = {}
  ): Promise<ToolExecutionResult[]> {
    const promises = matches.map(tool => {
      const params = this.buildParams(tool, context);
      return this.execute(tool, params, options);
    });

    return Promise.all(promises);
  }

  private async executeWithTimeout(
    tool: ToolMatch,
    params: Record<string, any>,
    timeout: number
  ): Promise<any> {
    return Promise.race([
      globalMCPRegistry.callTool(tool.serverId, tool.toolId, params),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tool ${tool.toolId} timed out after ${timeout}ms`)), timeout);
      })
    ]);
  }

  private buildParams(tool: ToolMatch, context: TaskContext): Record<string, any> {
    const params: Record<string, any> = {};

    if (tool.parameters && typeof tool.parameters === 'object') {
      Object.assign(params, tool.parameters);
    }

    params.context = {
      taskId: context.id,
      description: context.description,
      complexity: context.complexity
    };

    if (context.results && Object.keys(context.results).length > 0) {
      params.previousResults = context.results;
    }

    return params;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setDefaultTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  setDefaultRetries(retries: number): void {
    this.retries = retries;
  }
}

export const globalToolExecutor = new ToolExecutor();