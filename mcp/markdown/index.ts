import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

export default createMCPServer({
  name: 'markdown',
  version: '2.0.0',
  description: 'Markdown toolkit - tables, TOC generation, mermaid diagrams, badges, alerts, and documentation generation',
  author: 'MCP Expert Community',
  icon: '📄'
})
  .addTool({
    name: 'md_table',
    description: 'Generate advanced Markdown tables with alignment and formatting',
    parameters: {
      headers: { type: 'array', description: 'Header names', required: true },
      rows: { type: 'array', description: 'Data rows', required: true },
      align: { type: 'string', description: 'Alignment per column', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        headers: { type: 'array', required: true },
        rows: { type: 'array', required: true },
        align: { type: 'string', required: false, default: 'left' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const sep: Record<string, string> = { left: ':---', center: ':---:', right: '---:' }
      const alignments = validation.data.align.split(',').map((a: string) => a.trim())
      const headerRow = `| ${validation.data.headers.join(' | ')} |`
      const separatorRow = `| ${validation.data.headers.map((_: any, i: any) => sep[alignments[i] || validation.data.align] || sep.left).join(' | ')} |`
      const dataRows = validation.data.rows.map((row: any[]) => `| ${row.map(cell => String(cell).replace(/\|/g, '\\|')).join(' | ')} |`)

      return formatSuccess({
        table: [headerRow, separatorRow, ...dataRows].join('\n'),
        stats: { columns: validation.data.headers.length, rows: validation.data.rows.length }
      })
    }
  })
  .addTool({
    name: 'md_toc',
    description: 'Generate table of contents with proper slug links',
    parameters: {
      content: { type: 'string', description: 'Markdown content', required: true },
      maxLevel: { type: 'number', description: 'Max heading level', required: false },
      numbered: { type: 'boolean', description: 'Numbered list', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        content: { type: 'string', required: true },
        maxLevel: { type: 'number', required: false, default: 3 },
        numbered: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const regex = /^(#{1,6})\s+(.+)$/gm
      const toc: string[] = []
      let match
      let counters = [0, 0, 0, 0, 0, 0]

      while ((match = regex.exec(validation.data.content)) !== null) {
        const level = match[1].length
        if (level <= validation.data.maxLevel) {
          const indent = '  '.repeat(level - 1)
          const text = match[2].trim()
          const link = slugify(text)
          const marker = validation.data.numbered ? `${++counters[level]}.` : '-'
          toc.push(`${indent}${marker} [${text}](#${link})`)
        }
      }

      return formatSuccess({ toc: toc.join('\n'), count: toc.length })
    }
  })
  .addTool({
    name: 'md_mermaid',
    description: 'Generate Mermaid diagrams',
    parameters: {
      type: { type: 'string', description: 'Diagram type: flow, sequence, class, gantt, pie', required: true },
      items: { type: 'array', description: 'Diagram items', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true },
        items: { type: 'array', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let diagram = ''
      switch (validation.data.type) {
        case 'flow':
          diagram = '```mermaid\nflowchart LR\n'
          for (const item of validation.data.items) {
            diagram += `  ${item}\n`
          }
          diagram += '```'
          break
        case 'sequence':
          diagram = '```mermaid\nsequenceDiagram\n'
          for (const item of validation.data.items) {
            diagram += `  ${item}\n`
          }
          diagram += '```'
          break
        case 'pie':
          diagram = '```mermaid\npie title Dataset\n'
          for (const item of validation.data.items) {
            diagram += `  "${item.name}" : ${item.value}\n`
          }
          diagram += '```'
          break
      }

      return formatSuccess({ diagram })
    }
  })
  .build()
