import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'ssh',
  version: '2.0.0',
  description: 'SSH toolkit - connections, tunneling, key management, batch execution',
  author: 'MCP Expert Community',
  icon: '🔑'
})
  .addTool({
    name: 'ssh_connect',
    description: 'Generate SSH connection command',
    parameters: {
      host: { type: 'string', description: 'Hostname or IP', required: true },
      user: { type: 'string', description: 'Username', required: false },
      port: { type: 'number', description: 'SSH port', required: false },
      key: { type: 'string', description: 'Private key path', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        host: { type: 'string', required: true },
        user: { type: 'string', required: false, default: 'root' },
        port: { type: 'number', required: false, default: 22 },
        key: { type: 'string', required: false, default: '~/.ssh/id_rsa' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        command: `ssh -p ${validation.data.port} -i ${validation.data.key} ${validation.data.user}@${validation.data.host}`,
        configEntry: `Host ${validation.data.host}\n  HostName ${validation.data.host}\n  User ${validation.data.user}\n  Port ${validation.data.port}\n  IdentityFile ${validation.data.key}`
      })
    }
  })
  .addTool({
    name: 'ssh_tunnel',
    description: 'Generate SSH tunnel command (local/remote/dynamic)',
    parameters: {
      type: { type: 'string', description: 'local|remote|dynamic', required: true },
      localPort: { type: 'number', description: 'Local port', required: true },
      remoteHost: { type: 'string', description: 'Remote host', required: true },
      remotePort: { type: 'number', description: 'Remote port', required: true },
      jumpHost: { type: 'string', description: 'Jump server', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true },
        localPort: { type: 'number', required: true },
        remoteHost: { type: 'string', required: true },
        remotePort: { type: 'number', required: true },
        jumpHost: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const flags: Record<string, string> = {
        local: `-L ${validation.data.localPort}:${validation.data.remoteHost}:${validation.data.remotePort}`,
        remote: `-R ${validation.data.localPort}:${validation.data.remoteHost}:${validation.data.remotePort}`,
        dynamic: `-D ${validation.data.localPort}`
      }

      return formatSuccess({
        command: `ssh -N -f ${flags[validation.data.type] || flags.local} ${validation.data.jumpHost || validation.data.remoteHost}`,
        useCases: ['Database access', 'SOCKS proxy', 'Reverse shell']
      })
    }
  })
  .addTool({
    name: 'ssh_keygen',
    description: 'Generate SSH key pair',
    parameters: {
      type: { type: 'string', description: 'rsa|ed25519|ecdsa', required: false },
      bits: { type: 'number', description: 'Key bits', required: false },
      comment: { type: 'string', description: 'Key comment', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: false, default: 'ed25519' },
        bits: { type: 'number', required: false, default: 4096 },
        comment: { type: 'string', required: false, default: 'mcp@local' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        command: `ssh-keygen -t ${validation.data.type} -b ${validation.data.bits} -C "${validation.data.comment}"`,
        publicKeyCommand: 'cat ~/.ssh/id_ed25519.pub',
        copyIdCommand: `ssh-copy-id user@host`
      })
    }
  })
  .build()
