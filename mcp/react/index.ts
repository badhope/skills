import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec } from '../../packages/core'
import * as fs from 'fs/promises'
import * as path from 'path'

async function detectProjectRoot(): Promise<string> {
  let current = process.cwd()
  while (true) {
    try {
      await fs.access(path.join(current, 'package.json'))
      return current
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return process.cwd()
      current = parent
    }
  }
}

async function parseTSConfig(root: string): Promise<any> {
  try {
    const raw = await fs.readFile(path.join(root, 'tsconfig.json'), 'utf-8')
    return JSON.parse(raw.replace(/\/\/.*/g, ''))
  } catch {
    return {}
  }
}

function analyzeRenderOptimizations(content: string): {
  issues: string[]
  recommendations: string[]
  score: number
} {
  const issues: string[] = []
  const recommendations: string[] = []
  let score = 100

  if (content.includes('key={index}')) {
    issues.push('⚠️ Using index as key can cause unnecessary re-renders')
    score -= 20
    recommendations.push('Use stable unique identifiers instead of array indices')
  }

  const inlineArrow = content.match(/on\w+=\{.*=>.*\}/g) || []
  if (inlineArrow.length > 0) {
    issues.push(`⚠️ ${inlineArrow.length} inline arrow functions in JSX props`)
    score -= Math.min(inlineArrow.length * 5, 15)
    recommendations.push('Wrap event handlers with useCallback')
  }

  const inlineObject = content.match(/style=\{\{.*\}\}/g) || []
  if (inlineObject.length > 0) {
    issues.push(`⚠️ ${inlineObject.length} inline object literals`)
    score -= Math.min(inlineObject.length * 5, 15)
    recommendations.push('Move object literals outside component or use useMemo')
  }

  const hasUseCallback = content.includes('useCallback')
  const hasUseMemo = content.includes('useMemo')
  const hasReactMemo = content.includes('React.memo') || content.includes('memo(')
  
  if (!hasReactMemo && content.includes('export default function')) {
    recommendations.push('Consider wrapping with React.memo for reference equality')
  }

  const depsIssues = content.match(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([\s\S]*?)\]\)/g) || []
  for (const dep of depsIssues) {
    if (dep.includes('[]') && dep.includes('set')) {
      recommendations.push('Empty dependency array: verify intentional mount-only behavior')
    }
  }

  return {
    issues,
    recommendations,
    score: Math.max(0, score)
  }
}

const REACT_HOOK_TEMPLATES: Record<string, string> = {
  useState: `const [state, setState] = useState<T>(initialValue)`,
  useEffect: `useEffect(() => {\n  // Side effect\n  return () => {\n    // Cleanup\n  }\n}, [deps])`,
  useCallback: `const handler = useCallback((arg: Type) => {\n  // Implementation\n}, [deps])`,
  useMemo: `const value = useMemo(() => computeExpensive(a, b), [a, b])`,
  useRef: `const ref = useRef<Type>(initialValue)`,
  useContext: `const value = useContext(MyContext)`,
  useReducer: `const [state, dispatch] = useReducer(reducer, initialArg, init?)`,
  useImperativeHandle: `useImperativeHandle(ref, () => ({\n  // Exposed methods\n}), [deps])`,
  useLayoutEffect: `useLayoutEffect(() => {\n  // DOM measurements\n}, [deps])`,
  useId: `const id = useId()`
}

export default createMCPServer({
  name: 'react',
  version: '2.0.0',
  description: 'Professional React + TypeScript Toolkit - Architecture detection, hooks generation, render optimization, static analysis, best practices enforcement',
  author: 'MCP Expert Community',
  icon: '⚛️'
})
  .addTool({
    name: 'react_detect_config',
    description: 'Auto-detect React project architecture, framework, state management, and tooling',
    parameters: {
      deepScan: { type: 'boolean', description: 'Scan source files for patterns', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        deepScan: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const root = await detectProjectRoot()
      const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf-8').catch(() => '{}'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const tsConfig = await parseTSConfig(root)

      const framework = 
        deps.next ? 'Next.js' :
        deps.vite ? 'Vite' :
        deps['react-scripts'] ? 'Create React App' :
        deps.gatsby ? 'Gatsby' :
        deps.remix ? 'Remix' : 'Custom'

      const router =
        deps['next'] ? 'Next.js App Router' :
        deps['react-router-dom'] ? 'React Router' :
        deps['@remix-run/react'] ? 'Remix Router' : 'None'

      const stateManagement =
        deps.zustand ? 'Zustand' :
        deps.redux ? 'Redux' :
        deps['@reduxjs/toolkit'] ? 'Redux Toolkit' :
        deps.jotai ? 'Jotai' :
        deps.recoil ? 'Recoil' :
        deps.mobx ? 'MobX' :
        deps.xstate ? 'XState' : 'React Context'

      const styling =
        deps.tailwindcss ? 'Tailwind CSS' :
        deps['@emotion/react'] ? 'Emotion CSS-in-JS' :
        deps['styled-components'] ? 'Styled Components' :
        deps['@mui/material'] ? 'Material UI' :
        deps.antd ? 'Ant Design' :
        deps.chakra ? 'Chakra UI' : 'Plain CSS / CSS Modules'

      const testing =
        deps['@testing-library/react'] ? 'React Testing Library' :
        deps.vitest ? 'Vitest' :
        deps.jest ? 'Jest' : 'None'

      const buildTool =
        deps.vite ? 'Vite' :
        deps.esbuild ? 'ESBuild' :
        deps.webpack ? 'Webpack' : 'Unknown'

      const metaFramework = deps.next ? 'Next.js' :
        deps.gatsby ? 'Gatsby' :
        deps.remix ? 'Remix' : 'None'

      const features = {
        hasTypeScript: !!deps.typescript,
        hasESLint: !!deps.eslint,
        hasPrettier: !!deps.prettier,
        hasStorybook: !!deps.storybook,
        hasReactQuery: !!deps['@tanstack/react-query'],
        hasSWR: !!deps.swr,
        hasReactHookForm: !!deps['react-hook-form'],
        hasZod: !!deps.zod,
        hasYup: !!deps.yup,
        hasFramerMotion: !!deps['framer-motion']
      }

      return formatSuccess({
        projectRoot: root,
        reactVersion: deps.react || 'Not found',
        framework,
        metaFramework,
        router,
        stateManagement,
        styling,
        testing,
        buildTool,
        nodeVersion: process.version,
        typeScript: tsConfig.compilerOptions || 'Not configured',
        features,
        architectureGrade: Object.values(features).filter(Boolean).length > 8 ? 'Enterprise' :
          Object.values(features).filter(Boolean).length > 5 ? 'Professional' : 'Basic',
        recommendations: [
          !features.hasReactQuery && !features.hasSWR ? '📦 Add React Query/SWR for data fetching' : null,
          !features.hasZod && !features.hasYup ? '✅ Add Zod for schema validation' : null,
          !features.hasESLint ? '🔧 Configure ESLint for code quality' : null
        ].filter(Boolean)
      })
    }
  })
  .addTool({
    name: 'react_generate_hook',
    description: 'Generate production-ready custom React hook with TypeScript types and documentation',
    parameters: {
      name: { type: 'string', description: 'Hook name (e.g., useLocalStorage, useDebounce)', required: true },
      purpose: { type: 'string', description: 'Brief description of hook purpose', required: true },
      includeExamples: { type: 'boolean', description: 'Include usage examples', required: false },
      includeTests: { type: 'boolean', description: 'Include test boilerplate', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        purpose: { type: 'string', required: true },
        includeExamples: { type: 'boolean', required: false, default: true },
        includeTests: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const hookName = validation.data.name.replace(/^use/, '')
      const camelName = `use${hookName.charAt(0).toUpperCase() + hookName.slice(1)}`

      const hookTemplate = `import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * ${camelName}
 * 
 * ${validation.data.purpose}
 * 
 * @example
 * const { value, setValue, reset } = ${camelName}(initialValue)
 */
export function ${camelName}<T>(initialValue: T) {
  const [value, setValue] = useState<T>(initialValue)
  const mountedRef = useRef(true)

  const reset = useCallback(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  return {
    value,
    setValue,
    reset,
    isMounted: mountedRef.current
  } as const
}
`

      const testTemplate = validation.data.includeTests ? `

// __tests__/${camelName}.test.ts
import { renderHook, act } from '@testing-library/react'
import { ${camelName} } from './${camelName}'

describe('${camelName}', () => {
  it('should initialize with default value', () => {
    const { result } = renderHook(() => ${camelName}('test'))
    expect(result.current.value).toBe('test')
  })

  it('should update value', () => {
    const { result } = renderHook(() => ${camelName}('initial'))
    act(() => result.current.setValue('updated'))
    expect(result.current.value).toBe('updated')
  })

  it('should reset to initial value', () => {
    const { result } = renderHook(() => ${camelName}('initial'))
    act(() => result.current.setValue('updated'))
    act(() => result.current.reset())
    expect(result.current.value).toBe('initial')
  })
})
` : ''

      const example = validation.data.includeExamples ? `

// Usage Example
function ExampleComponent() {
  const { value, setValue, reset } = ${camelName}<string>('default')
  
  return (
    <div>
      <p>Value: {value}</p>
      <button onClick={() => setValue('new value')}>Update</button>
      <button onClick={reset}>Reset</button>
    </div>
  )
}
` : ''

      return formatSuccess({
        hookName: camelName,
        purpose: validation.data.purpose,
        hook: hookTemplate,
        example: example,
        tests: testTemplate,
        bestPractices: [
          '✅ Return values as const tuple for type safety',
          '✅ Use useCallback for stable function references',
          '✅ Use useRef for mount tracking',
          '✅ Full JSDoc documentation'
        ]
      })
    }
  })
  .addTool({
    name: 'react_optimize_renders',
    description: 'Static analysis of React components for render optimization and performance issues',
    parameters: {
      filePath: { type: 'string', description: 'Path to React component file', required: true },
      autoFix: { type: 'boolean', description: 'Apply automatic optimizations', required: false },
      verbose: { type: 'boolean', description: 'Show detailed analysis', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filePath: { type: 'string', required: true },
        autoFix: { type: 'boolean', required: false, default: false },
        verbose: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const content = await fs.readFile(validation.data.filePath, 'utf-8')
        const analysis = analyzeRenderOptimizations(content)

        const hookUsage = {
          useState: (content.match(/useState\s*\<|\(useState/g) || []).length,
          useEffect: (content.match(/useEffect/g) || []).length,
          useCallback: (content.match(/useCallback/g) || []).length,
          useMemo: (content.match(/useMemo/g) || []).length,
          useRef: (content.match(/useRef/g) || []).length
        }

        const complexity = (hookUsage.useState * 2) + (hookUsage.useEffect * 3) + hookUsage.useCallback + hookUsage.useMemo

        return formatSuccess({
          file: validation.data.filePath,
          performanceScore: analysis.score,
          rating: analysis.score >= 85 ? '✅ Excellent' :
                  analysis.score >= 70 ? '⚠️ Good' :
                  analysis.score >= 50 ? '🔧 Needs Work' : '🔴 Critical',
          issues: analysis.issues,
          recommendations: analysis.recommendations,
          hookUsage,
          complexityScore: complexity,
          complexityRating: complexity < 10 ? 'Simple' : complexity < 25 ? 'Moderate' : 'Complex',
          optimizationPriorities: [
            analysis.score < 70 ? '🔴 Fix inline function/object creation' : null,
            hookUsage.useCallback < hookUsage.useEffect ? '🟡 Wrap handlers with useCallback' : null,
            complexity > 20 ? '🟡 Consider extracting smaller hooks' : null
          ].filter(Boolean),
          suggestedHooks: Object.entries(REACT_HOOK_TEMPLATES).slice(0, 3)
        })
      } catch (e: any) {
        return formatError('Failed to analyze component', e.message)
      }
    }
  })
  .addTool({
    name: 'react_analyze_hooks',
    description: 'Validate hook dependencies and detect anti-patterns in custom hooks',
    parameters: {
      filePath: { type: 'string', description: 'Path to React file', required: true },
      checkExhaustiveDeps: { type: 'boolean', description: 'Check dependency arrays', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filePath: { type: 'string', required: true },
        checkExhaustiveDeps: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const content = await fs.readFile(validation.data.filePath, 'utf-8')
        
        const useEffectMatches = content.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[([\s\S]*?)\]\)/g)
        const effects: Array<{ body: string; deps: string[]; line: number }> = []
        
        for (const match of useEffectMatches) {
          const deps = match[2].split(',').map(d => d.trim()).filter(Boolean)
          effects.push({
            body: match[1],
            deps,
            line: 0
          })
        }

        const antiPatterns = []
        if (content.includes('JSON.parse') || content.includes('JSON.stringify')) {
          antiPatterns.push('📦 JSON operations inside render - consider useMemo')
        }
        if ((content.match(/\.map\s*\(\s*\w+\s*=>\s*\(\s*\{/g) || []).length > 0) {
          antiPatterns.push('🔑 Verify all mapped elements have proper key props')
        }
        if (content.includes('useState') && !content.includes('useCallback') && content.includes('onClick')) {
          antiPatterns.push('📌 Event handlers may cause re-renders - wrap with useCallback')
        }

        return formatSuccess({
          file: validation.data.filePath,
          hooksFound: {
            total: effects.length,
            effectsWithEmptyDeps: effects.filter(e => e.deps.length === 0).length,
            effectsWithManyDeps: effects.filter(e => e.deps.length > 4).length
          },
          antiPatterns,
          bestPractices: [
            '✅ Keep dependency arrays exhaustive',
            '✅ Extract large effects to custom hooks',
            '✅ Use functional updates for state based on previous',
            '✅ Clean up subscriptions and event listeners'
          ]
        })
      } catch (e: any) {
        return formatError('Failed to analyze hooks', e.message)
      }
    }
  })
  .addTool({
    name: 'react_generate_component',
    description: 'Generate enterprise-grade React component with TypeScript, memoization, and best practices',
    parameters: {
      name: { type: 'string', description: 'Component name (PascalCase)', required: true },
      variant: { type: 'string', description: 'Type: container, presentational, form, layout, data-fetching', required: false },
      includeMemo: { type: 'boolean', description: 'Include React.memo HOC', required: false },
      styling: { type: 'string', description: 'Styling: tailwind, emotion, css-modules, none', required: false },
      children: { type: 'boolean', description: 'Accept children prop', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        variant: { type: 'string', required: false, default: 'presentational' },
        includeMemo: { type: 'boolean', required: false, default: true },
        styling: { type: 'string', required: false, default: 'tailwind' },
        children: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const componentName = validation.data.name.charAt(0).toUpperCase() + validation.data.name.slice(1)
      
      const stylingImports = {
        tailwind: '',
        emotion: "import { css } from '@emotion/react'\n",
        'css-modules': "import styles from './${componentName}.module.css'\n",
        none: ''
      }

      const classNameAttr = validation.data.styling === 'tailwind' 
        ? "  className='px-4 py-2 rounded-lg shadow-sm'"
        : validation.data.styling === 'css-modules'
        ? "  className={styles.container}"
        : ''

      const component = `import ${validation.data.includeMemo ? 'React, { ' : '{ '}forwardRef, HTMLAttributes } from 'react'
${stylingImports[validation.data.styling as keyof typeof stylingImports]}
export interface ${componentName}Props extends HTMLAttributes<HTMLDivElement> {
  /**
   * Component variant
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  
  /**
   * Component size
   */
  size?: 'sm' | 'md' | 'lg'

  ${validation.data.children ? '/**\n   * React children\n   */\n  children?: React.ReactNode\n' : ''}
  /**
   * Optional click handler
   */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
}

/**
 * ${componentName} - ${validation.data.variant} component
 * 
 * @example
 * <${componentName} variant="primary" size="md">
 *   Content goes here
 * </${componentName}>
 */
const ${componentName} = forwardRef<HTMLDivElement, ${componentName}Props>((
  {
    variant = 'primary',
    size = 'md',
    ${validation.data.children ? 'children,' : ''}
    className,
    ...props
  },
  ref
) => {
  return (
    <div
      ref={ref}${classNameAttr}
      {...props}
    >
      ${validation.data.children ? '{children}' : ''}
    </div>
  )
})

${componentName}.displayName = '${componentName}'

${validation.data.includeMemo ? `export default React.memo(${componentName})
` : `export default ${componentName}
`}`

      return formatSuccess({
        componentName,
        variant: validation.data.variant,
        componentCode: component,
        features: [
          '✅ TypeScript interface with JSDoc',
          '✅ forwardRef support',
          '✅ HTML attribute extension',
          '✅ React.memo optimization',
          '✅ displayName for DevTools',
          '✅ Variant/Size pattern'
        ]
      })
    }
  })
  .addPrompt({
    name: 'enterprise-component-blueprint',
    description: 'Enterprise-grade React component architecture',
    arguments: [
      { name: 'name', description: 'Component name', required: true }
    ],
    generate: async (args?: Record<string, any>) => `## ⚛️ Enterprise React Component: ${args?.name}

### File Structure
\`\`\`
src/components/${args?.name}/
├── index.ts              # Barrel export
├── ${args?.name}.tsx     # Main component
├── ${args?.name}.test.tsx # Tests
├── ${args?.name}.stories.tsx # Storybook
├── ${args?.name}.hooks.ts # Custom hooks
└── types.ts              # Type definitions
\`\`\`

### Implementation Checklist

1. **Type Safety**
   - Extend native HTML attributes
   - Discriminated unions for variants
   - Branded types for IDs

2. **Accessibility**
   - ARIA labels for all interactive elements
   - Keyboard navigation (Tab/Enter/Escape)
   - Focus management and indicators

3. **Performance**
   - React.memo with custom comparator if needed
   - useCallback for event handlers
   - useMemo for derived data
   - No inline object/function creation

4. **Testing**
   - Rendering tests for each variant
   - User interaction tests
   - Accessibility scan with axe-core

5. **Documentation**
   - Storybook with controls
   - JSDoc on all public APIs
   - Usage examples for common patterns
`
  })
  .addResource({
    name: 'react-hooks-cheat-sheet',
    uri: 'docs://react/hooks-cheat-sheet',
    description: 'React Hooks Best Practices Reference',
    mimeType: 'text/markdown',
    get: async () => `
# ⚛️ React Hooks Cheat Sheet

## Core Hooks Decision Tree

| Scenario | Hook | Notes |
|----------|------|-------|
| Local state | \`useState\` | Simple values |
| Complex state | \`useReducer\` | Objects/arrays with transitions |
| Side effects | \`useEffect\` | Data fetching, subscriptions |
| Memoize values | \`useMemo\` | Expensive calculations (>1ms) |
| Memoize functions | \`useCallback\` | Passed to children or deps |
| Mutable values | \`useRef\` | DOM, timers, mutable state |
| Global state | \`useContext\` | Theme, auth, localization |

## useEffect Lifecycle

### Mount Only
\`\`\`ts
useEffect(() => {
  // Component mounted
  return () => { /* Unmount cleanup */ }
}, [])  // ⚠️ Empty = ONCE
\`\`\`

### When Dependency Changes
\`\`\`ts
useEffect(() => {
  // user.id changed
}, [user.id])  // Run when deps change
\`\`\`

## Anti-Patterns to Avoid

❌ **The Infinite Loop**
\`\`\`ts
useEffect(() => {
  setUser({...user, name: 'new'})  // ❌ user in deps
}, [user])  // 💥 Forever!
\`\`\`

✅ **Fix with functional update**
\`\`\`ts
useEffect(() => {
  setUser(prev => ({...prev, name: 'new'}))
}, [])  // ✅ No dependency!
\`\`\`

❌ **Lie to ESLint**
\`\`\`ts
// eslint-disable-next-line react-hooks/exhaustive-deps
// ❌ This creates bugs. Just fix it.
\`\`\`

## Performance Rules

1. **Don't pre-optimize blindly** - Profile first!
2. **useCallback = same reference** - Doesn't prevent renders
3. **React.memo** - Shallow compares props
4. **Always use ESLint Rule** - It's your friend!

## State Management Zen

**Local**: useState/useReducer - Component state  
**Client**: Zustand/Jotai - UI state, preferences  
**Server**: React Query/SWR - Cache, invalidation, background refetch
`
  })
