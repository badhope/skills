import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, sanitizePath, readJsonFile } from '../../packages/core/shared'
import fs from 'fs/promises'

export default createMCPServer({
  name: 'code-generator',
  version: '2.0.0',
  description: 'Intelligent scaffolding engine - CRUD APIs, components, templates with project auto-detection',
  author: 'MCP Expert Community',
  icon: '⚡'
})
  .addTool({
    name: 'detect_project_type',
    description: 'Auto-detect project tech stack and framework configuration',
    parameters: {},
    execute: async () => {
      try {
        const pkg = await readJsonFile('package.json')
        const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
        
        const framework = deps.react ? 'react' : deps.vue ? 'vue' : deps.next ? 'nextjs' : deps.angular ? 'angular' : deps.svelte ? 'svelte' : 'unknown'
        const backend = deps.express ? 'express' : deps['@nestjs/core'] ? 'nestjs' : deps.fastify ? 'fastify' : deps.koa ? 'koa' : deps.django ? 'django' : deps.fastapi ? 'fastapi' : 'unknown'
        
        return formatSuccess({
          framework,
          backend,
          language: deps.typescript ? 'typescript' : 'javascript',
          styling: deps.tailwindcss ? 'tailwind' : deps['@mui/material'] ? 'mui' : deps.antd ? 'antd' : deps['styled-components'] ? 'styled-components' : 'css',
          testing: deps.jest ? 'jest' : deps.vitest ? 'vitest' : deps.mocha ? 'mocha' : 'unknown',
          packageManager: await fs.access('pnpm-lock.yaml').then(() => 'pnpm').catch(async () => 
            fs.access('yarn.lock').then(() => 'yarn').catch(() => 'npm')
          )
        })
      } catch (e) {
        return formatError('Failed to detect project type', e)
      }
    }
  })
  .addTool({
    name: 'generate_crud_api',
    description: 'Generate standardized CRUD API code with model and routes',
    parameters: {
      model: { type: 'string', description: 'Data model name, e.g. "User" or "Product"', required: true },
      fields: { type: 'string', description: 'Model fields, comma-separated, e.g. "id,name,email"', required: true },
      framework: { type: 'string', description: 'Backend framework: express, nestjs, fastapi', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        model: { type: 'string', required: true },
        fields: { type: 'string', required: true },
        framework: { type: 'string', required: false, default: 'express' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const fieldList = validation.data.fields.split(',').map((f: string) => f.trim())
      const modelName = validation.data.model.charAt(0).toUpperCase() + validation.data.model.slice(1).toLowerCase()
      
      return formatSuccess({
        model: modelName,
        fields: fieldList,
        framework: validation.data.framework,
        endpoints: ['GET /' + modelName.toLowerCase() + 's', 'GET /' + modelName.toLowerCase() + 's/:id', 'POST /' + modelName.toLowerCase() + 's', 'PUT /' + modelName.toLowerCase() + 's/:id', 'DELETE /' + modelName.toLowerCase() + 's/:id'],
        template: 'standard-crud',
        filesToCreate: [`models/${modelName}.ts`, `controllers/${modelName}Controller.ts`, `routes/${modelName}Routes.ts`, `services/${modelName}Service.ts`]
      })
    }
  })
  .addTool({
    name: 'generate_component',
    description: 'Generate frontend component with types and props',
    parameters: {
      name: { type: 'string', description: 'Component name, e.g. "Button" or "UserCard"', required: true },
      props: { type: 'string', description: 'Component props, comma-separated, e.g. "title,subtitle,onClick"', required: false },
      type: { type: 'string', description: 'Component type: button, form, table, card, modal, list', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        props: { type: 'string', required: false, default: '' },
        type: { type: 'string', required: false, default: 'card' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const propList = validation.data.props ? validation.data.props.split(',').map((p: string) => p.trim()) : []
      const componentName = validation.data.name.charAt(0).toUpperCase() + validation.data.name.slice(1)
      const pkg = await readJsonFile('package.json').catch(() => ({}))
      
      return formatSuccess({
        componentName,
        props: propList,
        type: validation.data.type,
        config: {
          typescript: !!(pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript),
          framework: pkg?.dependencies?.react ? 'react' : 'unknown'
        },
        outputPath: sanitizePath(`components/${componentName}.tsx`),
        suggestedExports: [`export { default as ${componentName} } from './${componentName}'`]
      })
    }
  })
  .addTool({
    name: 'generate_hook',
    description: 'Generate React custom hook template',
    parameters: {
      name: { type: 'string', description: 'Hook name without "use" prefix, e.g. "LocalStorage" or "Debounce"', required: true },
      returnValues: { type: 'string', description: 'Return values, comma-separated', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        returnValues: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const hookName = 'use' + validation.data.name.charAt(0).toUpperCase() + validation.data.name.slice(1)
      const returns = validation.data.returnValues ? validation.data.returnValues.split(',').map((r: string) => r.trim()) : []
      
      return formatSuccess({
        hookName,
        returns,
        outputPath: sanitizePath(`hooks/${hookName}.ts`),
        template: 'custom-hook'
      })
    }
  })
  .addResource({
    uri: 'mcp://code-generator/templates',
    name: 'Code Generation Templates',
    description: 'Available code templates and generation patterns',
    get: async () => ({
      frontend: [
        { id: 'react-component', name: 'React Component', variants: ['functional', 'class'] },
        { id: 'custom-hook', name: 'React Custom Hook' },
        { id: 'context-provider', name: 'Context + Provider' },
        { id: 'hoc', name: 'Higher Order Component' }
      ],
      backend: [
        { id: 'standard-crud', name: 'Standard CRUD API' },
        { id: 'rest-controller', name: 'REST Controller' },
        { id: 'graphql-resolver', name: 'GraphQL Resolver' },
        { id: 'middleware', name: 'Express/Nest Middleware' }
      ],
      supportedFrameworks: ['react', 'vue', 'express', 'nestjs', 'nextjs']
    })
  })
  .addPrompt({
    name: 'gen-component',
    description: 'Generate production-ready frontend component',
    arguments: [
      { name: 'name', description: 'Component name', required: true },
      { name: 'type', description: 'Component type: button, form, table, card, modal, list', required: false }
    ],
    generate: async (args?: Record<string, any>) => {
      const name = args?.name || 'Component'
      return `
## ⚡ 企业级组件生成: ${name}

### 📋 标准化工作流

**第1步: 项目环境检测**
调用 \`detect_project_type\` 确认技术栈

**第2步: 获取配置**
调用 \`generate_component\` 获取组件配置

**第3步: 完整代码生成**
按照以下结构输出生产级代码：

\`\`\`typescript
import React from 'react'

export interface ${name}Props {
  // 类型定义
}

export function ${name}({ ... }: ${name}Props) {
  return <div />
}

export default ${name}
\`\`\`

### 🎯 组件质量标准
1. ✅ TypeScript 严格类型定义
2. ✅ 默认 Props 和可选参数
3. ✅ 完整的 JSDoc 文档
4. ✅ 无障碍 ARIA 属性
5. ✅ 响应式设计支持
6. ✅ 主题/深色模式兼容
7. ✅ 性能优化（memo, useCallback）

### 📦 文件结构
- \`components/${name}/index.tsx\` - 主组件
- \`components/${name}/types.ts\` - 类型定义
- \`components/${name}/styles.ts\` - 样式文件
- \`components/${name}/README.md\` - 组件文档
      `.trim()
    }
  })
  .addPrompt({
    name: 'gen-crud-api',
    description: 'Generate complete CRUD API architecture',
    arguments: [
      { name: 'model', description: 'Data model name', required: true },
      { name: 'fields', description: 'Model fields, comma-separated', required: true }
    ],
    generate: async (args?: Record<string, any>) => `
## 🏗️ CRUD API 生成: ${args?.model || 'Model'}

### 数据库字段: ${args?.fields || 'id'}

### 📁 分层架构
\`\`\`
src/
├── models/         # 数据模型定义
├── controllers/    # 请求处理层
├── services/       # 业务逻辑层
├── repositories/   # 数据访问层
├── routes/         # 路由定义
├── middleware/     # 中间件
├── validators/     # 参数校验
└── tests/          # 单元测试
\`\`\`

### 🔌 API 端点

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | /api/${args?.model || 'model'}s | 列表查询 | JWT |
| GET | /api/${args?.model || 'model'}s/:id | 单条查询 | JWT |
| POST | /api/${args?.model || 'model'}s | 创建 | JWT |
| PUT | /api/${args?.model || 'model'}s/:id | 更新 | JWT |
| DELETE | /api/${args?.model || 'model'}s/:id | 删除 | Admin |

### ✅ 企业级特性
- 参数校验 (Joi/Zod)
- 错误处理和日志
- 权限控制
- 数据验证
- 分页支持
- 搜索过滤
- ETag 缓存
- Swagger 文档
    `.trim()
  })
  .build()
