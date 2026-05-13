/**
 * Act 模式 - 执行模式
 *
 * 学习自 Cline 的 Act Mode：
 * - 按照Plan模式生成的计划逐步执行
 * - 拥有完整工具权限（写入文件、执行命令等）
 * - 每个步骤可配置自动/手动审批
 */

import chalk from 'chalk';
import type { TaskStep } from './types.js';
import type { PlanResult } from './plan-mode.js';
import { reasonStep } from './reasoner.js';
import { executeStep } from './step-executor.js';
import { recognizeIntent } from './intent-recognizer.js';
import { planTask } from './task-planner.js';
import { detectIssues, generateTrustReport, askUserConfirmation, TrustLevel } from './trust.js';
import type { ReasonerConfig } from './llm-caller.js';

/** Act 模式配置 */
export interface ActModeConfig {
  /** LLM 配置 */
  llm?: ReasonerConfig;
  /** 是否自动批准所有步骤（跳过确认） */
  autoApprove?: boolean;
  /** 跳过写入类工具（dry-run 模式） */
  dryRun?: boolean;
}

/** Act 步骤结果 */
export interface ActStepResult {
  step: TaskStep;
  success: boolean;
  error?: string;
  durationMs: number;
}

/** Act 执行结果 */
export interface ActResult {
  /** 执行的步骤 */
  stepResults: ActStepResult[];
  /** 总耗时 */
  durationMs: number;
  /** 是否全部成功 */
  allSuccess: boolean;
  /** 摘要 */
  summary: string;
}

/**
 * 执行 Act 模式
 * @param plan Plan 模式的结果（可选，不传则自动规划）
 * @param taskDescription 任务描述
 * @param config Act 模式配置
 * @param onOutput 输出回调
 */
export async function runActMode(
  plan: PlanResult | undefined,
  taskDescription: string,
  config?: ActModeConfig,
  onOutput?: (text: string) => void
): Promise<ActResult> {
  const output = onOutput || ((text: string) => console.log(text));
  const startTime = Date.now();
  const stepResults: ActStepResult[] = [];

  // 如果没有 plan，自动规划
  let steps: TaskStep[];
  let intent: string;

  if (plan) {
    steps = plan.steps;
    intent = plan.intent;
    output(chalk.cyan(`📋 按照已有计划执行 (${steps.length} 个步骤)`));
  } else {
    output(chalk.cyan('📋 自动规划任务...'));
    const { intent: recognizedIntent } = recognizeIntent(taskDescription);
    intent = recognizedIntent;
    steps = await planTask(taskDescription, intent);
    output(chalk.dim(`  规划完成: ${steps.length} 个步骤`));
  }

  output('');

  const context: Record<string, unknown> = {};
  const previousResults: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepStart = Date.now();

    // 跳过已完成的步骤
    if (step.status === 'done') {
      previousResults.push(step.result || '');
      continue;
    }

    output(chalk.bold(`  [${i + 1}/${steps.length}] ${step.description}`));

    // Dry-run 模式跳过写入
    if (config?.dryRun && step.tool && isWriteTool(step.tool)) {
      output(chalk.yellow('  ⏭ Dry-run: 跳过写入操作'));
      stepResults.push({
        step,
        success: true,
        durationMs: Date.now() - stepStart,
      });
      continue;
    }

    try {
      let result: string;

      if (step.tool) {
        // 工具步骤 → 生成参数并执行
        if (!step.args || Object.keys(step.args).length === 0) {
          output(chalk.dim('  🧠 AI 推理工具参数...'));
          const reasoning = await reasonStep({
            taskDescription,
            intent,
            stepDescription: `为工具 "${step.tool}" 确定执行参数: ${step.description}`,
            previousResults,
            availableTools: [step.tool],
          }, config?.llm);
          try {
            const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              step.args = JSON.parse(jsonMatch[0]);
            }
          } catch { /* 参数提取失败 */ }
        }

        // 信任检查（写入类工具）
        if (step.tool && isWriteTool(step.tool) && !config?.autoApprove) {
          const issues = detectIssues(JSON.stringify(step.args), {
            intent,
            toolUsed: step.tool,
          });
          if (issues.length > 0) {
            const report = generateTrustReport(issues);
            if (report.requiresConfirmation) {
              output(chalk.yellow(`  ⚠ 信任检查: ${issues.length} 个问题`));
              const confirmed = await askUserConfirmation(report);
              if (!confirmed) {
                output(chalk.yellow('  ⏭ 用户拒绝，跳过'));
                stepResults.push({ step, success: false, error: '用户拒绝', durationMs: Date.now() - stepStart });
                continue;
              }
            }
          }
        }

        output(chalk.dim(`  → ${step.tool} ${step.args ? JSON.stringify(step.args).slice(0, 80) : ''}...`));
        result = await executeStep(step, context);
        previousResults.push(result);
        output(chalk.green('  ✓ 完成'));
      } else {
        // 空操作步骤 → AI 推理
        output(chalk.dim('  🧠 AI 推理...'));
        result = await reasonStep({
          taskDescription,
          intent,
          stepDescription: step.description,
          previousResults,
          availableTools: [],
        }, config?.llm);
        previousResults.push(result);
        output(chalk.green('  ✓ 推理完成'));
      }

      step.result = result;
      step.status = 'done';
      stepResults.push({ step, success: true, durationMs: Date.now() - stepStart });
    } catch (error) {
      step.status = 'error';
      step.error = error instanceof Error ? error.message : String(error);
      stepResults.push({
        step,
        success: false,
        error: step.error,
        durationMs: Date.now() - stepStart,
      });
      output(chalk.red(`  ✗ 失败: ${step.error}`));

      // 询问是否继续
      if (!config?.autoApprove) {
        try {
          const inquirer = await import('inquirer');
          const { cont } = await inquirer.default.prompt([{
            type: 'confirm',
            name: 'cont',
            message: '步骤失败，是否继续？',
            default: false,
          }]);
          if (!cont) break;
        } catch { break; }
      }
    }
  }

  const allSuccess = stepResults.every(r => r.success);
  const successCount = stepResults.filter(r => r.success).length;

  return {
    stepResults,
    durationMs: Date.now() - startTime,
    allSuccess,
    summary: `完成 ${successCount}/${stepResults.length} 个步骤，耗时 ${(Date.now() - startTime) / 1000}s`,
  };
}

/** 判断是否为写入类工具 */
function isWriteTool(tool: string): boolean {
  return ['write_file', 'delete_file', 'shell'].includes(tool);
}
