import 'reflect-metadata';
import { injectable } from 'tsyringe';
import {
  readFileTool,
  writeFileTool,
  searchFilesTool,
  listDirTool,
  fileTreeTool,
  fileInfoTool,
  deleteFileTool,
} from './definitions/file-tools.js';
import { shellTool, sysInfoTool } from './definitions/sys-tools.js';
import { httpTool, jsonTool, textTool, hashTool } from './definitions/data-tools.js';
import { toolLogger } from '../services/logger.js';

// ============================================================
// 接口定义
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
  execute: (args: Record<string, string>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  [key: string]: unknown; // 允许额外元数据
}

// ============================================================
// 工具注册表类
// ============================================================

/**
 * 工具注册表
 * 管理所有可用工具的注册、查询和执行
 */
@injectable()
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具
   */
  private registerDefaultTools(): void {
    // Shell
    this.register(shellTool);
    // 文件操作
    this.register(readFileTool);
    this.register(writeFileTool);
    this.register(searchFilesTool);
    this.register(listDirTool);
    this.register(fileTreeTool);
    this.register(fileInfoTool);
    this.register(deleteFileTool);
    // 实用工具
    this.register(sysInfoTool);
    this.register(httpTool);
    this.register(jsonTool);
    this.register(textTool);
    this.register(hashTool);
  }

  /**
   * 注册工具
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    toolLogger.debug({ tool: tool.name }, 'Tool registered');
  }

  /**
   * 获取工具
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 列出所有工具
   */
  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 执行工具
   */
  async execute(name: string, args: Record<string, string>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      toolLogger.warn({ tool: name }, 'Unknown tool requested');
      return {
        success: false,
        output: '',
        error: `未知工具: ${name}。可用工具: ${[...this.tools.keys()].join(', ')}`,
      };
    }
    toolLogger.debug({ tool: name, args }, 'Executing tool');
    const result = await tool.execute(args);
    if (result.success) {
      toolLogger.info({ tool: name }, 'Tool executed successfully');
    } else {
      toolLogger.error({ tool: name, error: result.error }, 'Tool execution failed');
    }
    return result;
  }

  /**
   * 获取所有工具定义（用于AI function calling）
   */
  getToolDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, { type: string; description: string }>;
        required: string[];
      };
    };
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            tool.parameters.map(p => [p.name, { type: p.type, description: p.description }])
          ),
          required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
  }

  /**
   * 列出所有工具（带分类）
   */
  listTools(): Array<{
    name: string;
    description: string;
    category: string;
  }> {
    const tools: Array<{ name: string; description: string; category: string }> = [];

    for (const [name, tool] of this.tools) {
      tools.push({
        name,
        description: tool.description,
        category: name.includes('file') || name.includes('dir') || name.includes('tree')
          ? '文件操作'
          : name === 'shell'
            ? '系统命令'
            : name === 'http'
              ? '网络'
              : '实用工具',
      });
    }

    return tools;
  }
}

// ============================================================
// 向后兼容的函数导出
// ============================================================

// 全局工具注册表实例
const globalToolRegistry = new ToolRegistry();

/**
 * @deprecated 使用 ToolRegistry 类实例方法
 */
export const toolRegistry: Map<string, ToolDefinition> = new Map([
  // Shell
  ['shell', shellTool],
  // 文件操作
  ['read_file', readFileTool],
  ['write_file', writeFileTool],
  ['search_files', searchFilesTool],
  ['list_dir', listDirTool],
  ['file_tree', fileTreeTool],
  ['file_info', fileInfoTool],
  ['delete_file', deleteFileTool],
  // 实用工具
  ['sysinfo', sysInfoTool],
  ['http', httpTool],
  ['json', jsonTool],
  ['text', textTool],
  ['hash', hashTool],
]);

/**
 * @deprecated 使用 ToolRegistry.getToolDefinitions()
 */
export function getToolDefinitions(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}> {
  return globalToolRegistry.getToolDefinitions();
}

/**
 * @deprecated 使用 ToolRegistry.execute()
 */
export async function executeTool(name: string, args: Record<string, string>): Promise<ToolResult> {
  return globalToolRegistry.execute(name, args);
}

/**
 * @deprecated 使用 ToolRegistry.listTools()
 */
export function listTools(): Array<{
  name: string;
  description: string;
  category: string;
}> {
  return globalToolRegistry.listTools();
}
