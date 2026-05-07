import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function safeExecCommand(cmd: string, options: any = {}): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 60000, ...options })
    return String(stdout || '').trim()
  } catch (e: any) {
    return String(e.stdout || e.stderr || e.message || '').trim()
  }
}

interface CodeChunk {
  id: string
  filePath: string
  type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'module'
  name: string
  startLine: number
  endLine: number
  content: string
  signature: string
  imports: string[]
  exports: string[]
  calls: string[]
  calledBy: string[]
  dependencies: string[]
  dependents: string[]
  embedding?: number[]
  hash: string
  lastModified: number
}

interface RAGIndex {
  version: string
  projectRoot: string
  lastIndexed: number
  chunks: Map<string, CodeChunk>
  fileHashMap: Map<string, string>
  callGraph: Map<string, string[]>
  reverseCallGraph: Map<string, string[]>
}

const RAG_STORAGE_DIR = path.join(process.cwd(), '.agent-code-rag')

async function initRAGStorage() {
  await fs.mkdir(RAG_STORAGE_DIR, { recursive: true })
}

function generateChunkId(filePath: string, name: string, type: string): string {
  return crypto.createHash('md5').update(`${filePath}:${type}:${name}`).digest('hex').substring(0, 16)
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function loadIndex(): Promise<RAGIndex> {
  const indexPath = path.join(RAG_STORAGE_DIR, 'index.json')
  try {
    const data = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      ...parsed,
      chunks: new Map(Object.entries(parsed.chunks || {})),
      fileHashMap: new Map(Object.entries(parsed.fileHashMap || {})),
      callGraph: new Map(Object.entries(parsed.callGraph || {})),
      reverseCallGraph: new Map(Object.entries(parsed.reverseCallGraph || {}))
    }
  } catch {
    return {
      version: '2.0.0',
      projectRoot: process.cwd(),
      lastIndexed: 0,
      chunks: new Map(),
      fileHashMap: new Map(),
      callGraph: new Map(),
      reverseCallGraph: new Map()
    }
  }
}

async function saveIndex(index: RAGIndex) {
  const indexPath = path.join(RAG_STORAGE_DIR, 'index.json')
  await fs.writeFile(indexPath, JSON.stringify({
    ...index,
    chunks: Object.fromEntries(index.chunks),
    fileHashMap: Object.fromEntries(index.fileHashMap),
    callGraph: Object.fromEntries(index.callGraph),
    reverseCallGraph: Object.fromEntries(index.reverseCallGraph)
  }, null, 2))
}

async function getSourceFiles(root: string, extensions: string[] = ['ts', 'tsx', 'js', 'jsx']): Promise<string[]> {
  const extPattern = extensions.map(e => `-name "*.${e}"`).join(' -o ')
  try {
    const result = await safeExecCommand(
      `npx fast-glob "**/*.{${extensions.join(',')}}" --ignore "node_modules/**" --ignore "dist/**" --ignore "**/*.d.ts"`,
      { cwd: root, timeout: 30000 }
    )
    return result.split('\n').filter(Boolean).slice(0, 1000).map(f => path.join(root, f))
  } catch {
    return []
  }
}

async function extractSymbols(filePath: string, content: string): Promise<CodeChunk[]> {
  const chunks: CodeChunk[] = []
  const lines = content.split('\n')
  
  const patterns = [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm, type: 'function' as const },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\s*\([^)]*\)\s*[=:>]/gm, type: 'function' as const },
    { regex: /^(?:export\s+)?class\s+(\w+)/gm, type: 'class' as const },
    { regex: /^(?:export\s+)?interface\s+(\w+)/gm, type: 'interface' as const },
    { regex: /^(?:export\s+)?type\s+(\w+)\s*=/gm, type: 'type' as const },
    { regex: /^(?:export\s+)?const\s+(\w+)\s*:/gm, type: 'constant' as const }
  ]

  for (const { regex, type } of patterns) {
    let match
    while ((match = regex.exec(content)) !== null) {
      const name = match[1]
      const startLine = content.substring(0, match.index).split('\n').length
      
      let endLine = startLine
      let braceCount = 0
      let foundBrace = false
      let parenCount = 0
      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('{')) {
          braceCount += (line.match(/\{/g) || []).length
          foundBrace = true
        }
        if (line.includes('}')) {
          braceCount -= (line.match(/\}/g) || []).length
        }
        if (line.includes('(')) parenCount += (line.match(/\(/g) || []).length
        if (line.includes(')')) parenCount -= (line.match(/\)/g) || []).length
        if (foundBrace && braceCount === 0 && parenCount === 0) {
          endLine = i + 1
          break
        }
      }
      endLine = Math.min(endLine, startLine + 100)
      
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n')
      const calls: string[] = []
      const callRegex = /(\w+)\s*\(/g
      let callMatch
      while ((callMatch = callRegex.exec(chunkContent)) !== null) {
        if (!['if', 'for', 'while', 'switch', 'try', 'catch', 'await', 'return', 'new', 'throw'].includes(callMatch[1])) {
          calls.push(callMatch[1])
        }
      }

      chunks.push({
        id: generateChunkId(filePath, name, type),
        filePath,
        type,
        name,
        startLine,
        endLine,
        content: chunkContent,
        signature: lines[startLine - 1]?.trim() || name,
        imports: [],
        exports: [],
        calls: Array.from(new Set(calls)),
        calledBy: [],
        dependencies: [],
        dependents: [],
        hash: hashContent(chunkContent),
        lastModified: Date.now()
      })
    }
  }

  return chunks
}

function buildCallGraph(index: RAGIndex) {
  const nameToId = new Map<string, string[]>()
  for (const [id, chunk] of Array.from(index.chunks.entries())) {
    const existing = nameToId.get(chunk.name) || []
    existing.push(id)
    nameToId.set(chunk.name, existing)
  }

  for (const [callerId, caller] of Array.from(index.chunks.entries())) {
    for (const calleeName of caller.calls) {
      const calleeIds = nameToId.get(calleeName) || []
      for (const calleeId of calleeIds) {
        if (calleeId !== callerId) {
          const existing = index.callGraph.get(callerId) || []
          if (!existing.includes(calleeId)) existing.push(calleeId)
          index.callGraph.set(callerId, existing)

          const reverse = index.reverseCallGraph.get(calleeId) || []
          if (!reverse.includes(callerId)) reverse.push(callerId)
          index.reverseCallGraph.set(calleeId, reverse)
        }
      }
    }
  }
}

function simpleVector(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean)
  const vector: number[] = Array(32).fill(0)
  words.forEach((word) => {
    const hash = word.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    vector[hash % 32] += 1 / (1 + Math.log(words.length))
  })
  const mag = Math.sqrt(vector.reduce((a, v) => a + v * v, 0)) || 1
  return vector.map(v => v / mag)
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  return magA * magB > 0 ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0
}

function searchChunks(index: RAGIndex, query: string, limit: number = 10): CodeChunk[] {
  const queryLower = query.toLowerCase()
  const queryVec = simpleVector(query)
  const scored: { chunk: CodeChunk, score: number }[] = []

  for (const [_, chunk] of Array.from(index.chunks.entries())) {
    let score = 0
    const contentLower = chunk.content.toLowerCase()
    const nameLower = chunk.name.toLowerCase()

    if (nameLower.includes(queryLower)) score += 50
    if (nameLower === queryLower) score += 100
    if (contentLower.includes(queryLower)) score += 20
    score += cosineSimilarity(queryVec, simpleVector(chunk.content)) * 50
    score += (index.reverseCallGraph.get(chunk.id)?.length || 0) * 3
    score += (chunk.calls.length || 0) * 1
    if (chunk.type === 'class') score += 10
    if (chunk.type === 'function') score += 5

    scored.push({ chunk, score })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.chunk)
}

function getImpactChain(index: RAGIndex, chunkId: string, maxDepth: number = 3): string[] {
  const visited = new Set<string>()
  const queue: { id: string, depth: number }[] = [{ id: chunkId, depth: 0 }]

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (visited.has(id) || depth > maxDepth) continue
    visited.add(id)

    const dependents = index.reverseCallGraph.get(id) || []
    for (const dep of dependents) {
      queue.push({ id: dep, depth: depth + 1 })
    }
  }

  return Array.from(visited)
}

const VALID_TYPES = ['function', 'class', 'interface', 'type', 'constant']

export default createMCPServer({
  name: 'code-rag',
  version: '2.0.0',
  description: 'Enterprise Code RAG System - Intelligent semantic indexing, call graph analysis, cross-file dependency tracking, and automated architecture visualization for modern codebases',
  icon: '🧠',
  author: 'MCP Expert Community'
})
  .withCache(300)

  .addTool({
    name: 'rag_index_build',
    description: 'Build semantic code index - scan project, extract symbols, construct call graph',
    parameters: {
      rootDir: { type: 'string', description: 'Project root directory (default: current working directory)', required: false },
      incremental: { type: 'boolean', description: 'Incremental indexing - only process changed files', required: false },
      maxFiles: { type: 'number', description: 'Maximum files to index (default: 500)', required: false },
      extensions: { type: 'string', description: 'Comma-separated file extensions (default: ts,tsx,js,jsx)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        rootDir: { type: 'string', required: false, default: process.cwd() },
        incremental: { type: 'boolean', required: false, default: true },
        maxFiles: { type: 'number', required: false, default: 500 },
        extensions: { type: 'string', required: false, default: 'ts,tsx,js,jsx' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      await initRAGStorage()
      const index = await loadIndex()
      const rootDir = validation.data.rootDir
      const extensions = validation.data.extensions.split(',').map((e: string) => e.trim())

      const startTime = Date.now()
      const files = await getSourceFiles(rootDir, extensions)
      const filesToProcess = files.slice(0, validation.data.maxFiles)

      let newChunks = 0
      let updatedChunks = 0
      let skippedChunks = 0
      const errors: string[] = []

      for (const file of filesToProcess) {
        try {
          const stats = await fs.stat(file)
          const fileHash = `${stats.mtimeMs}-${stats.size}`
          
          if (validation.data.incremental && index.fileHashMap.get(file) === fileHash) {
            skippedChunks++
            continue
          }

          const content = await fs.readFile(file, 'utf-8')
          const chunks = await extractSymbols(file, content)
          
          for (const chunk of chunks) {
            const existing = index.chunks.get(chunk.id)
            if (!existing) {
              newChunks++
            } else if (existing.hash !== chunk.hash) {
              updatedChunks++
            } else {
              skippedChunks++
              continue
            }
            index.chunks.set(chunk.id, chunk)
          }

          index.fileHashMap.set(file, fileHash)
        } catch (e: any) {
          errors.push(`${path.basename(file)}: ${e.message}`)
        }
      }

      buildCallGraph(index)
      index.lastIndexed = Date.now()
      await saveIndex(index)

      const durationMs = Date.now() - startTime
      const totalCallEdges = Array.from(index.callGraph.values()).reduce((a, b) => a + b.length, 0)

      return formatSuccess({
        indexed: true,
        projectRoot: rootDir,
        durationMs,
        durationReadable: `${Math.round(durationMs / 1000)}s`,
        filesScanned: filesToProcess.length,
        totalSymbolsIndexed: index.chunks.size,
        newSymbols: newChunks,
        updatedSymbols: updatedChunks,
        skippedUnchanged: skippedChunks,
        functions: Array.from(index.chunks.values()).filter(c => c.type === 'function').length,
        classes: Array.from(index.chunks.values()).filter(c => c.type === 'class').length,
        interfaces: Array.from(index.chunks.values()).filter(c => c.type === 'interface').length,
        callGraphConnections: totalCallEdges,
        errors: errors.slice(0, 5),
        summary: `✨ Index complete: ${index.chunks.size} symbols, ${totalCallEdges} call graph connections`
      })
    }
  })

  .addTool({
    name: 'rag_search',
    description: 'Semantic code search - hybrid keyword + vector similarity search',
    parameters: {
      query: { type: 'string', description: 'Search query: function names, descriptions, patterns', required: true },
      type: { type: 'string', description: 'Filter by type: function, class, interface, type, constant', required: false },
      filePath: { type: 'string', description: 'Filter by file path containing this string', required: false },
      limit: { type: 'number', description: 'Number of results (default: 10)', required: false },
      includeCallContext: { type: 'boolean', description: 'Include caller and callee context', required: false },
      includeFullCode: { type: 'boolean', description: 'Include full source code', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        query: { type: 'string', required: true },
        type: { type: 'string', required: false },
        filePath: { type: 'string', required: false },
        limit: { type: 'number', required: false, default: 10 },
        includeCallContext: { type: 'boolean', required: false, default: false },
        includeFullCode: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await loadIndex()

      if (index.chunks.size === 0) {
        return formatError('Empty index', 'Please run rag_index_build first to create the code index')
      }

      if (validation.data.type && !VALID_TYPES.includes(validation.data.type)) {
        return formatError('Invalid type', `Type must be one of: ${VALID_TYPES.join(', ')}`)
      }

      let results = searchChunks(index, validation.data.query, validation.data.limit * 2)

      if (validation.data.type) {
        results = results.filter(r => r.type === validation.data.type)
      }
      if (validation.data.filePath) {
        results = results.filter(r => r.filePath.toLowerCase().includes(validation.data.filePath.toLowerCase()))
      }

      results = results.slice(0, validation.data.limit)

      const enriched = results.map(chunk => {
        const callerIds = index.reverseCallGraph.get(chunk.id) || []
        const calleeIds = index.callGraph.get(chunk.id) || []

        const result: any = {
          id: chunk.id,
          name: chunk.name,
          type: chunk.type,
          file: path.relative(process.cwd(), chunk.filePath),
          lineRange: `${chunk.startLine}-${chunk.endLine}`,
          signature: chunk.signature.substring(0, 200)
        }

        if (validation.data.includeFullCode) {
          result.fullSource = chunk.content
        } else {
          result.codePreview = chunk.content.substring(0, 600) + (chunk.content.length > 600 ? '...' : '')
        }

        if (validation.data.includeCallContext) {
          result.callerCount = callerIds.length
          result.calleeCount = calleeIds.length
          result.callers = callerIds.slice(0, 5).map(id => {
            const c = index.chunks.get(id)
            return c ? `${c.name} (${path.basename(c.filePath)})` : id
          })
          result.calls = calleeIds.slice(0, 5).map(id => {
            const c = index.chunks.get(id)
            return c ? c.name : id
          })
        }

        return result
      })

      return formatSuccess({
        searchComplete: true,
        query: validation.data.query,
        totalIndexed: index.chunks.size,
        resultsFound: results.length,
        results: enriched
      })
    }
  })

  .addTool({
    name: 'rag_impact_analysis',
    description: 'Change impact analysis - discover all code affected by modifying a function or class',
    parameters: {
      symbolName: { type: 'string', description: 'Name of function or class to analyze', required: true },
      maxDepth: { type: 'number', description: 'Maximum traversal depth (default: 3)', required: false },
      generateMermaid: { type: 'boolean', description: 'Generate Mermaid graph visualization', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        symbolName: { type: 'string', required: true },
        maxDepth: { type: 'number', required: false, default: 3 },
        generateMermaid: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await loadIndex()
      if (index.chunks.size === 0) {
        return formatError('Empty index', 'Please run rag_index_build first')
      }

      const targetChunks = searchChunks(index, validation.data.symbolName, 5)
      if (targetChunks.length === 0) {
        return formatError('Symbol not found', `No matches found for: ${validation.data.symbolName}`)
      }

      const target = targetChunks[0]
      const chainIds = getImpactChain(index, target.id, validation.data.maxDepth)
      const impacted = chainIds.map(id => index.chunks.get(id)).filter(Boolean) as CodeChunk[]

      const groupedByFile = impacted.reduce((acc: any, chunk) => {
        const file = path.relative(process.cwd(), chunk.filePath)
        if (!acc[file]) acc[file] = []
        acc[file].push({
          name: chunk.name,
          type: chunk.type,
          lines: `${chunk.startLine}-${chunk.endLine}`
        })
        return acc
      }, {})

      let mermaid = ''
      if (validation.data.generateMermaid) {
        mermaid = 'graph LR\n'
        mermaid += `  style T fill:#ff6b6b,stroke:#333,stroke-width:2px\n`
        mermaid += `  T[${target.name}\\n💥 MODIFIED] -->|impacts| RESULT\n`
        const uniqueNodes = new Set<string>()
        for (const id of chainIds) {
          const chunk = index.chunks.get(id)
          if (chunk && !uniqueNodes.has(chunk.name)) {
            uniqueNodes.add(chunk.name)
            mermaid += `  ${chunk.name}[${chunk.name}\\n${chunk.type}]\n`
          }
        }
        for (const id of chainIds) {
          const chunk = index.chunks.get(id)
          if (chunk) {
            const callers = index.reverseCallGraph.get(id) || []
            for (const callerId of callers) {
              const caller = index.chunks.get(callerId)
              if (caller && chainIds.includes(callerId) && caller.name !== chunk.name) {
                mermaid += `  ${caller.name} -->|calls| ${chunk.name}\n`
              }
            }
          }
        }
      }

      const riskLevel = impacted.length > 50 ? 'HIGH' : impacted.length > 20 ? 'MEDIUM' : 'LOW'

      return formatSuccess({
        analyzed: true,
        targetSymbol: {
          name: target.name,
          type: target.type,
          file: path.relative(process.cwd(), target.filePath),
          lines: `${target.startLine}-${target.endLine}`
        },
        analysisDepth: validation.data.maxDepth,
        totalImpactedSymbols: impacted.length,
        filesAffected: Object.keys(groupedByFile).length,
        riskLevel,
        groupedByFile,
        impactChainMermaid: mermaid,
        warning: impacted.length > 50 ? '⚠️ HIGH RISK: This change ripples through 50+ locations - thorough testing required' : 
                 impacted.length > 20 ? '⚠️ MEDIUM RISK: Significant impact area' : '✅ LOW RISK: Manageable change scope',
        recommendation: `Review the ${impacted.length} affected symbols across ${Object.keys(groupedByFile).length} files`
      })
    }
  })

  .addTool({
    name: 'rag_call_chain',
    description: 'Call chain discovery - find all paths from entry points to a target function',
    parameters: {
      targetName: { type: 'string', description: 'Target function name', required: true },
      entryPoints: { type: 'string', description: 'Comma-separated entry point names (e.g., handler,main)', required: false },
      maxDepth: { type: 'number', description: 'Maximum search depth (default: 10)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        targetName: { type: 'string', required: true },
        entryPoints: { type: 'string', required: false, default: 'handler,main,default,execute,run,start' },
        maxDepth: { type: 'number', required: false, default: 10 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await loadIndex()
      if (index.chunks.size === 0) {
        return formatError('Empty index', 'Please run rag_index_build first')
      }

      const targets = searchChunks(index, validation.data.targetName, 3)
      if (targets.length === 0) {
        return formatError('Target not found', `No symbol matching: ${validation.data.targetName}`)
      }

      const entryNames = validation.data.entryPoints.split(',').map((s: string) => s.trim())
      
      const paths: string[][] = []
      const seenPaths = new Set<string>()

      for (const target of targets) {
        for (const entryName of entryNames) {
          const entries = searchChunks(index, entryName, 5)
          
          for (const entry of entries) {
            const visited = new Set<string>()
            const queue: { id: string, path: string[] }[] = [{ id: entry.id, path: [entry.name] }]

            while (queue.length > 0) {
              const { id, path } = queue.shift()!
              const pathKey = path.join('→')
              if (visited.has(id) || path.length > validation.data.maxDepth || seenPaths.has(pathKey)) continue
              
              visited.add(id)
              seenPaths.add(pathKey)

              if (id === target.id) {
                paths.push(path)
                break
              }

              const callees = index.callGraph.get(id) || []
              for (const calleeId of callees) {
                const callee = index.chunks.get(calleeId)
                if (callee) {
                  queue.push({ id: calleeId, path: [...path, callee.name] })
                }
              }
            }
          }
        }
      }

      paths.sort((a, b) => a.length - b.length)

      return formatSuccess({
        traced: true,
        target: validation.data.targetName,
        totalPathsFound: paths.length,
        shortestPath: paths.length > 0 ? paths[0].join(' → ') : null,
        longestPath: paths.length > 0 ? paths[paths.length - 1].join(' → ') : null,
        callChains: paths.slice(0, 10).map((p, i) => ({
          rank: i + 1,
          length: p.length,
          chain: p.join(' → ')
        })),
        pathCountByLength: paths.length > 0 ? {
          direct: paths.filter(p => p.length <= 3).length,
          medium: paths.filter(p => p.length > 3 && p.length <= 6).length,
          deep: paths.filter(p => p.length > 6).length
        } : null,
        message: paths.length > 0 ? `Found ${paths.length} execution paths` : 'No execution paths found between entry points and target'
      })
    }
  })

  .addTool({
    name: 'rag_architecture',
    description: 'Auto-generate architecture visualization - module dependency Mermaid graphs',
    parameters: {
      level: { type: 'string', description: 'Granularity: file, folder, module, symbol', required: false },
      includeExternal: { type: 'boolean', description: 'Include external dependencies', required: false },
      minConnections: { type: 'number', description: 'Filter by minimum connections', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        level: { type: 'string', required: false, default: 'module' },
        includeExternal: { type: 'boolean', required: false, default: false },
        minConnections: { type: 'number', required: false, default: 1 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await loadIndex()
      if (index.chunks.size === 0) {
        return formatError('Empty index', 'Please run rag_index_build first')
      }

      const modules: Map<string, Set<string>> = new Map()
      const deps: Map<string, Map<string, number>> = new Map()

      for (const [id, chunk] of Array.from(index.chunks.entries())) {
        let key: string
        const relPath = path.relative(process.cwd(), chunk.filePath)
        
        if (validation.data.level === 'folder') {
          key = relPath.split(path.sep)[0] || 'root'
        } else if (validation.data.level === 'module') {
          key = relPath.split(path.sep).slice(0, 2).join('/') || path.basename(relPath)
        } else if (validation.data.level === 'symbol') {
          key = chunk.name
        } else {
          key = relPath
        }

        key = key.replace(/\.[^.]+$/, '')

        if (!modules.has(key)) modules.set(key, new Set())
        modules.get(key)!.add(chunk.name)

        const callees = index.callGraph.get(id) || []
        for (const calleeId of callees) {
          const callee = index.chunks.get(calleeId)
          if (callee) {
            const calleeRelPath = path.relative(process.cwd(), callee.filePath)
            let calleeKey: string
            if (validation.data.level === 'folder') {
              calleeKey = calleeRelPath.split(path.sep)[0] || 'root'
            } else if (validation.data.level === 'module') {
              calleeKey = calleeRelPath.split(path.sep).slice(0, 2).join('/') || path.basename(calleeRelPath)
            } else if (validation.data.level === 'symbol') {
              calleeKey = callee.name
            } else {
              calleeKey = calleeRelPath
            }
            calleeKey = calleeKey.replace(/\.[^.]+$/, '')

            if (key !== calleeKey) {
              if (!deps.has(key)) deps.set(key, new Map())
              const targetMap = deps.get(key)!
              targetMap.set(calleeKey, (targetMap.get(calleeKey) || 0) + 1)
            }
          }
        }
      }

      for (const [source, targets] of Array.from(deps.entries())) {
        for (const [target, count] of Array.from(targets.entries())) {
          if (count < validation.data.minConnections) {
            targets.delete(target)
          }
        }
        if (targets.size === 0) deps.delete(source)
      }

      let mermaid = 'graph TB\n'
      mermaid += '  classDef module fill:#e3f2fd,stroke:#2196f3,stroke-width:2px\n'
      mermaid += '  classDef core fill:#c8e6c9,stroke:#4caf50,stroke-width:2px\n'
      
      const moduleList = Array.from(modules.keys())
      for (const mod of moduleList.slice(0, 30)) {
        const size = modules.get(mod)?.size || 0
        const isCore = size > 10 ? ',stroke-width:3px' : ''
        mermaid += `  ${mod.replace(/[^a-zA-Z0-9]/g, '_')}["${mod}\\n(${size} symbols)"]:::${isCore ? 'core' : 'module'}\n`
      }

      for (const [source, targets] of Array.from(deps.entries())) {
        for (const [target, count] of Array.from(targets.entries())) {
          const sourceId = source.replace(/[^a-zA-Z0-9]/g, '_')
          const targetId = target.replace(/[^a-zA-Z0-9]/g, '_')
          const style = count > 5 ? 'stroke-width:2px' : ''
          mermaid += `  ${sourceId} -- "${count}" ${style} --> ${targetId}\n`
        }
      }

      const architectureStats = {
        modules: modules.size,
        connections: Array.from(deps.values()).reduce((a, m) => a + m.size, 0),
        avgDepsPerModule: (Array.from(deps.values()).reduce((a, m) => a + m.size, 0) / modules.size).toFixed(1)
      }

      return formatSuccess({
        architectureGenerated: true,
        granularity: validation.data.level,
        stats: architectureStats,
        moduleCount: modules.size,
        dependencyConnections: architectureStats.connections,
        mermaidDiagram: mermaid,
        topModules: Array.from(modules.entries())
          .sort((a, b) => b[1].size - a[1].size)
          .slice(0, 10)
          .map(([name, symbols]) => ({ name, symbolCount: symbols.size }))
      })
    }
  })

  .addTool({
    name: 'rag_status',
    description: 'RAG index status and statistics',
    parameters: {},
    execute: async () => {
      const index = await loadIndex()
      
      const typeBreakdown: any = {}
      for (const type of VALID_TYPES) {
        typeBreakdown[type] = Array.from(index.chunks.values()).filter(c => c.type === type).length
      }

      const fileCounts = new Map<string, number>()
      for (const [_, chunk] of Array.from(index.chunks.entries())) {
        const file = path.relative(process.cwd(), chunk.filePath)
        fileCounts.set(file, (fileCounts.get(file) || 0) + 1)
      }

      return formatSuccess({
        indexVersion: index.version,
        indexStatus: index.chunks.size > 0 ? '✅ Ready' : '⚠️ Empty',
        lastIndexed: new Date(index.lastIndexed).toLocaleString(),
        projectRoot: path.relative(process.cwd(), index.projectRoot) || '.',
        totalSymbols: index.chunks.size,
        totalFiles: fileCounts.size,
        typeBreakdown,
        topFiles: Array.from(fileCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([file, count]) => ({ file, symbols: count })),
        callGraphStats: {
          totalConnections: Array.from(index.callGraph.values()).reduce((a, b) => a + b.length, 0),
          avgOutDegree: (Array.from(index.callGraph.values()).reduce((a, b) => a + b.length, 0) / Math.max(1, index.chunks.size)).toFixed(1)
        },
        storageLocation: RAG_STORAGE_DIR,
        recommendation: index.chunks.size === 0 ? 'Run rag_index_build to analyze your codebase' :
                        index.chunks.size < 10 ? 'Index built but small - consider larger project scope' :
                        'Index ready for semantic search and analysis'
      })
    }
  })

  .addResource({
    name: 'code-rag-best-practices',
    uri: 'docs://code-rag/best-practices',
    description: 'Code RAG Best Practices Guide',
    mimeType: 'text/markdown',
    get: async () => `
## 🧠 Code RAG 最佳实践指南

### 📋 典型工作流

1. **构建索引**
\`\`\`
rag_index_build
  incremental: true
  maxFiles: 1000
\`\`\`

2. **探索代码库**
\`\`\`
rag_search
  query: "authentication"
  type: "function"
  includeCallContext: true
\`\`\`

3. **修改前影响分析**
\`\`\`
rag_impact_analysis
  symbolName: "validateUser"
  maxDepth: 4
  generateMermaid: true
\`\`\`

4. **架构可视化**
\`\`\`
rag_architecture
  level: "module"
  minConnections: 2
\`\`\`

---

### 💡 高级技巧

#### 重构前必备
1. 先运行 **rag_impact_analysis** 理解改动范围
2. 用 **rag_call_chain** 找出所有测试入口
3. 用 **rag_architecture** 记录重构前架构

#### Code Review 辅助
1. rag_search 找类似实现做对比
2. rag_impact_analysis 评估 PR 影响范围
3. call_chain 验证数据流正确性

#### 新人上手
1. rag_architecture 快速理解系统结构
2. rag_call_chain 追踪关键数据流
3. 按文件重要性排序阅读

---

### ⚠️ 常见陷阱
- 忘了重新索引 → 分析过时代码
- 深度设太大 → 爆炸的结果
- 只用关键词搜索 → 错过语义相关代码
- 不看调用上下文 → 理解不完整
    `.trim()
  })

  .addPrompt({
    name: 'code-rag-assistant',
    description: 'AI Assistant prompt with RAG-enhanced code understanding',
    arguments: [],
    generate: async () => `
## 🧠 Code RAG 增强型 AI 助手

### ⚙️ 系统指令

你现在拥有代码库的语义理解能力。按以下流程回答问题：

---

### 📌 执行流程

1. **需要理解代码时，先调用 rag_search:**
\`\`\`
rag_search
  query: "用户想了解的功能关键词"
  includeCallContext: true
  limit: 10
\`\`\`

2. **遇到修改建议，先调用 rag_impact_analysis:**
评估改动会影响多少代码

3. **架构相关问题，调用 rag_architecture:**
生成可视化的模块依赖图

4. **调试数据流，调用 rag_call_chain:**
找出从输入到输出的完整路径

---

### 💡 回答要求

1. **准确**: 基于实际索引到的代码，不要瞎编
2. **具体**: 引用函数名和文件路径
3. **有深度**: 分析调用关系，而不只是表面
4. **可执行**: 给出具体的下一步建议

⚠️ 如果索引为空，请先让用户运行 rag_index_build
    `.trim()
  })
  .build()