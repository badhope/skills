import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'cloudflare',
  version: '2.0.0',
  description: 'Cloudflare toolkit - DNS, Workers, Cache, Rules, Analytics API',
  author: 'MCP Expert Community',
  icon: '🌩️'
})
  .addTool({
    name: 'cf_dns_list',
    description: 'List DNS records for a zone',
    parameters: {
      zoneId: { type: 'string', description: 'Cloudflare zone ID', required: true },
      type: { type: 'string', description: 'Record type', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        zoneId: { type: 'string', required: true },
        type: { type: 'string', required: false, default: 'all' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        apiEndpoint: `https://api.cloudflare.com/client/v4/zones/${validation.data.zoneId}/dns_records`,
        method: 'GET',
        recordTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'],
        curlExample: `curl -X GET "https://api.cloudflare.com/client/v4/zones/${validation.data.zoneId}/dns_records" -H "Authorization: Bearer <token>"`
      })
    }
  })
  .addTool({
    name: 'cf_dns_create',
    description: 'Create DNS record with proxy support',
    parameters: {
      zoneId: { type: 'string', description: 'Zone ID', required: true },
      type: { type: 'string', description: 'Record type', required: true },
      name: { type: 'string', description: 'Record name', required: true },
      content: { type: 'string', description: 'Record content', required: true },
      proxied: { type: 'boolean', description: 'Cloudflare proxy', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        zoneId: { type: 'string', required: true },
        type: { type: 'string', required: true },
        name: { type: 'string', required: true },
        content: { type: 'string', required: true },
        proxied: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        apiEndpoint: `https://api.cloudflare.com/client/v4/zones/${validation.data.zoneId}/dns_records`,
        method: 'POST',
        payload: {
          type: validation.data.type,
          name: validation.data.name,
          content: validation.data.content,
          proxied: validation.data.proxied,
          ttl: 1
        }
      })
    }
  })
  .addTool({
    name: 'cf_worker_deploy',
    description: 'Deploy Cloudflare Worker script',
    parameters: {
      name: { type: 'string', description: 'Worker name', required: true },
      accountId: { type: 'string', description: 'Account ID', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        accountId: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        wranglerCommand: `wrangler deploy --name ${validation.data.name}`,
        devCommand: 'wrangler dev',
        routes: [`${validation.data.name}.worker.dev`],
        secretsCommand: `wrangler secret put <KEY>`
      })
    }
  })
  .build()
