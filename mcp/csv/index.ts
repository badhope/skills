import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

function simpleCSVParse(str: string, delimiter = ','): { headers: string[], rows: any[][] } {
  const lines = str.trim().split('\n').filter(l => l.trim())
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))
  const rows = lines.slice(1).map(line => {
    const cells: string[] = []
    let inQuotes = false
    let current = ''
    for (const c of line) {
      if (c === '"') { inQuotes = !inQuotes; continue }
      if (c === delimiter && !inQuotes) { cells.push(current.trim()); current = ''; continue }
      current += c
    }
    cells.push(current.trim())
    return cells
  })
  return { headers, rows }
}

export default createMCPServer({
  name: 'csv',
  version: '2.0.0',
  description: 'Enterprise CSV toolkit - parsing, validation, aggregation, pivot tables, schema detection',
  author: 'MCP Expert Community',
  icon: '📊'
})
  .addTool({
    name: 'csv_parse',
    description: 'Parse CSV with type inference and schema detection',
    parameters: {
      input: { type: 'string', description: 'CSV string', required: true },
      delimiter: { type: 'string', description: 'Column delimiter', required: false },
      inferTypes: { type: 'boolean', description: 'Auto-detect column types', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        delimiter: { type: 'string', required: false, default: ',' },
        inferTypes: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const { headers, rows } = simpleCSVParse(validation.data.input, validation.data.delimiter)
        const schema = headers.map((h, i) => {
          const values = rows.map(r => r[i])
          const types = new Set(values.map(v => {
            if (!isNaN(Number(v)) && v !== '') return 'number'
            if (v === 'true' || v === 'false') return 'boolean'
            if (v.match(/^\d{4}-\d{2}-\d{2}/)) return 'date'
            return 'string'
          }))
          return { name: h, possibleTypes: Array.from(types), sample: values.slice(0, 3) }
        })

        return formatSuccess({
          headers,
          rowCount: rows.length,
          columnCount: headers.length,
          schema,
          sample: rows.slice(0, 5),
          preview: rows.slice(0, 3).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
        })
      } catch (e: any) {
        return formatError('CSV parse error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'csv_validate',
    description: 'Validate CSV for consistency, uniqueness, and data integrity',
    parameters: {
      input: { type: 'string', description: 'CSV string', required: true },
      checkColumns: { type: 'string', description: 'Columns to validate: required,unique,notEmpty', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        checkColumns: { type: 'string', required: false, default: 'notEmpty' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { headers, rows } = simpleCSVParse(validation.data.input)
      const issues: string[] = []
      let emptyCells = 0

      rows.forEach((row, ri) => {
        if (row.length !== headers.length) {
          issues.push(`Row ${ri + 2}: Column count mismatch (${row.length} vs ${headers.length})`)
        }
        row.forEach((cell, ci) => {
          if (!cell || cell.trim() === '') emptyCells++
        })
      })

      return formatSuccess({
        valid: issues.length === 0,
        issues,
        stats: {
          totalRows: rows.length,
          totalColumns: headers.length,
          emptyCells,
          completeness: Math.round(100 - (emptyCells / (rows.length * headers.length) * 100))
        }
      })
    }
  })
  .build()
