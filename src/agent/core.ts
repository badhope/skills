import { toolRegistry } from '../tools/registry.js';
import { memoryManager } from '../memory/manager.js';
import { reasonStep } from './reasoner.js';
import { detectIssues, generateTrustReport, askUserConfirmation, TrustLevel } from './trust.js';
import { ContextManager } from './context-manager.js';
import { DirtyProtect, AutoCommitEngine, CheckpointManager } from '../git/index.js';
import chalk from 'chalk';
import type { TaskStep, Task } from './types.js';

// Re-export 类型
export type { TaskStep, Task } from './types.js';

// Re-export 提取的函数（向后兼容）
export { recognizeIntent } from './intent-recognizer.js';
export { planTask } from './task-planner.js';
export { executeStep } from './step-executor.js';

// 导入提取的函数供内部使用
import { recognizeIntent } from './intent-recognizer.js';
import { planTask } from './task-planner.js';
import { executeStep } from './step-executor.js';
import { parseToolArgsFromAI, generateSummary } from './agent-utils.js';

/**
 * Agent 执行器 - 运行完整的 Agent 循环
 */
export class AgentExecutor {
  private task: Task;
  private onStepChange?: (step: TaskStep) => void;
  private onOutput?: (text: string) => void;
  private contextManager: ContextManager;
  private dirtyProtect: DirtyProtect;
  private autoCommit: AutoCommitEngine;
  private changedFiles: string[] = [];

  constructor(
    userInput: string,
    onStepChange?: (step: TaskStep) => void,
    onOutput?: (text: string) => void
  ) {
    this.task = {
      id: crypto.randomUUID(),
      userInput,
      steps: [],
      currentStep: 0,
      status: 'planning',
      startedAt: Date.now(),
    };
    this.onStepChange = onStepChange;
    this.onOutput = onOutput;
    this.contextManager = new ContextManager(8000);
    this.dirtyProtect = new DirtyProtect(process.cwd());
    this.autoCommit = new AutoCommitEngine(process.cwd());
  }

  async run(): Promise<Task> {
    try {
      // === 阶段 0: Git 检查点 ===
      try {
        const checkpoint = new CheckpointManager(process.cwd());
        await checkpoint.create(`执行前自动检查点: ${this.task.userInput.substring(0, 50)}`);
      } catch {
        // 非 Git 仓库时静默跳过
      }

      // === 阶段 1: 理解 ===
      this.output(chalk.dim('[1/5] 理解任务...'));
      const { intent } = recognizeIntent(this.task.userInput);
      this.task.intent = intent;

      // === 阶段 2: 规划 ===
      this.output(chalk.dim('[2/5] 规划步骤...'));
      this.task.steps = await planTask(this.task.userInput, intent);
      this.task.status = 'executing';

      // 展示计划
      this.output(chalk.bold('\n📋 任务计划:'));
      this.task.steps.forEach((step, i) => {
        this.output(`  ${i + 1}. ${step.description}${step.tool ? ` (${chalk.cyan(step.tool)})` : ''}`);
      });
      this.output('');

      // === 阶段 3: 执行 ===
      this.output(chalk.dim('[3/5] 执行任务...'));
      const context: Record<string, unknown> = {};

      for (let i = 0; i < this.task.steps.length; i++) {
        const step = this.task.steps[i];
        this.task.currentStep = i;
        step.status = 'running';
        this.onStepChange?.(step);

        try {
          if (step.tool) {
            if (!step.args || Object.keys(step.args).length === 0) {
              this.output(chalk.dim(`  🧠 AI 推理工具参数: ${chalk.cyan(step.tool)}...`));
              const previousContext = this.contextManager.getContext();
              const paramReasoning = await reasonStep({
                taskDescription: this.task.userInput,
                intent: this.task.intent || 'chat',
                stepDescription: `为工具 "${step.tool}" 确定执行参数。步骤描述: ${step.description}。请以 JSON 格式输出参数，例如: {"command": "ls -la"} 或 {"path": "/src/index.ts", "content": "..."}`,
                previousResults: previousContext.map(m => m.content),
                availableTools: [step.tool],
              });
              step.args = parseToolArgsFromAI(step.tool, paramReasoning);
            }
            this.output(chalk.dim(`  → 执行工具: ${chalk.cyan(step.tool)} ${step.args ? JSON.stringify(step.args) : ''}...`));
            step.result = await executeStep(step, context);
            this.output(chalk.green(`  ✓ 完成: ${step.description}`));
            this.contextManager.addToolResult(step.tool, step.result, true);

            // 追踪文件变更（用于自动提交）
            if (step.tool === 'write_file' && step.args?.path) {
              this.changedFiles.push(String(step.args.path));
            }
          } else if (step.description.includes('反思')) {
            // 反思步骤 → 跳过（后面统一处理）
            step.result = '(反思步骤将在最后统一处理)';
            step.status = 'done';
            this.onStepChange?.(step);
            continue;
          } else {
            // 空操作步骤 → 调用 AI 推理
            this.output(chalk.dim(`  🧠 AI 推理: ${step.description}...`));
            const previousContext = this.contextManager.getContext();
            const reasoning = await reasonStep({
              taskDescription: this.task.userInput,
              intent: this.task.intent || 'chat',
              stepDescription: step.description,
              previousResults: previousContext.map(m => m.content),
              availableTools: [...toolRegistry.keys()],
            });
            step.result = reasoning;
            this.output(chalk.green(`  ✓ 推理完成: ${step.description}`));
          }

          // === 信任检查 ===
          if (step.result && step.result.length > 10) {
            const issues = detectIssues(step.result, {
              intent: this.task.intent,
              toolUsed: step.tool,
            });
            if (issues.length > 0) {
              const report = generateTrustReport(issues);
              if (report.requiresConfirmation) {
                this.output(chalk.yellow(`  ⚠ 信任检查: 发现 ${issues.length} 个问题`));
                this.output(chalk.gray(`    ${report.summary}`));
                const confirmed = await askUserConfirmation(report);
                if (!confirmed) {
                  this.output(chalk.yellow(`  ⏭ 用户拒绝，跳过: ${step.description}`));
                  step.status = 'skipped';
                  this.onStepChange?.(step);
                  continue;
                }
                this.output(chalk.green(`  ✓ 用户确认通过`));
              } else {
                // 低风险问题，仅标注
                const lowIssues = issues.filter(issue => issue.level === TrustLevel.LOW);
                if (lowIssues.length > 0) {
                  this.output(chalk.dim(`  ℹ 信任提示: ${lowIssues.map(issue => issue.description).join(', ')}`));
                }
              }
            }
          }

          step.status = 'done';
        } catch (error) {
          step.status = 'error';
          step.error = error instanceof Error ? error.message : String(error);
          this.output(chalk.red(`  ✗ 失败: ${step.error}`));
          // 将错误结果添加到上下文管理器
          if (step.tool) {
            this.contextManager.addToolResult(step.tool, step.error || '执行失败', false);
          }

          // 如果是关键步骤失败，询问是否继续
          const shouldContinue = await this.askContinue();
          if (!shouldContinue) {
            this.task.status = 'failed';
            return this.task;
          }
          step.status = 'skipped';
        }

        this.onStepChange?.(step);
      }

      // === 阶段 4: 验证 ===
      this.output(chalk.dim('[4/5] 验证结果...'));
      this.task.result = this.task.steps
        .filter(s => s.status === 'done' && s.result)
        .map(s => s.result!)
        .join('\n\n');

      // === 阶段 5: 反思 ===
      this.output(chalk.dim('[5/5] 反思总结...'));

      // 找到反思步骤并调用 AI
      const reflectStep = this.task.steps.find(s => s.description.includes('反思'));
      if (reflectStep) {
        reflectStep.status = 'running';
        this.output(chalk.dim(`  🧠 AI 反思中...`));
        const reflectionContext = this.contextManager.getContext();
        const reflection = await reasonStep({
          taskDescription: this.task.userInput,
          intent: this.task.intent || 'chat',
          stepDescription: '反思执行过程，总结经验教训，评估完成度，提出改进建议',
          previousResults: reflectionContext.map(m => m.content),
          availableTools: [],
        });
        reflectStep.result = reflection;
        reflectStep.status = 'done';
        this.output(chalk.green('  ✓ 反思完成'));
      }

      const summary = generateSummary(this.task);
      this.output(chalk.bold('\n📊 执行总结:'));
      this.output(summary);

      this.task.status = 'completed';
      this.task.completedAt = Date.now();

      // 保存到记忆
      await this.saveToMemory(summary);

      // === Git 自动提交 ===
      if (this.changedFiles.length > 0) {
        try {
          const result = await this.autoCommit.autoCommit(
            this.changedFiles,
            this.task.userInput
          );
          if (result.success) {
            this.output(chalk.dim(`  📝 ${result.message}`));
          }
        } catch {
          // Git 操作失败不影响任务结果
        }
      }

      return this.task;
    } catch (error) {
      this.task.status = 'failed';
      this.task.result = error instanceof Error ? error.message : String(error);
      return this.task;
    }
  }

  private output(text: string): void {
    console.log(text);
    this.onOutput?.(text);
  }

  private async askContinue(): Promise<boolean> {
    if (!process.stdin.isTTY) return true;
    try {
      const inquirer = await import('inquirer');
      const { continue: result } = await inquirer.default.prompt([{
        type: 'confirm',
        name: 'continue',
        message: '步骤失败，是否继续执行后续步骤？',
        default: false,
      }]);
      return result;
    } catch {
      this.output(chalk.yellow('  无法加载交互模块，默认中止任务'));
      return false;
    }
  }

  private async saveToMemory(summary: string): Promise<void> {
    try {
      await memoryManager.rememberChat({
        input: this.task.userInput,
        output: summary,
        provider: 'agent',
        model: 'core-loop',
        taskId: this.task.id,
        tags: ['agent', this.task.intent || 'chat'],
      });
    } catch (error) {
      console.warn(chalk.dim(`[记忆] 保存失败: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  getTask(): Task {
    return this.task;
  }
}

/**
 * 快捷函数 - 执行一个用户任务
 */
export async function runAgentTask(
  userInput: string,
  onStepChange?: (step: TaskStep) => void,
  onOutput?: (text: string) => void
): Promise<Task> {
  const executor = new AgentExecutor(userInput, onStepChange, onOutput);
  return executor.run();
}
