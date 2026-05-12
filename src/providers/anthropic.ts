import { BaseProvider } from '../base.js';
import type { ChatParams, ChatResponse, StreamChunk, ProviderConfig, Message } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string;
  };
  content_block?: {
    type: string;
    text: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('anthropic', config, PROVIDER_INFO.anthropic);
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.getDefaultModel();
    const { system, messages } = this.convertMessages(params.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
    };

    if (system) {
      body.system = system;
    }

    const response = await this.retryWithBackoff(() =>
      this.makeAnthropicRequest<AnthropicResponse>('/messages', body)
    );

    const content = response.content?.[0]?.text || '';
    const usage = response.usage;

    return {
      content,
      usage: {
        promptTokens: usage?.input_tokens || 0,
        completionTokens: usage?.output_tokens || 0,
        totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      },
      cost: this.calculateCost(
        {
          promptTokens: usage?.input_tokens || 0,
          completionTokens: usage?.output_tokens || 0,
          totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        },
        model
      ),
      model: response.model,
      provider: 'anthropic',
      finishReason: this.mapFinishReason(response.stop_reason),
    };
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    const model = params.model || this.getDefaultModel();
    const { system, messages } = this.convertMessages(params.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    const response = await this.retryStreamWithBackoff(() =>
      this.makeAnthropicStreamRequest('/messages', body)
    );

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || line.startsWith('event:')) continue;

          if (line.startsWith('data: ')) {
            try {
              const event: AnthropicStreamEvent = JSON.parse(line.slice(6));

              if (event.type === 'content_block_delta' && event.delta?.text) {
                yield {
                  content: event.delta.text,
                  done: false,
                };
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      content: '',
      done: true,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.getApiKey()) {
      return false;
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        headers: {
          ...this.buildHeaders(),
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listRemoteModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        headers: {
          ...this.buildHeaders(),
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return [];
      const data: any = await response.json();
      // Anthropic 返回 { data: [{ id: "claude-xxx", ... }] }
      const models: Array<{ id: string }> = data.data || [];
      return models.map(m => m.id).sort();
    } catch {
      return [];
    }
  }

  private convertMessages(messages: Message[]): { system?: string; messages: Array<{ role: string; content: string }> } {
    const result: Array<{ role: string; content: string }> = [];
    let systemMessage: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage = msg.content;
      } else {
        result.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    return { system: systemMessage, messages: result };
  }

  private async makeAnthropicRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  private async makeAnthropicStreamRequest(endpoint: string, body: Record<string, unknown>): Promise<Response> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.getTimeout()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`流式请求失败 (${response.status}): ${errorText}`);
    }

    return response;
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.getApiKey() || '',
    };

    return headers;
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'content_filter' | undefined {
    if (reason === 'end_turn') return 'stop';
    if (reason === 'max_tokens') return 'length';
    if (reason === 'stop_sequence') return 'stop';
    return undefined;
  }
}
