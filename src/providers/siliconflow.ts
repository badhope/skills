import { OpenAIProvider } from './openai.js';
import type { ProviderConfig } from '../types.js';
import { PROVIDER_INFO } from '../types.js';

export class SiliconFlowProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super({ ...config, baseUrl: PROVIDER_INFO.siliconflow.baseUrl });
    (this as any).providerType = 'siliconflow';
    (this as any).providerInfo = PROVIDER_INFO.siliconflow;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || PROVIDER_INFO.siliconflow.baseUrl;
  }
}
