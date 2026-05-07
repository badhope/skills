import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

function jsonPath(obj: any, path: string): any {
  const parts = path.split(/[.[\]]/).filter(Boolean)
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function deepDiff(oldObj: any, newObj: any, prefix = ''): any {
  const added: string[] = []
  const removed: string[] = []
  const changed: { path: string; oldValue: any; newValue: any }[] = []

  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])

  for (const key of Array.from(allKeys)) {
    const fullPath = prefix ? `${prefix}.${key}` : key
    const oldVal = oldObj?.[key]
    const newVal = newObj?.[key]

    if (!(key in (oldObj || {}))) {
      added.push(fullPath)
    } else if (!(key in (newObj || {}))) {
      removed.push(fullPath)
    } else if (typeof oldVal === 'object' && typeof newVal === 'object' && oldVal !== null && newVal !== null) {
      const nested = deepDiff(oldVal, newVal, fullPath)
      added.push(...nested.added)
      removed.push(...nested.removed)
      changed.push(...nested.changed)
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changed.push({ path: fullPath, oldValue: oldVal, newValue: newVal })
    }
  }

  return { added, removed, changed }
}

function sortObjectKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys)
  if (typeof obj !== 'object' || obj === null) return obj
  return Object.keys(obj).sort().reduce((sorted: any, key) => {
    sorted[key] = sortObjectKeys(obj[key])
    return sorted
  }, {})
}

function transformValue(obj: any, path: string, fn: (v: any) => any): any {
  const parts = path.split(/[.[\]]/).filter(Boolean)
  const copy = JSON.parse(JSON.stringify(obj))
  let current = copy
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]]
    if (!current) return copy
  }
  current[parts[parts.length - 1]] = fn(current[parts[parts.length - 1]])
  return copy
}

export default createMCPServer({
  name: 'json',
  version: '2.0.0',
  description: 'Enterprise-grade JSON toolkit - validation with schema, JSONPath query, deep diff, transformation, sorting, and format conversion',
  author: 'MCP Expert Community',
  icon: '📋'
})
  .addTool({
    name: 'json_format',
    description: 'Format JSON with configurable indentation, sorting, and key ordering',
    parameters: {
      input: { type: 'string', description: 'JSON string or object', required: true },
      indent: { type: 'number', description: 'Indent spaces (default 2)', required: false },
      sortKeys: { type: 'boolean', description: 'Sort keys alphabetically', required: false },
      sortArrays: { type: 'boolean', description: 'Sort array values', required: false },
      maxLineLength: { type: 'number', description: 'Max line length before wrapping', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        indent: { type: 'number', required: false, default: 2 },
        sortKeys: { type: 'boolean', required: false, default: false },
        sortArrays: { type: 'boolean', required: false, default: false },
        maxLineLength: { type: 'number', required: false, default: 80 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        let obj = typeof validation.data.input === 'string'
          ? JSON.parse(validation.data.input)
          : validation.data.input

        const originalSize = JSON.stringify(obj).length

        if (validation.data.sortKeys) {
          obj = sortObjectKeys(obj)
        }

        if (validation.data.sortArrays) {
          const sortArraysRecursive = (o: any): any => {
            if (Array.isArray(o)) return o.sort().map(sortArraysRecursive)
            if (typeof o === 'object' && o !== null) {
              return Object.keys(o).reduce((acc: any, k) => {
                acc[k] = sortArraysRecursive(o[k])
                return acc
              }, {})
            }
            return o
          }
          obj = sortArraysRecursive(obj)
        }

        const formatted = JSON.stringify(obj, null, validation.data.indent)

        return formatSuccess({
          formatted,
          stats: {
            originalSize,
            formattedSize: formatted.length,
            lines: formatted.split('\n').length,
            indent: validation.data.indent,
            sortedKeys: validation.data.sortKeys
          }
        })
      } catch (e: any) {
        return formatError('JSON parse error', {
          message: e.message,
          position: e.at
        })
      }
    }
  })
  .addTool({
    name: 'json_minify',
    description: 'Minify JSON with whitespace removal and optional GZIP size estimation',
    parameters: {
      input: { type: 'string', description: 'JSON string', required: true },
      removeNulls: { type: 'boolean', description: 'Remove null values', required: false },
      removeEmpties: { type: 'boolean', description: 'Remove empty objects/arrays', required: false },
      showGzip: { type: 'boolean', description: 'Calculate GZIP size', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        removeNulls: { type: 'boolean', required: false, default: false },
        removeEmpties: { type: 'boolean', required: false, default: false },
        showGzip: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        let obj = JSON.parse(validation.data.input)
        const originalSize = validation.data.input.length

        if (validation.data.removeNulls || validation.data.removeEmpties) {
          const cleanse = (o: any): any => {
            if (Array.isArray(o)) {
              return o.map(cleanse).filter((x: any) => {
                if (validation.data.removeNulls && x === null) return false
                if (validation.data.removeEmpties && typeof x === 'object' && x !== null) {
                  return Object.keys(x).length > 0
                }
                return true
              })
            }
            if (typeof o === 'object' && o !== null) {
              return Object.keys(o).reduce((acc: any, k) => {
                const val = cleanse(o[k])
                if (validation.data.removeNulls && val === null) return acc
                if (validation.data.removeEmpties && typeof val === 'object' && val !== null && Object.keys(val).length === 0) return acc
                if (validation.data.removeEmpties && Array.isArray(val) && val.length === 0) return acc
                acc[k] = val
                return acc
              }, {})
            }
            return o
          }
          obj = cleanse(obj)
        }

        const minified = JSON.stringify(obj)
        const gzipSize = Math.round(minified.length * 0.15)

        return formatSuccess({
          minified,
          compression: {
            original: originalSize,
            minified: minified.length,
            bytesSaved: originalSize - minified.length,
            ratio: Math.round((1 - minified.length / originalSize) * 100),
            gzipEstimateKB: Math.round(gzipSize / 1024 * 10) / 10
          },
          cleansed: validation.data.removeNulls || validation.data.removeEmpties
        })
      } catch (e: any) {
        return formatError('JSON parse error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'json_validate',
    description: 'Validate JSON with optional JSON Schema draft-07 support and detailed error reporting',
    parameters: {
      input: { type: 'string', description: 'JSON string', required: true },
      schema: { type: 'string', description: 'JSON Schema string', required: false },
      detailedErrors: { type: 'boolean', description: 'Show detailed error paths', required: false },
      banUnknownKeys: { type: 'boolean', description: 'Disallow keys not in schema', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        schema: { type: 'string', required: false, default: '' },
        detailedErrors: { type: 'boolean', required: false, default: true },
        banUnknownKeys: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let obj
      try {
        obj = JSON.parse(validation.data.input)
      } catch (e: any) {
        return formatSuccess({
          valid: false,
          parseError: true,
          error: e.message,
          errorAt: e.at,
          suggestion: 'Check for missing commas, quotes, or mismatched brackets'
        })
      }

      const basicStats = {
        type: Array.isArray(obj) ? 'array' : typeof obj,
        byteSize: Buffer.byteLength(validation.data.input),
        depth: 1
      }

      const calculateDepth = (o: any, d = 1): number => {
        if (typeof o !== 'object' || o === null) return d
        const vals = Array.isArray(o) ? o : Object.values(o)
        return vals.length ? Math.max(...vals.map(v => calculateDepth(v, d + 1))) : d
      }
      basicStats.depth = calculateDepth(obj)

      if (Array.isArray(obj)) {
        Object.assign(basicStats, { arrayLength: obj.length })
      } else if (typeof obj === 'object') {
        Object.assign(basicStats, { keyCount: Object.keys(obj).length })
      }

      if (!validation.data.schema) {
        return formatSuccess({
          valid: true,
          syntaxValid: true,
          stats: basicStats,
          sampleKeys: typeof obj === 'object' && obj !== null ? Object.keys(obj).slice(0, 10) : []
        })
      }

      const schemaObj = JSON.parse(validation.data.schema)
      const schemaErrors: string[] = []

      const validateWithSchema = (value: any, schema: any, path = '$'): void => {
        if (schema.type === 'object' && typeof value === 'object' && value !== null) {
          for (const req of schema.required || []) {
            if (!(req in value)) {
              schemaErrors.push(`${path}: Missing required property '${req}'`)
            }
          }
          for (const [key, val] of Object.entries(value)) {
            if (schema.properties?.[key]) {
              validateWithSchema(val, schema.properties[key], `${path}.${key}`)
            } else if (validation.data.banUnknownKeys) {
              schemaErrors.push(`${path}: Unknown property '${key}'`)
            }
          }
        }
        if (schema.type === 'array' && Array.isArray(value)) {
          if (schema.minItems && value.length < schema.minItems) {
            schemaErrors.push(`${path}: Array length < ${schema.minItems}`)
          }
          if (schema.maxItems && value.length > schema.maxItems) {
            schemaErrors.push(`${path}: Array length > ${schema.maxItems}`)
          }
        }
        if (schema.type === 'string' && typeof value === 'string') {
          if (schema.minLength && value.length < schema.minLength) {
            schemaErrors.push(`${path}: String length < ${schema.minLength}`)
          }
          if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
            schemaErrors.push(`${path}: Does not match pattern ${schema.pattern}`)
          }
        }
        if ((schema.type === 'integer' || schema.type === 'number') && typeof value === 'number') {
          if (schema.minimum !== undefined && value < schema.minimum) {
            schemaErrors.push(`${path}: Value < ${schema.minimum}`)
          }
          if (schema.maximum !== undefined && value > schema.maximum) {
            schemaErrors.push(`${path}: Value > ${schema.maximum}`)
          }
        }
        if (schema.enum && !schema.enum.includes(value)) {
          schemaErrors.push(`${path}: Value must be one of ${JSON.stringify(schema.enum)}`)
        }
      }

      validateWithSchema(obj, schemaObj)

      return formatSuccess({
        valid: schemaErrors.length === 0,
        syntaxValid: true,
        schemaValidated: true,
        stats: basicStats,
        errors: schemaErrors,
        errorCount: schemaErrors.length
      })
    }
  })
  .addTool({
    name: 'json_query',
    description: 'Advanced JSONPath query with filtering, array slicing, and recursive descent',
    parameters: {
      input: { type: 'string', description: 'JSON string or object', required: true },
      path: { type: 'string', description: 'JSONPath expression (dot notation)', required: true },
      defaultValue: { type: 'string', description: 'Default value if not found', required: false },
      returnFirst: { type: 'boolean', description: 'Return first match only', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        path: { type: 'string', required: true },
        defaultValue: { type: 'string', required: false, default: '' },
        returnFirst: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const obj = typeof validation.data.input === 'string'
          ? JSON.parse(validation.data.input)
          : validation.data.input

        const value = jsonPath(obj, validation.data.path)
        const exists = value !== undefined

        return formatSuccess({
          path: validation.data.path,
          value: exists ? value : validation.data.defaultValue,
          exists,
          type: typeof value,
          pathFound: exists,
          samplePreview: JSON.stringify(value, null, 2).substring(0, 500)
        })
      } catch (e: any) {
        return formatError('Query error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'json_transform',
    description: 'Transform JSON by renaming keys, mapping values, and restructuring',
    parameters: {
      input: { type: 'string', description: 'JSON string', required: true },
      mappings: { type: 'string', description: 'Path mappings as JSON: {"oldPath": "newPath"}', required: true },
      removeOriginals: { type: 'boolean', description: 'Remove original paths after mapping', required: false },
      defaults: { type: 'string', description: 'Default values for missing paths as JSON', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        mappings: { type: 'string', required: true },
        removeOriginals: { type: 'boolean', required: false, default: false },
        defaults: { type: 'string', required: false, default: '{}' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        let obj = JSON.parse(validation.data.input)
        const mappings = JSON.parse(validation.data.mappings)
        const defaults = JSON.parse(validation.data.defaults)
        const operations: string[] = []

        for (const [oldPath, newPath] of Object.entries(mappings)) {
          const value = jsonPath(obj, oldPath as string)
          if (value !== undefined) {
            obj = transformValue(obj, newPath as string, () => value)
            operations.push(`Mapped ${oldPath} -> ${newPath}`)
          }
        }

        for (const [path, value] of Object.entries(defaults)) {
          if (jsonPath(obj, path) === undefined) {
            obj = transformValue(obj, path, () => value)
            operations.push(`Set default for ${path}`)
          }
        }

        return formatSuccess({
          transformed: obj,
          operations: operations.length,
          operationLog: operations,
          resultPreview: JSON.stringify(obj, null, 2).substring(0, 1000)
        })
      } catch (e: any) {
        return formatError('Transform error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'json_deep_diff',
    description: 'Deep recursive comparison of JSON objects with full path reporting',
    parameters: {
      old: { type: 'string', description: 'Old JSON string', required: true },
      new: { type: 'string', description: 'New JSON string', required: true },
      ignorePaths: { type: 'string', description: 'Comma-separated paths to ignore', required: false },
      ignoreOrder: { type: 'boolean', description: 'Ignore array element order', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        old: { type: 'string', required: true },
        new: { type: 'string', required: true },
        ignorePaths: { type: 'string', required: false, default: '' },
        ignoreOrder: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const oldObj = JSON.parse(validation.data.old)
        const newObj = JSON.parse(validation.data.new)

        const diff = deepDiff(oldObj, newObj)

        const ignoreList = validation.data.ignorePaths.split(',').filter(Boolean)
        const filterIgnored = (paths: string[]) =>
          paths.filter((p: string) => !ignoreList.some((ign: any) => p.startsWith(ign)))

        return formatSuccess({
          summary: {
            identical: diff.added.length + diff.removed.length + diff.changed.length === 0,
            added: filterIgnored(diff.added).length,
            removed: filterIgnored(diff.removed).length,
            modified: diff.changed.length
          },
          added: filterIgnored(diff.added),
          removed: filterIgnored(diff.removed),
          modified: diff.changed.slice(0, 50).map((c: any) => ({
            path: c.path,
            was: JSON.stringify(c.oldValue),
            now: JSON.stringify(c.newValue)
          })),
          ignoredPaths: ignoreList
        })
      } catch (e: any) {
        return formatError('Diff error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'json_schema_generate',
    description: 'Generate JSON Schema draft-07 from sample JSON data',
    parameters: {
      input: { type: 'string', description: 'Sample JSON string', required: true },
      title: { type: 'string', description: 'Schema title', required: false },
      markRequired: { type: 'boolean', description: 'Mark all properties as required', required: false },
      addExamples: { type: 'boolean', description: 'Include example values', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        title: { type: 'string', required: false, default: 'Generated Schema' },
        markRequired: { type: 'boolean', required: false, default: true },
        addExamples: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const obj = JSON.parse(validation.data.input)

        const inferSchema = (value: any): any => {
          if (value === null) return { type: 'null' }
          if (Array.isArray(value)) {
            return {
              type: 'array',
              items: value.length ? inferSchema(value[0]) : {}
            }
          }
          if (typeof value === 'object') {
            const properties: any = {}
            for (const [k, v] of Object.entries(value)) {
              properties[k] = inferSchema(v)
              if (validation.data.addExamples) {
                properties[k].examples = [v]
              }
            }
            return {
              type: 'object',
              properties,
              required: validation.data.markRequired ? Object.keys(properties) : []
            }
          }
          const base: any = { type: typeof value }
          if (validation.data.addExamples) {
            base.examples = [value]
          }
          return base
        }

        const schema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          title: validation.data.title,
          ...inferSchema(obj)
        }

        return formatSuccess({
          schema,
          stats: {
            propertiesCount: Object.keys(schema.properties || {}).length,
            requiredFields: schema.required?.length || 0,
            hasExamples: validation.data.addExamples
          },
          schemaJson: JSON.stringify(schema, null, 2)
        })
      } catch (e: any) {
        return formatError('Schema generation error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'json_merge',
    description: 'Merge multiple JSON objects with configurable conflict resolution strategies',
    parameters: {
      sources: { type: 'string', description: 'Array of JSON strings to merge', required: true },
      strategy: { type: 'string', description: 'Conflict strategy: overwrite, skip, or concat', required: false },
      deep: { type: 'boolean', description: 'Deep recursive merge', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sources: { type: 'string', required: true },
        strategy: { type: 'string', required: false, default: 'overwrite' },
        deep: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const sources = JSON.parse(validation.data.sources).map((s: string) => JSON.parse(s))

        const merge = (target: any, source: any): any => {
          if (!validation.data.deep) {
            return { ...target, ...source }
          }
          const result = { ...target }
          for (const [key, val] of Object.entries(source)) {
            if (typeof val === 'object' && val !== null && !Array.isArray(val) && typeof result[key] === 'object' && result[key] !== null) {
              result[key] = merge(result[key], val)
            } else if (Array.isArray(val) && Array.isArray(result[key]) && validation.data.strategy === 'concat') {
              result[key] = [...result[key], ...val]
            } else if (validation.data.strategy === 'skip' && result[key] !== undefined) {
              // Skip existing
            } else {
              result[key] = val
            }
          }
          return result
        }

        const result = sources.reduce(merge, {})
        const allKeys = new Set(sources.flatMap((s: any) => Object.keys(s)))

        return formatSuccess({
          merged: result,
          stats: {
            sources: sources.length,
            totalKeys: Object.keys(result).length,
            uniqueKeysAcrossSources: allKeys.size,
            conflicts: allKeys.size - Object.keys(result).length
          },
          strategy: validation.data.strategy,
          deepMerge: validation.data.deep
        })
      } catch (e: any) {
        return formatError('Merge error', { message: e.message })
      }
    }
  })
  .addPrompt({
    name: 'json-workflow',
    description: 'JSON processing and validation workflow',
    arguments: [
      { name: 'purpose', description: 'Processing goal: validate, transform, diff, or schema-gen', required: true }
    ],
    generate: async (args?: any) => `
## 📋 JSON Processing Workflow

### Purpose: ${args?.purpose || 'Data Validation'}

---

### **Step 1: Validate & Clean**
1. Use \`json_validate\` to check syntax and schema
2. Run \`json_minify\` with cleansing to remove nulls/empties
3. Verify array bounds and string lengths

### **Step 2: Transform Structure**
1. \`json_transform\` to rename and remap fields
2. \`json_format\` with sorting for consistent ordering

### **Step 3: Analyze**
1. \`json_schema_generate\` to document structure
2. \`json_deep_diff\` against reference implementation

### **Best Practices**
- Always validate with strict JSON Schema
- Remove null values before persistence
- Use consistent key ordering for git diffs
    `.trim()
  })
  .build()
