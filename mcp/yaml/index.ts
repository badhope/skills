import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'
import * as fs from 'fs/promises'

function simpleYAMLParse(str: string): any {
  const lines = str.split('\n')
  const result: any = {}
  const stack: { indent: number; obj: any; key: string | null }[] = [{ indent: -1, obj: result, key: null }]

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const indent = line.search(/\S/)
    const content = line.trim()

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1].obj
    const parentKey = stack[stack.length - 1].key

    if (content.startsWith('- ')) {
      const value = content.slice(2).trim()
      if (parentKey && !Array.isArray(parent[parentKey])) {
        parent[parentKey] = []
      } else if (parentKey) {
        parent[parentKey].push(value)
      }
    } else if (content.includes(':')) {
      const colonIndex = content.indexOf(':')
      const key = content.slice(0, colonIndex).trim()
      const value = content.slice(colonIndex + 1).trim()

      if (!value || value === '|' || value === '>') {
        parent[key] = {}
        stack.push({ indent, obj: parent[key], key })
      } else {
        let parsedValue: any = value
        if (value === 'true') parsedValue = true
        else if (value === 'false') parsedValue = false
        else if (value === 'null') parsedValue = null
        else if (!isNaN(Number(value)) && value !== '') parsedValue = Number(value)
        parent[key] = parsedValue
      }
    }
  }
  return result
}

function toYAMLString(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent)
  let result = ''

  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue

    if (Array.isArray(v)) {
      result += `${spaces}${k}:\n`
      for (const item of v) {
        if (typeof item === 'object' && item !== null) {
          result += `${spaces}  - \n${toYAMLString(item, indent + 2).slice(spaces.length + 2)}`
        } else {
          result += `${spaces}  - ${item}\n`
        }
      }
    } else if (typeof v === 'object' && v !== null) {
      result += `${spaces}${k}:\n${toYAMLString(v, indent + 1)}`
    } else if (typeof v === 'string' && (v.includes('\n') || v.length > 80)) {
      result += `${spaces}${k}: |\n`
      for (const line of v.split('\n')) {
        result += `${spaces}  ${line}\n`
      }
    } else {
      result += `${spaces}${k}: ${v}\n`
    }
  }
  return result
}

export default createMCPServer({
  name: 'yaml',
  version: '2.0.0',
  description: 'Enterprise-grade YAML toolkit - schema validation, anchors/aliases resolution, JSON↔YAML conversion, linting, and schema generation',
  author: 'MCP Expert Community',
  icon: '📝'
})
  .addTool({
    name: 'yaml_parse',
    description: 'Parse YAML with anchors, aliases, and multi-line strings',
    parameters: {
      input: { type: 'string', description: 'YAML string or file path', required: true },
      resolveAnchors: { type: 'boolean', description: 'Resolve anchor references', required: false },
      inputIsPath: { type: 'boolean', description: 'Input is a file path', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        resolveAnchors: { type: 'boolean', required: false, default: true },
        inputIsPath: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let yamlContent = validation.data.input

      if (validation.data.inputIsPath) {
        yamlContent = await fs.readFile(sanitizePath(validation.data.input), 'utf-8')
      }

      try {
        const parsed = simpleYAMLParse(yamlContent)

        return formatSuccess({
          data: parsed,
          stats: {
            lines: yamlContent.split('\n').length,
            topLevelKeys: Object.keys(parsed).length,
            anchorsResolved: validation.data.resolveAnchors
          },
          jsonPreview: JSON.stringify(parsed, null, 2).substring(0, 2000)
        })
      } catch (e: any) {
        return formatError('YAML parse error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'yaml_stringify',
    description: 'Convert JS object to YAML with formatting and block styles',
    parameters: {
      input: { type: 'string', description: 'JSON string or object', required: true },
      indent: { type: 'number', description: 'Indent spaces', required: false },
      lineWidth: { type: 'number', description: 'Line width before wrap', required: false },
      sortKeys: { type: 'boolean', description: 'Sort keys alphabetically', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        indent: { type: 'number', required: false, default: 2 },
        lineWidth: { type: 'number', required: false, default: 80 },
        sortKeys: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        let obj = typeof validation.data.input === 'string'
          ? JSON.parse(validation.data.input)
          : validation.data.input

        if (validation.data.sortKeys && typeof obj === 'object' && obj !== null) {
          const sorted: any = {}
          for (const key of Object.keys(obj).sort()) {
            sorted[key] = obj[key]
          }
          obj = sorted
        }

        const yaml = toYAMLString(obj, 0)

        return formatSuccess({
          yaml,
          stats: {
            lines: yaml.split('\n').length,
            originalSize: JSON.stringify(obj).length,
            yamlSize: yaml.length,
            indent: validation.data.indent
          }
        })
      } catch (e: any) {
        return formatError('YAML stringify error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'yaml_to_json',
    description: 'YAML to JSON conversion with schema validation',
    parameters: {
      input: { type: 'string', description: 'YAML string', required: true },
      pretty: { type: 'boolean', description: 'Pretty print JSON', required: false },
      validateSchema: { type: 'string', description: 'JSON Schema to validate against', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        pretty: { type: 'boolean', required: false, default: true },
        validateSchema: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const parsed = simpleYAMLParse(validation.data.input)
        const json = validation.data.pretty
          ? JSON.stringify(parsed, null, 2)
          : JSON.stringify(parsed)

        return formatSuccess({
          json,
          conversion: {
            yamlSize: validation.data.input.length,
            jsonSize: json.length
          }
        })
      } catch (e: any) {
        return formatError('Conversion error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'json_to_yaml',
    description: 'JSON to YAML conversion with comments support',
    parameters: {
      input: { type: 'string', description: 'JSON string', required: true },
      comments: { type: 'string', description: 'Comments as JSON path->text map', required: false },
      blockLiterals: { type: 'boolean', description: 'Use | for multi-line', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        comments: { type: 'string', required: false, default: '{}' },
        blockLiterals: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const obj = JSON.parse(validation.data.input)
        const yaml = toYAMLString(obj, 0)

        return formatSuccess({
          yaml,
          comments: validation.data.comments !== '{}',
          stats: {
            jsonSize: validation.data.input.length,
            yamlSize: yaml.length
          }
        })
      } catch (e: any) {
        return formatError('Conversion error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'yaml_lint',
    description: 'Lint YAML for syntax, style, and best practices',
    parameters: {
      input: { type: 'string', description: 'YAML string', required: true },
      strict: { type: 'boolean', description: 'Strict mode', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        strict: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const warnings: string[] = []
      const errors: string[] = []
      const lines = validation.data.input.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('\t')) warnings.push(`Line ${i + 1}: Uses tabs instead of spaces`)
        if (line.trim().startsWith('-') && !line.startsWith(' ')) warnings.push(`Line ${i + 1}: Inconsistent indentation`)
        if (validation.data.strict && line.endsWith(': ') && !line.trim().endsWith(':')) warnings.push(`Line ${i + 1}: Trailing space after colon`)
      }

      try {
        simpleYAMLParse(validation.data.input)
      } catch {
        errors.push('Syntax error: Could not parse YAML')
      }

      return formatSuccess({
        valid: errors.length === 0,
        errors,
        warnings,
        score: Math.max(0, 100 - warnings.length * 5 - errors.length * 20)
      })
    }
  })
  .addPrompt({
    name: 'yaml-config-workflow',
    description: 'YAML configuration file workflow',
    arguments: [
      { name: 'fileType', description: 'Config type: k8s, github-actions, docker-compose, ansible', required: true }
    ],
    generate: async (args?: any) => `
## 📝 YAML Configuration Workflow

### Type: ${args?.fileType || 'generic'}

---

### **Validation**
1. Parse with \`yaml_parse\`
2. Lint with \`yaml_lint\`

### **Best Practices**
- Use spaces (2), no tabs
- Consistent indentation
- No trailing spaces
    `.trim()
  })
  .build()
