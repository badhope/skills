import crypto from 'crypto';
import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'random',
  version: '2.0.0',
  description: 'Random generation toolkit - numbers, strings, UUID, passwords, colors, datasets',
  author: 'MCP Expert Community',
  icon: '🎲'
})
  .addTool({
    name: 'rand_int',
    description: 'Generate random integer(s) with range and seed support',
    parameters: {
      min: { type: 'number', description: 'Minimum value', required: true },
      max: { type: 'number', description: 'Maximum value', required: true },
      count: { type: 'number', description: 'Number of values', required: false },
      unique: { type: 'boolean', description: 'Unique values', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        min: { type: 'number', required: true },
        max: { type: 'number', required: true },
        count: { type: 'number', required: false, default: 1 },
        unique: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const min = validation.data.min
      const max = validation.data.max
      const count = validation.data.count
      const results: number[] = []
      const range = max - min + 1

      for (let i = 0; i < count; i++) {
        let n
        do {
          n = Math.floor(Math.random() * range) + min
        } while (validation.data.unique && results.includes(n))
        results.push(n)
      }

      return formatSuccess({
        numbers: count === 1 ? results[0] : results,
        range: { min, max },
        seed: Math.random()
      })
    }
  })
  .addTool({
    name: 'rand_string',
    description: 'Generate random string with custom charset',
    parameters: {
      length: { type: 'number', description: 'String length', required: true },
      charset: { type: 'string', description: 'alphanumeric|hex|base64|custom', required: false },
      prefix: { type: 'string', description: 'Custom characters', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        length: { type: 'number', required: true },
        charset: { type: 'string', required: false, default: 'alphanumeric' },
        prefix: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const charsets: Record<string, string> = {
        alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        hex: '0123456789abcdef',
        numeric: '0123456789',
        letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
      }
      const set = charsets[validation.data.charset] || charsets.alphanumeric
      let result = ''
      for (let i = 0; i < validation.data.length; i++) {
        result += set[Math.floor(Math.random() * set.length)]
      }

      return formatSuccess({ string: validation.data.prefix + result })
    }
  })
  .addTool({
    name: 'rand_uuid',
    description: 'Generate UUID v4 and custom format',
    parameters: {
      count: { type: 'number', description: 'Number of UUIDs', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        count: { type: 'number', required: false, default: 1 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const generate = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })

      const uuids = Array.from({ length: validation.data.count }, generate)
      return formatSuccess({
        uuids: validation.data.count === 1 ? uuids[0] : uuids
      })
    }
  })
  .addTool({
    name: 'rand_password',
    description: 'Generate secure password with policy compliance',
    parameters: {
      length: { type: 'number', description: 'Password length', required: true },
      numbers: { type: 'boolean', description: 'Include numbers', required: false },
      symbols: { type: 'boolean', description: 'Include symbols', required: false },
      uppercase: { type: 'boolean', description: 'Include uppercase', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        length: { type: 'number', required: true },
        numbers: { type: 'boolean', required: false, default: true },
        symbols: { type: 'boolean', required: false, default: true },
        uppercase: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let charset = 'abcdefghijklmnopqrstuvwxyz'
      if (validation.data.uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      if (validation.data.numbers) charset += '0123456789'
      if (validation.data.symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.?'

      let password = ''
      const randomBytes = crypto.randomBytes(validation.data.length)
      for (let i = 0; i < validation.data.length; i++) {
        password += charset[randomBytes[i] % charset.length]
      }

      return formatSuccess({
        password,
        policy: { length: validation.data.length, numbers: validation.data.numbers }
      })
    }
  })
  .build()
