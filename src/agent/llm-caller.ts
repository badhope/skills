/**
 * AI 推理执行器 - LLM 调用基础设施
 *
 * 提供 LLM 调用的底层能力，包括：
 * 1. 配置解析与合并
 * 2. Provider 创建与调用
 * 3. 超时保护
 * 4. 熔断器保护
 */

import { configManager } from '../config/manager.js';
import { createProvider } from '../providers/index.js';
import type { ProviderType, ChatParams, Message } from '../types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { SYSTEM_PROMPTS } from './prompts.js';

// ==================== 配置接口 ====================

/**
 * 推理器配置
 */
export interface ReasonerConfig {
  /** LLM 提供商类型，不指定则用全局默认 */
  provider?: ProviderType;
  /** 模型名称，不指定则用提供商默认模型 */
  model?: string;
  /** 生成温度，默认 0.3（推理任务需要低温度以保证稳定输出） */
  temperature?: number;
  /** 最大生成 token 数，默认 2048 */
  maxTokens?: number;
  /** 超时时间（毫秒），默认 60000 */
  timeout?: number;
}

// ==================== 模块状态 ====================

/** 模块级别的熔断器实例 */
const llmCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000,
  halfOpenMaxCalls: 2,
});

/** 配置是否已初始化 */
let configInitialized = false;

// ==================== 内部工具函数 ====================

/**
 * 带超时的 fetch 包装
 */
async function fetchWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} 超时（${timeoutMs}ms）`)), timeoutMs)
    ),
  ]);
}

// ==================== 导出函数 ====================

/**
 * 获取默认配置，合并用户传入的配置
 */
export function resolveConfig(config?: ReasonerConfig): Required<ReasonerConfig> {
  return {
    provider: config?.provider || configManager.getDefaultProvider() || 'openai',
    model: config?.model || '',
    temperature: config?.temperature ?? 0.3,
    maxTokens: config?.maxTokens ?? 2048,
    timeout: config?.timeout ?? 60000,
  };
}

/**
 * 根据意图获取对应的 system prompt
 */
export function getSystemPrompt(intent: string): string {
  return SYSTEM_PROMPTS[intent] || SYSTEM_PROMPTS['default'];
}

/**
 * 创建 provider 实例并调用 chat 接口
 * 统一封装了配置初始化、provider 创建、LLM 调用的流程
 */
export async function callLLM(
  messages: Message[],
  config?: ReasonerConfig
): Promise<string> {
  return llmCircuitBreaker.execute(async () => {
    try {
      // 初始化配置管理器
      if (!configInitialized) {
        await configManager.init();
        configInitialized = true;
      }

      const resolved = resolveConfig(config);

      // 获取提供商配置
      const providerConfig = configManager.getProviderConfig(resolved.provider);

      // 创建 provider 实例
      const provider = createProvider(resolved.provider, {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: resolved.model || providerConfig.defaultModel,
        timeout: config?.timeout ?? 60000,  // 推理任务需要更长超时（60秒）
        maxRetries: providerConfig.maxRetries || 2,
      });

      // 构造聊天参数
      const chatParams: ChatParams = {
        messages,
        temperature: resolved.temperature,
        maxTokens: resolved.maxTokens,
      };

      // 如果指定了模型，覆盖 provider 默认模型
      if (resolved.model) {
        chatParams.model = resolved.model;
      }

      // 调用 LLM（带超时保护）
      const response = await fetchWithTimeout(
        () => provider.chat(chatParams),
        config?.timeout ?? 60000,
        'LLM 调用'
      );
      return response.content;
    } catch (error) {
      throw new Error(`LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
