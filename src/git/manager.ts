import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { gitLogger } from '../services/logger.js';
import type { GitCommit, GitDiff, GitStatus, GitResult } from './types.js';

const execAsync = promisify(exec);

/**
 * Git 管理器 - 封装所有 Git 操作
 */
@injectable()
export class GitManager {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /** 执行 git 命令 */
  async exec(args: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
    gitLogger.debug({ command: `git ${args}`, cwd: this.cwd }, 'Executing git command');
    try {
      const result = await execAsync(`git ${args}`, {
        cwd: this.cwd,
        encoding: 'utf8',
        timeout: options?.timeout || 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      gitLogger.debug({ command: `git ${args}` }, 'Git command executed successfully');
      return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    } catch (error: any) {
      gitLogger.error({ command: `git ${args}`, error: error.stderr || error.message }, 'Git command failed');
      return { stdout: '', stderr: error.stderr || error.message || 'git command failed' };
    }
  }

  /** 检查是否在 Git 仓库中 */
  async isRepo(): Promise<boolean> {
    const { stdout } = await this.exec('rev-parse --is-inside-work-tree');
    return stdout === 'true';
  }

  /** 获取当前分支名 */
  async getCurrentBranch(): Promise<string> {
    const { stdout } = await this.exec('rev-parse --abbrev-ref HEAD');
    return stdout || 'HEAD';
  }

  /** 获取仓库根目录 */
  async getRepoRoot(): Promise<string> {
    const { stdout } = await this.exec('rev-parse --show-toplevel');
    return stdout;
  }

  /** 获取 Git 状态 */
  async getStatus(): Promise<GitStatus> {
    if (!(await this.isRepo())) {
      return { branch: '', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], isClean: true, isRepo: false };
    }

    const branch = await this.getCurrentBranch();

    // 获取 ahead/behind
    const { stdout: abOutput } = await this.exec('rev-list --left-right --count HEAD...@{upstream} 2>/dev/null');
    const [ahead = 0, behind = 0] = abOutput.split('\t').map(Number);

    // 获取暂存区变更
    const { stdout: stagedOutput } = await this.exec('diff --cached --numstat');
    const staged = this.parseNumStat(stagedOutput);

    // 获取未暂存变更
    const { stdout: unstagedOutput } = await this.exec('diff --numstat');
    const unstaged = this.parseNumStat(unstagedOutput);

    // 获取未跟踪文件
    const { stdout: untrackedOutput } = await this.exec('ls-files --others --exclude-standard');
    const untracked = untrackedOutput ? untrackedOutput.split('\n') : [];

    const isClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;

    return { branch, ahead, behind, staged, unstaged, untracked, isClean, isRepo: true };
  }

  /** 获取 diff */
  async getDiff(options?: { staged?: boolean; file?: string; commit?: string }): Promise<GitDiff> {
    let args = 'diff --numstat';
    if (options?.staged) args += ' --cached';
    if (options?.commit) args += ` ${options.commit}`;
    if (options?.file) args += ` -- ${options.file}`;

    const { stdout: numstatOutput } = await this.exec(args);
    const files = this.parseNumStat(numstatOutput);

    // 获取 patch
    let patchArgs = 'diff';
    if (options?.staged) patchArgs += ' --cached';
    if (options?.commit) patchArgs += ` ${options.commit}`;
    if (options?.file) patchArgs += ` -- ${options.file}`;
    const { stdout: patch } = await this.exec(patchArgs);

    return {
      files,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      patch,
    };
  }

  /** 暂存文件 */
  async stage(pattern: string): Promise<GitResult> {
    gitLogger.debug({ pattern }, 'Staging files');
    const { stdout, stderr } = await this.exec(`add ${pattern}`);
    if (stderr && !stdout) {
      gitLogger.error({ pattern, error: stderr }, 'Failed to stage files');
      return { success: false, message: stderr };
    }
    gitLogger.info({ pattern }, 'Files staged successfully');
    return { success: true, message: `已暂存: ${pattern}` };
  }

  /** 提交变更 */
  async commit(message: string, options?: { allowEmpty?: boolean; amend?: boolean }): Promise<GitResult> {
    gitLogger.debug({ message, options }, 'Creating commit');
    let args = `commit -m ${JSON.stringify(message)} --allow-empty-message`;
    if (options?.allowEmpty) args += ' --allow-empty';
    if (options?.amend) args += ' --amend';

    const { stdout, stderr } = await this.exec(args);
    if (stderr && !stdout) {
      // 检查是否是 "nothing to commit" 的情况
      if (stderr.includes('nothing to commit')) {
        gitLogger.info('No changes to commit');
        return { success: false, message: '没有可提交的变更' };
      }
      gitLogger.error({ message, error: stderr }, 'Commit failed');
      return { success: false, message: stderr };
    }
    gitLogger.info({ message }, 'Commit created successfully');
    return { success: true, message: stdout || '提交成功' };
  }

  /** 撤销最后一次提交（保留更改在工作区） */
  async undoLastCommit(): Promise<GitResult> {
    const { stdout, stderr } = await this.exec('reset --soft HEAD~1');
    if (stderr && !stdout) return { success: false, message: stderr };
    return { success: true, message: '已撤销最后一次提交，更改保留在工作区' };
  }

  /** 创建分支 */
  async createBranch(name: string, options?: { checkout?: boolean; from?: string }): Promise<GitResult> {
    let args = `branch ${name}`;
    if (options?.from) args += ` ${options.from}`;
    const { stdout, stderr } = await this.exec(args);
    if (stderr && !stdout) return { success: false, message: stderr };

    if (options?.checkout !== false) {
      await this.exec(`checkout ${name}`);
    }
    return { success: true, message: `分支 ${name} 已创建` };
  }

  /** 切换分支 */
  async checkout(ref: string): Promise<GitResult> {
    const { stdout, stderr } = await this.exec(`checkout ${ref}`);
    if (stderr && !stdout) return { success: false, message: stderr };
    return { success: true, message: `已切换到 ${ref}` };
  }

  /** 获取提交日志 */
  async getLog(options?: { count?: number; author?: string; since?: string; file?: string }): Promise<GitCommit[]> {
    let args = `log --format="%H|%h|%an|%ae|%aI|%s"`;
    if (options?.count) args += ` -${options.count}`;
    if (options?.author) args += ` --author="${options.author}"`;
    if (options?.since) args += ` --since="${options.since}"`;
    if (options?.file) args += ` -- ${options.file}`;

    const { stdout } = await this.exec(args);
    if (!stdout) return [];

    return stdout.split('\n').map(line => {
      const [hash, shortHash, author, email, date, ...messageParts] = line.split('|');
      const message = messageParts.join('|');
      return {
        hash,
        shortHash,
        author: `${author} <${email}>`,
        date,
        message,
        isAider: author.includes('(devflow)') || author.includes('(aider)') || message.startsWith('[devflow]'),
      };
    });
  }

  /** 获取最后一次提交的 hash */
  async getLastCommitHash(): Promise<string | null> {
    const { stdout } = await this.exec('rev-parse HEAD');
    return stdout || null;
  }

  /** 检查文件是否有未提交的更改 */
  async isDirty(files?: string[]): Promise<boolean> {
    const status = await this.getStatus();
    if (files) {
      const dirtyFiles = [...status.staged, ...status.unstaged].map(f => f.file);
      return files.some(f => dirtyFiles.includes(f));
    }
    return !status.isClean;
  }

  /** Stash 当前更改 */
  async stash(message?: string): Promise<GitResult> {
    gitLogger.debug({ message }, 'Stashing changes');
    const args = message ? `stash push -m ${JSON.stringify(message)}` : 'stash push';
    const { stdout, stderr } = await this.exec(args);
    if (stderr && !stdout) {
      gitLogger.error({ message, error: stderr }, 'Stash failed');
      return { success: false, message: stderr };
    }
    gitLogger.info({ message }, 'Changes stashed successfully');
    return { success: true, message: message ? `已暂存: ${message}` : '已暂存当前更改' };
  }

  /** 恢复 stash */
  async stashPop(): Promise<GitResult> {
    const { stdout, stderr } = await this.exec('stash pop');
    if (stderr && !stdout) return { success: false, message: stderr };
    return { success: true, message: '已恢复暂存的更改' };
  }

  /** 解析 numstat 输出 */
  private parseNumStat(output: string): Array<{ file: string; status: 'added' | 'modified' | 'deleted'; additions: number; deletions: number }> {
    if (!output) return [];
    return output.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split('\t');
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
        const file = parts[2] || parts[parts.length - 1];

        let status: 'added' | 'modified' | 'deleted' = 'modified';
        if (additions > 0 && deletions === 0) status = 'added';
        if (additions === 0 && deletions > 0) status = 'deleted';

        return { file, status, additions, deletions };
      });
  }
}
