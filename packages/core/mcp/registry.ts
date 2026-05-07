import { MCPServer, ToolMiddleware, MCPPlugin } from './types'
import { callTool, getResource, generatePrompt } from './builder'
import fs from 'fs/promises'
import path from 'path'

export const LoggingMiddleware: ToolMiddleware = {
  name: 'logging',
  priority: 10,
  before: async (params, tool) => {
    console.log(`[MCP] Executing ${tool.name} with params:`, Object.keys(params))
    return params
  },
  after: async (result, params, tool) => {
    console.log(`[MCP] Completed ${tool.name}`)
    return result
  }
}

export const ErrorHandlerMiddleware: ToolMiddleware = {
  name: 'error-handler',
  priority: 1,
  onError: async (error, params, tool) => {
    console.error(`[MCP] Error in ${tool.name}:`, error.message)
    return {
      success: false,
      error: error.message,
      tool: tool.name
    }
  }
}

export const ValidationMiddleware: ToolMiddleware = {
  name: 'validation',
  priority: 50,
  before: async (params, tool) => {
    for (const [key, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && params[key] === undefined) {
        throw new Error(`Missing required parameter: ${key}`)
      }
    }
    return params
  }
}

export const TimeoutMiddleware = (timeoutMs: number = 30000): ToolMiddleware => ({
  name: 'timeout',
  priority: 20,
  before: async (params, tool) => {
    const timeout = tool.timeout || timeoutMs
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tool ${tool.name} timed out after ${timeout}ms`)), timeout)
    })
    return params
  }
})

export const CorePlugins: Record<string, MCPPlugin> = {
  metrics: {
    name: 'metrics',
    version: '1.0.0',
    middleware: [LoggingMiddleware, ErrorHandlerMiddleware]
  },
  validation: {
    name: 'validation',
    version: '1.0.0',
    middleware: [ValidationMiddleware]
  }
}

export class MCPRegistry {
  private servers: Map<string, MCPServer> = new Map()

  register(serverId: string, server: MCPServer): void {
    this.servers.set(serverId, server)
  }

  unregister(serverId: string): boolean {
    return this.servers.delete(serverId)
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId)
  }

  listServers(): Array<{ id: string; config: MCPServer['config'] }> {
    return Array.from(this.servers.entries()).map(([id, server]) => ({
      id,
      config: server.config
    }))
  }

  listAllTools(): Array<{ serverId: string; name: string; description: string }> {
    const result: Array<{ serverId: string; name: string; description: string }> = []
    for (const [serverId, server] of this.servers.entries()) {
      for (const tool of server.tools) {
        result.push({
          serverId,
          name: tool.name,
          description: tool.description
        })
      }
    }
    return result
  }

  listAllPrompts(): Array<{ serverId: string; name: string; description: string }> {
    const result: Array<{ serverId: string; name: string; description: string }> = []
    for (const [serverId, server] of this.servers.entries()) {
      for (const prompt of server.prompts) {
        result.push({
          serverId,
          name: prompt.name,
          description: prompt.description
        })
      }
    }
    return result
  }

  async callTool(serverId: string, toolName: string, params: Record<string, any>) {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`MCP Server ${serverId} not found`)
    return callTool(server, toolName, params)
  }

  async getResource(serverId: string, uri: string) {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`MCP Server ${serverId} not found`)
    return getResource(server, uri)
  }

  async generatePrompt(serverId: string, promptName: string, args?: Record<string, any>) {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`MCP Server ${serverId} not found`)
    return generatePrompt(server, promptName, args)
  }
}

export const globalMCPRegistry = new MCPRegistry()

export async function loadMCPFromDirectory(
  dirPath: string
): Promise<MCPServer | null> {
  try {
    const indexPath = path.join(dirPath, 'index.ts')
    const stats = await fs.stat(indexPath).catch(() => null)
    
    if (!stats) return null
    
    const module = await import(indexPath)
    if (module.default && module.default.config) {
      return module.default as MCPServer
    }
    return null
  } catch (e) {
    console.error(`Failed to load MCP from ${dirPath}:`, e)
    return null
  }
}
