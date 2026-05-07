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
  model: string;
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

export const PROVIDER_INFO: Record<ProviderType, {
  name: string;
  displayName: string;
  description: string;
  baseUrl: string;
  requiresApiKey: boolean;
  freeTier: boolean;
  models: ModelInfo[];
}> = {
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-5.5/5.4系列模型，国际领先',
    baseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    freeTier: false,
    models: [
      {
        id: 'gpt-5.5-instant',
        name: 'GPT-5.5 Instant',
        provider: 'openai',
        contextWindow: 400000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 1.25, outputPerMillion: 10, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        provider: 'openai',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 5, outputPerMillion: 30, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'gpt-5.4-nano',
        name: 'GPT-5.4 Nano',
        provider: 'openai',
        contextWindow: 400000,
        maxOutput: 32768,
        pricing: { inputPerMillion: 0.05, outputPerMillion: 0.4, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic Claude',
    description: 'Claude 4.7/4.6系列，编程和Agent能力强',
    baseUrl: 'https://api.anthropic.com',
    requiresApiKey: true,
    freeTier: false,
    models: [
      {
        id: 'claude-opus-4.7',
        name: 'Claude Opus 4.7',
        provider: 'anthropic',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 5, outputPerMillion: 25, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6',
        provider: 'anthropic',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 3, outputPerMillion: 15, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: true, audio: false }
      }
    ]
  },
  google: {
    name: 'google',
    displayName: 'Google Gemini',
    description: 'Gemini 3.1/2.5系列，多模态能力强',
    baseUrl: 'https://generativelanguage.googleapis.com',
    requiresApiKey: true,
    freeTier: true,
    models: [
      {
        id: 'gemini-3.1-flash',
        name: 'Gemini 3.1 Flash',
        provider: 'google',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 0.25, outputPerMillion: 1.5, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      }
    ]
  },
  siliconflow: {
    name: 'siliconflow',
    displayName: '硅基流动',
    description: 'DeepSeek-V4/Kimi K2.6/GLM-5.1，国产低成本',
    baseUrl: 'https://api.siliconflow.cn/v1',
    requiresApiKey: true,
    freeTier: true,
    models: [
      {
        id: 'deepseek-ai/DeepSeek-V4-Pro',
        name: 'DeepSeek V4 Pro',
        provider: 'siliconflow',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 2, outputPerMillion: 4, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'deepseek-ai/DeepSeek-V4-Flash',
        name: 'DeepSeek V4 Flash',
        provider: 'siliconflow',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 0.5, outputPerMillion: 1, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'moonshotai/kimi-k2.6',
        name: 'Kimi K2.6',
        provider: 'siliconflow',
        contextWindow: 256000,
        maxOutput: 32768,
        pricing: { inputPerMillion: 3, outputPerMillion: 15, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'THUDM/glm-5.1',
        name: 'GLM-5.1',
        provider: 'siliconflow',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 6, outputPerMillion: 24, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: false, audio: false }
      }
    ]
  },
  aliyun: {
    name: 'aliyun',
    displayName: '阿里云百炼',
    description: 'Qwen 3.6/3.5系列，编程Agent全面升级',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requiresApiKey: true,
    freeTier: true,
    models: [
      {
        id: 'qwen3.6-max',
        name: 'Qwen 3.6 Max',
        provider: 'aliyun',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 5, outputPerMillion: 20, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'qwen3.6-plus',
        name: 'Qwen 3.6 Plus',
        provider: 'aliyun',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 2, outputPerMillion: 8, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'qwen3.6-flash',
        name: 'Qwen 3.6 Flash',
        provider: 'aliyun',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 0.5, outputPerMillion: 2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: true, audio: false }
      }
    ]
  },
  zhipu: {
    name: 'zhipu',
    displayName: '智谱AI',
    description: 'GLM-5.1/5系列，8小时持续工作',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresApiKey: true,
    freeTier: true,
    models: [
      {
        id: 'glm-5.1',
        name: 'GLM-5.1',
        provider: 'zhipu',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 6, outputPerMillion: 24, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'glm-5',
        name: 'GLM-5',
        provider: 'zhipu',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 4, outputPerMillion: 18, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'glm-4.7-flash',
        name: 'GLM-4.7 Flash',
        provider: 'zhipu',
        contextWindow: 200000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: false, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  },
  baidu: {
    name: 'baidu',
    displayName: '百度千帆',
    description: 'ERNIE 5.1/5.0系列，原生多模态',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    requiresApiKey: true,
    freeTier: true,
    models: [
      {
        id: 'ernie-5.1-preview',
        name: 'ERNIE 5.1 Preview',
        provider: 'baidu',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 1, outputPerMillion: 4, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      },
      {
        id: 'ernie-5.0',
        name: 'ERNIE 5.0',
        provider: 'baidu',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0.8, outputPerMillion: 3.2, currency: 'CNY' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: true, audio: false }
      }
    ]
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    description: 'DeepSeek V4系列，开源编程第一',
    baseUrl: 'https://api.deepseek.com/v1',
    requiresApiKey: true,
    freeTier: false,
    models: [
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        provider: 'deepseek',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 0.28, outputPerMillion: 0.42, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: false, audio: false }
      },
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        provider: 'deepseek',
        contextWindow: 1000000,
        maxOutput: 65536,
        pricing: { inputPerMillion: 0.07, outputPerMillion: 0.1, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: true, vision: false, audio: false }
      }
    ]
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama (本地)',
    description: '本地模型运行，支持Gemma4/Qwen3/GLM4',
    baseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    freeTier: true,
    models: [
      {
        id: 'gemma4:31b-coding-mtp-bf16',
        name: 'Gemma 4 31B Coding MTP',
        provider: 'ollama',
        contextWindow: 256000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: true, audio: false }
      },
      {
        id: 'qwen3-coder',
        name: 'Qwen 3 Coder',
        provider: 'ollama',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'glm-4.7-flash',
        name: 'GLM 4.7 Flash',
        provider: 'ollama',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  },
  lmstudio: {
    name: 'lmstudio',
    displayName: 'LM Studio (本地)',
    description: '本地模型GUI管理，OpenAI兼容',
    baseUrl: 'http://localhost:1234/v1',
    requiresApiKey: false,
    freeTier: true,
    models: [
      {
        id: 'llama-3.1-8b',
        name: 'Llama 3.1 8B',
        provider: 'lmstudio',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      },
      {
        id: 'mistral-7b',
        name: 'Mistral 7B',
        provider: 'lmstudio',
        contextWindow: 128000,
        maxOutput: 8192,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
        capabilities: { chat: true, stream: true, embed: true, tools: true, thinking: false, vision: false, audio: false }
      }
    ]
  }
};
