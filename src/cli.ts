#!/usr/bin/env node

// 必须先导入 reflect-metadata 以支持 TSyringe 装饰器
import 'reflect-metadata';

import { Command } from 'commander';
import { aiCommand } from './commands/ai.js';
import { configCommand } from './commands/config.js';
import { chatCommand } from './commands/chat.js';
import { historyCommand } from './commands/history.js';
import { reviewCommand } from './commands/review.js';
import { filesCommand } from './commands/files.js';
import { toolsCommand } from './commands/tools.js';
import { memoryCommand } from './commands/memory.js';
import { agentCommand } from './commands/agent.js';
import { gitCommand } from './commands/git.js';
import { configManager } from './config/manager.js';
import { printHeader, printSuccess, printError, printInfo, printWarning } from './ui/logo.js';
import { showMainMenu } from './ui/menu.js';
import { handleMenuChoice } from './ui/menu-handler.js';
import { logger } from './services/logger.js';
import { generateStartupSuggestions, formatHealthCheckForCLI } from './agent/startup-suggestions.js';
import { autonomousGoalManager } from './agent/autonomous-goals.js';

// 注册 DI 容器服务（可选，用于未来的依赖注入迁移）
import { registerCoreServices } from './di/index.js';
registerCoreServices();

const program = new Command();

program
  .name('devflow')
  .description('DevFlow Agent CLI - 可靠、诚实、可控的AI开发助手')
  .version('0.1.0');

program.addCommand(aiCommand);
program.addCommand(configCommand);
program.addCommand(chatCommand);
program.addCommand(historyCommand);
program.addCommand(reviewCommand);
program.addCommand(filesCommand);
program.addCommand(toolsCommand);
program.addCommand(memoryCommand);
program.addCommand(agentCommand);
program.addCommand(gitCommand);

program
  .command('help-interactive')
  .alias('help')
  .description('打开交互式帮助中心')
  .action(async () => {
    await configManager.init();
    const { interactiveHelp } = await import('./ui/help.js');
    await interactiveHelp();
  });

process.on('uncaughtException', (error) => {
  console.log();
  logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
  printError(`程序异常: ${error.message}`);
  printInfo('请尝试重新运行，如果问题持续请提交 Issue');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.log();
  logger.error({ reason }, 'Unhandled promise rejection');
  printError(`未处理的Promise异常: ${reason}`);
  process.exit(1);
});

if (process.argv.length === 2) {
  (async () => {
    logger.info('Starting DevFlow Agent in interactive mode');
    try {
      await configManager.init();
      logger.debug('Configuration initialized successfully');

      // 运行启动健康检查（非阻塞，仅提示）
      try {
        const healthResult = await generateStartupSuggestions(process.cwd());
        if (healthResult.healthStatus !== 'healthy') {
          console.log();
          if (healthResult.healthStatus === 'critical') {
            printWarning(`项目健康检查: ${healthResult.summary}`);
          } else {
            printInfo(`项目健康检查: ${healthResult.summary}`);
          }
          // 显示前 3 条建议
          for (const suggestion of healthResult.suggestions.slice(0, 3)) {
            console.log(`    ${suggestion}`);
          }
          console.log();
        }
      } catch {
        // 健康检查失败不影响主流程
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Configuration initialization failed');
      printError(`配置初始化失败: ${error.message}`);
      printInfo('请检查 .devflow 目录权限');
      process.exit(1);
    }

    while (true) {
      try {
        const choice = await showMainMenu();

        if (choice === null || choice === 'exit') {
          printHeader();
          printSuccess('感谢使用 DevFlow Agent，再见！');
          logger.info('DevFlow Agent exited normally');
          process.exit(0);
        }

        await handleMenuChoice(choice);
      } catch (error: any) {
        logger.error({ error: error?.message || error }, 'Operation failed in main loop');
        printError(`操作失败: ${error?.message || error}`);
        printInfo('返回主菜单...');
      }
    }
  })();
} else {
  program.parse();
}
