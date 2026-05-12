import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

export class ZhipuProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super({ ...config, baseUrl: PROVIDER_INFO.zhipu.baseUrl });
    (this as any).providerType = 'zhipu';
    (this as any).providerInfo = PROVIDER_INFO.zhipu;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_INFO.zhipu.baseUrl;
  }
}
