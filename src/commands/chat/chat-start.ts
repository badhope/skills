import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printHeader, printSection, printSuccess, printError, printInfo } from '../../ui/logo.js';
import { interactiveHelp } from '../../ui/help.js';
import { memoryManager } from '../../memory/manager.js';
import { checkApiKey, createProviderInstance, getChatParams } from './helpers.js';
import { executeSlashCommand } from '../slash-commands.js';
import { PersonalityManager } from '../../agent/personality.js';
import { EmotionalStateManager } from '../../agent/emotional-state.js';

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
    const memoryConfig = configManager.getMemoryConfig();

    // 初始化人格和情绪系统
    const personalityManager = new PersonalityManager();
    const emotionalState = new EmotionalStateManager();
    await personalityManager.load();
    personalityManager.incrementInteractions();

    // 注入人格 system prompt
    const personalityPrompt = personalityManager.getPersonalityPrompt();
    const commGuidance = personalityManager.getCommunicationGuidance();
    const codeGuidance = personalityManager.getCodeStyleGuidance();
    if (personalityPrompt) {
      messages.push({
        role: 'system',
        content: `${personalityPrompt}\n\n沟通风格指导: ${commGuidance}\n代码风格指导: ${codeGuidance}`,
      });
    }

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

      // 处理斜杠命令
      if (userInput.startsWith('/')) {
        const result = await executeSlashCommand(userInput, {
          args: '',
          messages,
          modelId,
          providerType,
          setModel: (newModel: string) => { modelId = newModel; },
          setProvider: () => {},
        });
        if (result) {
          if (result.message) console.log(result.message);
          if (result.exit) {
            printSuccess('对话已结束');
            break;
          }
          continue;
        }
      }

      // 从记忆中召回相关内容，注入 system prompt（需要配置开启）
      if (memoryConfig.enabled && memoryConfig.autoRecall) {
        const memoryResults = await memoryManager.recall(userInput, 5);
        if (memoryResults.length > 0) {
          const memoryContext = memoryResults.map(r =>
            `[${new Date(r.interaction.timestamp).toLocaleString('zh-CN')}]\n用户: ${r.interaction.input}\nAI: ${r.interaction.output.slice(0, 300)}`
          ).join('\n---\n');
          // 移除上一轮注入的记忆 system message（如果存在），避免重复累积
          const memorySysIdx = messages.findIndex(m => m.role === 'system' && m.content.startsWith('以下是用户之前与你的对话记忆'));
          if (memorySysIdx !== -1) {
            messages.splice(memorySysIdx, 1);
          }
          messages.push({
            role: 'system',
            content: `以下是用户之前与你的对话记忆，请参考这些上下文来回答当前问题：\n\n${memoryContext}\n\n请基于以上记忆上下文回答用户的新问题。如果用户问到了之前提过的信息（如名字、偏好等），请直接使用记忆中的信息。`,
          });
        }
      }

      messages.push({ role: 'user', content: userInput });

      // 检测用户情绪信号，更新情绪状态
      if (/谢谢|感谢|厉害|不错|好的|很好|棒|perfect|great|thanks/i.test(userInput)) {
        emotionalState.onUserPraise(userInput);
      } else if (/不对|错了|不是这样|纠正|修正|wrong|incorrect/i.test(userInput)) {
        emotionalState.onUserCorrection(userInput);
      } else if (/新|挑战|试试|尝试|从零|novel|challenge/i.test(userInput)) {
        emotionalState.onNewChallenge(userInput);
      }

      // 情绪衰减
      emotionalState.decay();

      // 注入当前情绪上下文
      const emotionalContext = emotionalState.getEmotionalContext();
      if (emotionalContext) {
        // 移除上一轮注入的情绪 system message（避免重复累积）
        const emotionSysIdx = messages.findIndex(m => m.role === 'system' && m.content.startsWith('[当前情绪状态]'));
        if (emotionSysIdx !== -1) {
          messages.splice(emotionSysIdx, 1);
        }
        messages.push({ role: 'system', content: emotionalContext });
      }

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

        // 自动压缩检查：如果消息过多，尝试 AI 压缩
        if (messages.length > chatParams.historyLimit * 2) {
          try {
            const { CompressionService } = await import('../../services/compression-service.js');
            const adapterFactory = {
              getDefaultProvider: () => provider,
              getProvider: () => provider,
              listAvailableProviders: () => [providerType],
              isProviderAvailable: () => true,
            };
            const compressionService = new CompressionService(
              adapterFactory as any,
              configManager as any
            );

            if (compressionService.shouldCompress(messages)) {
              const nonSystemMessages = messages.filter(m => m.role !== 'system');
              const result = await compressionService.compressMessages(nonSystemMessages);

              if (result.summary) {
                const systemMsgs = messages.filter(m => m.role === 'system');
                const recentMsgs = messages.filter(m => m.role !== 'system').slice(-4);
                messages.length = 0;
                messages.push(...systemMsgs);
                messages.push({
                  role: 'system',
                  content: `[对话历史摘要]\n${result.summary}`,
                });
                messages.push(...recentMsgs);
                console.log(chalk.dim(
                  `\n  对话已自动压缩 (${result.originalMessages}条→${messages.length}条, 节省~${result.tokensSaved} tokens)\n`
                ));
              }
            }
          } catch {
            // 自动压缩失败，回退到简单截断
            messages.splice(0, 2);
          }
        }

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

    // 对话结束，保存人格状态
    await personalityManager.save().catch(() => {});
  });
