import type { TaskStep } from './types.js';

/**
 * 意图识别器
 * 从用户输入中识别任务意图，推荐合适的工具集。
 */

export interface IntentResult {
  intent: string;
  confidence: number;
  suggestedTools: string[];
}

/**
 * 识别用户输入的意图
 */
export function recognizeIntent(input: string): IntentResult {
  const lower = input.toLowerCase();

  if (/(debug|bug|error|issue|fix|修复|调试|错误|问题)/.test(lower)) {
    return { intent: 'bug-hunter', confidence: 0.9, suggestedTools: ['search_files', 'read_file'] };
  }

  if (/(implement|build|create|develop|新建|构建|创建|实现|component|组件|写|生成|添加)/.test(lower) ||
      /(react|vue|angular|nextjs|nuxt|html|css|js|typescript|node|python|rust|go)/.test(lower) ||
      /(\.py|\.ts|\.js|\.tsx|\.jsx|\.html|\.css|\.json|\.yaml|\.yml|\.md)/.test(lower)) {
    return { intent: 'fullstack', confidence: 0.85, suggestedTools: ['write_file', 'read_file', 'shell'] };
  }

  if (/(test|testing|测试|单元|运行测试|unit test|jest|vitest)/.test(lower)) {
    return { intent: 'testing', confidence: 0.9, suggestedTools: ['shell', 'read_file', 'write_file'] };
  }

  // 代码审查
  if (/(code review|pr review|代码审查|review|评审|审查代码|审查)/.test(lower)) {
    return { intent: 'code-review', confidence: 0.9, suggestedTools: ['read_file', 'search_files'] };
  }

  // 数据库任务（优先于重构）
  if (/(database|db|sql|mysql|postgres|mongodb|redis|数据库|查询|query)/.test(lower)) {
    return { intent: 'database', confidence: 0.9, suggestedTools: ['shell', 'read_file'] };
  }

  // 重构/优化
  if (/(refactor|重构|optimize|优化|improve|改进)/.test(lower)) {
    return { intent: 'refactor', confidence: 0.85, suggestedTools: ['read_file', 'write_file', 'search_files'] };
  }

  // 安全审计
  if (/(security|vulnerability|安全|漏洞|审计|audit)/.test(lower)) {
    return { intent: 'security', confidence: 0.9, suggestedTools: ['read_file', 'search_files', 'shell'] };
  }

  // 文档任务
  if (/(document|doc|readme|文档|说明)/.test(lower)) {
    return { intent: 'documentation', confidence: 0.85, suggestedTools: ['read_file', 'write_file'] };
  }

  // 部署任务
  if (/(deploy|部署|docker|kubernetes|k8s|ci\/cd|ci-cd|cicd)/.test(lower)) {
    return { intent: 'devops', confidence: 0.9, suggestedTools: ['shell'] };
  }

  // 搜索文件
  if (/(search|find|grep|搜索|查找)/.test(lower)) {
    return { intent: 'search', confidence: 0.9, suggestedTools: ['search_files', 'read_file'] };
  }

  // 通用对话
  return { intent: 'chat', confidence: 0.5, suggestedTools: [] };
}
