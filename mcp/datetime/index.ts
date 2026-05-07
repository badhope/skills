import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'datetime',
  version: '2.0.0',
  description: 'Datetime toolkit - parsing, formatting, timezone conversion, duration calculation',
  author: 'MCP Expert Community',
  icon: '🕐'
})
  .addTool({
    name: 'dt_now',
    description: 'Get current datetime in multiple formats and timezones',
    parameters: {
      timezone: { type: 'string', description: 'IANA timezone', required: false },
      locale: { type: 'string', description: 'Locale for formatting', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        timezone: { type: 'string', required: false, default: 'UTC' },
        locale: { type: 'string', required: false, default: 'en-US' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const now = new Date()

      return formatSuccess({
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        unixMs: now.getTime(),
        utc: now.toUTCString(),
        locale: now.toLocaleString(validation.data.locale, { timeZone: validation.data.timezone }),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString()
      })
    }
  })
  .addTool({
    name: 'dt_format',
    description: 'Format datetime with custom patterns',
    parameters: {
      timestamp: { type: 'string', description: 'Date string or timestamp', required: true },
      pattern: { type: 'string', description: 'Format pattern', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        timestamp: { type: 'string', required: true },
        pattern: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const d = new Date(validation.data.timestamp)
      if (isNaN(d.getTime())) return formatError('Invalid date')

      const pad = (n: number) => String(n).padStart(2, '0')
      let result = validation.data.pattern
        .replace(/YYYY/g, String(d.getFullYear()))
        .replace(/MM/g, pad(d.getMonth() + 1))
        .replace(/DD/g, pad(d.getDate()))
        .replace(/HH/g, pad(d.getHours()))
        .replace(/mm/g, pad(d.getMinutes()))
        .replace(/ss/g, pad(d.getSeconds()))

      return formatSuccess({ result, parsed: d.toISOString() })
    }
  })
  .addTool({
    name: 'dt_diff',
    description: 'Calculate duration between two dates with breakdown',
    parameters: {
      start: { type: 'string', description: 'Start date', required: true },
      end: { type: 'string', description: 'End date', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        start: { type: 'string', required: true },
        end: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const s = new Date(validation.data.start)
      const e = new Date(validation.data.end)
      const diff = e.getTime() - s.getTime()
      const abs = Math.abs(diff)

      return formatSuccess({
        milliseconds: diff,
        seconds: Math.round(diff / 1000),
        minutes: Math.round(diff / 60000),
        hours: Math.round(diff / 3600000),
        days: Math.round(diff / 86400000),
        breakdown: {
          days: Math.floor(abs / 86400000),
          hours: Math.floor((abs % 86400000) / 3600000),
          minutes: Math.floor((abs % 3600000) / 60000),
          seconds: Math.floor((abs % 60000) / 1000)
        },
        isNegative: diff < 0
      })
    }
  })
  .build()
