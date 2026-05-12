import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { executeTool, getToolDefinitions, toolRegistry } from '../tools/registry.js';
import { toolLibrary, type ToolMetadata } from '../tools/library.js';
import { configManager } from '../config/manager.js';
import { printHeader, printSection, printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';
import { TOOLS_DIR } from '../utils/index.js';

const toolsCommand = new Command('tools')
  .alias('t')
  .description('工具调用（独立使用 + AI function calling）');

// ==================== 工具库管理 ====================

// 查看可用工具库
toolsCommand
  .command('available')
  .alias('avail')
  .description('查看工具库中所有可用的工具包')
  .option('-c, --category <category>', '按分类筛选')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (options: { category?: string; json: boolean }) => {
    await configManager.init();
    const index = await toolLibrary.getIndex();

    if (options.json) {
      if (options.category) {
        const tools = await toolLibrary.getToolsByCategory(options.category);
        console.log(JSON.stringify({ category: options.category, tools }, null, 2));
      } else {
        console.log(JSON.stringify(index, null, 2));
      }
      return;
    }

    printHeader();
    printSection('工具库');

    console.log(chalk.gray(`  共 ${index.totalTools} 个工具包\n`));

    const categories = await toolLibrary.getCategories();

    for (const category of categories) {
      if (options.category && options.category !== category) {
        continue;
      }

      const tools = await toolLibrary.getToolsByCategory(category);

      console.log(chalk.bold.cyan(`  📁 ${category} (${tools.length})`));

      for (const tool of tools) {
        const icons: Record<string, string> = {
          'development': '🔧',
          'devops': '🚀',
          'security': '🔒',
          'data': '💾',
          'ai': '🤖',
          'web': '🌐',
          'productivity': '⚡',
          'analysis': '📊',
          'utilities': '🛠️',
          'design': '🎨',
          'other': '📦'
        };
        const icon = icons[tool.category] || '📦';

        console.log(`    ${icon} ${chalk.white(tool.name)}`);
        console.log(`       ${chalk.gray(tool.description)}`);
        console.log(`       ${chalk.gray(`版本: ${tool.version} | 工具数: ${tool.tools.length}`)}`);
        console.log();
      }
    }

    console.log(chalk.gray('  使用 devflow tools install <name> 安装工具包\n'));
  });

// 搜索工具
toolsCommand
  .command('search')
  .alias('s')
  .description('搜索工具库中的工具')
  .argument('<keyword>', '搜索关键词')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (keyword: string, options: { json: boolean }) => {
    const results = await toolLibrary.searchTools(keyword);

    if (options.json) {
      console.log(JSON.stringify({ keyword, count: results.length, results }, null, 2));
      return;
    }

    printHeader();
    printSection(`搜索结果: ${keyword}`);

    if (results.length === 0) {
      printWarning('  没有找到匹配的工具');
      console.log(chalk.gray('  使用 devflow tools available 查看所有工具\n'));
      return;
    }

    console.log(chalk.gray(`  找到 ${results.length} 个匹配的工具\n`));

    for (const tool of results) {
      console.log(`  ${chalk.bold.cyan(tool.name)} ${chalk.gray(`[${tool.category}]`)}`);
      console.log(`    ${chalk.white(tool.description)}`);
      console.log(`    ${chalk.gray(`工具: ${tool.tools.join(', ')}`)}`);
      console.log();
    }

    console.log(chalk.gray('  使用 devflow tools install <name> 安装工具包\n'));
  });

// 安装工具包
toolsCommand
  .command('install')
  .description('安装工具包')
  .argument('[names...]', '要安装的工具包名称（不指定则安装全部）')
  .option('-a, --all', '安装所有可用工具', false)
  .option('-c, --category <category>', '按分类安装')
  .option('-y, --yes', '跳过确认', false)
  .action(async (names: string[], options: { all: boolean; category?: string; yes: boolean }) => {
    await configManager.init();

    let toolsToInstall: ToolMetadata[] = [];

    if (options.all) {
      toolsToInstall = await toolLibrary.getAllTools();
    } else if (options.category) {
      toolsToInstall = await toolLibrary.getToolsByCategory(options.category);
    } else if (names.length > 0) {
      for (const name of names) {
        const tool = await toolLibrary.getTool(name);
        if (tool) {
          toolsToInstall.push(tool);
        } else {
          printWarning(`  工具 ${name} 不存在于工具库中`);
        }
      }
    } else {
      printError('  请指定要安装的工具包名称');
      console.log(chalk.gray('  使用 devflow tools available 查看可用工具\n'));
      return;
    }

    if (toolsToInstall.length === 0) {
      printWarning('  没有要安装的工具');
      return;
    }

    printHeader();
    printSection('安装工具包');

    console.log(chalk.gray(`  将安装 ${toolsToInstall.length} 个工具包:\n`));

    for (const tool of toolsToInstall) {
      console.log(`  ${chalk.bold.cyan(tool.name)}`);
      console.log(`    ${chalk.gray(tool.description)}`);
      console.log(`    ${chalk.gray(`分类: ${tool.category} | 版本: ${tool.version}`)}`);

      if (tool.dependencies.length > 0) {
        console.log(`    ${chalk.yellow(`依赖: ${tool.dependencies.join(', ')}`)}`);
      }
      console.log();
    }

    if (!options.yes) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.yellow('  确认安装? (y/N) '), resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.gray('  已取消安装\n'));
        return;
      }
    }

    console.log(chalk.cyan('\n  开始安装...\n'));

    const installedDir = TOOLS_DIR;
    await fs.mkdir(installedDir, { recursive: true });

    let successCount = 0;
    let failCount = 0;

    for (const tool of toolsToInstall) {
      try {
        const destPath = path.join(installedDir, tool.name);

        console.log(chalk.gray(`  安装 ${tool.name}...`));

        await fs.cp(tool.path, destPath, { recursive: true });

        console.log(chalk.green(`    ✓ ${tool.name} 安装成功`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`    ✗ ${tool.name} 安装失败: ${error}`));
        failCount++;
      }
    }

    console.log();
    if (successCount > 0) {
      printSuccess(`成功安装 ${successCount} 个工具包`);
    }
    if (failCount > 0) {
      printError(`安装失败 ${failCount} 个工具包`);
    }
    console.log(chalk.gray('  使用 devflow tools list 查看已安装的工具\n'));
  });

// 卸载工具包
toolsCommand
  .command('uninstall')
  .description('卸载工具包')
  .argument('<names...>', '要卸载的工具包名称')
  .option('-y, --yes', '跳过确认', false)
  .action(async (names: string[], options: { yes: boolean }) => {
    await configManager.init();
    const installedDir = TOOLS_DIR;

    if (!options.yes) {
      printHeader();
      printSection('卸载工具包');
      console.log(chalk.gray(`  将卸载 ${names.length} 个工具包:\n`));

      for (const name of names) {
        console.log(`  ${chalk.bold.red(name)}`);
      }
      console.log();

      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.yellow('  确认卸载? (y/N) '), resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.gray('  已取消卸载\n'));
        return;
      }
    }

    console.log(chalk.cyan('\n  开始卸载...\n'));

    let successCount = 0;
    let failCount = 0;

    for (const name of names) {
      try {
        const toolPath = path.join(installedDir, name);
        await fs.rm(toolPath, { recursive: true });
        console.log(chalk.green(`  ✓ ${name} 卸载成功`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`  ✗ ${name} 卸载失败: ${error}`));
        failCount++;
      }
    }

    console.log();
    if (successCount > 0) {
      printSuccess(`成功卸载 ${successCount} 个工具包`);
    }
    if (failCount > 0) {
      printWarning(`卸载失败 ${failCount} 个工具包（可能未安装）`);
    }
    console.log();
  });

// 查看已安装的工具
toolsCommand
  .command('installed')
  .alias('list-installed')
  .description('查看已安装的工具包')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (options: { json: boolean }) => {
    const installedDir = TOOLS_DIR;

    let installedTools: string[] = [];

    try {
      const entries = await fs.readdir(installedDir);
      installedTools = entries.filter(async (entry) => {
        const stat = await fs.stat(path.join(installedDir, entry));
        return stat.isDirectory();
      });
    } catch {
      installedTools = [];
    }

    if (options.json) {
      console.log(JSON.stringify({ installed: installedTools, count: installedTools.length }, null, 2));
      return;
    }

    printHeader();
    printSection('已安装的工具包');

    if (installedTools.length === 0) {
      printWarning('  暂无已安装的工具包');
      console.log(chalk.gray('  使用 devflow tools install <name> 安装工具包\n'));
      return;
    }

    console.log(chalk.gray(`  共 ${installedTools.length} 个已安装的工具包\n`));

    for (const toolName of installedTools) {
      console.log(`  ${chalk.bold.green(toolName)}`);
    }

    console.log();
    console.log(chalk.gray('  使用 devflow tools uninstall <name> 卸载工具包\n'));
  });

// 工具包信息
toolsCommand
  .command('info')
  .description('查看工具包详细信息')
  .argument('<name>', '工具包名称')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (name: string, options: { json: boolean }) => {
    const tool = await toolLibrary.getTool(name);

    if (!tool) {
      printError(`  工具包 ${name} 不存在于工具库中`);
      console.log(chalk.gray('  使用 devflow tools available 查看可用工具\n'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(tool, null, 2));
      return;
    }

    printHeader();
    printSection(`工具包: ${name}`);

    console.log(`  ${chalk.bold.cyan('名称')}: ${tool.name}`);
    console.log(`  ${chalk.bold.cyan('版本')}: ${tool.version}`);
    console.log(`  ${chalk.bold.cyan('分类')}: ${tool.category}`);
    console.log(`  ${chalk.bold.cyan('描述')}: ${tool.description}`);

    if (tool.author) {
      console.log(`  ${chalk.bold.cyan('作者')}: ${tool.author}`);
    }

    console.log();
    console.log(`  ${chalk.bold.cyan('包含工具')}: ${tool.tools.join(', ')}`);

    if (tool.dependencies.length > 0) {
      console.log();
      console.log(`  ${chalk.bold.yellow('依赖项')}: ${tool.dependencies.join(', ')}`);
    }

    console.log();
    console.log(chalk.gray(`  路径: ${tool.path}`));
    console.log();
  });

// 列出所有可用工具
toolsCommand
  .command('list')
  .alias('ls')
  .description('列出所有可用工具')
  .action(() => {
    printHeader();
    printSection('可用工具');

    for (const [name, tool] of toolRegistry) {
      console.log(`  ${chalk.bold.cyan(name)}`);
      console.log(`    ${chalk.gray(tool.description)}`);
      const params = tool.parameters.map(p =>
        `${chalk.yellow(p.name)}${p.required ? '*' : ''}: ${p.type}`
      ).join(', ');
      console.log(`    参数: ${params}`);
      console.log();
    }

    printInfo('独立使用示例:');
    console.log(chalk.gray('  devflow tools shell "ls -la"'));
    console.log(chalk.gray('  devflow tools run read_file path=./src/index.ts'));
    console.log(chalk.gray('  devflow tools run search_files pattern="TODO" path=./src'));
    console.log(chalk.gray('  echo "hello" | devflow tools run write_file path=output.txt'));
    console.log();
  });

// 快捷执行 shell 命令
toolsCommand
  .command('shell')
  .alias('sh')
  .alias('!')
  .description('快捷执行 Shell 命令')
  .argument('<command>', '要执行的命令')
  .option('-w, --cwd <path>', '工作目录')
  .option('--timeout <ms>', '超时时间(ms)', '30000')
  .option('-s, --silent', '静默模式，只输出结果', false)
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (command: string, options: { cwd?: string; timeout: string; silent: boolean; json: boolean }) => {
    if (!options.silent) {
      printHeader();
      printSection(`Shell: ${command}`);
    }

    const shellArgs: Record<string, string> = { command };
    if (options.cwd) shellArgs.cwd = options.cwd;
    shellArgs.timeout = options.timeout;

    const result = await executeTool('shell', shellArgs);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.success) {
      if (!options.silent) printSuccess('执行成功');
      if (result.output.trim()) {
        console.log(options.silent ? result.output : chalk.white('\n' + result.output));
      }
    } else {
      if (!options.silent) printError('执行失败');
      if (result.output) console.log(chalk.white(result.output));
      if (result.error) console.log(chalk.red(result.error));
      process.exitCode = 1;
    }
  });

// 执行工具（增强版）
toolsCommand
  .command('run')
  .alias('r')
  .description('执行工具')
  .argument('<toolName>', '工具名称')
  .argument('[args...]', '工具参数 (key=value 格式，支持短参数名)')
  .option('-j, --json', 'JSON 格式输出', false)
  .option('--stdin', '从 stdin 读取 content 参数', false)
  .action(async (toolName: string, args: string[], options: { json: boolean; stdin: boolean }) => {
    // 参数别名映射
    const paramAliases: Record<string, Record<string, string>> = {
      read_file: { p: 'path', f: 'path' },
      write_file: { p: 'path', f: 'path', c: 'content' },
      search_files: { p: 'path', d: 'path', pat: 'pattern', fp: 'file_pattern' },
      list_dir: { p: 'path', d: 'path' },
      file_tree: { p: 'path', d: 'path', dep: 'depth' },
      file_info: { p: 'path', f: 'path' },
      shell: { c: 'command', cmd: 'command', d: 'cwd', t: 'timeout' },
    };

    const aliases = paramAliases[toolName] || {};

    // 解析参数
    const parsedArgs: Record<string, string> = {};
    for (const arg of args) {
      const [key, ...valueParts] = arg.split('=');
      const resolvedKey = aliases[key] || key;
      parsedArgs[resolvedKey] = valueParts.join('=');
    }

    // 从 stdin 读取 content
    if (options.stdin) {
      const stdinContent = await readStdin();
      if (stdinContent && !parsedArgs.content) {
        parsedArgs.content = stdinContent;
      }
    }

    if (!options.json) {
      printHeader();
      printSection(`执行工具: ${toolName}`);
      if (Object.keys(parsedArgs).length > 0) {
        console.log(chalk.gray(`  参数: ${JSON.stringify(parsedArgs)}\n`));
      }
    }

    const result = await executeTool(toolName, parsedArgs);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.success) {
      printSuccess('执行成功');
      if (result.output.trim()) {
        console.log(chalk.white('\n' + result.output.slice(0, 5000)));
        if (result.output.length > 5000) {
          console.log(chalk.gray(`\n... (输出已截断，共 ${result.output.length} 字符)`));
        }
      }
    } else {
      printError('执行失败');
      if (result.output) console.log(chalk.white(result.output));
      if (result.error) console.log(chalk.red(result.error));
      process.exitCode = 1;
    }
  });

// 导出工具定义为JSON（用于AI function calling）
toolsCommand
  .command('schema')
  .description('导出工具定义为JSON格式')
  .action(() => {
    const definitions = getToolDefinitions();
    console.log(JSON.stringify(definitions, null, 2));
  });

// 管道链式调用
toolsCommand
  .command('pipe')
  .alias('p')
  .description('管道链式调用多个工具')
  .argument('<chain>', '工具链，格式: tool1(args) | tool2(args) | ...')
  .option('-i, --input <text>', '初始输入文本')
  .option('-j, --json', 'JSON 格式输出', false)
  .action(async (chain: string, options: { input?: string; json: boolean }) => {
    // 解析管道链: tool1(key=val) | tool2(key=val)
    const steps = chain.split('|').map(s => s.trim()).filter(Boolean);

    if (steps.length === 0) {
      printError('请提供至少一个工具步骤');
      return;
    }

    if (!options.json) {
      printHeader();
      printSection('管道链式调用');
      console.log(chalk.gray(`  链路: ${chain}\n`));
    }

    let currentOutput = options.input || '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const match = step.match(/^(\w+)\((.*)\)$/s);
      if (!match) {
        printError(`步骤 ${i + 1} 格式错误: ${step}（应为 toolName(key=value)）`);
        process.exitCode = 1;
        return;
      }

      const toolName = match[1];
      const argsStr = match[2];

      // 解析参数
      const parsedArgs: Record<string, string> = {};
      if (argsStr.trim()) {
        for (const pair of argsStr.split(',')) {
          const [key, ...valueParts] = pair.split('=').map(s => s.trim());
          if (key) {
            parsedArgs[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
          }
        }
      }

      // 上一步的输出作为 input
      if (currentOutput) {
        if (!parsedArgs.input && !parsedArgs.content && !parsedArgs.path) {
          parsedArgs.input = currentOutput;
        }
      }

      if (!options.json) {
        console.log(chalk.cyan(`  [${i + 1}/${steps.length}] ${toolName}`));
      }

      const result = await executeTool(toolName, parsedArgs);

      if (!result.success) {
        printError(`步骤 ${i + 1} (${toolName}) 失败: ${result.error}`);
        process.exitCode = 1;
        return;
      }

      currentOutput = result.output;

      if (!options.json) {
        const preview = currentOutput.slice(0, 100).replace(/\n/g, ' ');
        console.log(chalk.gray(`       → ${preview}${currentOutput.length > 100 ? '...' : ''}`));
      }
    }

    if (options.json) {
      console.log(JSON.stringify({ success: true, output: currentOutput }, null, 2));
    } else {
      printSuccess('管道执行完成');
      console.log(chalk.white('\n' + currentOutput.slice(0, 5000)));
    }
  });

// 读取 stdin 内容
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => { resolve(data); });
      process.stdin.on('error', () => { resolve(''); });
    } else {
      resolve('');
    }
  });
}

export { toolsCommand };
