/**
 * 信任管理器模块 (Trust Manager) - 增强版
 *
 * 提供 AI 输出的信任评估能力，包括：
 * 1. 问题检测 - 检测幻觉、危险操作、敏感信息等
 * 2. 透明报告 - 生成人类可读的信任报告
 * 3. 用户确认机制 - 在终端中让用户确认高风险操作
 * 4. 信任评分系统 - 综合评估输出可信度
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

// 从子模块导入类型和常量
import {
  TrustLevel,
  TrustIssue,
  DANGEROUS_PATTERNS,
  TRUST_LEVEL_WEIGHT,
  TRUST_LEVEL_LABEL,
  TRUST_LEVEL_STYLE,
  ISSUE_TYPE_LABEL,
  ISSUE_TYPE_SUGGESTION,
} from './trust-types.js';

// 从子模块导入检测逻辑
import { detectIssues, TrustDetector, DetectionContext } from './trust-detector.js';

// Re-export 所有类型和常量
export {
  TrustLevel,
  TrustIssue,
  DANGEROUS_PATTERNS,
  TRUST_LEVEL_WEIGHT,
  TRUST_LEVEL_LABEL,
  TRUST_LEVEL_STYLE,
  ISSUE_TYPE_LABEL,
  ISSUE_TYPE_SUGGESTION,
};

// Re-export 检测函数和类
export { detectIssues, TrustDetector, DetectionContext };

// ==================== Types ====================

/**
 * 信任报告接口
 */
export interface TrustReport {
  /** 整体风险级别 */
  level: TrustLevel;
  /** 一句话总结 */
  summary: string;
  /** 详细问题列表 */
  details: string[];
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 信任评分 (0-100) */
  score: number;
  /** 问题统计 */
  statistics: {
    total: number;
    byType: Record<string, number>;
    byLevel: Record<string, number>;
  };
}

/**
 * 确认选项
 */
export interface ConfirmationOptions {
  /** 是否允许跳过确认 */
  allowSkip?: boolean;
  /** 自定义确认消息 */
  customMessage?: string;
  /** 高风险操作的默认行为 */
  highRiskDefault?: 'reject' | 'confirm' | 'ask';
}

// ==================== Trust Score Calculator ====================

/**
 * 计算信任评分
 *
 * 基于检测到的问题计算综合信任评分 (0-100)。
 * 评分越高表示越可信。
 *
 * @param issues - 检测到的信任问题列表
 * @returns 信任评分 (0-100)
 */
export function calculateTrustScore(issues: TrustIssue[]): number {
  if (issues.length === 0) {
    return 100;
  }

  // 基础分数
  let score = 100;

  // 根据问题级别扣分
  const penalties: Record<TrustLevel, number> = {
    [TrustLevel.SAFE]: 0,
    [TrustLevel.LOW]: 5,
    [TrustLevel.MEDIUM]: 15,
    [TrustLevel.HIGH]: 30,
    [TrustLevel.CRITICAL]: 50,
  };

  // 计算总扣分
  let totalPenalty = 0;
  for (const issue of issues) {
    totalPenalty += penalties[issue.level];
  }

  // 应用衰减系数（问题越多，每个问题的权重越高）
  const decayFactor = 1 + Math.log10(1 + issues.length * 0.5);
  const adjustedPenalty = totalPenalty * decayFactor;

  // 计算最终分数
  score = Math.max(0, Math.round(100 - adjustedPenalty));

  return score;
}

/**
 * 获取评分等级描述
 */
export function getScoreGrade(score: number): { grade: string; color: (text: string) => string } {
  if (score >= 90) {
    return { grade: 'A', color: chalk.green };
  } else if (score >= 75) {
    return { grade: 'B', color: chalk.hex('#90EE90') };
  } else if (score >= 60) {
    return { grade: 'C', color: chalk.yellow };
  } else if (score >= 40) {
    return { grade: 'D', color: chalk.hex('#FFA500') };
  } else {
    return { grade: 'F', color: chalk.red };
  }
}

// ==================== Core Functions ====================

/**
 * 生成人类可读的信任报告
 *
 * 将检测到的问题汇总为结构化的报告，包含整体风险级别、
 * 一句话总结、详细问题列表，以及是否需要用户确认的判断。
 *
 * @param issues - 检测到的信任问题列表
 * @returns 信任报告对象
 *
 * @example
 * ```typescript
 * const report = generateTrustReport(issues);
 * console.log(report.summary);        // 一句话总结
 * console.log(report.details);        // 详细问题列表
 * console.log(report.requiresConfirmation); // 是否需要确认
 * ```
 */
export function generateTrustReport(issues: TrustIssue[]): TrustReport {
  // 如果没有问题，返回安全报告
  if (issues.length === 0) {
    return {
      level: TrustLevel.SAFE,
      summary: '未检测到信任问题，输出内容安全。',
      details: [],
      requiresConfirmation: false,
      score: 100,
      statistics: {
        total: 0,
        byType: {},
        byLevel: {},
      },
    };
  }

  // 确定最高风险级别
  const maxLevel = issues.reduce(
    (max, issue) => TRUST_LEVEL_WEIGHT[issue.level] > TRUST_LEVEL_WEIGHT[max]
      ? issue.level
      : max,
    issues[0].level
  );

  // 统计问题
  const statistics = calculateStatistics(issues);

  // 生成一句话总结
  const typeSummary = Object.entries(statistics.byType)
    .map(([type, count]) => `${ISSUE_TYPE_LABEL[type as TrustIssue['type']]}${count}项`)
    .join('、');

  const summary = `检测到 ${issues.length} 个信任问题（${typeSummary}），最高风险级别: ${TRUST_LEVEL_LABEL[maxLevel]}`;

  // 生成详细问题列表
  const details = issues.map((issue, index) => {
    const levelTag = TRUST_LEVEL_STYLE[issue.level](
      `[${TRUST_LEVEL_LABEL[issue.level]}]`
    );
    const typeTag = ISSUE_TYPE_LABEL[issue.type];
    return `${index + 1}. ${levelTag} ${typeTag} - ${issue.description}\n   建议: ${issue.suggestion}`;
  });

  // 计算信任评分
  const score = calculateTrustScore(issues);

  return {
    level: maxLevel,
    summary,
    details,
    requiresConfirmation: shouldRequireConfirmation(issues),
    score,
    statistics,
  };
}

/**
 * 计算问题统计
 */
function calculateStatistics(issues: TrustIssue[]): TrustReport['statistics'] {
  const byType: Record<string, number> = {};
  const byLevel: Record<string, number> = {};

  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
    byLevel[issue.level] = (byLevel[issue.level] || 0) + 1;
  }

  return {
    total: issues.length,
    byType,
    byLevel,
  };
}

/**
 * 格式化输出 - 在 AI 输出中添加信任标注
 *
 * 对输出文本中的风险内容添加可视化的标记：
 * - 不确定的内容用黄色 [?] 标记
 * - 危险操作用红色 [!] 标记
 * - 确认安全的内容用绿色 [v] 标记
 *
 * @param output - AI 的原始输出文本
 * @param issues - 检测到的信任问题列表
 * @returns 添加了信任标注的格式化文本
 *
 * @example
 * ```typescript
 * const formatted = formatTrustOutput(aiOutput, issues);
 * console.log(formatted);
 * // 输出中会包含 [?]、[!]、[v] 等标记
 * ```
 */
export function formatTrustOutput(output: string, issues: TrustIssue[]): string {
  if (issues.length === 0) {
    // 没有问题，在开头添加安全标记
    return chalk.green('[v] ') + output;
  }

  let formatted = output;

  // 收集所有需要标注的匹配位置
  type Annotation = {
    start: number;
    end: number;
    prefix: string;
  };
  const annotations: Annotation[] = [];

  for (const issue of issues) {
    // 找到对应的匹配模式
    const matched = DANGEROUS_PATTERNS.find(p => p.description === issue.description);
    if (!matched) continue;

    // 重置正则的 lastIndex（因为可能之前 test 过）
    const regex = new RegExp(matched.pattern.source, matched.pattern.flags);
    let match: RegExpExecArray | null;
    const MAX_ANNOTATIONS = 50;
    let matchCount = 0;

    while ((match = regex.exec(formatted)) !== null && matchCount < MAX_ANNOTATIONS) {
      matchCount++;
      const start = match.index;
      const end = start + match[0].length;

      // 根据问题类型选择标记
      let prefix: string;
      switch (issue.type) {
        case 'uncertainty':
        case 'hallucination':
          prefix = chalk.yellow('[?]');
          break;
        case 'dangerous':
        case 'destructive':
          prefix = chalk.red('[!]');
          break;
        case 'sensitive':
          prefix = chalk.hex('#FFA500')('[*]');
          break;
        default:
          prefix = chalk.yellow('[?]');
      }

      annotations.push({ start, end, prefix });

      // 防止无限循环（零长度匹配）
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  // 按位置倒序排列，从后往前插入标记，避免偏移量问题
  annotations.sort((a, b) => b.start - a.start);

  // 插入标记
  for (const annotation of annotations) {
    formatted =
      formatted.slice(0, annotation.start) +
      annotation.prefix + ' ' +
      formatted.slice(annotation.start, annotation.end) +
      formatted.slice(annotation.end);
  }

  // 在输出开头添加总体信任摘要
  const report = generateTrustReport(issues);
  const { grade, color } = getScoreGrade(report.score);
  const header = TRUST_LEVEL_STYLE[report.level](
    `[信任级别: ${TRUST_LEVEL_LABEL[report.level]}] [评分: ${report.score} (${grade})] `
  );

  return header + formatted;
}

/**
 * 判断是否需要用户确认
 *
 * 当检测到 MEDIUM 及以上级别的问题时，返回 true，表示需要用户确认。
 * SAFE 和 LOW 级别的问题不需要确认。
 *
 * @param issues - 检测到的信任问题列表
 * @returns 是否需要用户确认
 *
 * @example
 * ```typescript
 * if (shouldRequireConfirmation(issues)) {
 *   const confirmed = await askUserConfirmation(report);
 *   if (!confirmed) {
 *     console.log('用户取消了操作');
 *     return;
 *   }
 * }
 * ```
 */
export function shouldRequireConfirmation(issues: TrustIssue[]): boolean {
  return issues.some(
    issue => TRUST_LEVEL_WEIGHT[issue.level] >= TRUST_LEVEL_WEIGHT[TrustLevel.MEDIUM]
  );
}

/**
 * 用户确认 - 在终端中让用户确认高风险操作
 *
 * 使用 inquirer 在终端中显示信任报告，并让用户选择是否继续执行。
 * 在非交互模式（非 TTY）下，默认拒绝高风险操作。
 *
 * @param report - 信任报告对象，包含 summary 和 details
 * @param options - 确认选项
 * @returns 用户是否确认继续执行
 *
 * @example
 * ```typescript
 * const report = generateTrustReport(issues);
 * if (report.requiresConfirmation) {
 *   const confirmed = await askUserConfirmation(report);
 *   if (!confirmed) {
 *     console.log('操作已取消');
 *     return;
 *   }
 * }
 * ```
 */
export async function askUserConfirmation(
  report: { summary: string; details: string[]; score?: number },
  options?: ConfirmationOptions
): Promise<boolean> {
  // 非交互模式下默认拒绝
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow('[非交互模式] 检测到需要确认的操作，默认拒绝。'));
    console.log(chalk.dim(`  ${report.summary}`));
    return false;
  }

  // 如果允许跳过且评分足够高，直接通过
  if (options?.allowSkip && report.score !== undefined && report.score >= 80) {
    console.log(chalk.green(`[自动通过] 信任评分 ${report.score} >= 80，无需确认。`));
    return true;
  }

  // 显示信任报告
  console.log('');
  console.log(chalk.bold('═══════════════════════════════════════'));
  console.log(chalk.bold('  信任检查报告'));
  console.log(chalk.bold('═══════════════════════════════════════'));
  console.log('');

  // 显示评分
  if (report.score !== undefined) {
    const { grade, color } = getScoreGrade(report.score);
    console.log(chalk.cyan('  信任评分: ') + color(`${report.score} (${grade})`));
    console.log('');
  }

  console.log(chalk.cyan('  摘要: ') + report.summary);
  console.log('');

  if (report.details.length > 0) {
    console.log(chalk.cyan('  详细问题:'));
    for (const detail of report.details) {
      // 缩进每个详情行
      const indented = detail.split('\n').map(line => '  ' + line).join('\n');
      console.log(indented);
      console.log('');
    }
  }

  console.log(chalk.bold('═══════════════════════════════════════'));
  console.log('');

  // 使用 inquirer 让用户确认
  try {
    const message = options?.customMessage || '是否确认继续执行以上操作？';
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message,
      default: false,
    }]);

    if (confirmed) {
      console.log(chalk.green('  用户已确认，继续执行。'));
    } else {
      console.log(chalk.yellow('  用户已取消操作。'));
    }
    console.log('');

    return confirmed;
  } catch {
    console.log(chalk.yellow('\n  用户中断，默认拒绝。'));
    return false;
  }
}

/**
 * 高风险操作确认 - 专门用于高风险操作
 *
 * 对于 CRITICAL 级别的问题，需要用户明确输入确认文本。
 *
 * @param report - 信任报告对象
 * @param confirmText - 需要输入的确认文本
 * @returns 用户是否确认
 */
export async function askHighRiskConfirmation(
  report: TrustReport,
  confirmText: string = 'CONFIRM'
): Promise<boolean> {
  // 非交互模式下默认拒绝
  if (!process.stdin.isTTY) {
    console.log(chalk.red('[非交互模式] 检测到高风险操作，默认拒绝。'));
    return false;
  }

  // 显示警告
  console.log('');
  console.log(chalk.red.bold('═══════════════════════════════════════'));
  console.log(chalk.red.bold('  ⚠️  高风险操作警告  ⚠️'));
  console.log(chalk.red.bold('═══════════════════════════════════════'));
  console.log('');
  console.log(chalk.red('  检测到以下高风险问题：'));
  console.log('');

  // 只显示高风险和危险级别的问题
  const highRiskIssues = report.details.filter(d =>
    d.includes('[危险]') || d.includes('[高风险]')
  );
  for (const detail of highRiskIssues) {
    console.log('  ' + chalk.red(detail));
  }

  console.log('');
  console.log(chalk.yellow(`  请输入 "${confirmText}" 以确认执行此高风险操作：`));
  console.log('');

  try {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: '确认输入',
    }]);

    if (input === confirmText) {
      console.log(chalk.green('  用户已确认高风险操作，继续执行。'));
      return true;
    } else {
      console.log(chalk.yellow('  输入不匹配，操作已取消。'));
      return false;
    }
  } catch {
    console.log(chalk.yellow('\n  用户中断，操作已取消。'));
    return false;
  }
}

// ==================== Convenience Functions ====================

/**
 * 一站式信任检查
 *
 * 执行完整的信任检查流程：检测问题 -> 生成报告 -> 可选的用户确认。
 *
 * @param output - AI 输出文本
 * @param context - 检测上下文
 * @param options - 确认选项
 * @returns 信任检查结果
 */
export async function performTrustCheck(
  output: string,
  context?: DetectionContext,
  options?: ConfirmationOptions & { skipConfirmation?: boolean }
): Promise<{
  issues: TrustIssue[];
  report: TrustReport;
  confirmed: boolean | null;
}> {
  // 检测问题
  const issues = detectIssues(output, context);

  // 生成报告
  const report = generateTrustReport(issues);

  // 如果不需要确认或跳过确认，直接返回
  if (!report.requiresConfirmation || options?.skipConfirmation) {
    return { issues, report, confirmed: options?.skipConfirmation ? true : null };
  }

  // 对于高风险操作，使用高风险确认
  if (report.level === TrustLevel.CRITICAL) {
    const confirmed = await askHighRiskConfirmation(report);
    return { issues, report, confirmed };
  }

  // 普通确认
  const confirmed = await askUserConfirmation(report, options);
  return { issues, report, confirmed };
}

/**
 * 批量信任检查
 *
 * 对多个输出进行批量信任检查。
 *
 * @param outputs - 输出列表
 * @param context - 共享的检测上下文
 * @returns 批量检查结果
 */
export function batchTrustCheck(
  outputs: string[],
  context?: DetectionContext
): TrustReport[] {
  return outputs.map(output => {
    const issues = detectIssues(output, context);
    return generateTrustReport(issues);
  });
}
