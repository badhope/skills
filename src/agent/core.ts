import { configManager } from '../config/manager.js';
import { toolRegistry, executeTool } from '../tools/registry.js';
import { memoryManager } from '../memory/manager.js';
import { reasonStep } from './reasoner.js';
import { detectIssues, generateTrustReport, shouldRequireConfirmation, askUserConfirmation, formatTrustOutput, TrustLevel } from './trust.js';
import { ContextManager } from './context-manager.js';
import chalk from 'chalk';
import { printSection, printSuccess, printError, printWarning, printInfo, createSpinner } from '../ui/logo.js';
import { printSteps } from '../ui/display.js';

/**
 * Agent 核心循环
 * 理解 → 规划 → 执行 → 验证 → 反思
 */

export interface TaskStep {
  id: number;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  result?: string;
  error?: string;
}

export interface Task {
  id: string;
  userInput: string;
  intent?: string;
  steps: TaskStep[];
  currentStep: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  result?: string;
  startedAt: number;
  completedAt?: number;
}

/**
 * 意图识别
 */
export function recognizeIntent(input: string): {
  intent: string;
  confidence: number;
  suggestedTools: string[];
} {
  const lower = input.toLowerCase();

  if (/(debug|bug|error|issue|fix|修复|调试|错误|问题)/.test(lower)) {
    return { intent: 'bug-hunter', confidence: 0.9, suggestedTools: ['search_files', 'read_file'] };
  }

  if (/(implement|build|create|develop|新建|构建|创建|实现|component|组件|写|生成|添加)/.test(lower) ||
      /(react|vue|angular|nextjs|nuxt|html|css|js|typescript|node|python|rust|go)/.test(lower) ||
      /(\.py|\.ts|\.js|\.tsx|\.jsx|\.html|\.css|\.json|\.yaml|\.yml|\.md)/.test(lower)) {
    return { intent: 'fullstack', confidence: 0.85, suggestedTools: ['write_file', 'read_file', 'shell'] };
  }

  if (/(test|testing|测试|单元|运行测试|unit test|jest|vitest)/.test(lower)) {
    return { intent: 'testing', confidence: 0.9, suggestedTools: ['shell', 'read_file', 'write_file'] };
  }

  // 代码审查
  if (/(code review|pr review|代码审查|review|评审|审查代码|审查)/.test(lower)) {
    return { intent: 'code-review', confidence: 0.9, suggestedTools: ['read_file', 'search_files'] };
  }

  // 数据库任务（优先于重构）
  if (/(database|db|sql|mysql|postgres|mongodb|redis|数据库|查询|query)/.test(lower)) {
    return { intent: 'database', confidence: 0.9, suggestedTools: ['shell', 'read_file'] };
  }

  // 重构/优化
  if (/(refactor|重构|optimize|优化|improve|改进)/.test(lower)) {
    return { intent: 'refactor', confidence: 0.85, suggestedTools: ['read_file', 'write_file', 'search_files'] };
  }

  // 安全审计
  if (/(security|vulnerability|安全|漏洞|审计|audit)/.test(lower)) {
    return { intent: 'security', confidence: 0.9, suggestedTools: ['read_file', 'search_files', 'shell'] };
  }

  // 文档任务
  if (/(document|doc|readme|文档|说明)/.test(lower)) {
    return { intent: 'documentation', confidence: 0.85, suggestedTools: ['read_file', 'write_file'] };
  }

  // 部署任务
  if (/(deploy|部署|docker|kubernetes|k8s|ci\/cd|ci-cd|cicd)/.test(lower)) {
    return { intent: 'devops', confidence: 0.9, suggestedTools: ['shell'] };
  }

  // 搜索文件
  if (/(search|find|grep|搜索|查找)/.test(lower)) {
    return { intent: 'search', confidence: 0.9, suggestedTools: ['search_files', 'read_file'] };
  }

  // 通用对话
  return { intent: 'chat', confidence: 0.5, suggestedTools: [] };
}

/**
 * 任务规划器 - 将用户输入分解为可执行步骤
 */
export async function planTask(userInput: string, intent: string): Promise<TaskStep[]> {
  const steps: TaskStep[] = [];
  const lower = userInput.toLowerCase();

  // === 理解任务 ===
  steps.push({
    id: steps.length + 1,
    description: `理解任务: "${userInput.slice(0, 50)}${userInput.length > 50 ? '...' : ''}"`,
    status: 'done',
    result: `识别为 ${intent} 类型任务`,
  });

  // === 分解任务 ===
  // 根据意图类型分解
  switch (intent) {
    case 'bug-hunter':
      // 调试类任务
      steps.push({ id: steps.length + 1, description: '定位问题位置', tool: 'search_files', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '分析错误原因', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '制定修复方案', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行修复', tool: 'write_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证修复效果', status: 'pending' });
      break;

    case 'fullstack':
    case 'documentation':
      // 开发/文档类任务
      steps.push({ id: steps.length + 1, description: '确认目标路径', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成内容', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '写入文件', tool: 'write_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证写入结果', tool: 'read_file', status: 'pending' });
      break;

    case 'code-review':
      // 审查类任务
      steps.push({ id: steps.length + 1, description: '读取代码内容', tool: 'read_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '代码质量分析', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成审查报告', status: 'pending' });
      break;

    case 'search':
      // 搜索类任务
      if (/在|文件|folder|目录|project/.test(lower)) {
        steps.push({ id: steps.length + 1, description: '定位目标文件/目录', tool: 'read_file', status: 'pending' });
      }
      steps.push({ id: steps.length + 1, description: '执行关键词搜索', tool: 'search_files', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '分析搜索结果', status: 'pending' });
      break;

    case 'devops':
      // 部署类任务
      steps.push({ id: steps.length + 1, description: '检查环境配置', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行部署命令', tool: 'shell', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证部署结果', status: 'pending' });
      break;

    case 'testing':
      // 测试类任务
      steps.push({ id: steps.length + 1, description: '分析测试需求', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行测试', tool: 'shell', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '分析测试结果', status: 'pending' });
      break;

    case 'refactor':
      // 重构类任务
      steps.push({ id: steps.length + 1, description: '读取代码内容', tool: 'read_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '识别代码坏味道', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '制定重构方案', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行重构', tool: 'write_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证重构结果', status: 'pending' });
      break;

    case 'security':
      // 安全审计类任务
      steps.push({ id: steps.length + 1, description: '读取代码内容', tool: 'read_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '扫描安全漏洞', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成安全报告', status: 'pending' });
      break;

    case 'database':
      // 数据库类任务
      steps.push({ id: steps.length + 1, description: '分析数据库需求', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行数据库命令', tool: 'shell', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证执行结果', status: 'pending' });
      break;

    default:
      // 通用对话任务
      steps.push({ id: steps.length + 1, description: '分析用户需求', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成回答', status: 'pending' });
      break;
  }

  // === 反思步骤 ===
  steps.push({ id: steps.length + 1, description: '反思执行过程，总结经验', status: 'pending' });

  return steps;
}

/**
 * 工具执行器
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

/**
 * Agent 执行器 - 运行完整的 Agent 循环
 */
export class AgentExecutor {
  private task: Task;
  private onStepChange?: (step: TaskStep) => void;
  private onOutput?: (text: string) => void;
  private contextManager: ContextManager;

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
  }

  async run(): Promise<Task> {
    try {
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
              step.args = this.parseToolArgsFromAI(step.tool, paramReasoning);
            }
            this.output(chalk.dim(`  → 执行工具: ${chalk.cyan(step.tool)} ${step.args ? JSON.stringify(step.args) : ''}...`));
            step.result = await executeStep(step, context);
            this.output(chalk.green(`  ✓ 完成: ${step.description}`));
            this.contextManager.addToolResult(step.tool, step.result, true);
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

      const summary = this.generateSummary();
      this.output(chalk.bold('\n📊 执行总结:'));
      this.output(summary);

      this.task.status = 'completed';
      this.task.completedAt = Date.now();

      // 保存到记忆
      await this.saveToMemory(summary);

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

  private parseToolArgsFromAI(toolName: string, aiResponse: string): Record<string, unknown> {
    const jsonBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : aiResponse;
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0]);
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(parsed)) {
          result[key] = value;
        }
        return result;
      } catch { /* fall through */ }
    }
    const tool = toolRegistry.get(toolName);
    if (tool) {
      const requiredParams = tool.parameters.filter(p => p.required);
      if (requiredParams.length === 1) {
        return { [requiredParams[0].name]: aiResponse.trim() };
      }
    }
    return {};
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

  private generateSummary(): string {
    const total = this.task.steps.length;
    const done = this.task.steps.filter(s => s.status === 'done').length;
    const failed = this.task.steps.filter(s => s.status === 'error').length;
    const skipped = this.task.steps.filter(s => s.status === 'skipped').length;
    const duration = ((this.task.completedAt || Date.now()) - this.task.startedAt) / 1000;

    return [
      `  • 任务类型: ${chalk.cyan(this.task.intent || 'chat')}`,
      `  • 执行步骤: ${done}/${total} 成功`,
      failed > 0 ? `  • 失败: ${chalk.red(failed)}` : '',
      skipped > 0 ? `  • 跳过: ${chalk.yellow(skipped)}` : '',
      `  • 耗时: ${duration.toFixed(1)}秒`,
    ].filter(Boolean).join('\n');
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
