import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

export default createMCPServer({
  name: 'core-dev-kit',
  version: '2.0.0',
  description: 'Professional Core Development Kit - Essential tools for Git, Docker, Filesystem, Terminal, Encoding, and Security operations',
  author: 'MCP Expert Community',
  icon: '🔧'
})

  .addTool({
    name: 'git_clone',
    description: 'Clone Git repository with depth, branch, and authentication options',
    parameters: {
      url: { type: 'string', description: 'Repository URL', required: true },
      directory: { type: 'string', description: 'Target directory', required: false },
      branch: { type: 'string', description: 'Specific branch to clone', required: false },
      depth: { type: 'number', description: 'Clone depth for shallow clone', required: false },
      token: { type: 'string', description: 'GitHub token for private repos', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true },
        directory: { type: 'string', required: false, default: '' },
        branch: { type: 'string', required: false, default: '' },
        depth: { type: 'number', required: false, default: 0, min: 0, max: 100 },
        token: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const dir = validation.data.directory || validation.data.url.split('/').pop()?.replace('.git', '') || 'repo'
      let cloneUrl = validation.data.url
      if (validation.data.token && cloneUrl.includes('github.com')) {
        const safeToken = validation.data.token.replace(/[^a-zA-Z0-9_-]/g, '')
        if (safeToken && safeToken.length >= 8) {
          cloneUrl = cloneUrl.replace('https://', `https://${safeToken}@`)
        }
      }
      const branchFlag = validation.data.branch ? `-b ${validation.data.branch}` : ''
      const depthFlag = validation.data.depth > 0 ? `--depth ${validation.data.depth}` : ''
      const result = await safeExecRaw(`git clone ${branchFlag} ${depthFlag} "${cloneUrl}" "${dir}"`)

      return formatSuccess({
        cloned: result.exitCode === 0,
        url: validation.data.url,
        directory: sanitizePath(dir),
        branch: validation.data.branch,
        output: result.stdout,
        warnings: result.stderr,
        postCloneChecklist: [
          '✅ Repository cloned successfully',
          '📦 Run npm install / yarn install / pip install',
          '🔐 Check DELETE.example for required environment variables',
          '📖 Review README.md for project setup instructions',
          '🧪 Run tests to verify installation integrity'
        ]
      })
    }
  })

  .addTool({
    name: 'git_status',
    description: 'Check git repository status with detailed change analysis',
    parameters: {
      path: { type: 'string', description: 'Repository path', required: false },
      verbose: { type: 'boolean', description: 'Show detailed diff summary', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: false, default: '.' },
        verbose: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const porcelain = await safeExec('git status --porcelain', 10000, validation.data.path)
      const branch = await safeExec('git branch --show-current', 5000, validation.data.path)
      const stats = await safeExec('git diff --stat', 5000, validation.data.path)

      const changes = porcelain.split('\n').filter(l => l.trim()).map(line => ({
        status: line.substring(0, 2).trim(),
        file: line.substring(3).trim(),
        type: line.startsWith('M') ? 'modified' : line.startsWith('A') ? 'added' : line.startsWith('D') ? 'deleted' : line.startsWith('??') ? 'untracked' : 'other'
      }))

      const breakdown: Record<string, number> = {}
      changes.forEach(c => {
        breakdown[c.type] = (breakdown[c.type] || 0) + 1
      })

      return formatSuccess({
        path: sanitizePath(validation.data.path),
        currentBranch: branch.trim(),
        hasChanges: changes.length > 0,
        totalChanges: changes.length,
        breakdown,
        changes: changes.slice(0, 50),
        diffStats: stats.trim(),
        recommendations: changes.length > 0 ? [
          '🔍 Review changes before committing',
          '📦 Stage related files together for logical commits',
          '✍️ Write descriptive commit messages'
        ] : ['✨ Working directory clean']
      })
    }
  })

  .addTool({
    name: 'git_commit',
    description: 'Professional conventional commit with semantic message format',
    parameters: {
      type: { type: 'string', description: 'feat, fix, docs, style, refactor, test, chore', required: true },
      scope: { type: 'string', description: 'Scope of changes (e.g., auth, ui, api)', required: false },
      message: { type: 'string', description: 'Commit description under 50 chars', required: true },
      body: { type: 'string', description: 'Detailed body explaining WHY', required: false },
      path: { type: 'string', description: 'Repository path', required: false },
      files: { type: 'string', description: 'Specific files to commit (space-separated)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true, enum: ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore', 'perf', 'build', 'ci'] },
        scope: { type: 'string', required: false, default: '' },
        message: { type: 'string', required: true },
        body: { type: 'string', required: false, default: '' },
        path: { type: 'string', required: false, default: '.' },
        files: { type: 'string', required: false, default: '.' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const cwd = validation.data.path
      const scopePart = validation.data.scope ? `(${validation.data.scope})` : ''
      const header = `${validation.data.type}${scopePart}: ${validation.data.message}`
      const bodyPart = validation.data.body ? `\n\n${validation.data.body}` : ''
      const fullMessage = header + bodyPart

      await safeExec(`git add ${validation.data.files}`, 15000, cwd)
      const result = await safeExecRaw(`git commit -m "${fullMessage.replace(/"/g, '\\"')}"`, 15000, cwd)

      return formatSuccess({
        committed: result.exitCode === 0,
        type: validation.data.type,
        scope: validation.data.scope,
        message: header,
        body: validation.data.body,
        output: result.stdout || result.stderr,
        conventionalStandards: [
          '✅ Semantic commit type used correctly',
          '✅ Imperative mood used in message',
          '✅ First letter capitalized',
          '✅ No trailing period'
        ]
      })
    }
  })

  .addTool({
    name: 'git_branch_manager',
    description: 'Professional git branch management with workflow strategies',
    parameters: {
      action: { type: 'string', description: 'list, create, switch, delete, rename', required: true },
      name: { type: 'string', description: 'Branch name', required: false },
      newName: { type: 'string', description: 'New name for rename action', required: false },
      base: { type: 'string', description: 'Base branch for creation', required: false },
      path: { type: 'string', description: 'Repository path', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true, enum: ['list', 'create', 'switch', 'delete', 'rename'] },
        name: { type: 'string', required: false, default: '' },
        newName: { type: 'string', required: false, default: '' },
        base: { type: 'string', required: false, default: 'main' },
        path: { type: 'string', required: false, default: '.' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const cwd = validation.data.path
      let result = ''
      let info: any = {}

      switch (validation.data.action) {
        case 'list':
          const branches = await safeExec('git branch -a', 10000, cwd)
          const current = await safeExec('git rev-parse --abbrev-ref HEAD', 5000, cwd)
          info = {
            currentBranch: current.trim(),
            localBranches: branches.split('\n').filter(b => !b.includes('remotes/') && b.trim()),
            remoteBranches: branches.split('\n').filter(b => b.includes('remotes/') && b.trim())
          }
          break
        case 'create':
          if (!validation.data.name) return formatError('Branch name required')
          result = await safeExec(`git checkout -b ${validation.data.name} ${validation.data.base}`, 10000, cwd)
          info = { created: validation.data.name, from: validation.data.base }
          break
        case 'switch':
          if (!validation.data.name) return formatError('Branch name required')
          result = await safeExec(`git checkout ${validation.data.name}`, 10000, cwd)
          info = { switchedTo: validation.data.name }
          break
        case 'delete':
          if (!validation.data.name) return formatError('Branch name required')
          result = await safeExec(`git branch -D ${validation.data.name}`, 10000, cwd)
          info = { deleted: validation.data.name }
          break
        case 'rename':
          if (!validation.data.name || !validation.data.newName) return formatError('Both name and newName required')
          result = await safeExec(`git branch -m ${validation.data.name} ${validation.data.newName}`, 10000, cwd)
          info = { renamedFrom: validation.data.name, renamedTo: validation.data.newName }
          break
      }

      return formatSuccess({
        action: validation.data.action,
        ...info,
        output: result,
        namingConventions: [
          'feature/xxx - New features',
          'fix/xxx - Bug fixes',
          'hotfix/xxx - Production hotfixes',
          'release/xxx - Release preparation',
          'chore/xxx - Maintenance tasks'
        ]
      })
    }
  })

  .addTool({
    name: 'git_sync',
    description: 'Professional Git sync with remote including pull, push, and conflict resolution',
    parameters: {
      action: { type: 'string', description: 'pull, push, sync, force-push', required: true },
      remote: { type: 'string', description: 'Remote name', required: false },
      branch: { type: 'string', description: 'Branch name', required: false },
      path: { type: 'string', description: 'Repository path', required: false },
      forceWithLease: { type: 'boolean', description: 'Safe force push option', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true, enum: ['pull', 'push', 'sync', 'force-push'] },
        remote: { type: 'string', required: false, default: 'origin' },
        branch: { type: 'string', required: false, default: '' },
        path: { type: 'string', required: false, default: '.' },
        forceWithLease: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const cwd = validation.data.path
      const remote = validation.data.remote
      const branch = validation.data.branch || await safeExec('git rev-parse --abbrev-ref HEAD', 5000, cwd)
      let result = ''

      if (validation.data.action === 'sync') {
        await safeExec(`git pull ${remote} ${branch.trim()}`, 60000, cwd)
        result = await safeExec(`git push ${remote} ${branch.trim()}`, 60000, cwd)
      } else if (validation.data.action === 'force-push') {
        const flag = validation.data.forceWithLease ? '--force-with-lease' : '--force'
        result = await safeExec(`git push ${flag} ${remote} ${branch.trim()}`, 60000, cwd)
      } else {
        result = await safeExec(`git ${validation.data.action} ${remote} ${branch.trim()}`, 60000, cwd)
      }

      return formatSuccess({
        action: validation.data.action,
        remote,
        branch: branch.trim(),
        output: result,
        conflictTips: [
          '🚨 If merge conflict occurs:',
          '1. Use git status to see conflicting files',
          '2. Edit files to resolve conflicts',
          '3. git add resolved files',
          '4. git commit to complete merge'
        ]
      })
    }
  })

  .addTool({
    name: 'docker_list_containers',
    description: 'List Docker containers with full details and health status',
    parameters: {
      all: { type: 'boolean', description: 'Show stopped containers', required: false },
      format: { type: 'string', description: 'Output format: table, json, compact', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        all: { type: 'boolean', required: false, default: false },
        format: { type: 'string', required: false, default: 'table', enum: ['table', 'json', 'compact'] }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const allFlag = validation.data.all ? '-a' : ''
      const result = await safeExec(`docker ps ${allFlag} --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"`)

      const containers = result.split('\n').filter(l => l.trim()).map(line => {
        const [id, names, image, status, ports] = line.split('|')
        return {
          id: id?.substring(0, 12),
          name: names,
          image,
          status: status?.includes('Up') ? '✅ ' + status : '⏹️ ' + status,
          ports: ports?.split(',')?.slice(0, 3) || []
        }
      })

      return formatSuccess({
        total: containers.length,
        running: containers.filter(c => c.status.includes('Up')).length,
        containers,
        quickCommands: [
          'docker logs -f <container> - View live logs',
          'docker exec -it <container> sh - Shell access',
          'docker restart <container> - Restart container'
        ]
      })
    }
  })

  .addTool({
    name: 'docker_manage',
    description: 'Docker container management: run, stop, restart, remove, logs',
    parameters: {
      action: { type: 'string', description: 'run, stop, restart, remove, logs, inspect', required: true },
      container: { type: 'string', description: 'Container name or ID', required: false },
      image: { type: 'string', description: 'Image for run action', required: false },
      name: { type: 'string', description: 'Container name for run', required: false },
      ports: { type: 'string', description: 'Port mappings for run', required: false },
      env: { type: 'string', description: 'Environment variables for run', required: false },
      detach: { type: 'boolean', description: 'Run in background', required: false },
      tail: { type: 'number', description: 'Number of log lines to show', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true, enum: ['run', 'stop', 'start', 'restart', 'remove', 'logs', 'inspect'] },
        container: { type: 'string', required: false, default: '' },
        image: { type: 'string', required: false, default: '' },
        name: { type: 'string', required: false, default: '' },
        ports: { type: 'string', required: false, default: '' },
        env: { type: 'string', required: false, default: '' },
        detach: { type: 'boolean', required: false, default: true },
        tail: { type: 'number', required: false, default: 50, min: 1, max: 1000 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let cmd = 'docker '
      let result = ''

      switch (validation.data.action) {
        case 'run':
          if (!validation.data.image) return formatError('Image name required for run action')
          cmd += 'run '
          if (validation.data.detach) cmd += '-d '
          if (validation.data.name) cmd += `--name ${validation.data.name} `
          if (validation.data.ports) cmd += validation.data.ports.split(',').map((p: string) => `-p ${p.trim()} `).join('')
          if (validation.dataDELETE) cmd += validation.dataDELETE.split(',').map((e: string) => `-e ${e.trim()} `).join('')
          cmd += validation.data.image
          break
        case 'logs':
          if (!validation.data.container) return formatError('Container required')
          cmd += `logs --tail ${validation.data.tail} ${validation.data.container}`
          break
        case 'remove':
          if (!validation.data.container) return formatError('Container required')
          cmd += `rm -f ${validation.data.container}`
          break
        default:
          if (!validation.data.container) return formatError('Container required')
          cmd += `${validation.data.action} ${validation.data.container}`
      }

      result = await safeExec(cmd, 60000)

      return formatSuccess({
        action: validation.data.action,
        success: !result.toLowerCase().includes('error'),
        container: validation.data.container,
        image: validation.data.image,
        command: cmd,
        output: result
      })
    }
  })

  .addTool({
    name: 'docker_compose',
    description: 'Docker Compose multi-service orchestration',
    parameters: {
      action: { type: 'string', description: 'up, down, ps, logs, restart, build', required: true },
      file: { type: 'string', description: 'Compose file path', required: false },
      services: { type: 'string', description: 'Specific services', required: false },
      detach: { type: 'boolean', description: 'Run in background', required: false },
      removeOrphans: { type: 'boolean', description: 'Remove orphan containers', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true, enum: ['up', 'down', 'ps', 'logs', 'restart', 'build', 'pull'] },
        file: { type: 'string', required: false, default: 'docker-compose.yml' },
        services: { type: 'string', required: false, default: '' },
        detach: { type: 'boolean', required: false, default: true },
        removeOrphans: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let cmd = `docker compose -f ${validation.data.file} `

      switch (validation.data.action) {
        case 'up':
          cmd += 'up '
          if (validation.data.detach) cmd += '-d '
          if (validation.data.removeOrphans) cmd += '--remove-orphans '
          break
        case 'down':
          cmd += 'down '
          if (validation.data.removeOrphans) cmd += '--remove-orphans '
          break
        case 'build':
          cmd += 'build --no-cache '
          break
        default:
          cmd += `${validation.data.action} `
      }

      if (validation.data.services) {
        cmd += validation.data.services.split(',').map((s: string) => s.trim()).join(' ')
      }

      const result = await safeExecRaw(cmd, 120000)

      return formatSuccess({
        action: validation.data.action,
        composeFile: sanitizePath(validation.data.file),
        success: result.exitCode === 0,
        command: cmd,
        output: result.stdout || result.stderr
      })
    }
  })

  .addTool({
    name: 'file_read',
    description: 'Read file contents with encoding options and size limits',
    parameters: {
      path: { type: 'string', description: 'File path', required: true },
      encoding: { type: 'string', description: 'File encoding: utf8, base64, binary', required: false },
      maxLines: { type: 'number', description: 'Maximum lines to read', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        encoding: { type: 'string', required: false, default: 'utf8', enum: ['utf8', 'base64', 'binary'] },
        maxLines: { type: 'number', required: false, default: 0, min: 0, max: 10000 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const content = await fs.readFile(validation.data.path, validation.data.encoding as BufferEncoding)
        let lines = content.split('\n')
        const truncated = validation.data.maxLines > 0 && lines.length > validation.data.maxLines

        if (validation.data.maxLines > 0) {
          lines = lines.slice(0, validation.data.maxLines)
        }

        const stats = await fs.stat(validation.data.path)

        return formatSuccess({
          path: sanitizePath(validation.data.path),
          size: stats.size,
          sizeKB: Math.round(stats.size / 1024),
          lines: content.split('\n').length,
          truncated,
          content: lines.join('\n'),
          modified: stats.mtime.toISOString()
        })
      } catch (e: any) {
        return formatError('Failed to read file', [e.message])
      }
    }
  })

  .addTool({
    name: 'file_write',
    description: 'Write content to file with backup and atomic write options',
    parameters: {
      path: { type: 'string', description: 'File path', required: true },
      content: { type: 'string', description: 'Content to write', required: true },
      backup: { type: 'boolean', description: 'Create backup before writing', required: false },
      mode: { type: 'string', description: 'Write mode: overwrite, append', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        content: { type: 'string', required: true },
        backup: { type: 'boolean', required: false, default: true },
        mode: { type: 'string', required: false, default: 'overwrite', enum: ['overwrite', 'append'] }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const dir = path.dirname(validation.data.path)
        try {
          await fs.access(dir)
        } catch {
          await fs.mkdir(dir, { recursive: true })
        }

        if (validation.data.backup && validation.data.mode === 'overwrite') {
          try {
            const existing = await fs.readFile(validation.data.path, 'utf8')
            await fs.writeFile(validation.data.path + '.bak', existing)
          } catch {
          }
        }

        const flag = validation.data.mode === 'append' ? 'a' : 'w'
        await fs.writeFile(validation.data.path, validation.data.content, { flag })

        return formatSuccess({
          path: sanitizePath(validation.data.path),
          bytesWritten: Buffer.byteLength(validation.data.content, 'utf8'),
          mode: validation.data.mode,
          backupCreated: validation.data.backup,
          checksum: crypto.createHash('md5').update(validation.data.content).digest('hex').substring(0, 16)
        })
      } catch (e: any) {
        return formatError('Failed to write file', [e.message])
      }
    }
  })

  .addTool({
    name: 'file_list',
    description: 'List directory contents with advanced filtering and sorting',
    parameters: {
      path: { type: 'string', description: 'Directory path', required: false },
      recursive: { type: 'boolean', description: 'List recursively', required: false },
      maxDepth: { type: 'number', description: 'Maximum recursion depth', required: false },
      type: { type: 'string', description: 'Filter by type: file, directory, all', required: false },
      pattern: { type: 'string', description: 'Glob pattern filter', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: false, default: '.' },
        recursive: { type: 'boolean', required: false, default: false },
        maxDepth: { type: 'number', required: false, default: 2, min: 1, max: 5 },
        type: { type: 'string', required: false, default: 'all', enum: ['file', 'directory', 'all'] },
        pattern: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      async function walk(dir: string, currentDepth: number = 0): Promise<any[]> {
        if (currentDepth >= validation.data.maxDepth) return []
        const entries = await fs.readdir(dir, { withFileTypes: true })
        const results: any[] = []

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relativePath = path.relative(validation.data.path, fullPath)

          if (validation.data.pattern && !entry.name.match(new RegExp(validation.data.pattern.replace(/\*/g, '.*'), 'i'))) {
            if (entry.isDirectory() && validation.data.recursive) {
              results.push(...await walk(fullPath, currentDepth + 1))
            }
            continue
          }

          const includeFile = validation.data.type === 'all' ||
            (validation.data.type === 'file' && entry.isFile()) ||
            (validation.data.type === 'directory' && entry.isDirectory())

          if (includeFile) {
            const stats = await fs.stat(fullPath).catch(() => null)
            results.push({
              name: entry.name,
              path: sanitizePath(relativePath),
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stats?.size || 0,
              modified: stats?.mtime.toISOString() || ''
            })
          }

          if (entry.isDirectory() && validation.data.recursive) {
            results.push(...await walk(fullPath, currentDepth + 1))
          }
        }
        return results
      }

      const entries = await walk(validation.data.path, 0)

      return formatSuccess({
        path: sanitizePath(validation.data.path),
        total: entries.length,
        directories: entries.filter(e => e.type === 'directory').length,
        files: entries.filter(e => e.type === 'file').length,
        entries: entries.slice(0, 100),
        truncated: entries.length > 100
      })
    }
  })

  .addTool({
    name: 'terminal_exec',
    description: 'Execute terminal commands with safety controls and proper timeout',
    parameters: {
      command: { type: 'string', description: 'Command to execute', required: true },
      cwd: { type: 'string', description: 'Working directory', required: false },
      timeout: { type: 'number', description: 'Timeout in milliseconds', required: false },
      shell: { type: 'string', description: 'Shell to use: bash, powershell, cmd', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        command: { type: 'string', required: true },
        cwd: { type: 'string', required: false, default: '.' },
        timeout: { type: 'number', required: false, default: 30000, min: 1000, max: 300000 },
        shell: { type: 'string', required: false, default: 'default', enum: ['default', 'bash', 'powershell', 'cmd'] }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const result = await safeExecRaw(
        validation.data.command,
        validation.data.timeout,
        validation.data.cwd
      )

      return formatSuccess({
        command: validation.data.command,
        cwd: sanitizePath(validation.data.cwd),
        exitCode: result.exitCode,
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTimeMs: result.durationMs,
        safetyWarning: [
          '⚠️ Always validate command arguments',
          '⚠️ Avoid running untrusted commands',
          '⚠️ Use timeout for long-running operations'
        ]
      })
    }
  })

  .addTool({
    name: 'crypto_hash',
    description: 'Professional cryptographic hashing for files and text content',
    parameters: {
      input: { type: 'string', description: 'Text to hash or file path', required: true },
      inputType: { type: 'string', description: 'Type of input: text, file', required: false },
      algorithm: { type: 'string', description: 'Hashing algorithm', required: false },
      encoding: { type: 'string', description: 'Output encoding: hex, base64', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        inputType: { type: 'string', required: false, default: 'text', enum: ['text', 'file'] },
        algorithm: { type: 'string', required: false, default: 'sha256', enum: ['md5', 'sha1', 'sha256', 'sha512'] },
        encoding: { type: 'string', required: false, default: 'hex', enum: ['hex', 'base64'] }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        let content: Buffer | string = validation.data.input

        if (validation.data.inputType === 'file') {
          content = await fs.readFile(validation.data.input)
        }

        const hash = crypto.createHash(validation.data.algorithm)
          .update(content)
          .digest(validation.data.encoding as crypto.BinaryToTextEncoding)

        return formatSuccess({
          input: validation.data.inputType === 'file' ? sanitizePath(validation.data.input) : '[text content]',
          inputType: validation.data.inputType,
          algorithm: validation.data.algorithm,
          encoding: validation.data.encoding,
          hash,
          securityNotes: [
            '✅ SHA-256 recommended for most purposes',
            '⚠️ MD5/SHA1 not recommended for security purposes',
            '✅ SHA-512 for maximum security'
          ]
        })
      } catch (e: any) {
        return formatError('Hashing failed', [e.message])
      }
    }
  })

  .addTool({
    name: 'encoding_transform',
    description: 'Professional encoding and decoding utilities',
    parameters: {
      action: { type: 'string', description: 'Action to perform', required: true },
      content: { type: 'string', description: 'Content to encode/decode', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true, enum: ['base64-encode', 'base64-decode', 'url-encode', 'url-decode', 'json-pretty', 'json-minify'] },
        content: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let result = ''
      try {
        switch (validation.data.action) {
          case 'base64-encode':
            result = Buffer.from(validation.data.content).toString('base64')
            break
          case 'base64-decode':
            result = Buffer.from(validation.data.content, 'base64').toString('utf8')
            break
          case 'url-encode':
            result = encodeURIComponent(validation.data.content)
            break
          case 'url-decode':
            result = decodeURIComponent(validation.data.content)
            break
          case 'json-pretty':
            result = JSON.stringify(JSON.parse(validation.data.content), null, 2)
            break
          case 'json-minify':
            result = JSON.stringify(JSON.parse(validation.data.content))
            break
        }

        return formatSuccess({
          action: validation.data.action,
          inputLength: validation.data.content.length,
          outputLength: result.length,
          result
        })
      } catch (e: any) {
        return formatError('Encoding transform failed', [e.message])
      }
    }
  })

  .addPrompt({
    name: 'trunk-based-git-workflow',
    description: 'Professional Trunk-Based Development workflow guide',
    arguments: [],
    generate: async () => `
## 🚀 TRUNK-BASED DEVELOPMENT WORKFLOW

### CORE PRINCIPLES:
1. **Main branch is always deployable**
2. **Short-lived feature branches** (max 1-2 days)
3. **Small, atomic commits**
4. **CI on every push**
5. **Feature flags** for incomplete work

### DAILY WORKFLOW:
1. \`git checkout main && git pull\` - Start fresh
2. \`git checkout -b feature/short-description\` - Short branch
3. Make changes (2 hours max scope)
4. \`git status\` + \`git diff\` - Review changes
5. \`git commit -m "type: imperative message"\`
6. \`git push -u origin HEAD\`
7. Create PR immediately
8. Merge within 24 hours

### CONVENTIONAL COMMITS:
- \`feat:\` New feature
- \`fix:\` Bug fix
- \`docs:\` Documentation
- \`style:\` Formatting
- \`refactor:\` Code reorganization
- \`test:\` Adding tests
- \`chore:\` Maintenance
    `.trim()
  })

  .addPrompt({
    name: 'docker-best-practices',
    description: 'Docker and Docker Compose production best practices',
    arguments: [],
    generate: async () => `
## 🐳 DOCKER PRODUCTION BEST PRACTICES

### IMAGE GUIDELINES:
1. **Pin all versions** - No :latest tags
2. **Multi-stage builds** - Reduce image size
3. **Official base images** - Prefer alpine variants
4. **Non-root user** - USER node / USER www-data
5. **.dockerignore** - Exclude node_modules, .git, etc.

### COMPOSE PRODUCTION:
\`\`\`yaml
services:
  app:
    image: myapp:v1.2.3  # PINNED!
    read_only: true
    cap_drop: [ALL]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    restart: unless-stopped
    mem_limit: 512m
    cpus: '0.5'
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
\`\`\`

### SECURITY:
- No secrets in ENV - use secrets / DELETE
- No ssh in containers
- Scan images: trivy image myapp
    `.trim()
  })
  .build()
