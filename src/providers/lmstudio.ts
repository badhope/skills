import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

interface LMStudioListResponse {
  object: string;
  data: LMStudioModel[];
}

export class LMStudioProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super({ ...config, baseUrl: PROVIDER_INFO.lmstudio.baseUrl });
    (this as any).providerType = 'lmstudio';
    (this as any).providerInfo = PROVIDER_INFO.lmstudio;
  }

  protected getBaseUrl(): string {
    // LM Studio 默认端口1234
    return this.config.baseUrl || 'http://127.0.0.1:1234/v1';
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // 获取LM Studio中已加载的模型列表
  async getLocalModels(): Promise<Array<{ id: string; name: string; owned_by: string }>> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as LMStudioListResponse;

      return data.data.map(model => ({
        id: model.id,
        name: model.id,
        owned_by: model.owned_by,
      }));
    } catch {
      return [];
    }
  }
}
