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
// 工具注册表
// ============================================================

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

// 获取所有工具定义（用于AI function calling）
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
  return Array.from(toolRegistry.values()).map(tool => ({
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

// 执行工具
export async function executeTool(name: string, args: Record<string, string>): Promise<ToolResult> {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return { success: false, output: '', error: `未知工具: ${name}。可用工具: ${[...toolRegistry.keys()].join(', ')}` };
  }
  return tool.execute(args);
}

// 列出所有工具
export function listTools(): Array<{
  name: string;
  description: string;
  category: string;
}> {
  const tools: Array<{ name: string; description: string; category: string }> = [];

  for (const [name, tool] of toolRegistry) {
    tools.push({
      name,
      description: tool.description,
      category: name.includes('file') || name.includes('dir') || name.includes('tree') ? '文件操作'
        : name === 'shell' ? '系统命令'
        : name === 'http' ? '网络'
        : '实用工具',
    });
  }

  return tools;
}
