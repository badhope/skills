import { createMCPServer } from '../packages/core/mcp/builder'

const modules: Record<string, () => Promise<any>> = {
  'academic-writing': () => import('./academic-writing'),
  'agent-autonomous': () => import('./agent-autonomous'),
  'agent-multi': () => import('./agent-multi'),
  'agent-reflection': () => import('./agent-reflection'),
  'agent-devkit': () => import('./agent-devkit'),
  'agent-unified-toolkit': () => import('./agent-unified-toolkit'),
  'agent-persistence': () => import('./agent-persistence'),
  'agent-coordinator': () => import('./agent-coordinator'),
  'aliyun': () => import('./aliyun'),
  'all-in-one-dev': () => import('./all-in-one-dev'),
  'api-dev': () => import('./api-dev'),
  'auth': () => import('./auth'),
  'aws': () => import('./aws'),
  'aws-dev': () => import('./aws-dev'),
  'backend-dev-kit': () => import('./backend-dev-kit'),
  'bitbucket': () => import('./bitbucket'),
  'browser-automation': () => import('./browser-automation'),
  'clarify': () => import('./clarify'),
  'cloudflare': () => import('./cloudflare'),
  'code-generator': () => import('./code-generator'),
  'code-rag': () => import('./code-rag'),
  'code-review': () => import('./code-review'),
  'coding-workflow': () => import('./coding-workflow'),
  'colors': () => import('./colors'),
  'compression': () => import('./compression'),
  'consistency-manager': () => import('./consistency-manager'),
  'core-dev-kit': () => import('./core-dev-kit'),
  'csv': () => import('./csv'),
  'data-crawler': () => import('./data-crawler'),
  'database': () => import('./database'),
  'datetime': () => import('./datetime'),
  'debugging-workflow': () => import('./debugging-workflow'),
  'dependency-analyzer': () => import('./dependency-analyzer'),
  'diff': () => import('./diff'),
  'docker': () => import('./docker'),
  'documentation': () => import('./documentation'),
  'encoding': () => import('./encoding'),
  'env': () => import('./env'),
  'filesystem': () => import('./filesystem'),
  'frontend-dev-kit': () => import('./frontend-dev-kit'),
  'fun': () => import('./fun'),
  'game-dev-toolkit': () => import('./game-dev-toolkit'),
  'git': () => import('./git'),
  'gitee': () => import('./gitee'),
  'github': () => import('./github'),
  'gitlab': () => import('./gitlab'),
  'images': () => import('./images'),
  'jira': () => import('./jira'),
  'json': () => import('./json'),
  'kubernetes': () => import('./kubernetes'),
  'libraries': () => import('./libraries'),
  'library-manager': () => import('./library-manager'),
  'markdown': () => import('./markdown'),
  'math': () => import('./math'),
  'memory': () => import('./memory'),
  'message-bus': () => import('./message-bus'),
  'mongodb': () => import('./mongodb'),
  'monitoring': () => import('./monitoring'),
  'network': () => import('./network'),
  'observability-mq': () => import('./observability-mq'),
  'openai': () => import('./openai'),
  'pdf': () => import('./pdf'),
  'performance-optimizer': () => import('./performance-optimizer'),
  'protocol': () => import('./protocol'),
  'puppeteer': () => import('./puppeteer'),
  'proxy': () => import('./proxy'),
  'qa-dev-kit': () => import('./qa-dev-kit'),
  'random': () => import('./random'),
  'react': () => import('./react'),
  'redis': () => import('./redis'),
  'refactoring-workflow': () => import('./refactoring-workflow'),
  'regex': () => import('./regex'),
  'search': () => import('./search'),
  'search-pdf-advanced': () => import('./search-pdf-advanced'),
  'search-tools': () => import('./search-tools'),
  'security-auditor': () => import('./security-auditor'),
  'secrets': () => import('./secrets'),
  'sentry': () => import('./sentry'),
  'site-generator': () => import('./site-generator'),
  'spreadsheet': () => import('./spreadsheet'),
  'ssh': () => import('./ssh'),
  'system-admin': () => import('./system-admin'),
  'template': () => import('./template'),
  'terminal': () => import('./terminal'),
  'test-generator': () => import('./test-generator'),
  'testing-toolkit': () => import('./testing-toolkit'),
  'thinking': () => import('./thinking'),
  'tool-registry': () => import('./tool-registry'),
  'typescript': () => import('./typescript'),
  'ui-design-kit': () => import('./ui-design-kit'),
  'vercel': () => import('./vercel'),
  'web-crawler': () => import('./web-crawler'),
  'web-search': () => import('./web-search'),
  'website-builder': () => import('./website-builder'),
  'yaml': () => import('./yaml'),
}

export async function loadMCPModule(name: string) {
  const loader = modules[name]
  if (loader) {
    const module = await loader()
    return module.default
  }
  throw new Error(`MCP module not found: ${name}. Available: ${Object.keys(modules).join(', ')}`)
}

export function listAvailableModules() {
  return Object.keys(modules)
}

export function getModuleCategories() {
  return {
    engines: {
      'fullstack-engine': ['core-dev-kit', 'all-in-one-dev', 'template', 'code-generator', 'diff', 'library-manager'],
      'bug-hunter': ['debugging-workflow', 'dependency-analyzer'],
      'security-auditor': ['security-auditor', 'code-review', 'secrets', 'auth'],
      'devops-engineer': [
        'docker', 'kubernetes', 'git', 'github', 'gitlab', 'gitee', 'bitbucket',
        'aws', 'aws-dev', 'aliyun', 'cloudflare', 'vercel', 'sentry', 'observability-mq',
        'ssh', 'terminal', 'system-admin', 'network', 'proxy', 'consistency-manager',
        'monitoring'
      ],
      'code-quality-expert': ['refactoring-workflow', 'coding-workflow', 'code-rag'],
      'ai-agent-architect': [
        'agent-autonomous', 'agent-multi', 'agent-reflection', 'thinking', 'memory', 'openai', 
        'clarify', 'agent-devkit', 'agent-unified-toolkit', 'agent-coordinator', 'message-bus',
        'protocol', 'tool-registry'
      ],
      'documentation-suite': ['documentation', 'markdown', 'pdf', 'academic-writing'],
      'frontend-master': ['frontend-dev-kit', 'react', 'typescript', 'ui-design-kit', 'colors'],
      'backend-master': ['backend-dev-kit', 'api-dev', 'database', 'mongodb', 'redis', 'json', 'yaml', 'env', 'encoding'],
      'database-specialist': ['database', 'mongodb', 'redis'],
      'testing-master': ['qa-dev-kit', 'testing-toolkit', 'test-generator', 'performance-optimizer'],
      'tech-advisor': ['libraries', 'clarify'],
      'data-engineer': ['data-crawler', 'database', 'json', 'yaml', 'csv', 'spreadsheet'],
      'platform-services': ['auth', 'message-bus', 'protocol', 'tool-registry', 'monitoring']
    },
    foundation: [
      'filesystem', 'terminal', 'search', 'web-search', 'search-tools', 'search-pdf-advanced',
      'datetime', 'math', 'regex', 'random', 'compression', 'csv', 'spreadsheet', 'images',
      'clarify', 'secrets', 'proxy', 'libraries', 'data-crawler', 'agent-devkit', 'consistency-manager',
      'agent-unified-toolkit', 'agent-persistence', 'agent-coordinator', 'message-bus',
      'protocol', 'tool-registry', 'auth', 'monitoring'
    ],
    integrations: [
      'puppeteer', 'browser-automation', 'web-crawler', 'site-generator', 'website-builder',
      'game-dev-toolkit', 'jira', 'fun'
    ]
  }
}

if (require.main === module) {
  const moduleName = process.argv[2]
  if (moduleName === 'list') {
    console.log('📦 Available MCP Modules (80+):')
    const categories = getModuleCategories()
    for (const [category, mods] of Object.entries(categories)) {
      if (Array.isArray(mods)) {
        console.log(`\n${category.toUpperCase()} (${mods.length}):`)
        mods.forEach((m: string) => console.log(`  - ${m}`))
      } else {
        const engineCount = Object.keys(mods).length
        console.log(`\n${category.toUpperCase()} (${engineCount} engines):`)
        for (const [engine, tools] of Object.entries(mods)) {
          const toolList = tools as string[]
          console.log(`  - ${engine}: ${toolList.length} tools`)
        }
      }
    }
  } else if (moduleName && modules[moduleName]) {
    loadMCPModule(moduleName).catch(console.error)
  } else {
    console.log('Usage: node mcp/index.js <module-name>')
    console.log('  or: node mcp/index.js list')
    console.log('\nAvailable modules:', listAvailableModules().join(', '))
  }
}

export default createMCPServer({
  name: 'mcp-hub',
  version: '3.1.0',
  description: 'MCP Hub - 96+ Unified Professional Tools with Enhanced AI Agents, Tool Registry, Protocol Standardization, Message Bus, Auth, Monitoring, and Complete Collaboration Platform',
  author: 'MCP Expert Community',
  icon: '🔌'
})
  .addTool({
    name: 'list_modules',
    description: '列出所有可用的MCP模块',
    parameters: {},
    execute: async () => {
      return {
        success: true,
        total: Object.keys(modules).length,
        categories: getModuleCategories(),
        modules: listAvailableModules()
      }
    }
  })
  .addTool({
    name: 'load_module_info',
    description: '获取指定模块的详细信息',
    parameters: {
      name: { type: 'string', description: '模块名称', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const moduleNames = Object.keys(modules)
      const isExists = moduleNames.includes(params.name)
      return {
        success: true,
        module: params.name,
        exists: isExists,
        message: isExists ? `模块 ${params.name} 可用` : `未找到模块: ${params.name}`
      }
    }
  })
  .build()
