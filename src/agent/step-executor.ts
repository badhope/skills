import type { TaskStep } from './types.js';
import { executeTool } from '../tools/registry.js';

/**
 * 步骤执行器
 * 执行单个任务步骤，调用相应工具并返回结果。
 */

/**
 * 执行单个任务步骤
 * @param step    任务步骤
 * @param context 执行上下文
 * @returns 执行结果字符串
 */
export async function executeStep(step: TaskStep, context: Record<string, unknown>): Promise<string> {
  if (!step.tool) {
    return `（手动步骤）${step.description}`;
  }
  try {
    const args: Record<string, string> = {};
    if (step.args) {
      for (const [key, value] of Object.entries(step.args)) {
        args[key] = String(value ?? '');
      }
    }
    const result = await executeTool(step.tool, args);
    if (typeof result === 'string') return result;
    // 处理 ToolResult 对象
    if (result && typeof result === 'object' && 'output' in result) {
      const toolResult = result as { success?: boolean; output?: string; error?: string };
      if (toolResult.success === false) {
        throw new Error(toolResult.error || `工具 ${step.tool} 执行失败`);
      }
      return toolResult.output || JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result, null, 2);
  } catch (error) {
    throw new Error(`工具 ${step.tool} 执行失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
