/**
 * 斜杠命令系统
 *
 * 在聊天交互中通过 /command 触发快捷操作。
 * 学习自 Aider 的 40+ 斜杠命令体系。
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

/** 斜杠命令定义 */
export interface SlashCommand {
  /** 命令名（不含 /） */
  name: string;
  /** 别名 */
  aliases?: string[];
  /** 简短描述 */
  description: string;
  /** 详细帮助 */
  help?: string;
  /** 是否需要参数 */
  args?: {
    name: string;
    description: string;
    required?: boolean;
  };
  /** 执行函数 */
  execute: (context: SlashCommandContext) => Promise<SlashCommandResult | void>;
}

/** 斜杠命令上下文 */
export interface SlashCommandContext {
  /** 命令参数（/command 后面的部分） */
  args: string;
  /** 聊天历史 */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** 当前模型 ID */
  modelId: string;
  /** 当前平台类型 */
  providerType: string;
  /** 更新模型 */
  setModel: (modelId: string) => void;
  /** 更新平台 */
  setProvider: (provider: string) => void;
}

/** 斜杠命令结果 */
export interface SlashCommandResult {
  /** 是否已处理（阻止发送给 AI） */
  handled: boolean;
  /** 输出消息 */
  message?: string;
  /** 是否退出聊天 */
  exit?: boolean;
}

/** 命令注册表 */
const commands = new Map<string, SlashCommand>();

/**
 * 注册斜杠命令
 */
export function registerCommand(command: SlashCommand): void {
  commands.set(command.name, command);
  if (command.aliases) {
    for (const alias of command.aliases) {
      commands.set(alias, command);
    }
  }
}

/**
 * 获取所有命令（去重）
 */
export function getAllCommands(): SlashCommand[] {
  const seen = new Set<string>();
  const result: SlashCommand[] = [];
  for (const [, cmd] of commands) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      result.push(cmd);
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 解析用户输入为命令
 * @returns 命令名和参数，如果不是命令则返回 null
 */
export function parseCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { name: trimmed.slice(1).toLowerCase(), args: '' };
  }
  return {
    name: trimmed.slice(1, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

/**
 * 执行斜杠命令
 * @returns 处理结果，null 表示未知命令
 */
export async function executeSlashCommand(
  input: string,
  context: SlashCommandContext
): Promise<SlashCommandResult | null> {
  const parsed = parseCommand(input);
  if (!parsed) return null;

  const command = commands.get(parsed.name);
  if (!command) {
    return {
      handled: true,
      message: chalk.yellow(`未知命令: /${parsed.name}，输入 /help 查看所有命令`),
    };
  }

  try {
    const result = await command.execute({ ...context, args: parsed.args });
    return result || { handled: true };
  } catch (error) {
    return {
      handled: true,
      message: chalk.red(`命令执行失败: ${error instanceof Error ? error.message : String(error)}`),
    };
  }
}

// ═══════════════════════════════════════════════════════════
// 内置命令注册
// ═══════════════════════════════════════════════════════════

// /exit — 退出对话
registerCommand({
  name: 'exit',
  aliases: ['quit', 'q'],
  description: '退出对话',
  execute: async () => ({ handled: true, exit: true }),
});

// /help — 帮助
registerCommand({
  name: 'help',
  aliases: ['h', '?'],
  description: '显示所有可用命令',
  execute: async () => {
    const cmds = getAllCommands();
    let output = chalk.bold('\n📋 可用命令:\n');
    for (const cmd of cmds) {
      const aliasStr = cmd.aliases?.length ? ` (${cmd.aliases.map(a => `/${a}`).join(', ')})` : '';
      output += `  ${chalk.cyan(`/${cmd.name}`)}${chalk.dim(aliasStr)}  ${cmd.description}\n`;
    }
    output += chalk.dim('\n  提示: /command <参数>  例如: /model gpt-4\n');
    return { handled: true, message: output };
  },
});

// /clear — 清空对话历史
registerCommand({
  name: 'clear',
  aliases: ['cls'],
  description: '清空对话历史',
  execute: async (ctx) => {
    ctx.messages.length = 0;
    return { handled: true, message: chalk.green('✓ 对话历史已清空') };
  },
});

// /model — 切换模型
registerCommand({
  name: 'model',
  description: '切换 AI 模型 (/model <模型名>)',
  args: { name: '模型名', description: '要切换的模型ID', required: false },
  execute: async (ctx) => {
    if (!ctx.args) {
      return { handled: true, message: chalk.dim(`当前模型: ${ctx.modelId}\n用法: /model <模型名>`) };
    }
    ctx.setModel(ctx.args);
    return { handled: true, message: chalk.green(`✓ 已切换到模型: ${ctx.args}`) };
  },
});

// /undo — 撤销最后一次 AI 提交
registerCommand({
  name: 'undo',
  description: '撤销最后一次 AI Git 提交',
  execute: async () => {
    try {
      const { GitManager } = await import('../git/manager.js');
      const git = new GitManager();
      if (!(await git.isRepo())) {
        return { handled: true, message: chalk.yellow('当前目录不是 Git 仓库') };
      }
      const commits = await git.getLog({ count: 1 });
      if (commits.length === 0) {
        return { handled: true, message: chalk.yellow('没有提交记录') };
      }
      if (!commits[0].isAider) {
        return { handled: true, message: chalk.yellow(`最后一次提交不是 AI 生成的: ${commits[0].shortHash}`) };
      }
      const result = await git.undoLastCommit();
      return { handled: true, message: result.success ? chalk.green(`✓ ${result.message}`) : chalk.red(`✗ ${result.message}`) };
    } catch {
      return { handled: true, message: chalk.yellow('Git 模块不可用') };
    }
  },
});

// /diff — 查看 Git 变更
registerCommand({
  name: 'diff',
  description: '查看当前 Git 变更',
  execute: async () => {
    try {
      const { GitManager } = await import('../git/manager.js');
      const git = new GitManager();
      if (!(await git.isRepo())) {
        return { handled: true, message: chalk.yellow('当前目录不是 Git 仓库') };
      }
      const diff = await git.getDiff();
      if (diff.files.length === 0) {
        return { handled: true, message: chalk.dim('没有变更') };
      }
      let output = chalk.bold(`\n📝 变更: ${chalk.green(`+${diff.totalAdditions}`)} ${chalk.red(`-${diff.totalDeletions}`)}\n`);
      for (const f of diff.files) {
        const icon = f.status === 'added' ? chalk.green('A') : f.status === 'deleted' ? chalk.red('D') : chalk.yellow('M');
        output += `  ${icon} ${f.file} (+${f.additions} -${f.deletions})\n`;
      }
      return { handled: true, message: output };
    } catch {
      return { handled: true, message: chalk.yellow('Git 模块不可用') };
    }
  },
});

// /checkpoint — 创建检查点
registerCommand({
  name: 'checkpoint',
  aliases: ['cp'],
  description: '创建 Git 检查点',
  execute: async (ctx) => {
    try {
      const { CheckpointManager } = await import('../git/checkpoint.js');
      const cp = new CheckpointManager(process.cwd());
      const desc = ctx.args || undefined;
      const result = await cp.create(desc);
      return { handled: true, message: result.success ? chalk.green(`✓ ${result.message}`) : chalk.red(`✗ ${result.message}`) };
    } catch {
      return { handled: true, message: chalk.yellow('Git 模块不可用') };
    }
  },
});

// /tokens — 显示 token 用量
registerCommand({
  name: 'tokens',
  description: '显示当前对话的 token 用量估算',
  execute: async (ctx) => {
    const { estimateTokens } = await import('../utils/tokens.js');
    let totalTokens = 0;
    for (const msg of ctx.messages) {
      totalTokens += estimateTokens(msg.content);
    }
    const msgCount = ctx.messages.length;
    return {
      handled: true,
      message: chalk.dim(`\n📊 Token 用量估算:\n  消息数: ${msgCount}\n  估算 tokens: ~${totalTokens.toLocaleString()}\n  估算字符: ~${ctx.messages.reduce((s, m) => s + m.content.length, 0).toLocaleString()}\n`),
    };
  },
});

// /save — 保存对话到记忆
registerCommand({
  name: 'save',
  description: '手动保存当前对话到记忆系统',
  execute: async (ctx) => {
    try {
      const { memoryManager } = await import('../memory/manager.js');
      const lastUser = [...ctx.messages].reverse().find(m => m.role === 'user');
      const lastAssistant = [...ctx.messages].reverse().find(m => m.role === 'assistant');
      if (lastUser && lastAssistant) {
        await memoryManager.rememberChat({
          input: lastUser.content,
          output: lastAssistant.content,
          provider: ctx.providerType as any,
          model: ctx.modelId,
        });
        return { handled: true, message: chalk.green('✓ 对话已保存到记忆') };
      }
      return { handled: true, message: chalk.yellow('没有可保存的对话') };
    } catch {
      return { handled: true, message: chalk.yellow('记忆系统不可用') };
    }
  },
});

// /architect — 切换到双模型模式
registerCommand({
  name: 'architect',
  description: '切换到双模型模式 (Architect + Editor)',
  execute: async () => {
    return {
      handled: true,
      message: chalk.cyan('🏗️ 双模型模式需要在 agent run 中使用:\n  devflow agent run "任务" --architect'),
    };
  },
});

// /plan — 切换到 Plan/Act 模式
registerCommand({
  name: 'plan',
  description: '切换到 Plan/Act 模式 (先规划后执行)',
  execute: async () => {
    return {
      handled: true,
      message: chalk.cyan('📋 Plan/Act 模式需要在 agent run 中使用:\n  devflow agent run "任务" --plan-first'),
    };
  },
});

// /compact — 压缩对话历史
registerCommand({
  name: 'compact',
  aliases: ['summarize'],
  description: '压缩对话历史（保留摘要）',
  execute: async (ctx) => {
    if (ctx.messages.length < 4) {
      return { handled: true, message: chalk.dim('对话太短，无需压缩') };
    }
    // 保留 system 消息和最近一轮对话
    const systemMsgs = ctx.messages.filter(m => m.role === 'system');
    const recentMsgs = ctx.messages.slice(-4);
    ctx.messages.length = 0;
    ctx.messages.push(...systemMsgs);
    ctx.messages.push({
      role: 'system',
      content: '[之前的对话历史已被压缩]',
    });
    ctx.messages.push(...recentMsgs);
    return { handled: true, message: chalk.green(`✓ 对话已压缩 (${ctx.messages.length} 条消息)`) };
  },
});

// /copy — 复制最后一次 AI 回复
registerCommand({
  name: 'copy',
  description: '复制最后一次 AI 回复到剪贴板',
  execute: async (ctx) => {
    const lastAssistant = [...ctx.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) {
      return { handled: true, message: chalk.yellow('没有可复制的回复') };
    }
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // 尝试使用 pbcopy (macOS) 或 xclip (Linux) 或 clip (Windows)
      const cmd = process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard';
      await execAsync(`echo ${JSON.stringify(lastAssistant.content)} | ${cmd}`);
      return { handled: true, message: chalk.green('✓ 已复制到剪贴板') };
    } catch {
      return { handled: true, message: chalk.yellow('复制失败（剪贴板工具不可用）') };
    }
  },
});

// /history — 查看聊天历史
registerCommand({
  name: 'history',
  description: '查看聊天历史记录',
  execute: async () => {
    try {
      const { historyManager } = await import('../history/manager.js');
      const sessions = await historyManager.listSessions();
      const recent = sessions.slice(0, 10);
      if (sessions.length === 0) {
        return { handled: true, message: chalk.dim('没有历史记录') };
      }
      let output = chalk.bold('\n📜 最近对话:\n');
      recent.forEach((s: any, i: number) => {
        output += `  ${chalk.dim(`${i + 1}.`)} ${chalk.cyan(s.title || '无标题')} ${chalk.dim(`(${s.messageCount || 0}条消息)`)}\n`;
      });
      return { handled: true, message: output };
    } catch {
      return { handled: true, message: chalk.yellow('历史模块不可用') };
    }
  },
});
