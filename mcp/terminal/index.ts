import { createMCPServer } from '../../packages/core/mcp/builder'
import { safeExec, safeExecRaw, validateParams, formatSuccess, formatError, sanitizePath } from '../../packages/core/shared'

const ALLOWED_COMMANDS = [
  'npm', 'npx', 'node', 'git', 'ls', 'dir', 'cat', 'type', 
  'echo', 'mkdir', 'rmdir', 'rm', 'del', 'cp', 'copy', 'mv', 'move',
  'cd', 'pwd', 'whoami', 'date', 'time', 'env', 'set', 'export',
  'grep', 'find', 'sed', 'awk', 'head', 'tail', 'wc', 'sort', 'uniq',
  'chmod', 'chown', 'touch', 'ln', 'tar', 'zip', 'unzip', 'curl', 'wget'
]

const DANGEROUS_PATTERNS = [
  /\|\|/, /\&\&/, /\;/, /\`/, /\$\(/, /\(\(/, /\<\(/,
  /rm\s+-rf/, /rmdir\s+-p/, /del\s+/, /erase\s+/,
  /kill\s+/, /shutdown\s+/, /reboot\s+/, /init\s+0/,
  /chmod\s+777/, /chown\s+/, /passwd\s+/, /useradd\s+/, /userdel\s+/,
  /curl\s+.*\|/, /wget\s+.*\|/, /nc\s+/, /netcat\s+/,
  /python\s+/, /php\s+/, /ruby\s+/, /perl\s+/, /bash\s+/, /sh\s+/
]

function validateCommand(command: string): { valid: boolean; message: string } {
  const cmdParts = command.trim().split(/\s+/);
  const baseCommand = cmdParts[0].toLowerCase();

  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    return { valid: false, message: `Command "${baseCommand}" is not allowed` };
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { valid: false, message: `Command contains dangerous pattern: ${pattern}` };
    }
  }

  if (command.length > 500) {
    return { valid: false, message: 'Command too long (max 500 characters)' };
  }

  return { valid: true, message: '' };
}

export default createMCPServer({
  name: 'terminal',
  version: '2.0.0',
  description: 'Secure sandboxed terminal execution with validation, timeout, and proper error handling',
  author: 'MCP Expert Community',
  icon: '💻'
})
  .addTool({
    name: 'run_shell',
    description: 'Execute shell commands with timeout and proper error handling',
    parameters: {
      command: {
        type: 'string',
        description: 'Shell command to execute, e.g. "ls -la" or "echo hello"',
        required: true
      },
      cwd: {
        type: 'string',
        description: 'Working directory for command execution',
        required: false
      },
      timeout: {
        type: 'number',
        description: 'Command timeout in milliseconds, default 30000',
        required: false
      }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        command: { type: 'string', required: true },
        cwd: { type: 'string', required: false },
        timeout: { type: 'number', required: false, default: 30000 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const cmdValidation = validateCommand(validation.data.command)
      if (!cmdValidation.valid) {
        return formatError('Command not allowed', cmdValidation.message)
      }

      const safeCwd = validation.data.cwd ? sanitizePath(validation.data.cwd) : undefined
      const result = await safeExecRaw(validation.data.command, validation.data.timeout, safeCwd)
      
      return result.exitCode === 0
        ? formatSuccess({ stdout: result.stdout, stderr: result.stderr })
        : formatError('Command execution failed', { stderr: result.stderr, exitCode: result.exitCode })
    }
  })
  .addTool({
    name: 'npm_run',
    description: 'Run npm scripts with proper error handling',
    parameters: {
      script: {
        type: 'string',
        description: 'npm script name, e.g. "build" or "dev"',
        required: true
      },
      args: {
        type: 'string',
        description: 'Additional arguments for npm script',
        required: false
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
        required: false
      }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        script: { type: 'string', required: true },
        args: { type: 'string', required: false, default: '' },
        cwd: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const cmd = `npm run ${validation.data.script} ${validation.data.args}`.trim()
      const safeCwd = validation.data.cwd ? sanitizePath(validation.data.cwd) : undefined
      const result = await safeExecRaw(cmd, 60000, safeCwd)
      
      return result.exitCode === 0
        ? formatSuccess({ stdout: result.stdout, stderr: result.stderr })
        : formatError('npm script failed', { stderr: result.stderr, exitCode: result.exitCode })
    }
  })
  .addTool({
    name: 'run_tests',
    description: 'Run project tests with result formatting',
    parameters: {
      file: {
        type: 'string',
        description: 'Specific test file path',
        required: false
      },
      coverage: {
        type: 'boolean',
        description: 'Enable coverage reporting',
        required: false
      }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        file: { type: 'string', required: false },
        coverage: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const args: string[] = []
      if (validation.data.coverage) args.push('--coverage')
      if (validation.data.file) args.push(validation.data.file)
      
      const result = await safeExecRaw(`npm test ${args.join(' ')}`.trim(), 120000)
      
      return formatSuccess({
        success: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr,
        exitCode: result.exitCode
      })
    }
  })
  .addTool({
    name: 'check_node_version',
    description: 'Check Node.js and npm versions',
    parameters: {},
    execute: async () => {
      const [nodeResult, npmResult] = await Promise.all([
        safeExecRaw('node --version'),
        safeExecRaw('npm --version')
      ])
      
      return formatSuccess({
        node: nodeResult.stdout || 'Unknown',
        npm: npmResult.stdout || 'Unknown'
      })
    }
  })
  .addTool({
    name: 'list_scripts',
    description: 'List all available npm scripts in package.json',
    parameters: {},
    execute: async () => {
      const fs = await import('fs/promises')
      try {
        const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'))
        return formatSuccess({
          scripts: pkg.scripts || {},
          count: Object.keys(pkg.scripts || {}).length
        })
      } catch (e) {
        return formatError('Failed to read package.json', e)
      }
    }
  })
  .addResource({
    uri: 'mcp://terminal/system-info',
    name: 'System Information',
    description: 'Current working directory and environment information',
    get: async () => {
      const [cwd, nodeVer, npmVer] = await Promise.all([
        Promise.resolve(process.cwd()),
        safeExecRaw('node --version'),
        safeExecRaw('npm --version')
      ])
      return {
        cwd,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: nodeVer.stdout,
        npmVersion: npmVer.stdout,
        env: {
          NODE_ENV: processDELETE.NODE_ENV || 'development'
        }
      }
    }
  })
  .addPrompt({
    name: 'debug-command',
    description: 'Debug a failing shell command',
    arguments: [
      { name: 'command', description: 'The failing command', required: true },
      { name: 'error', description: 'Error message received', required: true }
    ],
    generate: async (args?: Record<string, any>) => `
## 🔧 Shell Command Debugging

### Failing Command:
\`\`\`bash
${args?.command || '(no command provided)'}
\`\`\`

### Error Message:
\`\`\`
${args?.error || '(no error message)'}
\`\`\`

### Task
Please analyze this command failure and provide:
1. 🔍 Root cause analysis
2. 🛠️ Step-by-step debugging instructions
3. ✅ Corrected command if applicable
4. 💡 Best practices for similar commands

Consider:
- Command syntax issues
- Missing dependencies
- Environment differences
- Permission issues
- Path problems
    `.trim()
  })
  .build()
