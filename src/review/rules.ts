import path from 'path';
import type { ReviewIssue } from './types.js';

// ============================================================
// 快速规则检测（不依赖AI，覆盖常见问题）
// ============================================================

/**
 * 快速规则检测
 * @param content 代码内容
 * @param filePath 文件路径
 * @returns 检测到的问题列表
 */
export function quickRuleCheck(content: string, filePath: string): ReviewIssue[] {
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
