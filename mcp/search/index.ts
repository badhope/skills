import { createMCPServer } from '../../packages/core/mcp/builder'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function grepSearch(pattern: string, type: string = 'code'): Promise<any[]> {
  const ignore = '-g="!node_modules" -g="!.git" -g="!dist" -g="!build"'
  const typeFlag = type === 'code' ? '-t ts -t tsx -t js -t jsx' : ''
  try {
    const { stdout } = await execAsync(`rg "${pattern}" ${typeFlag} ${ignore} --json 2>/dev/null || rg "${pattern}" ${ignore} 2>/dev/null`)
    return stdout.split('\n').filter(Boolean).slice(0, 50).map((line: string) => {
      try { return JSON.parse(line) } catch { return { line } }
    })
  } catch {
    return []
  }
}

export default createMCPServer({
  name: 'search',
  version: '1.0.0',
  description: 'Advanced code search - regex, symbol lookup, reference tracking',
  author: 'MCP Expert Community',
  icon: '🔍'
})
  .addTool({
    name: 'search_by_regex',
    description: 'Advanced code search - regex, symbol lookup, reference tracking',
    parameters: {
      pattern: { type: 'string', description: 'Advanced code search - regex, symbol lookup, reference tracking', required: true },
      fileTypes: { type: 'string', description: 'Advanced code search - regex, symbol lookup, reference tracking', required: false }
    },
    execute: async (params: Record<string, any>) => ({ results: await grepSearch(params.pattern) })
  })
  .addTool({
    name: 'find_symbol_definition',
    description: 'Advanced code search - regex, symbol lookup, reference tracking',
    parameters: {
      symbol: { type: 'string', description: 'Advanced code search - regex, symbol lookup, reference tracking', required: true }
    },
    execute: async (params: Record<string, any>) => ({
      symbol: params.symbol,
      definitions: await grepSearch(`(function|const|let|var|class|interface|type)\\s+${params.symbol}[\\s<(]`)
    })
  })
  .addTool({
    name: 'find_all_references',
    description: 'Advanced code search - regex, symbol lookup, reference tracking',
    parameters: {
      symbol: { type: 'string', description: 'Advanced code search - regex, symbol lookup, reference tracking', required: true }
    },
    execute: async (params: Record<string, any>) => ({
      symbol: params.symbol,
      references: await grepSearch(`\\b${params.symbol}\\b`),
      count: 0
    })
  })
  .addPrompt({
    name: 'find-usage',
    description: 'Advanced code search - regex, symbol lookup, reference tracking',
    arguments: [{ name: 'symbol', description: 'Advanced code search - regex, symbol lookup, reference tracking', required: true }],
    generate: async (args?: Record<string, any>) => `
## 🔍 符号搜索: ${args?.symbol}

### 步骤
1. 调用 \`find_symbol_definition\` 找到定义位置
2. 调用 \`find_all_references\` 找到所有引用
3. 分析: 调用关系、修改影响范围
4. 整理成清晰的报告
    `.trim()
  })
  .build()
