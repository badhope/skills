import { spawn } from 'child_process';
import { configManager } from '../config/manager.js';
import { printSuccess, printInfo, printError } from './logo.js';
import { interactiveHelp } from './help.js';
import { createProvider } from '../providers/index.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../types.js';
import { memoryManager } from '../memory/manager.js';
import { listTools, toolRegistry } from '../tools/registry.js';
import { waitForEnter as pause } from '../utils/io.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

/**
 * 运行子命令
 */
function runSubCommand(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const cliPath = process.argv[1];
    const child = spawn('node', [cliPath, ...args], {
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      printError(`子命令启动失败: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * 格式化 API 错误信息
 */
function formatApiError(error: any): { message: string; hint: string } {
  const errMsg = error?.message || error?.toString() || '未知错误';

  if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('invalid key') || errMsg.includes('Incorrect API key')) {
    return { message: 'API Key 无效或未配置', hint: '请运行: devflow config set-key <平台> <apiKey>' };
  }
  if (errMsg.includes('403') || errMsg.includes('Forbidden')) {
    return { message: 'API Key 没有访问权限', hint: '请检查 API Key 是否有该模型的访问权限' };
  }
  if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('Too Many Requests')) {
    return { message: '请求频率过高，被限流', hint: '请稍等几秒后重试，或切换到其他模型' };
  }
  if (errMsg.includes('500') || errMsg.includes('Internal Server Error')) {
    return { message: 'AI 服务端内部错误', hint: '这是平台方的问题，请稍后重试或切换模型' };
  }
  if (errMsg.includes('502') || errMsg.includes('Bad Gateway')) {
    return { message: 'AI 服务网关错误', hint: '平台服务暂时不可用，请稍后重试' };
  }
  if (errMsg.includes('503') || errMsg.includes('Service Unavailable')) {
    return { message: 'AI 服务暂不可用', hint: '平台正在维护或过载，请稍后重试' };
  }
  if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('Timed out') || errMsg.includes('abort')) {
    return { message: '请求超时', hint: '请检查网络连接，或尝试切换更快的模型' };
  }
  if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
    return { message: '网络连接失败', hint: '请检查网络连接是否正常，是否需要代理' };
  }
  if (errMsg.includes('quota') || errMsg.includes('余额') || errMsg.includes('insufficient')) {
    return { message: 'API 额度不足', hint: '请到平台充值，或切换到有额度的模型' };
  }
  if (errMsg.includes('model') && errMsg.includes('not found')) {
    return { message: '模型不存在', hint: '请用 devflow chat models 查看可用模型列表' };
  }

  return { message: errMsg, hint: '' };
}

/**
 * 流式聊天
 */
async function streamChat(
  provider: any,
  messages: Array<{ role: string; content: string }>,
  modelId: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  let fullContent = '';

  process.stdout.write(chalk.green('  AI: '));

  try {
    const stream = provider.stream({
      messages,
      model: modelId,
      temperature,
      maxTokens,
    });

    for await (const chunk of stream) {
      if (chunk.done) break;
      if (chunk.content) {
        process.stdout.write(chunk.content);
        fullContent += chunk.content;
      }
    }
  } catch (error: any) {
    if (fullContent) {
      process.stdout.write(chalk.red('\n\n  ⚠ 流式输出中断'));
    }
    throw error;
  }

  console.log('\n');
  return fullContent;
}

/**
 * 解析当前可用的 AI 提供商
 */
function resolveProvider(): { providerType: ProviderType; provider: any; modelId: string } | null {
  const defaultProvider = configManager.getDefaultProvider();
  const configuredProviders = PROVIDER_TYPE_LIST.filter(type =>
    !PROVIDER_INFO[type].requiresApiKey || configManager.getApiKey(type)
  );

  let providerType: ProviderType;
  if (defaultProvider && configuredProviders.includes(defaultProvider)) {
    providerType = defaultProvider;
  } else if (configuredProviders.length > 0) {
    providerType = configuredProviders[0];
  } else {
    printError('没有已配置的AI平台');
    printInfo('请运行: devflow config set-key aliyun <apiKey>');
    return null;
  }

  const info = PROVIDER_INFO[providerType];
  const providerConfig = configManager.getProviderConfig(providerType);
  const modelId = providerConfig.defaultModel || info.models[0]?.id;

  const provider = createProvider(providerType, {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    timeout: 60000,
    maxRetries: 2,
  });

  return { providerType, provider, modelId };
}

/**
 * 处理主菜单选择
 */
export async function handleMenuChoice(choice: string): Promise<void> {
  switch (choice) {
    case 'interactive': {
      const resolved = resolveProvider();
      if (!resolved) { await pause(); return; }
      const { providerType, provider, modelId } = resolved;
      const info = PROVIDER_INFO[providerType];

      console.log();
      printSuccess(`使用 ${info.displayName} / ${modelId}`);
      console.log(chalk.gray('  输入 /back 返回主菜单 / /exit 退出程序 / /help 查看帮助\n'));

      const chatConfig = configManager.getChatConfig();
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      while (true) {
        const { input } = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: chalk.cyan('你:'),
        }]);

        const userInput = input?.trim();
        if (!userInput) continue;

        if (userInput.startsWith('/')) {
          const cmd = userInput.slice(1).toLowerCase();
          if (cmd === 'exit' || cmd === 'quit') {
            printSuccess('再见！');
            process.exit(0);
          } else if (cmd === 'back' || cmd === 'return' || cmd === 'menu') {
            printInfo('返回主菜单');
            return;
          } else if (cmd === 'help') {
            await interactiveHelp();
            continue;
          } else if (cmd === 'clear') {
            messages.length = 0;
            printSuccess('对话历史已清空');
            continue;
          }
        }

        messages.push({ role: 'user', content: userInput });

        try {
          const fullContent = await streamChat(
            provider, messages, modelId,
            chatConfig.defaultTemperature,
            chatConfig.defaultMaxTokens,
          );

          messages.push({ role: 'assistant', content: fullContent });
          if (messages.length > chatConfig.historyLimit * 2) {
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
          const { message, hint } = formatApiError(error);
          printError(`对话失败: ${message}`);
          if (hint) printInfo(hint);
          messages.pop();
          console.log();
        }
      }
    }

    case 'quick-ask': {
      const { message } = await inquirer.prompt([{
        type: 'input',
        name: 'message',
        message: chalk.cyan('问题:'),
      }]);

      if (!message?.trim()) return;

      const resolved = resolveProvider();
      if (!resolved) { await pause(); return; }
      const { providerType, provider, modelId } = resolved;
      const chatConfig = configManager.getChatConfig();

      try {
        const fullContent = await streamChat(
          provider,
          [{ role: 'user', content: message }],
          modelId,
          chatConfig.defaultTemperature,
          chatConfig.defaultMaxTokens,
        );

        const memoryConfig = configManager.getMemoryConfig();
        if (memoryConfig.enabled) {
          memoryManager.rememberChat({
            input: message,
            output: fullContent,
            provider: providerType,
            model: modelId,
          }).catch(() => {});
        }
      } catch (error: any) {
        const { message: msg, hint } = formatApiError(error);
        printError(`提问失败: ${msg}`);
        if (hint) printInfo(hint);
      }

      await pause();
    }

    case 'suggest': {
      const { task } = await inquirer.prompt([{
        type: 'input',
        name: 'task',
        message: chalk.cyan('描述你的任务:'),
      }]);
      if (!task?.trim()) return;

      const resolved = resolveProvider();
      if (!resolved) { await pause(); return; }
      const { provider } = resolved;

      console.log(chalk.cyan('  搜索模型中...'));
      try {
        const results = await provider.searchModels(task);
        if (results.length === 0) {
          printInfo('未找到匹配模型');
        } else {
          printSuccess(`找到 ${results.length} 个模型:\n`);
          results.slice(0, 10).forEach((id: string) => {
            const builtin = PROVIDER_INFO[resolved.providerType].models.find(m => m.id === id);
            console.log(`  ${chalk.cyan(id)}${builtin ? chalk.green(' ✓') : ''}`);
          });
        }
      } catch (error: any) {
        const { message, hint } = formatApiError(error);
        printError(`搜索失败: ${message}`);
        if (hint) printInfo(hint);
      }
      await pause();
    }

    case 'agent-run': {
      const { task } = await inquirer.prompt([{
        type: 'input',
        name: 'task',
        message: chalk.cyan('Agent任务:'),
      }]);
      if (!task?.trim()) return;

      try {
        await runSubCommand(['agent', 'run', task]);
      } catch (error: any) {
        printError(`Agent 执行失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'review-file': {
      const { filePath } = await inquirer.prompt([{
        type: 'input',
        name: 'filePath',
        message: chalk.cyan('文件路径:'),
      }]);
      if (!filePath?.trim()) return;

      try {
        await runSubCommand(['review', 'file', filePath]);
      } catch (error: any) {
        printError(`审查失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'review-dir': {
      const { dirPath } = await inquirer.prompt([{
        type: 'input',
        name: 'dirPath',
        message: chalk.cyan('目录路径:'),
      }]);
      if (!dirPath?.trim()) return;

      try {
        await runSubCommand(['review', 'dir', dirPath]);
      } catch (error: any) {
        printError(`审查失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'tools-list': {
      try {
        await runSubCommand(['tools', 'list']);
      } catch (error: any) {
        printError(`工具列表获取失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'tools-run': {
      try {
        const tools = listTools();
        const { toolName } = await inquirer.prompt([{
          type: 'list',
          name: 'toolName',
          message: '选择工具:',
          choices: tools.map((t: { name: string; description: string }) => ({
            name: `${t.name} - ${t.description}`,
            value: t.name,
          })),
        }]);

        const tool = toolRegistry.get(toolName);
        if (!tool) { printError(`工具 ${toolName} 不存在`); await pause(); return; }

        const params: Record<string, string> = {};
        for (const param of tool.parameters) {
          if (param.required) {
            const { val } = await inquirer.prompt([{
              type: 'input',
              name: 'val',
              message: `${param.name}${param.description ? ` (${param.description})` : ''}:`,
            }]);
            params[param.name] = val;
          }
        }

        console.log(chalk.cyan(`  执行 ${toolName}...`));
        const result = await tool.execute(params);
        console.log(chalk.green('\n结果:'));
        console.log(result.output || JSON.stringify(result, null, 2));

        if (!result.success && result.error) {
          printError(`工具返回错误: ${result.error}`);
        }
      } catch (error: any) {
        printError(`工具执行失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'file-read': {
      const { filePath } = await inquirer.prompt([{
        type: 'input',
        name: 'filePath',
        message: chalk.cyan('文件路径:'),
      }]);
      if (!filePath?.trim()) return;

      try {
        await runSubCommand(['files', 'read', filePath]);
      } catch (error: any) {
        printError(`读取失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'file-write': {
      const { filePath } = await inquirer.prompt([{
        type: 'input',
        name: 'filePath',
        message: chalk.cyan('文件路径:'),
      }]);
      if (!filePath?.trim()) return;

      const { content } = await inquirer.prompt([{
        type: 'input',
        name: 'content',
        message: chalk.cyan('文件内容:'),
      }]);
      if (!content?.trim()) return;

      try {
        const { writeFile } = await import('../files/manager.js');
        const result = await writeFile(filePath, content);
        if (result.success) {
          printSuccess(`文件已写入: ${filePath} (${result.size} bytes)`);
        } else {
          printError(`写入失败: ${result.error}`);
        }
      } catch (error: any) {
        printError(`写入失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'file-tree': {
      const { dirPath } = await inquirer.prompt([{
        type: 'input',
        name: 'dirPath',
        message: chalk.cyan('目录路径 (默认当前目录):'),
        default: '.',
      }]);
      try {
        await runSubCommand(['files', 'tree', dirPath]);
      } catch (error: any) {
        printError(`目录树获取失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'memory-view': {
      try {
        await runSubCommand(['memory', 'recent', '--limit', '10']);
      } catch (error: any) {
        printError(`记忆查看失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'memory-search': {
      const { query } = await inquirer.prompt([{
        type: 'input',
        name: 'query',
        message: chalk.cyan('搜索关键词:'),
      }]);
      if (!query?.trim()) return;

      try {
        await runSubCommand(['memory', 'search', query]);
      } catch (error: any) {
        printError(`记忆搜索失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'config-view': {
      try {
        await runSubCommand(['config', 'list']);
      } catch (error: any) {
        printError(`配置查看失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'config-key': {
      try {
        const providers = PROVIDER_TYPE_LIST.filter(t => PROVIDER_INFO[t].requiresApiKey);
        const { provider } = await inquirer.prompt([{
          type: 'list',
          name: 'provider',
          message: '选择平台:',
          choices: providers.map(t => ({ name: PROVIDER_INFO[t].displayName, value: t })),
        }]);
        const { apiKey } = await inquirer.prompt([{
          type: 'password',
          name: 'apiKey',
          message: `输入 ${PROVIDER_INFO[provider as ProviderType].displayName} API Key:`,
          mask: '*',
        }]);
        if (apiKey) {
          await configManager.setApiKey(provider as ProviderType, apiKey);
          printSuccess(`${PROVIDER_INFO[provider as ProviderType].displayName} API Key 已设置`);
        }
      } catch (error: any) {
        printError(`密钥设置失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'config-sandbox': {
      try {
        await runSubCommand(['config', 'get-sandbox']);
      } catch (error: any) {
        printError(`沙盒配置查看失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'list': {
      try {
        await runSubCommand(['ai', 'list']);
      } catch (error: any) {
        printError(`平台列表获取失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'status': {
      try {
        await runSubCommand(['config', 'list']);
      } catch (error: any) {
        printError(`状态查看失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'models': {
      const defaultProvider = configManager.getDefaultProvider();
      const p = defaultProvider || 'aliyun';
      try {
        await runSubCommand(['chat', 'models', '-p', p]);
      } catch (error: any) {
        printError(`模型列表获取失败: ${error?.message || error}`);
      }
      await pause();
    }

    case 'help': {
      await interactiveHelp();
    }

    default:
      printInfo(`功能 "${choice}" 暂未实现，请使用命令行方式调用`);
      await pause();
  }
}
