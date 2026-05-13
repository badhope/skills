import fs from 'fs/promises';
import { createHash } from 'crypto';
import type { ToolDefinition } from '../registry.js';

// ==================== HTTP 请求工具 ====================

export const httpTool: ToolDefinition = {
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

// ==================== JSON 处理工具 ====================

export const jsonTool: ToolDefinition = {
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

// ==================== 文本处理工具 ====================

export const textTool: ToolDefinition = {
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

// ==================== 文件哈希工具 ====================

export const hashTool: ToolDefinition = {
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
