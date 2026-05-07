import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec } from '../../packages/core/shared/utils'

let redisConfig: any = {
  host: 'localhost',
  port: 6379,
  db: 0
}

function buildRedisArgs(): string {
  let args = `-h ${redisConfig.host} -p ${redisConfig.port} -n ${redisConfig.db}`
  if (redisConfig.password) args += ` -a ${redisConfig.password}`
  if (redisConfig.username) args += ` --user ${redisConfig.username}`
  return args
}

function buildRedisCmd(command: string): string {
  const args = buildRedisArgs()
  return `redis-cli ${args} ${command} 2>&1`
}

function sanitizeRedisValue(value: string): string {
  return value.replace(/"/g, '\\"').replace(/\$/g, '\\$')
}

export default createMCPServer({
  name: 'redis',
  version: '2.0.0',
  description: 'Enterprise Redis Toolkit - Cache management, data structures, pub/sub, and performance optimization',
  icon: '🔴',
  author: 'MCP Expert Community'
})
  
  .addTool({
    name: 'redis_configure',
    description: 'Configure Redis connection with validation',
    parameters: {
      host: { type: 'string', description: 'Redis host', required: false },
      port: { type: 'number', description: 'Redis port', required: false },
      db: { type: 'number', description: 'Database number 0-15', required: false },
      password: { type: 'string', description: 'Redis password', required: false },
      username: { type: 'string', description: 'Redis 6+ ACL username', required: false },
      url: { type: 'string', description: 'Full Redis URL: redis://user:pass@host:port/db', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        host: { type: 'string', required: false, default: 'localhost' },
        port: { type: 'number', required: false, default: 6379 },
        db: { type: 'number', required: false, default: 0 },
        password: { type: 'string', required: false },
        username: { type: 'string', required: false },
        url: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid configuration', validation.errors)

      if (validation.data.url) {
        redisConfig = { ...redisConfig, url: validation.data.url }
      } else {
        redisConfig = { ...redisConfig, ...validation.data }
      }

      return formatSuccess({
        message: 'Redis configuration updated',
        connection: validation.data.url || `${redisConfig.host}:${redisConfig.port}/db${redisConfig.db}`
      })
    }
  })
  .addTool({
    name: 'redis_ping',
    description: 'Test Redis connection and latency',
    parameters: {},
    execute: async () => {
      const startTime = Date.now()
      const result = await safeExec(buildRedisCmd('PING'), 10000)
      const latency = Date.now() - startTime
      const connected = result.includes('PONG')

      return formatSuccess({
        connected,
        latency: `${latency}ms`,
        response: result.trim(),
        message: connected ? 'Connection successful' : 'Connection failed'
      })
    }
  })
  .addTool({
    name: 'redis_info',
    description: 'Get Redis server information and statistics',
    parameters: {
      section: { type: 'string', description: 'Section: server, clients, memory, persistence, stats', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        section: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const section = validation.data.section || 'default'
      const result = await safeExec(buildRedisCmd(`INFO ${section}`), 15000)

      const sections: Record<string, any> = {}
      result.split('\n').forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':')
          if (key && value) sections[key.trim()] = value.trim()
        }
      })

      return formatSuccess({
        section,
        stats: sections,
        raw: result.substring(0, 4000)
      })
    }
  })
  .addTool({
    name: 'redis_set',
    description: 'Set string value with TTL and conditional options',
    parameters: {
      key: { type: 'string', description: 'Key name', required: true },
      value: { type: 'string', description: 'Value to store', required: true },
      ttl: { type: 'number', description: 'Expire time in seconds', required: false },
      nx: { type: 'boolean', description: 'Only set if key does NOT exist (NX)', required: false },
      xx: { type: 'boolean', description: 'Only set if key already exists (XX)', required: false },
      get: { type: 'boolean', description: 'Return old value after setting', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        key: { type: 'string', required: true },
        value: { type: 'string', required: true },
        ttl: { type: 'number', required: false },
        nx: { type: 'boolean', required: false, default: false },
        xx: { type: 'boolean', required: false, default: false },
        get: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { key, value, ttl, nx, xx, get } = validation.data
      const safeKey = sanitizeRedisValue(key)
      const safeValue = sanitizeRedisValue(value)
      let opts = ''
      if (ttl) opts += ` EX ${ttl}`
      if (nx) opts += ' NX'
      if (xx) opts += ' XX'
      if (get) opts += ' GET'

      const result = await safeExec(buildRedisCmd(`SET "${safeKey}" "${safeValue}"${opts}`), 15000)

      return formatSuccess({
        key,
        success: result.includes('OK') || (get && result !== '(nil)'),
        previousValue: get ? result : undefined,
        ttl,
        raw: result
      })
    }
  })
  .addTool({
    name: 'redis_get',
    description: 'Get string value by key',
    parameters: {
      key: { type: 'string', description: 'Key name', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        key: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safeKey = sanitizeRedisValue(validation.data.key)
      const result = await safeExec(buildRedisCmd(`GET "${safeKey}"`), 10000)

      return formatSuccess({
        key: validation.data.key,
        value: result === '(nil)' ? null : result,
        exists: result !== '(nil)'
      })
    }
  })
  .addTool({
    name: 'redis_del',
    description: 'Delete one or more keys',
    parameters: {
      keys: { type: 'string', description: 'JSON array of key names or single key', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        keys: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let keyArray: string[] = []
      try {
        keyArray = JSON.parse(validation.data.keys)
        if (!Array.isArray(keyArray)) keyArray = [validation.data.keys]
      } catch {
        keyArray = [validation.data.keys]
      }

      const keyStr = keyArray.map((k: string) => `"${sanitizeRedisValue(k)}"`).join(' ')
      const result = await safeExec(buildRedisCmd(`DEL ${keyStr}`), 15000)
      const deleted = parseInt(result) || 0

      return formatSuccess({
        keys: keyArray,
        deleted,
        raw: result
      })
    }
  })
  .addTool({
    name: 'redis_exists',
    description: 'Check if keys exist',
    parameters: {
      keys: { type: 'string', description: 'JSON array of key names', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        keys: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let keyArray: string[] = []
      try {
        keyArray = JSON.parse(validation.data.keys)
        if (!Array.isArray(keyArray)) keyArray = [validation.data.keys]
      } catch {
        keyArray = [validation.data.keys]
      }

      const keyStr = keyArray.map((k: string) => `"${sanitizeRedisValue(k)}"`).join(' ')
      const result = await safeExec(buildRedisCmd(`EXISTS ${keyStr}`), 10000)

      return formatSuccess({
        keys: keyArray,
        exists: parseInt(result) || 0
      })
    }
  })
  .addTool({
    name: 'redis_expire',
    description: 'Set key TTL with options',
    parameters: {
      key: { type: 'string', description: 'Key name', required: true },
      seconds: { type: 'number', description: 'TTL in seconds', required: true },
      nx: { type: 'boolean', description: 'Set expiry only when no expiry exists', required: false },
      xx: { type: 'boolean', description: 'Set expiry only when expiry exists', required: false },
      gt: { type: 'boolean', description: 'Set expiry only when greater than current', required: false },
      lt: { type: 'boolean', description: 'Set expiry only when less than current', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        key: { type: 'string', required: true },
        seconds: { type: 'number', required: true, min: 1 },
        nx: { type: 'boolean', required: false, default: false },
        xx: { type: 'boolean', required: false, default: false },
        gt: { type: 'boolean', required: false, default: false },
        lt: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { key, seconds, nx, xx, gt, lt } = validation.data
      const safeKey = sanitizeRedisValue(key)
      let opts = ''
      if (nx) opts += ' NX'
      if (xx) opts += ' XX'
      if (gt) opts += ' GT'
      if (lt) opts += ' LT'

      const result = await safeExec(buildRedisCmd(`EXPIRE "${safeKey}" ${seconds}${opts}`), 10000)

      return formatSuccess({
        key,
        seconds,
        success: result === '1',
        raw: result
      })
    }
  })
  .addTool({
    name: 'redis_ttl',
    description: 'Get key remaining TTL and status',
    parameters: {
      key: { type: 'string', description: 'Key name', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        key: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safeKey = sanitizeRedisValue(validation.data.key)
      const ttlResult = await safeExec(buildRedisCmd(`TTL "${safeKey}"`), 10000)
      const ttl = parseInt(ttlResult)

      let status = 'exists'
      if (ttl === -2) status = 'does_not_exist'
      if (ttl === -1) status = 'exists_but_no_expiry'

      return formatSuccess({
        key: validation.data.key,
        ttl: ttl >= 0 ? ttl : null,
        status,
        message: ttl >= 0 ? `${ttl} seconds remaining` : status
      })
    }
  })
  .addTool({
    name: 'redis_keys',
    description: 'Scan for keys matching pattern (SAFE alternative to KEYS)',
    parameters: {
      pattern: { type: 'string', description: 'Pattern: *, user:* etc.', required: false },
      count: { type: 'number', description: 'Max results', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        pattern: { type: 'string', required: false, default: '*' },
        count: { type: 'number', required: false, default: 100 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { pattern, count } = validation.data
      const result = await safeExec(buildRedisCmd(`SCAN 0 MATCH "${pattern}" COUNT ${count}`), 15000)

      return formatSuccess({
        pattern,
        maxCount: count,
        results: result,
        warning: 'Use SCAN iteration for complete results beyond first page',
        recommendation: 'For production: avoid KEYS command - it blocks the server'
      })
    }
  })
  .addTool({
    name: 'redis_hash_set',
    description: 'Hash operations: HSET, HGET, HGETALL',
    parameters: {
      key: { type: 'string', description: 'Hash key name', required: true },
      field: { type: 'string', description: 'Field name', required: false },
      value: { type: 'string', description: 'Value to set', required: false },
      getAll: { type: 'boolean', description: 'Get all fields/values', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        key: { type: 'string', required: true },
        field: { type: 'string', required: false },
        value: { type: 'string', required: false },
        getAll: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { key, field, value, getAll } = validation.data
      const safeKey = sanitizeRedisValue(key)
      let result = ''

      if (getAll) {
        result = await safeExec(buildRedisCmd(`HGETALL "${safeKey}"`), 15000)
      } else if (field && value !== undefined) {
        const safeField = sanitizeRedisValue(field)
        const safeValue = sanitizeRedisValue(value)
        result = await safeExec(buildRedisCmd(`HSET "${safeKey}" "${safeField}" "${safeValue}"`), 10000)
      } else if (field) {
        const safeField = sanitizeRedisValue(field)
        result = await safeExec(buildRedisCmd(`HGET "${safeKey}" "${safeField}"`), 10000)
      }

      return formatSuccess({
        key,
        field,
        result: result.substring(0, 3000)
      })
    }
  })
  .addTool({
    name: 'redis_flush_db',
    description: 'Flush current database with confirmation',
    parameters: {
      async: { type: 'boolean', description: 'Use ASYNC mode (non-blocking)', required: false },
      confirm: { type: 'boolean', description: 'Must set to true to confirm', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        async: { type: 'boolean', required: false, default: true },
        confirm: { type: 'boolean', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!validation.data.confirm) {
        return formatError('Confirmation required', 'Set confirm: true to execute FLUSHDB')
      }

      const asyncFlag = validation.data.async ? 'ASYNC' : ''
      const result = await safeExec(buildRedisCmd(`FLUSHDB ${asyncFlag}`), 30000)

      return formatSuccess({
        flushed: result.includes('OK'),
        async: validation.data.async,
        database: redisConfig.db,
        message: 'Database flushed successfully',
        warning: 'All data in current DB has been deleted'
      })
    }
  })
  .build()
