import { createMCPServer } from '../../packages/core/mcp/builder'
import * as fs from 'fs/promises'
import { validateParams, formatError, formatSuccess, safeExec, sanitizePath } from '../../packages/core/shared/utils'

const TS_CONFIG_RULES = {
  strict: { weight: 15, recommended: true },
  strictNullChecks: { weight: 10, recommended: true },
  strictFunctionTypes: { weight: 10, recommended: true },
  noImplicitAny: { weight: 10, recommended: true },
  noImplicitReturns: { weight: 8, recommended: true },
  noUnusedLocals: { weight: 5, recommended: true },
  noUnusedParameters: { weight: 5, recommended: true },
  exactOptionalPropertyTypes: { weight: 8, recommended: true },
  noImplicitOverride: { weight: 5, recommended: true },
  esModuleInterop: { weight: 5, recommended: true },
  skipLibCheck: { weight: 3, recommended: true },
  forceConsistentCasingInFileNames: { weight: 5, recommended: true },
  declaration: { weight: 5, recommended: true },
  sourceMap: { weight: 3, recommended: true }
}

function calculateStrictnessScore(config: any): { score: number; maxScore: number; violations: string[] } {
  let score = 0
  const maxScore = Object.values(TS_CONFIG_RULES).reduce((sum, rule) => sum + (rule as any).weight, 0)
  const violations: string[] = []

  for (const [rule, settings] of Object.entries(TS_CONFIG_RULES)) {
    const setting = settings as any
    const current = config.compilerOptions?.[rule]
    if (current === setting.recommended) {
      score += setting.weight
    } else {
      violations.push(`❌ ${rule}: expected ${setting.recommended}, got ${current}`)
    }
  }

  return { score, maxScore, violations }
}

function analyzeTypeIssues(content: string): {
  anyCount: number
  unknownCount: number
  neverCount: number
  objectCount: number
  issues: string[]
  recommendations: string[]
} {
  const anyCount = (content.match(/:\s*any\b/g) || []).length
  const unknownCount = (content.match(/:\s*unknown\b/g) || []).length
  const neverCount = (content.match(/:\s*never\b/g) || []).length
  const objectCount = (content.match(/:\s*object\b/g) || []).length

  const issues: string[] = []
  const recommendations: string[] = []

  if (anyCount > 5) {
    issues.push(`⚠️ Found ${anyCount} 'any' types detected`)
  }
  if (content.includes('// @ts-ignore')) {
    issues.push('⚠️ @ts-ignore comments found')
    recommendations.push('Remove @ts-ignore and use proper type assertions')
  }
  if (content.includes('// @ts-nocheck')) {
    issues.push('⚠️ @ts-nocheck found - entire file type checking disabled')
  }
  if (content.includes('as any')) {
    issues.push('⚠️ Type assertion to any detected')
    recommendations.push('Use type guards or narrowing instead')
  }
  if (content.includes('<any>')) {
    issues.push('⚠️ Angle bracket type assertions')
    recommendations.push('Use "as Type" syntax for consistency')
  }

  return { anyCount, unknownCount, neverCount, objectCount, issues, recommendations }
}

function getType(value: any): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]'
    const itemTypes = Array.from(new Set(value.map((v: any) => typeof v)))
    return itemTypes.length === 1 ? `${getType(value[0])}[]` : 'any[]'
  }
  if (typeof value === 'object') {
    return 'Record<string, any>'
  }
  return typeof value
}

function generateInterfaceFromData(obj: any, name: string, mode: string, useReadonly: boolean): string {
  const lines: string[] = []
  const prefix = useReadonly ? 'readonly ' : ''
  
  for (const [key, value] of Object.entries(obj)) {
    const isOptional = value === null || value === undefined
    const optionalMark = isOptional ? '?' : ''
    const type = getType(value)
    lines.push(`  ${prefix}${key}${optionalMark}: ${type}`)
  }

  if (mode === 'interface') {
    return `interface ${name} {\n${lines.join('\n')}\n}`
  } else if (mode === 'type') {
    return `type ${name} = {\n${lines.join('\n')}\n}`
  } else if (mode === 'zod') {
    return `import { z } from 'zod'

const ${name}Schema = z.object({
${lines.map(l => l.replace(prefix, '').replace(/: /, ': z.')).join(',\n')}
})

type ${name} = z.infer<typeof ${name}Schema>`
  }
  return ''
}

function extractInterfaceMetrics(content: string): {
  interfaceCount: number
  typeAliasCount: number
  genericCount: number
  utilityTypes: string[]
} {
  const interfaceCount = (content.match(/^interface\s+\w+/gm) || []).length
  const typeAliasCount = (content.match(/^type\s+\w+\s*=/gm) || []).length
  const genericCount = (content.match(/<[^>]*>/g) || []).length
  const matches = Array.from(content.matchAll(/(Partial|Required|Readonly|Record|Pick|Omit|Exclude|Extract|NonNullable|Parameters|ReturnType|Awaited)<[A-Za-z_,\[\]]+/g) || [])
  const utilityTypes = Array.from(new Set(matches.map(m => m[0])))

  return { interfaceCount, typeAliasCount, genericCount, utilityTypes }
}

export default createMCPServer({
  name: 'typescript',
  version: '2.0.0',
  description: 'TypeScript type mastery - advanced type system mastery, strictness auditing, and type safety engineering',
  author: 'MCP Expert Community',
  icon: '📘'
})
  .addTool({
    name: 'ts_audit_config',
    description: 'Comprehensive TypeScript config strictness audit with scoring and violation analysis',
    parameters: {
      configPath: { type: 'string', description: 'Path to tsconfig.json', required: false },
      autoFix: { type: 'boolean', description: 'Apply recommended strict settings', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        configPath: { type: 'string', required: false, default: 'tsconfig.json' },
        autoFix: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const configPath = sanitizePath(validation.data.configPath)
        let rawConfig = '{}'
        
        try {
          rawConfig = await fs.readFile(configPath, 'utf-8')
        } catch {
          return formatError('tsconfig.json not found', { path: configPath })
        }

        const config = JSON.parse(rawConfig)
        const { score, maxScore, violations } = calculateStrictnessScore(config)
        const percentage = Math.round((score / maxScore) * 100)

        if (validation.data.autoFix) {
          const newConfig = { ...config }
          for (const [rule, settings] of Object.entries(TS_CONFIG_RULES)) {
            if (!newConfig.compilerOptions) newConfig.compilerOptions = {}
            newConfig.compilerOptions[rule] = (settings as any).recommended
          }
          await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2))
        }

        return formatSuccess({
          configPath,
          strictnessScore: score,
          maxPossibleScore: maxScore,
          strictnessPercentage: percentage,
          grade: percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : 'D',
          violations: violations.slice(0, 20),
          rulesChecked: Object.keys(TS_CONFIG_RULES).length,
          autoFixApplied: validation.data.autoFix,
          recommendations: [
            percentage >= 90 ? '✅ Excellent type safety configuration' : '🔧 Consider enabling strict mode family',
            percentage < 80 ? '📈 Enable strictNullChecks prevents null bugs' : '',
            percentage < 70 ? '🔒 noImplicitAny catches type holes' : ''
          ].filter(Boolean)
        })
      } catch (e: any) {
        return formatError('Failed to audit TypeScript config', e.message)
      }
    }
  })
  .addTool({
    name: 'ts_analyze_types',
    description: 'Deep type analysis - detect any, unsafe casts, @ts-ignore, and type anti-patterns',
    parameters: {
      path: { type: 'string', description: 'File or directory path to analyze', required: true },
      recursive: { type: 'boolean', description: 'Scan directory recursively', required: false },
      threshold: { type: 'number', description: 'Report files above this any threshold', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        recursive: { type: 'boolean', required: false, default: true },
        threshold: { type: 'number', required: false, default: 3 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const targetPath = sanitizePath(validation.data.path)
        const stat = await fs.stat(targetPath)
        const files: string[] = []

        if (stat.isDirectory()) {
          const findCmd = validation.data.recursive
            ? `Get-ChildItem -Path "${targetPath}" -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch 'node_modules' } | Select-Object -ExpandProperty FullName`
            : `Get-ChildItem -Path "${targetPath}" -Include *.ts,*.tsx | Select-Object -ExpandProperty FullName`
          const result = await safeExec(findCmd)
          files.push(...result.split('\n').filter(Boolean))
        } else {
          files.push(targetPath)
        }

        const fileResults = []

        for (const file of files.slice(0, 50)) {
          try {
            const content = await fs.readFile(file, 'utf-8')
            const metrics = analyzeTypeIssues(content)
            const typeMetrics = extractInterfaceMetrics(content)

            if (metrics.anyCount >= validation.data.threshold) {
              fileResults.push({
                file,
                ...metrics,
                ...typeMetrics,
                riskLevel: metrics.anyCount > 10 ? '🔴 High' : metrics.anyCount > 5 ? '🟠 Medium' : '🟡 Low',
                lineCount: content.split('\n').length
              })
            }
          } catch {}
        }

        const totalAny = fileResults.reduce((sum, r) => sum + r.anyCount, 0)
        const avgAnyPerFile = fileResults.length > 0 ? Math.round(totalAny / fileResults.length) : 0

        return formatSuccess({
          analyzed: files.length,
          filesAnalyzed: fileResults.length,
          totalAnyTypes: totalAny,
          avgAnyPerFile,
          highRiskFiles: fileResults.filter(f => f.riskLevel.includes('High')).length,
          mediumRiskFiles: fileResults.filter(f => f.riskLevel.includes('Medium')).length,
          files: fileResults.slice(0, 30),
          summary: {
            totalInterfaces: fileResults.reduce((sum, r) => sum + r.interfaceCount, 0),
            totalTypeAliases: fileResults.reduce((sum, r) => sum + r.typeAliasCount, 0),
            utilityTypesUsed: Array.from(new Set(fileResults.flatMap(f => f.utilityTypes))).length
          }
        })
      } catch (e: any) {
        return formatError('Failed to analyze types', e.message)
      }
    }
  })
  .addTool({
    name: 'ts_generate_types',
    description: 'Generate advanced TypeScript types from JSON, schemas, or samples',
    parameters: {
      source: { type: 'string', description: 'JSON string or JSON schema to generate types from', required: true },
      typeName: { type: 'string', description: 'Name for the root type', required: true },
      mode: { type: 'string', description: 'Generation mode: interface, type, zod', required: false },
      readonly: { type: 'boolean', description: 'Make properties readonly', required: false },
      optionalNullable: { type: 'boolean', description: 'Make optional properties nullable', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        source: { type: 'string', required: true },
        typeName: { type: 'string', required: true },
        mode: { type: 'string', required: false, default: 'interface' },
        readonly: { type: 'boolean', required: false, default: false },
        optionalNullable: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const data = JSON.parse(validation.data.source)
        const generated = generateInterfaceFromData(
          data, 
          validation.data.typeName,
          validation.data.mode,
          validation.data.readonly
        )

        return formatSuccess({
          typeName: validation.data.typeName,
          mode: validation.data.mode,
          generatedCode: generated,
          features: [
            `✅ Generated from JSON source`,
            validation.data.readonly ? '✅ Readonly properties enabled' : '',
            `✅ Proper type inference`
          ].filter(Boolean)
        })
      } catch (e: any) {
        return formatError('Failed to generate types', e.message)
      }
    }
  })
  .addTool({
    name: 'ts_fix_any',
    description: 'Auto-fix common type issues with intelligent type replacements',
    parameters: {
      file: { type: 'string', description: 'File to fix', required: true },
      aggressive: { type: 'boolean', description: 'Apply aggressive fixes', required: false },
      dryRun: { type: 'boolean', description: 'Preview changes', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        file: { type: 'string', required: true },
        aggressive: { type: 'boolean', required: false, default: false },
        dryRun: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const filePath = sanitizePath(validation.data.file)
        let content = await fs.readFile(filePath, 'utf-8')
        const originalContent = content

        const replacements = []

        if (content.includes(': any')) {
          replacements.push({ from: ': any', to: ': unknown' })
          content = content.replace(/: any\b/g, ': unknown')
        }

        if (content.includes('as any')) {
          replacements.push({ from: 'as any', to: 'as unknown' })
          content = content.replace(/ as any\b/g, ' as unknown')
        }

        if (validation.data.aggressive) {
          if (content.includes('object')) {
            content = content.replace(/: object\b/g, ': Record<string, unknown>')
            replacements.push({ from: ': object', to: ': Record<string, unknown>' })
          }
        }

        const tsIgnoreCount = (originalContent.match(/\/\/\s*@ts-ignore/g) || []).length

        if (!validation.data.dryRun) {
          await fs.writeFile(filePath, content)
        }

        return formatSuccess({
          file: filePath,
          dryRun: validation.data.dryRun,
          replacementsApplied: replacements.length,
          tsIgnoresFound: tsIgnoreCount,
          changesPreview: content !== originalContent,
          diff: {
            originalAnyCount: (originalContent.match(/: any\b/g) || []).length,
            remainingAnyCount: (content.match(/: any\b/g) || []).length
          }
        })
      } catch (e: any) {
        return formatError('Failed to fix types', e.message)
      }
    }
  })
  .addTool({
    name: 'ts_type_challenge',
    description: 'TypeScript type challenge generator for type gymnastics practice',
    parameters: {
      difficulty: { type: 'string', description: 'Difficulty level: easy, medium, hard, extreme', required: false },
      category: { type: 'string', description: 'Challenge category', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        difficulty: { type: 'string', required: false, default: 'medium' },
        category: { type: 'string', required: false, default: 'generics' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const challenges = {
        easy: [
          {
            name: 'MyPick', description: 'Implement the built-in Pick<T, K>',
            template:
`type MyPick<T, K extends keyof T> = {
  // Your implementation here
}

// Test cases
type Result1 = MyPick<{a: 1, b: 2, c: 3}, 'a' | 'b'>
// Expected: {a: 1, b: 2}`
          },
          {
            name: 'MyReadonly',
            description: 'Implement the built-in Readonly<T>',
            template:
`type MyReadonly<T> = {
  // Your implementation here
}`
          }
        ],
        medium: [
          {
            name: 'DeepReadonly',
            description: 'Implement a deep readonly type',
            template:
`type DeepReadonly<T> = {
  // Your implementation here
}`
          },
          {
            name: 'TupleToUnion',
            description: 'Convert tuple type to union type',
            template:
`type TupleToUnion<T extends readonly any[]> =
  // Your implementation here`
          }
        ],
        hard: [
          {
            name: 'SimpleVue',
            description: 'Type a simple Vue-like type',
            template:
`type SimpleVue<Data, Methods, Computed> = {
  // Implement a Vue component type that infers this context
}`
          }
        ]
      }

      const levelChallenges = challenges[validation.data.difficulty as keyof typeof challenges] || challenges.medium

      return formatSuccess({
        difficulty: validation.data.difficulty,
        category: validation.data.category,
        availableChallenges: levelChallenges.length,
        challenges: levelChallenges.map((c, i) => ({
          id: i + 1,
          name: c.name,
          description: c.description,
          template: c.template
        }))
      })
    }
  })
  .addResource({
    name: 'typescript-cheatsheet',
    uri: 'cheatsheet://typescript/advanced-patterns',
    description: 'TypeScript Advanced Type Patterns Cheat Sheet',
    mimeType: 'text/markdown',
    get: async () => `
# 📘 TypeScript 高级类型模式速查表

## 严格配置推荐
\`\`\`json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true
  }
}
\`\`\`

## 工具类型

### 内置工具类型
- \`Partial<T>\` - 所有属性可选
- \`Required<T>\` - 所有属性必需
- \`Readonly<T>\` - 所有属性只读
- \`Record<K, V>\` - 键值对映射
- \`Pick<T, K>\` - 选取部分属性
- \`Omit<T, K>\` - 排除部分属性
- \`Exclude<T, U>\` - 排除联合成员
- \`Extract<T, U>\` - 提取联合成员
- \`NonNullable<T>\` - 排除 null/undefined
- \`Parameters<F>\` - 函数参数类型
- \`ReturnType<F>\` - 函数返回类型
- \`Awaited<T>\` - Promise 解析类型

## 高级模式

### 条件类型
\`\`\`typescript
type IsString<T> = T extends string ? true : false
type IsNever<T> = [T] extends [never] ? true : false
type IsUnion<T, U = T> =
  T extends U ? ([U] extends [T] ? false : true) : false
\`\`\`

### 模板字面量类型
\`\`\`typescript
type EventName<T extends string> = \`on\${Capitalize<T>}\`
type CSSValue = \`\${number}px\` | \`\${number}rem\`
\`\`\`

### 递归类型
\`\`\`typescript
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? DeepPartial<T[K]>
    : T[K]
}
\`\`\`

## 类型守卫
\`\`\`typescript
function isString(x: unknown): x is string {
  return typeof x === 'string'
}

function hasProperty<Obj, Prop extends string>(
  obj: Obj,
  prop: Prop
): obj is Obj & Record<Prop, unknown> {
  return prop in obj
}
\`\`\`

## Branded Types
\`\`\`typescript
type Brand<T, B> = T & { __brand: B }
type UserId = Brand<string, 'UserId'>
type Email = Brand<string, 'Email'>
\`\`\`
    `.trim()
  })
  .addPrompt({
    name: 'type-mastery',
    description: 'TypeScript type mastery system prompt',
    arguments: [
      { name: 'strictness', description: 'Strictness level: basic, strict, strictest' }
    ],
    generate: async (args?: Record<string, any>) => {
      const level = args?.strictness || 'strict'
      
      return `
## 📘 TypeScript 类型专家模式

### 核心原则
1. **优先使用类型推断而非显式注解
2. **拒绝 any - 使用 unknown 代替
3. **使用范型建立类型关联
4. **通过类型守卫收窄类型
5. **利用 branded types 建立名义类型
6. **优先 interface 而非 type alias

### 严格级别: ${level}

### 检查清单
- [ ] 没有 : any 类型
- [ ] 没有 // @ts-ignore
- [ ] 没有 as any 类型断言
- [ ] 启用 strictNullChecks
- [ ] 启用 strictFunctionTypes
- [ ] 启用 noImplicitAny

### 高级技术
- 条件类型分发
- 映射类型转换
- 模板字面量类型
- 递归类型定义
- 变元元组
      `.trim()
    }
  })
  .build()
