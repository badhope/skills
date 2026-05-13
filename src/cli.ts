#!/usr/bin/env node

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
import { printHeader, printSuccess, printError, printInfo } from './ui/logo.js';
import { showMainMenu } from './ui/menu.js';
import { handleMenuChoice } from './ui/menu-handler.js';

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
  printError(`程序异常: ${error.message}`);
  printInfo('请尝试重新运行，如果问题持续请提交 Issue');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.log();
  printError(`未处理的Promise异常: ${reason}`);
  process.exit(1);
});

if (process.argv.length === 2) {
  (async () => {
    try {
      await configManager.init();
    } catch (error: any) {
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
          process.exit(0);
        }

        await handleMenuChoice(choice);
      } catch (error: any) {
        printError(`操作失败: ${error?.message || error}`);
        printInfo('返回主菜单...');
      }
    }
  })();
} else {
  program.parse();
}
