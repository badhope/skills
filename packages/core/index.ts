export * from './mcp/types'
export * from './mcp/builder'
export * from './mcp/registry'
export * from './shared'
export * from './skill'

import { globalMCPRegistry } from './mcp/registry'
import { globalSkillRegistry, globalSkillLoader, globalSkillOrchestrator, globalToolDiscovery, globalToolExecutor, globalErrorHandler, globalMonitor, globalAgentRunner, globalAgentMemory } from './skill'

const MCP_MODULES = {
  aliyun: () => import('../../mcp/aliyun/index'),
  aws: () => import('../../mcp/aws/index'),
  auth: () => import('../../mcp/auth/index'),
  bitbucket: () => import('../../mcp/bitbucket/index'),
  cloudflare: () => import('../../mcp/cloudflare/index'),
  clarify: () => import('../../mcp/clarify/index'),
  'agent-coordinator': () => import('../../mcp/agent-coordinator/index'),
  'agent-devkit': () => import('../../mcp/agent-devkit/index'),
  'agent-multi': () => import('../../mcp/agent-multi/index'),
  'agent-persistence': () => import('../../mcp/agent-persistence/index'),
  'agent-reflection': () => import('../../mcp/agent-reflection/index'),
  'agent-unified-toolkit': () => import('../../mcp/agent-unified-toolkit/index'),
  'consistency-manager': () => import('../../mcp/consistency-manager/index'),
  'code-generator': () => import('../../mcp/code-generator/index'),
  'code-review': () => import('../../mcp/code-review/index'),
  'coding-workflow': () => import('../../mcp/coding-workflow/index'),
  database: () => import('../../mcp/database/index'),
  'data-crawler': () => import('../../mcp/data-crawler/index'),
  'debugging-workflow': () => import('../../mcp/debugging-workflow/index'),
  'dependency-analyzer': () => import('../../mcp/dependency-analyzer/index'),
  docker: () => import('../../mcp/docker/index'),
  documentation: () => import('../../mcp/documentation/index'),
  filesystem: () => import('../../mcp/filesystem/index'),
  git: () => import('../../mcp/git/index'),
  gitee: () => import('../../mcp/gitee/index'),
  github: () => import('../../mcp/github/index'),
  gitlab: () => import('../../mcp/gitlab/index'),
  images: () => import('../../mcp/images/index'),
  jira: () => import('../../mcp/jira/index'),
  kubernetes: () => import('../../mcp/kubernetes/index'),
  libraries: () => import('../../mcp/libraries/index'),
  memory: () => import('../../mcp/memory/index'),
  'message-bus': () => import('../../mcp/message-bus/index'),
  mongodb: () => import('../../mcp/mongodb/index'),
  monitoring: () => import('../../mcp/monitoring/index'),
  network: () => import('../../mcp/network/index'),
  openai: () => import('../../mcp/openai/index'),
  pdf: () => import('../../mcp/pdf/index'),
  'performance-optimizer': () => import('../../mcp/performance-optimizer/index'),
  protocol: () => import('../../mcp/protocol/index'),
  puppeteer: () => import('../../mcp/puppeteer/index'),
  proxy: () => import('../../mcp/proxy/index'),
  react: () => import('../../mcp/react/index'),
  redis: () => import('../../mcp/redis/index'),
  'refactoring-workflow': () => import('../../mcp/refactoring-workflow/index'),
  search: () => import('../../mcp/search/index'),
  'security-auditor': () => import('../../mcp/security-auditor/index'),
  secrets: () => import('../../mcp/secrets/index'),
  sentry: () => import('../../mcp/sentry/index'),
  spreadsheet: () => import('../../mcp/spreadsheet/index'),
  ssh: () => import('../../mcp/ssh/index'),
  terminal: () => import('../../mcp/terminal/index'),
  'test-generator': () => import('../../mcp/test-generator/index'),
  'tool-registry': () => import('../../mcp/tool-registry/index'),
  typescript: () => import('../../mcp/typescript/index'),
  vercel: () => import('../../mcp/vercel/index'),
  'academic-writing': () => import('../../mcp/academic-writing/index'),
  'agent-autonomous': () => import('../../mcp/agent-autonomous/index'),
  'all-in-one-dev': () => import('../../mcp/all-in-one-dev/index'),
  'api-dev': () => import('../../mcp/api-dev/index'),
  'aws-dev': () => import('../../mcp/aws-dev/index'),
  'backend-dev-kit': () => import('../../mcp/backend-dev-kit/index'),
  'browser-automation': () => import('../../mcp/browser-automation/index'),
  colors: () => import('../../mcp/colors/index'),
  compression: () => import('../../mcp/compression/index'),
  'core-dev-kit': () => import('../../mcp/core-dev-kit/index'),
  csv: () => import('../../mcp/csv/index'),
  datetime: () => import('../../mcp/datetime/index'),
  'dependency-analyzer': () => import('../../mcp/dependency-analyzer/index'),
  diff: () => import('../../mcp/diff/index'),
  'frontend-dev-kit': () => import('../../mcp/frontend-dev-kit/index'),
  fun: () => import('../../mcp/fun/index'),
  'game-dev-toolkit': () => import('../../mcp/game-dev-toolkit/index'),
  json: () => import('../../mcp/json/index'),
  'library-manager': () => import('../../mcp/library-manager/index'),
  markdown: () => import('../../mcp/markdown/index'),
  math: () => import('../../mcp/math/index'),
  'observability-mq': () => import('../../mcp/observability-mq/index'),
  'qa-dev-kit': () => import('../../mcp/qa-dev-kit/index'),
  random: () => import('../../mcp/random/index'),
  'regex': () => import('../../mcp/regex/index'),
  'search-tools': () => import('../../mcp/search-tools/index'),
  'search-pdf-advanced': () => import('../../mcp/search-pdf-advanced/index'),
  'site-generator': () => import('../../mcp/site-generator/index'),
  'system-admin': () => import('../../mcp/system-admin/index'),
  template: () => import('../../mcp/template/index'),
  'thinking': () => import('../../mcp/thinking/index'),
  'ui-design-kit': () => import('../../mcp/ui-design-kit/index'),
  'web-crawler': () => import('../../mcp/web-crawler/index'),
  'web-search': () => import('../../mcp/web-search/index'),
  'website-builder': () => import('../../mcp/website-builder/index'),
  yaml: () => import('../../mcp/yaml/index')
}

export async function registerAllMCP(
  filter?: (name: string) => boolean
): Promise<{ registered: string[]; failed: string[] }> {
  const registered: string[] = []
  const failed: string[] = []

  for (const [name, loader] of Object.entries(MCP_MODULES)) {
    if (filter && !filter(name)) continue

    try {
      const module = await loader()
      let serverOrBuilder = module.default || module

      if ('build' in serverOrBuilder && typeof serverOrBuilder.build === 'function') {
        serverOrBuilder = serverOrBuilder.build()
      }

      const server = serverOrBuilder as any

      if (server && server.config) {
        globalMCPRegistry.register(name, server)
        registered.push(name)
      }
    } catch (e) {
      failed.push(name)
    }
  }

  return { registered, failed }
}

export async function registerMCP(name: keyof typeof MCP_MODULES): Promise<boolean> {
  const loader = MCP_MODULES[name]
  if (!loader) return false

  try {
    const module = await loader()
    let serverOrBuilder = module.default || module

    if ('build' in serverOrBuilder && typeof serverOrBuilder.build === 'function') {
      serverOrBuilder = serverOrBuilder.build()
    }

    const server = serverOrBuilder as any

    if (server && server.config) {
      globalMCPRegistry.register(name, server)
      return true
    }
    return false
  } catch (e) {
    return false
  }
}

export async function loadSkillsFromDirectory(dirPath: string): Promise<{ loaded: number; failed: number }> {
  const loader = globalSkillLoader
  const registry = globalSkillRegistry
  let loaded = 0
  let failed = 0

  try {
    const skills = await loader.loadFromSkillDir(dirPath)
    for (const skill of skills) {
      registry.registerSkill(skill)
      loaded++
    }
  } catch (error) {
    failed++
    console.error('Failed to load skills:', error)
  }

  return { loaded, failed }
}

export async function initializePlatform(
  skillDirPath?: string
): Promise<{
  mcp: { registered: string[]; failed: string[] }
  skills: { loaded: number; failed: number }
}> {
  const mcpResult = await registerAllMCP()
  const skillResult = skillDirPath ? await loadSkillsFromDirectory(skillDirPath) : { loaded: 0, failed: 0 }

  return { mcp: mcpResult, skills: skillResult }
}

export { globalMCPRegistry }
export {
  globalSkillRegistry,
  globalSkillLoader,
  globalSkillOrchestrator,
  globalToolDiscovery,
  globalToolExecutor,
  globalErrorHandler,
  globalMonitor,
  globalAgentRunner,
  globalAgentMemory
}

export function listInstalledMCP() {
  return globalMCPRegistry.listServers()
}

export function listAllTools() {
  return globalMCPRegistry.listAllTools()
}

export function listAllPrompts() {
  return globalMCPRegistry.listAllPrompts()
}

export function getAvailableMCPCount(): number {
  return Object.keys(MCP_MODULES).length
}

export function listAllSkills() {
  return globalSkillRegistry.getAllSkills()
}

export function findSkills(taskDescription: string) {
  return globalSkillRegistry.suggestSkills(taskDescription)
}

export async function executeSkill(taskDescription: string) {
  return globalAgentRunner.run(taskDescription)
}

export function discoverTools(taskDescription: string) {
  return globalToolDiscovery.discoverTools(taskDescription)
}

export async function diagnoseTask(taskDescription: string) {
  return globalAgentRunner.diagnose(taskDescription)
}

export function getPerformanceReport() {
  return globalMonitor.getPerformanceReport()
}

export function getErrorStats() {
  return globalErrorHandler.getErrorStats()
}

export interface ProcessResult {
  success: boolean;
  taskId: string;
  skillName: string;
  steps: any[];
  result: any;
  message?: string;
}

export async function processUserRequest(userInput: string): Promise<ProcessResult> {
  const startTime = Date.now()

  console.log(`[SkillSystem] Processing user request: "${userInput}"`)

  try {
    const analysis = globalSkillOrchestrator.analyzeTask(userInput)
    console.log(`[SkillSystem] Task analysis - Complexity: ${analysis.complexity}, Skill: ${analysis.matchedSkill}`)

    const tools = globalToolDiscovery.discoverTools(userInput)
    console.log(`[SkillSystem] Discovered ${tools.length} relevant tools`)

    const taskResult = await globalSkillOrchestrator.executeTask(userInput)

    if (!taskResult.success) {
      console.log(`[SkillSystem] Task failed: ${taskResult.error}`)

      await globalAgentMemory.remember({
        taskId: `task-${Date.now()}`,
        input: userInput,
        output: taskResult.error || 'Failed',
        skillUsed: analysis.matchedSkill,
        context: { complexity: analysis.complexity, factors: analysis.factors },
        tags: ['failed', analysis.matchedSkill]
      })

      return {
        success: false,
        taskId: `task-${Date.now()}`,
        skillName: analysis.matchedSkill,
        steps: taskResult.steps || [],
        result: taskResult.error,
        message: taskResult.error
      }
    }

    await globalAgentMemory.remember({
      taskId: `task-${Date.now()}`,
      input: userInput,
      output: JSON.stringify(taskResult.data),
      skillUsed: analysis.matchedSkill,
      context: { complexity: analysis.complexity, factors: analysis.factors },
      tags: ['success', analysis.matchedSkill]
    })

    const duration = Date.now() - startTime
    console.log(`[SkillSystem] Task completed in ${duration}ms`)

    return {
      success: true,
      taskId: `task-${Date.now()}`,
      skillName: analysis.matchedSkill,
      steps: taskResult.steps || [],
      result: taskResult.data,
      message: `Task completed successfully in ${duration}ms`
    }
  } catch (error) {
    console.error(`[SkillSystem] Unexpected error:`, error)

    await globalAgentMemory.remember({
      taskId: `task-${Date.now()}`,
      input: userInput,
      output: error instanceof Error ? error.message : 'Unknown error',
      skillUsed: 'error',
      context: {},
      tags: ['error']
    })

    return {
      success: false,
      taskId: `task-${Date.now()}`,
      skillName: 'error',
      steps: [],
      result: error instanceof Error ? error.message : 'Unknown error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function runSkillSystem(): Promise<void> {
  console.log('🚀 Initializing Skill System...')

  const result = await initializePlatform('./.agent-skills/skills')

  console.log(`✅ MCP Tools Registered: ${result.mcp.registered.length}`)
  if (result.mcp.failed.length > 0) {
    console.log(`⚠️ MCP Tools Failed: ${result.mcp.failed.length}`)
  }

  console.log(`✅ Skills Loaded: ${result.skills.loaded}`)
  if (result.skills.failed > 0) {
    console.log(`⚠️ Skills Failed: ${result.skills.failed}`)
  }

  console.log('✨ Skill System is ready!')
  console.log('💡 Usage: processUserRequest("your task description")')
}

export async function getSystemInfo() {
  const skills = listAllSkills()
  const tools = listAllTools()
  const mcpServers = listInstalledMCP()
  const memoryStats = await globalAgentMemory.getStats()

  return {
    skills: skills.length,
    tools: tools.length,
    mcpServers: mcpServers.length,
    memory: memoryStats
  }
}