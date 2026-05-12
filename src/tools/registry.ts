import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsCb from 'fs';
import path from 'path';
import { glob } from 'glob';
import os from 'os';
import { createHash } from 'crypto';

const execAsync = promisify(exec);

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

// ==================== Shell 工具 ====================

const shellTool: ToolDefinition = {
  name: 'shell',
  description: '执行Shell命令',
  parameters: [
    { name: 'command', type: 'string', description: '要执行的命令', required: true },
    { name: 'cwd', type: 'string', description: '工作目录', required: false },
    { name: 'timeout', type: 'number', description: '超时时间(ms)', required: false },
  ],
  execute: async (args) => {
    if (!args || !args.command) {
      return { 
        success: false, 
        output: '', 
        error: '缺少必要参数: command' 
      };
    }
    const { checkShellCommand } = await import('./security.js');
    const check = checkShellCommand(args.command);
    if (!check.allowed) {
      return { 
        success: false, 
        output: '', 
        error: `安全拦截: ${check.reason}` 
      };
    }
    
    try {
      const timeout = args.timeout ? parseInt(args.timeout, 10) : 30000;
      const { stdout, stderr } = await execAsync(args.command, {
        cwd: args.cwd || process.cwd(),
        timeout,
        maxBuffer: 1024 * 1024,
      });
      return { success: true, output: stdout || stderr };
    } catch (error: any) {
      return { success: false, output: error.stdout || '', error: error.stderr || error.message };
    }
  },
};

// ==================== 文件工具 ====================

const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: '读取文件内容',
  parameters: [
    { name: 'path', type: 'string', description: '文件路径', required: true },
  ],
  execute: async (args) => {
    try {
      const content = await fs.readFile(args.path, 'utf-8');
      const stat = await fs.stat(args.path);
      return { success: true, output: content, _meta: `(${stat.size} bytes)` };
    } catch (error: any) {
      return { success: false, output: '', error: `读取失败: ${error.message}` };
    }
  },
};

const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: '写入文件内容',
  parameters: [
    { name: 'path', type: 'string', description: '文件路径', required: true },
    { name: 'content', type: 'string', description: '文件内容', required: true },
  ],
  execute: async (args) => {
    try {
      await fs.mkdir(path.dirname(args.path), { recursive: true });
      await fs.writeFile(args.path, args.content);
      const stat = await fs.stat(args.path);
      return { success: true, output: `文件已写入: ${args.path} (${stat.size} bytes)` };
    } catch (error: any) {
      return { success: false, output: '', error: `写入失败: ${error.message}` };
    }
  },
};

const searchFilesTool: ToolDefinition = {
  name: 'search_files',
  description: '在目录中搜索文件内容',
  parameters: [
    { name: 'pattern', type: 'string', description: '搜索模式（正则表达式）', required: true },
    { name: 'path', type: 'string', description: '搜索目录', required: true },
    { name: 'file_pattern', type: 'string', description: '文件匹配模式', required: false },
  ],
  execute: async (args) => {
    try {
      const files = await glob(args.file_pattern || '**/*', {
        cwd: args.path,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      });
      const regex = new RegExp(args.pattern, 'gi');
      const results: string[] = [];

      for (const file of files.slice(0, 100)) {
        const filePath = path.join(args.path, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${filePath}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
            }
            regex.lastIndex = 0;
          }
        } catch { /* skip */ }
      }

      return { success: true, output: results.length > 0 ? results.join('\n') : '未找到匹配结果' };
    } catch (error: any) {
      return { success: false, output: '', error: `搜索失败: ${error.message}` };
    }
  },
};

const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: '列出目录内容',
  parameters: [
    { name: 'path', type: 'string', description: '目录路径', required: true },
  ],
  execute: async (args) => {
    try {
      const entries = await fs.readdir(args.path, { withFileTypes: true });
      const content = entries.map(e => {
        const type = e.isDirectory() ? '📁' : e.isFile() ? '📄' : '🔗';
        return `${type} ${e.name}`;
      }).join('\n');
      return { success: true, output: content };
    } catch (error: any) {
      return { success: false, output: '', error: `列出目录失败: ${error.message}` };
    }
  },
};

const fileTreeTool: ToolDefinition = {
  name: 'file_tree',
  description: '显示目录文件树',
  parameters: [
    { name: 'path', type: 'string', description: '目录路径', required: true },
    { name: 'depth', type: 'number', description: '最大深度', required: false },
  ],
  execute: async (args) => {
    const maxDepth = args.depth ? parseInt(args.depth, 10) : 3;
    const ignore = ['node_modules', 'dist', '.git', 'coverage', 'build'];

    function buildTree(currentPath: string, prefix: string, depth: number): string {
      if (depth > maxDepth) return '';
      let result = '';
      const entries = fsCb.readdirSync(currentPath, { withFileTypes: true })
        .filter(e => !ignore.includes(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';
        if (entry.isDirectory()) {
          result += `${prefix}${connector}📁 ${entry.name}\n`;
          result += buildTree(path.join(currentPath, entry.name), prefix + childPrefix, depth + 1);
        } else {
          result += `${prefix}${connector}📄 ${entry.name}\n`;
        }
      });
      return result;
    }

    const dirName = path.basename(args.path);
    return { success: true, output: `📁 ${dirName}\n${buildTree(args.path, '', 0)}` };
  },
};

const fileInfoTool: ToolDefinition = {
  name: 'file_info',
  description: '获取文件详细信息',
  parameters: [
    { name: 'path', type: 'string', description: '文件路径', required: true },
  ],
  execute: async (args) => {
    try {
      const stat = await fs.stat(args.path);
      const ext = path.extname(args.path).slice(1);
      const content = [
        `路径: ${args.path}`,
        `大小: ${formatBytes(stat.size)}`,
        `类型: ${ext || '未知'}`,
        `修改时间: ${stat.mtime.toLocaleString('zh-CN')}`,
        `是否目录: ${stat.isDirectory() ? '是' : '否'}`,
      ].join('\n');
      return { success: true, output: content };
    } catch (error: any) {
      return { success: false, output: '', error: `获取信息失败: ${error.message}` };
    }
  },
};

// ==================== 新增实用工具 ====================

// 系统信息
const sysInfoTool: ToolDefinition = {
  name: 'sysinfo',
  description: '获取系统信息（CPU、内存、磁盘、Node版本等）',
  parameters: [],
  execute: async () => {
    try {
      const cpus = os.cpus();
      const totalMem = formatBytes(os.totalmem());
      const freeMem = formatBytes(os.freemem());
      const usedMem = formatBytes(os.totalmem() - os.freemem());
      const hostname = os.hostname();
      const platform = `${os.type()} ${os.release()} ${os.arch()}`;
      const uptime = formatUptime(os.uptime());

      const lines = [
        `主机名: ${hostname}`,
        `平台: ${platform}`,
        `Node.js: ${process.version}`,
        `CPU: ${cpus[0]?.model || '未知'} × ${cpus.length} 核`,
        `内存: ${usedMem} / ${totalMem} (可用 ${freeMem})`,
        `运行时间: ${uptime}`,
        `当前目录: ${process.cwd()}`,
        `用户: ${os.userInfo().username}`,
      ];

      return { success: true, output: lines.join('\n') };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  },
};

// HTTP 请求
const httpTool: ToolDefinition = {
  name: 'http',
  description: '发送 HTTP 请求',
  parameters: [
    { name: 'url', type: 'string', description: '请求 URL', required: true },
    { name: 'method', type: 'string', description: 'HTTP 方法 (GET/POST/PUT/DELETE)', required: false },
    { name: 'body', type: 'string', description: '请求体 (JSON)', required: false },
    { name: 'headers', type: 'string', description: '请求头 (JSON)', required: false },
    { name: 'timeout', type: 'number', description: '超时时间(ms)', required: false },
  ],
  execute: async (args) => {
    try {
      const method = (args.method || 'GET').toUpperCase();
      const timeout = args.timeout ? parseInt(args.timeout, 10) : 10000;
      const headers: Record<string, string> = args.headers
        ? JSON.parse(args.headers)
        : { 'Content-Type': 'application/json' };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const fetchOpts: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (args.body && method !== 'GET') {
        fetchOpts.body = args.body;
      }

      const response = await fetch(args.url, fetchOpts);
      clearTimeout(timer);

      const contentType = response.headers.get('content-type') || '';
      let output: string;

      if (contentType.includes('json')) {
        const json = await response.json();
        output = JSON.stringify(json, null, 2);
      } else {
        output = await response.text();
      }

      return {
        success: response.ok,
        output: `[${response.status} ${response.statusText}]\n\n${output.slice(0, 10000)}`,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      return { success: false, output: '', error: `请求失败: ${error.message}` };
    }
  },
};

// JSON 处理
const jsonTool: ToolDefinition = {
  name: 'json',
  description: 'JSON 处理（格式化/查询/转换）',
  parameters: [
    { name: 'input', type: 'string', description: 'JSON 字符串或文件路径', required: true },
    { name: 'query', type: 'string', description: 'JSONPath 查询（如 .name, .items[0].id）', required: false },
    { name: 'action', type: 'string', description: '操作: format/query/keys/values/count', required: false },
  ],
  execute: async (args) => {
    try {
      const action = args.action || 'format';
      let jsonStr = args.input;

      // 如果是文件路径，读取文件
      try {
        const stat = await fs.stat(jsonStr);
        if (stat.isFile()) {
          jsonStr = await fs.readFile(jsonStr, 'utf-8');
        }
      } catch { /* 不是文件，当作字符串 */ }

      const obj = JSON.parse(jsonStr);

      switch (action) {
        case 'format':
          return { success: true, output: JSON.stringify(obj, null, 2) };
        case 'keys':
          return { success: true, output: Object.keys(obj).join('\n') };
        case 'values':
          return { success: true, output: Object.values(obj).map(v => String(v)).join('\n') };
        case 'count':
          if (Array.isArray(obj)) {
            return { success: true, output: `数组长度: ${obj.length}` };
          }
          return { success: true, output: `对象属性数: ${Object.keys(obj).length}` };
        case 'query': {
          if (!args.query) return { success: false, output: '', error: '查询模式需要 --query 参数' };
          const parts = args.query.replace(/^\./, '').split('.');
          let result: any = obj;
          for (const part of parts) {
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
              result = result[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
            } else {
              result = result[part];
            }
            if (result === undefined) break;
          }
          return { success: true, output: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result) };
        }
        default:
          return { success: true, output: JSON.stringify(obj, null, 2) };
      }
    } catch (error: any) {
      return { success: false, output: '', error: `JSON 处理失败: ${error.message}` };
    }
  },
};

// 文本处理
const textTool: ToolDefinition = {
  name: 'text',
  description: '文本处理（统计/替换/提取/排序/去重）',
  parameters: [
    { name: 'input', type: 'string', description: '输入文本', required: true },
    { name: 'action', type: 'string', description: '操作: count/replace/extract/sort/unique/upper/lower/reverse/lines', required: false },
    { name: 'pattern', type: 'string', description: '匹配模式（用于 replace/extract）', required: false },
    { name: 'replacement', type: 'string', description: '替换文本', required: false },
  ],
  execute: async (args) => {
    try {
      const action = args.action || 'count';
      const input = args.input;

      switch (action) {
        case 'count': {
          const chars = input.length;
          const lines = input.split('\n').length;
          const words = input.split(/\s+/).filter(Boolean).length;
          const bytes = Buffer.byteLength(input, 'utf-8');
          return { success: true, output: `字符: ${chars}\n行数: ${lines}\n词数: ${words}\n字节: ${bytes}` };
        }
        case 'replace':
          if (!args.pattern) return { success: false, output: '', error: 'replace 需要 --pattern 参数' };
          return { success: true, output: input.replace(new RegExp(args.pattern, 'g'), args.replacement || '') };
        case 'extract':
          if (!args.pattern) return { success: false, output: '', error: 'extract 需要 --pattern 参数' };
          return { success: true, output: [...input.matchAll(new RegExp(args.pattern, 'g'))].map(m => m[0]).join('\n') };
        case 'sort':
          return { success: true, output: input.split('\n').sort().join('\n') };
        case 'unique':
          return { success: true, output: [...new Set(input.split('\n'))].join('\n') };
        case 'upper':
          return { success: true, output: input.toUpperCase() };
        case 'lower':
          return { success: true, output: input.toLowerCase() };
        case 'reverse':
          return { success: true, output: input.split('\n').reverse().join('\n') };
        case 'lines':
          return { success: true, output: input.split('\n').map((line, i) => `${String(i + 1).padStart(4)} | ${line}`).join('\n') };
        default:
          return { success: true, output: input };
      }
    } catch (error: any) {
      return { success: false, output: '', error: `文本处理失败: ${error.message}` };
    }
  },
};

// 文件哈希
const hashTool: ToolDefinition = {
  name: 'hash',
  description: '计算文件或文本的哈希值',
  parameters: [
    { name: 'input', type: 'string', description: '文件路径或文本内容', required: true },
    { name: 'algorithm', type: 'string', description: '哈希算法 (md5/sha1/sha256/sha512)', required: false },
  ],
  execute: async (args) => {
    try {
      const algo = args.algorithm || 'sha256';
      let data: Buffer;

      try {
        const stat = await fs.stat(args.input);
        if (stat.isFile()) {
          data = await fs.readFile(args.input);
        } else {
          data = Buffer.from(args.input);
        }
      } catch {
        data = Buffer.from(args.input);
      }

      const hash = createHash(algo).update(data).digest('hex');
      return { success: true, output: `${algo.toUpperCase()}: ${hash}` };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  },
};

// 删除文件
const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: '删除文件或目录',
  parameters: [
    { name: 'path', type: 'string', description: '文件或目录路径', required: true },
    { name: 'recursive', type: 'boolean', description: '是否递归删除目录', required: false },
  ],
  execute: async (args) => {
    try {
      const stat = await fs.stat(args.path);
      if (stat.isDirectory()) {
        if (args.recursive === 'true') {
          await fs.rm(args.path, { recursive: true });
        } else {
          return { success: false, output: '', error: '目录需要 recursive=true 参数' };
        }
      } else {
        await fs.unlink(args.path);
      }
      return { success: true, output: `已删除: ${args.path}` };
    } catch (error: any) {
      return { success: false, output: '', error: `删除失败: ${error.message}` };
    }
  },
};

// ==================== 工具注册表 ====================

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
  // 实用工具
  ['sysinfo', sysInfoTool],
  ['http', httpTool],
  ['json', jsonTool],
  ['text', textTool],
  ['hash', hashTool],
  ['delete_file', deleteFileTool],
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

// ==================== 辅助函数 ====================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分钟`);
  return parts.join(' ') || '刚刚启动';
}
