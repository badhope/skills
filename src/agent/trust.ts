/**
 * 信任管理器模块 (Trust Manager)
 *
 * 提供 AI 输出的信任评估能力，包括：
 * 1. 问题检测 - 检测幻觉、危险操作、敏感信息等
 * 2. 透明报告 - 生成人类可读的信任报告
 * 3. 用户确认机制 - 在终端中让用户确认高风险操作
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

// ==================== 枚举与接口 ====================

/**
 * 信任级别枚举
 * 从 SAFE 到 CRITICAL 递增，级别越高风险越大
 */
export enum TrustLevel {
  SAFE = 'safe',           // 安全，无需确认
  LOW = 'low',             // 低风险，建议确认
  MEDIUM = 'medium',       // 中风险，需要确认
  HIGH = 'high',           // 高风险，必须确认
  CRITICAL = 'critical',   // 危险，默认拒绝
}

/**
 * 信任问题接口
 * 描述检测到的单个信任问题
 */
export interface TrustIssue {
  /** 问题类型 */
  type: 'hallucination' | 'uncertainty' | 'dangerous' | 'destructive' | 'sensitive';
  /** 信任级别 */
  level: TrustLevel;
  /** 问题描述 */
  description: string;
  /** 建议的处理方式 */
  suggestion: string;
}

// ==================== 危险模式常量 ====================

/**
 * 预定义的危险模式列表
 * 用于检测 AI 输出中的潜在风险
 */
export const DANGEROUS_PATTERNS: Array<{
  pattern: RegExp;
  type: TrustIssue['type'];
  level: TrustLevel;
  description: string;
}> = [
  // 破坏性操作
  { pattern: /rm\s+-rf/, type: 'destructive', level: TrustLevel.CRITICAL, description: '递归强制删除' },
  { pattern: /DROP\s+TABLE/i, type: 'destructive', level: TrustLevel.CRITICAL, description: '删除数据库表' },
  { pattern: /FORMAT\s+/i, type: 'destructive', level: TrustLevel.HIGH, description: '格式化操作' },

  // 敏感信息
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]|密码\s*[:=]\s*['"][^'"]+['"]|passwd\s*[:=]/i, type: 'sensitive', level: TrustLevel.HIGH, description: '密码硬编码' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]|secret[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, type: 'sensitive', level: TrustLevel.HIGH, description: 'API Key 硬编码' },

  // 危险操作
  { pattern: /sudo\s+/, type: 'dangerous', level: TrustLevel.HIGH, description: '需要管理员权限' },
  { pattern: /chmod\s+777/, type: 'dangerous', level: TrustLevel.MEDIUM, description: '开放所有权限' },
  { pattern: /curl.*\|\s*(bash|sh)/i, type: 'dangerous', level: TrustLevel.CRITICAL, description: '远程脚本执行' },

  // 不确定性表述
  { pattern: /我(不)?确定|我(不)?清楚|我猜测|我估计|我不(太)?知道/i, type: 'uncertainty', level: TrustLevel.LOW, description: 'AI 自身不确定性表述' },

  // 幻觉 / 知识边界
  { pattern: /我(不)?知道|没有足够信息|无法确认/i, type: 'hallucination', level: TrustLevel.LOW, description: '知识边界表述' },
];

// ==================== 信任级别工具 ====================

/**
 * 信任级别的数值权重，用于比较和聚合
 */
const TRUST_LEVEL_WEIGHT: Record<TrustLevel, number> = {
  [TrustLevel.SAFE]: 0,
  [TrustLevel.LOW]: 1,
  [TrustLevel.MEDIUM]: 2,
  [TrustLevel.HIGH]: 3,
  [TrustLevel.CRITICAL]: 4,
};

/**
 * 信任级别的中文标签
 */
const TRUST_LEVEL_LABEL: Record<TrustLevel, string> = {
  [TrustLevel.SAFE]: '安全',
  [TrustLevel.LOW]: '低风险',
  [TrustLevel.MEDIUM]: '中风险',
  [TrustLevel.HIGH]: '高风险',
  [TrustLevel.CRITICAL]: '危险',
};

/**
 * 信任级别的 chalk 颜色样式
 */
const TRUST_LEVEL_STYLE: Record<TrustLevel, (text: string) => string> = {
  [TrustLevel.SAFE]: chalk.green,
  [TrustLevel.LOW]: chalk.yellow,
  [TrustLevel.MEDIUM]: chalk.hex('#FFA500'),
  [TrustLevel.HIGH]: chalk.red,
  [TrustLevel.CRITICAL]: chalk.red.bold,
};

/**
 * 问题类型的中文标签
 */
const ISSUE_TYPE_LABEL: Record<TrustIssue['type'], string> = {
  hallucination: '幻觉',
  uncertainty: '不确定性',
  dangerous: '危险操作',
  destructive: '破坏性操作',
  sensitive: '敏感信息',
};

/**
 * 问题类型对应的建议处理方式
 */
const ISSUE_TYPE_SUGGESTION: Record<TrustIssue['type'], string> = {
  hallucination: '建议核实信息的准确性，不要直接采用未经验证的内容',
  uncertainty: '建议进一步确认后再执行，或向用户说明不确定性',
  dangerous: '建议仔细审查命令参数，确认安全后再执行',
  destructive: '强烈建议备份相关数据，确认无误后再执行',
  sensitive: '建议使用环境变量或密钥管理工具存储敏感信息，避免明文暴露',
};

// ==================== 核心函数 ====================

/**
 * 问题检测器 - 检测 AI 输出中的潜在问题
 *
 * 遍历预定义的危险模式列表，对输出文本进行正则匹配。
 * 同时根据上下文信息（用户意图、使用的工具）进行额外的上下文感知检测。
 *
 * @param output - AI 的输出文本
 * @param context - 可选的上下文信息，包含用户意图和使用的工具
 * @returns 检测到的信任问题列表（按风险级别降序排列）
 *
 * @example
 * ```typescript
 * const issues = detectIssues('你可以执行 rm -rf /tmp/logs 来清理日志', {
 *   intent: 'cleanup',
 *   toolUsed: 'shell',
 * });
 * // issues 将包含一个 CRITICAL 级别的破坏性操作问题
 * ```
 */
export function detectIssues(
  output: string,
  context?: { intent?: string; toolUsed?: string }
): TrustIssue[] {
  if (!output || typeof output !== 'string') {
    return [];
  }

  const issues: TrustIssue[] = [];

  // 1. 基于预定义模式进行检测
  for (const { pattern, type, level, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(output)) {
      issues.push({
        type,
        level,
        description,
        suggestion: ISSUE_TYPE_SUGGESTION[type],
      });
    }
  }

  // 2. 上下文感知检测 - 根据使用的工具进行额外检测
  if (context?.toolUsed) {
    const toolLower = context.toolUsed.toLowerCase();

    // 如果使用了 shell 工具且包含删除操作，提升风险级别
    if (toolLower === 'shell' || toolLower === 'exec') {
      const shellDangerPatterns = [
        { pattern: /del\s+\/[sfq]/i, desc: 'Windows 强制删除命令' },
        { pattern: /rmdir\s+\/s/i, desc: 'Windows 递归删除目录' },
        { pattern: />\s*\/dev\//, desc: '重定向到设备文件' },
        { pattern: /mkfs\b/, desc: '创建文件系统（可能覆盖数据）' },
        { pattern: /dd\s+if=/i, desc: 'dd 磁盘写入操作' },
        { pattern: /:\s*\(\)\s*\{.*\}/, desc: '定义 fork 炸弹' },
      ];

      for (const { pattern, desc } of shellDangerPatterns) {
        if (pattern.test(output) && !issues.some(i => i.description === desc)) {
          issues.push({
            type: 'dangerous',
            level: TrustLevel.HIGH,
            description: desc,
            suggestion: ISSUE_TYPE_SUGGESTION['dangerous'],
          });
        }
      }
    }

    // 如果使用了数据库工具，检测额外的 SQL 危险操作
    if (toolLower.includes('database') || toolLower.includes('db') || toolLower.includes('sql')) {
      const sqlDangerPatterns = [
        { pattern: /TRUNCATE\s+TABLE/i, desc: '清空数据库表' },
        { pattern: /DELETE\s+FROM\s+\w+\s*$/i, desc: '无 WHERE 条件的删除（可能删除全表）' },
        { pattern: /ALTER\s+TABLE.*DROP\s+COLUMN/i, desc: '删除数据库列' },
        { pattern: /GRANT\s+ALL/i, desc: '授予所有权限' },
      ];

      for (const { pattern, desc } of sqlDangerPatterns) {
        if (pattern.test(output) && !issues.some(i => i.description === desc)) {
          issues.push({
            type: 'destructive',
            level: TrustLevel.CRITICAL,
            description: desc,
            suggestion: ISSUE_TYPE_SUGGESTION['destructive'],
          });
        }
      }
    }

    // 如果使用了文件写入工具，检测是否覆盖关键系统文件
    if (toolLower.includes('write') || toolLower.includes('file')) {
      const fileDangerPatterns = [
        { pattern: /\/etc\/(passwd|shadow|hosts|sudoers)/, desc: '修改系统关键配置文件' },
        { pattern: /\DELETE\b/, desc: '操作环境变量文件（可能包含敏感信息）' },
        { pattern: /\/usr\/bin\/|\/bin\//, desc: '修改系统可执行文件目录' },
      ];

      for (const { pattern, desc } of fileDangerPatterns) {
        if (pattern.test(output) && !issues.some(i => i.description === desc)) {
          issues.push({
            type: 'dangerous',
            level: TrustLevel.HIGH,
            description: desc,
            suggestion: '建议确认文件路径正确，避免误操作系统关键文件',
          });
        }
      }
    }
  }

  // 3. 去重 - 同一类型和描述的问题只保留最高级别的
  const deduplicated = deduplicateIssues(issues);

  // 按风险级别降序排列
  return deduplicated.sort(
    (a, b) => TRUST_LEVEL_WEIGHT[b.level] - TRUST_LEVEL_WEIGHT[a.level]
  );
}

/**
 * 去重问题列表 - 同一类型和描述的问题只保留最高级别的
 */
function deduplicateIssues(issues: TrustIssue[]): TrustIssue[] {
  const map = new Map<string, TrustIssue>();

  for (const issue of issues) {
    const key = `${issue.type}:${issue.description}`;
    const existing = map.get(key);

    if (!existing || TRUST_LEVEL_WEIGHT[issue.level] > TRUST_LEVEL_WEIGHT[existing.level]) {
      map.set(key, issue);
    }
  }

  return [...map.values()];
}

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
export function generateTrustReport(issues: TrustIssue[]): {
  level: TrustLevel;
  summary: string;
  details: string[];
  requiresConfirmation: boolean;
} {
  // 如果没有问题，返回安全报告
  if (issues.length === 0) {
    return {
      level: TrustLevel.SAFE,
      summary: '未检测到信任问题，输出内容安全。',
      details: [],
      requiresConfirmation: false,
    };
  }

  // 确定最高风险级别
  const maxLevel = issues.reduce(
    (max, issue) => TRUST_LEVEL_WEIGHT[issue.level] > TRUST_LEVEL_WEIGHT[max]
      ? issue.level
      : max,
    issues[0].level
  );

  // 按类型分组统计
  const typeCounts: Record<string, number> = {};
  for (const issue of issues) {
    typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
  }

  // 生成一句话总结
  const typeSummary = Object.entries(typeCounts)
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

  return {
    level: maxLevel,
    summary,
    details,
    requiresConfirmation: shouldRequireConfirmation(issues),
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
  const header = TRUST_LEVEL_STYLE[report.level](
    `[信任级别: ${TRUST_LEVEL_LABEL[report.level]}] `
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
  report: { summary: string; details: string[] }
): Promise<boolean> {
  // 非交互模式下默认拒绝
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow('[非交互模式] 检测到需要确认的操作，默认拒绝。'));
    console.log(chalk.dim(`  ${report.summary}`));
    return false;
  }

  // 显示信任报告
  console.log('');
  console.log(chalk.bold('═══════════════════════════════════════'));
  console.log(chalk.bold('  信任检查报告'));
  console.log(chalk.bold('═══════════════════════════════════════'));
  console.log('');
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
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: '是否确认继续执行以上操作？',
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
