// ============================================================
// 记忆管理器类型定义
// ============================================================

/** 记忆交互记录 */
export interface MemoryInteraction {
  id: string;
  taskId: string;
  input: string;
  output: string;
  skillUsed: string;
  context?: Record<string, unknown>;
  tags: string[];
  timestamp: Date;
}

/** 带相关性的记忆记录 */
export interface MemoryRecord {
  interaction: MemoryInteraction;
  relevance: number;
}

/** 记忆统计信息 */
export interface MemoryStats {
  totalInteractions: number;
  uniqueTasks: number;
  interactionsToday: number;
  interactionsYesterday: number;
  indexSize: number;
  skillUsage: Record<string, number>;
  skillsUsed: string[];
}
