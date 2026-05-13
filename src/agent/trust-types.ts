/**
 * 信任管理器 - 类型定义与常量数据
 *
 * 包含信任评估所需的枚举、接口、危险模式列表和工具常量。
 */

import chalk from 'chalk';

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
export const TRUST_LEVEL_WEIGHT: Record<TrustLevel, number> = {
  [TrustLevel.SAFE]: 0,
  [TrustLevel.LOW]: 1,
  [TrustLevel.MEDIUM]: 2,
  [TrustLevel.HIGH]: 3,
  [TrustLevel.CRITICAL]: 4,
};

/**
 * 信任级别的中文标签
 */
export const TRUST_LEVEL_LABEL: Record<TrustLevel, string> = {
  [TrustLevel.SAFE]: '安全',
  [TrustLevel.LOW]: '低风险',
  [TrustLevel.MEDIUM]: '中风险',
  [TrustLevel.HIGH]: '高风险',
  [TrustLevel.CRITICAL]: '危险',
};

/**
 * 信任级别的 chalk 颜色样式
 */
export const TRUST_LEVEL_STYLE: Record<TrustLevel, (text: string) => string> = {
  [TrustLevel.SAFE]: chalk.green,
  [TrustLevel.LOW]: chalk.yellow,
  [TrustLevel.MEDIUM]: chalk.hex('#FFA500'),
  [TrustLevel.HIGH]: chalk.red,
  [TrustLevel.CRITICAL]: chalk.red.bold,
};

/**
 * 问题类型的中文标签
 */
export const ISSUE_TYPE_LABEL: Record<TrustIssue['type'], string> = {
  hallucination: '幻觉',
  uncertainty: '不确定性',
  dangerous: '危险操作',
  destructive: '破坏性操作',
  sensitive: '敏感信息',
};

/**
 * 问题类型对应的建议处理方式
 */
export const ISSUE_TYPE_SUGGESTION: Record<TrustIssue['type'], string> = {
  hallucination: '建议核实信息的准确性，不要直接采用未经验证的内容',
  uncertainty: '建议进一步确认后再执行，或向用户说明不确定性',
  dangerous: '建议仔细审查命令参数，确认安全后再执行',
  destructive: '强烈建议备份相关数据，确认无误后再执行',
  sensitive: '建议使用环境变量或密钥管理工具存储敏感信息，避免明文暴露',
};
