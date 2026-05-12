/**
 * 熔断器模块
 *
 * 防止级联故障，当服务出现故障时自动熔断，保护系统稳定性。
 * 实现状态机：CLOSED（正常）-> OPEN（熔断）-> HALF_OPEN（半开测试）-> CLOSED（恢复）
 */

/**
 * 熔断器配置选项
 */
export interface CircuitBreakerOptions {
  /** 触发熔断的失败次数阈值 */
  failureThreshold: number;
  /** 熔断后重置时间（毫秒） */
  resetTimeout: number;
  /** 半开状态下最大测试调用数 */
  halfOpenMaxCalls: number;
}

/**
 * 熔断器状态枚举
 */
export enum CircuitState {
  /** 正常状态 - 允许请求通过 */
  CLOSED = 'closed',
  /** 熔断状态 - 拒绝请求 */
  OPEN = 'open',
  /** 半开状态 - 允许有限请求测试恢复 */
  HALF_OPEN = 'half-open',
}

/**
 * 熔断器类
 *
 * 包装异步函数调用，在故障率达到阈值时自动熔断。
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private halfOpenCalls: number = 0;
  private options: CircuitBreakerOptions;

  /**
   * 创建熔断器实例
   * @param options - 熔断器配置选项
   */
  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 60000,
      halfOpenMaxCalls: options.halfOpenMaxCalls ?? 3,
    };
  }

  /**
   * 执行被保护的异步函数
   * @param fn - 要执行的异步函数
   * @returns 函数执行结果
   * @throws 当熔断器打开或函数执行失败时抛出错误
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error(`熔断器已打开，请等待 ${this.getRemainingTime()}ms 后重试`);
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
        throw new Error('半开状态测试调用次数已达上限');
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 处理成功调用
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMaxCalls) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * 处理失败调用
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * 状态转换
   * @param state - 目标状态
   */
  private transitionTo(state: CircuitState): void {
    this.state = state;
    if (state === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;
    } else if (state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
      this.successCount = 0;
    }
  }

  /**
   * 检查是否应该尝试重置熔断器
   * @returns 是否可以尝试重置
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.options.resetTimeout;
  }

  /**
   * 获取熔断器重置前的剩余等待时间
   * @returns 剩余时间（毫秒）
   */
  private getRemainingTime(): number {
    if (!this.lastFailureTime) return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.options.resetTimeout - elapsed);
  }

  /**
   * 获取当前熔断器状态
   * @returns 当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 获取熔断器统计信息
   * @returns 统计信息对象
   */
  getStats(): { state: CircuitState; failureCount: number; successCount: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }
}
