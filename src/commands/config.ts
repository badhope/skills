import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager, SANDBOX_PERMISSIONS, type SandboxLevel } from '../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { printTable, printKeyValue, printBadge } from '../ui/display.js';

const configCommand = new Command('config')
  .description('配置管理');

// 查看所有配置
configCommand
  .command('list')
  .alias('ls')
  .description('列出所有配置')
  .action(async () => {
    await configManager.init();
    const config = configManager.getAllConfig();

    printHeader();
    printSection('当前配置');

    console.log(chalk.bold('\n  📍 配置文件路径:'));
    console.log(`     ${configManager.getConfigPath()}`);

    console.log(chalk.bold('\n  🤖 AI平台配置:\n'));

    PROVIDER_TYPE_LIST.forEach(type => {
      const info = PROVIDER_INFO[type];
      const providerConfig = config.providers[type];
      // 本地平台不需要 API Key
      const isLocalProvider = !info.requiresApiKey;
      const hasApiKey = isLocalProvider || !!providerConfig?.apiKey;

      if (hasApiKey) {
        printSuccess(`${info.displayName} [已配置]`);
        if (isLocalProvider) {
          console.log(`     ${chalk.green('✓ 本地运行，无需API Key')}`);
        } else {
          const maskedKey = providerConfig.apiKey!.substring(0, 8) + '...' + providerConfig.apiKey!.substring(providerConfig.apiKey!.length - 4);
          console.log(`     API Key: ${maskedKey}`);
        }
      } else {
        printError(`${info.displayName} [未配置]`);
      }

      if (providerConfig?.baseUrl) {
        console.log(`     自定义端点: ${providerConfig.baseUrl}`);
      }

      if (providerConfig?.defaultModel) {
        console.log(`     默认模型: ${providerConfig.defaultModel}`);
      }

      console.log();
    });

    console.log(chalk.bold('  ⚙️  聊天设置:'));
    console.log(`     默认温度: ${config.chat.defaultTemperature}`);
    console.log(`     默认最大Token: ${config.chat.defaultMaxTokens}`);
    console.log(`     保存历史: ${config.chat.saveHistory ? '是' : '否'}`);
    console.log(`     历史限制: ${config.chat.historyLimit} 条`);

    if (config.defaultProvider) {
      console.log(chalk.bold('\n  ⭐ 默认平台:'));
      console.log(`     ${PROVIDER_INFO[config.defaultProvider].displayName}`);
    }

    console.log();
  });

// 设置API密钥
configCommand
  .command('set-key')
  .description('设置API密钥')
  .argument('<provider>', '平台名称 (如: openai, aliyun, deepseek)')
  .argument('[apiKey]', 'API密钥（可选，不传则交互式输入）')
  .action(async (provider: string, apiKey?: string) => {
    await configManager.init();

    const validProviders = PROVIDER_TYPE_LIST;
    if (!validProviders.includes(provider as ProviderType)) {
      printError(`未知的平台: ${provider}`);
      console.log(chalk.gray(`  支持的平台: ${validProviders.join(', ')}`));
      return;
    }

    const type = provider as ProviderType;
    const info = PROVIDER_INFO[type];

    // 本地平台不需要 API Key
    if (!info.requiresApiKey) {
      printInfo(`${info.displayName} 是本地平台，无需配置API密钥`);
      console.log(chalk.gray(`  确保本地服务已启动: ${info.baseUrl}`));
      return;
    }

    printHeader();
    printSection(`设置 ${info.displayName} API密钥`);

    let key = apiKey;
    if (!key) {
      // 非交互模式
      if (!process.stdin.isTTY) {
        printError('请在命令行中提供API密钥: devflow config set-key <provider> <apiKey>');
        return;
      }
      const answer = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: `请输入 ${info.displayName} API密钥:`,
        mask: '*',
        validate: (input: string) => input.trim() !== '' || 'API密钥不能为空'
      }]);
      key = answer.apiKey;
    }

    try {
      if (!key) {
        printError('API密钥不能为空');
        return;
      }
      await configManager.setApiKey(type, key);
      printSuccess(`${info.displayName} API密钥设置成功！`);

      // 询问是否设为默认（仅交互模式）
      if (process.stdin.isTTY) {
        const currentDefault = configManager.getDefaultProvider();
        if (!currentDefault) {
          const { setDefault } = await inquirer.prompt([{
            type: 'confirm',
            name: 'setDefault',
            message: '是否将此平台设为默认?',
            default: true
          }]);

          if (setDefault) {
            await configManager.setDefaultProvider(type);
            printSuccess(`${info.displayName} 已设为默认平台`);
          }
        }
      }
    } catch (error) {
      printError(`设置失败: ${error}`);
    }
  });

// 删除API密钥
configCommand
  .command('remove-key')
  .alias('rm-key')
  .description('删除API密钥')
  .argument('<provider>', '平台名称')
  .option('-f, --force', '强制删除，不询问确认', false)
  .action(async (provider: string, options: { force: boolean }) => {
    await configManager.init();

    const type = provider as ProviderType;
    const info = PROVIDER_INFO[type];

    const apiKey = configManager.getApiKey(type);
    if (!apiKey) {
      printError(`${info.displayName} 未配置API密钥`);
      return;
    }

    let shouldDelete = options.force;
    if (!shouldDelete && process.stdin.isTTY) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `确定要删除 ${info.displayName} 的API密钥吗?`,
        default: false
      }]);
      shouldDelete = confirm;
    }

    if (shouldDelete) {
      await configManager.removeApiKey(type);
      printSuccess(`${info.displayName} API密钥已删除`);
    }
  });

// 设置默认平台
configCommand
  .command('set-default')
  .description('设置默认AI平台')
  .argument('[provider]', '平台名称（可选，不传则交互式选择）')
  .action(async (provider?: string) => {
    await configManager.init();

    let selectedProvider: ProviderType;

    if (provider) {
      if (!PROVIDER_TYPE_LIST.includes(provider as ProviderType)) {
        printError(`未知的平台: ${provider}`);
        return;
      }
      selectedProvider = provider as ProviderType;
    } else {
      // 交互式选择
      const configuredProviders = PROVIDER_TYPE_LIST.filter(type => 
        configManager.getApiKey(type)
      );

      if (configuredProviders.length === 0) {
        printError('没有已配置的平台');
        printInfo('请先使用 devflow config set-key <provider> <apiKey> 配置API密钥');
        return;
      }

      const choices = configuredProviders.map(type => ({
        name: `${PROVIDER_INFO[type].displayName} (${type})`,
        value: type
      }));

      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'provider',
        message: '选择默认平台:',
        choices
      }]);

      selectedProvider = answer.provider;
    }

    await configManager.setDefaultProvider(selectedProvider);
    printSuccess(`默认平台已设置为: ${PROVIDER_INFO[selectedProvider].displayName}`);
  });

// 设置聊天参数
configCommand
  .command('set-chat')
  .description('设置聊天参数')
  .option('--temperature <n>', '默认温度 (0-2)')
  .option('--max-tokens <n>', '默认最大Token数')
  .option('--save-history', '是否保存聊天历史')
  .option('--history-limit <n>', '历史记录保存条数')
  .action(async (options: { temperature?: string; maxTokens?: string; saveHistory?: string; historyLimit?: string }) => {
    await configManager.init();
    const currentConfig = configManager.getChatConfig();

    // 如果有命令行参数，直接使用
    const hasCliArgs = options.temperature || options.maxTokens || options.saveHistory || options.historyLimit;

    if (hasCliArgs) {
      const updates: Partial<typeof currentConfig> = {};
      if (options.temperature !== undefined) {
        const temp = parseFloat(options.temperature);
        if (isNaN(temp) || temp < 0 || temp > 2) {
          printError('温度必须在 0-2 之间');
          return;
        }
        updates.defaultTemperature = temp;
      }
      if (options.maxTokens !== undefined) {
        const tokens = parseInt(options.maxTokens, 10);
        if (isNaN(tokens) || tokens <= 0) {
          printError('最大Token数必须大于0');
          return;
        }
        updates.defaultMaxTokens = tokens;
      }
      if (options.saveHistory !== undefined) {
        updates.saveHistory = options.saveHistory === 'true';
      }
      if (options.historyLimit !== undefined) {
        const limit = parseInt(options.historyLimit, 10);
        if (isNaN(limit) || limit <= 0) {
          printError('历史记录条数必须大于0');
          return;
        }
        updates.historyLimit = limit;
      }

      await configManager.updateChatConfig(updates);
      printSuccess('聊天参数已更新');
      console.log(chalk.gray(`  温度: ${updates.defaultTemperature ?? currentConfig.defaultTemperature}`));
      console.log(chalk.gray(`  最大Token: ${updates.defaultMaxTokens ?? currentConfig.defaultMaxTokens}`));
      console.log(chalk.gray(`  保存历史: ${updates.saveHistory ?? currentConfig.saveHistory}`));
      console.log(chalk.gray(`  历史条数: ${updates.historyLimit ?? currentConfig.historyLimit}`));
      return;
    }

    // 交互式模式
    if (!process.stdin.isTTY) {
      printError('非交互模式请使用 --temperature/--max-tokens 等参数');
      return;
    }

    printHeader();
    printSection('设置聊天参数');

    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'defaultTemperature',
        message: '默认温度 (0-2):',
        default: currentConfig.defaultTemperature,
        validate: (input: number) => (input >= 0 && input <= 2) || '温度必须在 0-2 之间'
      },
      {
        type: 'number',
        name: 'defaultMaxTokens',
        message: '默认最大Token数:',
        default: currentConfig.defaultMaxTokens,
        validate: (input: number) => input > 0 || '必须大于0'
      },
      {
        type: 'confirm',
        name: 'saveHistory',
        message: '是否保存聊天历史?',
        default: currentConfig.saveHistory
      },
      {
        type: 'number',
        name: 'historyLimit',
        message: '历史记录保存条数:',
        default: currentConfig.historyLimit,
        when: (answers) => answers.saveHistory,
        validate: (input: number) => input > 0 || '必须大于0'
      }
    ]);

    await configManager.updateChatConfig(answers);
    printSuccess('聊天参数已更新');
  });

// 测试连接
configCommand
  .command('test')
  .description('测试平台连接')
  .argument('[provider]', '平台名称（可选，不传则测试所有已配置平台）')
  .action(async (provider?: string) => {
    await configManager.init();

    printHeader();
    printSection('测试平台连接');

    const { createProvider } = await import('../providers/index.js');

    const testProvider = async (type: ProviderType) => {
      const info = PROVIDER_INFO[type];
      const config = configManager.getProviderConfig(type);

      if (!config.apiKey && info.requiresApiKey) {
        console.log(chalk.gray(`  ⏭️  ${info.displayName} - 跳过（未配置API密钥）`));
        return;
      }

      process.stdout.write(`  🔄 测试 ${info.displayName}... `);

      try {
        const provider = createProvider(type, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          timeout: config.timeout,
          maxRetries: config.maxRetries,
        });
        const isAvailable = await provider.isAvailable();

        if (isAvailable) {
          console.log(chalk.green('✓ 连接成功'));
        } else {
          console.log(chalk.red('✗ 连接失败'));
        }
      } catch (error) {
        console.log(chalk.red(`✗ 错误: ${error}`));
      }
    };

    if (provider) {
      if (!PROVIDER_TYPE_LIST.includes(provider as ProviderType)) {
        printError(`未知的平台: ${provider}`);
        return;
      }
      await testProvider(provider as ProviderType);
    } else {
      // 测试所有已配置的平台
      for (const type of PROVIDER_TYPE_LIST) {
        await testProvider(type);
      }
    }

    console.log();
  });

// 初始化配置向导
configCommand
  .command('init')
  .description('交互式初始化配置')
  .action(async () => {
    await configManager.init();

    printHeader();
    printSection('初始化配置向导');

    printInfo('本向导将帮助您配置 DevFlow Agent\n');

    // 选择要配置的平台
    const { providers } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'providers',
      message: '选择要配置的平台（可多选）:',
      choices: PROVIDER_TYPE_LIST.map(type => ({
        name: `${PROVIDER_INFO[type].displayName} (${type})`,
        value: type,
        checked: !!configManager.getApiKey(type)
      }))
    }]);

    // 为每个选中的平台配置API密钥
    for (const type of providers as ProviderType[]) {
      const info = PROVIDER_INFO[type];
      const currentKey = configManager.getApiKey(type);

      console.log(chalk.bold(`\n  🔧 配置 ${info.displayName}`));

      if (currentKey) {
        const { update } = await inquirer.prompt([{
          type: 'confirm',
          name: 'update',
          message: '已配置API密钥，是否更新?',
          default: false
        }]);

        if (!update) continue;
      }

      const { apiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: `请输入 ${info.displayName} API密钥:`,
        mask: '*',
        validate: (input: string) => input.trim() !== '' || 'API密钥不能为空'
      }]);

      await configManager.setApiKey(type, apiKey);
      printSuccess(`${info.displayName} API密钥已保存`);
    }

    // 设置默认平台
    const configuredProviders = PROVIDER_TYPE_LIST.filter(type => 
      configManager.getApiKey(type)
    );

    if (configuredProviders.length > 0) {
      const { defaultProvider } = await inquirer.prompt([{
        type: 'list',
        name: 'defaultProvider',
        message: '选择默认平台:',
        choices: [
          { name: '不设置', value: null },
          ...configuredProviders.map(type => ({
            name: PROVIDER_INFO[type].displayName,
            value: type
          }))
        ]
      }]);

      if (defaultProvider) {
        await configManager.setDefaultProvider(defaultProvider as ProviderType);
        printSuccess(`默认平台已设置为: ${PROVIDER_INFO[defaultProvider as ProviderType].displayName}`);
      }
    }

    printSuccess('\n配置完成！');
    printInfo('使用 devflow config list 查看当前配置');
    printInfo('使用 devflow config test 测试连接');
  });

// 设置记忆参数
configCommand
  .command('set-memory')
  .description('设置记忆系统参数')
  .option('--enabled', '总开关：是否记录对话记忆')
  .option('--auto-recall', '是否自动召回记忆注入对话上下文')
  .option('--rag', '启用 RAG 向量检索（消耗 embedding API 额度）')
  .option('--graph', '启用记忆图谱')
  .option('--knowledge', '启用知识图谱自动提取')
  .option('--max <n>', '最大记忆条数')
  .action(async (options: {
    enabled?: string; autoRecall?: string; rag?: string;
    graph?: string; knowledge?: string; max?: string;
  }) => {
    await configManager.init();
    const current = configManager.getMemoryConfig();

    const hasCliArgs = options.enabled || options.autoRecall || options.rag ||
                       options.graph || options.knowledge || options.max;

    if (hasCliArgs) {
      const updates: Record<string, any> = {};
      if (options.enabled !== undefined) updates.enabled = options.enabled === 'true';
      if (options.autoRecall !== undefined) updates.autoRecall = options.autoRecall === 'true';
      if (options.rag !== undefined) updates.ragEnabled = options.rag === 'true';
      if (options.graph !== undefined) updates.graphEnabled = options.graph === 'true';
      if (options.knowledge !== undefined) updates.knowledgeEnabled = options.knowledge === 'true';
      if (options.max !== undefined) updates.maxMemories = parseInt(options.max, 10) || 10000;

      await configManager.updateMemoryConfig(updates);
      printSuccess('记忆参数已更新');

      const updated = configManager.getMemoryConfig();
      console.log(chalk.gray(`  记忆总开关: ${updated.enabled ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  自动召回: ${updated.autoRecall ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  RAG 向量检索: ${updated.ragEnabled ? '⚠ 开启（消耗额度）' : '✗ 关闭'}`));
      console.log(chalk.gray(`  记忆图谱: ${updated.graphEnabled ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  知识图谱: ${updated.knowledgeEnabled ? '✓ 开启' : '✗ 关闭'}`));
      console.log(chalk.gray(`  最大记忆条数: ${updated.maxMemories}`));
      return;
    }

    // 交互式模式
    if (!process.stdin.isTTY) {
      printError('非交互模式请使用 --enabled/--rag 等参数');
      return;
    }

    printHeader();
    printSection('设置记忆参数');

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enabled',
        message: '启用对话记忆（记住每次对话）:',
        default: current.enabled,
      },
      {
        type: 'confirm',
        name: 'autoRecall',
        message: '自动召回记忆（对话时注入相关记忆上下文）:',
        default: current.autoRecall,
        when: (a: any) => a.enabled,
      },
      {
        type: 'confirm',
        name: 'ragEnabled',
        message: '启用 RAG 向量检索（⚠ 消耗 embedding API 额度）:',
        default: current.ragEnabled,
      },
      {
        type: 'confirm',
        name: 'graphEnabled',
        message: '启用记忆图谱（关联记忆节点）:',
        default: current.graphEnabled,
      },
      {
        type: 'confirm',
        name: 'knowledgeEnabled',
        message: '启用知识图谱（自动提取实体和关系）:',
        default: current.knowledgeEnabled,
      },
      {
        type: 'number',
        name: 'maxMemories',
        message: '最大记忆条数:',
        default: current.maxMemories,
        validate: (input: number) => input > 0 || '必须大于0',
      },
    ]);

    await configManager.updateMemoryConfig(answers);
    printSuccess('记忆参数已更新');
  });

// 查看记忆参数
configCommand
  .command('get-memory')
  .description('查看当前记忆参数')
  .action(async () => {
    await configManager.init();
    const mc = configManager.getMemoryConfig();

    printSection('记忆系统配置');
    printKeyValue([
      { key: '记忆总开关', value: mc.enabled ? '✓ 开启' : '✗ 关闭', highlight: mc.enabled },
      { key: '自动召回', value: mc.autoRecall ? '✓ 开启' : '✗ 关闭', highlight: mc.autoRecall },
      { key: 'RAG 向量检索', value: mc.ragEnabled ? '⚠ 开启（消耗额度）' : '✗ 关闭', highlight: false },
      { key: '记忆图谱', value: mc.graphEnabled ? '✓ 开启' : '✗ 关闭', highlight: mc.graphEnabled },
      { key: '知识图谱', value: mc.knowledgeEnabled ? '✓ 开启' : '✗ 关闭', highlight: mc.knowledgeEnabled },
      { key: '最大记忆条数', value: String(mc.maxMemories) },
    ]);
    console.log();
  });

// 设置沙盒权限级别
configCommand
  .command('set-sandbox')
  .description('设置沙盒权限级别')
  .argument('[level]', '权限级别 (minimal|conservative|balanced|relaxed|extreme)')
  .action(async (level?: string) => {
    await configManager.init();

    if (level) {
      const validLevels: SandboxLevel[] = ['minimal', 'conservative', 'balanced', 'relaxed', 'extreme'];
      if (!validLevels.includes(level as SandboxLevel)) {
        printError(`无效的权限级别: ${level}`);
        console.log(chalk.gray(`  可选级别: ${validLevels.join(', ')}`));
        console.log(chalk.gray(`  使用 devflow config sandbox-levels 查看详细对比`));
        return;
      }

      await configManager.setSandboxLevel(level as SandboxLevel);
      const perms = SANDBOX_PERMISSIONS[level as SandboxLevel];
      printSuccess(`沙盒权限已设置为: ${level}`);
      console.log(chalk.gray(`  ${perms.description}`));
      return;
    }

    // 交互式选择
    if (!process.stdin.isTTY) {
      printError('非交互模式请指定级别: devflow config set-sandbox <level>');
      console.log(chalk.gray(`  可选级别: minimal, conservative, balanced, relaxed, extreme`));
      return;
    }

    const currentLevel = configManager.getSandboxConfig().level;

    printHeader();
    printSection('设置沙盒权限级别');

    console.log(chalk.gray('  ⚠️  警告: 更高级别的权限意味着更高的风险\n'));

    const choices = [
      {
        name: '🔒 极小权限 (minimal)',
        value: 'minimal',
        description: '仅允许读取操作，无法删除或修改文件',
      },
      {
        name: '🛡️ 保守权限 (conservative)',
        value: 'conservative',
        description: '允许基本文件操作，需要确认危险操作',
      },
      {
        name: '⚖️ 平衡权限 (balanced)',
        value: 'balanced',
        description: '允许常规开发操作，自动备份危险操作（推荐）',
      },
      {
        name: '🔓 宽松权限 (relaxed)',
        value: 'relaxed',
        description: '允许更多操作，信任用户判断',
      },
      {
        name: '⚡ 极端权限 (extreme)',
        value: 'extreme',
        description: '几乎无限制，谨慎使用',
      },
    ];

    const answers = await inquirer.prompt([{
      type: 'list',
      name: 'level',
      message: '选择沙盒权限级别:',
      default: currentLevel,
      choices,
    }]);

    await configManager.setSandboxLevel(answers.level as SandboxLevel);
    const perms = SANDBOX_PERMISSIONS[answers.level as SandboxLevel];
    printSuccess(`沙盒权限已设置为: ${answers.level}`);
    console.log(chalk.gray(`  ${perms.description}`));

    // 如果选择了宽松或极端权限，显示警告
    if (answers.level === 'relaxed' || answers.level === 'extreme') {
      console.log();
      printWarning('⚠️  已选择较高权限级别，请确保您信任正在执行的操作');
      console.log(chalk.gray('  建议仅在必要时使用，并在完成后恢复为平衡权限'));
    }
  });

// 查看沙盒权限级别详细信息
configCommand
  .command('sandbox-levels')
  .alias('sandbox-info')
  .description('查看所有沙盒权限级别的详细信息')
  .action(async () => {
    await configManager.init();
    const currentLevel = configManager.getSandboxConfig().level;

    printHeader();
    printSection('沙盒权限级别对比');

    const levels: SandboxLevel[] = ['minimal', 'conservative', 'balanced', 'relaxed', 'extreme'];
    const head = ['级别', '删除', '系统修改', '网络', '执行', '风险'];
    const rows = levels.map(level => {
      const perms = SANDBOX_PERMISSIONS[level];
      const riskLabel = {
        minimal: chalk.green('极低'),
        conservative: chalk.green('低'),
        balanced: chalk.yellow('中'),
        relaxed: chalk.red('高'),
        extreme: chalk.red('极高'),
      }[level];

      return [
        level === currentLevel ? `★ ${level}` : level,
        perms.allowDelete ? '✓' : '✗',
        perms.allowSystemModify ? '✓' : '✗',
        perms.allowNetwork ? '✓' : '✗',
        perms.allowExec ? '✓' : '✗',
        riskLabel,
      ];
    });

    printTable({ title: '当前级别:', head, rows });

    console.log();
    printSection('级别说明');
    levels.forEach(level => {
      const perms = SANDBOX_PERMISSIONS[level];
      const icon = {
        minimal: '🔒',
        conservative: '🛡️',
        balanced: '⚖️',
        relaxed: '🔓',
        extreme: '⚡',
      }[level];

      const status = level === currentLevel ? ` ${chalk.green('← 当前')} ` : '';
      console.log(`  ${icon} ${chalk.bold(level)}${status}`);
      console.log(`     ${perms.description}`);
      console.log();
    });

    console.log(chalk.gray('  使用 devflow config set-sandbox <level> 更改权限级别'));
    console.log();
  });

// 查看当前沙盒配置
configCommand
  .command('get-sandbox')
  .description('查看当前沙盒配置')
  .action(async () => {
    await configManager.init();
    const sandbox = configManager.getSandboxConfig();
    const perms = configManager.getSandboxPermissions();

    printSection('沙盒权限配置');
    printKeyValue([
      { key: '权限级别', value: sandbox.level, highlight: true },
      { key: '描述', value: perms.description },
      { key: '允许删除', value: perms.allowDelete ? '✓' : '✗' },
      { key: '允许系统修改', value: perms.allowSystemModify ? '✓' : '✗' },
      { key: '允许网络', value: perms.allowNetwork ? '✓' : '✗' },
      { key: '允许执行', value: perms.allowExec ? '✓' : '✗' },
      { key: '风险确认', value: sandbox.confirmOnRisk ? '✓ 开启' : '✗ 关闭' },
    ]);

    console.log();
    console.log(chalk.gray(`  最大文件大小: ${formatBytes(perms.maxFileSize)}`));

    const riskLabel = {
      minimal: chalk.green('极低'),
      conservative: chalk.green('低'),
      balanced: chalk.yellow('中'),
      relaxed: chalk.red('高'),
      extreme: chalk.red('极高'),
    }[sandbox.level];
    console.log(chalk.gray(`  风险等级: ${riskLabel}`));
    console.log();
  });

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export { configCommand };
