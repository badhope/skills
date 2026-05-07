import { TaskContext, TaskStep } from './types';

export interface Metric {
  operationId: string;
  operationType: 'skill' | 'workflow' | 'phase' | 'task' | 'tool';
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  context?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  skippedOperations: number;
  successRate: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  operationsByType: Record<string, number>;
  slowOperations: Metric[];
  errorsByType: Record<string, number>;
}

export interface OperationLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  operationId: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface AlertConfig {
  enabled: boolean;
  slowOperationThresholdMs: number;
  errorRateThreshold: number;
  notificationTargets: string[];
}

export interface Alert {
  id: string;
  timestamp: Date;
  type: 'slow_operation' | 'high_error_rate' | 'critical_error';
  severity: 'warning' | 'critical';
  message: string;
  metadata?: Record<string, any>;
  acknowledged: boolean;
}

export class Monitor {
  private metrics: Map<string, Metric> = new Map();
  private logs: OperationLog[] = [];
  private alerts: Alert[] = [];
  private maxLogs = 1000;
  private enableConsole = true;
  private alertConfig: AlertConfig = {
    enabled: true,
    slowOperationThresholdMs: 30000,
    errorRateThreshold: 0.1,
    notificationTargets: []
  };
  private alertIdCounter = 0;

  recordStart(operationId: string, operationType: Metric['operationType'], name: string, context?: string): void {
    const metric: Metric = {
      operationId,
      operationType,
      name,
      startTime: Date.now(),
      status: 'running',
      context
    };

    this.metrics.set(operationId, metric);
    this.log('info', operationId, `开始: ${name}`, { operationType, context });

    if (this.enableConsole) {
      console.log(`[Monitor] ▶ ${name} (${operationType})`);
    }
  }

  recordTask(task: TaskStep): void {
    this.log('info', `task-${task.skillName}`, 
      `Task ${task.status}: ${task.input}`, 
      { skill: task.skillName, output: task.output, duration: task.timestamp }
    );
  }

  private log(level: OperationLog['level'], operationId: string, message: string, metadata?: Record<string, any>): void {
    const entry: OperationLog = {
      timestamp: new Date().toISOString(),
      level,
      operationId,
      message,
      metadata
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  debug(operationId: string, message: string, metadata?: Record<string, any>): void {
    this.log('debug', operationId, message, metadata);
    if (this.enableConsole) {
      console.debug(`[Monitor] [DEBUG] ${message}`);
    }
  }

  info(operationId: string, message: string, metadata?: Record<string, any>): void {
    this.log('info', operationId, message, metadata);
    if (this.enableConsole) {
      console.info(`[Monitor] ${message}`);
    }
  }

  warn(operationId: string, message: string, metadata?: Record<string, any>): void {
    this.log('warn', operationId, message, metadata);
    if (this.enableConsole) {
      console.warn(`[Monitor] ${message}`);
    }
  }

  error(operationId: string, message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('error', operationId, message, { error: error?.message, stack: error?.stack, ...metadata });
    if (this.enableConsole) {
      console.error(`[Monitor] ${message}`, error);
    }
  }

  getPerformanceReport(): PerformanceReport {
    const completed = Array.from(this.metrics.values()).filter(m => m.status === 'completed');
    const failed = Array.from(this.metrics.values()).filter(m => m.status === 'failed');
    const skipped = Array.from(this.metrics.values()).filter(m => m.status === 'skipped');
    const running = Array.from(this.metrics.values()).filter(m => m.status === 'running');

    const durations = completed.map(m => m.duration || 0).filter(d => d > 0);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

    const operationsByType: Record<string, number> = {};
    const errorsByType: Record<string, number> = {};

    for (const metric of this.metrics.values()) {
      operationsByType[metric.operationType] = (operationsByType[metric.operationType] || 0) + 1;
      
      if (metric.status === 'failed') {
        const errorType = metric.error?.split(':')[0] || 'unknown';
        errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      }
    }

    const allMetrics = Array.from(this.metrics.values());
    const slowOperations = allMetrics
      .filter(m => m.duration && m.duration > avgDuration * 2)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    return {
      totalOperations: this.metrics.size,
      completedOperations: completed.length,
      failedOperations: failed.length,
      skippedOperations: skipped.length,
      successRate: this.metrics.size > 0 ? (completed.length / this.metrics.size) * 100 : 0,
      avgDuration,
      minDuration,
      maxDuration,
      operationsByType,
      slowOperations,
      errorsByType
    };
  }

  getLogs(level?: OperationLog['level'], limit?: number): OperationLog[] {
    let filtered = this.logs;

    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }

    if (limit) {
      filtered = filtered.slice(-limit);
    }

    return filtered;
  }

  getRunningOperations(): Metric[] {
    return Array.from(this.metrics.values()).filter(m => m.status === 'running');
  }

  getMetric(operationId: string): Metric | undefined {
    return this.metrics.get(operationId);
  }

  clear(): void {
    this.metrics.clear();
    this.logs = [];
    this.alerts = [];
  }

  setConsoleOutput(enable: boolean): void {
    this.enableConsole = enable;
  }

  setAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  private triggerAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    message: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.alertConfig.enabled) return;

    const alert: Alert = {
      id: `alert-${++this.alertIdCounter}`,
      timestamp: new Date(),
      type,
      severity,
      message,
      metadata,
      acknowledged: false
    };

    this.alerts.push(alert);
    
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    console.warn(`[Monitor] [ALERT] [${severity.toUpperCase()}] ${message}`);
  }

  recordEnd(operationId: string, status: 'completed' | 'failed' | 'skipped', error?: string, metadata?: Record<string, any>): void {
    const metric = this.metrics.get(operationId);
    
    if (!metric) {
      console.warn(`[Monitor] Metric ${operationId} not found`);
      return;
    }

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.status = status;
    metric.error = error;
    metric.metadata = metadata;

    const duration = metric.duration;
    const statusSymbol = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⊘';

    this.log(status === 'failed' ? 'error' : 'info', operationId, 
      `${statusSymbol} 完成: ${metric.name} (${duration}ms)`, 
      { status, error, duration, ...metadata }
    );

    if (duration > this.alertConfig.slowOperationThresholdMs) {
      this.triggerAlert(
        'slow_operation',
        'warning',
        `操作执行过慢: ${metric.name} (${duration}ms)`,
        { operationId, duration, threshold: this.alertConfig.slowOperationThresholdMs }
      );
    }

    if (status === 'failed' && error) {
      this.triggerAlert(
        'critical_error',
        'critical',
        `操作失败: ${metric.name} - ${error}`,
        { operationId, error }
      );
    }

    if (this.enableConsole) {
      if (status === 'failed') {
        console.error(`[Monitor] ✗ ${metric.name} failed: ${error} (${duration}ms)`);
      } else if (status === 'skipped') {
        console.warn(`[Monitor] ⊘ ${metric.name} skipped (${duration}ms)`);
      } else {
        console.log(`[Monitor] ✓ ${metric.name} completed (${duration}ms)`);
      }
    }
  }

  checkErrorRate(): void {
    const report = this.getPerformanceReport();
    if (report.successRate < (1 - this.alertConfig.errorRateThreshold) * 100) {
      this.triggerAlert(
        'high_error_rate',
        'warning',
        `错误率过高: ${report.failedOperations}/${report.totalOperations}`,
        { successRate: report.successRate, threshold: this.alertConfig.errorRateThreshold }
      );
    }
  }

  getAlerts(severity?: Alert['severity'], acknowledged?: boolean): Alert[] {
    let filtered = this.alerts;
    
    if (severity) {
      filtered = filtered.filter(a => a.severity === severity);
    }
    
    if (acknowledged !== undefined) {
      filtered = filtered.filter(a => a.acknowledged === acknowledged);
    }
    
    return filtered;
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  acknowledgeAllAlerts(): void {
    for (const alert of this.alerts) {
      alert.acknowledged = true;
    }
  }

  exportMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  exportLogs(): OperationLog[] {
    return [...this.logs];
  }
}

export const globalMonitor = new Monitor();