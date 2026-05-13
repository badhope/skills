import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../../ui/logo.js';

export const providerCommand = new Command('provider')
  .description('AI平台密钥与连接管理');

// 设置API密钥
providerCommand
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
providerCommand
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
providerCommand
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

// 测试连接
providerCommand
  .command('test')
  .description('测试平台连接')
  .argument('[provider]', '平台名称（可选，不传则测试所有已配置平台）')
  .action(async (provider?: string) => {
    await configManager.init();

    printHeader();
    printSection('测试平台连接');

    const { createProvider } = await import('../../providers/index.js');

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
