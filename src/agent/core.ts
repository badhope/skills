import { toolRegistry } from '../tools/registry.js';
import { memoryManager } from '../memory/manager.js';
import { KnowledgeGraph } from '../memory/knowledgeGraph.js';
import { reasonStep, reasonWithSelfCorrection } from './reasoner.js';
import { DecisionReflector } from './decision-reflector.js';
import { detectIssues, generateTrustReport, askUserConfirmation, TrustLevel } from './trust.js';
import { ContextManager } from './context-manager.js';
import { ContextBuilder, contextBuilder, type KnowledgeEntry } from './context-builder.js';
import { ChangeControlManager } from './change-control.js';
import { DirtyProtect, AutoCommitEngine, CheckpointManager } from '../git/index.js';
import { agentLogger } from '../services/logger.js';
import { ExperienceStore, type Experience } from './experience-store.js';
import { PersonalityManager } from './personality.js';
import { EmotionalStateManager } from './emotional-state.js';
import chalk from 'chalk';
import type { TaskStep, Task } from './types.js';
import type { CodeIndex } from '../analysis/indexer/types.js';

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
  private contextBuilder: ContextBuilder;
  private dirtyProtect: DirtyProtect;
  private autoCommit: AutoCommitEngine;
  private changeControl: ChangeControlManager;
  private knowledgeGraph: KnowledgeGraph;
  private repoMap?: string;
  private codeIndex?: CodeIndex;
  private changedFiles: string[] = [];
  private rootDir: string;
  private builtContext: string = '';
  private decisionReflector: DecisionReflector;
  private currentDecisionId?: string;
  private experienceStore: ExperienceStore;
  private personalityManager: PersonalityManager;
  private emotionalState: EmotionalStateManager;
  private behaviorGuidelines: string = '';

  constructor(
    userInput: string,
    onStepChange?: (step: TaskStep) => void,
    onOutput?: (text: string) => void,
    options?: {
      rootDir?: string;
      enableRepoMap?: boolean;
      enableKnowledgeGraph?: boolean;
      enableChangeControl?: boolean;
    }
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
    this.contextBuilder = new ContextBuilder();
    this.dirtyProtect = new DirtyProtect(process.cwd());
    this.autoCommit = new AutoCommitEngine(process.cwd());
    this.changeControl = new ChangeControlManager();
    this.knowledgeGraph = new KnowledgeGraph();
    this.decisionReflector = new DecisionReflector();
    this.experienceStore = new ExperienceStore();
    this.personalityManager = new PersonalityManager();
    this.emotionalState = new EmotionalStateManager();
    this.rootDir = options?.rootDir || process.cwd();

    // ChangeControl 默认启用
    if (options?.enableChangeControl === false) {
      this.changeControl.setEnabled(false);
    }
  }

  async run(): Promise<Task> {
    agentLogger.info({ taskId: this.task.id, input: this.task.userInput }, 'Starting agent task');

    // 加载人格配置
    try {
      await this.personalityManager.load();
      this.personalityManager.incrementInteractions();
    } catch {
      // 人格加载失败不影响主流程
    }

    // 情绪衰减（每次任务开始时衰减上次的情绪）
    this.emotionalState.decay();

    // 加载持久化的决策历史
    await this.decisionReflector.load();

    // 加载历史经验，生成行为指导（学习循环入口）
    try {
      await this.experienceStore.load();
      this.behaviorGuidelines = await this.experienceStore.generateBehaviorGuidelines();
      if (this.behaviorGuidelines) {
        agentLogger.info(
          { taskId: this.task.id, experienceCount: this.experienceStore.getExperienceCount() },
          'Loaded experience-based behavior guidelines'
        );
      }
    } catch (error) {
      agentLogger.debug(
        { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
        'Experience loading failed (non-critical)'
      );
    }

    try {
      // === 阶段 0: Git 检查点 ===
      try {
        const checkpoint = new CheckpointManager(process.cwd());
        await checkpoint.create(`执行前自动检查点: ${this.task.userInput.substring(0, 50)}`);
        agentLogger.debug({ taskId: this.task.id }, 'Git checkpoint created');
      } catch {
        // 非 Git 仓库时静默跳过
        agentLogger.debug({ taskId: this.task.id }, 'Git checkpoint skipped (not a git repo)');
      }

      // === 阶段 1: 理解 ===
      this.output(chalk.dim('[1/5] 理解任务...'));
      agentLogger.debug({ taskId: this.task.id }, 'Phase 1: Understanding task');
      const { intent } = recognizeIntent(this.task.userInput);
      this.task.intent = intent;
      agentLogger.debug({ taskId: this.task.id, intent }, 'Intent recognized');

      // 构建上下文（Repo Map + Knowledge Graph + Code Index）
      this.output(chalk.dim('  📊 构建代码库上下文...'));
      try {
        const contextResult = await this.contextBuilder.build({
          rootDir: this.rootDir,
          query: this.task.userInput,
          maxTokens: 6000,
          includeRepoMap: true,
          includeKnowledge: true,
          includeCodeSearch: true,
        });

        // Store repo map for later use
        if (contextResult.repoMapIncluded) {
          this.output(chalk.dim(`  ✓ 代码结构图已生成 (${contextResult.codeEntryCount} 个符号)`));
        }

        // Add context to the context manager and store for direct injection
        if (contextResult.context) {
          this.builtContext = contextResult.context;
          this.output(chalk.dim(`  ✓ 知识图谱已查询 (${contextResult.knowledgeEntryCount} 个相关条目)`));
        }
      } catch (error) {
        this.output(chalk.dim(`  ⚠ 上下文构建失败: ${error instanceof Error ? error.message : String(error)}`));
      }

      // === 阶段 2: 规划 ===
      this.output(chalk.dim('[2/5] 规划步骤...'));
      agentLogger.debug({ taskId: this.task.id }, 'Phase 2: Planning steps');
      this.task.steps = await planTask(this.task.userInput, intent);
      this.task.status = 'executing';
      agentLogger.info({ taskId: this.task.id, stepCount: this.task.steps.length }, 'Task planned');

      // 展示计划
      this.output(chalk.bold('\n📋 任务计划:'));
      this.task.steps.forEach((step, i) => {
        this.output(`  ${i + 1}. ${step.description}${step.tool ? ` (${chalk.cyan(step.tool)})` : ''}`);
      });
      this.output('');

      // === 阶段 3: 执行 ===
      this.output(chalk.dim('[3/5] 执行任务...'));
      agentLogger.debug({ taskId: this.task.id }, 'Phase 3: Executing steps');
      const context: Record<string, unknown> = {};

      for (let i = 0; i < this.task.steps.length; i++) {
        const step = this.task.steps[i];
        this.task.currentStep = i;
        step.status = 'running';
        this.onStepChange?.(step);

        try {
          if (step.tool) {
            agentLogger.debug({ taskId: this.task.id, step: i, tool: step.tool }, 'Executing tool step');

            // 记录决策：选择当前工具
            const availableToolsList = [...toolRegistry.keys()];
            const chosenTool = step.tool;
            const reasoning = `步骤 "${step.description}" 需要使用工具 "${chosenTool}" 来完成`;
            this.currentDecisionId = await this.decisionReflector.recordDecision(
              this.task.id,
              step.description,
              { taskDescription: this.task.userInput, stepIndex: i },
              availableToolsList.map(t => ({
                id: t,
                description: `工具: ${t}`,
                pros: [],
                cons: [],
                risk: t === chosenTool ? 0 : 0.5,
                benefits: t === chosenTool ? 1 : 0.5,
              })),
              chosenTool,
              reasoning,
              0.8
            );
            agentLogger.debug({ taskId: this.task.id, decisionId: this.currentDecisionId }, 'Decision recorded');

            if (!step.args || Object.keys(step.args).length === 0) {
              this.output(chalk.dim(`  🧠 AI 推理工具参数: ${chalk.cyan(step.tool)}...`));
              const paramReasoning = await reasonStep({
                taskDescription: this.task.userInput,
                intent: this.task.intent || 'chat',
                stepDescription: `为工具 "${step.tool}" 确定执行参数。步骤描述: ${step.description}。请以 JSON 格式输出参数，例如: {"command": "ls -la"} 或 {"path": "/src/index.ts", "content": "..."}`,
                previousResults: this.getContextWithBuiltContext(),
                availableTools: [step.tool],
              });
              step.args = parseToolArgsFromAI(step.tool, paramReasoning);
            }
            this.output(chalk.dim(`  → 执行工具: ${chalk.cyan(step.tool)} ${step.args ? JSON.stringify(step.args) : ''}...`));
            step.result = await executeStep(step, context);
            this.output(chalk.green(`  ✓ 完成: ${step.description}`));
            agentLogger.info({ taskId: this.task.id, step: i, tool: step.tool }, 'Tool step completed');
            this.contextManager.addToolResult(step.tool, step.result, true);

            // 记录决策结果（执行到此处说明步骤成功）
            if (this.currentDecisionId) {
              await this.decisionReflector.recordOutcome(this.currentDecisionId, {
                success: true,
                actualResult: step.result || '',
                expectedResult: step.description,
                gapAnalysis: '',
                lessonsLearned: [],
              });
              agentLogger.debug({ taskId: this.task.id, decisionId: this.currentDecisionId, success: true }, 'Decision outcome recorded');
            }

            // 追踪文件变更（用于自动提交）
            if (step.tool === 'write_file' && step.args?.path) {
              this.changedFiles.push(String(step.args.path));
              agentLogger.debug({ taskId: this.task.id, file: step.args.path }, 'File change tracked');
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
            const reasoning = await reasonStep({
              taskDescription: this.task.userInput,
              intent: this.task.intent || 'chat',
              stepDescription: step.description,
              previousResults: this.getContextWithBuiltContext(),
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
          agentLogger.error({ taskId: this.task.id, step: i, error: step.error }, 'Step execution failed');
          this.output(chalk.red(`  ✗ 失败: ${step.error}`));

          // 记录决策失败结果
          if (this.currentDecisionId && step.tool) {
            try {
              await this.decisionReflector.recordOutcome(this.currentDecisionId, {
                success: false,
                actualResult: step.error || '执行失败',
                expectedResult: step.description,
                gapAnalysis: `步骤执行失败: ${step.error}`,
                lessonsLearned: [`工具 ${step.tool} 执行失败: ${step.error}`],
              });
            } catch {
              // 决策记录失败不影响主流程
            }
          }

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
      agentLogger.debug({ taskId: this.task.id }, 'Phase 4: Validating results');
      this.task.result = this.task.steps
        .filter(s => s.status === 'done' && s.result)
        .map(s => s.result!)
        .join('\n\n');

      // === 阶段 5: 反思 ===
      this.output(chalk.dim('[5/5] 反思总结...'));
      agentLogger.debug({ taskId: this.task.id }, 'Phase 5: Reflection');

      // 找到反思步骤并调用 AI（使用自校正推理）
      const reflectStep = this.task.steps.find(s => s.description.includes('反思'));
      if (reflectStep) {
        reflectStep.status = 'running';
        this.output(chalk.dim(`  🧠 AI 反思中（带自校正推理）...`));
        const { content: reflection, corrections } = await reasonWithSelfCorrection(
          this.task.userInput,
          '反思执行过程，总结经验教训，评估完成度，提出改进建议',
          this.getContextWithBuiltContext(),
          [],
          2
        );
        if (corrections > 0) {
          agentLogger.info({ taskId: this.task.id, corrections }, 'Reflection self-corrected');
        }
        reflectStep.result = reflection;
        reflectStep.status = 'done';
        this.output(chalk.green('  ✓ 反思完成'));
        agentLogger.debug({ taskId: this.task.id }, 'Reflection completed');
      }

      // 使用 DecisionReflector 进行任务级反思
      try {
        const executionSummary = this.task.steps
          .filter(s => s.status === 'done' && s.result)
          .map(s => `[${s.description}]: ${s.result!.substring(0, 200)}`)
          .join('\n');

        const taskReflection = await this.decisionReflector.reflectOnTask(
          this.task.id,
          this.task.userInput,
          executionSummary
        );

        if (taskReflection.improvements.length > 0) {
          agentLogger.info(
            { taskId: this.task.id, improvementCount: taskReflection.improvements.length },
            'Task reflection generated improvement suggestions'
          );
          this.output(chalk.dim(`  💡 反思发现 ${taskReflection.improvements.length} 个改进建议:`));
          for (const improvement of taskReflection.improvements) {
            this.output(chalk.dim(`    - [${improvement.priority}] ${improvement.description}`));
          }
        }

        agentLogger.info(
          { taskId: this.task.id, overallRating: taskReflection.overallRating },
          'Task reflection completed'
        );

        // === 学习循环：将反思结果转化为经验并存储 ===
        try {
          // 1. 调用 generateImprovementReport 获取改进报告（触发报告生成逻辑）
          await this.decisionReflector.generateImprovementReport();

          // 2. 调用 learnFromExperience 提取教训
          const lessons = await this.decisionReflector.learnFromExperience(this.task.id);

          // 3. 提取决策记录，构建 Experience 对象
          const taskDecisions = await this.decisionReflector.getDecisionsByTask(this.task.id);
          const experienceDecisions = taskDecisions.map(d => ({
            context: d.description,
            chosen: d.chosenAlternative,
            outcome: (d.outcome?.success ? 'success' : (!d.outcome ? 'partial' : 'failure')) as 'success' | 'failure' | 'partial',
            confidence: d.confidence,
            reasoning: d.rationale,
          }));

          // 4. 提取改进建议和模式
          const improvements = taskReflection.improvements.map(i => i.recommendation);
          const patterns: string[] = [];
          if (taskReflection.failures.length > 0) {
            patterns.push(...taskReflection.failures.map(f => f.replace(/^失败:\s*/, '')));
          }
          if (taskReflection.successes.length > 0) {
            patterns.push(...taskReflection.successes.map(s => s.replace(/^成功:\s*/, '')));
          }

          // 5. 根据任务结果推断情绪基调
          const hasFailures = this.task.steps.some(s => s.status === 'error' || s.status === 'skipped');
          const allSuccess = this.task.steps.every(s => s.status === 'done');
          const errorCount = this.task.steps.filter(s => s.status === 'error').length;
          let emotionalTone: Experience['emotionalTone'] = 'neutral';
          if (allSuccess && taskReflection.overallRating >= 0.8) {
            emotionalTone = 'excited';
          } else if (allSuccess) {
            emotionalTone = 'confident';
          } else if (errorCount > 0) {
            emotionalTone = 'frustrated';
          } else if (hasFailures) {
            emotionalTone = 'cautious';
          }

          // 6. 推断任务类型
          const taskType = this.inferTaskType(this.task.userInput, this.task.intent);

          // 7. 构建并存储经验
          const experience: Experience = {
            id: `exp-${this.task.id}`,
            timestamp: new Date().toISOString(),
            taskType,
            taskDescription: this.task.userInput,
            decisions: experienceDecisions,
            lessons,
            improvements,
            patterns,
            emotionalTone,
          };

          await this.experienceStore.addExperience(experience);

          agentLogger.info(
            {
              taskId: this.task.id,
              experienceId: experience.id,
              lessonCount: lessons.length,
              improvementCount: improvements.length,
              emotionalTone,
            },
            'Experience stored for future learning'
          );
        } catch (error) {
          agentLogger.warn(
            { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
            'Experience storage failed (non-critical)'
          );
        }
      } catch (error) {
        agentLogger.warn(
          { taskId: this.task.id, error: error instanceof Error ? error.message : String(error) },
          'DecisionReflector reflection failed (non-critical)'
        );
      }

      const summary = generateSummary(this.task);
      this.output(chalk.bold('\n📊 执行总结:'));
      this.output(summary);

      this.task.status = 'completed';
      this.task.completedAt = Date.now();
      agentLogger.info({ taskId: this.task.id, duration: this.task.completedAt - this.task.startedAt }, 'Task completed');

      // 更新情绪状态：任务成功
      this.emotionalState.onTaskSuccess(this.task.userInput);

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

      // 保存决策历史到磁盘
      await this.decisionReflector.save();

      // 保存人格状态
      await this.personalityManager.save();

      return this.task;
    } catch (error) {
      this.task.status = 'failed';
      this.task.result = error instanceof Error ? error.message : String(error);
      agentLogger.error({ taskId: this.task.id, error: this.task.result }, 'Task failed');

      // 更新情绪状态：任务失败
      this.emotionalState.onTaskFailure(this.task.result);

      // 即使失败也保存已记录的决策
      await this.decisionReflector.save();

      return this.task;
    }
  }

  private output(text: string): void {
    console.log(text);
    this.onOutput?.(text);
  }

  /**
   * 根据用户输入和意图推断任务类型
   */
  private inferTaskType(userInput: string, intent?: string): string {
    const input = userInput.toLowerCase();

    if (/bug|fix|修复|错误|报错|异常|error|fail|crash/.test(input)) return 'bug-fix';
    if (/refactor|重构|优化|整理|clean|improve/.test(input)) return 'refactor';
    if (/feature|功能|新增|添加|实现|create|add|implement/.test(input)) return 'feature';
    if (/test|测试|单元|e2e|spec/.test(input)) return 'testing';
    if (/review|审查|检查|check/.test(input)) return 'review';
    if (/doc|文档|readme|comment/.test(input)) return 'documentation';
    if (/deploy|部署|发布|release|build/.test(input)) return 'deployment';

    // 回退到意图
    if (intent) {
      return intent.replace(/-/g, '_');
    }

    return 'general';
  }

  /**
   * 获取包含项目上下文和行为指导的 previousResults。
   * 将 ContextBuilder 生成的上下文（Repo Map、Knowledge Graph、Memory）
   * 以及从历史经验中学习到的行为指导直接注入到 previousResults 的开头，
   * 避免被 addToolResult 截断。
   */
  private getContextWithBuiltContext(): string[] {
    const previousContext = this.contextManager.getContext().map(m => m.content);
    const parts: string[] = [];

    // 注入人格描述
    const personalityPrompt = this.personalityManager.getPersonalityPrompt();
    if (personalityPrompt) {
      parts.push(`[Agent 人格]\n${personalityPrompt}`);
    }

    // 注入情绪状态
    const emotionalContext = this.emotionalState.getEmotionalContext();
    if (emotionalContext) {
      parts.push(emotionalContext);
    }

    // 注入从历史经验中学习到的行为指导（学习循环的核心）
    if (this.behaviorGuidelines) {
      parts.push(`[行为指导（基于${this.experienceStore.getExperienceCount()}次历史经验自动生成）]\n${this.behaviorGuidelines}`);
    }

    if (this.builtContext) {
      parts.push(`[项目上下文]\n${this.builtContext}`);
    }

    return [...parts, ...previousContext];
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

      // Also extract and save to knowledge graph
      try {
        await this.knowledgeGraph.init();
        const records = await memoryManager.loadAllRecords();
        const recentRecords = records.slice(0, 5);
        await this.knowledgeGraph.extractFromMemory(recentRecords);
      } catch {
        // Knowledge graph extraction is optional
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      agentLogger.warn({ taskId: this.task.id, error: errorMsg }, 'Failed to save to memory');
      console.warn(chalk.dim(`[记忆] 保存失败: ${errorMsg}`));
    }
  }

  /**
   * Query the knowledge graph for relevant context.
   */
  async queryKnowledgeGraph(query: string): Promise<KnowledgeEntry[]> {
    try {
      return await this.contextBuilder.queryKnowledgeGraph(query);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      agentLogger.warn({ taskId: this.task.id, query, error: errorMsg }, 'Knowledge graph query failed');
      console.warn(chalk.dim(`[知识图谱] 查询失败: ${errorMsg}`));
      return [];
    }
  }

  /**
   * Get the current repo map if available.
   */
  getRepoMap(): string | undefined {
    return this.repoMap;
  }

  /**
   * Get the change control manager for monitoring file changes.
   */
  getChangeControl(): ChangeControlManager {
    return this.changeControl;
  }

  /**
   * Execute a protected file operation with change control.
   */
  async executeProtected(
    action: 'create' | 'modify' | 'delete' | 'read' | 'shell',
    target: string,
    executeFn: () => Promise<unknown>
  ): Promise<{ success: boolean; result?: unknown }> {
    return this.changeControl.executeProtectedChange(action, target, executeFn);
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
