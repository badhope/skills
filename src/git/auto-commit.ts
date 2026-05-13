import type { AutoCommitConfig, GitResult } from './types.js';
import { GitManager } from './manager.js';

/** 默认自动提交配置 */
export const DEFAULT_AUTO_COMMIT_CONFIG: AutoCommitConfig = {
  enabled: true,
  authorName: 'DevFlow Agent',
  authorEmail: 'devflow@agent.local',
  commitPrefix: 'feat',
};

/**
 * 自动提交引擎
 * 在 AI 编辑文件后自动创建 Git 提交
 */
export class AutoCommitEngine {
  private git: GitManager;
  private config: AutoCommitConfig;

  constructor(cwd: string, config?: Partial<AutoCommitConfig>) {
    this.git = new GitManager(cwd);
    this.config = { ...DEFAULT_AUTO_COMMIT_CONFIG, ...config };
  }

  /** 更新配置 */
  updateConfig(config: Partial<AutoCommitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 获取当前配置 */
  getConfig(): AutoCommitConfig {
    return { ...this.config };
  }

  /**
   * 自动提交变更文件
   * @param changedFiles 被修改的文件列表
   * @param taskDescription 任务描述（用于生成提交信息）
   * @returns 提交结果
   */
  async autoCommit(changedFiles: string[], taskDescription: string): Promise<GitResult> {
    if (!this.config.enabled) {
      return { success: false, message: '自动提交已禁用' };
    }

    if (!(await this.git.isRepo())) {
      return { success: false, message: '当前目录不是 Git 仓库' };
    }

    if (changedFiles.length === 0) {
      return { success: false, message: '没有变更文件需要提交' };
    }

    // 过滤文件
    const filesToCommit = this.filterFiles(changedFiles);
    if (filesToCommit.length === 0) {
      return { success: false, message: '没有匹配的文件需要提交' };
    }

    // 暂存文件
    for (const file of filesToCommit) {
      await this.git.stage(file);
    }

    // 生成提交信息
    const commitMessage = this.generateCommitMessage(filesToCommit, taskDescription);

    // 设置 AI 作者信息
    await this.git.exec(`config user.name "${this.config.authorName}"`);
    await this.git.exec(`config user.email "${this.config.authorEmail}"`);

    // 提交
    const result = await this.git.commit(commitMessage);
    return result;
  }

  /**
   * 生成 Conventional Commits 格式的提交信息
   */
  private generateCommitMessage(files: string[], description: string): string {
    const prefix = this.config.commitPrefix;

    // 从描述中提取简短摘要（最多50字符）
    const summary = description.length > 50
      ? description.substring(0, 47) + '...'
      : description;

    // 文件列表摘要
    const fileSummary = files.length <= 3
      ? files.join(', ')
      : `${files.slice(0, 3).join(', ')} 等 ${files.length} 个文件`;

    return `[devflow] ${prefix}: ${summary}\n\n${fileSummary}\n\nCo-authored-by: ${this.config.authorName} <${this.config.authorEmail}>`;
  }

  /**
   * 根据配置过滤文件
   */
  private filterFiles(files: string[]): string[] {
    let filtered = files;

    if (this.config.includePattern) {
      filtered = filtered.filter(f => this.config.includePattern!.test(f));
    }

    if (this.config.excludePattern) {
      filtered = filtered.filter(f => !this.config.excludePattern!.test(f));
    }

    return filtered;
  }

  /**
   * 检查是否有未提交的 AI 更改
   */
  async hasUncommittedChanges(): Promise<boolean> {
    return this.git.isDirty();
  }

  /**
   * 获取自指定提交以来的变更
   */
  async getChangesSince(sinceCommit?: string): Promise<{ files: string[]; diff: string }> {
    const diff = await this.git.getDiff({ commit: sinceCommit ? `${sinceCommit}..HEAD` : undefined });
    return {
      files: diff.files.map(f => f.file),
      diff: diff.patch,
    };
  }
}
