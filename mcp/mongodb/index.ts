import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, sanitizePath, safeExec } from '../../packages/core/shared/utils'

let mongoConfig: any = {
  host: 'localhost',
  port: 27017,
  database: 'test'
}

function buildMongoUri(): string {
  if (mongoConfig.connectionString) return mongoConfig.connectionString
  const auth = mongoConfig.username && mongoConfig.password
    ? `${mongoConfig.username}:${encodeURIComponent(mongoConfig.password)}@`
    : ''
  return `mongodb://${auth}${mongoConfig.host}:${mongoConfig.port}/${mongoConfig.database}`
}

function sanitizeMongoPath(path: string): string {
  return path.replace(/"/g, '\\"').replace(/\$/g, '\\$')
}

export default createMCPServer({
  name: 'mongodb',
  version: '2.0.0',
  description: 'Enterprise MongoDB Toolkit - Connect, query, aggregate, index and manage NoSQL databases',
  icon: '🍃',
  author: 'MCP Expert Community'
})
  
  .addTool({
    name: 'mongo_configure',
    description: 'Configure MongoDB connection with validation',
    parameters: {
      host: { type: 'string', description: 'MongoDB host', required: false },
      port: { type: 'number', description: 'MongoDB port', required: false },
      database: { type: 'string', description: 'Database name', required: false },
      username: { type: 'string', description: 'Username for authentication', required: false },
      password: { type: 'string', description: 'Password for authentication', required: false },
      connectionString: { type: 'string', description: 'Full MongoDB connection string (overrides other params)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        host: { type: 'string', required: false, default: 'localhost' },
        port: { type: 'number', required: false, default: 27017 },
        database: { type: 'string', required: false, default: 'test' },
        username: { type: 'string', required: false },
        password: { type: 'string', required: false },
        connectionString: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid configuration', validation.errors)

      if (validation.data.connectionString) {
        mongoConfig.connectionString = validation.data.connectionString
        mongoConfig.type = 'connection_string'
      } else {
        mongoConfig = { ...mongoConfig, ...validation.data }
      }

      return formatSuccess({
        message: 'MongoDB configuration updated',
        connection: validation.data.connectionString
          ? '*** (connection string provided)'
          : buildMongoUri().replace(/:([^@/]+)@/, ':***@')
      })
    }
  })
  .addTool({
    name: 'mongo_ping',
    description: 'Test MongoDB connection and latency',
    parameters: {},
    execute: async () => {
      const uri = buildMongoUri()
      const startTime = Date.now()
      const result = await safeExec(`mongosh "${uri}" --quiet --eval "db.adminCommand('ping').ok" 2>&1`, 15000)
      const latency = Date.now() - startTime
      const connected = result.includes('1')

      return formatSuccess({
        connected,
        latency: `${latency}ms`,
        message: connected ? 'Connection successful' : 'Connection failed',
        raw: result.substring(0, 500)
      })
    }
  })
  .addTool({
    name: 'mongo_server_status',
    description: 'Get MongoDB server status and metrics',
    parameters: {},
    execute: async () => {
      const uri = buildMongoUri()
      const result = await safeExec(`mongosh "${uri}" --quiet --eval "
        const status = db.adminCommand('serverStatus')
        JSON.stringify({
          version: status.version,
          uptime: status.uptime,
          connections: status.connections,
          network: status.network,
          opcounters: status.opcounters,
          mem: status.mem
        })
      " 2>&1`, 30000)

      try {
        const status = JSON.parse(result)
        return formatSuccess({
          version: status.version,
          uptime: `${Math.round(status.uptime / 3600)} hours`,
          connections: status.connections,
          opcounters: status.opcounters,
          memory: status.mem,
          network: status.network
        })
      } catch {
        return formatSuccess({ raw: result.substring(0, 3000) })
      }
    }
  })
  .addTool({
    name: 'mongo_list_databases',
    description: 'List all databases on the server with sizes',
    parameters: {},
    execute: async () => {
      const uri = buildMongoUri()
      const result = await safeExec(`mongosh "${uri}" --quiet --eval "JSON.stringify(db.adminCommand('listDatabases').databases)" 2>&1`, 15000)
      try {
        const dbs = JSON.parse(result)
        return formatSuccess({
          count: dbs.length,
          databases: dbs.map((db: any) => ({
            name: db.name,
            sizeOnDiskMB: Math.round(db.sizeOnDisk / 1024 / 1024),
            empty: db.empty
          }))
        })
      } catch {
        return formatError('Failed to parse database list', result.substring(0, 500))
      }
    }
  })
  .addTool({
    name: 'mongo_list_collections',
    description: 'List all collections with stats in current database',
    parameters: {},
    execute: async () => {
      const uri = buildMongoUri()
      const result = await safeExec(`mongosh "${uri}" --quiet --eval "
        const cols = db.getCollectionNames()
        const stats = cols.map((c: string) => {
          try {
            const s = db.getCollection(c).stats()
            return { name: c, count: s.count, size: s.size }
          } catch { return { name: c } }
        })
        JSON.stringify(stats)
      " 2>&1`, 15000)
      try {
        const collections = JSON.parse(result)
        return formatSuccess({
          count: collections.length,
          collections
        })
      } catch {
        return formatError('Failed to parse collection list', result.substring(0, 500))
      }
    }
  })
  .addTool({
    name: 'mongo_find',
    description: 'Execute find query with filtering, projection, sorting, and limits',
    parameters: {
      collection: { type: 'string', description: 'Collection name', required: true },
      query: { type: 'string', description: 'Query filter as JSON e.g. {"status": "active"}', required: false },
      projection: { type: 'string', description: 'Projection as JSON e.g. {"name": 1, "_id": 0}', required: false },
      sort: { type: 'string', description: 'Sort specification as JSON e.g. {"createdAt": -1}', required: false },
      limit: { type: 'number', description: 'Limit results', required: false },
      skip: { type: 'number', description: 'Skip results for pagination', required: false },
      explain: { type: 'boolean', description: 'Explain query execution plan', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        collection: { type: 'string', required: true },
        query: { type: 'string', required: false, default: '{}' },
        projection: { type: 'string', required: false, default: '{}' },
        sort: { type: 'string', required: false, default: '{}' },
        limit: { type: 'number', required: false, default: 50 },
        skip: { type: 'number', required: false, default: 0 },
        explain: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const uri = buildMongoUri()
      const { collection, query, projection, sort, limit, skip, explain } = validation.data

      try {
        JSON.parse(query)
        JSON.parse(projection)
        JSON.parse(sort)
      } catch {
        return formatError('Invalid JSON in parameters', 'Ensure query, projection, and sort are valid JSON')
      }

      const explainCmd = explain ? '.explain("executionStats")' : ''
      const jsCmd = `JSON.stringify(db.getCollection('${sanitizeMongoPath(collection)}').find(${query}, ${projection}).sort(${sort}).skip(${skip}).limit(${limit})${explainCmd}.toArray())`

      const result = await safeExec(`mongosh "${uri}" --quiet --eval "${jsCmd}" 2>&1`, 60000)

      try {
        const docs = JSON.parse(result)
        return formatSuccess({
          collection,
          query: JSON.parse(query),
          count: docs.length,
          limit,
          documents: docs
        })
      } catch {
        return formatError('Query execution failed', result.substring(0, 1000))
      }
    }
  })
  .addTool({
    name: 'mongo_insert_one',
    description: 'Insert single document into collection',
    parameters: {
      collection: { type: 'string', description: 'Collection name', required: true },
      document: { type: 'string', description: 'Document as JSON string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        collection: { type: 'string', required: true },
        document: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const uri = buildMongoUri()
      const { collection, document } = validation.data

      try {
        JSON.parse(document)
      } catch {
        return formatError('Invalid document JSON', document.substring(0, 200))
      }

      const safeCollection = sanitizeMongoPath(collection)
      const safeDoc = document.replace(/"/g, '\\"')

      const result = await safeExec(`mongosh "${uri}" --quiet --eval "JSON.stringify(db.getCollection('${safeCollection}').insertOne(${safeDoc}))" 2>&1`, 30000)

      try {
        const insertResult = JSON.parse(result)
        return formatSuccess({
          collection,
          insertedId: insertResult.insertedId,
          acknowledged: insertResult.acknowledged,
          success: true
        })
      } catch {
        return formatError('Insert failed', result.substring(0, 500))
      }
    }
  })
  .addTool({
    name: 'mongo_update_one',
    description: 'Update single document in collection',
    parameters: {
      collection: { type: 'string', description: 'Collection name', required: true },
      filter: { type: 'string', description: 'Query filter as JSON', required: true },
      update: { type: 'string', description: 'Update operations as JSON e.g. {"$set": {"status": "done"}}', required: true },
      upsert: { type: 'boolean', description: 'Create document if not found', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        collection: { type: 'string', required: true },
        filter: { type: 'string', required: true },
        update: { type: 'string', required: true },
        upsert: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const uri = buildMongoUri()
      const { collection, filter, update, upsert } = validation.data

      try {
        JSON.parse(filter)
        JSON.parse(update)
      } catch {
        return formatError('Invalid JSON in parameters', 'Ensure filter and update are valid JSON')
      }

      const safeCollection = sanitizeMongoPath(collection)
      const options = `{ upsert: ${upsert} }`

      const result = await safeExec(`mongosh "${uri}" --quiet --eval "JSON.stringify(db.getCollection('${safeCollection}').updateOne(${filter}, ${update}, ${options}))" 2>&1`, 30000)

      try {
        const updateResult = JSON.parse(result)
        return formatSuccess({
          collection,
          matchedCount: updateResult.matchedCount,
          modifiedCount: updateResult.modifiedCount,
          upsertedCount: updateResult.upsertedCount,
          upsertedId: updateResult.upsertedId,
          success: true
        })
      } catch {
        return formatError('Update failed', result.substring(0, 500))
      }
    }
  })
  .addTool({
    name: 'mongo_delete',
    description: 'Delete documents from collection',
    parameters: {
      collection: { type: 'string', description: 'Collection name', required: true },
      filter: { type: 'string', description: 'Query filter as JSON', required: true },
      many: { type: 'boolean', description: 'Delete all matching documents (deleteMany)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        collection: { type: 'string', required: true },
        filter: { type: 'string', required: true },
        many: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const uri = buildMongoUri()
      const { collection, filter, many } = validation.data

      try {
        JSON.parse(filter)
      } catch {
        return formatError('Invalid filter JSON', filter)
      }

      const safeCollection = sanitizeMongoPath(collection)
      const method = many ? 'deleteMany' : 'deleteOne'

      const result = await safeExec(`mongosh "${uri}" --quiet --eval "JSON.stringify(db.getCollection('${safeCollection}').${method}(${filter}))" 2>&1`, 30000)

      try {
        const deleteResult = JSON.parse(result)
        return formatSuccess({
          collection,
          deletedCount: deleteResult.deletedCount,
          method,
          success: true,
          warning: !many && deleteResult.deletedCount > 1 ? 'WARNING: More than one document matched filter' : undefined
        })
      } catch {
        return formatError('Delete failed', result.substring(0, 500))
      }
    }
  })
  .addTool({
    name: 'mongo_aggregate',
    description: 'Execute aggregation pipeline',
    parameters: {
      collection: { type: 'string', description: 'Collection name', required: true },
      pipeline: { type: 'string', description: 'Aggregation pipeline as JSON array', required: true },
      explain: { type: 'boolean', description: 'Explain execution', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        collection: { type: 'string', required: true },
        pipeline: { type: 'string', required: true },
        explain: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const uri = buildMongoUri()
      const { collection, pipeline, explain } = validation.data

      try {
        const parsed = JSON.parse(pipeline)
        if (!Array.isArray(parsed)) throw new Error('Pipeline must be array')
      } catch {
        return formatError('Invalid pipeline JSON', 'Pipeline must be a valid JSON array of stages')
      }

      const safeCollection = sanitizeMongoPath(collection)
      const explainCmd = explain ? '.explain()' : ''

      const result = await safeExec(`mongosh "${uri}" --quiet --eval "JSON.stringify(db.getCollection('${safeCollection}').aggregate(${pipeline})${explainCmd}.toArray())" 2>&1`, 120000)

      try {
        const aggResult = JSON.parse(result)
        return formatSuccess({
          collection,
          stageCount: JSON.parse(pipeline).length,
          resultCount: aggResult.length,
          results: aggResult
        })
      } catch {
        return formatError('Aggregation failed', result.substring(0, 1000))
      }
    }
  })
  .addTool({
    name: 'mongo_create_index',
    description: 'Create index on collection with options',
    parameters: {
      collection: { type: 'string', description: 'Collection name', required: true },
      keys: { type: 'string', description: 'Index keys as JSON e.g. {"userId": 1, "createdAt": -1}', required: true },
      name: { type: 'string', description: 'Index name (auto-generated if not provided)', required: false },
      unique: { type: 'boolean', description: 'Create unique index', required: false },
      background: { type: 'boolean', description: 'Build index in background', required: false },
      sparse: { type: 'boolean', description: 'Create sparse index', required: false },
      expireAfterSeconds: { type: 'number', description: 'TTL index expiration in seconds', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        collection: { type: 'string', required: true },
        keys: { type: 'string', required: true },
        name: { type: 'string', required: false },
        unique: { type: 'boolean', required: false, default: false },
        background: { type: 'boolean', required: false, default: true },
        sparse: { type: 'boolean', required: false, default: false },
        expireAfterSeconds: { type: 'number', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const uri = buildMongoUri()
      const { collection, keys, name, unique, background, sparse, expireAfterSeconds } = validation.data

      try {
        JSON.parse(keys)
      } catch {
        return formatError('Invalid keys JSON', keys)
      }

      const options: Record<string, any> = { unique, background, sparse }
      if (name) options.name = name
      if (expireAfterSeconds) options.expireAfterSeconds = expireAfterSeconds

      const safeCollection = sanitizeMongoPath(collection)
      const optionsStr = JSON.stringify(options)

      const result = await safeExec(`mongosh "${uri}" --quiet --eval "JSON.stringify(db.getCollection('${safeCollection}').createIndex(${keys}, ${optionsStr}))" 2>&1`, 120000)

      return formatSuccess({
        collection,
        keys: JSON.parse(keys),
        options,
        result: result.substring(0, 500)
      })
    }
  })
  .addTool({
    name: 'mongo_dump',
    description: 'Backup database or collection with mongodump',
    parameters: {
      database: { type: 'string', description: 'Database name to backup', required: false },
      collection: { type: 'string', description: 'Specific collection to backup', required: false },
      outputDir: { type: 'string', description: 'Output directory', required: true },
      gzip: { type: 'boolean', description: 'Compress with gzip', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        database: { type: 'string', required: false },
        collection: { type: 'string', required: false },
        outputDir: { type: 'string', required: true },
        gzip: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const uri = buildMongoUri()
      const { database, collection, outputDir, gzip } = validation.data
      const safeOutput = sanitizePath(outputDir)

      const dbFlag = database ? `--db ${database}` : ''
      const collFlag = collection ? `--collection ${collection}` : ''
      const gzipFlag = gzip ? '--gzip' : ''

      const result = await safeExec(`mongodump --uri "${uri}" ${dbFlag} ${collFlag} --out "${safeOutput}" ${gzipFlag} 2>&1`, 300000)

      const hasError = result.includes('error') || result.includes('Failed')
      return formatSuccess({
        success: !hasError,
        outputDir: safeOutput,
        database,
        collection,
        gzip,
        raw: result.substring(0, 1000)
      })
    }
  })
  .build()
