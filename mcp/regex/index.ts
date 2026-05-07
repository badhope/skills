import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'regex',
  version: '2.0.0',
  description: 'Regex toolkit - testing, explanation, generation, common patterns library',
  author: 'MCP Expert Community',
  icon: '🔍'
})
  .addTool({
    name: 'regex_test',
    description: 'Test regex against input with detailed match information',
    parameters: {
      pattern: { type: 'string', description: 'Regex pattern', required: true },
      input: { type: 'string', description: 'Input text', required: true },
      flags: { type: 'string', description: 'Regex flags', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        pattern: { type: 'string', required: true },
        input: { type: 'string', required: true },
        flags: { type: 'string', required: false, default: 'g' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const regex = new RegExp(validation.data.pattern, validation.data.flags)
        const matches: any[] = []
        let match
        while ((match = regex.exec(validation.data.input)) !== null) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.slice(1),
            namedGroups: match.groups
          })
          if (match[0].length === 0) regex.lastIndex++
        }

        return formatSuccess({
          matches,
          matchCount: matches.length,
          anyMatch: matches.length > 0,
          groups: matches.length > 0 ? matches[0].groups.length : 0
        })
      } catch (e: any) {
        return formatError('Regex syntax error', e.message)
      }
    }
  })
  .addTool({
    name: 'regex_replace',
    description: 'Find and replace with capture groups',
    parameters: {
      pattern: { type: 'string', description: 'Regex pattern', required: true },
      input: { type: 'string', description: 'Input text', required: true },
      replacement: { type: 'string', description: 'Replacement string', required: true },
      flags: { type: 'string', description: 'Regex flags', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        pattern: { type: 'string', required: true },
        input: { type: 'string', required: true },
        replacement: { type: 'string', required: true },
        flags: { type: 'string', required: false, default: 'g' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const regex = new RegExp(validation.data.pattern, validation.data.flags)
        const result = validation.data.input.replace(regex, validation.data.replacement)
        return formatSuccess({ result, changed: result !== validation.data.input })
      } catch (e: any) {
        return formatError('Regex error', e.message)
      }
    }
  })
  .addTool({
    name: 'regex_patterns',
    description: 'Library of common regex patterns',
    parameters: {
      category: { type: 'string', description: 'Pattern category', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        category: { type: 'string', required: false, default: 'all' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const patterns = {
        email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/,
        phone: /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/,
        uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
        hexColor: /^#?([a-f0-9]{3}|[a-f0-9]{6})$/,
        jwt: /^ey[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*$/,
        dateISO: /^\d{4}-\d{2}-\d{2}$/,
        passwordStrong: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
      }

      return formatSuccess({
        patterns: Object.fromEntries(
          Object.entries(patterns).map(([k, v]) => [k, v.toString()])
        ),
        count: Object.keys(patterns).length
      })
    }
  })
  .build()
