import { logger } from '../services/logger.js';

export function logOperation<T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T {
  return (async (...args: any[]) => {
    const start = Date.now();
    logger.debug({ operation: name, args }, 'Starting operation');
    try {
      const result = await fn(...args);
      logger.info({ operation: name, duration: Date.now() - start }, 'Operation completed');
      return result;
    } catch (error) {
      logger.error({ operation: name, error, duration: Date.now() - start }, 'Operation failed');
      throw error;
    }
  }) as T;
}
