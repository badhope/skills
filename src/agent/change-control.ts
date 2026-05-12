/**
 * 变更控制系统模块 (Change Control System)
 *
 * 提供 AI Agent 操作文件和执行命令时的安全控制能力，包括：
 * 1. 风险评估 - 根据操作类型和目标路径自动评估风险等级
 * 2. 文件备份 - 在高风险操作前自动备份文件
 * 3. 用户批准流程 - 对中高风险操作请求用户确认
 * 4. 快照与回滚 - 支持将文件恢复到修改前的状态
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { BACKUP_DIR } from '../utils/index.js';

// ==================== 枚举与接口 ====================

/**
 * 风险级别枚举
 * 从 NEGLIGIBLE 到 CRITICAL 递增，级别越高风险越大
 */
export enum RiskLevel {
  NEGLIGIBLE = 'negligible',   // 可忽略（读操作）
  LOW = 'low',                 // 低风险（创建新文件）
  MEDIUM = 'medium',           // 中风险（修改现有文件）
  HIGH = 'high',               // 高风险（修改配置文件/系统文件）
  CRITICAL = 'critical',       // 危险（删除文件/批量修改）
}

/**
 * 变更记录接口
 * 描述一次文件或命令操作的完整信息
 */
export interface ChangeRecord {
  /** 唯一标识符 */
  id: string;
  /** 操作类型 */
  action: 'read' | 'create' | 'modify' | 'delete' | 'move' | 'shell';
  /** 操作目标（文件路径或命令） */
  target: string;
  /** 风险等级 */
  risk: RiskLevel;
  /** 是否已备份 */
  backedUp: boolean;
  /** 备份文件路径 */
  backupPath?: string;
  /** 是否已获批准 */
  approved: boolean;
  /** 操作时间戳 */
  timestamp: number;
  /** 修改前的文件内容快照（用于回滚） */
  snapshot?: string;
}

// ==================== 风险规则常量 ====================

/**
 * 风险级别的数值权重，用于比较和聚合
 */
const RISK_LEVEL_WEIGHT: Record<RiskLevel, number> = {
  [RiskLevel.NEGLIGIBLE]: 0,
  [RiskLevel.LOW]: 1,
  [RiskLevel.MEDIUM]: 2,
  [RiskLevel.HIGH]: 3,
  [RiskLevel.CRITICAL]: 4,
};

/**
 * 风险级别的中文标签
 */
const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  [RiskLevel.NEGLIGIBLE]: '可忽略',
  [RiskLevel.LOW]: '低风险',
  [RiskLevel.MEDIUM]: '中风险',
  [RiskLevel.HIGH]: '高风险',
  [RiskLevel.CRITICAL]: '危险',
};

/**
 * 风险级别的 chalk 颜色样式
 */
const RISK_LEVEL_STYLE: Record<RiskLevel, (text: string) => string> = {
  [RiskLevel.NEGLIGIBLE]: chalk.gray,
  [RiskLevel.LOW]: chalk.green,
  [RiskLevel.MEDIUM]: chalk.yellow,
  [RiskLevel.HIGH]: chalk.hex('#FFA500'),
  [RiskLevel.CRITICAL]: chalk.red.bold,
};

/**
 * 预定义的风险规则列表
 *
 * 规则按优先级排列，后面的规则如果匹配到更高风险等级，会覆盖前面的结果。
 * 每条规则包含：
 * - pattern: 匹配目标路径或命令的正则表达式
 * - action: 适用的操作类型列表
 * - risk: 匹配时的风险等级
 * - reason: 风险原因说明
 */
export const RISK_RULES: Array<{
  pattern: RegExp;
  action: string[];
  risk: RiskLevel;
  reason: string;
}> = [
  // 读操作 - 可忽略
  { pattern: /.*/, action: ['read'], risk: RiskLevel.NEGLIGIBLE, reason: '读取操作无风险' },

  // 创建新文件 - 低风险
  { pattern: /.*/, action: ['create'], risk: RiskLevel.LOW, reason: '创建新文件' },

  // 修改操作 - 中风险（默认）
  { pattern: /.*/, action: ['modify'], risk: RiskLevel.MEDIUM, reason: '修改现有文件' },

  // 移动操作 - 中风险
  { pattern: /.*/, action: ['move'], risk: RiskLevel.MEDIUM, reason: '移动文件' },

  // 删除操作 - 危险
  { pattern: /.*/, action: ['delete'], risk: RiskLevel.CRITICAL, reason: '删除文件' },

  // 系统文件 - 高风险（修改或删除时）
  { pattern: /(\/etc\/|\/usr\/|\/bin\/|\/sbin\/|C:\\Windows|C:\\Program)/i, action: ['modify', 'delete'], risk: RiskLevel.CRITICAL, reason: '系统关键文件' },

  // 配置文件 - 高风险（修改或删除时）
  { pattern: /\.(json|yaml|yml|toml|ini|conf|cfg|env)$/i, action: ['modify', 'delete'], risk: RiskLevel.HIGH, reason: '配置文件修改' },

  // node_modules - 低风险（可恢复）
  { pattern: /node_modules/, action: ['modify', 'delete'], risk: RiskLevel.LOW, reason: '依赖目录，可恢复' },

  // .git 目录 - 高风险（修改或删除时）
  { pattern: /\.git/, action: ['modify', 'delete'], risk: RiskLevel.CRITICAL, reason: 'Git 版本控制目录' },

  // shell 命令 - 根据内容评估
  { pattern: /rm\s+-rf|del\s+\/s/i, action: ['shell'], risk: RiskLevel.CRITICAL, reason: '强制删除命令' },
  { pattern: /DROP\s+TABLE|TRUNCATE/i, action: ['shell'], risk: RiskLevel.CRITICAL, reason: '数据库破坏性命令' },
  { pattern: /sudo|admin/i, action: ['shell'], risk: RiskLevel.HIGH, reason: '需要管理员权限' },
  { pattern: /npm\s+install|yarn|pnpm/i, action: ['shell'], risk: RiskLevel.LOW, reason: '包安装命令' },
  { pattern: /npm\s+run|yarn\s+run/i, action: ['shell'], risk: RiskLevel.LOW, reason: '脚本运行命令' },
  { pattern: /git\s+(commit|push|merge|rebase)/i, action: ['shell'], risk: RiskLevel.MEDIUM, reason: 'Git 写操作' },
  { pattern: /docker\s+(build|run|push)/i, action: ['shell'], risk: RiskLevel.MEDIUM, reason: 'Docker 操作' },
];

// ==================== 核心函数 ====================

/**
 * 风险评估 - 根据操作类型和目标评估风险等级
 *
 * 遍历所有预定义的风险规则，找到匹配的规则并返回最高风险等级。
 * 支持多条规则同时匹配，最终取风险最高的结果。
 *
 * @param action - 操作类型（read/create/modify/delete/move/shell）
 * @param target - 操作目标（文件路径或 shell 命令）
 * @returns 风险评估结果，包含风险等级、原因和匹配的规则列表
 *
 * @example
 * ```typescript
 * const result = assessRisk('delete', '/etc/config.yaml');
 * // result.risk === RiskLevel.CRITICAL
 * // result.reason 包含 '删除文件' 和 '系统关键文件' 等原因
 * ```
 */
export function assessRisk(
  action: ChangeRecord['action'],
  target: string
): { risk: RiskLevel; reason: string; rules: string[] } {
  let maxRisk = RiskLevel.NEGLIGIBLE;
  const matchedRules: string[] = [];
  const reasons: string[] = [];

  for (const rule of RISK_RULES) {
    // 检查操作类型是否匹配
    if (!rule.action.includes(action)) {
      continue;
    }

    // 检查目标是否匹配正则
    if (!rule.pattern.test(target)) {
      continue;
    }

    // 记录匹配的规则
    matchedRules.push(rule.reason);
    reasons.push(rule.reason);

    // 取最高风险等级
    if (RISK_LEVEL_WEIGHT[rule.risk] > RISK_LEVEL_WEIGHT[maxRisk]) {
      maxRisk = rule.risk;
    }
  }

  // 如果没有匹配到任何规则，默认为中风险
  if (matchedRules.length === 0) {
    return {
      risk: RiskLevel.MEDIUM,
      reason: '未匹配到已知规则，默认中风险',
      rules: ['默认规则'],
    };
  }

  return {
    risk: maxRisk,
    reason: reasons.join('；'),
    rules: matchedRules,
  };
}

/**
 * 文件备份 - 将文件复制到备份目录
 *
 * 在 `~/.devflow/backups/` 目录下创建备份文件。
 * 备份文件名格式：`原文件名_时间戳.bak`
 * 如果源文件不存在，返回成功但不创建备份。
 *
 * @param filePath - 需要备份的文件路径
 * @returns 备份结果，包含是否成功、备份路径或错误信息
 *
 * @example
 * ```typescript
 * const result = await backupFile('/project/config.json');
 * if (result.success) {
 *   console.log(`备份已创建: ${result.backupPath}`);
 * }
 * ```
 */
export async function backupFile(
  filePath: string
): Promise<{ success: boolean; backupPath?: string; error?: string }> {
  try {
    // 检查源文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      // 文件不存在，返回成功但不创建备份
      return { success: true };
    }

    // 构建备份目录路径
    const backupDir = BACKUP_DIR;
    await fs.mkdir(backupDir, { recursive: true });

    // 构建备份文件名：原文件名_时间戳.bak
    const parsedPath = path.parse(filePath);
    const timestamp = Date.now();
    const backupFileName = `${parsedPath.name}_${timestamp}.bak`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // 复制文件到备份目录
    await fs.copyFile(filePath, backupFilePath);

    return {
      success: true,
      backupPath: backupFilePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `备份失败: ${errorMessage}`,
    };
  }
}

/**
 * 创建快照 - 读取文件当前内容作为快照
 *
 * 快照用于后续回滚操作，将文件内容保存在内存中。
 * 如果文件不存在，返回 null。
 *
 * @param filePath - 需要创建快照的文件路径
 * @returns 文件内容字符串，文件不存在时返回 null
 *
 * @example
 * ```typescript
 * const snapshot = await createSnapshot('/project/config.json');
 * if (snapshot !== null) {
 *   // 快照已创建，可以用于后续回滚
 *   console.log(`快照大小: ${snapshot.length} 字节`);
 * }
 * ```
 */
export async function createSnapshot(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    const MAX_SNAPSHOT_SIZE = 10 * 1024 * 1024; // 10MB
    if (stat.size > MAX_SNAPSHOT_SIZE) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch {
    // 文件不存在或无法读取
    return null;
  }
}

/**
 * 回滚 - 将文件恢复到修改前的状态
 *
 * 使用变更记录中保存的快照内容，将文件恢复到修改前的状态。
 * 如果没有快照，则尝试从备份路径恢复。
 *
 * @param change - 变更记录，包含快照或备份路径
 * @returns 回滚结果，包含是否成功或错误信息
 *
 * @example
 * ```typescript
 * const result = await rollback(changeRecord);
 * if (result.success) {
 *   console.log('文件已回滚到修改前的状态');
 * }
 * ```
 */
export async function rollback(
  change: ChangeRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    // 优先使用快照回滚
    if (change.snapshot !== undefined) {
      // 确保目标文件所在目录存在
      const targetDir = path.dirname(change.target);
      await fs.mkdir(targetDir, { recursive: true });

      // 将快照内容写入目标文件
      await fs.writeFile(change.target, change.snapshot, 'utf-8');
      return { success: true };
    }

    // 其次尝试从备份路径恢复
    if (change.backupPath) {
      try {
        await fs.access(change.backupPath);
      } catch {
        return {
          success: false,
          error: `备份文件不存在: ${change.backupPath}`,
        };
      }

      // 确保目标文件所在目录存在
      const targetDir = path.dirname(change.target);
      await fs.mkdir(targetDir, { recursive: true });

      // 从备份复制回目标文件
      await fs.copyFile(change.backupPath, change.target);
      return { success: true };
    }

    return {
      success: false,
      error: '没有可用的快照或备份，无法回滚',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `回滚失败: ${errorMessage}`,
    };
  }
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ==================== ChangeControlManager 类 ====================

/**
 * 变更控制管理器
 *
 * 提供完整的变更控制流程，包括：
 * - 记录变更
 * - 评估风险并请求批准
 * - 执行带保护的变更（自动备份 + 风险评估 + 审批）
 * - 变更历史查询与统计
 *
 * @example
 * ```typescript
 * const manager = new ChangeControlManager();
 *
 * // 执行带保护的变更
 * const result = await manager.executeProtectedChange(
 *   'modify',
 *   '/project/config.json',
 *   async () => {
 *     await fs.writeFile('/project/config.json', newContent);
 *     return '修改完成';
 *   }
 * );
 * ```
 */
export class ChangeControlManager {
  /** 变更记录列表 */
  private records: ChangeRecord[] = [];
  /** 是否启用变更控制 */
  private enabled: boolean = true;

  /**
   * 记录一个变更
   *
   * 创建变更记录并添加到历史列表中。不执行风险评估和审批流程。
   *
   * @param action - 操作类型
   * @param target - 操作目标
   * @returns 创建的变更记录
   */
  recordChange(
    action: ChangeRecord['action'],
    target: string
  ): ChangeRecord {
    const { risk, reason } = assessRisk(action, target);

    const record: ChangeRecord = {
      id: generateId(),
      action,
      target,
      risk,
      backedUp: false,
      approved: risk === RiskLevel.NEGLIGIBLE || risk === RiskLevel.LOW,
      timestamp: Date.now(),
    };

    this.records.push(record);

    // 自动清理旧记录（保留最近 500 条）
    if (this.records.length > 500) {
      this.records = this.records.slice(-400);
    }

    // 在控制台输出变更记录
    const style = RISK_LEVEL_STYLE[risk];
    console.log(
      chalk.dim(`[变更记录] `) +
      `${style(`[${RISK_LEVEL_LABEL[risk]}]`)} ` +
      `${chalk.cyan(action)} ` +
      chalk.dim(target) +
      (reason ? chalk.dim(` (${reason})`) : '')
    );

    return record;
  }

  /**
   * 评估并请求批准
   *
   * 对操作进行风险评估，如果风险等级达到 MEDIUM 或以上，
   * 则在终端中请求用户确认。
   *
   * @param action - 操作类型
   * @param target - 操作目标
   * @returns 批准结果和对应的变更记录
   */
  async evaluateAndApprove(
    action: ChangeRecord['action'],
    target: string
  ): Promise<{ approved: boolean; record: ChangeRecord }> {
    const { risk, reason, rules } = assessRisk(action, target);

    const record: ChangeRecord = {
      id: generateId(),
      action,
      target,
      risk,
      backedUp: false,
      approved: false,
      timestamp: Date.now(),
    };

    // 低风险操作自动批准
    if (RISK_LEVEL_WEIGHT[risk] < RISK_LEVEL_WEIGHT[RiskLevel.MEDIUM]) {
      record.approved = true;
      this.records.push(record);
      return { approved: true, record };
    }

    // 中风险及以上需要用户确认
    console.log('');
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log(chalk.bold('  变更控制 - 操作审批'));
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log('');
    console.log(chalk.cyan('  操作类型: ') + chalk.white(action));
    console.log(chalk.cyan('  操作目标: ') + chalk.white(target));
    console.log(chalk.cyan('  风险等级: ') + RISK_LEVEL_STYLE[risk](`[${RISK_LEVEL_LABEL[risk]}]`));
    console.log(chalk.cyan('  风险原因: ') + chalk.white(reason));
    console.log(chalk.cyan('  匹配规则: ') + chalk.white(rules.join('、')));
    console.log('');

    // 非交互模式下默认拒绝中高风险操作
    if (!process.stdin.isTTY) {
      console.log(chalk.yellow('[非交互模式] 检测到需要审批的操作，默认拒绝。'));
      console.log('');
      this.records.push(record);
      return { approved: false, record };
    }

    // 使用 inquirer 请求用户确认
    try {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: '是否批准执行以上操作？',
        default: false,
      }]);

      record.approved = confirmed;
      this.records.push(record);

      if (confirmed) {
        console.log(chalk.green('  操作已批准，继续执行。'));
      } else {
        console.log(chalk.yellow('  操作已拒绝。'));
      }
      console.log('');

      return { approved: confirmed, record };
    } catch {
      console.log(chalk.yellow('\n  用户中断，默认拒绝。'));
      this.records.push(record);
      return { approved: false, record };
    }
  }

  /**
   * 执行带保护的变更
   *
   * 完整的变更保护流程：
   * 1. 评估风险
   * 2. 如果风险 >= HIGH，自动备份文件
   * 3. 如果风险 >= MEDIUM，请求用户确认
   * 4. 如果风险 >= HIGH，创建快照
   * 5. 执行操作
   * 6. 记录变更
   *
   * @param action - 操作类型
   * @param target - 操作目标
   * @param executeFn - 实际执行操作的异步函数
   * @returns 执行结果，包含是否成功、操作返回值和变更记录
   */
  async executeProtectedChange(
    action: ChangeRecord['action'],
    target: string,
    executeFn: () => Promise<unknown>
  ): Promise<{ success: boolean; result?: unknown; record: ChangeRecord }> {
    // 如果变更控制已禁用，直接执行
    if (!this.enabled) {
      const record = this.recordChange(action, target);
      try {
        const result = await executeFn();
        return { success: true, result, record };
      } catch (error) {
        return { success: false, record };
      }
    }

    // 步骤 1: 评估风险
    const { risk, reason, rules } = assessRisk(action, target);

    const record: ChangeRecord = {
      id: generateId(),
      action,
      target,
      risk,
      backedUp: false,
      approved: false,
      timestamp: Date.now(),
    };

    // 步骤 2: 如果风险 >= HIGH，自动备份文件（仅对文件操作）
    if (RISK_LEVEL_WEIGHT[risk] >= RISK_LEVEL_WEIGHT[RiskLevel.HIGH]) {
      if (action !== 'shell' && action !== 'read') {
        const backupResult = await backupFile(target);
        if (backupResult.success && backupResult.backupPath) {
          record.backedUp = true;
          record.backupPath = backupResult.backupPath;
          console.log(chalk.green(`[变更控制] 已创建备份: ${backupResult.backupPath}`));
        } else if (backupResult.error) {
          console.log(chalk.yellow(`[变更控制] 备份失败: ${backupResult.error}`));
        }
      }
    }

    // 步骤 3: 如果风险 >= MEDIUM，请求用户确认
    if (RISK_LEVEL_WEIGHT[risk] >= RISK_LEVEL_WEIGHT[RiskLevel.MEDIUM]) {
      console.log('');
      console.log(chalk.bold('═══════════════════════════════════════'));
      console.log(chalk.bold('  变更控制 - 受保护操作'));
      console.log(chalk.bold('═══════════════════════════════════════'));
      console.log('');
      console.log(chalk.cyan('  操作类型: ') + chalk.white(action));
      console.log(chalk.cyan('  操作目标: ') + chalk.white(target));
      console.log(chalk.cyan('  风险等级: ') + RISK_LEVEL_STYLE[risk](`[${RISK_LEVEL_LABEL[risk]}]`));
      console.log(chalk.cyan('  风险原因: ') + chalk.white(reason));
      console.log(chalk.cyan('  匹配规则: ') + chalk.white(rules.join('、')));

      if (record.backedUp) {
        console.log(chalk.cyan('  备份状态: ') + chalk.green(`已备份 (${record.backupPath})`));
      }
      console.log('');

      // 非交互模式下默认拒绝中高风险操作
      if (!process.stdin.isTTY) {
        console.log(chalk.yellow('[非交互模式] 检测到需要审批的操作，默认拒绝。'));
        console.log('');
        this.records.push(record);
        return { success: false, record };
      }

      try {
        const { confirmed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmed',
          message: '是否批准执行以上操作？',
          default: false,
        }]);

        if (!confirmed) {
          record.approved = false;
          this.records.push(record);
          console.log(chalk.yellow('  操作已拒绝。'));
          console.log('');
          return { success: false, record };
        }

        record.approved = true;
        console.log(chalk.green('  操作已批准，继续执行。'));
        console.log('');
      } catch {
        console.log(chalk.yellow('\n  用户中断，默认拒绝。'));
        record.approved = false;
        this.records.push(record);
        console.log('');
        return { success: false, record };
      }
    } else {
      // 低风险操作自动批准
      record.approved = true;
    }

    // 步骤 4: 如果风险 >= HIGH，创建快照（仅对文件操作）
    if (RISK_LEVEL_WEIGHT[risk] >= RISK_LEVEL_WEIGHT[RiskLevel.HIGH]) {
      if (action !== 'shell' && action !== 'read') {
        const snapshot = await createSnapshot(target);
        if (snapshot !== null) {
          record.snapshot = snapshot;
          console.log(chalk.green(`[变更控制] 已创建快照 (${snapshot.length} 字节)`));
        }
      }
    }

    // 步骤 5: 执行操作
    try {
      const result = await executeFn();

      // 步骤 6: 记录变更
      this.records.push(record);

      console.log(
        chalk.dim(`[变更控制] `) +
        chalk.green('操作执行成功') +
        chalk.dim(` [${record.id.slice(0, 8)}]`)
      );

      return { success: true, result, record };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.records.push(record);

      console.log(
        chalk.dim(`[变更控制] `) +
        chalk.red('操作执行失败') +
        chalk.dim(`: ${errorMessage} [${record.id.slice(0, 8)}]`)
      );

      return { success: false, record };
    }
  }

  /**
   * 获取变更历史
   *
   * @returns 所有变更记录列表（按时间升序排列）
   */
  getHistory(): ChangeRecord[] {
    return [...this.records];
  }

  /**
   * 获取变更统计
   *
   * @returns 统计信息，包含总数、按风险等级分布和按操作类型分布
   */
  getStats(): {
    total: number;
    byRisk: Record<RiskLevel, number>;
    byAction: Record<string, number>;
  } {
    const byRisk: Record<RiskLevel, number> = {
      [RiskLevel.NEGLIGIBLE]: 0,
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.CRITICAL]: 0,
    };

    const byAction: Record<string, number> = {};

    for (const record of this.records) {
      byRisk[record.risk]++;
      byAction[record.action] = (byAction[record.action] || 0) + 1;
    }

    return {
      total: this.records.length,
      byRisk,
      byAction,
    };
  }

  /**
   * 清空变更历史
   */
  clearHistory(): void {
    this.records = [];
    console.log(chalk.dim('[变更控制] 历史记录已清空'));
  }

  /**
   * 启用或禁用变更控制
   *
   * 禁用后，所有操作将跳过风险评估和审批流程，直接执行。
   *
   * @param enabled - 是否启用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    const status = enabled ? chalk.green('已启用') : chalk.red('已禁用');
    console.log(chalk.dim(`[变更控制] 变更控制${status}`));
  }
}
