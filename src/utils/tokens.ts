/**
 * 简单分词：按空格和标点拆分，转小写，去重
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return [...new Set(
    text.toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
  )];
}

/**
 * 估算 token 数（中文约 1.5 字/token，英文约 4 字符/token）
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      tokens += 1.5;
    } else {
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}
