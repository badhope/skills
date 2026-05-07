import { createMCPServer } from '../../packages/core/mcp/builder'
import { safeExecRaw, validateParams, formatSuccess, formatError } from '../../packages/core/shared'

export default createMCPServer({
  name: 'git',
  version: '2.0.0',
  description: 'Git version control toolkit - commit, branch, diff, log and code review operations with full error handling',
  icon: '📦'
})
  .addTool({
    name: 'get_current_branch',
    description: 'Get the name of currently active git branch',
    parameters: {},
    execute: async () => {
      const result = await safeExecRaw('git branch --show-current')
      return result.exitCode === 0
        ? formatSuccess({ branch: result.stdout })
        : formatError('Failed to get branch name', result.stderr)
    }
  })
  .addTool({
    name: 'get_staged_diff',
    description: 'Get diff of all staged changes for code review',
    parameters: {},
    execute: async () => {
      const result = await safeExecRaw('git diff --staged')
      return result.exitCode === 0
        ? formatSuccess({ diff: result.stdout })
        : formatError('Failed to get staged diff', result.stderr)
    }
  })
  .addTool({
    name: 'get_commit_history',
    description: 'View recent git commit history',
    parameters: {
      limit: {
        type: 'number',
        description: 'Number of recent commits to show, default 10',
        required: false
      }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        limit: { type: 'number', required: false, default: 10 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const result = await safeExecRaw(`git log --oneline -n ${validation.data.limit}`)
      return result.exitCode === 0
        ? formatSuccess({ log: result.stdout.split('\n').filter(Boolean) })
        : formatError('Failed to get commit history', result.stderr)
    }
  })
  .addTool({
    name: 'create_commit',
    description: 'Stage all changes and create conventional commit',
    parameters: {
      message: {
        type: 'string',
        description: 'Commit message following conventional format: type(scope): description',
        required: true
      }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        message: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const addResult = await safeExecRaw('git add .')
      if (addResult.exitCode !== 0) return formatError('Failed to stage changes', addResult.stderr)

      const commitResult = await safeExecRaw(`git commit -m "${validation.data.message.replace(/["]/g, '\\"')}"`)
      return commitResult.exitCode === 0
        ? formatSuccess({ staged: true, committed: true })
        : formatError('Failed to create commit', commitResult.stderr)
    }
  })
  .addTool({
    name: 'create_branch',
    description: 'Create and switch to a new branch',
    parameters: {
      name: { type: 'string', description: 'Branch name', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const result = await safeExecRaw(`git checkout -b ${validation.data.name}`)
      return result.exitCode === 0
        ? formatSuccess({ branch: validation.data.name, created: true, switched: true })
        : formatError('Failed to create branch', result.stderr)
    }
  })
  .build()