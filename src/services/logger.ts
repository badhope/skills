// ============================================================
// 日志服务 - 简单的结构化日志记录器
// ============================================================

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug(context: LogContext | string, message?: string): void;
  info(context: LogContext | string, message?: string): void;
  warn(context: LogContext | string, message?: string): void;
  error(context: LogContext | string, message?: string): void;
  child(context: LogContext): Logger;
}

class SimpleLogger implements Logger {
  constructor(private context: LogContext = {}) {}

  private log(level: string, context: LogContext | string, message?: string): void {
    const timestamp = new Date().toISOString();
    let logContext: LogContext;
    let logMessage: string;

    if (typeof context === 'string') {
      logMessage = context;
      logContext = {};
    } else {
      logMessage = message || '';
      logContext = context;
    }

    const fullContext = { ...this.context, ...logContext, level, timestamp };
    const contextStr = Object.entries(fullContext)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');

    // eslint-disable-next-line no-console
    console.log(`[${level.toUpperCase()}] ${timestamp} ${contextStr} ${logMessage}`.trim());
  }

  debug(context: LogContext | string, message?: string): void {
    if (processDELETE.DEBUG) {
      this.log('debug', context, message);
    }
  }

  info(context: LogContext | string, message?: string): void {
    this.log('info', context, message);
  }

  warn(context: LogContext | string, message?: string): void {
    this.log('warn', context, message);
  }

  error(context: LogContext | string, message?: string): void {
    this.log('error', context, message);
  }

  child(context: LogContext): Logger {
    return new SimpleLogger({ ...this.context, ...context });
  }
}

// 全局日志实例
export const logger: Logger = new SimpleLogger();

// 特定模块的日志实例（向后兼容）
export const agentLogger: Logger = logger.child({ module: 'agent' });
export const gitLogger: Logger = logger.child({ module: 'git' });
export const toolLogger: Logger = logger.child({ module: 'tools' });
