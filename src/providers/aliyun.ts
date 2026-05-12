import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

export class AliyunProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super({ ...config, baseUrl: PROVIDER_INFO.aliyun.baseUrl });
    (this as any).providerType = 'aliyun';
    (this as any).providerInfo = PROVIDER_INFO.aliyun;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_INFO.aliyun.baseUrl;
  }
}
