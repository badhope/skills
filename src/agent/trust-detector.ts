/**
 * 信任管理器 - 问题检测器
 *
 * 提供 AI 输出的问题检测能力，包括：
 * 1. 基于预定义模式的正则匹配检测
 * 2. 上下文感知检测（根据使用的工具进行额外检测）
 * 3. 问题去重与排序
 */

import {
  TrustLevel,
  TrustIssue,
  DANGEROUS_PATTERNS,
  TRUST_LEVEL_WEIGHT,
  ISSUE_TYPE_SUGGESTION,
} from './trust-types.js';

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
