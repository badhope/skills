/**
 * 信任管理器 - 问题检测器 (增强版)
 *
 * 提供 AI 输出的问题检测能力，包括：
 * 1. 基于预定义模式的正则匹配检测
 * 2. 上下文感知检测（根据使用的工具进行额外检测）
 * 3. 问题去重与排序
 * 4. 严重级别分类
 * 5. 上下文感知（如测试文件中的危险操作）
 */

import {
  TrustLevel,
  TrustIssue,
  DANGEROUS_PATTERNS,
  TRUST_LEVEL_WEIGHT,
  ISSUE_TYPE_SUGGESTION,
} from './trust-types.js';

// ==================== Types ====================

/**
 * 检测上下文
 */
export interface DetectionContext {
  /** 用户意图 */
  intent?: string;
  /** 使用的工具 */
  toolUsed?: string;
  /** 文件路径（用于上下文感知） */
  filePath?: string;
  /** 是否在测试环境中 */
  isTestEnvironment?: boolean;
}

/**
 * 风险严重级别
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 检测模式定义
 */
interface DetectionPattern {
  pattern: RegExp;
  type: TrustIssue['type'];
  level: TrustLevel;
  severity: SeverityLevel;
  description: string;
  /** 在测试环境中是否忽略 */
  ignoreInTest?: boolean;
}

// ==================== Risk Pattern Categories ====================

/**
 * 文件系统危险操作模式
 */
const FILE_SYSTEM_PATTERNS: DetectionPattern[] = [
  {
    pattern: /rm\s+-rf\s+\//,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '递归强制删除根目录',
  },
  {
    pattern: /rm\s+-rf/,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '递归强制删除',
    ignoreInTest: true,
  },
  {
    pattern: /del\s+\/[sfq]/i,
    type: 'destructive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: 'Windows 强制删除命令',
  },
  {
    pattern: /rmdir\s+\/s/i,
    type: 'destructive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: 'Windows 递归删除目录',
  },
  {
    pattern: /format\s+[a-z]:/i,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '格式化磁盘',
  },
  {
    pattern: /mkfs\b/,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '创建文件系统（可能覆盖数据）',
  },
  {
    pattern: /dd\s+if=/i,
    type: 'destructive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: 'dd 磁盘写入操作',
  },
  {
    pattern: />\s*\/dev\//,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '重定向到设备文件',
  },
];

/**
 * 网络危险操作模式
 */
const NETWORK_PATTERNS: DetectionPattern[] = [
  {
    pattern: /curl.*\|\s*(bash|sh)/i,
    type: 'dangerous',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '远程脚本执行',
  },
  {
    pattern: /wget.*\|\s*(bash|sh)/i,
    type: 'dangerous',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '远程脚本执行（wget）',
  },
  {
    pattern: /curl\s+.*\b(?:pastebin|gist\.github|ngrok)\b/i,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '从可疑域名获取内容',
  },
  {
    pattern: /nc\s+-l/i,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '开启网络监听',
  },
  {
    pattern: /ssh\s+-R/i,
    type: 'dangerous',
    level: TrustLevel.MEDIUM,
    severity: 'medium',
    description: 'SSH 反向隧道',
  },
];

/**
 * 代码危险操作模式
 */
const CODE_PATTERNS: DetectionPattern[] = [
  {
    pattern: /\beval\s*\(/,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '使用 eval() 动态执行代码',
    ignoreInTest: true,
  },
  {
    pattern: /new\s+Function\s*\(/,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '使用 Function 构造函数',
    ignoreInTest: true,
  },
  {
    pattern: /vm\.runInNewContext\s*\(/,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '在 VM 中执行代码',
    ignoreInTest: true,
  },
  {
    pattern: /child_process.*exec\s*\(/,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '执行子进程命令',
    ignoreInTest: true,
  },
  {
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)/,
    type: 'dangerous',
    level: TrustLevel.MEDIUM,
    severity: 'medium',
    description: '引入子进程模块',
  },
];

/**
 * 数据库危险操作模式
 */
const DATABASE_PATTERNS: DetectionPattern[] = [
  {
    pattern: /DROP\s+TABLE/i,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '删除数据库表',
  },
  {
    pattern: /DROP\s+DATABASE/i,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '删除数据库',
  },
  {
    pattern: /TRUNCATE\s+TABLE/i,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '清空数据库表',
  },
  {
    pattern: /DELETE\s+FROM\s+\w+\s*$/i,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '无 WHERE 条件的删除（可能删除全表）',
  },
  {
    pattern: /DELETE\s+FROM\s+\w+\s*;/i,
    type: 'destructive',
    level: TrustLevel.CRITICAL,
    severity: 'critical',
    description: '无 WHERE 条件的删除语句',
  },
  {
    pattern: /ALTER\s+TABLE.*DROP\s+COLUMN/i,
    type: 'destructive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '删除数据库列',
  },
  {
    pattern: /GRANT\s+ALL/i,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '授予所有权限',
  },
];

/**
 * 敏感信息模式
 */
const SENSITIVE_PATTERNS: DetectionPattern[] = [
  {
    pattern: /password\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '密码硬编码',
  },
  {
    pattern: /密码\s*[:=]\s*['"][^'"]+['"]/,
    type: 'sensitive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '密码硬编码（中文）',
  },
  {
    pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: 'API Key 硬编码',
  },
  {
    pattern: /secret[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: 'Secret Key 硬编码',
  },
  {
    pattern: /token\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.MEDIUM,
    severity: 'medium',
    description: 'Token 硬编码',
  },
  {
    pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    type: 'sensitive',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '私钥硬编码',
  },
];

/**
 * 系统权限模式
 */
const SYSTEM_PATTERNS: DetectionPattern[] = [
  {
    pattern: /sudo\s+/,
    type: 'dangerous',
    level: TrustLevel.HIGH,
    severity: 'high',
    description: '需要管理员权限',
  },
  {
    pattern: /chmod\s+777/,
    type: 'dangerous',
    level: TrustLevel.MEDIUM,
    severity: 'medium',
    description: '开放所有权限',
  },
  {
    pattern: /chown\s+.*root/,
    type: 'dangerous',
    level: TrustLevel.MEDIUM,
    severity: 'medium',
    description: '更改文件所有者为 root',
  },
];

/**
 * 不确定性表述模式
 */
const UNCERTAINTY_PATTERNS: DetectionPattern[] = [
  {
    pattern: /我(不)?确定/,
    type: 'uncertainty',
    level: TrustLevel.LOW,
    severity: 'low',
    description: 'AI 自身不确定性表述',
  },
  {
    pattern: /我(不)?清楚/,
    type: 'uncertainty',
    level: TrustLevel.LOW,
    severity: 'low',
    description: 'AI 表示不清楚',
  },
  {
    pattern: /我猜测|我估计/,
    type: 'uncertainty',
    level: TrustLevel.LOW,
    severity: 'low',
    description: 'AI 猜测性表述',
  },
  {
    pattern: /我不(太)?知道/,
    type: 'uncertainty',
    level: TrustLevel.LOW,
    severity: 'low',
    description: 'AI 表示不知道',
  },
];

/**
 * 幻觉/知识边界模式
 */
const HALLUCINATION_PATTERNS: DetectionPattern[] = [
  {
    pattern: /我(不)?知道/,
    type: 'hallucination',
    level: TrustLevel.LOW,
    severity: 'low',
    description: '知识边界表述',
  },
  {
    pattern: /没有足够信息/,
    type: 'hallucination',
    level: TrustLevel.LOW,
    severity: 'low',
    description: '信息不足表述',
  },
  {
    pattern: /无法确认/,
    type: 'hallucination',
    level: TrustLevel.LOW,
    severity: 'low',
    description: '无法确认表述',
  },
];

/**
 * 所有检测模式（合并）
 */
const ALL_DETECTION_PATTERNS: DetectionPattern[] = [
  ...FILE_SYSTEM_PATTERNS,
  ...NETWORK_PATTERNS,
  ...CODE_PATTERNS,
  ...DATABASE_PATTERNS,
  ...SENSITIVE_PATTERNS,
  ...SYSTEM_PATTERNS,
  ...UNCERTAINTY_PATTERNS,
  ...HALLUCINATION_PATTERNS,
];

// ==================== TrustDetector Class ====================

/**
 * 信任检测器类
 *
 * 提供全面的 AI 输出问题检测能力。
 */
export class TrustDetector {
  private customPatterns: DetectionPattern[] = [];

  /**
   * 添加自定义检测模式
   */
  addPattern(pattern: DetectionPattern): void {
    this.customPatterns.push(pattern);
  }

  /**
   * 检测 AI 输出中的潜在问题
   *
   * @param output - AI 的输出文本
   * @param context - 检测上下文
   * @returns 检测到的信任问题列表（按风险级别降序排列）
   */
  detect(output: string, context?: DetectionContext): TrustIssue[] {
    if (!output || typeof output !== 'string') {
      return [];
    }

    const issues: TrustIssue[] = [];
    const isTestEnv = this.isTestEnvironment(context);

    // 1. 使用所有预定义模式进行检测
    for (const pattern of ALL_DETECTION_PATTERNS) {
      if (pattern.ignoreInTest && isTestEnv) {
        continue;
      }
      if (pattern.pattern.test(output)) {
        issues.push(this.createIssue(pattern));
      }
    }

    // 2. 使用自定义模式进行检测
    for (const pattern of this.customPatterns) {
      if (pattern.ignoreInTest && isTestEnv) {
        continue;
      }
      if (pattern.pattern.test(output)) {
        issues.push(this.createIssue(pattern));
      }
    }

    // 3. 使用原有 DANGEROUS_PATTERNS 进行检测（保持向后兼容）
    for (const { pattern, type, level, description } of DANGEROUS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(output)) {
        // 避免重复添加
        if (!issues.some(i => i.description === description)) {
          issues.push({
            type,
            level,
            description,
            suggestion: ISSUE_TYPE_SUGGESTION[type],
          });
        }
      }
    }

    // 4. 上下文感知检测
    if (context) {
      const contextIssues = this.detectWithContext(output, context);
      issues.push(...contextIssues);
    }

    // 5. 去重并排序
    return this.deduplicateAndSort(issues);
  }

  /**
   * 分析输出内容（detect 的别名，保持向后兼容）
   */
  analyze(output: string, context?: DetectionContext): TrustIssue[] {
    return this.detect(output, context);
  }

  /**
   * 创建问题对象
   */
  private createIssue(pattern: DetectionPattern): TrustIssue {
    return {
      type: pattern.type,
      level: pattern.level,
      description: pattern.description,
      suggestion: ISSUE_TYPE_SUGGESTION[pattern.type],
    };
  }

  /**
   * 判断是否在测试环境中
   */
  private isTestEnvironment(context?: DetectionContext): boolean {
    if (context?.isTestEnvironment !== undefined) {
      return context.isTestEnvironment;
    }

    // 根据文件路径判断
    if (context?.filePath) {
      const filePath = context.filePath.toLowerCase();
      return (
        filePath.includes('.test.') ||
        filePath.includes('.spec.') ||
        filePath.includes('__tests__') ||
        filePath.includes('test/') ||
        filePath.includes('tests/')
      );
    }

    return false;
  }

  /**
   * 上下文感知检测
   */
  private detectWithContext(output: string, context: DetectionContext): TrustIssue[] {
    const issues: TrustIssue[] = [];

    if (context.toolUsed) {
      const toolLower = context.toolUsed.toLowerCase();

      // Shell 工具额外检测
      if (toolLower === 'shell' || toolLower === 'exec') {
        issues.push(...this.detectShellContext(output));
      }

      // 数据库工具额外检测
      if (toolLower.includes('database') || toolLower.includes('db') || toolLower.includes('sql')) {
        issues.push(...this.detectDatabaseContext(output));
      }

      // 文件写入工具额外检测
      if (toolLower.includes('write') || toolLower.includes('file')) {
        issues.push(...this.detectFileContext(output));
      }

      // 网络工具额外检测
      if (toolLower.includes('http') || toolLower.includes('fetch') || toolLower.includes('request')) {
        issues.push(...this.detectNetworkContext(output));
      }
    }

    return issues;
  }

  /**
   * Shell 上下文检测
   */
  private detectShellContext(output: string): TrustIssue[] {
    const issues: TrustIssue[] = [];
    const patterns = [
      { pattern: /:\s*\(\)\s*\{.*\}/, desc: '定义 fork 炸弹' },
      { pattern: />\s*\/etc\/passwd/, desc: '覆盖系统密码文件' },
      { pattern: />\s*\/etc\/shadow/, desc: '覆盖系统影子文件' },
    ];

    for (const { pattern, desc } of patterns) {
      if (pattern.test(output)) {
        issues.push({
          type: 'dangerous',
          level: TrustLevel.HIGH,
          description: desc,
          suggestion: ISSUE_TYPE_SUGGESTION['dangerous'],
        });
      }
    }

    return issues;
  }

  /**
   * 数据库上下文检测
   */
  private detectDatabaseContext(output: string): TrustIssue[] {
    const issues: TrustIssue[] = [];
    const patterns = [
      { pattern: /DELETE\s+FROM/i, desc: '执行删除操作' },
      { pattern: /UPDATE\s+\w+\s+SET/i, desc: '执行更新操作' },
      { pattern: /INSERT\s+INTO/i, desc: '执行插入操作' },
    ];

    for (const { pattern, desc } of patterns) {
      if (pattern.test(output)) {
        // 检查是否已存在相同描述的问题
        if (!issues.some(i => i.description === desc)) {
          issues.push({
            type: 'destructive',
            level: TrustLevel.MEDIUM,
            description: desc,
            suggestion: '建议确认 SQL 语句正确，并在测试环境验证',
          });
        }
      }
    }

    return issues;
  }

  /**
   * 文件上下文检测
   */
  private detectFileContext(output: string): TrustIssue[] {
    const issues: TrustIssue[] = [];
    const patterns = [
      { pattern: /\/etc\/(passwd|shadow|hosts|sudoers)/, desc: '修改系统关键配置文件' },
      { pattern: /\DELETE\b/, desc: '操作环境变量文件（可能包含敏感信息）' },
      { pattern: /\/usr\/bin\/|\/bin\//, desc: '修改系统可执行文件目录' },
      { pattern: /\.ssh\//, desc: '操作 SSH 配置目录' },
    ];

    for (const { pattern, desc } of patterns) {
      if (pattern.test(output)) {
        issues.push({
          type: 'dangerous',
          level: TrustLevel.HIGH,
          description: desc,
          suggestion: '建议确认文件路径正确，避免误操作系统关键文件',
        });
      }
    }

    return issues;
  }

  /**
   * 网络上下文检测
   */
  private detectNetworkContext(output: string): TrustIssue[] {
    const issues: TrustIssue[] = [];
    const patterns = [
      { pattern: /authorization\s*:\s*bearer\s+/i, desc: '暴露 Bearer Token' },
      { pattern: /x-api-key\s*:\s*['"][^'"]+['"]/i, desc: '暴露 API Key 在请求头' },
    ];

    for (const { pattern, desc } of patterns) {
      if (pattern.test(output)) {
        issues.push({
          type: 'sensitive',
          level: TrustLevel.HIGH,
          description: desc,
          suggestion: ISSUE_TYPE_SUGGESTION['sensitive'],
        });
      }
    }

    return issues;
  }

  /**
   * 去重并排序问题列表
   */
  private deduplicateAndSort(issues: TrustIssue[]): TrustIssue[] {
    // 去重 - 同一类型和描述的问题只保留最高级别的
    const map = new Map<string, TrustIssue>();

    for (const issue of issues) {
      const key = `${issue.type}:${issue.description}`;
      const existing = map.get(key);

      if (!existing || TRUST_LEVEL_WEIGHT[issue.level] > TRUST_LEVEL_WEIGHT[existing.level]) {
        map.set(key, issue);
      }
    }

    // 按风险级别降序排列
    return [...map.values()].sort(
      (a, b) => TRUST_LEVEL_WEIGHT[b.level] - TRUST_LEVEL_WEIGHT[a.level]
    );
  }
}

// ==================== Standalone Functions (for backward compatibility) ====================

/**
 * 默认检测器实例
 */
const defaultDetector = new TrustDetector();

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
  return defaultDetector.detect(output, context);
}

/**
 * 获取所有检测模式（用于调试或展示）
 */
export function getAllPatterns(): DetectionPattern[] {
  return [...ALL_DETECTION_PATTERNS];
}

/**
 * 获取特定类别的检测模式
 */
export function getPatternsByCategory(category: 'filesystem' | 'network' | 'code' | 'database' | 'sensitive' | 'system'): DetectionPattern[] {
  switch (category) {
    case 'filesystem':
      return [...FILE_SYSTEM_PATTERNS];
    case 'network':
      return [...NETWORK_PATTERNS];
    case 'code':
      return [...CODE_PATTERNS];
    case 'database':
      return [...DATABASE_PATTERNS];
    case 'sensitive':
      return [...SENSITIVE_PATTERNS];
    case 'system':
      return [...SYSTEM_PATTERNS];
  }
}
