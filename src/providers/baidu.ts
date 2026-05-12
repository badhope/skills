import { BaseProvider } from '../base.js';
import type { ChatParams, ChatResponse, StreamChunk, ProviderConfig, Message } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

interface BaiduResponse {
  id: string;
  object: string;
  created: number;
  result: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  is_truncated: boolean;
  need_clear_history: boolean;
}

interface BaiduTokenResponse {
  access_token: string;
  expires_in: number;
}

export class BaiduProvider extends BaseProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: ProviderConfig) {
    super('baidu', config, PROVIDER_INFO.baidu);
  }

  private async getAccessToken(): Promise<string> {
    // 检查token是否过期
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const apiKey = this.getApiKey();
    const secretKey = this.config.apiKey; // 百度需要两个key，这里简化处理

    if (!apiKey) {
      throw new Error('百度API需要配置API Key');
    }

    // 实际实现需要调用百度的token接口
    // 这里简化处理，假设apiKey就是access_token格式
    this.accessToken = apiKey;
    this.tokenExpiresAt = Date.now() + 3600 * 1000; // 1小时过期

    return this.accessToken;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.getDefaultModel();
    const accessToken = await this.getAccessToken();

    const body = {
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_output_tokens: params.maxTokens ?? 4096,
    };

    const url = `${this.getBaseUrl()}/chat/completions?access_token=${accessToken}`;

    const response = await this.retryWithBackoff(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API请求失败 (${res.status}): ${errorText}`);
      }

      return res.json() as Promise<BaiduResponse>;
    });

    return {
      content: response.result || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      cost: this.calculateCost(
        {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        model
      ),
      model,
      provider: 'baidu',
      finishReason: response.is_truncated ? 'length' : 'stop',
    };
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    // 百度流式实现较复杂，这里先返回非流式结果
    const response = await this.chat(params);
    yield { content: response.content, done: false };
    yield { content: '', done: true };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.getApiKey()) {
      return false;
    }

    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}
