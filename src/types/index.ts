export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'siliconflow'
  | 'aliyun'
  | 'zhipu'
  | 'baidu'
  | 'deepseek'
  | 'ollama'
  | 'lmstudio';

export const PROVIDER_TYPE_LIST: ProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'siliconflow',
  'aliyun',
  'zhipu',
  'baidu',
  'deepseek',
  'ollama',
  'lmstudio'
];

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  contextWindow: number;
  maxOutput: number;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    currency: 'USD' | 'CNY';
  };
  capabilities: {
    chat: boolean;
    stream: boolean;
    embed: boolean;
    tools: boolean;
    thinking: boolean;
    vision: boolean;
    audio: boolean;
  };
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

export interface ChatParams {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  usage?: TokenUsage;
  cost?: CostInfo;
  model: string;
  provider: ProviderType;
  finishReason?: 'stop' | 'length' | 'content_filter';
}

export interface StreamChunk {
  content: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: 'USD' | 'CNY';
}

export interface ProviderStatus {
  name: ProviderType;
  displayName: string;
  available: boolean;
  configured: boolean;
  models: ModelInfo[];
  defaultModel?: string;
}

// Re-export provider data
export { PROVIDER_INFO } from './providers.js';
