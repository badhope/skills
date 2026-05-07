import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export async function safeExecRaw(
  cmd: string,
  timeout: number = 60000,
  cwd?: string
): Promise<ExecResult> {
  const startTime = Date.now()
  try {
    const options: any = { timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    if (cwd) options.cwd = cwd
    const { stdout, stderr } = await execAsync(cmd, options)
    return {
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
      exitCode: 0,
      durationMs: Date.now() - startTime
    }
  } catch (e: any) {
    return {
      stdout: String(e.stdout || '').trim(),
      stderr: String(e.stderr || e.message || '').trim(),
      exitCode: e.code || 1,
      durationMs: Date.now() - startTime
    }
  }
}

export async function safeExec(
  cmd: string,
  timeout: number = 60000,
  cwd?: string
): Promise<string> {
  const result = await safeExecRaw(cmd, timeout, cwd)
  return (result.stdout || result.stderr || '').trim()
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readJsonFile<T = any>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function writeJsonFile(filePath: string, data: any): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

const ALLOWED_BASE_PATHS = [
  './.agent-skills',
  './skills',
  './projects',
  './workspace',
  './output',
  './temp'
]

export function sanitizePath(inputPath: string): string {
  let normalized = path.normalize(inputPath).replace(/^(\.\.(\/|\\|$))+/, '')
  
  const resolved = path.resolve(normalized)
  
  const isAllowed = ALLOWED_BASE_PATHS.some(basePath => {
    const allowedPath = path.resolve(basePath)
    return resolved.startsWith(allowedPath)
  })
  
  if (!isAllowed) {
    throw new Error(`Path not allowed: ${inputPath}`)
  }
  
  return normalized
}

export function validatePath(targetPath: string): { valid: boolean; message: string; safePath: string } {
  try {
    const safePath = sanitizePath(targetPath)
    return { valid: true, message: '', safePath }
  } catch (e) {
    return { valid: false, message: (e as Error).message, safePath: '' }
  }
}

export function addAllowedPath(newPath: string): void {
  const resolved = path.resolve(newPath)
  if (!ALLOWED_BASE_PATHS.includes(resolved)) {
    ALLOWED_BASE_PATHS.push(resolved)
  }
}

export interface ValidationSchema {
  type: string
  required?: boolean
  default?: any
  min?: number
  max?: number
  enum?: string[]
  pattern?: RegExp | string
  match?: RegExp | string
}

export function validateParams<T extends Record<string, any>>(
  params: Record<string, any>,
  schema: Record<string, ValidationSchema>
): { valid: boolean; errors: string[]; data: T } {
  const errors: string[] = []
  const data: Record<string, any> = {}

  for (const [key, rules] of Object.entries(schema)) {
    const value = params[key]
    
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required parameter: ${key}`)
      continue
    }

    if (value !== undefined && value !== null && value !== '') {
      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (actualType !== rules.type) {
        errors.push(`Parameter ${key} should be ${rules.type}, got ${actualType}`)
        continue
      }

      if (rules.type === 'number' && typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`Parameter ${key} must be >= ${rules.min}`)
          continue
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`Parameter ${key} must be <= ${rules.max}`)
          continue
        }
      }

      if (rules.type === 'string' && rules.enum && !rules.enum.includes(value)) {
        errors.push(`Parameter ${key} must be one of: ${rules.enum.join(', ')}`)
        continue
      }

      data[key] = value
    } else if (rules.default !== undefined) {
      data[key] = rules.default
    }
  }

  return { valid: errors.length === 0, errors, data: data as T }
}

export function formatError(message: string, error?: any): Record<string, any> {
  return {
    success: false,
    error: message,
    details: error?.message || String(error || '')
  }
}

export function formatSuccess(data: any): Record<string, any> {
  return {
    success: true,
    ...data
  }
}
