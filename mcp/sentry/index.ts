import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'sentry',
  version: '2.0.0',
  description: 'Sentry toolkit - error monitoring, release management, performance profiling',
  author: 'MCP Expert Community',
  icon: '🛡️'
})
  .addTool({
    name: 'sentry_init',
    description: 'Generate Sentry initialization code',
    parameters: {
      dsn: { type: 'string', description: 'Sentry DSN', required: true },
      framework: { type: 'string', description: 'react|vue|node|nextjs', required: true },
      tracesSampleRate: { type: 'number', description: 'Sample rate 0-1', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        dsn: { type: 'string', required: true },
        framework: { type: 'string', required: true },
        tracesSampleRate: { type: 'number', required: false, default: 0.1 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const snippets: Record<string, string> = {
        react: `import * as Sentry from "@sentry/react";\nSentry.init({ dsn: "${validation.data.dsn}", tracesSampleRate: ${validation.data.tracesSampleRate} });`,
        node: `const Sentry = require("@sentry/node");\nSentry.init({ dsn: "${validation.data.dsn}" });`,
        nextjs: `// next.config.js\nconst { withSentryConfig } = require("@sentry/nextjs");`
      }

      return formatSuccess({
        code: snippets[validation.data.framework] || snippets.react,
        docs: `https://docs.sentry.io/platforms/${validation.data.framework}/`,
        testCommand: 'Sentry.captureException(new Error("Test"))'
      })
    }
  })
  .addTool({
    name: 'sentry_release',
    description: 'Create Sentry release command',
    parameters: {
      version: { type: 'string', description: 'Release version', required: true },
      org: { type: 'string', description: 'Organization slug', required: true },
      project: { type: 'string', description: 'Project slug', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        version: { type: 'string', required: true },
        org: { type: 'string', required: true },
        project: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        commands: [
          `sentry-cli releases new ${validation.data.version}`,
          `sentry-cli releases files ${validation.data.version} upload-sourcemaps ./build`,
          `sentry-cli releases finalize ${validation.data.version}`
        ],
        config: { org: validation.data.org, project: validation.data.project }
      })
    }
  })
  .build()
