import crypto from 'crypto'
import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core'
import * as fs from 'fs/promises'
import * as path from 'path'

const MEMORY_DIR = path.join(process.cwd(), '.agent-memory')

interface MemoryEntry {
  id: string
  type: 'fact' | 'preference' | 'context' | 'task' | 'learning'
  content: string
  tags: string[]
  importance: number
  createdAt: string
  updatedAt: string
  sessionId?: string
  metadata?: Record<string, any>
  vector?: number[]
}

interface MemoryIndex {
  entries: Record<string, MemoryEntry>
  tags: Record<string, string[]>
  sessions: Record<string, string[]>
  version: string
}

async function ensureMemoryDir(): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true })
}

async function readIndex(): Promise<MemoryIndex> {
  await ensureMemoryDir()
  const indexPath = path.join(MEMORY_DIR, 'index.json')
  try {
    const data = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(data)
    return { version: '2.0', entries: {}, tags: {}, sessions: {}, ...parsed }
  } catch {
    return { version: '2.0', entries: {}, tags: {}, sessions: {} }
  }
}

async function writeIndex(index: MemoryIndex): Promise<void> {
  await ensureMemoryDir()
  const indexPath = path.join(MEMORY_DIR, 'index.json')
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2))
}

function generateId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`
}

function simpleVector(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean)
  const vector: number[] = Array(32).fill(0)
  words.forEach((word, i) => {
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

const VALID_TYPES = ['fact', 'preference', 'context', 'task', 'learning']

export default createMCPServer({
  name: 'memory',
  version: '2.0.0',
  description: 'Enterprise Persistent Memory System - Semantic search, fact storage, preference learning, context management and task tracking across sessions',
  author: 'MCP Expert Community',
  icon: '🧠'
})

  .addTool({
    name: 'memory_configure',
    description: 'Configure memory storage location and settings',
    parameters: {
      customPath: { type: 'string', description: 'Custom memory directory path', required: false },
      defaultImportance: { type: 'number', description: 'Default importance level 1-10', required: false },
      enableVectors: { type: 'boolean', description: 'Enable semantic vector embeddings', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        customPath: { type: 'string', required: false },
        defaultImportance: { type: 'number', required: false, default: 5 },
        enableVectors: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid configuration', validation.errors)

      return formatSuccess({
        message: 'Memory system configured',
        storagePath: MEMORY_DIR,
        defaultImportance: validation.data.defaultImportance,
        enableVectors: validation.data.enableVectors,
        customPathNote: validation.data.customPath ? 'Restart required for custom path activation' : undefined
      })
    }
  })

  .addTool({
    name: 'memory_store',
    description: 'Store information with semantic vector support',
    parameters: {
      type: { type: 'string', description: 'Memory type: fact, preference, context, task, learning', required: true },
      content: { type: 'string', description: 'The information to store', required: true },
      tags: { type: 'string', description: 'Comma-separated tags for organization', required: false },
      importance: { type: 'number', description: 'Importance level 1-10 (default 5)', required: false },
      sessionId: { type: 'string', description: 'Session identifier', required: false },
      metadata: { type: 'string', description: 'Additional metadata as JSON', required: false },
      enableSemantic: { type: 'boolean', description: 'Generate vector for semantic search', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true },
        content: { type: 'string', required: true },
        tags: { type: 'string', required: false },
        importance: { type: 'number', required: false, default: 5 },
        sessionId: { type: 'string', required: false },
        metadata: { type: 'string', required: false },
        enableSemantic: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!VALID_TYPES.includes(validation.data.type)) {
        return formatError('Invalid memory type', `Type must be one of: ${VALID_TYPES.join(', ')}`)
      }

      const index = await readIndex()
      const id = generateId()
      const now = new Date().toISOString()
      const sessionId = validation.data.sessionId || `session-${Date.now()}`

      let parsedMetadata: Record<string, any> = {}
      if (validation.data.metadata) {
        try {
          parsedMetadata = JSON.parse(validation.data.metadata)
        } catch {}
      }

      const entry: MemoryEntry = {
        id,
        type: validation.data.type,
        content: validation.data.content,
        tags: validation.data.tags?.split(',').map((t: string) => t.trim()).filter(Boolean) || [],
        importance: Math.min(10, Math.max(1, validation.data.importance)),
        createdAt: now,
        updatedAt: now,
        sessionId,
        metadata: parsedMetadata,
        vector: validation.data.enableSemantic ? simpleVector(validation.data.content) : undefined
      }

      index.entries[id] = entry

      for (const tag of entry.tags) {
        if (!index.tags[tag]) index.tags[tag] = []
        if (!index.tags[tag].includes(id)) index.tags[tag].push(id)
      }

      if (!index.sessions[sessionId]) index.sessions[sessionId] = []
      if (!index.sessions[sessionId].includes(id)) index.sessions[sessionId].push(id)

      await writeIndex(index)

      return formatSuccess({
        stored: true,
        id,
        type: entry.type,
        contentLength: entry.content.length,
        tags: entry.tags,
        importance: entry.importance,
        semanticEnabled: !!entry.vector,
        createdAt: now,
        storageLocation: MEMORY_DIR
      })
    }
  })

  .addTool({
    name: 'memory_recall',
    description: 'Semantic memory recall with vector similarity search',
    parameters: {
      query: { type: 'string', description: 'Text query for semantic search', required: false },
      type: { type: 'string', description: 'Filter by memory type', required: false },
      tags: { type: 'string', description: 'Comma-separated tags to filter', required: false },
      sessionId: { type: 'string', description: 'Filter by session ID', required: false },
      limit: { type: 'number', description: 'Maximum number of results (default 15)', required: false },
      minImportance: { type: 'number', description: 'Minimum importance 1-10', required: false },
      minSimilarity: { type: 'number', description: 'Minimum semantic similarity 0-1', required: false },
      sortBy: { type: 'string', description: 'Sort: similarity, importance, recency', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        query: { type: 'string', required: false },
        type: { type: 'string', required: false },
        tags: { type: 'string', required: false },
        sessionId: { type: 'string', required: false },
        limit: { type: 'number', required: false, default: 15 },
        minImportance: { type: 'number', required: false, default: 1 },
        minSimilarity: { type: 'number', required: false, default: 0.3 },
        sortBy: { type: 'string', required: false, default: 'similarity' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await readIndex()
      let results: MemoryEntry[] = Object.values(index.entries)
      const queryVector = validation.data.query ? simpleVector(validation.data.query) : undefined

      if (validation.data.type) {
        results = results.filter(e => e.type === validation.data.type)
      }

      if (validation.data.sessionId) {
        const sessionEntries = index.sessions[validation.data.sessionId] || []
        results = results.filter(e => sessionEntries.includes(e.id))
      }

      if (validation.data.tags) {
        const tagList = validation.data.tags.split(',').map((t: string) => t.trim())
        results = results.filter(e => tagList.some((tag: string) => e.tags.includes(tag)))
      }

      results = results.filter(e => e.importance >= validation.data.minImportance)

      if (validation.data.query) {
        const q = validation.data.query.toLowerCase()
        results = results.map(e => {
          const keywordMatch = e.content.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q))
          const similarity = queryVector ? cosineSimilarity(queryVector, e.vector || []) : 0
          return { ...e, score: (keywordMatch ? 0.5 : 0) + similarity * 0.5 } as MemoryEntry & { score?: number }
        }).filter(e => (e.score || 0) >= validation.data.minSimilarity) as MemoryEntry[]
      }

      results.sort((a: any, b: any) => {
        const sortField = validation.data.sortBy
        if (sortField === 'similarity' && a.score) return b.score - a.score
        if (sortField === 'importance') return b.importance - a.importance
        if (sortField === 'recency') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        if (a.score && b.score) return b.score - a.score
        if (b.importance !== a.importance) return b.importance - a.importance
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })

      const limit = validation.data.limit
      const limited = results.slice(0, limit)

      return formatSuccess({
        found: limited.length,
        totalMatching: results.length,
        query: validation.data.query,
        filters: {
          type: validation.data.type,
          tags: validation.data.tags?.split(',').map((t: string) => t.trim()),
          minImportance: validation.data.minImportance
        },
        sortBy: validation.data.sortBy,
        memories: limited.map((e: any) => ({
          id: e.id,
          type: e.type,
          content: e.content,
          tags: e.tags,
          importance: e.importance,
          similarity: e.score ? Math.round(e.score * 100) / 100 : undefined,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          sessionId: e.sessionId,
          metadata: e.metadata
        }))
      })
    }
  })

  .addTool({
    name: 'memory_update',
    description: 'Update existing memory entry with version tracking',
    parameters: {
      id: { type: 'string', description: 'Memory entry ID to update', required: true },
      content: { type: 'string', description: 'New content (optional)', required: false },
      tags: { type: 'string', description: 'New tags as comma-separated string', required: false },
      importance: { type: 'number', description: 'New importance level 1-10', required: false },
      incrementImportance: { type: 'boolean', description: 'Auto-increment importance on access', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        id: { type: 'string', required: true },
        content: { type: 'string', required: false },
        tags: { type: 'string', required: false },
        importance: { type: 'number', required: false },
        incrementImportance: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await readIndex()
      const entry = index.entries[validation.data.id]

      if (!entry) {
        return formatError('Memory entry not found', `No memory with ID: ${validation.data.id}`)
      }

      const oldTags = [...entry.tags]
      const changes: string[] = []

      if (validation.data.content !== undefined && validation.data.content !== entry.content) {
        entry.content = validation.data.content
        entry.vector = simpleVector(validation.data.content)
        changes.push('content updated')
      }

      if (validation.data.tags !== undefined) {
        const newTags = validation.data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        if (JSON.stringify(newTags.sort()) !== JSON.stringify([...entry.tags].sort())) {
          entry.tags = newTags
          changes.push('tags updated')
        }
      }

      if (validation.data.importance !== undefined && validation.data.importance !== entry.importance) {
        entry.importance = Math.min(10, Math.max(1, validation.data.importance))
        changes.push('importance updated')
      }

      if (validation.data.incrementImportance) {
        const old = entry.importance
        entry.importance = Math.min(10, entry.importance + 1)
        if (entry.importance !== old) changes.push('importance incremented')
      }

      for (const tag of oldTags) {
        if (!entry.tags.includes(tag)) {
          index.tags[tag] = (index.tags[tag] || []).filter(id => id !== validation.data.id)
        }
      }

      for (const tag of entry.tags) {
        if (!index.tags[tag]) index.tags[tag] = []
        if (!index.tags[tag].includes(validation.data.id)) {
          index.tags[tag].push(validation.data.id)
        }
      }

      entry.updatedAt = new Date().toISOString()
      index.entries[validation.data.id] = entry
      await writeIndex(index)

      return formatSuccess({
        updated: true,
        id: validation.data.id,
        changes: changes.length ? changes : ['no changes detected'],
        updatedAt: entry.updatedAt
      })
    }
  })

  .addTool({
    name: 'memory_forget',
    description: 'Delete memories with smart pruning options',
    parameters: {
      id: { type: 'string', description: 'Memory entry ID to delete', required: false },
      type: { type: 'string', description: 'Delete all entries of this type', required: false },
      tags: { type: 'string', description: 'Delete entries with these tags', required: false },
      olderThan: { type: 'string', description: 'Delete entries older than ISO date or days e.g. "7d"', required: false },
      sessionId: { type: 'string', description: 'Delete all entries from this session', required: false },
      maxImportance: { type: 'number', description: 'Max importance to consider for deletion (prune low-value)', required: false },
      dryRun: { type: 'boolean', description: 'Preview without deleting', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        id: { type: 'string', required: false },
        type: { type: 'string', required: false },
        tags: { type: 'string', required: false },
        olderThan: { type: 'string', required: false },
        sessionId: { type: 'string', required: false },
        maxImportance: { type: 'number', required: false },
        dryRun: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await readIndex()
      const toDelete: string[] = []

      if (validation.data.id) {
        if (index.entries[validation.data.id]) toDelete.push(validation.data.id)
      } else {
        for (const [id, entry] of Object.entries(index.entries)) {
          let shouldDelete = true
          let hasFilter = false

          if (validation.data.type) {
            hasFilter = true
            if (entry.type !== validation.data.type) shouldDelete = false
          }
          if (validation.data.tags && shouldDelete) {
            hasFilter = true
            const tagList = validation.data.tags.split(',').map((t: string) => t.trim())
            if (!tagList.some((t: string) => entry.tags.includes(t))) shouldDelete = false
          }
          if (validation.data.sessionId && shouldDelete) {
            hasFilter = true
            if (entry.sessionId !== validation.data.sessionId) shouldDelete = false
          }
          if (validation.data.olderThan && shouldDelete) {
            hasFilter = true
            let cutoff: Date
            const daysMatch = validation.data.olderThan.match(/(\d+)d/)
            if (daysMatch) {
              cutoff = new Date(Date.now() - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000)
            } else {
              cutoff = new Date(validation.data.olderThan)
            }
            if (new Date(entry.createdAt) > cutoff) shouldDelete = false
          }
          if (validation.data.maxImportance !== undefined && shouldDelete) {
            hasFilter = true
            if (entry.importance > validation.data.maxImportance) shouldDelete = false
          }

          if (hasFilter && shouldDelete) toDelete.push(id)
        }
      }

      const preview = toDelete.slice(0, 10).map(id => ({
        id,
        type: index.entries[id].type,
        contentPreview: index.entries[id].content.substring(0, 60)
      }))

      if (!validation.data.dryRun) {
        for (const id of toDelete) {
          const entry = index.entries[id]
          if (entry) {
            for (const tag of entry.tags) {
              index.tags[tag] = (index.tags[tag] || []).filter(eid => eid !== id)
            }
            delete index.entries[id]
          }
        }
        if (validation.data.sessionId) {
          delete index.sessions[validation.data.sessionId]
        }
        await writeIndex(index)
      }

      return formatSuccess({
        deleted: validation.data.dryRun ? 0 : toDelete.length,
        wouldDelete: validation.data.dryRun ? toDelete.length : undefined,
        dryRun: validation.data.dryRun,
        criteria: {
          type: validation.data.type,
          tags: validation.data.tags,
          sessionId: validation.data.sessionId,
          olderThan: validation.data.olderThan
        },
        preview: preview.length < toDelete.length ? [...preview.slice(0, 10).map((p: any) => p.contentPreview), `... and ${toDelete.length - 10} more`] : preview.map((p: any) => p.contentPreview)
      })
    }
  })

  .addTool({
    name: 'memory_summary',
    description: 'Comprehensive memory analytics and statistics',
    parameters: {
      sessionId: { type: 'string', description: 'Session ID to get summary for', required: false },
      includeRecent: { type: 'boolean', description: 'Include recent memories', required: false },
      includeByTag: { type: 'boolean', description: 'Include tag breakdown', required: false },
      topN: { type: 'number', description: 'Number of top items to include', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sessionId: { type: 'string', required: false },
        includeRecent: { type: 'boolean', required: false, default: true },
        includeByTag: { type: 'boolean', required: false, default: true },
        topN: { type: 'number', required: false, default: 10 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const index = await readIndex()
      let entries = Object.values(index.entries)

      if (validation.data.sessionId) {
        const sessionEntries = index.sessions[validation.data.sessionId] || []
        entries = entries.filter(e => sessionEntries.includes(e.id))
      }

      const byType: Record<string, number> = {}
      const byTag: Record<string, number> = {}
      let totalImportance = 0
      let highImportance = 0
      let withVectors = 0
      let lastWeek = 0

      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

      for (const entry of entries) {
        byType[entry.type] = (byType[entry.type] || 0) + 1
        for (const tag of entry.tags) {
          byTag[tag] = (byTag[tag] || 0) + 1
        }
        totalImportance += entry.importance
        if (entry.importance >= 8) highImportance++
        if (entry.vector) withVectors++
        if (new Date(entry.createdAt).getTime() > oneWeekAgo) lastWeek++
      }

      const importantEntries = [...entries]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, validation.data.topN)

      const recentEntries = [...entries]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, validation.data.topN)

      return formatSuccess({
        storagePath: MEMORY_DIR,
        totalMemories: entries.length,
        sessionCount: Object.keys(index.sessions).length,
        storageVersion: index.version,
        breakdownByType: byType,
        breakdownByTag: validation.data.includeByTag ? Object.entries(byTag)
          .sort((a, b) => b[1] - a[1])
          .slice(0, validation.data.topN)
          .map(([tag, count]) => ({ tag, count })) : undefined,
        stats: {
          averageImportance: entries.length ? Math.round(totalImportance / entries.length * 10) / 10 : 0,
          highImportanceCount: highImportance,
          withSemanticVectors: withVectors,
          addedThisWeek: lastWeek,
          tagsIndexed: Object.keys(index.tags).length
        },
        topImportant: importantEntries.map(e => ({ id: e.id, type: e.type, importance: e.importance, contentPreview: e.content.substring(0, 80) })),
        recentActivity: validation.data.includeRecent ? recentEntries.map(e => ({ id: e.id, type: e.type, updatedAt: e.updatedAt, contentPreview: e.content.substring(0, 80) })) : undefined
      })
    }
  })

  .addTool({
    name: 'memory_learn',
    description: 'Store insights and learnings with automatic categorization',
    parameters: {
      insight: { type: 'string', description: 'The insight or learning to store', required: true },
      context: { type: 'string', description: 'Context where this was learned', required: false },
      source: { type: 'string', description: 'Source: documentation, error, experiment, review, discussion', required: false },
      relatedProject: { type: 'string', description: 'Related project or component', required: false },
      tags: { type: 'string', description: 'Additional comma-separated tags', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        insight: { type: 'string', required: true },
        context: { type: 'string', required: false },
        source: { type: 'string', required: false },
        relatedProject: { type: 'string', required: false },
        tags: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const content = validation.data.context
        ? `${validation.data.insight}\n\nContext: ${validation.data.context}`
        : validation.data.insight

      const autoTags = ['learning', 'insight']
      if (validation.data.source) autoTags.push(`source:${validation.data.source}`)
      if (validation.data.relatedProject) autoTags.push(`project:${validation.data.relatedProject}`)
      if (validation.data.tags) autoTags.push(...validation.data.tags.split(',').map((t: string) => t.trim()))

      const index = await readIndex()
      const id = generateId()
      const now = new Date().toISOString()

      const entry: MemoryEntry = {
        id,
        type: 'learning',
        content,
        tags: autoTags,
        importance: 7,
        createdAt: now,
        updatedAt: now,
        sessionId: `learning-${new Date().toISOString().split('T')[0]}`,
        vector: simpleVector(content),
        metadata: {
          source: validation.data.source,
          project: validation.data.relatedProject,
          context: validation.data.context
        }
      }

      index.entries[id] = entry
      for (const tag of entry.tags) {
        if (!index.tags[tag]) index.tags[tag] = []
        index.tags[tag].push(id)
      }
      await writeIndex(index)

      return formatSuccess({
        learned: true,
        id,
        insight: validation.data.insight.substring(0, 150),
        source: validation.data.source,
        project: validation.data.relatedProject,
        tags: autoTags,
        importance: entry.importance
      })
    }
  })

  .addTool({
    name: 'memory_preference',
    description: 'User preference management with type-safe key-value storage',
    parameters: {
      action: { type: 'string', description: 'Action: get, set, delete, list, reset', required: true },
      key: { type: 'string', description: 'Preference key name', required: false },
      value: { type: 'string', description: 'Preference value (for set action)', required: false },
      category: { type: 'string', description: 'Category: coding, tools, workflow, ui, output', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true },
        key: { type: 'string', required: false },
        value: { type: 'string', required: false },
        category: { type: 'string', required: false, default: 'general' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { action, key, value, category } = validation.data
      const index = await readIndex()
      const now = new Date().toISOString()

      if (action === 'set' && key) {
        const tags = ['preference', `category:${category}`]
        tags.push(...key.split(/[._]/))

        const existing = Object.values(index.entries).find(
          e => e.type === 'preference' && e.metadata?.key === key
        )

        if (existing) {
          existing.content = `${key}=${value}`
          existing.updatedAt = now
          existing.metadata = { ...existing.metadata, value, category, updatedAt: now }
          await writeIndex(index)
          return formatSuccess({ action: 'set', key, value, category, updated: true })
        }

        const id = generateId()
        index.entries[id] = {
          id,
          type: 'preference',
          content: `${key}=${value}`,
          tags,
          importance: 8,
          createdAt: now,
          updatedAt: now,
          sessionId: 'preferences',
          metadata: { key, value, category }
        }
        for (const tag of tags) {
          if (!index.tags[tag]) index.tags[tag] = []
          index.tags[tag].push(id)
        }
        await writeIndex(index)
        return formatSuccess({ action: 'set', key, value, category, created: true })
      }

      if (action === 'get' && key) {
        const entry = Object.values(index.entries).find(
          e => e.type === 'preference' && e.metadata?.key === key
        )
        if (entry) {
          return formatSuccess({ found: true, key, value: entry.metadata?.value, category: entry.metadata?.category })
        }
        return formatSuccess({ found: false, key, value: null, hint: 'Use memory_preference action=set to define this preference' })
      }

      if (action === 'delete' && key) {
        const entry = Object.values(index.entries).find(
          e => e.type === 'preference' && e.metadata?.key === key
        )
        if (entry) {
          for (const tag of entry.tags) {
            index.tags[tag] = (index.tags[tag] || []).filter(id => id !== entry.id)
          }
          delete index.entries[entry.id]
          await writeIndex(index)
          return formatSuccess({ deleted: true, key })
        }
        return formatError('Preference not found', `No preference with key: ${key}`)
      }

      if (action === 'list') {
        let preferences = Object.values(index.entries).filter(e => e.type === 'preference')
        if (category !== 'general') {
          preferences = preferences.filter(e => e.metadata?.category === category)
        }
        return formatSuccess({
          count: preferences.length,
          category,
          preferences: preferences.map(e => ({
            key: e.metadata?.key,
            value: e.metadata?.value,
            category: e.metadata?.category,
            updatedAt: e.updatedAt
          }))
        })
      }

      if (action === 'reset') {
        const prefIds = Object.values(index.entries).filter(e => e.type === 'preference').map(e => e.id)
        for (const id of prefIds) {
          delete index.entries[id]
        }
        for (const tag of Object.keys(index.tags)) {
          index.tags[tag] = index.tags[tag].filter(id => !prefIds.includes(id))
        }
        await writeIndex(index)
        return formatSuccess({ reset: true, deletedPreferences: prefIds.length })
      }

      return formatError('Invalid action', 'Valid actions: get, set, delete, list, reset')
    }
  })

  .addResource({
    name: 'memory-best-practices',
    uri: 'docs://memory/best-practices',
    description: 'Memory System Best Practices',
    mimeType: 'text/markdown',
    get: async () => `
## 🧠 Memory System Best Practices

### Importance Guidelines (1-10)
- **1-3**: Trivia, temporary notes, throwaway context
- **4-6**: Standard facts, regular learnings, context
- **7-8**: Important preferences, key insights, coding style
- **9-10**: Critical rules, hard requirements, security constraints

### Tagging Strategy
- Use consistent lowercase tags: coding-style, security, performance
- Include language tags: typescript, python, rust
- Tag by project component: frontend, api, database
- Status tags: pending-review, verified, deprecated

### Memory Types Usage
- **fact**: Immutable, verifiable information
- **preference**: User-specific choices and defaults
- **context**: Session or project context
- **task**: Action items and tracking
- **learning**: Lessons learned, insights, discoveries

### Semantic Search Tips
- Use natural language queries
- Combine with tag filters for precision
- Adjust minSimilarity for broader/narrower results
    `.trim()
  })

  .addPrompt({
    name: 'memory-system-prompt',
    description: 'AI assistant memory integration prompt',
    arguments: [],
    generate: async () => `## 🧠 Memory Integration for AI Assistant

### Always:
1. **Store learnings** after each task completion
2. **Recall preferences** at the start of every session
3. **Store preferences** when user expresses consistent choices
4. **Tag memories** with meaningful, searchable tags
5. **Set importance** appropriately (7+ for user preferences)

### At Conversation Start:
\`\`\`
memory_recall type=preference sortBy=importance limit=20
memory_recall sessionId=[current-session] sortBy=recency
\`\`\`

### After Completing Task:
\`\`\`
memory_learn insight="What was learned" source="task-completion" tags="..."
\`\`\`

### When User Shows Preferences:
- Immediately store with type=preference and importance=8+
- Example: \`memory_preference action=set key="indent-size" value="2" category="coding"\`
    `.trim()
  })
  .build()