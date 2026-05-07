import crypto from 'crypto';

interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

interface PerformanceMetric {
  id: string;
  timestamp: number;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

interface ErrorReport {
  id: string;
  timestamp: number;
  error: string;
  stack?: string;
  source: string;
  context?: Record<string, any>;
  count: number;
  lastOccurrence: number;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  log(level: LogEntry['level'], source: string, message: string, metadata?: Record<string, any>): LogEntry {
    const entry: LogEntry = {
      id: `${level}-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      level,
      source,
      message,
      metadata
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    return entry;
  }

  debug(source: string, message: string, metadata?: Record<string, any>): LogEntry {
    return this.log('debug', source, message, metadata);
  }

  info(source: string, message: string, metadata?: Record<string, any>): LogEntry {
    return this.log('info', source, message, metadata);
  }

  warn(source: string, message: string, metadata?: Record<string, any>): LogEntry {
    return this.log('warn', source, message, metadata);
  }

  error(source: string, message: string, metadata?: Record<string, any>): LogEntry {
    return this.log('error', source, message, metadata);
  }

  getLogs(level?: LogEntry['level'], source?: string): LogEntry[] {
    let result = [...this.logs];
    
    if (level) {
      result = result.filter(l => l.level === level);
    }
    if (source) {
      result = result.filter(l => l.source === source);
    }

    return result.reverse();
  }

  getRecentLogs(count: number = 50): LogEntry[] {
    return [...this.logs].reverse().slice(0, count);
  }
}

class PerformanceTracker {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 5000;

  record(operation: string, duration: number, success: boolean, error?: string, metadata?: Record<string, any>): PerformanceMetric {
    const metric: PerformanceMetric = {
      id: `perf-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      operation,
      duration,
      success,
      error,
      metadata
    };

    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    return metric;
  }

  getMetrics(operation?: string, success?: boolean): PerformanceMetric[] {
    let result = [...this.metrics];
    
    if (operation) {
      result = result.filter(m => m.operation === operation);
    }
    if (success !== undefined) {
      result = result.filter(m => m.success === success);
    }

    return result.reverse();
  }

  getStatistics(operation?: string): {
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
    totalCount: number;
  } {
    let metrics = this.metrics;
    if (operation) {
      metrics = metrics.filter(m => m.operation === operation);
    }

    if (metrics.length === 0) {
      return { avgDuration: 0, minDuration: 0, maxDuration: 0, successRate: 0, totalCount: 0 };
    }

    const successCount = metrics.filter(m => m.success).length;
    const durations = metrics.map(m => m.duration);

    return {
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successCount / metrics.length) * 100,
      totalCount: metrics.length
    };
  }
}

class ErrorMonitor {
  private errors: Map<string, ErrorReport> = new Map();

  report(error: string, source: string, stack?: string, context?: Record<string, any>): ErrorReport {
    const key = `${source}:${error}`;
    const existing = this.errors.get(key);

    const report: ErrorReport = {
      id: existing?.id || `error-${Date.now()}`,
      timestamp: existing?.timestamp || Date.now(),
      error,
      stack: existing?.stack || stack,
      source,
      context: { ...existing?.context, ...context },
      count: (existing?.count || 0) + 1,
      lastOccurrence: Date.now()
    };

    this.errors.set(key, report);
    return report;
  }

  getErrors(source?: string): ErrorReport[] {
    let result = Array.from(this.errors.values());
    
    if (source) {
      result = result.filter(e => e.source === source);
    }

    return result.sort((a, b) => b.count - a.count);
  }

  getErrorById(id: string): ErrorReport | undefined {
    return Array.from(this.errors.values()).find(e => e.id === id);
  }

  clearError(id: string): boolean {
    for (const [key, report] of this.errors) {
      if (report.id === id) {
        this.errors.delete(key);
        return true;
      }
    }
    return false;
  }

  clearAllErrors(): void {
    this.errors.clear();
  }
}

const logger = new Logger();
const performanceTracker = new PerformanceTracker();
const errorMonitor = new ErrorMonitor();

export const tools = {
  log_info: {
    description: '记录信息日志',
    parameters: {
      source: { type: 'string', required: true },
      message: { type: 'string', required: true },
      metadata: { type: 'object', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const entry = logger.info(params.source, params.message, params.metadata);
      return { success: true, logId: entry.id };
    }
  },

  log_warn: {
    description: '记录警告日志',
    parameters: {
      source: { type: 'string', required: true },
      message: { type: 'string', required: true },
      metadata: { type: 'object', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const entry = logger.warn(params.source, params.message, params.metadata);
      return { success: true, logId: entry.id };
    }
  },

  log_error: {
    description: '记录错误日志',
    parameters: {
      source: { type: 'string', required: true },
      message: { type: 'string', required: true },
      metadata: { type: 'object', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const entry = logger.error(params.source, params.message, params.metadata);
      return { success: true, logId: entry.id };
    }
  },

  get_logs: {
    description: '获取日志',
    parameters: {
      level: { type: 'string', required: false },
      source: { type: 'string', required: false },
      count: { type: 'number', required: false, default: 50 }
    },
    execute: async (params: Record<string, any>) => {
      const logs = params.level || params.source 
        ? logger.getLogs(params.level as LogEntry['level'], params.source)
        : logger.getRecentLogs(params.count || 50);
      return { success: true, logs };
    }
  },

  record_performance: {
    description: '记录性能指标',
    parameters: {
      operation: { type: 'string', required: true },
      duration: { type: 'number', required: true },
      success: { type: 'boolean', required: true },
      error: { type: 'string', required: false },
      metadata: { type: 'object', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const metric = performanceTracker.record(
        params.operation,
        params.duration,
        params.success,
        params.error,
        params.metadata
      );
      return { success: true, metricId: metric.id };
    }
  },

  get_performance_stats: {
    description: '获取性能统计',
    parameters: {
      operation: { type: 'string', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const stats = performanceTracker.getStatistics(params.operation);
      return { success: true, stats };
    }
  },

  report_error: {
    description: '报告错误',
    parameters: {
      error: { type: 'string', required: true },
      source: { type: 'string', required: true },
      stack: { type: 'string', required: false },
      context: { type: 'object', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const report = errorMonitor.report(params.error, params.source, params.stack, params.context);
      return { success: true, errorId: report.id };
    }
  },

  get_errors: {
    description: '获取错误列表',
    parameters: {
      source: { type: 'string', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const errors = errorMonitor.getErrors(params.source);
      return { success: true, errors };
    }
  },

  clear_errors: {
    description: '清除错误',
    parameters: {
      errorId: { type: 'string', required: false }
    },
    execute: async (params: Record<string, any>) => {
      if (params.errorId) {
        const success = errorMonitor.clearError(params.errorId);
        return { success };
      }
      errorMonitor.clearAllErrors();
      return { success: true };
    }
  },

  get_summary: {
    description: '获取监控摘要',
    parameters: {},
    execute: async () => {
      const logs = logger.getRecentLogs(10);
      const stats = performanceTracker.getStatistics();
      const errors = errorMonitor.getErrors().slice(0, 5);

      return {
        success: true,
        summary: {
          recentLogs: logs.length,
          performance: stats,
          errorCount: errors.length,
          topErrors: errors
        }
      };
    }
  }
};

export const serverId = 'monitoring';
export default { serverId, tools };