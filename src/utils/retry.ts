export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export type ErrorCategory = 'rate_limit' | 'auth' | 'server' | 'timeout' | 'invalid_request' | 'unknown';

/**
 * 分类错误类型
 */
export function classifyError(error: Error | Response): ErrorCategory {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as Response).status;
    if (status === 429) return 'rate_limit';
    if (status === 401 || status === 403) return 'auth';
    if (status >= 500) return 'server';
    if (status === 400) return 'invalid_request';
    return 'unknown';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('rate limit') || message.includes('429')) return 'rate_limit';
    if (message.includes('unauthorized') || message.includes('401') || message.includes('invalid key')) return 'auth';
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('500') || message.includes('server error')) return 'server';
    if (message.includes('400') || message.includes('bad request')) return 'invalid_request';
  }
  return 'unknown';
}

/**
 * 判断错误是否可重试
 */
export function shouldRetry(error: Error | Response): boolean {
  const category = classifyError(error);
  return category === 'rate_limit' || category === 'server' || category === 'timeout';
}

/**
 * 等待指定毫秒
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 指数退避重试
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  shouldRetryFn: (error: Error) => boolean = shouldRetry
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!shouldRetryFn(error as Error)) {
        throw error;
      }

      if (attempt === config.maxRetries - 1) {
        throw error;
      }

      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        config.maxDelay
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error('重试次数已用尽');
}

/**
 * 指数退避重试（流式请求版）
 */
export async function retryStreamWithBackoff(
  fn: () => Promise<Response>,
  config: RetryConfig,
  shouldRetryFn: (error: Error) => boolean = shouldRetry
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!shouldRetryFn(error as Error)) {
        throw error;
      }

      if (attempt === config.maxRetries - 1) {
        throw error;
      }

      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        config.maxDelay
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error('重试次数已用尽');
}
