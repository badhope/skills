import { createMCPServer } from '../../packages/core/mcp/builder'
import { safeExec, safeExecRaw, validateParams, formatSuccess, formatError, sanitizePath, fileExists, readJsonFile } from '../../packages/core/shared'
import fs from 'fs/promises'
import path from 'path'

export default createMCPServer({
  name: 'test-generator',
  version: '2.0.0',
  description: 'Enterprise testing toolkit - unit/integration/e2e generation, coverage reporting, test workflow automation',
  author: 'MCP Expert Community',
  icon: '🧪'
})
  .addTool({
    name: 'detect_test_framework',
    description: 'Auto-detect project testing framework and capabilities',
    parameters: {},
    execute: async () => {
      try {
        const pkg = await readJsonFile('package.json')
        const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
        
        let framework = 'unknown'
        if (deps.jest) framework = 'jest'
        else if (deps.vitest) framework = 'vitest'
        else if (deps.mocha) framework = 'mocha'
        else if (deps.cypress) framework = 'cypress'
        else if (deps.playwright) framework = 'playwright'
        else if (await fileExists('pytest.ini')) framework = 'pytest'
        
        return formatSuccess({
          framework,
          hasCoverage: !!(deps.nyc || deps['@vitest/coverage-v8'] || deps['@jest/reporters']),
          hasE2E: !!(deps.cypress || deps.playwright),
          runners: [
            framework === 'jest' && 'npm test',
            framework === 'vitest' && 'npm run test',
            framework === 'cypress' && 'npx cypress run',
            framework === 'playwright' && 'npx playwright test'
          ].filter(Boolean)
        })
      } catch (e) {
        return formatError('Failed to detect test framework', e)
      }
    }
  })
  .addTool({
    name: 'generate_unit_test',
    description: 'Generate unit test scaffold for target source file',
    parameters: {
      sourceFile: { type: 'string', description: 'Source file path, e.g. "src/utils.ts"', required: true },
      framework: { type: 'string', description: 'Test framework: jest, vitest, mocha', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sourceFile: { type: 'string', required: true },
        framework: { type: 'string', required: false, default: 'jest' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.sourceFile)
      if (!await fileExists(safePath)) return formatError('Source file not found', safePath)

      try {
        const source = await fs.readFile(safePath, 'utf-8')
        const ext = path.extname(safePath)
        const baseName = path.basename(safePath, ext)
        const dirName = path.dirname(safePath)
        const testFile = sanitizePath(`${dirName}/${baseName}.test${ext}`)
        
        const exportsMatch = source.match(/export\s+(?:async\s+)?(function|const|class|type|interface)\s+(\w+)/g) || []
        const exports = exportsMatch.map((m: string) => m.match(/\w+$/)?.[0]).filter(Boolean)
        
        return formatSuccess({
          sourceFile: safePath,
          testFile,
          exportsDetected: exports,
          framework: validation.data.framework,
          template: {
            imports: [`import { describe, it, expect } from '${validation.data.framework}'`],
            describe: baseName,
            testCases: exports.map((fn: string | undefined) => fn ? `test('${fn} should work correctly')` : '').filter(Boolean)
          }
        })
      } catch (e) {
        return formatError('Failed to generate test', e)
      }
    }
  })
  .addTool({
    name: 'run_tests_with_coverage',
    description: 'Run test suite with coverage reporting and result parsing',
    parameters: {
      file: { type: 'string', description: 'Specific test file path', required: false },
      reporter: { type: 'string', description: 'Coverage reporter: text, json, html', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        file: { type: 'string', required: false },
        reporter: { type: 'string', required: false, default: 'text' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const fileArg = validation.data.file ? ` ${sanitizePath(validation.data.file)}` : ''
      const coverageArg = validation.data.reporter === 'json' ? ' --reporter=json' : ' --coverage'
      
      const result = await safeExecRaw(`npm test --${coverageArg}${fileArg}`, 120000)
      
      return formatSuccess({
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        output: result.stdout,
        errors: result.stderr,
        hasCoverage: result.stdout.includes('Coverage') || result.stdout.includes('%')
      })
    }
  })
  .addTool({
    name: 'generate_e2e_test',
    description: 'Generate E2E test scaffold for Cypress/Playwright',
    parameters: {
      page: { type: 'string', description: 'Page name or route', required: true },
      framework: { type: 'string', description: 'E2E framework: cypress, playwright', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        page: { type: 'string', required: true },
        framework: { type: 'string', required: false, default: 'playwright' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        page: validation.data.page,
        framework: validation.data.framework,
        testScenarios: ['page loads correctly', 'navigation works', 'form submission', 'error states'],
        outputPath: sanitizePath(`e2e/${validation.data.page}.spec.ts`)
      })
    }
  })
  .addResource({
    uri: 'mcp://test-generator/dashboard',
    name: 'Testing Dashboard',
    description: 'Test coverage and quality metrics',
    get: async () => ({
      frameworks: ['jest', 'vitest', 'mocha', 'cypress', 'playwright'],
      testTypes: ['unit', 'integration', 'e2e', 'snapshot', 'visual'],
      coverageTargets: { lines: 80, statements: 80, branches: 70, functions: 75 },
      bestPractices: [
        'Arrange-Act-Assert pattern',
        'Test behavior not implementation',
        'Meaningful test names',
        'Setup/Teardown properly handled'
      ]
    })
  })
  .addPrompt({
    name: 'write-tests',
    description: 'Write comprehensive unit tests for target file',
    arguments: [
      { name: 'file', description: 'Source file path to test', required: true },
      { name: 'type', description: 'Test type: unit, integration, e2e', required: false }
    ],
    generate: async (args?: Record<string, any>) => {
      const safePath = args?.file ? sanitizePath(args.file) : ''
      return `
## 🧪 测试生成: ${safePath || '目标文件'}

### 📋 标准化测试流程

**第1步: 环境检测**
调用 \`detect_test_framework\` 确认测试框架配置

**第2步: 分析源代码**
调用 \`generate_unit_test\` 分析导出接口

**第3步: 完整测试套件生成**
按照AAA模式编写测试用例：

\`\`\`typescript
describe('ModuleName', () => {
  describe('functionName', () => {
    it('should work with valid input', () => {
      // Arrange - 准备测试数据
      const input = {}
      
      // Act - 执行函数
      const result = functionName(input)
      
      // Assert - 验证结果
      expect(result).toEqual(expected)
    })
    
    it('should handle edge case', () => {})
    it('should throw on invalid input', () => {})
  })
})
\`\`\`

### 🎯 测试覆盖标准
| 测试类型 | 覆盖率目标 |
|----------|-----------:|
| 正常路径 | ✅ 100% |
| 边界条件 | ✅ 100% |
| 错误处理 | ✅ 100% |
| 空值/Null | ✅ 100% |

### ✅ 测试质量检查
1. 每个测试只有一个断言点
2. 测试数据与测试逻辑分离
3. 不依赖外部服务（使用Mock）
4. 测试名称描述行为，而不是实现
5. 确定性测试，每次运行结果一致
      `.trim()
    }
  })
  .build()
