import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'
import * as crypto from 'crypto'

export default createMCPServer({
  name: 'backend-dev-kit',
  version: '2.0.0',
  description: 'Enterprise Backend Development Kit - Auth, Database, Cache, Queue, Validation, Middleware',
  author: 'MCP Expert Community',
  icon: '⚙️'
})
  .addTool({
    name: 'auth_generate_tokens',
    description: 'Generate JWT tokens with configurable expiration and claims',
    parameters: {
      userId: { type: 'string', description: 'User ID', required: true },
      secret: { type: 'string', description: 'JWT secret', required: true },
      expiresIn: { type: 'string', description: 'Expiration time', required: false },
      roles: { type: 'string', description: 'Comma-separated roles', required: false },
      issuer: { type: 'string', description: 'Token issuer', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        userId: { type: 'string', required: true },
        secret: { type: 'string', required: true },
        expiresIn: { type: 'string', required: false, default: '1h' },
        roles: { type: 'string', required: false, default: '' },
        issuer: { type: 'string', required: false, default: 'mcp-backend' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const expiresMs = parseDuration(validation.data.expiresIn)
      const now = Math.floor(Date.now() / 1000)
      
      const payload = {
        sub: validation.data.userId,
        iss: validation.data.issuer,
        iat: now,
        exp: now + expiresMs,
        roles: validation.data.roles.split(',').filter(Boolean)
      }

      const token = generateJWT(payload, validation.data.secret)
      const refreshToken = crypto.randomBytes(32).toString('hex')

      return formatSuccess({
        accessToken: token,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: expiresMs,
        expiresAt: new Date((now + expiresMs) * 1000).toISOString(),
        payload
      })
    }
  })
  .addTool({
    name: 'auth_hash_password',
    description: 'Secure password hashing with bcrypt/argon2 and salt generation',
    parameters: {
      password: { type: 'string', description: 'Password to hash', required: true },
      algorithm: { type: 'string', description: 'Algorithm: bcrypt, argon2, pbkdf2', required: false },
      rounds: { type: 'number', description: 'Hashing rounds/work factor', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        password: { type: 'string', required: true },
        algorithm: { type: 'string', required: false, default: 'pbkdf2' },
        rounds: { type: 'number', required: false, default: 10000 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const salt = crypto.randomBytes(16).toString('hex')
      const hash = crypto.pbkdf2Sync(validation.data.password, salt, validation.data.rounds, 64, 'sha512').toString('hex')

      return formatSuccess({
        algorithm: validation.data.algorithm,
        salt,
        hash,
        stored: `${validation.data.algorithm}:${validation.data.rounds}:${salt}:${hash}`,
        strength: estimatePasswordStrength(validation.data.password)
      })
    }
  })
  .addTool({
    name: 'db_generate_migration',
    description: 'Generate database migration (PostgreSQL, MySQL, SQLite)',
    parameters: {
      action: { type: 'string', description: 'create_table, add_column, drop_table, add_index', required: true },
      table: { type: 'string', description: 'Table name', required: true },
      dialect: { type: 'string', description: 'postgres, mysql, sqlite', required: false },
      columns: { type: 'string', description: 'JSON column definitions', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true },
        table: { type: 'string', required: true },
        dialect: { type: 'string', required: false, default: 'postgres' },
        columns: { type: 'string', required: false, default: '{}' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const migration = generateMigration(
        validation.data.action,
        validation.data.table,
        validation.data.dialect,
        validation.data.columns
      )

      return formatSuccess({
        action: validation.data.action,
        table: validation.data.table,
        dialect: validation.data.dialect,
        migrationUp: migration.up,
        migrationDown: migration.down,
        timestamp: Date.now()
      })
    }
  })
  .addTool({
    name: 'cache_redis_template',
    description: 'Generate Redis caching patterns and strategies',
    parameters: {
      pattern: { type: 'string', description: 'Pattern: cache-aside, write-through, write-behind, ttl', required: true },
      keyPrefix: { type: 'string', description: 'Redis key prefix', required: false },
      ttl: { type: 'number', description: 'TTL in seconds', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        pattern: { type: 'string', required: true },
        keyPrefix: { type: 'string', required: false, default: 'cache:' },
        ttl: { type: 'number', required: false, default: 3600 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const template = generateRedisTemplate(
        validation.data.pattern,
        validation.data.keyPrefix,
        validation.data.ttl
      )

      return formatSuccess({
        pattern: validation.data.pattern,
        keyPrefix: validation.data.keyPrefix,
        ttl: validation.data.ttl,
        template,
        bestPractices: getRedisBestPractices(validation.data.pattern)
      })
    }
  })
  .addTool({
    name: 'queue_bullmq_template',
    description: 'Generate BullMQ job queue workers and producers',
    parameters: {
      queueName: { type: 'string', description: 'Queue name', required: true },
      jobType: { type: 'string', description: 'email, notification, processing, webhook', required: false },
      concurrency: { type: 'number', description: 'Worker concurrency', required: false },
      attempts: { type: 'number', description: 'Retry attempts', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        queueName: { type: 'string', required: true },
        jobType: { type: 'string', required: false, default: 'default' },
        concurrency: { type: 'number', required: false, default: 5 },
        attempts: { type: 'number', required: false, default: 3 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const template = generateQueueTemplate(validation.data)
      return formatSuccess({
        queueName: validation.data.queueName,
        jobType: validation.data.jobType,
        concurrency: validation.data.concurrency,
        attempts: validation.data.attempts,
        worker: template.worker,
        producer: template.producer,
        config: template.config
      })
    }
  })
  .addTool({
    name: 'validation_zod_schema',
    description: 'Generate Zod validation schemas for API requests',
    parameters: {
      entity: { type: 'string', description: 'Entity name: User, Product, Order', required: true },
      fields: { type: 'string', description: 'Comma-separated fields with types', required: true },
      strict: { type: 'boolean', description: 'Strict mode', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        entity: { type: 'string', required: true },
        fields: { type: 'string', required: true },
        strict: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const schema = generateZodSchema(
        validation.data.entity,
        validation.data.fields,
        validation.data.strict
      )

      return formatSuccess({
        entity: validation.data.entity,
        strict: validation.data.strict,
        schemaCode: schema.code,
        typeInference: schema.types,
        exampleUsage: schema.example
      })
    }
  })
  .addTool({
    name: 'middleware_express',
    description: 'Generate Express.js middleware templates',
    parameters: {
      type: { type: 'string', description: 'rate-limit, cors, logger, auth, error-handler, compression', required: true },
      options: { type: 'string', description: 'Middleware options JSON', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true },
        options: { type: 'string', required: false, default: '{}' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const middleware = generateMiddleware(validation.data.type, validation.data.options)

      return formatSuccess({
        type: validation.data.type,
        options: JSON.parse(validation.data.options),
        middlewareCode: middleware.code,
        usageExample: middleware.usage
      })
    }
  })
  .build()

function generateJWT(payload: any, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url')
  return header + '.' + body + '.' + signature
}

function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)([hmsd])/)
  if (!match) return 3600
  const value = parseInt(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = { h: 3600, m: 60, s: 1, d: 86400 }
  return value * (multipliers[unit] || 3600)
}

function estimatePasswordStrength(password: string): string {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  return score < 3 ? 'weak' : score < 5 ? 'medium' : 'strong'
}

function generateMigration(action: string, table: string, dialect: string, columnsJson: string): any {
  const columns = JSON.parse(columnsJson)
  const colDefs = Object.entries(columns).map(([name, type]: [string, any]) => 
    `  "${name}" ${mapDbType(type, dialect)}`
  ).join(',\n')

  return {
    up: `CREATE TABLE IF NOT EXISTS "${table}" (\n${colDefs}\n);`,
    down: `DROP TABLE IF EXISTS "${table}";`
  }
}

function mapDbType(type: string, dialect: string): string {
  const types: Record<string, Record<string, string>> = {
    postgres: { string: 'VARCHAR(255)', int: 'INTEGER', bool: 'BOOLEAN', timestamp: 'TIMESTAMPTZ', text: 'TEXT' },
    mysql: { string: 'VARCHAR(255)', int: 'INT', bool: 'BOOLEAN', timestamp: 'DATETIME', text: 'TEXT' },
    sqlite: { string: 'TEXT', int: 'INTEGER', bool: 'INTEGER', timestamp: 'DATETIME', text: 'TEXT' }
  }
  return types[dialect]?.[type] || 'TEXT'
}

function generateRedisTemplate(pattern: string, prefix: string, ttl: number): any {
  return {
    'cache-aside': `
async function getCachedData(key: string, fetcher: () => Promise<any>) {
  const cached = await redis.get('${prefix}' + key);
  if (cached) return JSON.parse(cached);
  const data = await fetcher();
  await redis.setEx('${prefix}' + key, ${ttl}, JSON.stringify(data));
  return data;
}`,
    ttl: `await redis.setEx('${prefix}' + key, ${ttl}, JSON.stringify(data));`
  }[pattern] || ''
}

function getRedisBestPractices(pattern: string): string[] {
  return [
    'Always set reasonable TTL to avoid memory leaks',
    'Use appropriate key naming conventions',
    'Implement proper error handling for Redis failures',
    'Consider cache stampede protection with mutexes'
  ]
}

function generateQueueTemplate(params: any): any {
  return {
    worker: `
import { Worker } from 'bullmq';

const worker = new Worker('${params.queueName}', async (job) => {
  console.log('Processing job:', job.id, job.name);
  return await processJob(job.data);
}, {
  concurrency: ${params.concurrency},
  connection: redisConfig
});`,
    producer: `
import { Queue } from 'bullmq';

const queue = new Queue('${params.queueName}', { connection: redisConfig });

async function enqueueJob(data: any) {
  return await queue.add('${params.jobType}', data, {
    attempts: ${params.attempts},
    backoff: { type: 'exponential', delay: 1000 }
  });
}`
  }
}

function generateZodSchema(entity: string, fields: string, strict: boolean): any {
  const fieldList = fields.split(',').map(f => f.trim())
  const zodFields = fieldList.map(f => {
    const [name, type] = f.split(':')
    const zodType = { string: 'z.string()', number: 'z.number()', boolean: 'z.boolean()', email: 'z.string().email()' }[type] || 'z.string()'
    return `  ${name}: ${zodType}`
  }).join(',\n')

  return {
    code: `
import { z } from 'zod';

export const ${entity}Schema = z.object({
${zodFields}
})${strict ? '.strict()' : ''};

export type ${entity} = z.infer<typeof ${entity}Schema>;`,
    types: `type ${entity} = { /* inferred from schema */ }`,
    example: `const data = ${entity}Schema.parse(request.body);`
  }
}

function generateMiddleware(type: string, optionsJson: string): any {
  const middlewares: Record<string, any> = {
    'rate-limit': {
      code: `
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
});`,
      usage: 'app.use(\'/api\', rateLimiter);'
    },
    'error-handler': {
      code: `
export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  const status = err.statusCode || 500;
  res.status(status).json({
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR'
    }
  });
}`,
      usage: 'app.use(errorHandler);'
    }
  }
  return middlewares[type] || middlewares['error-handler']
}
