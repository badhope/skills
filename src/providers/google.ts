import { BaseProvider } from '../base.js';
import type { ChatParams, ChatResponse, StreamChunk, ProviderConfig, Message } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

interface GoogleResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GoogleProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('google', config, PROVIDER_INFO.google);
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const model = params.model || this.getDefaultModel();
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error('Google API需要配置API Key');
    }

    const { contents, systemInstruction } = this.convertMessages(params.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const url = `${this.getBaseUrl()}/models/${model}:generateContent?key=${apiKey}`;

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

      return res.json() as Promise<GoogleResponse>;
    });

    const candidate = response.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';
    const usage = response.usageMetadata;

    return {
      content,
      usage: {
        promptTokens: usage?.promptTokenCount || 0,
        completionTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
      },
      cost: this.calculateCost(
        {
          promptTokens: usage?.promptTokenCount || 0,
          completionTokens: usage?.candidatesTokenCount || 0,
          totalTokens: usage?.totalTokenCount || 0,
        },
        model
      ),
      model,
      provider: 'google',
      finishReason: this.mapFinishReason(candidate?.finishReason),
    };
  }

  async *stream(params: ChatParams): AsyncGenerator<StreamChunk> {
    const model = params.model || this.getDefaultModel();
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error('Google API需要配置API Key');
    }

    const { contents, systemInstruction } = this.convertMessages(params.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const url = `${this.getBaseUrl()}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await this.retryStreamWithBackoff(async () => {
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
        throw new Error(`流式请求失败 (${res.status}): ${errorText}`);
      }

      return res;
    });

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
          if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;

          if (line.startsWith('data: ')) {
            try {
              const data: GoogleResponse = JSON.parse(line.slice(6));
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

              if (text) {
                yield {
                  content: text,
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
      const apiKey = this.getApiKey();
      const response = await fetch(`${this.getBaseUrl()}/models?key=${apiKey}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listRemoteModels(): Promise<string[]> {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) return [];
      const response = await fetch(`${this.getBaseUrl()}/models?key=${apiKey}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return [];
      const data: any = await response.json();
      // Google 返回 { models: [{ name: "models/gemini-xxx", ... }] }
      const models: Array<{ name: string }> = data.models || [];
      return models
        .map(m => m.name.replace(/^models\//, ''))  // 去掉 "models/" 前缀
        .sort();
    } catch {
      return [];
    }
  }

  private convertMessages(messages: Message[]): { contents: Array<{ role: string; parts: Array<{ text: string }> }>; systemInstruction?: { parts: Array<{ text: string }> } } {
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { contents, systemInstruction };
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'content_filter' | undefined {
    if (reason === 'STOP') return 'stop';
    if (reason === 'MAX_TOKENS') return 'length';
    if (reason === 'SAFETY') return 'content_filter';
    return undefined;
  }
}
