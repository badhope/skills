import type {
  ProviderType,
  ChatParams,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
  ModelInfo,
  TokenUsage,
  CostInfo,
  PROVIDER_INFO
} from './types.js';

export type ErrorCategory = 'rate_limit' | 'auth' | 'server' | 'timeout' | 'invalid_request' | 'unknown';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected providerType: ProviderType;
  protected providerInfo: typeof PROVIDER_INFO[ProviderType];

  constructor(
    providerType: ProviderType,
    config: ProviderConfig,
    providerInfo: typeof PROVIDER_INFO[ProviderType]
  ) {
    this.providerType = providerType;
    this.config = config;
    this.providerInfo = providerInfo;
  }

  abstract chat(params: ChatParams): Promise<ChatResponse>;
  abstract stream(params: ChatParams): AsyncGenerator<StreamChunk>;
  abstract isAvailable(): Promise<boolean>;

  getName(): string {
    return this.providerInfo.displayName;
  }

  getType(): ProviderType {
    return this.providerType;
  }

  getModels(): ModelInfo[] {
    return this.providerInfo.models;
  }

  getDefaultModel(): string {
    return this.config.model || this.providerInfo.models[0]?.id || '';
  }

  getModelInfo(modelId: string): ModelInfo | undefined {
    return this.providerInfo.models.find(m => m.id === modelId);
  }

  getConfig(): ProviderConfig {
    return { ...this.config };
  }

  public calculateCost(usage: TokenUsage, modelId: string): CostInfo {
    const model = this.getModelInfo(modelId);
    if (!model) {
      return { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' };
    }

    const inputCost = (usage.promptTokens / 1000000) * model.pricing.inputPerMillion;
    const outputCost = (usage.completionTokens / 1000000) * model.pricing.outputPerMillion;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: model.pricing.currency
    };
  }

  public getTimeout(): number {
    return this.config.timeout || 30000;
  }

  public getMaxRetries(): number {
    return this.config.maxRetries || 3;
  }

  protected getRetryConfig(): RetryConfig {
    return {
      maxRetries: this.getMaxRetries(),
      baseDelay: 1000,
      maxDelay: 60000
    };
  }

  public classifyError(error: Error | Response): ErrorCategory {
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

  public shouldRetry(error: Error | Response): boolean {
    const category = this.classifyError(error);
    return category === 'rate_limit' || category === 'server' || category === 'timeout';
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries?: number
  ): Promise<T> {
    const config = this.getRetryConfig();
    const retries = maxRetries ?? config.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error as Error)) {
          throw error;
        }

        if (attempt === retries - 1) {
          throw error;
        }

        const delay = Math.min(
          config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          config.maxDelay
        );
        
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('重试次数已用尽');
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    return headers;
  }

  protected getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || this.providerInfo.baseUrl;
  }

  protected async makeRequest<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout())
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  protected async makeStreamRequest(
    url: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout())
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`流式请求失败 (${response.status}): ${errorText}`);
    }

    return response;
  }

  protected async retryStreamWithBackoff(
    fn: () => Promise<Response>
  ): Promise<Response> {
    const config = this.getRetryConfig();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error as Error)) {
          throw error;
        }

        if (attempt === config.maxRetries - 1) {
          throw error;
        }

        const delay = Math.min(
          config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          config.maxDelay
        );
        
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('重试次数已用尽');
  }
}
