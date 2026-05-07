import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'encoding',
  version: '2.0.0',
  description: 'Encoding toolkit - base64, url, html, hex, jwt, hash, and compression utilities',
  author: 'MCP Expert Community',
  icon: '🔐'
})
  .addTool({
    name: 'enc_base64',
    description: 'Base64 encode/decode with file and URL-safe variants',
    parameters: {
      input: { type: 'string', description: 'Input text', required: true },
      mode: { type: 'string', description: 'encode|decode', required: true },
      urlSafe: { type: 'boolean', description: 'URL-safe base64', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        mode: { type: 'string', required: true },
        urlSafe: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        let result
        if (validation.data.mode === 'encode') {
          result = Buffer.from(validation.data.input).toString('base64')
          if (validation.data.urlSafe) result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        } else {
          let input = validation.data.input.replace(/-/g, '+').replace(/_/g, '/')
          while (input.length % 4) input += '='
          result = Buffer.from(input, 'base64').toString('utf-8')
        }
        return formatSuccess({
          result,
          stats: { inputSize: validation.data.input.length, outputSize: result.length }
        })
      } catch (e: any) {
        return formatError('Base64 error', { message: e.message })
      }
    }
  })
  .addTool({
    name: 'enc_hash',
    description: 'Generate MD5, SHA-1, SHA-256, SHA-512 hashes with HMAC support',
    parameters: {
      input: { type: 'string', description: 'Input text', required: true },
      algorithm: { type: 'string', description: 'md5|sha1|sha256|sha512', required: true },
      hmacKey: { type: 'string', description: 'HMAC secret key', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        algorithm: { type: 'string', required: true },
        hmacKey: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const crypto = await import('crypto')
      const hash = validation.data.hmacKey
        ? crypto.createHmac(validation.data.algorithm, validation.data.hmacKey).update(validation.data.input).digest('hex')
        : crypto.createHash(validation.data.algorithm).update(validation.data.input).digest('hex')

      return formatSuccess({
        hash,
        algorithm: validation.data.algorithm,
        hmac: !!validation.data.hmacKey
      })
    }
  })
  .addTool({
    name: 'enc_url',
    description: 'URL encode/decode with component and full URL modes',
    parameters: {
      input: { type: 'string', description: 'URL or component', required: true },
      mode: { type: 'string', description: 'encode|decode', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        mode: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const result = validation.data.mode === 'encode'
        ? encodeURIComponent(validation.data.input)
        : decodeURIComponent(validation.data.input)

      return formatSuccess({ result })
    }
  })
  .addTool({
    name: 'jwt_decode',
    description: 'Decode and inspect JWT token structure and claims',
    parameters: {
      token: { type: 'string', description: 'JWT token', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        token: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const parts = validation.data.token.split('.')
      if (parts.length !== 3) return formatError('Invalid JWT format')

      try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString())
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())

        return formatSuccess({
          header,
          payload,
          info: {
            algorithm: header.alg,
            type: header.typ,
            issuer: payload.iss,
            subject: payload.sub,
            issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
            expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
            expired: payload.exp ? Date.now() > payload.exp * 1000 : false
          }
        })
      } catch {
        return formatError('Failed to decode JWT')
      }
    }
  })
  .build()
