import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '../..');
}

export const PROJECT_DIR = getProjectRoot();
export const DEVFLOW_DIR = path.join(PROJECT_DIR, '.devflow');
export const MEMORY_DIR = path.join(DEVFLOW_DIR, 'memory');
export const HISTORY_DIR = path.join(DEVFLOW_DIR, 'history');
export const TOOLS_DIR = path.join(DEVFLOW_DIR, 'tools');
export const BACKUP_DIR = path.join(DEVFLOW_DIR, 'backups');

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export async function safeExecRaw(
  cmd: string,
  timeout: number = 60000,
  cwd?: string
): Promise<ExecResult> {
  const startTime = Date.now();
  try {
    const options: any = { timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 };
    if (cwd) options.cwd = cwd;
    const { stdout, stderr } = await execAsync(cmd, options);
    return {
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
      exitCode: 0,
      durationMs: Date.now() - startTime
    };
  } catch (e: any) {
    return {
      stdout: String(e.stdout || '').trim(),
      stderr: String(e.stderr || e.message || '').trim(),
      exitCode: e.code || 1,
      durationMs: Date.now() - startTime
    };
  }
}

export async function safeExec(
  cmd: string,
  timeout: number = 60000,
  cwd?: string
): Promise<string> {
  const result = await safeExecRaw(cmd, timeout, cwd);
  return (result.stdout || result.stderr || '').trim();
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T = any>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: any): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function formatError(message: string, error?: any): Record<string, any> {
  return {
    success: false,
    error: message,
    details: error?.message || String(error || '')
  };
}

export function formatSuccess(data: any): Record<string, any> {
  return {
    success: true,
    ...data
  };
}

export interface ValidationSchema {
  type: string;
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  enum?: string[];
  pattern?: RegExp | string;
  match?: RegExp | string;
}

export function validateParams<T extends Record<string, any>>(
  params: Record<string, any>,
  schema: Record<string, ValidationSchema>
): { valid: boolean; errors: string[]; data: T } {
  const errors: string[] = [];
  const data: Record<string, any> = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = params[key];
    
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required parameter: ${key}`);
      continue;
    }

    if (value !== undefined && value !== null && value !== '') {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`Parameter ${key} should be ${rules.type}, got ${actualType}`);
        continue;
      }

      if (rules.type === 'number' && typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`Parameter ${key} must be >= ${rules.min}`);
          continue;
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`Parameter ${key} must be <= ${rules.max}`);
          continue;
        }
      }

      if (rules.type === 'string' && rules.enum && !rules.enum.includes(value)) {
        errors.push(`Parameter ${key} must be one of: ${rules.enum.join(', ')}`);
        continue;
      }

      data[key] = value;
    } else if (rules.default !== undefined) {
      data[key] = rules.default;
    }
  }

  return { valid: errors.length === 0, errors, data: data as T };
}
