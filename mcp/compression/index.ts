import { createMCPServer } from '../../packages/core/mcp/builder'
import * as zlib from 'zlib'
import { promisify } from 'util'

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)
const deflate = promisify(zlib.deflate)
const inflate = promisify(zlib.inflate)

function base64Encode(str: string): string {
  return Buffer.from(str).toString('base64')
}

function base64Decode(str: string): string {
  return Buffer.from(str, 'base64').toString('utf8')
}

export default createMCPServer({
  name: 'compression',
  version: '1.0.0',
  description: '压缩解压工具集 - gzip、deflate、base64编码、字符串压缩',
  author: 'MCP Expert Community',
  icon: '📦'
})
  .addTool({
    name: 'gzip_compress',
    description: 'Gzip压缩字符串',
    parameters: {
      input: { type: 'string', description: '输入字符串', required: true },
      level: { type: 'number', description: '压缩级别1-9', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const level = Number(params.level) || 6
      const compressed = await gzip(params.input, { level })
      const base64 = compressed.toString('base64')
      return {
        success: true,
        originalSize: Buffer.byteLength(params.input),
        compressedSize: compressed.length,
        compressionRatio: ((1 - compressed.length / Buffer.byteLength(params.input)) * 100).toFixed(2) + '%',
        base64
      }
    }
  })
  .addTool({
    name: 'gzip_decompress',
    description: 'Gzip解压',
    parameters: {
      input: { type: 'string', description: 'Base64编码的压缩数据', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const compressed = Buffer.from(params.input, 'base64')
      const decompressed = await gunzip(compressed)
      return {
        success: true,
        compressedSize: compressed.length,
        decompressedSize: decompressed.length,
        result: decompressed.toString('utf8')
      }
    }
  })
  .addTool({
    name: 'deflate_compress',
    description: 'Deflate压缩',
    parameters: {
      input: { type: 'string', description: '输入字符串', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const compressed = await deflate(params.input)
      const base64 = compressed.toString('base64')
      return {
        success: true,
        originalSize: Buffer.byteLength(params.input),
        compressedSize: compressed.length,
        compressionRatio: ((1 - compressed.length / Buffer.byteLength(params.input)) * 100).toFixed(2) + '%',
        base64
      }
    }
  })
  .addTool({
    name: 'deflate_decompress',
    description: 'Deflate解压',
    parameters: {
      input: { type: 'string', description: 'Base64编码的压缩数据', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const compressed = Buffer.from(params.input, 'base64')
      const decompressed = await inflate(compressed)
      return {
        success: true,
        result: decompressed.toString('utf8')
      }
    }
  })
  .addTool({
    name: 'simple_compress',
    description: '简单字符串压缩（重复字符优化）',
    parameters: {
      input: { type: 'string', description: '输入字符串', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const str = params.input
      let result = ''
      let count = 1
      for (let i = 0; i < str.length; i++) {
        if (str[i] === str[i + 1]) {
          count++
        } else {
          result += count > 1 ? count + str[i] : str[i]
          count = 1
        }
      }
      return {
        success: true,
        original: str,
        compressed: result,
        originalLength: str.length,
        compressedLength: result.length
      }
    }
  })
  .addTool({
    name: 'simple_decompress',
    description: '简单字符串解压',
    parameters: {
      input: { type: 'string', description: '压缩的字符串', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const str = params.input
      let result = ''
      let numStr = ''
      for (let i = 0; i < str.length; i++) {
        if (/\d/.test(str[i])) {
          numStr += str[i]
        } else {
          const count = parseInt(numStr) || 1
          result += str[i].repeat(count)
          numStr = ''
        }
      }
      return {
        success: true,
        compressed: str,
        decompressed: result
      }
    }
  })
  .build()
