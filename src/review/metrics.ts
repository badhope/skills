// ============================================================
// 代码指标分析（不依赖AI）
// ============================================================

/**
 * 分析代码指标
 * @param content 代码内容
 * @returns 代码指标统计
 */
export function analyzeMetrics(content: string) {
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
