import fs from 'fs/promises';
import path from 'path';
import type { ReviewResult, ReviewIssue, ReviewOptions } from './types.js';
import { createProvider } from '../providers/index.js';
import { configManager } from '../config/manager.js';

// 代码指标分析（不依赖AI）
function analyzeMetrics(content: string) {
  const lines = content.split('\n');
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      blankLines++;
      continue;
    }
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      commentLines++;
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('--')) {
      commentLines++;
      continue;
    }
    codeLines++;
  }

  // 圈复杂度估算（基于分支关键字）
  const complexityKeywords = /\b(if|else|elif|for|while|case|catch|\?\?|&&|\|\|)\b/g;
  const matches = content.match(complexityKeywords);
  const complexity = (matches ? matches.length : 0) + 1; // 基础复杂度为 1

  return {
    lines: lines.length,
    codeLines,
    commentLines,
    blankLines,
    complexity,
  };
}

// 快速规则检测（不依赖AI，覆盖常见问题）
function quickRuleCheck(content: string, filePath: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const lines = content.split('\n');
  const ext = path.extname(filePath).toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // === 安全审计 ===
    if (/password\s*[:=]\s*['"][^'"]{3,}/i.test(line) || /api[_-]?key\s*[:=]\s*['"][^'"]{3,}/i.test(line)) {
      issues.push({
        ruleId: 'SEC001', message: '检测到硬编码的敏感信息（密码或API密钥）',
        severity: 'error', category: 'security', line: lineNum,
        suggestion: '使用环境变量或配置管理工具存储敏感信息', code: line.trim(),
      });
    }

    if (/\+\s*['"`].*SELECT|INSERT|UPDATE|DELETE|DROP/i.test(line) && !/prepared|parameterized|escape/i.test(line)) {
      issues.push({
        ruleId: 'SEC002', message: '潜在的SQL注入风险：字符串拼接SQL语句',
        severity: 'error', category: 'security', line: lineNum,
        suggestion: '使用参数化查询或ORM', code: line.trim(),
      });
    }

    if (/\beval\s*\(/.test(line)) {
      issues.push({
        ruleId: 'SEC003', message: '使用eval()存在安全风险',
        severity: 'error', category: 'security', line: lineNum,
        suggestion: '避免使用eval，使用JSON.parse或其他安全替代', code: line.trim(),
      });
    }

    if (/\.innerHTML\s*=/.test(line)) {
      issues.push({
        ruleId: 'SEC004', message: '使用innerHTML可能导致XSS攻击',
        severity: 'warning', category: 'security', line: lineNum,
        suggestion: '使用textContent或DOMPurify进行清理', code: line.trim(),
      });
    }

    // === Bug检测 ===
    if ((ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') && /[^=!]==[^=]/.test(line) && !/===/.test(line)) {
      issues.push({
        ruleId: 'BUG001', message: '使用==可能导致类型转换问题，建议使用===',
        severity: 'warning', category: 'bugs', line: lineNum,
        suggestion: '使用===进行严格比较', code: line.trim(),
      });
    }

    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      issues.push({
        ruleId: 'BUG002', message: '空的catch块会吞掉错误',
        severity: 'warning', category: 'bugs', line: lineNum,
        suggestion: '至少记录错误日志', code: line.trim(),
      });
    }

    // 未处理的Promise：.then() 后 500 字符内没有 .catch()
    if (/\.\s*then\s*\(/.test(line)) {
      const followingCode = content.substring(
        content.indexOf(line), 
        Math.min(content.indexOf(line) + line.length + 500, content.length)
      );
      if (!/\.catch\s*\(/.test(followingCode) && !/^\s*await\b/.test(lines[i + 1] || '')) {
        issues.push({
          ruleId: 'BUG004', message: 'Promise.then() 缺少 .catch() 错误处理',
          severity: 'warning', category: 'bugs', line: lineNum,
          suggestion: '添加 .catch() 或使用 async/await + try/catch', code: line.trim(),
        });
      }
    }

    // async 函数中缺少 try/catch 的 await
    if (/await\s+/.test(line) && !/try\s*\{/.test(lines.slice(Math.max(0, i - 3), i).join('\n'))) {
      const inTry = lines.slice(0, i).some(l => /try\s*\{/.test(l)) && 
                    !lines.slice(0, i).some(l => /}\s*catch/.test(l));
      if (!inTry && !/\.catch\s*\(/.test(line)) {
        issues.push({
          ruleId: 'BUG005', message: 'await 调用缺少 try/catch 或 .catch() 错误处理',
          severity: 'info', category: 'bugs', line: lineNum,
          suggestion: '用 try/catch 包裹 await 调用', code: line.trim(),
        });
      }
    }

    if (/console\.(log|debug|info|warn|error)\s*\(/.test(line)) {
      issues.push({
        ruleId: 'BUG003', message: '生产代码中不应包含console.log',
        severity: 'info', category: 'bugs', line: lineNum,
        suggestion: '使用日志框架替代console.log', code: line.trim(),
      });
    }

    // === 性能优化 ===
    if (/for\s*\(/.test(line) || /while\s*\(/.test(line) || /\.forEach\s*\(/.test(line)) {
      const nextLines = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      if (/querySelector|getElementById|createElement|appendChild/.test(nextLines)) {
        issues.push({
          ruleId: 'PERF001', message: '循环中存在DOM操作，可能影响性能',
          severity: 'warning', category: 'performance', line: lineNum,
          suggestion: '使用DocumentFragment或批量更新DOM', code: line.trim(),
        });
      }
    }

    if (/for\s*\(/.test(line) || /while\s*\(/.test(line)) {
      const nextLines = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      if ((nextLines.match(/\+\s*=/g) || []).length >= 3) {
        issues.push({
          ruleId: 'PERF002', message: '循环中大量字符串拼接，建议使用数组join或模板字符串',
          severity: 'info', category: 'performance', line: lineNum,
          suggestion: '使用数组收集后join或模板字符串',
        });
      }
    }

    // === 代码质量 ===
    if (line.length > 150) {
      issues.push({
        ruleId: 'QUAL001', message: `行过长 (${line.length} 字符)，建议不超过120字符`,
        severity: 'info', category: 'quality', line: lineNum,
        suggestion: '拆分为多行',
      });
    }

    if (/\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line) || /#\s*(TODO|FIXME|HACK|XXX)/i.test(line)) {
      issues.push({
        ruleId: 'QUAL002', message: '代码中包含TODO/FIXME标记',
        severity: 'info', category: 'quality', line: lineNum, code: line.trim(),
      });
    }

    // 魔法数字：独立的数字（非 0、1、-1）且不在声明/导入/注释行
    if (/\D\d{2,}\D/.test(line) && 
        !/const|let|var|import|export|\/\/|\/\*|index|length|size|count|port|status|code|type|version|return|case|default|padding|margin|width|height|timeout|delay|interval/.test(line) &&
        !/^\s*\d/.test(line) &&
        !/0x[0-9a-fA-F]+/.test(line)) {
      const nums = line.match(/\D(\d{2,})\D/g);
      if (nums && nums.length === 1) {
        issues.push({
          ruleId: 'QUAL003', message: '检测到可能的魔法数字，建议提取为命名常量',
          severity: 'info', category: 'quality', line: lineNum,
          suggestion: '使用 const MAX_RETRIES = 3 这样的命名常量', code: line.trim(),
        });
      }
    }
  }

  return issues;
}

// AI驱动的深度代码审查
async function aiReview(content: string, filePath: string, categories: string[]): Promise<ReviewIssue[]> {
  await configManager.init();

  const defaultProvider = configManager.getDefaultProvider();
  if (!defaultProvider) return [];

  const providerConfig = configManager.getProviderConfig(defaultProvider);
  if (!providerConfig.apiKey) return [];

  const provider = createProvider(defaultProvider, {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    timeout: 60000,
    maxRetries: 1,
  });

  const categoryPrompts: Record<string, string> = {
    quality: '代码质量：命名规范、代码结构、可读性、设计模式、SOLID原则',
    bugs: 'Bug检测：空指针、边界条件、类型错误、逻辑错误、资源泄漏',
    performance: '性能优化：算法复杂度、内存泄漏、不必要的计算、缓存策略',
    security: '安全审计：注入攻击、XSS、CSRF、敏感信息泄露、权限问题',
  };

  const selectedCategories = categories.length > 0 ? categories : ['quality', 'bugs', 'performance', 'security'];
  const reviewFocus = selectedCategories.map(c => categoryPrompts[c] || c).join('、');

  const maxCodeLength = 8000;
  const codeForReview = content.length > maxCodeLength
    ? content.slice(0, maxCodeLength) + '\n\n// ... (代码过长，已截断)'
    : content;

  const ext = path.extname(filePath).slice(1);

  const prompt = `你是一个专业的代码审查专家。请审查以下${ext}代码文件。

审查重点：${reviewFocus}

文件路径：${filePath}

请以JSON数组格式输出审查结果，每个问题包含以下字段：
- ruleId: 规则ID（如 QUAL001, BUG001, PERF001, SEC001）
- message: 问题描述
- severity: 严重程度（error/warning/info）
- category: 类别（quality/bugs/performance/security）
- line: 行号（如果知道的话）
- suggestion: 修复建议

只输出JSON数组，不要其他内容。如果没有发现问题，输出空数组 []。

代码：
\`\`\`${ext}
${codeForReview}
\`\`\``;

  try {
    const response = await provider.chat({
      messages: [
        { role: 'system', content: '你是一个代码审查专家，只输出JSON格式的审查结果。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 4096,
    });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const issues = JSON.parse(jsonMatch[0]) as ReviewIssue[];
      return issues.map(issue => ({
        ...issue,
        severity: ['error', 'warning', 'info'].includes(issue.severity) ? issue.severity : 'info' as const,
        category: ['quality', 'bugs', 'performance', 'security'].includes(issue.category) ? issue.category : 'quality' as const,
      }));
    }
  } catch {
    // AI审查失败，静默处理
  }

  return [];
}

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
