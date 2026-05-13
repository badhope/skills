import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../../ui/logo.js';
import { interactiveHelp } from '../../ui/help.js';
import { memoryManager } from '../../memory/manager.js';
import { checkApiKey, createProviderInstance, getChatParams } from './helpers.js';

export const chatStartCommand = new Command('start')
  .alias('s')
  .description('开始新的对话')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-m, --model <model>', '指定模型')
  .action(async (options: { provider?: string; model?: string }) => {
    await configManager.init();
    printHeader();
    printSection('开始对话');

    // 确定平台
    let providerType: ProviderType;
    if (options.provider) {
      if (!PROVIDER_TYPE_LIST.includes(options.provider as ProviderType)) {
        printError(`未知的平台: ${options.provider}`);
        return;
      }
      providerType = options.provider as ProviderType;
    } else {
      const defaultProvider = configManager.getDefaultProvider();
      const configuredProviders = PROVIDER_TYPE_LIST.filter(type =>
        !PROVIDER_INFO[type].requiresApiKey || configManager.getApiKey(type)
      );

      if (configuredProviders.length === 0) {
        printError('没有已配置的平台');
        printInfo('请先运行: devflow config init');
        return;
      }

      if (defaultProvider && configuredProviders.includes(defaultProvider)) {
        providerType = defaultProvider;
        printInfo(`使用默认平台: ${PROVIDER_INFO[providerType].displayName}`);
      } else if (process.stdin.isTTY) {
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'provider',
          message: '选择AI平台:',
          choices: configuredProviders.map(type => ({
            name: `${PROVIDER_INFO[type].displayName} (${type})`,
            value: type
          }))
        }]);
        providerType = answer.provider;
      } else {
        printError('未设置默认平台，请使用 --provider 指定平台');
        return;
      }
    }

    if (!checkApiKey(providerType)) return;

    const providerConfig = configManager.getProviderConfig(providerType);
    const info = PROVIDER_INFO[providerType];

    // 确定模型
    let modelId = options.model || providerConfig.defaultModel || info.models[0]?.id || 'unknown';
    if (!modelId) {
      const defaultModel = providerConfig.defaultModel || info.models[0]?.id;
      if (!process.stdin.isTTY) {
        modelId = defaultModel;
      } else {
        const { model } = await inquirer.prompt([{
          type: 'list',
          name: 'model',
          message: '选择模型:',
          default: defaultModel,
          choices: info.models.map(m => ({
            name: `${m.name} ($${m.pricing.inputPerMillion}/M tokens)`,
            value: m.id
          }))
        }]);
        modelId = model;
      }
    }

    printSuccess(`使用 ${info.displayName} / ${modelId}`);
    console.log(chalk.gray('  输入 /help 查看命令，输入 /exit 退出对话\n'));

    const provider = createProviderInstance(providerType);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    const chatParams = getChatParams();

    // 对话循环
    while (true) {
      if (!process.stdin.isTTY) {
        printInfo('非交互模式，请使用 chat ask 命令');
        return;
      }

      const { input } = await inquirer.prompt([{
        type: 'input',
        name: 'input',
        message: chalk.cyan('你:'),
        validate: (v: string) => v.trim() !== '' || '请输入内容'
      }]);

      const userInput = input.trim();

      // 处理命令
      if (userInput.startsWith('/')) {
        const cmd = userInput.slice(1).toLowerCase();
        if (cmd === 'exit' || cmd === 'quit') {
          printSuccess('对话已结束');
          break;
        } else if (cmd === 'help') {
          await interactiveHelp();
          continue;
        } else if (cmd === 'clear') {
          messages.length = 0;
          printSuccess('对话历史已清空');
          continue;
        } else if (cmd === 'model') {
          const { model } = await inquirer.prompt([{
            type: 'list',
            name: 'model',
            message: '选择新模型:',
            choices: info.models.map(m => ({
              name: `${m.name} ($${m.pricing.inputPerMillion}/M tokens)`,
              value: m.id
            }))
          }]);
          modelId = model;
          printSuccess(`已切换到模型: ${modelId}`);
          continue;
        }
      }

      messages.push({ role: 'user', content: userInput });

      try {
        process.stdout.write(chalk.green('  AI: '));
        let fullContent = '';

        const stream = provider.stream({
          messages,
          model: modelId,
          temperature: chatParams.temperature,
          maxTokens: chatParams.maxTokens,
        });

        for await (const chunk of stream) {
          if (chunk.done) break;
          if (chunk.content) {
            process.stdout.write(chunk.content);
            fullContent += chunk.content;
          }
        }

        console.log('\n');

        messages.push({ role: 'assistant', content: fullContent });
        if (messages.length > chatParams.historyLimit * 2) {
          messages.splice(0, 2);
        }

        const memoryConfig = configManager.getMemoryConfig();
        if (memoryConfig.enabled) {
          memoryManager.rememberChat({
            input: userInput,
            output: fullContent,
            provider: providerType,
            model: modelId,
          }).catch(() => {});
        }
      } catch (error: any) {
        const errMsg = error?.message || String(error);
        printError(`\n  请求失败: ${errMsg}`);
        if (errMsg.includes('401')) printInfo('  API Key 可能无效，请运行: devflow config set-key <平台> <apiKey>');
        else if (errMsg.includes('429')) printInfo('  请求频率过高，请稍后重试');
        else if (errMsg.includes('timeout')) printInfo('  请求超时，请检查网络');
        messages.pop();
        console.log();
      }
    }
  });
