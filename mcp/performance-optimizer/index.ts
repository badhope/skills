export interface PerformanceMetric {
  id: string;
  name: string;
  category: 'cpu' | 'memory' | 'network' | 'storage' | 'execution';
  value: number;
  unit: string;
  timestamp: Date;
  threshold?: {
    warning: number;
    critical: number;
  };
}

export interface OptimizationSuggestion {
  id: string;
  type: 'code' | 'memory' | 'network' | 'configuration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  impact: {
    improvement: string;
    effort: 'low' | 'medium' | 'high';
  };
  affectedAreas: string[];
}

export interface PerformanceReport {
  timestamp: Date;
  metrics: PerformanceMetric[];
  suggestions: OptimizationSuggestion[];
  overallHealth: 'healthy' | 'warning' | 'critical';
  summary: {
    totalMetrics: number;
    warningCount: number;
    criticalCount: number;
    suggestionCount: number;
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

export interface ExecutionProfile {
  operationId: string;
  name: string;
  duration: number;
  calls: number;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
}

export class PerformanceOptimizer {
  private metrics: PerformanceMetric[] = [];
  private executionProfiles: Map<string, ExecutionProfile> = new Map();
  private maxMetrics = 1000;
  private enabled = true;

  collectMetric(metric: Omit<PerformanceMetric, 'id' | 'timestamp'>): void {
    if (!this.enabled) return;

    const newMetric: PerformanceMetric = {
      ...metric,
      id: `metric-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date()
    };

    this.metrics.push(newMetric);

    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  recordExecution(operationId: string, name: string, duration: number): void {
    if (!this.enabled) return;

    const existing = this.executionProfiles.get(operationId);

    if (existing) {
      existing.calls++;
      existing.duration += duration;
      existing.avgDuration = existing.duration / existing.calls;
      existing.maxDuration = Math.max(existing.maxDuration, duration);
      existing.minDuration = Math.min(existing.minDuration, duration);
    } else {
      this.executionProfiles.set(operationId, {
        operationId,
        name,
        duration,
        calls: 1,
        avgDuration: duration,
        maxDuration: duration,
        minDuration: duration
      });
    }
  }

  analyzePerformance(): PerformanceReport {
    const suggestions: OptimizationSuggestion[] = [];
    let warningCount = 0;
    let criticalCount = 0;

    for (const metric of this.metrics) {
      if (metric.threshold) {
        if (metric.value >= metric.threshold.critical) {
          criticalCount++;
          suggestions.push(this.generateCriticalSuggestion(metric));
        } else if (metric.value >= metric.threshold.warning) {
          warningCount++;
          suggestions.push(this.generateWarningSuggestion(metric));
        }
      }
    }

    suggestions.push(...this.analyzeExecutionProfiles());
    suggestions.push(...this.analyzeMemoryUsage());
    suggestions.push(...this.analyzeCacheEfficiency());

    suggestions.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    const overallHealth = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

    return {
      timestamp: new Date(),
      metrics: [...this.metrics],
      suggestions,
      overallHealth,
      summary: {
        totalMetrics: this.metrics.length,
        warningCount,
        criticalCount,
        suggestionCount: suggestions.length
      }
    };
  }

  private generateCriticalSuggestion(metric: PerformanceMetric): OptimizationSuggestion {
    return {
      id: `suggestion-${metric.id}`,
      type: this.getSuggestionType(metric.category),
      severity: 'critical',
      description: `${metric.name} 达到临界值 (${metric.value} ${metric.unit})`,
      recommendation: this.getCriticalRecommendation(metric),
      impact: {
        improvement: '高',
        effort: '高'
      },
      affectedAreas: [metric.name]
    };
  }

  private generateWarningSuggestion(metric: PerformanceMetric): OptimizationSuggestion {
    return {
      id: `suggestion-${metric.id}`,
      type: this.getSuggestionType(metric.category),
      severity: 'medium',
      description: `${metric.name} 接近警告阈值 (${metric.value} ${metric.unit})`,
      recommendation: this.getWarningRecommendation(metric),
      impact: {
        improvement: '中',
        effort: '中'
      },
      affectedAreas: [metric.name]
    };
  }

  private getSuggestionType(category: PerformanceMetric['category']): OptimizationSuggestion['type'] {
    const typeMap: Record<PerformanceMetric['category'], OptimizationSuggestion['type']> = {
      cpu: 'code',
      memory: 'memory',
      network: 'network',
      storage: 'configuration',
      execution: 'code'
    };
    return typeMap[category];
  }

  private getCriticalRecommendation(metric: PerformanceMetric): string {
    const recommendations: Record<string, string> = {
      cpu: '立即优化CPU密集型操作，考虑异步处理或并行化',
      memory: '立即检查内存泄漏，优化数据结构，考虑缓存策略',
      network: '立即优化网络请求，考虑批量请求或缓存',
      storage: '立即清理存储空间，优化数据库查询',
      execution: '立即分析慢执行操作，优化算法或添加缓存'
    };
    return recommendations[metric.category] || '立即调查并优化';
  }

  private getWarningRecommendation(metric: PerformanceMetric): string {
    const recommendations: Record<string, string> = {
      cpu: '监控CPU使用情况，考虑优化热点代码',
      memory: '监控内存使用，考虑优化数据结构',
      network: '考虑优化网络请求，添加缓存层',
      storage: '考虑清理旧数据，优化存储配置',
      execution: '分析执行时间分布，优化慢操作'
    };
    return recommendations[metric.category] || '监控并考虑优化';
  }

  private analyzeExecutionProfiles(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    for (const [, profile] of this.executionProfiles) {
      if (profile.avgDuration > 1000) {
        suggestions.push({
          id: `exec-${profile.operationId}`,
          type: 'code',
          severity: 'high',
          description: `操作 "${profile.name}" 平均执行时间过长 (${profile.avgDuration.toFixed(2)}ms)`,
          recommendation: `优化 "${profile.name}" 的实现，考虑缓存结果或改进算法`,
          impact: {
            improvement: '高',
            effort: '中'
          },
          affectedAreas: [profile.name]
        });
      } else if (profile.avgDuration > 500) {
        suggestions.push({
          id: `exec-${profile.operationId}`,
          type: 'code',
          severity: 'medium',
          description: `操作 "${profile.name}" 执行时间较长 (${profile.avgDuration.toFixed(2)}ms)`,
          recommendation: `考虑优化 "${profile.name}"，添加缓存或异步处理`,
          impact: {
            improvement: '中',
            effort: '低'
          },
          affectedAreas: [profile.name]
        });
      }
    }

    return suggestions;
  }

  private analyzeMemoryUsage(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    const memoryMetrics = this.metrics.filter(m => m.category === 'memory');
    if (memoryMetrics.length > 0) {
      const latestMemory = memoryMetrics[memoryMetrics.length - 1];
      if (latestMemory.value > 800) {
        suggestions.push({
          id: 'memory-high',
          type: 'memory',
          severity: 'high',
          description: `内存使用量较高 (${latestMemory.value} MB)`,
          recommendation: '检查内存泄漏，优化对象生命周期，考虑使用流式处理',
          impact: {
            improvement: '高',
            effort: '中'
          },
          affectedAreas: ['内存管理']
        });
      }
    }

    return suggestions;
  }

  private analyzeCacheEfficiency(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    const cacheMetrics = this.metrics.filter(m => m.category === 'execution' && m.name.includes('cache'));
    if (cacheMetrics.length > 0) {
      const hitRateMetric = cacheMetrics.find(m => m.name.toLowerCase().includes('hit'));
      if (hitRateMetric && hitRateMetric.value < 70) {
        suggestions.push({
          id: 'cache-low-hit',
          type: 'configuration',
          severity: 'medium',
          description: `缓存命中率较低 (${hitRateMetric.value}%)`,
          recommendation: '优化缓存策略，增加缓存时间，检查缓存键设计',
          impact: {
            improvement: '中',
            effort: '低'
          },
          affectedAreas: ['缓存系统']
        });
      }
    }

    return suggestions;
  }

  getExecutionProfiles(): ExecutionProfile[] {
    return Array.from(this.executionProfiles.values()).sort((a, b) => b.duration - a.duration);
  }

  getMetricsByCategory(category: PerformanceMetric['category']): PerformanceMetric[] {
    return this.metrics.filter(m => m.category === category);
  }

  getRecentMetrics(hours: number = 1): PerformanceMetric[] {
    const cutoffTime = Date.now() - hours * 3600000;
    return this.metrics.filter(m => m.timestamp.getTime() >= cutoffTime);
  }

  clearMetrics(): void {
    this.metrics = [];
    this.executionProfiles.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setMaxMetrics(max: number): void {
    this.maxMetrics = max;
  }
}

export const globalPerformanceOptimizer = new PerformanceOptimizer();

export const tools = {
  collectMetric: (
    name: string,
    category: PerformanceMetric['category'],
    value: number,
    unit: string,
    threshold?: { warning: number; critical: number }
  ) => {
    globalPerformanceOptimizer.collectMetric({ name, category, value, unit, threshold });
    return { success: true };
  },

  recordExecution: (operationId: string, name: string, duration: number) => {
    globalPerformanceOptimizer.recordExecution(operationId, name, duration);
    return { success: true };
  },

  analyzePerformance: () => {
    const report = globalPerformanceOptimizer.analyzePerformance();
    return report;
  },

  getExecutionProfiles: () => {
    const profiles = globalPerformanceOptimizer.getExecutionProfiles();
    return { profiles };
  },

  getMetricsByCategory: (category: PerformanceMetric['category']) => {
    const metrics = globalPerformanceOptimizer.getMetricsByCategory(category);
    return { metrics };
  },

  getRecentMetrics: (hours: number = 1) => {
    const metrics = globalPerformanceOptimizer.getRecentMetrics(hours);
    return { metrics };
  },

  clearMetrics: () => {
    globalPerformanceOptimizer.clearMetrics();
    return { success: true };
  },

  setEnabled: (enabled: boolean) => {
    globalPerformanceOptimizer.setEnabled(enabled);
    return { success: true };
  },

  isEnabled: () => {
    const enabled = globalPerformanceOptimizer.isEnabled();
    return { enabled };
  }
};

export default {
  PerformanceOptimizer,
  globalPerformanceOptimizer,
  tools
};