import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'testing-toolkit',
  version: '2.0.0',
  description: 'Professional Testing & QA Toolkit - Unit testing, integration, E2E, coverage, mocking, performance, contract testing suite',
  author: 'MCP Expert Community',
  icon: '🧪'
})

  .addTool({
    name: 'test_config_generator',
    description: 'Generate production-ready test framework configuration for Jest, Vitest, Mocha, Pytest',
    parameters: {
      framework: { type: 'string', description: 'jest, vitest, mocha, pytest, junit, go-test', required: true },
      typescript: { type: 'boolean', description: 'Include TypeScript support', required: false },
      coverage: { type: 'boolean', description: 'Enable coverage reporting', required: false },
      outputPath: { type: 'string', description: 'Config file output path', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        framework: { type: 'string', required: true, enum: ['jest', 'vitest', 'mocha', 'pytest', 'junit', 'go-test'] },
        typescript: { type: 'boolean', required: false, default: true },
        coverage: { type: 'boolean', required: false, default: true },
        outputPath: { type: 'string', required: false, default: '.' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const configs: Record<string, any> = {
        jest: {
          dependencies: validation.data.typescript
            ? { jest: '^29.7.0', '@types/jest': '^29.5.12', 'ts-jest': '^29.1.2' }
            : { jest: '^29.7.0' },
          configFile: 'jest.config.js',
          config: `module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.spec.ts"],${validation.data.typescript ? `
  transform: { "^.+\\\\.tsx?$": "ts-jest" },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],` : ''}${validation.data.coverage ? `
  collectCoverage: true,
  coverageReporters: ["text", "lcov", "json-summary", "html"],
  coverageThreshold: {
    global: { lines: 80, branches: 70, functions: 70, statements: 80 }
  },
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/", "/test/fixtures/"],` : ''}
  clearMocks: true,
  verbose: true
}`,
          scripts: {
            test: 'jest',
            'test:watch': 'jest --watch',
            'test:coverage': 'jest --coverage',
            'test:ci': 'jest --coverage --ci --maxWorkers=2'
          }
        },
        vitest: {
          dependencies: { vitest: '^1.0.0', '@vitest/coverage-v8': '^1.0.0' },
          configFile: 'vitest.config.ts',
          config: `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',${validation.data.coverage ? `
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: { lines: 80, branches: 70, functions: 70 }
    },` : ''}
    clearMocks: true
  }
})`,
          scripts: {
            test: 'vitest',
            'test:watch': 'vitest watch',
            'test:coverage': 'vitest run --coverage',
            'test:ui': 'vitest --ui'
          }
        },
        pytest: {
          requirements: ['pytest>=7.0', 'pytest-cov>=4.0', 'pytest-asyncio>=0.21'],
          configFile: 'pytest.ini',
          config: `[pytest]
testpaths = tests
pythonpath = src
addopts = -v --cov=src --cov-report=term-missing --cov-report=html
asyncio_mode = auto`,
          scripts: {
            test: 'python -m pytest',
            'test:watch': 'ptw',
            'test:coverage': 'python -m pytest --cov-report html --cov=src'
          }
        }
      }

      return formatSuccess({
        configured: true,
        framework: validation.data.framework,
        typescript: validation.data.typescript,
        coverageEnabled: validation.data.coverage,
        configuration: configs[validation.data.framework] || configs.jest,
        recommendedStructure: [
          '__tests__/',
          '  unit/',
          '  integration/',
          '  e2e/',
          '  fixtures/',
          '  setup.ts'
        ],
        installCommand: validation.data.framework === 'pytest'
          ? 'pip install pytest pytest-cov pytest-asyncio'
          : `npm install --save-dev ${Object.keys((configs[validation.data.framework] || configs.jest).dependencies || {}).join(' ')}`
      })
    }
  })

  .addTool({
    name: 'unit_test_template',
    description: 'Generate unit test template following AAA pattern with best practices',
    parameters: {
      functionName: { type: 'string', description: 'Name of function to test', required: true },
      modulePath: { type: 'string', description: 'Import path of the module', required: false },
      language: { type: 'string', description: 'ts, js, py, go, java', required: false },
      edgeCases: { type: 'boolean', description: 'Include edge case tests', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        functionName: { type: 'string', required: true },
        modulePath: { type: 'string', required: false, default: './module' },
        language: { type: 'string', required: false, default: 'ts', enum: ['ts', 'js', 'py', 'go', 'java'] },
        edgeCases: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const fn = validation.data.functionName
      const lang = validation.data.language
      const modPath = validation.data.modulePath

      const templates: Record<string, string> = {
        ts: `import { ${fn} } from '${modPath}'

describe('${fn}', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('given valid input', () => {
    it('should return correct result for standard input', () => {
      // Arrange
      const input = { id: 1, name: 'test' }
      const expected = { success: true, data: input }

      // Act
      const result = ${fn}(input)

      // Assert
      expect(result).toEqual(expected)
    })
  })
${validation.data.edgeCases ? `
  describe('given edge cases', () => {
    it('should throw error for null input', () => {
      expect(() => ${fn}(null)).toThrow('Invalid input')
    })

    it('should handle empty object gracefully', () => {
      const result = ${fn}({})
      expect(result).toBeDefined()
    })

    it('should handle undefined properties', () => {
      const input = { id: undefined }
      const result = ${fn}(input)
      expect(result).toBeDefined()
    })
  })

  describe('given error conditions', () => {
    it('should throw ValidationError for invalid schema', () => {
      const input = { invalid: true }
      expect(() => ${fn}(input)).toThrow('ValidationError')
    })
  })
` : ''}
})`,
        py: `import pytest
from ${modPath.replace('/', '.')} import ${fn}


class Test${fn.charAt(0).toUpperCase() + fn.slice(1)}:
    def test_happy_path(self):
        # Arrange
        input_data = {"id": 1, "name": "test"}
        expected = {"success": True, "data": input_data}

        # Act
        result = ${fn}(input_data)

        # Assert
        assert result == expected
${validation.data.edgeCases ? `
    def test_null_input_raises_error(self):
        with pytest.raises(ValueError, match="Invalid input"):
            ${fn}(None)

    def test_empty_input_handled_gracefully(self):
        result = ${fn}({})
        assert result is not None
` : ''}
`
      }

      return formatSuccess({
        functionName: fn,
        language: lang,
        modulePath: modPath,
        template: templates[lang] || templates.ts,
        testingPyramid: {
          unit: '70% - Fast, isolated, deterministic',
          integration: '20% - Module interaction testing',
          e2e: '10% - Full system, user journeys'
        },
        aaaPattern: [
          'Arrange: Set up test data and mocks',
          'Act: Execute the function under test',
          'Assert: Verify outcomes'
        ],
        bestPractices: [
          'Test behavior, not implementation',
          'One logical assertion per test',
          'Use descriptive test names',
          'Keep tests fast and isolated',
          'No randomness in tests'
        ]
      })
    }
  })

  .addTool({
    name: 'mock_generator',
    description: 'Generate mock objects, spies, and test doubles for testing',
    parameters: {
      mockType: { type: 'string', description: 'api, database, service, dependency, external', required: true },
      framework: { type: 'string', description: 'jest, vitest, sinon, unittest.mock', required: false },
      methods: { type: 'string', description: 'Comma-separated list of methods to mock', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        mockType: { type: 'string', required: true, enum: ['api', 'database', 'service', 'dependency', 'external'] },
        framework: { type: 'string', required: false, default: 'jest', enum: ['jest', 'vitest', 'sinon', 'unittest.mock'] },
        methods: { type: 'string', required: false, default: 'get,post,put,delete' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const mockType = validation.data.mockType
      const fw = validation.data.framework
      const methods = validation.data.methods.split(',')

      const mocks: Record<string, Record<string, string>> = {
        api: {
          jest: `jest.mock('./api-client')

export const mockApiClient = {
${methods.map((m: any) => `  ${m}: jest.fn().mockResolvedValue({ data: {}, status: 200 })`).join(',\n')}
}

beforeEach(() => {
  jest.clearAllMocks()
})

// Usage:
// mockApiClient.get.mockResolvedValueOnce({ data: { id: 1 } })
// expect(mockApiClient.get).toHaveBeenCalledWith('/endpoint')`,
          vitest: `import { vi } from 'vitest'

vi.mock('./api-client')

export const mockApiClient = {
${methods.map((m: any) => `  ${m}: vi.fn().mockResolvedValue({ data: {}, status: 200 })`).join(',\n')}
}

beforeEach(() => {
  vi.clearAllMocks()
})`,
          'unittest.mock': `from unittest.mock import Mock, AsyncMock


class MockApiClient:
    def __init__(self):
${methods.map((m: any) => `        self.${m} = AsyncMock(return_value={'data': {}, 'status': 200})`).join('\n')}


mock_api = MockApiClient()

# Usage:
# mock_api.get.return_value = {'data': {'id': 1}, 'status': 200}
# assert mock_api.get.called`
        },
        database: {
          jest: `export const mockDatabase = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getClient: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn()
  }),
  transaction: jest.fn(async (callback) => {
    const mockTx = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      commit: jest.fn(),
      rollback: jest.fn()
    }
    return callback(mockTx)
  })
}

// Reset mocks between tests
beforeEach(() => {
  mockDatabase.query.mockReset()
  mockDatabase.query.mockResolvedValue({ rows: [], rowCount: 0 })
})`
        },
        service: {
          jest: `export const mockPaymentService = {
  charge: jest.fn().mockResolvedValue({ success: true, transactionId: 'tx_123' }),
  refund: jest.fn().mockResolvedValue({ success: true }),
  webhook: jest.fn().mockResolvedValue({ received: true })
}

// Mock different responses per test:
// mockPaymentService.charge.mockRejectedValueOnce(new Error('Card declined'))`
        }
      }

      return formatSuccess({
        mockType,
        framework: fw,
        methods,
        mockCode: (mocks[mockType] || mocks.api)[fw] || (mocks[mockType] || mocks.api).jest,
        testDoublesExplained: {
          Dummy: 'Passed around but never actually used',
          Fake: 'Working implementation simplified for tests',
          Stub: 'Returns predefined canned data',
          Mock: 'Verifies correct interactions occurred',
          Spy: 'Wraps real object, records calls while executing'
        },
        bestPractices: [
          'Only mock what you own',
          'Avoid mocking value objects',
          'Prefer state verification over behavior verification',
          'Too many mocks = code smell (refactor!)'
        ]
      })
    }
  })

  .addTool({
    name: 'e2e_test_setup',
    description: 'Professional E2E testing configuration for Playwright/Cypress',
    parameters: {
      framework: { type: 'string', description: 'playwright, cypress', required: true },
      baseURL: { type: 'string', description: 'Application base URL', required: false },
      browsers: { type: 'string', description: 'chromium, firefox, webkit', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        framework: { type: 'string', required: true, enum: ['playwright', 'cypress'] },
        baseURL: { type: 'string', required: false, default: 'http://localhost:3000' },
        browsers: { type: 'string', required: false, default: 'chromium,firefox,webkit' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const fw = validation.data.framework
      const baseURL = validation.data.baseURL
      const browsers = validation.data.browsers.split(',')

      const setups: Record<string, any> = {
        playwright: {
          installCommand: 'npm init playwright@latest -- --quiet',
          configFile: 'playwright.config.ts',
          config: `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!processDELETE.CI,
  retries: processDELETE.CI ? 2 : 0,
  workers: processDELETE.CI ? 1 : undefined,
  reporter: processDELETE.CI ? 'github' : 'html',

  use: {
    baseURL: '${baseURL}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
${browsers.map((b: any) => `    { name: '${b}', use: { ...devices['Desktop ${b.charAt(0).toUpperCase() + b.slice(1)}'] } }`).join(',\n')}
  ],

  webServer: {
    command: 'npm run start',
    url: '${baseURL}',
    reuseExistingServer: !processDELETE.CI
  }
})`,
          exampleTest: `import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('user can login successfully', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByTestId('user-menu')).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('wrong@example.com')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('alert')).toContainText('Invalid credentials')
  })
})`,
          scripts: {
            'test:e2e': 'playwright test',
            'test:e2e:ui': 'playwright test --ui',
            'test:e2e:debug': 'playwright test --debug',
            'test:e2e:codegen': 'playwright codegen'
          }
        },
        cypress: {
          installCommand: 'npm install cypress --save-dev && npx cypress open',
          configFile: 'cypress.config.ts',
          config: `import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: '${baseURL}',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: 'cypress/fixtures'
  },
  video: false,
  screenshotOnRunFailure: true
})`,
          folderStructure: [
            'cypress/e2e/',
            'cypress/fixtures/',
            'cypress/support/',
            'cypress/screenshots/',
            'cypress/videos/'
          ]
        }
      }

      return formatSuccess({
        framework: fw,
        baseURL,
        browsers,
        setup: setups[fw],
        selectorBestPractices: [
          '✅ Use data-testid attributes: getByTestId("submit-button")',
          '✅ Use role selectors: getByRole("button", { name: "Submit" })',
          '✅ Use text for user-visible content',
          '❌ Avoid CSS classes: .btn-primary',
          '❌ Avoid IDs that change: #btn-123',
          '❌ Avoid brittle XPaths'
        ],
        maintenanceTips: [
          'Create custom commands for repeated actions',
          'Use page objects for complex pages',
          'Mock external APIs',
          'Run on every commit in CI'
        ]
      })
    }
  })

  .addTool({
    name: 'load_test_config',
    description: 'k6 load testing configuration for various test types',
    parameters: {
      endpoint: { type: 'string', description: 'API endpoint URL to test', required: true },
      method: { type: 'string', description: 'HTTP method', required: false },
      testType: { type: 'string', description: 'smoke, load, stress, soak, spike', required: false },
      maxVU: { type: 'number', description: 'Maximum virtual users', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        endpoint: { type: 'string', required: true },
        method: { type: 'string', required: false, default: 'GET', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        testType: { type: 'string', required: false, default: 'load', enum: ['smoke', 'load', 'stress', 'soak', 'spike'] },
        maxVU: { type: 'number', required: false, default: 100 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const testProfiles: Record<string, any> = {
        smoke: { vus: 5, duration: '1m', purpose: 'Verify script works correctly' },
        load: { stages: [
          { duration: '1m', target: Math.floor(validation.data.maxVU / 2) },
          { duration: '3m', target: validation.data.maxVU },
          { duration: '1m', target: 0 }
        ], purpose: 'Normal expected user load' },
        stress: { stages: [
          { duration: '2m', target: validation.data.maxVU },
          { duration: '5m', target: validation.data.maxVU * 2 },
          { duration: '2m', target: validation.data.maxVU * 3 },
          { duration: '2m', target: 0 }
        ], purpose: 'Find breaking point' },
        soak: { stages: [
          { duration: '5m', target: validation.data.maxVU },
          { duration: '4h', target: validation.data.maxVU },
          { duration: '5m', target: 0 }
        ], purpose: 'Memory leaks over time' },
        spike: { stages: [
          { duration: '10s', target: validation.data.maxVU },
          { duration: '1m', target: validation.data.maxVU * 4 },
          { duration: '10s', target: validation.data.maxVU },
          { duration: '1m', target: 0 }
        ], purpose: 'Sudden traffic bursts' }
      }

      const profile = testProfiles[validation.data.testType]

      return formatSuccess({
        endpoint: validation.data.endpoint,
        method: validation.data.method,
        testType: validation.data.testType,
        maxVU: validation.data.maxVU,
        testPurpose: profile.purpose,
        k6Script: `import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = ${JSON.stringify(profile, null, 2).replace(/"([^"]+)":/g, '$1:')}

export default function() {
  const payload = JSON.stringify({ example: 'data' })
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + __ENV.AUTH_TOKEN || ''
    },
    tags: { endpoint: '${validation.data.endpoint}' }
  }

  const res = http.${validation.data.method.toLowerCase()}('${validation.data.endpoint}'${validation.data.method !== 'GET' ? ', payload, params' : ', params'})

  check(res, {
    'status 200': (r) => r.status === 200,
    'response < 500ms': (r) => r.timings.duration < 500,
    'response < 200ms': (r) => r.timings.duration < 200
  })

  sleep(1)
}`,
        thresholds: {
          http_req_duration: ['p(95)<500', 'p(99)<1000'],
          http_req_failed: ['rate<0.01']
        },
        runCommand: 'k6 run script.js',
        runDocker: `docker run -i loadimpact/k6 run - <script.js`,
        loadTypes: Object.keys(testProfiles).reduce((acc: Record<string, string>, key) => {
          acc[key] = testProfiles[key].purpose
          return acc
        }, {})
      })
    }
  })

  .addPrompt({
    name: 'testing-strategy-playbook',
    description: 'Professional testing strategy playbook for production applications',
    arguments: [{ name: 'projectType', description: 'Project type: api, frontend, fullstack, microservices', required: true }],
    generate: async (args?: Record<string, any>) => {
      return `## 🧪 Professional Testing Strategy Playbook
**Project Type**: ${args?.projectType || 'General Application'}

---

### 📊 The Test Pyramid (Target Distribution)

| Layer | % | Focus | Speed |
|-------|---|-------|-------|
| **Unit Tests** | 70% | Individual functions, pure logic | < 10ms |
| **Integration** | 20% | Module interaction, DB calls | 100ms |
| **E2E Tests** | 10% | Full user journeys, critical paths | > 1s |

---

### ✅ Functional Testing Categories

**Unit Testing**
- Test functions in complete isolation
- All dependencies mocked
- Deterministic, no I/O
- AAA Pattern: Arrange → Act → Assert

**Integration Testing**
- Test modules working together
- Test database interactions
- API contract verification
- Use test containers for real infrastructure

**E2E / System Testing**
- Test full user journeys
- Real browser, real backend
- Focus on happy paths only
- Test: signup, checkout, payment, core flows

---

### ⚡ Non-Functional Testing

**Performance Testing**
- **Smoke**: Verify script works (low VUs)
- **Load**: Normal expected traffic
- **Stress**: Find breaking point
- **Soak**: Memory leaks (hours)
- **Spike**: Sudden traffic bursts

**Security Testing**
- SAST: Static code analysis in CI
- DAST: Dynamic scanning of deployed app
- Dependency scanning
- Penetration testing quarterly

**Accessibility**
- Automated: axe-core, lighthouse
- Manual: Screen reader testing

---

### 🚦 CI Quality Gates (PR Requirements)

1. **Build passes** (no compilation errors)
2. **100% of unit tests pass**
3. **Coverage >= 80%** (critical paths 100%)
4. **Lint passes** (no eslint/type errors)
5. **No security vulnerabilities**
6. **No flaky tests** (fix or quarantine immediately)

---

### 💡 Testing Principles

1. **Test behavior, not implementation**
2. **Prefer fast tests**
3. **Flaky tests = broken tests** (fix now!)
4. **One logical assertion per test**
5. **Descriptive test names: should_do_X_when_Y**
6. **No randomness: deterministic inputs only**
7. **Don't chase 100% coverage** (aim for confidence)`
    }
  })
  .build()
