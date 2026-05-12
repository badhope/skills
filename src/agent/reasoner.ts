/**
 * AI 推理执行器模块
 *
 * 让 Agent 的空操作步骤（如"分析错误原因"、"制定修复方案"）真正调用 LLM 进行推理。
 * 提供三种核心推理能力：通用步骤推理、代码生成、代码分析。
 */

import { configManager } from '../config/manager.js';
import { createProvider } from '../providers/index.js';
import type { ProviderType, ChatParams, Message } from '../types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import chalk from 'chalk';

// 模块级别的熔断器实例
const llmCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000,
  halfOpenMaxCalls: 2,
});

// 带超时的 fetch 包装
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

// ==================== 上下文接口 ====================

/**
 * 通用推理步骤的上下文
 */
export interface ReasonContext {
  /** 用户原始任务描述 */
  taskDescription: string;
  /** 识别的意图（如 bug-hunter、fullstack） */
  intent: string;
  /** 当前步骤描述（如"分析错误原因"） */
  stepDescription: string;
  /** 之前步骤的执行结果，作为上下文传入 */
  previousResults: string[];
  /** 当前可用的工具列表 */
  availableTools: string[];
}

/**
 * 代码生成上下文
 */
export interface CodeContext {
  /** 用户原始任务描述 */
  taskDescription: string;
  /** 识别的意图 */
  intent: string;
  /** 编程语言（如 TypeScript、Python） */
  language?: string;
  /** 具体需求列表 */
  requirements: string[];
  /** 之前步骤的执行结果 */
  previousResults: string[];
}

/**
 * 代码分析上下文
 */
export interface AnalyzeContext {
  /** 要分析的代码内容 */
  code: string;
  /** 任务描述 */
  taskDescription: string;
  /** 分析关注点（如 "安全"、"性能"、"bug"、"可读性"） */
  focus?: string;
}

// ==================== System Prompts ====================

/**
 * 根据意图类型选择不同的 system prompt
 * 每种意图对应一个专业角色，让 AI 以专家身份进行推理
 */
export const SYSTEM_PROMPTS: Record<string, string> = {
  'bug-hunter': `你是一个专业的调试专家。你的任务是：
- 精确定位代码中的 bug 和错误
- 分析错误的根本原因（root cause），而不是只看表面现象
- 提供清晰、可操作的修复方案
- 在分析时考虑边界情况和异常路径
- 用中文回答，结构化输出你的分析结果`,

  'fullstack': `你是一个全栈开发工程师。你的任务是：
- 根据需求设计和生成高质量的代码
- 考虑前端和后端的协调配合
- 遵循最佳实践和设计模式
- 确保代码的可维护性和可扩展性
- 用中文回答，生成的代码需要包含必要的注释`,

  'code-review': `你是一个代码审查专家。你的任务是：
- 从代码质量、可读性、可维护性等角度审查代码
- 识别潜在的 bug、安全漏洞和性能问题
- 提出具体的改进建议，包括代码示例
- 评估代码是否符合项目规范和最佳实践
- 用中文回答，结构化输出审查意见`,

  'refactor': `你是一个代码重构专家。你的任务是：
- 识别代码中的"坏味道"（code smells）
- 提出合理的重构方案，遵循 SOLID 原则
- 确保重构不改变外部行为
- 逐步给出重构步骤，降低风险
- 用中文回答，详细说明每个重构步骤的理由`,

  'security': `你是一个安全审计专家。你的任务是：
- 全面扫描代码中的安全漏洞
- 检查常见安全问题：注入攻击、XSS、CSRF、认证授权缺陷等
- 评估依赖项的已知漏洞
- 提供安全加固建议和修复代码
- 用中文回答，按严重程度分级输出安全问题`,

  'testing': `你是一个测试工程师。你的任务是：
- 分析代码并设计全面的测试用例
- 覆盖正常流程、边界情况和异常情况
- 生成可运行的测试代码
- 提出测试策略建议
- 用中文回答，确保测试用例清晰可执行`,

  'devops': `你是一个 DevOps 工程师。你的任务是：
- 分析部署和运维相关的需求
- 提供容器化、CI/CD、监控等方案
- 编写部署脚本和配置文件
- 考虑系统的可观测性和稳定性
- 用中文回答，提供完整的运维方案`,

  'database': `你是一个数据库专家。你的任务是：
- 设计和优化数据库 schema
- 编写高效的 SQL 查询
- 分析查询性能并给出优化建议
- 考虑数据一致性和并发问题
- 用中文回答，提供详细的数据库方案`,

  'documentation': `你是一个技术文档专家。你的任务是：
- 编写清晰、准确、完整的技术文档
- 组织文档结构，确保逻辑清晰
- 生成 API 文档、使用指南、架构说明等
- 确保文档与代码保持同步
- 用中文回答，输出格式规范的文档内容`,

  'default': `你是一个 AI 开发助手。你的任务是：
- 理解用户的需求并提供准确的回答
- 在需要时生成代码、分析问题或提供建议
- 确保回答清晰、结构化、有实用价值
- 用中文回答`,
};

// ==================== 内部工具函数 ====================

let configInitialized = false;

/**
 * 获取默认配置，合并用户传入的配置
 */
function resolveConfig(config?: ReasonerConfig): Required<ReasonerConfig> {
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
function getSystemPrompt(intent: string): string {
  return SYSTEM_PROMPTS[intent] || SYSTEM_PROMPTS['default'];
}

/**
 * 创建 provider 实例并调用 chat 接口
 * 统一封装了配置初始化、provider 创建、LLM 调用的流程
 */
async function callLLM(
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

// ==================== 核心推理函数 ====================

/**
 * 对单个步骤进行 AI 推理
 *
 * 将当前步骤的描述、任务上下文、之前步骤的结果组合成 prompt，
 * 调用 LLM 获取推理结果。适用于 Agent 执行流程中的"思考型"步骤，
 * 如"分析错误原因"、"制定修复方案"、"识别代码坏味道"等。
 *
 * @param context - 推理上下文，包含任务描述、意图、步骤信息等
 * @param config - 可选的推理器配置（provider、model、temperature 等）
 * @returns AI 的推理文本结果
 *
 * @example
 * ```typescript
 * const result = await reasonStep({
 *   taskDescription: '修复登录页面的表单验证问题',
 *   intent: 'bug-hunter',
 *   stepDescription: '分析错误原因',
 *   previousResults: ['表单提交后没有显示错误提示', '控制台报错: Cannot read property of undefined'],
 *   availableTools: ['read_file', 'search_files', 'write_file'],
 * });
 * ```
 */
export async function reasonStep(
  context: ReasonContext,
  config?: ReasonerConfig
): Promise<string> {
  if (!context.taskDescription?.trim() || !context.stepDescription?.trim()) {
    return '（跳过）任务描述或步骤描述为空';
  }

  // 获取对应意图的 system prompt
  const systemPrompt = getSystemPrompt(context.intent);

  // 构造之前步骤结果的上下文段落
  let previousContext = '';
  if (context.previousResults.length > 0) {
    previousContext = '\n\n--- 之前步骤的执行结果 ---\n' +
      context.previousResults
        .map((result, index) => `[步骤 ${index + 1}]: ${result}`)
        .join('\n\n') +
      '\n--- 之前步骤结束 ---';
  }

  // 构造可用工具列表段落
  let toolsContext = '';
  if (context.availableTools.length > 0) {
    toolsContext = `\n\n当前可用的工具: ${context.availableTools.join(', ')}`;
  }

  // 构造 user prompt
  const userPrompt = [
    `## 任务描述`,
    context.taskDescription,
    '',
    `## 当前步骤`,
    context.stepDescription,
    previousContext,
    toolsContext,
    '',
    `## 要求`,
    `请针对当前步骤"${context.stepDescription}"进行深入分析和推理。`,
    `结合之前步骤的结果，给出具体、可操作的输出。`,
    `如果需要执行后续操作，请明确指出。`,
  ].join('\n');

  // 组装消息列表
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 调用 LLM 进行推理
  return callLLM(messages, config);
}

/**
 * 带重试的推理步骤
 *
 * 在推理失败时自动重试，并验证输出质量。
 *
 * @param context - 推理上下文
 * @param config - 推理器配置，支持 maxRetries 和 retryDelay 选项
 * @returns AI 的推理文本结果
 */
export async function reasonStepWithRetry(
  context: ReasonContext,
  config?: ReasonerConfig & { maxRetries?: number; retryDelay?: number }
): Promise<string> {
  const maxRetries = config?.maxRetries ?? 3;
  const retryDelay = config?.retryDelay ?? 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await reasonStep(context, config);

      // 验证输出
      const { OutputValidator, DEFAULT_SCHEMAS } = await import('./output-validator.js');
      const validator = new OutputValidator();
      Object.entries(DEFAULT_SCHEMAS).forEach(([intent, schema]) => {
        validator.registerSchema(intent, schema);
      });

      const validation = validator.validate(result, context.intent);
      if (!validation.valid) {
        console.warn(chalk.yellow(`输出验证失败（尝试 ${attempt}/${maxRetries}）:`));
        validation.errors.forEach(e => console.warn(chalk.yellow(`  - ${e}`)));
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay * attempt)); // 指数退避
          continue;
        }
      }

      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.warn(chalk.yellow(`推理失败，${retryDelay * attempt}ms 后重试（${attempt}/${maxRetries}）...`));
      await new Promise(r => setTimeout(r, retryDelay * attempt));
    }
  }

  throw new Error('所有重试均失败');
}

/**
 * 生成代码
 *
 * 根据任务描述和需求列表，调用 LLM 生成代码。
 * 自动根据意图选择合适的 system prompt，并注入之前步骤的上下文。
 *
 * @param context - 代码生成上下文
 * @param config - 可选的推理器配置
 * @returns 生成的代码文本（可能包含 markdown 代码块）
 *
 * @example
 * ```typescript
 * const code = await generateCode({
 *   taskDescription: '创建一个用户认证中间件',
 *   intent: 'fullstack',
 *   language: 'TypeScript',
 *   requirements: [
 *     '支持 JWT token 验证',
 *     '支持 API Key 验证',
 *     '提供角色权限检查',
 *   ],
 *   previousResults: ['项目使用 Express 框架', '数据库使用 PostgreSQL'],
 * });
 * ```
 */
export async function generateCode(
  context: CodeContext,
  config?: ReasonerConfig
): Promise<string> {
  // 获取对应意图的 system prompt
  const systemPrompt = getSystemPrompt(context.intent);

  // 构造语言提示
  const languageHint = context.language
    ? `\n目标编程语言: ${context.language}`
    : '';

  // 构造需求列表
  const requirementsText = context.requirements
    .map((req, index) => `${index + 1}. ${req}`)
    .join('\n');

  // 构造之前步骤结果的上下文段落
  let previousContext = '';
  if (context.previousResults.length > 0) {
    previousContext = '\n\n--- 参考信息 ---\n' +
      context.previousResults.join('\n') +
      '\n--- 参考信息结束 ---';
  }

  // 构造 user prompt
  const userPrompt = [
    `## 任务描述`,
    context.taskDescription,
    languageHint,
    '',
    `## 具体需求`,
    requirementsText,
    previousContext,
    '',
    `## 要求`,
    `请根据以上需求生成完整的代码。`,
    `代码需要包含必要的注释和错误处理。`,
    `直接输出代码，使用 markdown 代码块格式。`,
  ].join('\n');

  // 组装消息列表
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 调用 LLM 生成代码
  return callLLM(messages, config);
}

/**
 * 分析代码
 *
 * 对给定的代码进行深度分析，根据关注点（安全、性能、bug 等）
 * 提供专业的分析报告。
 *
 * @param context - 代码分析上下文
 * @param config - 可选的推理器配置
 * @returns AI 的代码分析结果
 *
 * @example
 * ```typescript
 * const analysis = await analyzeCode({
 *   code: 'function login(user, pass) { db.query(`SELECT * FROM users WHERE name=${user} AND pass=${pass}`) }',
 *   taskDescription: '审查登录功能的代码安全性',
 *   focus: '安全',
 * });
 * ```
 */
export async function analyzeCode(
  context: AnalyzeContext,
  config?: ReasonerConfig
): Promise<string> {
  // 根据关注点选择最合适的 system prompt
  let systemPrompt = SYSTEM_PROMPTS['default'];

  if (context.focus) {
    const focusLower = context.focus.toLowerCase();
    // 根据关注点映射到对应的专家 prompt
    if (/安全|security|漏洞|vulnerability/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['security'];
    } else if (/性能|performance|优化|optimize/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['refactor'];
    } else if (/bug|错误|error|调试|debug/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['bug-hunter'];
    } else if (/测试|test|覆盖/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['testing'];
    } else if (/审查|review|质量|quality/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['code-review'];
    } else if (/可读性|readability|规范|style/.test(focusLower)) {
      systemPrompt = SYSTEM_PROMPTS['code-review'];
    }
  }

  // 构造关注点提示
  const focusHint = context.focus
    ? `\n分析关注点: ${context.focus}`
    : '\n分析关注点: 全面分析（包括正确性、安全性、性能、可读性）';

  // 构造 user prompt
  const userPrompt = [
    `## 任务描述`,
    context.taskDescription,
    focusHint,
    '',
    `## 待分析代码`,
    '```',
    context.code,
    '```',
    '',
    `## 要求`,
    `请对以上代码进行深入分析。`,
    `按严重程度或重要性排列你的发现。`,
    `对每个问题提供具体的改进建议和修复代码示例。`,
  ].join('\n');

  // 组装消息列表
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 调用 LLM 分析代码
  return callLLM(messages, config);
}
