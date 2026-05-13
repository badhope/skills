import fs from 'fs/promises';
import path from 'path';
import type { ReviewResult, ReviewOptions } from './types.js';
import { analyzeMetrics } from './metrics.js';
import { quickRuleCheck } from './rules.js';
import { aiReview } from './ai-review.js';

// 主审查函数
export async function reviewFile(filePath: string, options: ReviewOptions = {}): Promise<ReviewResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath).slice(1).toLowerCase();

  // 快速规则检测（始终执行）
  const ruleIssues = quickRuleCheck(content, filePath);

  // AI深度审查（默认开启，useAi=false 时跳过）
  const categories = options.categories || ['quality', 'bugs', 'performance', 'security'];
  const useAi = options.useAi !== false; // 默认 true
  const aiIssues = useAi ? await aiReview(content, filePath, categories) : [];

  // 合并去重
  const allIssues = [...ruleIssues];
  const existingRules = new Set(ruleIssues.map(i => `${i.ruleId}-${i.line}`));

  for (const issue of aiIssues) {
    const key = `${issue.ruleId}-${issue.line}`;
    if (!existingRules.has(key)) {
      allIssues.push(issue);
      existingRules.add(key);
    }
  }

  // 限制数量
  const maxIssues = options.maxIssues || 50;
  const limitedIssues = allIssues.slice(0, maxIssues);

  // 按严重程度排序
  const severityOrder = { error: 0, warning: 1, info: 2 };
  limitedIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const metrics = analyzeMetrics(content);

  return {
    filePath,
    language: ext,
    issues: limitedIssues,
    summary: {
      total: limitedIssues.length,
      errors: limitedIssues.filter(i => i.severity === 'error').length,
      warnings: limitedIssues.filter(i => i.severity === 'warning').length,
      infos: limitedIssues.filter(i => i.severity === 'info').length,
    },
    metrics,
  };
}

// 批量审查目录
export async function reviewDirectory(dirPath: string, options: ReviewOptions = {}): Promise<ReviewResult[]> {
  const results: ReviewResult[] = [];
  const ignorePatterns = options.ignorePatterns || ['node_modules', 'dist', '.git', 'coverage', '__pycache__', '.next', 'build'];

  async function walkDir(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (ignorePatterns.includes(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'cs', 'php', 'rb', 'swift', 'kt', 'html', 'css', 'json', 'yaml', 'yml', 'md'];

        if (codeExtensions.includes(ext)) {
          try {
            const result = await reviewFile(fullPath, options);
            if (result.issues.length > 0) {
              results.push(result);
            }
          } catch {
            // 跳过无法读取的文件
          }
        }
      }
    }
  }

  await walkDir(dirPath);
  return results;
}
