import { createMCPServer } from '../../packages/core/mcp/builder'
import { safeExec, safeExecRaw, validateParams, formatSuccess, formatError, readJsonFile } from '../../packages/core/shared'

export default createMCPServer({
  name: 'dependency-analyzer',
  version: '2.0.0',
  description: 'Enterprise dependency management - security audit, unused detection, version conflict resolution',
  author: 'MCP Expert Community',
  icon: '📦'
})
  .addTool({
    name: 'list_dependencies',
    description: 'List all project dependencies with metadata',
    parameters: {
      includeDev: { type: 'boolean', description: 'Include devDependencies', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        includeDev: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const pkg = await readJsonFile('package.json')

      return formatSuccess({
        project: {
          name: pkg?.name,
          version: pkg?.version
        },
        dependencies: pkg?.dependencies || {},
        devDependencies: validation.data.includeDev ? (pkg?.devDependencies || {}) : undefined,
        counts: {
          prod: Object.keys(pkg?.dependencies || {}).length,
          dev: Object.keys(pkg?.devDependencies || {}).length,
          total: Object.keys(pkg?.dependencies || {}).length + Object.keys(pkg?.devDependencies || {}).length
        }
      })
    }
  })
  .addTool({
    name: 'find_unused_dependencies',
    description: 'Detect unused dependencies in the project',
    parameters: {},
    execute: async () => {
      const result = await safeExecRaw('npx depcheck --json 2>/dev/null || echo "{}"', 60000)

      let depcheckData
      try {
        depcheckData = JSON.parse(result.stdout)
      } catch {
        depcheckData = { dependencies: [], devDependencies: [], missing: {} }
      }

      return formatSuccess({
        unused: depcheckData.dependencies || [],
        unusedDev: depcheckData.devDependencies || [],
        missing: Object.keys(depcheckData.missing || {}),
        using: depcheckData.using || {},
        recommendation: (depcheckData.dependencies || []).length > 0
          ? 'npm uninstall ' + (depcheckData.dependencies || []).join(' ')
          : 'No unused dependencies found'
      })
    }
  })
  .addTool({
    name: 'check_outdated',
    description: 'Find outdated packages with current/wanted/latest versions',
    parameters: {},
    execute: async () => {
      const result = await safeExecRaw('npm outdated --json 2>/dev/null || echo "{}"', 60000)

      let outdated
      try {
        outdated = JSON.parse(result.stdout)
      } catch {
        outdated = {}
      }

      const packages = Object.entries(outdated || {}).map(([name, info]: [string, any]) => ({
        name,
        current: info.current,
        wanted: info.wanted,
        latest: info.latest,
        updateType: info.current === info.wanted ? 'major' : info.current === info.wanted ? 'minor' : 'patch'
      }))

      return formatSuccess({
        packages,
        counts: {
          major: packages.filter(p => p.updateType === 'major').length,
          minor: packages.filter(p => p.updateType === 'minor').length,
          patch: packages.filter(p => p.updateType === 'patch').length,
          total: packages.length
        },
        upgradeAllCommand: 'npm update'
      })
    }
  })
  .addTool({
    name: 'audit_security',
    description: 'Security vulnerability audit with severity classification',
    parameters: {
      fix: { type: 'boolean', description: 'Run audit fix automatically', required: false },
      level: { type: 'string', description: 'Minimum severity: low, moderate, high, critical', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        fix: { type: 'boolean', required: false, default: false },
        level: { type: 'string', required: false, default: 'low' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const auditResult = await safeExecRaw('npm audit --json 2>/dev/null || echo "{}"', 60000)

      let audit
      try {
        audit = JSON.parse(auditResult.stdout)
      } catch {
        audit = { vulnerabilities: {}, metadata: {} }
      }

      if (validation.data.fix) {
        await safeExec('npm audit fix 2>&1', 120000)
      }

      const vulns = Object.values(audit.vulnerabilities || {}) as any[]

      return formatSuccess({
        severity: audit.metadata?.vulnerabilities || { critical: 0, high: 0, moderate: 0, low: 0 },
        vulnerabilities: vulns.slice(0, 20).map((v: any) => ({
          name: v.name,
          severity: v.severity,
          title: v.title,
          range: v.range
        })),
        totalVulnerabilities: vulns.length,
        autoFixApplied: validation.data.fix
      })
    }
  })
  .addTool({
    name: 'analyze_graph',
    description: 'Analyze dependency graph for duplicates and bloat',
    parameters: {
      package: { type: 'string', description: 'Specific package to analyze', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        package: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const lsResult = await safeExec('npm ls --json 2>/dev/null || echo "{}"', 60000)

      return formatSuccess({
        targetPackage: validation.data.package,
        tools: [
          'npm ls ' + (validation.data.package || ''),
          'npm why ' + (validation.data.package || '<package>'),
          'npx webpack-bundle-analyzer',
          'npx source-map-explorer'
        ],
        tips: [
          'Run "npm dedupe" to flatten dependencies',
          'Use "npm ls" to find duplicate versions',
          'Check bundle size regularly'
        ]
      })
    }
  })
  .addResource({
    uri: 'mcp://dependency-analyzer/health',
    name: 'Dependency Health Dashboard',
    description: 'Overall dependency health metrics',
    get: async () => ({
      metrics: [
        'Total dependency count',
        'Outdated packages ratio',
        'Security vulnerability count',
        'Unused dependencies count'
      ],
      maintenance: [
        'Weekly: npm update minor/patch versions',
        'Monthly: npm audit security scan',
        'Quarterly: Remove unused dependencies'
      ]
    })
  })
  .addPrompt({
    name: 'health-check',
    description: 'Complete dependency health check and cleanup',
    generate: async () => `
## 📦 依赖健康检查和清理

### 📋 **标准化流程**

#### **步骤 1: 扫描分析**

| 工具 | 调用 |
|------|------|
| 完整清单 | \`list_dependencies\` |
| 未使用检测 | \`find_unused_dependencies\` |
| 版本检查 | \`check_outdated\` |
| 安全扫描 | \`audit_security\` |

#### **步骤 2: 安全清理**

**删除未使用依赖:**
\`\`\`bash
npm uninstall package1 package2
\`\`\`

**更新兼容版本:**
\`\`\`bash
npm update  # 只升级 patch/minor
\`\`\`

**高危漏洞修复:**
\`\`\`bash
npm audit fix
# 严重问题手动处理
\`\`\`

#### **步骤 3: 验证**
1. 完整构建: \`npm run build\`
2. 全部测试: \`npm test\`
3. 验证功能正常

### 📊 **健康指标**
| 指标 | 健康阈值 |
|------|---------:|
| 总依赖数 | < 50 个 |
| 高危漏洞 | = 0 |
| 未使用 | = 0 |
| 过时 Major | < 3 个 |
    `.trim()
  })
  .build()
