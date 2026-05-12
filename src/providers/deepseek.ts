import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

export class DeepSeekProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super({ ...config, baseUrl: PROVIDER_INFO.deepseek.baseUrl });
    // 覆盖provider类型
    (this as any).providerType = 'deepseek';
    (this as any).providerInfo = PROVIDER_INFO.deepseek;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_INFO.deepseek.baseUrl;
  }
}
