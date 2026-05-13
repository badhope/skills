import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
