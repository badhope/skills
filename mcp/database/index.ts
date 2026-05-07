import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, sanitizePath, safeExec } from '../../packages/core/shared/utils'

let dbConfig: any = {}

function buildPgUri(): string {
  if (processDELETE.DATABASE_URL) return processDELETE.DATABASE_URL
  const { host, port, user, password, database } = dbConfig
  const auth = user && password ? `${user}:${encodeURIComponent(password)}@` : user ? `${user}@` : ''
  return `postgresql://${auth}${host || 'localhost'}:${port || 5432}/${database || 'postgres'}`
}

function buildMysqlUri(): string {
  if (processDELETE.MYSQL_URL) return processDELETE.MYSQL_URL
  const { host, port, user, password, database } = dbConfig
  const auth = user && password ? `${user}:${encodeURIComponent(password)}@` : user ? `${user}@` : ''
  return `mysql://${auth}${host || 'localhost'}:${port || 3306}/${database || ''}`
}

function escapeSql(sql: string): string {
  return sql.replace(/"/g, '\\"').replace(/'/g, "\\'")
}

export default createMCPServer({
  name: 'database',
  version: '2.0.0',
  description: 'Enterprise SQL Database Toolkit - PostgreSQL, MySQL, SQLite querying, schema management and analytics',
  icon: '🗄️',
  author: 'MCP Expert Community'
})
  .addTool({
    name: 'db_configure',
    description: 'Configure database connection parameters with validation',
    parameters: {
      type: { type: 'string', description: 'Database type: postgres, mysql, sqlite', required: true },
      host: { type: 'string', description: 'Database host', required: false },
      port: { type: 'number', description: 'Database port', required: false },
      user: { type: 'string', description: 'Database username', required: false },
      password: { type: 'string', description: 'Database password', required: false },
      database: { type: 'string', description: 'Database name', required: false },
      filename: { type: 'string', description: 'SQLite database file path', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true, enum: ['postgres', 'mysql', 'sqlite'] },
        host: { type: 'string', required: false, default: 'localhost' },
        port: { type: 'number', required: false, default: 5432 },
        user: { type: 'string', required: false },
        password: { type: 'string', required: false },
        database: { type: 'string', required: false },
        filename: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid configuration parameters', validation.errors)

      dbConfig = validation.data

      if (validation.data.type === 'sqlite' && validation.data.filename) {
        dbConfig.filename = sanitizePath(validation.data.filename)
      }

      return formatSuccess({
        type: validation.data.type,
        message: 'Database configuration updated successfully',
        connection: validation.data.type === 'sqlite'
          ? dbConfig.filename
          : `${dbConfig.host}:${dbConfig.port}/${dbConfig.database || 'default'}`
      })
    }
  })
  .addTool({
    name: 'db_set_url',
    description: 'Set database connection URL with validation',
    parameters: {
      url: { type: 'string', description: 'Database connection URL (postgresql:// or mysql://)', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const url = validation.data.url

      if (url.startsWith('postgres')) {
        processDELETE.DATABASE_URL = url
        dbConfig.type = 'postgres'
        dbConfig.url = url
      } else if (url.startsWith('mysql')) {
        processDELETE.MYSQL_URL = url
        dbConfig.type = 'mysql'
        dbConfig.url = url
      } else {
        return formatError('Unsupported database URL scheme', { supported: ['postgresql://', 'mysql://'] })
      }

      return formatSuccess({
        type: dbConfig.type,
        message: 'Database connection URL configured successfully'
      })
    }
  })
  .addTool({
    name: 'db_test_connection',
    description: 'Test database connectivity',
    parameters: {},
    execute: async () => {
      if (!dbConfig.type) {
        return formatError('No database configured', 'Use db_configure first')
      }

      let result = ''
      try {
        if (dbConfig.type === 'postgres') {
          const uri = dbConfig.url || buildPgUri()
          result = await safeExec(`psql "${uri}" -c "SELECT 1 as connection_test" 2>&1`, 30000)
        } else if (dbConfig.type === 'mysql') {
          const uri = dbConfig.url || buildMysqlUri()
          result = await safeExec(`mysql -e "SELECT 1 as connection_test" 2>&1`, 30000)
        } else if (dbConfig.type === 'sqlite' && dbConfig.filename) {
          result = await safeExec(`sqlite3 "${dbConfig.filename}" "SELECT 1" 2>&1`, 30000)
        }

        const connected = !result.includes('Error') && !result.includes('failed') && result.includes('1')
        return formatSuccess({
          connected,
          type: dbConfig.type,
          message: connected ? 'Connection successful' : 'Connection failed',
          raw: result.substring(0, 500)
        })
      } catch (e: any) {
        return formatError('Connection test failed', e.message)
      }
    }
  })
  .addTool({
    name: 'db_query',
    description: 'Execute SQL query with safe parameter handling',
    parameters: {
      sql: { type: 'string', description: 'SQL query to execute', required: true },
      outputFormat: { type: 'string', description: 'Output format: json, csv, table', required: false },
      timeout: { type: 'number', description: 'Query timeout in ms', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sql: { type: 'string', required: true },
        outputFormat: { type: 'string', required: false, default: 'json', enum: ['json', 'csv', 'table'] },
        timeout: { type: 'number', required: false, default: 60000 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!dbConfig.type) {
        return formatError('No database configured', 'Use db_configure first')
      }

      let result = ''
      const { sql, outputFormat, timeout } = validation.data
      const safeSql = escapeSql(sql)

      try {
        if (dbConfig.type === 'postgres') {
          const uri = dbConfig.url || buildPgUri()
          const formatFlag = outputFormat === 'json' ? '--json' : outputFormat === 'csv' ? '--csv' : ''
          result = await safeExec(`psql "${uri}" -c "${safeSql}" ${formatFlag} 2>&1`, timeout)
        } else if (dbConfig.type === 'mysql') {
          result = await safeExec(`mysql -e "${safeSql}" 2>&1`, timeout)
        } else if (dbConfig.type === 'sqlite' && dbConfig.filename) {
          result = await safeExec(`sqlite3 "${dbConfig.filename}" "${safeSql}" 2>&1`, timeout)
        }

        const hasError = result.includes('Error') || result.includes('ERROR') || result.includes('failed')
        return formatSuccess({
          success: !hasError,
          format: outputFormat,
          result: result.substring(0, 8000),
          truncated: result.length > 8000,
          warning: hasError ? 'Query may have encountered errors' : undefined
        })
      } catch (e: any) {
        return formatError('Query execution failed', e.message)
      }
    }
  })
  .addTool({
    name: 'db_list_tables',
    description: 'List all tables with schema information',
    parameters: {
      schema: { type: 'string', description: 'Schema name (for PostgreSQL)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        schema: { type: 'string', required: false, default: 'public' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!dbConfig.type) {
        return formatError('No database configured', 'Use db_configure first')
      }

      let result = ''
      const schema = validation.data.schema

      try {
        if (dbConfig.type === 'postgres') {
          const uri = dbConfig.url || buildPgUri()
          result = await safeExec(`psql "${uri}" -c "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema = '${schema}' ORDER BY table_name;" 2>&1`, 30000)
        } else if (dbConfig.type === 'mysql') {
          result = await safeExec(`mysql -e "SHOW FULL TABLES;" 2>&1`, 30000)
        } else if (dbConfig.type === 'sqlite' && dbConfig.filename) {
          result = await safeExec(`sqlite3 "${dbConfig.filename}" ".tables" 2>&1`, 30000)
        }

        return formatSuccess({
          type: dbConfig.type,
          schema,
          tables: result.substring(0, 5000)
        })
      } catch (e: any) {
        return formatError('Failed to list tables', e.message)
      }
    }
  })
  .addTool({
    name: 'db_describe_table',
    description: 'Get detailed table schema with columns, types, and constraints',
    parameters: {
      table: { type: 'string', description: 'Table name', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        table: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!dbConfig.type) {
        return formatError('No database configured', 'Use db_configure first')
      }

      const table = validation.data.table
      let result = ''

      try {
        if (dbConfig.type === 'postgres') {
          const uri = dbConfig.url || buildPgUri()
          result = await safeExec(`psql "${uri}" -c "\\d ${table}" 2>&1`, 30000)
        } else if (dbConfig.type === 'mysql') {
          result = await safeExec(`mysql -e "DESCRIBE ${table}; SHOW INDEX FROM ${table};" 2>&1`, 30000)
        } else if (dbConfig.type === 'sqlite' && dbConfig.filename) {
          result = await safeExec(`sqlite3 "${dbConfig.filename}" ".schema ${table}" ".indexes ${table}" 2>&1`, 30000)
        }

        return formatSuccess({
          table,
          schema: result.substring(0, 5000)
        })
      } catch (e: any) {
        return formatError('Failed to describe table', e.message)
      }
    }
  })
  .addTool({
    name: 'db_dump',
    description: 'Create secure database dump/backup with options',
    parameters: {
      database: { type: 'string', description: 'Database name', required: false },
      outputFile: { type: 'string', description: 'Output dump file path', required: true },
      compress: { type: 'boolean', description: 'Compress with gzip', required: false },
      schemaOnly: { type: 'boolean', description: 'Schema only without data', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        database: { type: 'string', required: false },
        outputFile: { type: 'string', required: true },
        compress: { type: 'boolean', required: false, default: false },
        schemaOnly: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!dbConfig.type) {
        return formatError('No database configured', 'Use db_configure first')
      }

      const { outputFile, compress, schemaOnly } = validation.data
      const safeOutput = sanitizePath(outputFile)
      let result = ''

      try {
        if (dbConfig.type === 'postgres') {
          const uri = dbConfig.url || buildPgUri()
          const schemaFlag = schemaOnly ? '-s' : ''
          const compressPipe = compress ? ' | gzip' : ''
          result = await safeExec(`pg_dump "${uri}" ${schemaFlag} -f "${safeOutput}"${compressPipe} 2>&1`, 300000)
        } else if (dbConfig.type === 'mysql') {
          const schemaFlag = schemaOnly ? '--no-data' : ''
          const compressPipe = compress ? ' | gzip' : ''
          result = await safeExec(`mysqldump ${validation.data.database || ''} ${schemaFlag} > "${safeOutput}"${compressPipe} 2>&1`, 300000)
        } else if (dbConfig.type === 'sqlite' && dbConfig.filename) {
          const compressCmd = compress ? ' | gzip' : ''
          result = await safeExec(`sqlite3 "${dbConfig.filename}" ".dump" > "${safeOutput}"${compressCmd} 2>&1`, 300000)
        }

        const hasError = result.includes('Error') || result.includes('ERROR')
        return formatSuccess({
          success: !hasError,
          outputFile: safeOutput,
          compress,
          schemaOnly,
          message: hasError ? 'Dump may have encountered warnings' : 'Dump completed successfully',
          raw: result.substring(0, 500)
        })
      } catch (e: any) {
        return formatError('Database dump failed', e.message)
      }
    }
  })
  .addTool({
    name: 'db_export_csv',
    description: 'Export table or query results to CSV with formatting options',
    parameters: {
      table: { type: 'string', description: 'Table name to export', required: false },
      query: { type: 'string', description: 'Custom SELECT query to export', required: false },
      outputFile: { type: 'string', description: 'Output CSV file path', required: true },
      includeHeader: { type: 'boolean', description: 'Include CSV header row', required: false },
      delimiter: { type: 'string', description: 'Field delimiter character', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        table: { type: 'string', required: false },
        query: { type: 'string', required: false },
        outputFile: { type: 'string', required: true },
        includeHeader: { type: 'boolean', required: false, default: true },
        delimiter: { type: 'string', required: false, default: ',' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!validation.data.table && !validation.data.query) {
        return formatError('Either table or query must be specified', 'Provide table name or custom query')
      }

      if (!dbConfig.type) {
        return formatError('No database configured', 'Use db_configure first')
      }

      const safeOutput = sanitizePath(validation.data.outputFile)

      return formatSuccess({
        outputFile: safeOutput,
        table: validation.data.table,
        hasCustomQuery: !!validation.data.query,
        includeHeader: validation.data.includeHeader,
        delimiter: validation.data.delimiter,
        message: 'CSV export prepared - use database CLI tools for actual execution',
        commands: [
          `PostgreSQL: COPY (${validation.data.query || `SELECT * FROM ${validation.data.table}`}) TO '${safeOutput}' WITH (FORMAT CSV, HEADER);`,
          `MySQL: SELECT * FROM ${validation.data.table || '(QUERY)'} INTO OUTFILE '${safeOutput}' FIELDS TERMINATED BY '${validation.data.delimiter}' ENCLOSED BY '"' LINES TERMINATED BY '\\n';`
        ]
      })
    }
  })
  .build()
