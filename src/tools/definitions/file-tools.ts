import fs from 'fs/promises';
import fsCb from 'fs';
import path from 'path';
import { glob } from 'glob';
import type { ToolDefinition } from '../registry.js';
import { formatBytes } from '../../utils/format.js';

// ==================== 辅助函数 ====================

// ==================== 文件工具 ====================

export const readFileTool: ToolDefinition = {
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

export const writeFileTool: ToolDefinition = {
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

export const searchFilesTool: ToolDefinition = {
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

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: '列出目录内容',
  parameters: [
    { name: 'path', type: 'string', description: '目录路径', required: true },
  ],
  execute: async (args) => {
    try {
      const entries = await fs.readdir(args.path, { withFileTypes: true });
      const content = entries.map(e => {
        const type = e.isDirectory() ? '\uD83D\uDCC1' : e.isFile() ? '\uD83D\uDCC4' : '\uD83D\uDD17';
        return `${type} ${e.name}`;
      }).join('\n');
      return { success: true, output: content };
    } catch (error: any) {
      return { success: false, output: '', error: `列出目录失败: ${error.message}` };
    }
  },
};

export const fileTreeTool: ToolDefinition = {
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
        const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
        const childPrefix = isLast ? '    ' : '\u2502   ';
        if (entry.isDirectory()) {
          result += `${prefix}${connector}\uD83D\uDCC1 ${entry.name}\n`;
          result += buildTree(path.join(currentPath, entry.name), prefix + childPrefix, depth + 1);
        } else {
          result += `${prefix}${connector}\uD83D\uDCC4 ${entry.name}\n`;
        }
      });
      return result;
    }

    const dirName = path.basename(args.path);
    return { success: true, output: `\uD83D\uDCC1 ${dirName}\n${buildTree(args.path, '', 0)}` };
  },
};

export const fileInfoTool: ToolDefinition = {
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

export const deleteFileTool: ToolDefinition = {
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
