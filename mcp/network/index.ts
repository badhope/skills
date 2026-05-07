import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'network',
  version: '2.0.0',
  description: 'Network toolkit - ports, DNS, HTTP, SSL, firewall, bandwidth',
  author: 'MCP Expert Community',
  icon: '🌐'
})
  .addTool({
    name: 'net_ports',
    description: 'Port scanning and management',
    parameters: {
      action: { type: 'string', description: 'scan|list|check', required: true },
      host: { type: 'string', description: 'Hostname or IP', required: false },
      port: { type: 'number', description: 'Port number', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true },
        host: { type: 'string', required: false, default: 'localhost' },
        port: { type: 'number', required: false, default: 80 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const commands: Record<string, string> = {
        list: 'netstat -tulpn || ss -tulpn',
        scan: `nmap -p 1-1000 ${validation.data.host}`,
        check: `nc -zv ${validation.data.host} ${validation.data.port}`
      }

      return formatSuccess({
        command: commands[validation.data.action] || commands.list,
        commonPorts: { 22: 'SSH', 80: 'HTTP', 443: 'HTTPS', 3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis' }
      })
    }
  })
  .addTool({
    name: 'net_dns',
    description: 'DNS lookup and diagnostics',
    parameters: {
      domain: { type: 'string', description: 'Domain name', required: true },
      type: { type: 'string', description: 'A|AAAA|MX|TXT|NS|CNAME', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        domain: { type: 'string', required: true },
        type: { type: 'string', required: false, default: 'A' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        commands: {
          dig: `dig ${validation.data.type} ${validation.data.domain} +short`,
          nslookup: `nslookup -type=${validation.data.type} ${validation.data.domain}`,
          whois: `whois ${validation.data.domain}`
        }
      })
    }
  })
  .addTool({
    name: 'net_ssl',
    description: 'SSL certificate check',
    parameters: {
      domain: { type: 'string', description: 'Domain name', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        domain: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        command: `openssl s_client -connect ${validation.data.domain}:443 -servername ${validation.data.domain}`,
        checkExpiry: `curl -vI https://${validation.data.domain} 2>&1 | grep -i "expire"`,
        info: 'Checks: expiry, SAN, issuer, chain validity'
      })
    }
  })
  .build()
