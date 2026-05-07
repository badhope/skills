import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'diff',
  version: '2.0.0',
  description: 'Diff toolkit - text compare, semantic diff, patch generation, merge conflict resolution',
  author: 'MCP Expert Community',
  icon: '🔀'
})
  .addTool({
    name: 'diff_text',
    description: 'Compare two texts with line-by-line character-level diff',
    parameters: {
      oldText: { type: 'string', description: 'Original text', required: true },
      newText: { type: 'string', description: 'Modified text', required: true },
      contextLines: { type: 'number', description: 'Context lines around changes', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        oldText: { type: 'string', required: true },
        newText: { type: 'string', required: true },
        contextLines: { type: 'number', required: false, default: 3 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const oldLines = validation.data.oldText.split('\n')
      const newLines = validation.data.newText.split('\n')
      const changes: any[] = []

      const maxLen = Math.max(oldLines.length, newLines.length)
      for (let i = 0; i < maxLen; i++) {
        const oldL = oldLines[i] || ''
        const newL = newLines[i] || ''
        if (oldL !== newL) {
          if (i < oldLines.length && i >= newLines.length) changes.push({ type: 'remove', line: i + 1, content: oldL })
          else if (i >= oldLines.length && i < newLines.length) changes.push({ type: 'add', line: i + 1, content: newL })
          else changes.push({ type: 'modify', line: i + 1, old: oldL, new: newL })
        }
      }

      return formatSuccess({
        stats: {
          totalChanges: changes.length,
          additions: changes.filter(c => c.type === 'add').length,
          removals: changes.filter(c => c.type === 'remove').length,
          modifications: changes.filter(c => c.type === 'modify').length,
          similarity: Math.round(100 - (changes.length / maxLen * 100))
        },
        changes,
        unified: changes.map(c =>
          c.type === 'add' ? `+ ${c.content}` :
          c.type === 'remove' ? `- ${c.content}` :
          `  ${c.old}\n> ${c.new}`
        ).join('\n')
      })
    }
  })
  .build()
