import { Command, Option } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../config/manager.js';
import { createProvider } from '../providers/index.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning, createSpinner } from '../ui/logo.js';
import { printTable, printBadge } from '../ui/display.js';
import { memoryManager } from '../memory/manager.js';
import { interactiveHelp } from '../ui/help.js';

const chatCommand = new Command('chat')
  .description('与 AI 对话');

// ==================== 公共函数 ====================

/** 解析平台：从选项或默认配置中确定使用哪个平台 */
function resolveProvider(options: { provider?: string }): ProviderType | null {
  if (options.provider) {
    if (!PROVIDER_TYPE_LIST.includes(options.provider as ProviderType)) {
      printError(`未知的平台: ${options.provider}`);
      return null;
    }
    return options.provider as ProviderType;
  }
  const defaultProvider = configManager.getDefaultProvider();
  if (!defaultProvider) {
    printError('未设置默认平台，请使用 --provider 指定');
    return null;
  }
  return defaultProvider;
}

/** 检查 API Key 是否已配置，未配置则打印错误并返回 false */
function checkApiKey(providerType: ProviderType): boolean {
  const providerConfig = configManager.getProviderConfig(providerType);
  if (!providerConfig.apiKey && PROVIDER_INFO[providerType].requiresApiKey) {
    printError(`${PROVIDER_INFO[providerType].displayName} 需要配置API密钥`);
    printInfo(`运行: devflow config set-key ${providerType} <apiKey>`);
    return false;
  }
  return true;
}

/** 创建 provider 实例 */
function createProviderInstance(providerType: ProviderType, timeout = 30000, maxRetries = 2) {
  const providerConfig = configManager.getProviderConfig(providerType);
  return createProvider(providerType, {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    timeout,
    maxRetries,
  });
}

/** 获取聊天配置（缓存单次调用） */
function getChatParams() {
  const chatConfig = configManager.getChatConfig();
  return {
    temperature: chatConfig.defaultTemperature,
    maxTokens: chatConfig.defaultMaxTokens,
    historyLimit: chatConfig.historyLimit,
  };
}

// ==================== chat start ====================

chatCommand
  .command('start')
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

// ==================== chat ask ====================

chatCommand
  .command('ask')
  .alias('a')
  .description('快速提问（单轮对话）')
  .argument('<message>', '问题内容')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-m, --model <model>', '指定模型（支持模糊匹配）')
  .option('-s, --stream', '使用流式输出（默认开启）', true)
  .option('--no-stream', '禁用流式输出，等待完整响应')
  .option('-f, --fallback', '启用自动切换：模型失败时自动尝试下一个模型', false)
  .option('--fallback-order <models>', '自定义切换顺序（逗号分隔的模型ID）')
  .action(async (message: string, options: { provider?: string; model?: string; stream?: boolean; fallback?: boolean; fallbackOrder?: string }) => {
    await configManager.init();

    const providerType = resolveProvider(options);
    if (!providerType) return;
    if (!checkApiKey(providerType)) return;

    const provider = createProviderInstance(providerType);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    const memoryConfig = configManager.getMemoryConfig();

    // 从记忆中召回相关内容，注入 system prompt（需要配置开启）
    if (memoryConfig.enabled && memoryConfig.autoRecall) {
      const memoryResults = await memoryManager.recall(message, 5);
      if (memoryResults.length > 0) {
        const memoryContext = memoryResults.map(r =>
          `[${new Date(r.interaction.timestamp).toLocaleString('zh-CN')}]\n用户: ${r.interaction.input}\nAI: ${r.interaction.output.slice(0, 300)}`
        ).join('\n---\n');
        messages.push({
          role: 'system',
          content: `以下是用户之前与你的对话记忆，请参考这些上下文来回答当前问题：\n\n${memoryContext}\n\n请基于以上记忆上下文回答用户的新问题。如果用户问到了之前提过的信息（如名字、偏好等），请直接使用记忆中的信息。`,
        });
      }
    }

    messages.push({ role: 'user', content: message });

    const platformModels = PROVIDER_INFO[providerType].models;
    const chatParams = getChatParams();
    const enableFallback = options.fallback || options.fallbackOrder;

    // 确定模型列表
    let modelList: string[];
    if (options.fallbackOrder) {
      modelList = options.fallbackOrder.split(',').map(m => m.trim());
    } else if (options.model) {
      const spinner = createSpinner(`搜索模型 "${options.model}"...`);
      const result = await provider.findModel(options.model);
      if (spinner) spinner.stop();

      if (result.exact) {
        if (result.exact !== options.model) {
          printInfo(`已匹配: ${options.model} → ${result.exact}`);
        }
        modelList = [result.exact];
      } else if (result.candidates.length > 0) {
        printWarning(`未找到精确匹配 "${options.model}"，找到 ${result.candidates.length} 个相似模型:`);
        result.candidates.forEach((c, i) => console.log(chalk.gray(`  ${i + 1}. ${c}`)));
        printInfo(`使用第一个: ${result.candidates[0]}，或用 --model 指定完整ID`);
        modelList = [result.candidates[0]];
      } else {
        printWarning(`平台未找到模型 "${options.model}"，将直接尝试调用`);
        printInfo('如果调用失败，可以用 devflow chat search <关键词> 搜索可用模型');
        modelList = [options.model];
      }
    } else {
      const providerConfig = configManager.getProviderConfig(providerType);
      modelList = [providerConfig.defaultModel || platformModels[0]?.id];
    }

    // fallback：添加备用模型
    if (enableFallback && modelList.length === 1) {
      const currentModel = modelList[0];
      const fallbackModels = platformModels
        .filter(m => m.id !== currentModel)
        .sort((a, b) => a.pricing.inputPerMillion - b.pricing.inputPerMillion)
        .map(m => m.id);
      modelList = [currentModel, ...fallbackModels];
    }

    // 尝试调用
    const errors: string[] = [];

    for (let i = 0; i < modelList.length; i++) {
      const modelId = modelList[i];
      const modelInfo = platformModels.find(m => m.id === modelId);

      if (i > 0) {
        printWarning(`模型 ${modelList[i - 1]} 失败，尝试切换到: ${modelInfo?.name || modelId}`);
      }

      if (options.stream) {
        if (i === 0) {
          process.stdout.write(chalk.green('AI: '));
        } else {
          process.stdout.write(chalk.green(`\nAI [${modelInfo?.name || modelId}]: `));
        }

        try {
          const stream = provider.stream({
            messages,
            model: modelId,
            temperature: chatParams.temperature,
            maxTokens: chatParams.maxTokens,
          });
          for await (const chunk of stream) {
            if (!chunk.done) process.stdout.write(chunk.content);
          }
          console.log('\n');
          return;
        } catch (error: any) {
          console.log();
          errors.push(`${modelId}: ${error.message || error}`);
          if (!enableFallback || i === modelList.length - 1) {
            printError(`请求失败: ${error}`);
            return;
          }
        }
      } else {
        const spinner = createSpinner(`AI思考中 [${modelInfo?.name || modelId}]...`);
        try {
          const response = await provider.chat({
            messages,
            model: modelId,
            temperature: chatParams.temperature,
            maxTokens: chatParams.maxTokens,
          });

          if (spinner) spinner.stop();

          console.log(chalk.green(`\nAI [${modelInfo?.name || modelId}]:`));
          console.log(response.content);

          if (response.usage) {
            console.log(chalk.gray(
              `\n>> Token：${response.usage.totalTokens} ` +
              `| 成本：$${response.cost?.totalCost.toFixed(4) || '0.0000'}`
            ));
          }
          if (i > 0) {
            console.log(chalk.gray(`\n💡 提示: 使用 --model ${modelId} 可直接指定此模型`));
          }

          // 静默保存到记忆（需要配置开启）
          if (memoryConfig.enabled) {
            memoryManager.rememberChat({
              input: message,
              output: response.content,
              provider: providerType,
              model: modelId,
            }).catch(() => {}); // 不阻塞主流程
          }

          return;
        } catch (error: any) {
          if (spinner) spinner.stop();
          errors.push(`${modelId}: ${error.message || error}`);
          if (!enableFallback || i === modelList.length - 1) {
            printError(`请求失败: ${error}`);
            if (errors.length > 1) {
              console.log(chalk.gray('\n尝试过的模型:'));
              errors.forEach((e, idx) => console.log(chalk.gray(`  ${idx + 1}. ${e}`)));
            }
            return;
          }
        }
      }
    }
  });

// ==================== chat models ====================

chatCommand
  .command('models')
  .alias('m')
  .description('列出平台所有可用模型')
  .option('-p, --provider <provider>', '指定AI平台')
  .addOption(new Option('--sort <field>', '排序字段').choices(['price', 'name', 'context']).default('price'))
  .action(async (options: { provider?: string; sort: string }) => {
    await configManager.init();

    const providerType = resolveProvider(options);
    if (!providerType) return;

    const info = PROVIDER_INFO[providerType];
    let models = [...info.models];

    switch (options.sort) {
      case 'price': models.sort((a, b) => a.pricing.inputPerMillion - b.pricing.inputPerMillion); break;
      case 'name': models.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'context': models.sort((a, b) => b.contextWindow - a.contextWindow); break;
    }

    printHeader();
    printSection(`${info.displayName} 模型列表 (${models.length} 个)`);

    const head = ['模型 ID', '名称', '输入$/M', '输出$/M', '上下文', '能力'];
    const rows = models.map(model => {
      const capabilities = [
        model.capabilities.thinking ? 'T' : '',
        model.capabilities.vision ? 'V' : '',
        model.capabilities.tools ? 'X' : '',
        model.capabilities.audio ? 'A' : '',
      ].filter(Boolean).join(' ');
      return [
        model.id,
        model.name,
        '$' + model.pricing.inputPerMillion.toFixed(1),
        '$' + model.pricing.outputPerMillion.toFixed(1),
        formatContext(model.contextWindow),
        capabilities,
      ];
    });

    printTable({ title: `${info.displayName} · ${models.length} 个模型`, head, rows });

    console.log(chalk.gray('  图例: T=思考链 V=视觉 X=工具调用 A=语音'));
    console.log();
  });

// ==================== chat search ====================

chatCommand
  .command('search')
  .alias('find')
  .description('搜索平台可用模型（从API实时拉取）')
  .argument('<keyword>', '搜索关键词')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-l, --limit <n>', '显示数量', '20')
  .action(async (keyword: string, options: { provider?: string; limit: string }) => {
    await configManager.init();

    const providerType = resolveProvider(options);
    if (!providerType) return;
    if (!checkApiKey(providerType)) return;

    const provider = createProviderInstance(providerType, 10000, 0);

    printHeader();
    printSection(`搜索 "${keyword}" - ${PROVIDER_INFO[providerType].displayName}`);

    const spinner = createSpinner('从平台拉取模型列表...');
    const results = await provider.searchModels(keyword);
    if (spinner) spinner.stop();

    const limit = parseInt(options.limit, 10) || 20;

    if (results.length === 0) {
      printError(`未找到匹配 "${keyword}" 的模型`);
      return;
    }

    printSuccess(`找到 ${results.length} 个匹配模型${results.length > limit ? ` (显示前 ${limit} 个)` : ''}\n`);

    results.slice(0, limit).forEach(id => {
      const builtin = PROVIDER_INFO[providerType].models.find(m => m.id === id);
      const tag = builtin ? chalk.green(' ✓') : '';
      const price = builtin ? chalk.gray(` ¥${builtin.pricing.inputPerMillion}/${builtin.pricing.outputPerMillion}/M`) : '';
      console.log(`  ${chalk.cyan(id)}${tag}${price}`);
    });

    console.log();
    printInfo(`使用: devflow chat ask "你的问题" -m <模型ID>`);
    console.log();
  });

// ==================== chat remote-models ====================

chatCommand
  .command('remote-models')
  .alias('rm')
  .description('列出平台所有远程模型（从API实时拉取）')
  .option('-p, --provider <provider>', '指定AI平台')
  .option('-l, --limit <n>', '显示数量', '50')
  .option('--filter <keyword>', '过滤关键词')
  .action(async (options: { provider?: string; limit: string; filter?: string }) => {
    await configManager.init();

    const providerType = resolveProvider(options);
    if (!providerType) return;
    if (!checkApiKey(providerType)) return;

    const provider = createProviderInstance(providerType, 10000, 0);

    printHeader();
    printSection(`${PROVIDER_INFO[providerType].displayName} 远程模型列表`);

    const spinner = createSpinner('从平台拉取模型列表...');
    let models = await provider.listRemoteModels();
    if (spinner) spinner.stop();

    if (options.filter) {
      const lower = options.filter.toLowerCase();
      models = models.filter(id => id.toLowerCase().includes(lower));
    }

    const limit = parseInt(options.limit, 10) || 50;

    printSuccess(`共 ${models.length} 个模型${options.filter ? ` (过滤: ${options.filter})` : ''}${models.length > limit ? ` (显示前 ${limit} 个)` : ''}\n`);

    models.slice(0, limit).forEach(id => {
      const builtin = PROVIDER_INFO[providerType].models.find(m => m.id === id);
      const tag = builtin ? chalk.green(' ✓') : '';
      console.log(`  ${chalk.cyan(id)}${tag}`);
    });

    if (models.length > limit) {
      console.log(chalk.gray(`  ... 还有 ${models.length - limit} 个，使用 --limit 增加显示数量`));
    }

    console.log();
    printInfo(`搜索: devflow chat search <关键词>`);
    console.log();
  });

function formatContext(tokens: number): string {
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
  if (tokens >= 1000) return (tokens / 1000).toFixed(0) + 'K';
  return String(tokens);
}

export { chatCommand };
