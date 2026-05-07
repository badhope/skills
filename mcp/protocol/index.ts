interface ProtocolMessage {
  id: string;
  type: string;
  sender: string;
  receiver?: string;
  timestamp: number;
  payload: any;
  metadata?: Record<string, any>;
}

interface ToolCallRequest extends ProtocolMessage {
  type: 'tool_call_request';
  payload: {
    toolId: string;
    params: Record<string, any>;
    timeout?: number;
    retries?: number;
  };
}

interface ToolCallResponse extends ProtocolMessage {
  type: 'tool_call_response';
  payload: {
    requestId: string;
    success: boolean;
    data?: any;
    error?: ProtocolError;
    executionTime: number;
  };
}

interface ProtocolError {
  code: string;
  message: string;
  details?: any;
  retryable?: boolean;
}

const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
};

class ProtocolValidator {
  static validateRequest(request: ToolCallRequest): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!request.id) errors.push('Missing message id');
    if (!request.sender) errors.push('Missing sender');
    if (!request.payload?.toolId) errors.push('Missing toolId in payload');
    if (request.payload?.timeout && typeof request.payload.timeout !== 'number') {
      errors.push('Timeout must be a number');
    }
    if (request.payload?.retries && (typeof request.payload.retries !== 'number' || request.payload.retries < 0)) {
      errors.push('Retries must be a non-negative number');
    }

    return { valid: errors.length === 0, errors };
  }

  static validateParams(params: Record<string, any>, schema: any): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!schema || !schema.parameters) return { valid: true };

    for (const param of schema.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
      if (param.name in params) {
        const value = params[param.name];
        if (!this.validateType(value, param.type)) {
          errors.push(`Parameter ${param.name} has invalid type. Expected ${param.type}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private static validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'object': return typeof value === 'object' && value !== null;
      case 'array': return Array.isArray(value);
      case 'any': return true;
      default: return true;
    }
  }

  static createError(code: string, message: string, details?: any): ProtocolError {
    return {
      code,
      message,
      details,
      retryable: [ERROR_CODES.TIMEOUT, ERROR_CODES.RATE_LIMIT_EXCEEDED].includes(code)
    };
  }
}

class AsyncExecutor {
  private pendingRequests: Map<string, { resolve: (value: ToolCallResponse) => void; reject: (error: any) => void; timeoutId: NodeJS.Timeout }> = new Map();

  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    requestId: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      fn().then((result) => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        resolve(result);
      }).catch((error) => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  async executeWithRetries<T>(
    fn: () => Promise<T>,
    retries: number,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i < retries) {
          await this.delay(delay * Math.pow(2, i));
        }
      }
    }

    throw lastError || new Error('Unknown error');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cancelRequest(requestId: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeoutId);
    pending.reject(new Error('Request cancelled'));
    this.pendingRequests.delete(requestId);
    return true;
  }
}

export const tools = {
  validate_request: {
    description: '验证协议请求',
    parameters: {
      request: { type: 'object', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const result = ProtocolValidator.validateRequest(params.request as ToolCallRequest);
      return result;
    }
  },

  validate_params: {
    description: '验证参数',
    parameters: {
      params: { type: 'object', required: true },
      schema: { type: 'object', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const result = ProtocolValidator.validateParams(params.params, params.schema);
      return result;
    }
  },

  create_error: {
    description: '创建标准化错误',
    parameters: {
      code: { type: 'string', required: true },
      message: { type: 'string', required: true },
      details: { type: 'object', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const error = ProtocolValidator.createError(params.code, params.message, params.details);
      return { success: true, error };
    }
  },

  execute_with_timeout: {
    description: '带超时的异步执行',
    parameters: {
      taskId: { type: 'string', required: true },
      timeout: { type: 'number', required: false, default: 30000 }
    },
    execute: async (params: Record<string, any>) => {
      const executor = new AsyncExecutor();
      try {
        const result = await executor.executeWithTimeout(
          () => Promise.resolve({ status: 'executing' }),
          params.timeout || 30000,
          params.taskId
        );
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: ProtocolValidator.createError(ERROR_CODES.TIMEOUT, error instanceof Error ? error.message : 'Timeout')
        };
      }
    }
  },

  execute_with_retries: {
    description: '带重试的异步执行',
    parameters: {
      taskId: { type: 'string', required: true },
      retries: { type: 'number', required: false, default: 3 }
    },
    execute: async (params: Record<string, any>) => {
      const executor = new AsyncExecutor();
      try {
        const result = await executor.executeWithRetries(
          () => Promise.resolve({ status: 'executing' }),
          params.retries || 3
        );
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: ProtocolValidator.createError(ERROR_CODES.INTERNAL_ERROR, error instanceof Error ? error.message : 'Execution failed')
        };
      }
    }
  },

  get_error_codes: {
    description: '获取所有错误码',
    parameters: {},
    execute: async () => {
      return { success: true, errorCodes: ERROR_CODES };
    }
  },

  format_response: {
    description: '格式化响应消息',
    parameters: {
      requestId: { type: 'string', required: true },
      success: { type: 'boolean', required: true },
      data: { type: 'object', required: false },
      error: { type: 'object', required: false },
      executionTime: { type: 'number', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const response: ToolCallResponse = {
        id: `response-${params.requestId}`,
        type: 'tool_call_response',
        sender: 'protocol',
        timestamp: Date.now(),
        payload: {
          requestId: params.requestId,
          success: params.success,
          data: params.data,
          error: params.error,
          executionTime: params.executionTime
        }
      };
      return { success: true, response };
    }
  }
};

export const serverId = 'protocol';
export default { serverId, tools };