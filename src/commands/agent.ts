import { Command, Argument } from 'commander';
import chalk from 'chalk';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning, createSpinner } from '../ui/logo.js';
import { printSteps, printKeyValue, printTable } from '../ui/display.js';
import { runAgentTask, recognizeIntent, type TaskStep } from '../agent/core.js';
import { detectIssues, generateTrustReport, formatTrustOutput, DANGEROUS_PATTERNS } from '../agent/trust.js';
import { assessRisk, ChangeControlManager, RISK_RULES, backupFile, rollback } from '../agent/change-control.js';
import { configManager } from '../config/manager.js';

const agentCommand = new Command('agent')
  .description('Agent 核心循环 - 智能理解、规划、执行任务');

// devflow agent run <任务> - 执行智能任务
agentCommand
  .command('run')
  .alias('execute')
  .description('执行智能任务（理解→规划→执行→反思）')
  .argument('<task>', '要完成的任务描述')
  .option('-p, --provider <provider>', 'AI 平台', 'aliyun')
  .option('-m, --model <model>', '使用的模型')
  .option('-v, --verbose', '显示详细步骤', false)
  .option('--no-plan', '跳过规划步骤，直接执行')
  .option('--no-ai', '禁用 AI 推理（空操作步骤将跳过）', false)
  .action(async (task: string, options: {
    provider: string;
    model?: string;
    verbose: boolean;
    plan?: boolean;
    ai?: boolean;
  }) => {
    try {
      printHeader();
      printSection('>> Agent 任务执行');
      console.log(chalk.gray(`  任务: ${task}\n`));

      // 意图识别
      const intent = recognizeIntent(task);
      console.log(chalk.cyan(`  🎯 识别意图: ${chalk.bold(intent.intent)} (置信度: ${(intent.confidence * 100).toFixed(0)}%)`));
      if (intent.suggestedTools.length > 0) {
        console.log(chalk.gray(`  🛠️  建议工具: ${intent.suggestedTools.join(', ')}`));
      }
      console.log();

      const steps: TaskStep[] = [];

      // 初始化配置
      await configManager.init();

      // 执行任务
      const result = await runAgentTask(task,
        // 步骤变化回调（记录步骤状态）
        (step) => {
          steps[step.id - 1] = step;
        },
        // 输出回调（内部已输出，无需重复）
        undefined
      );

      // 显示结果
      console.log();
      if (result.status === 'completed') {
        printSuccess('任务执行完成');
      } else if (result.status === 'failed') {
        printError('任务执行失败');
        if (result.result) {
          console.log(chalk.red(`  原因: ${result.result}`));
        }
      } else {
        printWarning('任务执行部分完成');
      }

      // 步骤摘要
      if (!options.verbose && steps.length > 0) {
        printSection('>> 执行步骤');
        const displaySteps = steps.filter(Boolean).map(s => ({
          step: s.id,
          title: s.description,
          status: s.status === 'done' ? 'done' : s.status === 'running' ? 'running' : s.status === 'error' ? 'error' : 'pending',
          detail: s.result ? s.result.slice(0, 50) : s.error,
        }));
        printSteps(displaySteps as any);
      }
    } catch (error) {
      printError(`任务执行失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

// devflow agent intent <描述> - 测试意图识别
agentCommand
  .command('intent')
  .alias('recognize')
  .description('测试意图识别')
  .argument('<description>', '任务描述')
  .action((description: string) => {
    const result = recognizeIntent(description);

    printHeader();
    printSection('>> 意图识别结果');
    printKeyValue([
      { key: '输入描述', value: description, highlight: true },
      { key: '识别意图', value: result.intent, highlight: true },
      { key: '置信度', value: `${(result.confidence * 100).toFixed(0)}%` },
      { key: '建议工具', value: result.suggestedTools.length > 0 ? result.suggestedTools.join(', ') : '无' },
    ]);
  });

// devflow agent plan <任务> - 只做规划，不执行
agentCommand
  .command('plan')
  .description('仅规划任务步骤（不执行）')
  .argument('<task>', '要规划的任务描述')
  .action(async (task: string) => {
    try {
      printHeader();
      printSection('>> 任务规划');

      const intent = recognizeIntent(task);
      console.log(chalk.cyan(`  >> 意图: ${chalk.bold(intent.intent)}\n`));

      const { planTask } = await import('../agent/core.js');
      const steps = await planTask(task, intent.intent);

      printSection(`分解为 ${steps.length} 个步骤`);
      steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${chalk.cyan(step.description)}`);
        if (step.tool) {
          console.log(`     ${chalk.gray('→ 工具:')} ${chalk.green(step.tool)}`);
        }
      });

      console.log();
    } catch (error) {
      printError(`任务规划失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

// devflow agent status - 查看 Agent 状态
agentCommand
  .command('status')
  .description('查看 Agent 系统状态')
  .action(async () => {
    await configManager.init();

    printHeader();
    printSection('>> Agent 系统状态');

    // 检查工具注册
    const { listTools } = await import('../tools/registry.js');
    const tools = listTools();

    printKeyValue([
      { key: 'Agent 核心循环', value: '✓ 就绪', highlight: true },
      { key: '意图识别引擎', value: '✓ 就绪', highlight: true },
      { key: '任务规划器', value: '✓ 就绪', highlight: true },
      { key: '已注册工具', value: `${tools.length} 个` },
      { key: '记忆系统', value: '✓ 集成', highlight: false },
    ]);

    console.log();
    printSection('> 可用工具列表');
    const toolGroups = new Map<string, string[]>();
    for (const tool of tools) {
      const group = tool.category || 'other';
      if (!toolGroups.has(group)) toolGroups.set(group, []);
      toolGroups.get(group)!.push(tool.name);
    }
    for (const [group, names] of toolGroups) {
      console.log(`  ${chalk.yellow(group)}: ${names.join(', ')}`);
    }
    console.log();
  });

// devflow agent trust <文本> - 信任检查
agentCommand
  .command('trust')
  .description('信任检查 - 检测文本中的潜在风险')
  .argument('<text>', '要检查的文本')
  .option('-v, --verbose', '显示详细标注', false)
  .action((text: string, options: { verbose: boolean }) => {
    printHeader();
    printSection('>> 信任检查');

    const issues = detectIssues(text);
    const report = generateTrustReport(issues);

    printKeyValue([
      { key: '信任级别', value: report.level.toUpperCase(), highlight: report.level === 'safe' },
      { key: '发现问题', value: `${issues.length} 个` },
      { key: '需要确认', value: report.requiresConfirmation ? '⚠ 是' : '✓ 否' },
    ]);

    if (issues.length > 0) {
      printSection('问题详情');
      issues.forEach((issue, i) => {
        const levelIcon = issue.level === 'critical' ? chalk.red('[X]') :
                   issue.level === 'high' ? chalk.red('[!]') :
                   issue.level === 'medium' ? chalk.yellow('[!]') :
                   chalk.gray('[o]');
        console.log(`  ${levelIcon} ${i + 1}. [${issue.type}] ${issue.description}`);
        console.log(`     ${chalk.gray(issue.suggestion)}`);
      });
    }

    if (options.verbose && issues.length > 0) {
      printSection('标注输出');
      console.log(formatTrustOutput(text, issues));
    }

    console.log();
  });

// devflow agent trust-rules - 查看信任规则
agentCommand
  .command('trust-rules')
  .description('查看所有信任检测规则')
  .action(() => {
    printHeader();
    printSection('>> 信任检测规则');

    const head = ['类型', '级别', '模式', '描述'];
    const rows = DANGEROUS_PATTERNS.map(p => [
      p.type,
      p.level,
      p.pattern.source.slice(0, 30),
      p.description,
    ]);

    printTable({ title: `${DANGEROUS_PATTERNS.length} 条检测规则`, head, rows });
    console.log();
  });

// devflow agent risk <action> <target> - 风险评估
agentCommand
  .command('risk')
  .description('风险评估 - 评估文件操作的风险等级')
  .addArgument(new Argument('<action>', '操作类型').choices(['read', 'create', 'modify', 'delete', 'shell']))
  .argument('<target>', '目标文件路径或命令')
  .action((action: string, target: string) => {
    printHeader();
    printSection('>> 风险评估');

    const validActions = ['read', 'create', 'modify', 'delete', 'shell'];
    if (!validActions.includes(action)) {
      printError(`无效操作类型: ${action}，支持: ${validActions.join(', ')}`);
      return;
    }

    const result = assessRisk(action as any, target);

    const riskIcon = result.risk === 'critical' ? chalk.red('[X]') :
                  result.risk === 'high' ? chalk.red('[!]') :
                  result.risk === 'medium' ? chalk.yellow('[!]') :
                  result.risk === 'low' ? chalk.green('[o]') :
                  chalk.gray('[o]');
    const riskLabel = { negligible: '可忽略', low: '低', medium: '中', high: '高', critical: '危险' }[result.risk];

    printKeyValue([
      { key: '操作', value: `${action} → ${target}`, highlight: true },
      { key: '风险等级', value: `${riskIcon} ${riskLabel}（${result.risk}）`, highlight: result.risk === 'critical' || result.risk === 'high' },
      { key: '匹配规则', value: `${result.rules.length} 条` },
      { key: '需要备份', value: result.risk === 'high' || result.risk === 'critical' ? '⚠ 是' : '否' },
      { key: '需要确认', value: result.risk !== 'negligible' && result.risk !== 'low' ? '⚠ 是' : '否' },
    ]);

    if (result.rules.length > 0) {
      console.log(chalk.gray('\n  匹配规则:'));
      result.rules.forEach(r => console.log(chalk.gray(`    • ${r}`)));
    }
    console.log();
  });

// devflow agent changes - 变更历史
agentCommand
  .command('changes')
  .description('查看变更控制历史')
  .option('-s, --stats', '显示统计信息', false)
  .action((options: { stats: boolean }) => {
    printHeader();
    printSection('>> 变更控制历史');

    const manager = new ChangeControlManager();
    const history = manager.getHistory();

    if (history.length === 0) {
      printInfo('暂无变更记录');
      console.log();
      return;
    }

    if (options.stats) {
      const stats = manager.getStats();
      printKeyValue([
        { key: '总变更数', value: String(stats.total) },
        { key: '可忽略', value: String(stats.byRisk.negligible) },
        { key: '低风险', value: String(stats.byRisk.low) },
        { key: '中风险', value: String(stats.byRisk.medium) },
        { key: '高风险', value: String(stats.byRisk.high) },
        { key: '危险', value: String(stats.byRisk.critical) },
      ]);
      console.log();
      return;
    }

    const head = ['操作', '目标', '风险', '已备份', '已批准', '时间'];
    const rows = history.slice(-20).reverse().map(r => [
      r.action,
      r.target.length > 40 ? r.target.slice(0, 37) + '...' : r.target,
      r.risk,
      r.backedUp ? '✓' : '✗',
      r.approved ? '✓' : '✗',
      new Date(r.timestamp).toLocaleString('zh-CN'),
    ]);

    printTable({ title: `最近 ${rows.length} 条变更`, head, rows });
    console.log();
  });

// devflow agent backup <文件> - 手动备份文件
agentCommand
  .command('backup')
  .description('手动备份文件')
  .argument('<filePath>', '要备份的文件路径')
  .action(async (filePath: string) => {
    printHeader();
    printSection('> 文件备份');

    const result = await backupFile(filePath);
    if (result.success) {
      printSuccess(`备份成功: ${result.backupPath}`);
    } else {
      printError(`备份失败: ${result.error}`);
    }
    console.log();
  });

// devflow agent rollback <记录ID> - 回滚变更
agentCommand
  .command('rollback')
  .description('回滚变更（恢复到修改前的状态）')
  .argument('<id>', '变更记录 ID')
  .action(async (id: string) => {
    printHeader();
    printSection('↩️ 回滚变更');

    const manager = new ChangeControlManager();
    const record = manager.getHistory().find(r => r.id === id);

    if (!record) {
      printError(`找不到变更记录: ${id}`);
      console.log(chalk.gray('  提示: 使用 devflow agent changes 查看变更历史'));
      console.log();
      return;
    }

    const result = await rollback(record);
    if (result.success) {
      printSuccess(`回滚成功: ${record.target}`);
    } else {
      printError(`回滚失败: ${result.error}`);
    }
    console.log();
  });

// devflow agent risk-rules - 查看风险规则
agentCommand
  .command('risk-rules')
  .description('查看所有风险评估规则')
  .action(() => {
    printHeader();
    printSection('>> 风险评估规则');

    const head = ['操作类型', '风险', '模式', '原因'];
    const rows = RISK_RULES.map(r => [
      r.action.join(', '),
      r.risk,
      r.pattern.source.slice(0, 35),
      r.reason,
    ]);

    printTable({ title: `${RISK_RULES.length} 条风险规则`, head, rows });
    console.log();
  });

export { agentCommand };
