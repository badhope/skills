import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'mcp-template',
  version: '2.0.0',
  description: 'Professional MCP Template - Standardized starter kit for building high-quality Universal MCP tools with best practices',
  author: 'MCP Expert Community',
  icon: '✨'
})

  .addTool({
    name: 'generate_mcp_scaffold',
    description: 'Generate complete MCP scaffold with standardized patterns and best practices',
    parameters: {
      name: { type: 'string', description: 'MCP name (kebab-case, lowercase)', required: true },
      description: { type: 'string', description: 'One-line description of core value', required: true },
      author: { type: 'string', description: 'Author name', required: false },
      icon: { type: 'string', description: 'Emoji icon for this MCP', required: false },
      category: { type: 'string', description: 'Primary category', required: false },
      includeExampleTools: { type: 'boolean', description: 'Include example tools', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        author: { type: 'string', required: false, default: 'MCP Developer' },
        icon: { type: 'string', required: false, default: '✨' },
        category: { type: 'string', required: false, default: 'Utilities' },
        includeExampleTools: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const normalizedName = validation.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      const scaffold = `
import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: '${normalizedName}',
  version: '1.0.0',
  description: '${validation.data.description}',
  author: '${validation.data.author}',
  icon: '${validation.data.icon}'
})

  // Add your tools here

  .build()
      `.trim()

      return formatSuccess({
        name: normalizedName,
        directory: `mcp/${normalizedName}`,
        scaffold,
        nextSteps: [
          `1. mkdir -p mcp/${normalizedName}`,
          `2. Create mcp/${normalizedName}/index.ts with scaffold above`,
          '3. Add your custom tools using patterns below',
          '4. Run TypeScript build to verify',
          '5. Register in mcp/index.ts if needed'
        ],
        architecturePrinciples: `
## 🏗️ MCP ARCHITECTURE PRINCIPLES

### ✅ DO:
- Use validateParams for ALL input validation
- Return formatSuccess / formatError consistently
- Use safeExec / safeExecRaw for shell commands
- Include helpful contextual guidance in responses
- Add actionable checklists and recommendations
- Keep each tool focused on single responsibility
- Document parameters clearly and specifically

### ❌ DON'T:
- Throw exceptions - return formatError instead
- Use ad-hoc shell execution patterns
- Return raw strings - always structured data
- Skip parameter validation
- Write 500+ line monolithic tools
        `.trim(),
        toolExamples: validation.data.includeExampleTools ? [
          {
            name: 'process_data',
            pattern: 'Input validation + transformation + structured output',
            parameters: '{ input: { type: "string", required: true } }'
          },
          {
            name: 'execute_utility',
            pattern: 'Safe shell execution with timeout and error handling',
            parameters: '{ command: { type: "string", required: true } }'
          },
          {
            name: 'generate_content',
            pattern: 'Template-based generation with quality guidelines',
            parameters: '{ topic: { type: "string", required: true } }'
          }
        ] : []
      })
    }
  })

  .addTool({
    name: 'validate_mcp_quality',
    description: 'Run comprehensive MCP quality validation checklist',
    parameters: {
      path: { type: 'string', description: 'Path to MCP index.ts file', required: true },
      strictMode: { type: 'boolean', description: 'Enable strict quality checks', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        strictMode: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const checks = [
        { name: 'Uses shared utilities import', weight: 10 },
        { name: 'Parameter validation on all tools', weight: 15 },
        { name: 'Uses formatSuccess/formatError', weight: 15 },
        { name: 'Version 2.0.0', weight: 5 },
        { name: 'Professional description', weight: 10 },
        { name: 'withMetadata metadata present', weight: 10 },
        { name: 'Icon and author set', weight: 5 },
        { name: 'No console.log statements', weight: 5 },
        { name: 'Proper TypeScript types', weight: 10 },
        { name: 'No duplicate code patterns', weight: 10 },
        { name: 'Actionable recommendations in responses', weight: 5 }
      ]

      return formatSuccess({
        path: sanitizePath(validation.data.path),
        strictMode: validation.data.strictMode,
        qualityChecklist: checks,
        scoring: `
## 🎯 MCP QUALITY SCORING RUBRIC

### 90-100: Production Professional
- All checks pass
- Comprehensive contextual guidance
- Excellent error handling
- Full test coverage

### 75-89: Intermediate Ready
- Minor improvements needed
- Good structure overall
- Missing some quality polish

### <75: Needs Work
- Missing validation
- No error handling standardization
- No shared utilities usage
        `.trim(),
        antiPatterns: [
          '❌ Throwing exceptions instead of formatError',
          '❌ Raw exec without error handling',
          '❌ No parameter schema validation',
          '❌ Console.log debugging',
          '❌ "Magic numbers" without constants',
          '❌ Copy-pasted code without abstraction'
        ]
      })
    }
  })

  .addTool({
    name: 'tool_schema_generator',
    description: 'Generate standardized tool schema with complete validation rules',
    parameters: {
      toolName: { type: 'string', description: 'Name of tool (snake_case)', required: true },
      description: { type: 'string', description: 'What the tool actually does', required: true },
      params: { type: 'string', description: 'JSON string of parameter definitions', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        toolName: { type: 'string', required: true },
        description: { type: 'string', required: true },
        params: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let paramSchema: Record<string, any> = {}
      try {
        paramSchema = JSON.parse(validation.data.params)
      } catch (e) {
        return formatError('Invalid JSON for params', [(e as Error).message])
      }

      const validationRules = Object.entries(paramSchema).map(([key, spec]: [string, any]) => {
        const rules: string[] = []
        rules.push(`type: '${spec.type || 'string'}'`)
        rules.push(`required: ${spec.required !== false}`)
        if (spec.default !== undefined) rules.push(`default: ${JSON.stringify(spec.default)}`)
        if (spec.min !== undefined) rules.push(`min: ${spec.min}`)
        if (spec.max !== undefined) rules.push(`max: ${spec.max}`)
        if (spec.enum) rules.push(`enum: ${JSON.stringify(spec.enum)}`)
        return `  ${key}: { ${rules.join(', ')} }`
      }).join(',\n')

      const toolTemplate = `
.addTool({
  name: '${validation.data.toolName}',
  description: '${validation.data.description}',
  parameters: {
${Object.entries(paramSchema).map(([key, spec]: [string, any]) =>
    `    ${key}: { type: '${spec.type || 'string'}', description: '${spec.description || ''}', required: ${spec.required !== false} }`
  ).join(',\n')}
  },
  execute: async (params: Record<string, any>) => {
    const validation = validateParams(params, {
${validationRules}
    })
    if (!validation.valid) return formatError('Invalid parameters', validation.errors)

    // Your implementation here

    return formatSuccess({
      // Your structured result
    })
  }
})
      `.trim()

      return formatSuccess({
        toolName: validation.data.toolName,
        parameterCount: Object.keys(paramSchema).length,
        toolTemplate,
        implementationTips: [
          '✅ Keep execute function under 100 lines',
          '✅ Break complex logic into helper functions',
          '✅ Add actionable recommendations',
          '✅ Include relevant checklist items',
          '✅ Sanitize all file paths'
        ]
      })
    }
  })

  .addPrompt({
    name: 'new-mcp-checklist',
    description: 'Complete checklist for creating production-grade MCP',
    arguments: [],
    generate: async () => `
## ✅ PRODUCTION MCP CREATION CHECKLIST

### 📋 PHASE 1: PLANNING
- [ ] Define clear, specific value proposition
- [ ] Identify 3-5 core tools the MCP will provide
- [ ] Research existing MCPs to avoid duplication
- [ ] Choose appropriate category and rating
- [ ] Select memorable emoji icon

### 🏗️ PHASE 2: IMPLEMENTATION
- [ ] Copy from professional template
- [ ] Update package metadata (name, version, description)
- [ ] Add withMetadata metadata (categories, rating, features)
- [ ] Implement each tool with:
  - [ ] Clear specific description
  - [ ] Complete parameter definitions
  - [ ] Full validateParams schema
  - [ ] formatSuccess / formatError returns
  - [ ] Actionable recommendations/checklists
  - [ ] No exceptions thrown

### 🧪 PHASE 3: QUALITY
- [ ] Run TypeScript build: \`npx tsc --noEmit\`
- [ ] All parameters validated
- [ ] No console.log remaining
- [ ] Error cases handled gracefully
- [ ] Edge cases considered
- [ ] Documentation complete

### 🚀 PHASE 4: FINAL REVIEW
- [ ] Code follows existing patterns
- [ ] No copy-pasted duplicate code
- [ ] Uses shared utilities appropriately
- [ ] Professional-level output quality
    `.trim()
  })

  .addPrompt({
    name: 'mcp-error-handling',
    description: 'Standard error handling patterns for MCP development',
    arguments: [],
    generate: async () => `
## ⚠️ MCP ERROR HANDLING STANDARDS

### ✅ CORRECT PATTERN:
\`\`\`typescript
execute: async (params: Record<string, any>) => {
  const validation = validateParams(params, {
    path: { type: 'string', required: true }
  })
  if (!validation.valid) return formatError('Invalid parameters', validation.errors)

  try {
    const result = await riskyOperation()
    return formatSuccess({ result })
  } catch (e: any) {
    return formatError('Operation failed', [e.message])
  }
}
\`\`\`

### ❌ WRONG PATTERNS:

1. Throwing exceptions (crashes the whole server!)
\`\`\`typescript
throw new Error('something went wrong')  // ❌
\`\`\`

2. Silent failure:
\`\`\`typescript
return {}  // ❌ No indication of failure
\`\`\`

3. Raw strings only:
\`\`\`typescript
return "done"  // ❌ Not structured data
\`\`\`

### ERROR CATEGORIES:
- \`formatError('Invalid parameters', errors)\` - Input validation
- \`formatError('Operation failed', [message])\` - Runtime error
- \`formatError('Not found', [resource])\` - Missing resource
- \`formatError('Permission denied', [details])\` - Security/access
    `.trim()
  })

  .addPrompt({
    name: 'shared-utilities-reference',
    description: 'Complete reference for all shared utility functions',
    arguments: [],
    generate: async () => `
## 🛠️ SHARED UTILITIES REFERENCE

Always import:
\`\`\`typescript
import { validateParams, formatSuccess, formatError, safeExec, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'
\`\`\`

---

### ✅ validateParams(params, schema)
Input validation with type checking, defaults, and ranges.

\`\`\`typescript
const validation = validateParams(params, {
  name: { type: 'string', required: true },
  count: { type: 'number', required: false, default: 10, min: 1, max: 100 },
  format: { type: 'string', required: false, default: 'json', enum: ['json', 'csv', 'xml'] }
})
if (!validation.valid) return formatError('Invalid parameters', validation.errors)

// Use validation.data.name - guaranteed valid
\`\`\`

---

### ✅ formatSuccess(data)
Standardized success response format.

\`\`\`typescript
return formatSuccess({
  key: value,
  checklist: ['item1', 'item2'],
  recommendations: ['do this', 'do that']
})
\`\`\`

---

### ✅ formatError(message, errorList)
Standardized error response format.

\`\`\`typescript
return formatError('Description of what failed', [
  'Specific error 1',
  'Specific error 2'
])
\`\`\`

---

### ✅ safeExec(command, timeout, cwd)
Safe shell execution that NEVER throws.

\`\`\`typescript
const output = await safeExec('git status', 30000, './project')
// Returns stdout as string, errors contained
\`\`\`

---

### ✅ safeExecRaw(command, timeout, cwd)
Full execution details with exit code.

\`\`\`typescript
const result = await safeExecRaw('npm install', 120000)
// { stdout: string, stderr: string, exitCode: number, durationMs: number }
\`\`\`

---

### ✅ sanitizePath(path)
Security - prevent path traversal attacks.

\`\`\`typescript
const safe = sanitizePath(userProvidedPath)
// Removes .. traversal, normalizes separators
\`\`\`
    `.trim()
  })
  .build()
