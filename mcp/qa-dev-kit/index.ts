import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'qa-dev-kit',
  version: '2.0.0',
  description: 'Professional QA & Code Quality Toolkit - Testing, Refactoring, Debugging, Code Review, and Performance Analysis Suite',
  author: 'MCP Expert Community',
  icon: '🧪'
})
  .addTool({
    name: 'qa_jest_config',
    description: 'Generate production-ready Jest configuration with TypeScript and coverage',
    parameters: {
      typescript: { type: 'boolean', description: 'Enable TypeScript support', required: false },
      coverage: { type: 'boolean', description: 'Enable coverage reporting', required: false },
      environment: { type: 'string', description: 'Test environment: node, jsdom', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        typescript: { type: 'boolean', required: false, default: true },
        coverage: { type: 'boolean', required: false, default: true },
        environment: { type: 'string', required: false, default: 'node' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        configured: true,
        jestConfig: {
          testEnvironment: validation.dataDELETEironment,
          collectCoverage: validation.data.coverage,
          coverageReporters: ['text', 'lcov', 'json-summary'],
          coverageThreshold: { global: { lines: 80, branches: 70, functions: 70, statements: 80 } },
          coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],
          moduleFileExtensions: validation.data.typescript ? ['ts', 'tsx', 'js', 'jsx', 'json'] : ['js', 'jsx', 'json'],
          transform: validation.data.typescript ? { '^.+\\.tsx?$': 'ts-jest' } : {}
        },
        dependencies: validation.data.typescript 
          ? { jest: '^29.7.0', '@types/jest': '^29.5.12', 'ts-jest': '^29.1.2' }
          : { jest: '^29.7.0' },
        scripts: {
          test: 'jest',
          'test:watch': 'jest --watch',
          'test:coverage': 'jest --coverage',
          'test:ci': 'jest --coverage --ci'
        },
        bestPractices: [
          'Keep tests fast & isolated',
          'Mock external dependencies',
          'Test behavior not implementation',
          'Use AAA pattern: Arrange, Act, Assert'
        ]
      })
    }
  })
  .addTool({
    name: 'qa_unit_test',
    description: 'Generate professional unit test template with AAA pattern',
    parameters: {
      functionName: { type: 'string', description: 'Function under test name', required: true },
      modulePath: { type: 'string', description: 'Path to module being tested', required: false },
      type: { type: 'string', description: 'sync, async, throws', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        functionName: { type: 'string', required: true },
        modulePath: { type: 'string', required: false, default: './module' },
        type: { type: 'string', required: false, default: 'sync' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const fn = validation.data.functionName
      const isAsync = validation.data.type === 'async'
      
      const template = `import { ${fn} } from '${validation.data.modulePath}';

describe('${fn}', () => {
  describe('given valid inputs', () => {
    it('should return expected result', ${isAsync ? 'async ' : ''}() => {
      // Arrange
      const input = {};
      const expected = {};

      // Act
      const result = ${isAsync ? 'await ' : ''}${fn}(input);

      // Assert
      expect(result).toEqual(expected);
    });
  });

  describe('given invalid inputs', () => {
    it('should throw validation error', ${isAsync ? 'async ' : ''}() => {
      // Arrange
      const invalidInput = {};

      // Act & Assert
      ${isAsync ? 'await expect(' : 'expect(() => '}${fn}(invalidInput)${isAsync ? ')' : ''}.rejects.toThrow('Validation');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', ${isAsync ? 'async ' : ''}() => {
      expect(${isAsync ? 'await ' : ''}${fn}({})).toBeDefined();
    });
  });
});`

      return formatSuccess({
        function: fn,
        testType: validation.data.type,
        pattern: 'AAA (Arrange-Act-Assert) - Clean test separation',
        testStructure: [
          'Happy path with valid inputs',
          'Error cases with invalid inputs',
          'Edge cases and boundary conditions'
        ],
        template,
        proTips: [
          'One assertion per test when possible',
          'Use descriptive test names',
          'Setup shared state in beforeEach',
          'Clean up mocks after each test'
        ]
      })
    }
  })
  .addTool({
    name: 'qa_e2e_playwright',
    description: 'Generate Playwright E2E test with page object pattern',
    parameters: {
      scenario: { type: 'string', description: 'Test scenario description', required: true },
      url: { type: 'string', description: 'Application URL', required: false },
      authenticated: { type: 'boolean', description: 'Include auth setup', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        scenario: { type: 'string', required: true },
        url: { type: 'string', required: false, default: '/' },
        authenticated: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const template = `import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('${validation.data.scenario}', () => {
  ${validation.data.authenticated ? `
  test.beforeEach(async ({ page, context }) => {
    // Setup authentication
    await context.addCookies([{
      name: 'auth-token',
      value: processDELETE.E2E_AUTH_TOKEN || 'test',
      url: '${validation.data.url}'
    }]);
  });
  ` : ''}
  test('should complete user journey successfully', async ({ page }) => {
    // Navigation
    await page.goto('${validation.data.url}');
    await expect(page).toHaveURL(/.*${validation.data.url.replace('/', '')}/);
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    
    // Visual regression
    await expect(page).toHaveScreenshot({ maxDiffPixels: 100 });
    
    // User interaction
    const locator = page.getByRole('button', { name: /submit/i });
    await expect(locator).toBeVisible();
    await locator.click();
    
    // Assert navigation
    await expect(page).toHaveURL(/.*success/);
  });

  test('should validate form inputs', async ({ page }) => {
    await page.goto('${validation.data.url}');
    
    // Submit empty form
    await page.getByRole('button', { name: /submit/i }).click();
    
    // Verify error messages
    await expect(page.getByRole('alert')).toBeVisible();
  });
});`

      return formatSuccess({
        scenario: validation.data.scenario,
        framework: 'Playwright 1.44+',
        setup: 'npm init playwright@latest -- --ts',
        features: [
          'Page Object Model ready',
          'Visual regression testing',
          'Network interception support',
          'Authentication setup',
          'Trace viewer enabled'
        ],
        template,
        scripts: {
          'test:e2e': 'playwright test',
          'test:e2e:ui': 'playwright test --ui',
          'test:e2e:trace': 'playwright test --trace on'
        }
      })
    }
  })
  .addTool({
    name: 'qa_mock_generator',
    description: 'Generate professional mocks for APIs, databases, and services',
    parameters: {
      type: { type: 'string', description: 'api, database, service, axios, fetch', required: true },
      mockName: { type: 'string', description: 'Mock object name', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true },
        mockName: { type: 'string', required: false, default: 'client' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const mockTemplates: Record<string, any> = {
        api: {
          description: 'REST API client mock with Jest',
          code: `jest.mock('./${validation.data.mockName}');
import { ${validation.data.mockName} } from './${validation.data.mockName}';

export const mockApi = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
  patch: jest.fn().mockResolvedValue({ data: {} })
};

jest.mocked(${validation.data.mockName}).mockReturnValue(mockApi);

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockApi).forEach(fn => fn.mockClear());
});`
        },
        database: {
          description: 'Database repository mock',
          code: `export const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  transaction: jest.fn().mockImplementation(async (cb) => cb(mockDb))
};

jest.mock('./db', () => ({ getRepository: () => mockDb }));`
        },
        axios: {
          description: 'Axios mock with response builders',
          code: `import axios from 'axios';
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

export const mockResponse = (data: any, status = 200) => ({
  data, status, statusText: 'OK', headers: {}, config: {}
});
export const mockError = (message: string, status = 500) => 
  Promise.reject({ response: { status, data: { message } } });

beforeEach(() => {
  mockedAxios.get.mockReset();
  mockedAxios.post.mockReset();
});`
        }
      }

      const selected = mockTemplates[validation.data.type] || mockTemplates.api

      return formatSuccess({
        type: validation.data.type,
        ...selected,
        bestPractices: [
          'Clear mocks between tests',
          'Mock at module boundary',
          'Verify mock call arguments',
          'Return realistic data shapes',
          'Avoid over-mocking internals'
        ]
      })
    }
  })
  .addTool({
    name: 'qa_refactor_guide',
    description: 'Professional refactoring guide with safe transformations',
    parameters: {
      refactoringType: { type: 'string', description: 'extract-function, rename, move-class, extract-interface, simplify', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        refactoringType: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const guides: Record<string, any> = {
        'extract-function': {
          title: 'Extract Function / Method',
          motivation: 'Reduce complexity, improve readability, enable reuse',
          stepByStep: [
            '1. Create new function with descriptive name',
            '2. Copy code block from source',
            '3. Identify variables: passed in as parameters',
            '4. Identify modified variables: return them',
            '5. Replace original with function call',
            '6. Run tests to verify behavior unchanged',
            '7. Repeat for similar code patterns'
          ],
          indicators: 'Function > 20 lines, duplicate code, nested > 3 levels'
        },
        'rename': {
          title: 'Safe Rename Symbol',
          stepByStep: [
            '1. Use IDE refactoring tool (F2 in VS Code)',
            '2. Check all casings: camelCase, PascalCase, UPPER_SNAKE',
            '3. Verify file names if renaming classes',
            '4. Check imports and exports',
            '5. Search in non-code files (docs, configs)',
            '6. Run full test suite'
          ],
          qualityCheck: 'Name should reveal intent, not implementation'
        },
        'simplify': {
          title: 'Simplify Conditional Logic',
          techniques: [
            'Replace nested conditionals with Guard Clauses',
            'Merge duplicate condition blocks',
            'Decompose complex condition into named functions',
            'Replace condition with polymorphism',
            'Introduce Null Object pattern'
          ],
          example: 'if (x) if (y) { ... } → if (!x) return; if (!y) return; { ... }'
        }
      }

      const guide = guides[validation.data.refactoringType] || guides['extract-function']

      return formatSuccess({
        refactoring: validation.data.refactoringType,
        ...guide,
        safetyRules: [
          '🔒 Test suite is green BEFORE starting',
          '🔒 Commit working state BEFORE each step',
          '🔒 Tiny steps: one change, run tests, commit',
          '🔒 No behavior changes during refactoring',
          '🔒 Separate refactoring from feature work'
        ],
        codeSmells: [
          'Long Functions > 50 lines',
          'Large Classes > 300 lines',
          'Deep Nesting > 4 levels',
          'Long Parameter Lists > 3 params',
          'Duplicate code (3 strikes rule)'
        ]
      })
    }
  })
  .addTool({
    name: 'qa_review_checklist',
    description: 'Enterprise-grade code review checklist by categories',
    parameters: {
      category: { type: 'string', description: 'all, correctness, security, performance, style, testing', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        category: { type: 'string', required: false, default: 'all' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const checklist = {
        correctness: {
          title: '✅ Correctness & Logic',
          items: [
            'No off-by-one errors in loops',
            'All edge cases handled (empty, null, undefined)',
            'Error handling catches specific exceptions',
            'Race conditions analyzed for async code',
            'Math operations checked for overflow/accuracy',
            'All public API inputs validated',
            'State changes are atomic'
          ]
        },
        security: {
          title: '🔒 Security',
          items: [
            'All external inputs validated & sanitized',
            'No SQL injection (parameterized queries)',
            'No XSS vulnerabilities in user output',
            'Authentication & authorization checked',
            'No secrets in code or logs',
            'CORS, CSP headers properly configured',
            'Dependency vulnerabilities checked'
          ]
        },
        performance: {
          title: '⚡ Performance',
          items: [
            'No N+1 query problems in DB access',
            'Avoid O(n²) algorithms on large datasets',
            'Proper caching strategy implemented',
            'No unnecessary work inside loops',
            'Lazy loading for heavy resources',
            'Memory leaks analyzed',
            'Bundle size considered for frontend'
          ]
        },
        style: {
          title: '🎨 Maintainability',
          items: [
            'Names reveal intent (no abbreviations)',
            'Functions do one thing (Single Responsibility)',
            'No commented out dead code',
            'Complex logic explained in comments',
            'Consistent formatting',
            'No global mutable state',
            'Law of Demeter respected'
          ]
        },
        testing: {
          title: '🧪 Testing',
          items: [
            'Happy path tested',
            'Error paths tested',
            'Edge cases tested',
            'Integration tests for critical flows',
            'No flaky tests (deterministic)',
            'Coverage thresholds met',
            'Test data does not use production'
          ]
        }
      }

      return formatSuccess({
        selectedCategory: validation.data.category,
        checklist,
        reviewProcess: [
          '1. Read description, understand purpose',
          '2. Do high-level architecture review first',
          '3. Detailed line-by-line review',
          '4. Verify tests pass and are meaningful',
          '5. Ask questions, don\'t give orders',
          '6. Praise good work!',
          '7. Approve or request specific changes'
        ],
        severityGuide: {
          BLOCKER: 'Must fix before merge (security, correctness)',
          MAJOR: 'Strongly consider fixing (performance)',
          MINOR: 'Optional improvement (style)',
          NIT: 'Tiny preference, opinion based'
        }
      })
    }
  })
  .build()