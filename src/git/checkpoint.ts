import { promises as fs } from 'fs';
import path from 'path';
import type { GitCheckpoint, GitResult } from './types.js';
import { GitManager } from './manager.js';
import { BACKUP_DIR } from '../utils/paths.js';

/** 检查点存储目录 */
const CHECKPOINT_DIR = path.join(BACKUP_DIR, 'checkpoints');

/**
 * 检查点管理器
 * 基于 Git 分支/tag 的检查点系统，支持快速回滚
 */
export class CheckpointManager {
  private git: GitManager;
  private checkpoints: Map<string, GitCheckpoint> = new Map();

  constructor(cwd: string) {
    this.git = new GitManager(cwd);
  }

  /**
   * 创建检查点
   * @param description 检查点描述
   * @returns 检查点信息
   */
  async create(description?: string): Promise<GitResult> {
    if (!(await this.git.isRepo())) {
      return { success: false, message: '非 Git 仓库，无法创建检查点' };
    }

    const id = `cp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const branch = await this.git.getCurrentBranch();
    const commitHash = await this.git.getLastCommitHash();

    if (!commitHash) {
      return { success: false, message: '无法获取当前提交' };
    }

    // 创建 Git tag 作为检查点
    const tagMessage = description || `Checkpoint ${id}`;
    const { stderr } = await this.git.exec(`tag -a "devflow-${id}" -m ${JSON.stringify(tagMessage)}`);

    if (stderr && stderr.includes('already exists')) {
      return { success: false, message: '检查点已存在' };
    }

    const checkpoint: GitCheckpoint = {
      id,
      branch,
      commitHash,
      message: tagMessage,
      createdAt: Date.now(),
      description,
    };

    this.checkpoints.set(id, checkpoint);

    // 持久化到文件
    await this.saveCheckpoints();

    return {
      success: true,
      message: `检查点已创建: ${id}`,
      data: checkpoint,
    };
  }

  /**
   * 回滚到指定检查点
   */
  async rollback(checkpointId: string): Promise<GitResult> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false, message: `检查点 ${checkpointId} 不存在` };
    }

    const { stderr } = await this.git.exec(`reset --hard ${checkpoint.commitHash}`);
    if (stderr) {
      return { success: false, message: `回滚失败: ${stderr}` };
    }

    return {
      success: true,
      message: `已回滚到检查点 ${checkpointId} (${checkpoint.commitHash.substring(0, 7)})`,
    };
  }

  /**
   * 列出所有检查点
   */
  async list(): Promise<GitCheckpoint[]> {
    // 先从 Git tags 加载
    await this.loadFromGit();

    // 再从文件加载
    await this.loadCheckpoints();

    return Array.from(this.checkpoints.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 删除检查点
   */
  async delete(checkpointId: string): Promise<GitResult> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false, message: `检查点 ${checkpointId} 不存在` };
    }

    // 删除 Git tag
    await this.git.exec(`tag -d "devflow-${checkpointId}"`);

    this.checkpoints.delete(checkpointId);
    await this.saveCheckpoints();

    return { success: true, message: `检查点 ${checkpointId} 已删除` };
  }

  /**
   * 从 Git tags 加载检查点
   */
  private async loadFromGit(): Promise<void> {
    const { stdout } = await this.git.exec('tag -l "devflow-cp-*" --format="%(refname:short)|%(objectname:short)|%(contents)"');
    if (!stdout) return;

    for (const line of stdout.split('\n')) {
      const [tagRef, commitHash, message] = line.split('|');
      if (!tagRef) continue;

      const id = tagRef.replace('devflow-', '');
      if (!this.checkpoints.has(id)) {
        this.checkpoints.set(id, {
          id,
          branch: '',
          commitHash: commitHash || '',
          message: message || '',
          createdAt: 0, // 从 Git tag 无法获取创建时间
        });
      }
    }
  }

  /**
   * 从文件加载检查点元数据
   */
  private async loadCheckpoints(): Promise<void> {
    try {
      const content = await fs.readFile(CHECKPOINT_DIR, 'utf8');
      const data = JSON.parse(content);
      for (const cp of data) {
        this.checkpoints.set(cp.id, cp);
      }
    } catch {
      // 文件不存在，忽略
    }
  }

  /**
   * 保存检查点元数据到文件
   */
  private async saveCheckpoints(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(CHECKPOINT_DIR), { recursive: true });
      const data = Array.from(this.checkpoints.values());
      await fs.writeFile(CHECKPOINT_DIR, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // 忽略写入错误
    }
  }
}
