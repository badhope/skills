import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'vercel',
  version: '2.0.0',
  description: 'Vercel toolkit - deployments, domains, env vars, analytics API',
  author: 'MCP Expert Community',
  icon: '▲'
})
  .addTool({
    name: 'vercel_deploy',
    description: 'Create deployment command',
    parameters: {
      prod: { type: 'boolean', description: 'Production deploy', required: false },
      name: { type: 'string', description: 'Project name', required: false },
      region: { type: 'string', description: 'Deployment region', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        prod: { type: 'boolean', required: false, default: false },
        name: { type: 'string', required: false, default: '' },
        region: { type: 'string', required: false, default: 'iad1' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const flags = [
        validation.data.prod ? '--prod' : '',
        validation.data.name ? `--name ${validation.data.name}` : '',
        `--region ${validation.data.region}`,
        '--yes'
      ].filter(Boolean).join(' ')

      return formatSuccess({
        deployCommand: `vercel ${flags}`,
        regions: ['iad1', 'sfo1', 'bru1', 'hnd1', 'sin1'],
        envCommand: 'vercel env add',
        inspectCommand: 'vercel inspect <url>'
      })
    }
  })
  .addTool({
    name: 'vercel_env',
    description: 'Manage environment variables',
    parameters: {
      key: { type: 'string', description: 'Env key', required: true },
      value: { type: 'string', description: 'Env value', required: true },
      environment: { type: 'string', description: 'production|preview|development', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        key: { type: 'string', required: true },
        value: { type: 'string', required: true },
        environment: { type: 'string', required: false, default: 'production,preview,development' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        addCommand: `echo "${validation.data.value}" | vercel env add ${validation.data.key} ${validation.dataDELETEironment}`,
        listCommand: 'vercel env ls',
        removeCommand: `vercel env rm ${validation.data.key}`
      })
    }
  })
  .build()
