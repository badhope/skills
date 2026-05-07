import { 
  MCPServerConfig, 
  ToolDefinition, 
  Resource, 
  PromptDefinition, 
  MCPServer,
  ToolResult,
  ToolMiddleware,
  MCPPlugin
} from './types'

export class MCPServerBuilder {
  private config: MCPServerConfig
  private tools: ToolDefinition[] = []
  private resources: Resource[] = []
  private prompts: PromptDefinition[] = []
  private middleware: ToolMiddleware[] = []
  private plugins: MCPPlugin[] = []
  private cache: Map<string, { data: any; expires: number }> = new Map()

  constructor(config: MCPServerConfig) {
    this.config = {
      ...config,
      author: config.author || 'MCP Expert Community',
      homepage: config.homepage || 'https://mcp-agents.dev',
      repository: config.repository || 'https://github.com/mcp-agents/universal-skills',
      license: config.license || 'Apache-2.0',
      metadata: {
        visibility: 'public',
        rating: 'intermediate',
        categories: config.metadata?.categories || ['Development'],
        features: config.metadata?.features || [],
        tags: config.metadata?.tags || [],
        ...config.metadata
      }
    }
  }

  withMetadata(options: {
    categories?: string[]
    rating?: 'beginner' | 'intermediate' | 'advanced' | 'professional'
    features?: string[]
    tags?: string[]
  }): this {
    this.config.metadata = {
      ...this.config.metadata,
      ...options
    }
    return this
  }

  addTool(tool: ToolDefinition): this {
    this.tools.push(tool)
    return this
  }

  addResource(resource: Resource): this {
    this.resources.push(resource)
    return this
  }

  addPrompt(prompt: PromptDefinition): this {
    this.prompts.push(prompt)
    return this
  }

  use(middleware: ToolMiddleware): this {
    this.middleware.push({
      priority: 100,
      ...middleware
    })
    this.middleware.sort((a, b) => (a.priority || 100) - (b.priority || 100))
    return this
  }

  usePlugin(plugin: MCPPlugin): this {
    this.plugins.push(plugin)
    if (plugin.middleware) {
      plugin.middleware.forEach(m => this.use(m))
    }
    if (plugin.tools) {
      plugin.tools.forEach(t => this.addTool(t))
    }
    if (plugin.resources) {
      plugin.resources.forEach(r => this.addResource(r))
    }
    return this
  }

  withCache(ttlSeconds: number = 300): this {
    this.config.cache = {
      ttl: ttlSeconds * 1000
    }
    return this
  }

  withRateLimit(maxRequests: number, windowMinutes: number = 1): this {
    this.config.rateLimit = {
      maxRequests,
      windowMs: windowMinutes * 60 * 1000
    }
    return this
  }

  withAuth(type: 'apiKey' | 'bearer', envKey: string): this {
    this.config.auth = { type, envKey }
    return this
  }

  private async applyMiddlewareChain(
    tool: ToolDefinition,
    params: Record<string, any>
  ): Promise<any> {
    let currentParams = { ...params }
    
    for (const mw of this.middleware) {
      if (mw.before) {
        currentParams = await mw.before(currentParams, tool)
      }
    }

    try {
      const cacheKey = this.config.cache?.key?.(currentParams) || 
                      `${tool.name}:${JSON.stringify(currentParams)}`
      
      if (this.config.cache?.ttl) {
        const cached = this.cache.get(cacheKey)
        if (cached && cached.expires > Date.now()) {
          return cached.data
        }
      }

      let result = await tool.execute(currentParams)

      for (const mw of this.middleware.slice().reverse()) {
        if (mw.after) {
          result = await mw.after(result, currentParams, tool)
        }
      }

      if (this.config.cache?.ttl) {
        this.cache.set(cacheKey, {
          data: result,
          expires: Date.now() + this.config.cache.ttl
        })
      }

      return result
    } catch (e: any) {
      for (const mw of this.middleware) {
        if (mw.onError) {
          return mw.onError(e, currentParams, tool)
        }
      }
      throw e
    }
  }

  build(): MCPServer {
    const wrappedTools = this.tools.map(tool => ({
      ...tool,
      execute: async (params: Record<string, any>) => {
        return this.applyMiddlewareChain(tool, params)
      }
    }))

    return {
      config: this.config,
      tools: wrappedTools,
      resources: this.resources,
      prompts: this.prompts,
      $builder: this
    } as any
  }
}

export function createMCPServer(config: MCPServerConfig): MCPServerBuilder {
  return new MCPServerBuilder(config)
}

export async function callTool(
  server: MCPServer, 
  toolName: string, 
  params: Record<string, any>
): Promise<ToolResult> {
  try {
    const tool = server.tools.find((t: ToolDefinition) => t.name === toolName)
    if (!tool) {
      return { success: false, error: `Tool ${toolName} not found` }
    }
    const data = await tool.execute(params)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function getResource(
  server: MCPServer, 
  uri: string
): Promise<ToolResult> {
  try {
    const resource = server.resources.find((r: Resource) => r.uri === uri)
    if (!resource) {
      return { success: false, error: `Resource ${uri} not found` }
    }
    const data = await resource.get()
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function generatePrompt(
  server: MCPServer, 
  promptName: string,
  args?: Record<string, any>
): Promise<ToolResult> {
  try {
    const prompt = server.prompts.find((p: PromptDefinition) => p.name === promptName)
    if (!prompt) {
      return { success: false, error: `Prompt ${promptName} not found` }
    }
    const data = await prompt.generate(args)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
