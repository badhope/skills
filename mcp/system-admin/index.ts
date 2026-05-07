import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'system-admin',
  version: '2.0.0',
  description: 'System admin toolkit - process, memory, disk, users, services, logs',
  author: 'MCP Expert Community',
  icon: '🖥️'
})
  .addTool({
    name: 'sys_process',
    description: 'Process management commands',
    parameters: {
      action: { type: 'string', description: 'list|kill|stats', required: true },
      filter: { type: 'string', description: 'Process name filter', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true },
        filter: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const commands: Record<string, string> = {
        list: `ps aux ${validation.data.filter ? `| grep ${validation.data.filter}` : ''}`,
        stats: 'top -b -n 1 | head -20',
        tree: 'pstree -p',
        kill: `kill -9 <PID>`
      }

      return formatSuccess({
        command: commands[validation.data.action] || commands.list,
        columns: ['PID', 'CPU%', 'MEM%', 'START', 'COMMAND']
      })
    }
  })
  .addTool({
    name: 'sys_resources',
    description: 'System resources monitoring',
    parameters: {
      type: { type: 'string', description: 'disk|memory|cpu|all', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: false, default: 'all' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        commands: {
          disk: 'df -h && du -sh /* 2>/dev/null | sort -hr',
          memory: 'free -h && vmstat -s',
          cpu: 'lscpu && mpstat 1 3',
          all: 'df -h && free -h && top -b -n 1 | head -5'
        }
      })
    }
  })
  .addTool({
    name: 'sys_services',
    description: 'System services management',
    parameters: {
      action: { type: 'string', description: 'status|start|stop|restart|enable', required: true },
      service: { type: 'string', description: 'Service name', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true },
        service: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        systemd: `systemctl ${validation.data.action} ${validation.data.service}`,
        service: `service ${validation.data.service} ${validation.data.action}`,
        status: `journalctl -u ${validation.data.service} -f -n 50`
      })
    }
  })
  .build()
