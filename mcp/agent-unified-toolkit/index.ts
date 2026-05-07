import crypto from 'crypto';
import { createMCPServer } from '../../packages/core/mcp/builder';
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils';

interface ToolCall {
  id: string;
  toolName: string;
  serverId?: string;
  parameters: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'failed';
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
  retryCount: number;
  maxRetries: number;
}

interface ToolRegistry {
  [key: string]: {
    serverId: string;
    toolName: string;
    description: string;
    parameters: any;
    categories: string[];
  };
}

const TOOL_REGISTRY: ToolRegistry = {
  'clarify-analyze': {
    serverId: 'clarify',
    toolName: 'analyze_intent',
    description: '分析用户意图',
    parameters: { input: { type: 'string' } },
    categories: ['analysis', 'understanding']
  },
  'clarify-generate': {
    serverId: 'clarify',
    toolName: 'generate_clarification',
    description: '生成澄清问题',
    parameters: { input: { type: 'string' } },
    categories: ['understanding', 'questions']
  },
  'libraries-recommend': {
    serverId: 'libraries',
    toolName: 'recommend_libraries',
    description: '推荐库',
    parameters: { category: { type: 'string' } },
    categories: ['libraries', 'recommendation']
  },
  'libraries-compare': {
    serverId: 'libraries',
    toolName: 'compare_libraries',
    description: '比较库',
    parameters: { libraries: { type: 'array' } },
    categories: ['libraries', 'comparison']
  },
  'proxy-detect': {
    serverId: 'proxy',
    toolName: 'detect_proxy_settings',
    description: '检测代理设置',
    parameters: {},
    categories: ['network', 'proxy']
  },
  'proxy-connect': {
    serverId: 'proxy',
    toolName: 'test_network_connectivity',
    description: '测试网络连接',
    parameters: { url: { type: 'string' } },
    categories: ['network', 'testing']
  },
  'secrets-list': {
    serverId: 'secrets',
    toolName: 'list_env_secrets',
    description: '列出环境变量',
    parameters: {},
    categories: ['security', 'secrets']
  },
  'secrets-validate': {
    serverId: 'secrets',
    toolName: 'validate_api_key',
    description: '验证API密钥',
    parameters: { key: { type: 'string' } },
    categories: ['security', 'validation']
  },
  'web-search': {
    serverId: 'web-search',
    toolName: 'search',
    description: '网络搜索',
    parameters: { query: { type: 'string' } },
    categories: ['search', 'network']
  },
  'data-crawler-search': {
    serverId: 'data-crawler',
    toolName: 'search_resources',
    description: '资源搜索',
    parameters: { query: { type: 'string' } },
    categories: ['data', 'search', 'crawler']
  },
  'data-crawler-crawl': {
    serverId: 'data-crawler',
    toolName: 'web_crawler',
    description: '网页爬虫',
    parameters: { urls: { type: 'array' } },
    categories: ['data', 'crawler', 'network']
  },
  'data-crawler-process': {
    serverId: 'data-crawler',
    toolName: 'data_preprocessing',
    description: '数据预处理',
    parameters: { data: { type: 'array' } },
    categories: ['data', 'processing']
  }
};

function generateId(): string {
  return `tool-${Date.now()}-${crypto.randomUUID()}`;
}

export default createMCPServer({
  name: 'unified-toolkit',
  version: '3.0.0',
  description: '统一工具调用引擎 - 为所有智能体提供工具调用能力',
  author: 'MCP Expert Community',
  icon: '🔧'
})
  .addTool({
    name: 'discover_tools',
    description: '根据任务描述发现相关工具',
    parameters: {
      taskDescription: { type: 'string', description: '任务描述', required: true },
      categories: { type: 'array', description: '工具类别过滤', required: false },
      limit: { type: 'number', description: '返回数量', default: 10, required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        taskDescription: { type: 'string', required: true },
        categories: { type: 'array', required: false },
        limit: { type: 'number', required: false, min: 1, max: 50 }
      });
      
      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const task = validation.data.taskDescription.toLowerCase();
      const categories = validation.data.categories as string[] || [];
      const limit = validation.data.limit || 10;

      const matchedTools = Object.entries(TOOL_REGISTRY)
        .filter(([key, tool]) => {
          const matchesKeywords = 
            tool.description.toLowerCase().includes(task) ||
            task.includes(tool.toolName.toLowerCase()) ||
            tool.categories.some(cat => task.includes(cat));
          
          const matchesCategory = 
            categories.length === 0 || 
            tool.categories.some(cat => categories.includes(cat));
          
          return matchesKeywords && matchesCategory;
        })
        .slice(0, limit);

      return formatSuccess({
        discovered: true,
        taskDescription: validation.data.taskDescription,
        tools: matchedTools.map(([key, tool]) => ({
          id: key,
          toolName: tool.toolName,
          serverId: tool.serverId,
          description: tool.description,
          categories: tool.categories
        })),
        count: matchedTools.length,
        recommendations: [
          '使用 call_tool 来执行发现的工具',
          '使用 parallel_tools 来并行调用多个工具',
          '结合反思工具来优化工具选择'
        ]
      });
    }
  })
  .addTool({
    name: 'call_tool',
    description: '调用单个工具（带重试和回退）',
    parameters: {
      toolId: { type: 'string', description: '工具ID', required: true },
      parameters: { type: 'object', description: '工具参数', required: true },
      maxRetries: { type: 'number', description: '最大重试次数', default: 3, required: false },
      timeoutMs: { type: 'number', description: '超时时间(ms)', default: 30000, required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        toolId: { type: 'string', required: true },
        parameters: { type: 'object', required: true },
        maxRetries: { type: 'number', required: false, min: 0, max: 10 },
        timeoutMs: { type: 'number', required: false, min: 1000, max: 300000 }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const toolId = validation.data.toolId;
      const toolParams = validation.data.parameters;
      const maxRetries = validation.data.maxRetries || 3;

      const tool = TOOL_REGISTRY[toolId];
      if (!tool) {
        return formatError('Tool not found', { toolId });
      }

      const toolCall: ToolCall = {
        id: generateId(),
        toolName: tool.toolName,
        serverId: tool.serverId,
        parameters: toolParams,
        status: 'pending',
        retryCount: 0,
        maxRetries
      };

      toolCall.status = 'running';
      toolCall.startTime = Date.now();

      try {
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));
        
        if (Math.random() < 0.1 && toolCall.retryCount < maxRetries) {
          throw new Error('Simulated transient error');
        }

        toolCall.status = 'success';
        toolCall.endTime = Date.now();
        toolCall.result = {
          success: true,
          tool: `${tool.serverId}/${tool.toolName}`,
          parameters: toolParams,
          timestamp: new Date().toISOString(),
          simulatedResult: true,
          message: 'Tool executed successfully (simulated)'
        };

        return formatSuccess({
          toolCall,
          success: true,
          result: toolCall.result,
          duration: toolCall.endTime! - toolCall.startTime!,
          recommendations: [
            '检查结果是否符合预期',
            '考虑是否需要调用更多工具',
            '记录结果到任务历史'
          ]
        });
      } catch (error) {
        toolCall.retryCount++;
        
        if (toolCall.retryCount < maxRetries) {
          return formatSuccess({
            toolCall,
            success: false,
            retrying: true,
            retryCount: toolCall.retryCount,
            nextRetryMs: Math.pow(2, toolCall.retryCount) * 1000,
            message: `Retrying... (${toolCall.retryCount}/${maxRetries})`
          });
        }

        toolCall.status = 'failed';
        toolCall.endTime = Date.now();
        toolCall.error = error instanceof Error ? error.message : 'Unknown error';

        return formatError('Tool call failed', {
          toolCall,
          error: toolCall.error,
          retriesUsed: toolCall.retryCount,
          recommendations: [
            '检查参数是否正确',
            '尝试使用其他工具',
            '检查网络连接'
          ]
        });
      }
    }
  })
  .addTool({
    name: 'parallel_tools',
    description: '并行调用多个工具',
    parameters: {
      toolCalls: { type: 'array', description: '工具调用列表', required: true },
      timeoutMs: { type: 'number', description: '超时时间(ms)', default: 60000, required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        toolCalls: { type: 'array', required: true },
        timeoutMs: { type: 'number', required: false, min: 1000, max: 300000 }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const toolCalls = validation.data.toolCalls as Array<{ toolId: string; parameters: any }>;
      const startTime = Date.now();

      const results = await Promise.all(
        toolCalls.map(async (call) => {
          try {
            const result = await {
              success: true,
              toolId: call.toolId,
              result: 'simulated result',
              duration: Math.random() * 1000
            };
            return result;
          } catch (error) {
            return {
              success: false,
              toolId: call.toolId,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;

      return formatSuccess({
        success: true,
        totalCalls: toolCalls.length,
        successfulCalls: successCount,
        failedCalls: toolCalls.length - successCount,
        totalDurationMs: duration,
        results,
        summary: `Completed ${successCount}/${toolCalls.length} tool calls in ${duration}ms`,
        recommendations: [
          '检查所有工具结果',
          '合并结果到最终输出',
          '考虑是否需要更多工具调用'
        ]
      });
    }
  })
  .addTool({
    name: 'chain_tools',
    description: '链式调用工具 - 前一个结果作为后一个输入',
    parameters: {
      toolChain: { type: 'array', description: '工具链', required: true },
      initialInput: { type: 'any', description: '初始输入', required: true },
      stopOnFailure: { type: 'boolean', description: '失败时停止', default: true, required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        toolChain: { type: 'array', required: true },
        initialInput: { type: 'any', required: true },
        stopOnFailure: { type: 'boolean', required: false }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const toolChain = validation.data.toolChain as Array<{ toolId: string; inputMapping: string }>;
      let currentInput = validation.data.initialInput;
      const chainResults: any[] = [];

      for (const step of toolChain) {
        try {
          const result = {
            success: true,
            toolId: step.toolId,
            input: currentInput,
            output: 'simulated output',
            step: chainResults.length + 1
          };
          
          chainResults.push(result);
          currentInput = result.output;
        } catch (error) {
          const failureResult = {
            success: false,
            toolId: step.toolId,
            error: error instanceof Error ? error.message : 'Unknown error',
            step: chainResults.length + 1
          };
          chainResults.push(failureResult);

          if (validation.data.stopOnFailure !== false) {
            break;
          }
        }
      }

      return formatSuccess({
        success: true,
        chainResults,
        finalResult: currentInput,
        completedSteps: chainResults.filter(r => r.success).length,
        totalSteps: toolChain.length,
        recommendations: [
          '检查链式调用结果',
          '考虑是否需要调整工具链',
          '验证最终输出是否符合预期'
        ]
      });
    }
  })
  .addTool({
    name: 'get_tool_registry',
    description: '获取完整的工具注册表',
    parameters: {
      filterByCategory: { type: 'string', description: '按类别过滤', required: false },
      searchTerm: { type: 'string', description: '搜索词', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filterByCategory: { type: 'string', required: false },
        searchTerm: { type: 'string', required: false }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      let tools = Object.entries(TOOL_REGISTRY);

      if (validation.data.filterByCategory) {
        tools = tools.filter(([key, tool]) => 
          tool.categories.includes(validation.data.filterByCategory)
        );
      }

      if (validation.data.searchTerm) {
        const search = validation.data.searchTerm.toLowerCase();
        tools = tools.filter(([key, tool]) => 
          tool.description.toLowerCase().includes(search) ||
          tool.toolName.toLowerCase().includes(search) ||
          tool.categories.some(cat => cat.toLowerCase().includes(search))
        );
      }

      const categories = new Set<string>();
      Object.values(TOOL_REGISTRY).forEach(tool => 
        tool.categories.forEach(cat => categories.add(cat))
      );

      return formatSuccess({
        totalTools: Object.keys(TOOL_REGISTRY).length,
        filteredTools: tools.length,
        categories: Array.from(categories),
        tools: tools.map(([key, tool]) => ({
          id: key,
          toolName: tool.toolName,
          serverId: tool.serverId,
          description: tool.description,
          categories: tool.categories,
          parameters: tool.parameters
        }))
      });
    }
  })
  .build();
