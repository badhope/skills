import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import type { ToolDefinition } from '../registry.js';

const execAsync = promisify(exec);

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

// ==================== Shell 工具 ====================

export const shellTool: ToolDefinition = {
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
    const { checkShellCommand } = await import('../security.js');
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

// ==================== 系统信息工具 ====================

export const sysInfoTool: ToolDefinition = {
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
        `CPU: ${cpus[0]?.model || '未知'} \u00D7 ${cpus.length} 核`,
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
