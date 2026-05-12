import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { configManager } from '../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { printTable, printKeyValue, printBadge } from '../ui/display.js';
import { showMainMenu, showProviderMenu } from '../ui/menu.js';

const aiCommand = new Command('ai')
  .description('AI模型管理');

// 交互式主菜单
aiCommand
  .command('interactive')
  .alias('i')
  .description('启动交互式菜单')
  .action(async () => {
    await configManager.init();

    while (true) {
      const choice = await showMainMenu();

      if (choice === null || choice === 'exit') {
        printHeader();
        printSuccess('感谢使用 DevFlow Agent，再见！');
        return;
      }

      switch (choice) {
        case 'list': await showProviderList(); break;
        case 'status': await showStatus(); break;
        case 'models': await showAllModels(); break;
        case 'suggest': await showModelSuggestion(); break;
        case 'info': await showModelInfo(); break;
        case 'interactive':
        case 'quick-ask':
        case 'agent-run':
        case 'review-file':
        case 'review-dir':
        case 'tools-list':
        case 'tools-run':
        case 'file-read':
        case 'file-write':
        case 'file-tree':
        case 'memory-view':
        case 'memory-search':
        case 'config-view':
        case 'config-key':
        case 'config-sandbox':
        case 'help': {
          printInfo('请使用主菜单进入此功能: devflow');
          printInfo('或使用命令行: devflow chat ask / devflow agent run 等');
          await waitForEnter();
          break;
        }
        default: {
          printInfo(`功能 "${choice}" 请使用主菜单: devflow`);
          await waitForEnter();
        }
      }
    }
  });

// ==================== 内部函数 ====================

function isProviderConfigured(type: ProviderType): boolean {
  const info = PROVIDER_INFO[type];
  if (!info.requiresApiKey) return true;
  return !!configManager.getApiKey(type);
}

async function showProviderList() {
  printHeader();
  printSection('支持的AI平台');

  PROVIDER_TYPE_LIST.forEach(type => {
    const info = PROVIDER_INFO[type];
    const isConfigured = isProviderConfigured(type);

    console.log(`\n  ${isConfigured ? '✓' : '○'} ${info.displayName}`);
    console.log(`     ${chalk.gray(info.description)}`);
    console.log(`     默认模型: ${chalk.cyan(info.models[0]?.name || '无')}`);

    if (info.freeTier) console.log(`     ${chalk.green('✓ 免费额度')}`);

    if (!info.requiresApiKey) {
      console.log(`     ${chalk.green('✓ 本地运行，无需配置')}`);
    } else if (!isConfigured) {
      printWarning(`需要配置: devflow config set-key ${type} <apiKey>`);
    }
  });

  console.log('\n');
  await waitForEnter();
}

async function showStatus() {
  printHeader();
  printSection('AI配置状态');

  const head = ['平台', '状态', '模型数', '类型', 'API Key'];
  const rows = PROVIDER_TYPE_LIST.map(type => {
    const info = PROVIDER_INFO[type];
    const apiKey = configManager.getApiKey(type);
    const isConfigured = isProviderConfigured(type);
    const typeLabel = info.requiresApiKey ? '云端' : '本地';
    const keyPreview = !info.requiresApiKey ? '无需配置'
      : apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
      : '未设置';
    return [
      info.displayName,
      isConfigured ? '✓ 已配置' : '○ 未配置',
      String(info.models.length),
      typeLabel,
      keyPreview,
    ];
  });

  printTable({ title: 'AI 平台配置状态', head, rows });

  const configuredCount = PROVIDER_TYPE_LIST.filter(isProviderConfigured).length;
  printInfo(`统计: ${configuredCount}/${PROVIDER_TYPE_LIST.length} 个平台已配置`);
  console.log('\n');
  await waitForEnter();
}

async function showAllModels() {
  printHeader();
  printSection('所有可用模型（按输入价格排序）');

  interface ModelDisplay {
    provider: ProviderType;
    providerName: string;
    id: string;
    name: string;
    inputPrice: number;
    outputPrice: number;
    capabilities: string[];
  }

  const allModels: ModelDisplay[] = [];

  PROVIDER_TYPE_LIST.forEach(type => {
    const info = PROVIDER_INFO[type];
    info.models.forEach(model => {
      const capabilities: string[] = [];
      if (model.capabilities.chat) capabilities.push('聊天');
      if (model.capabilities.stream) capabilities.push('流式');
      if (model.capabilities.tools) capabilities.push('工具');
      if (model.capabilities.thinking) capabilities.push('思考');
      if (model.capabilities.vision) capabilities.push('视觉');

      allModels.push({
        provider: type,
        providerName: info.displayName,
        id: model.id,
        name: model.name,
        inputPrice: model.pricing.inputPerMillion,
        outputPrice: model.pricing.outputPerMillion,
        capabilities
      });
    });
  });

  allModels.sort((a, b) => a.inputPrice - b.inputPrice);

  console.log(chalk.bold('\n  平台              模型                    输入$/M      输出$/M    能力'));
  console.log(chalk.gray('  ' + '─'.repeat(80)));

  allModels.forEach(model => {
    console.log(
      `  ${model.providerName.padEnd(16)}` +
      `${model.name.padEnd(22)}` +
      `$${model.inputPrice.toFixed(2).padEnd(10)}` +
      `$${model.outputPrice.toFixed(2).padEnd(10)}` +
      `${model.capabilities.join(', ')}`
    );
  });

  printInfo(`\n共 ${allModels.length} 个模型`);
  console.log('\n');
  await waitForEnter();
}

async function showModelSuggestion() {
  printHeader();
  printSection('模型推荐');

  const { task } = await inquirer.prompt([{
    type: 'input',
    name: 'task',
    message: '描述你的任务（如：编程、写作、分析等）：',
    validate: (input: string) => input.trim() !== '' || '请输入任务描述'
  }]);

  const taskProfiles = [
    { keywords: ['代码', '编程', '程序', '函数', '算法', 'debug', 'code', 'react', 'python', 'javascript'], weight: 15, preferredCapabilities: ['chat', 'tools', 'thinking'] },
    { keywords: ['分析', '审查', 'review', 'audit', '检查', '优化'], weight: 12, preferredCapabilities: ['chat', 'thinking'] },
    { keywords: ['写作', '文章', '文档', 'write', 'essay', '报告'], weight: 10, preferredCapabilities: ['chat'] },
    { keywords: ['翻译', 'translate'], weight: 8, preferredCapabilities: ['chat'] },
    { keywords: ['对话', '聊天', 'chat', '问题', '解释'], weight: 6, preferredCapabilities: ['chat'] }
  ];

  const taskLower = task.toLowerCase();
  let bestMatch: { profile: typeof taskProfiles[0]; score: number } | null = null;

  taskProfiles.forEach(profile => {
    let score = 0;
    profile.keywords.forEach(keyword => {
      if (taskLower.includes(keyword)) score += profile.weight;
    });
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { profile, score };
    }
  });

  interface ModelScore { provider: ProviderType; providerName: string; model: typeof PROVIDER_INFO[ProviderType]['models'][0]; score: number; }
  const candidates: ModelScore[] = [];

  PROVIDER_TYPE_LIST.forEach(type => {
    if (!isProviderConfigured(type)) return;
    const info = PROVIDER_INFO[type];

    info.models.forEach(model => {
      let score = 50;
      if (bestMatch) {
        score += bestMatch.score;
        bestMatch.profile.preferredCapabilities.forEach(cap => {
          if (model.capabilities[cap as keyof typeof model.capabilities] as boolean) score += 5;
        });
      }
      const avgPrice = (model.pricing.inputPerMillion + model.pricing.outputPerMillion) / 2;
      score += Math.max(0, 20 - avgPrice * 10);
      candidates.push({ provider: type, providerName: info.displayName, model, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);

  printHeader();
  printSection(`任务分析: ${task}`);

  console.log(chalk.bold('\n  🎯 推荐模型:\n'));

  top.forEach((item, index) => {
    const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
    console.log(`  ${rank} ${chalk.bold.cyan(item.providerName)} / ${chalk.bold(item.model.name)}`);
    console.log(`     📊 评分: ${chalk.yellow(item.score.toFixed(1))}`);
    console.log(`     💰 输入: $${chalk.green(item.model.pricing.inputPerMillion)}/M | 输出: $${chalk.green(item.model.pricing.outputPerMillion)}/M`);
    console.log(`     📏 上下文: ${chalk.cyan((item.model.contextWindow / 1000).toFixed(0))}K tokens`);
    console.log(`     🔧 能力: ${Object.entries(item.model.capabilities).filter(([_k, v]) => v).map(([k]) => k).join(', ')}`);
    console.log();
  });

  if (top.length > 0) {
    printSuccess(`最佳选择: ${top[0].providerName} / ${top[0].model.name}`);
  }

  console.log('\n');
  await waitForEnter();
}

async function showModelInfo() {
  printHeader();

  const providerChoice = await showProviderMenu();
  if (!providerChoice || providerChoice === '__back__') return;

  const info = PROVIDER_INFO[providerChoice as ProviderType];
  const { modelId } = await inquirer.prompt([{
    type: 'list',
    name: 'modelId',
    message: '选择模型：',
    choices: info.models.map(m => ({
      name: `${m.name} (${m.pricing.inputPerMillion}$/M)`,
      value: m.id
    }))
  }]);

  const model = info.models.find(m => m.id === modelId);
  if (!model) return;

  printHeader();
  printSection(`模型信息: ${model.name}`);

  console.log(`\n  ${chalk.bold('名称:')} ${chalk.cyan(model.name)}`);
  console.log(`  ${chalk.bold('ID:')} ${chalk.gray(model.id)}`);
  console.log(`  ${chalk.bold('平台:')} ${chalk.cyan(info.displayName)}`);

  console.log(`\n  ${chalk.bold('💰 定价:')}`);
  console.log(`     输入: $${chalk.yellow(model.pricing.inputPerMillion)} ${model.pricing.currency}/百万Token`);
  console.log(`     输出: $${chalk.yellow(model.pricing.outputPerMillion)} ${model.pricing.currency}/百万Token`);

  console.log(`\n  ${chalk.bold('📊 参数:')}`);
  console.log(`     上下文窗口: ${chalk.cyan(model.contextWindow.toLocaleString())} tokens`);
  console.log(`     最大输出: ${chalk.cyan(model.maxOutput.toLocaleString())} tokens`);

  console.log(`\n  ${chalk.bold('✨ 能力:')}`);
  console.log(`     聊天: ${model.capabilities.chat ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     流式: ${model.capabilities.stream ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     嵌入: ${model.capabilities.embed ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     工具: ${model.capabilities.tools ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     思考: ${model.capabilities.thinking ? chalk.green('✓') : chalk.red('✗')}`);
  console.log(`     视觉: ${model.capabilities.vision ? chalk.green('✓') : chalk.red('✗')}`);

  console.log('\n');
  await waitForEnter();
}

async function waitForEnter(): Promise<void> {
  if (!process.stdin.isTTY) return;
  await inquirer.prompt([{
    type: 'input',
    name: 'continue',
    message: chalk.gray('按 Enter 返回主菜单...')
  }]);
}

// ==================== 子命令（兼容） ====================

aiCommand
  .command('list')
  .description('列出所有支持的AI平台和模型')
  .action(async () => {
    await configManager.init();
    await showProviderList();
  });

aiCommand
  .command('status')
  .description('查看AI配置状态')
  .action(async () => {
    await configManager.init();
    await showStatus();
  });

const modelCommand = new Command('model')
  .description('模型管理');

modelCommand
  .command('list')
  .description('列出所有可用模型（按价格排序）')
  .action(async () => {
    await configManager.init();
    await showAllModels();
  });

aiCommand.addCommand(modelCommand);

export { aiCommand };
