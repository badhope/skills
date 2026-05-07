export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: string[]
  required?: boolean
  properties?: Record<string, ToolParameter>
  items?: ToolParameter
}

export type MiddlewareNext = () => Promise<any>

export interface ToolMiddleware {
  name: string
  priority?: number
  before?: (params: Record<string, any>, tool: ToolDefinition) => Promise<Record<string, any>>
  after?: (result: any, params: Record<string, any>, tool: ToolDefinition) => Promise<any>
  onError?: (error: Error, params: Record<string, any>, tool: ToolDefinition) => Promise<any>
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
  execute: (params: Record<string, any>) => Promise<any>
  timeout?: number
  category?: string
  tags?: string[]
  examples?: Array<{ params: Record<string, any>; description: string }>
}

export interface Resource {
  uri: string
  name: string
  description: string
  mimeType?: string
  get: () => Promise<string | object>
}

export interface PromptArgument {
  name: string
  description: string
  required?: boolean
  defaultValue?: any
}

export interface PromptDefinition {
  name: string
  description: string
  arguments?: PromptArgument[]
  generate: (args?: Record<string, any>) => Promise<string>
}

export interface CacheStrategy {
  ttl?: number
  key?: (params: Record<string, any>) => string
  invalidate?: string[]
}

export interface AuthConfig {
  type: 'apiKey' | 'oauth2' | 'bearer' | 'basic'
  envKey?: string
  header?: string
  validate?: (credentials: string) => Promise<boolean>
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  key?: (params: Record<string, any>) => string
}

export interface PluginHooks {
  preServerInit?: (config: MCPServerConfig) => Promise<MCPServerConfig>
  postServerInit?: (server: MCPServer) => Promise<MCPServer>
  preToolCall?: (toolName: string, params: Record<string, any>) => Promise<void>
  postToolCall?: (toolName: string, result: any) => Promise<void>
}

export interface MCPPlugin {
  name: string
  version: string
  author?: string
  hooks?: PluginHooks
  middleware?: ToolMiddleware[]
  tools?: ToolDefinition[]
  resources?: Resource[]
}

export interface MCPServerConfig {
  name: string
  version: string
  description: string
  author?: string
  icon?: string
  homepage?: string
  repository?: string
  license?: string
  metadata?: {
    categories?: string[]
    visibility?: 'public' | 'private'
    rating?: 'beginner' | 'intermediate' | 'advanced' | 'professional'
    features?: string[]
    tags?: string[]
  }
  cache?: CacheStrategy
  auth?: AuthConfig
  rateLimit?: RateLimitConfig
  plugins?: MCPPlugin[]
}

export interface MCPServer {
  config: MCPServerConfig
  tools: ToolDefinition[]
  resources: Resource[]
  prompts: PromptDefinition[]
}

export type ToolResult = {
  success: boolean
  data?: any
  error?: string
}

export type ResourceContent = {
  uri: string
  mimeType: string
  text: string
}

export type PromptGenerated = {
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
}

export interface SkillContext {
  currentFile: {
    path: string
    content: string
    language: string
  }
  ai: {
    chat: (prompt: string, options?: any) => Promise<string>
  }
  ide: {
    showNotification: (message: string, type?: string) => void
    showPanel: (content: string, title?: string) => void
  }
}

export interface SkillDefinition {
  name: string
  description: string
  icon?: string
  category?: string
  keywords?: string[]
  author?: string
  version?: string
  activationEvents?: string[]
  run: (context: SkillContext) => Promise<any>
}

export function defineSkill(def: SkillDefinition): SkillDefinition {
  return def
}
