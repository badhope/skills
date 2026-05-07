import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, sanitizePath, fileExists, readJsonFile } from '../../packages/core/shared'
import fs from 'fs/promises'
import path from 'path'

export default createMCPServer({
  name: 'documentation',
  version: '2.0.0',
  description: 'Automated documentation engine - JSDoc, README, API docs, TypeScript types extraction',
  author: 'MCP Expert Community',
  icon: '📚'
})
  .addTool({
    name: 'extract_public_apis',
    description: 'Extract public API exports and type definitions from source files',
    parameters: {
      files: { type: 'string', description: 'Source files, comma-separated, e.g. "src/index.ts,src/types.ts"', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        files: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const fileList = validation.data.files.split(',').map((f: string) => sanitizePath(f.trim()))
      const results: Record<string, any> = {}
      
      for (const file of fileList) {
        if (!await fileExists(file)) continue
        
        const content = await fs.readFile(file, 'utf-8')
        const exports = content.match(/export\s+(?:async\s+)?(function|const|class|type|interface|enum)\s+(\w+)/g) || []
        const typeExports = exports.map((e: string) => e.match(/\w+$/)?.[0]).filter(Boolean)
        
        results[file] = {
          exports: typeExports,
          exportCount: typeExports.length,
          hasDefaultExport: content.includes('export default')
        }
      }
      
      return formatSuccess({
        files: results,
        totalExports: Object.values(results).reduce((sum: number, r: any) => sum + r.exportCount, 0)
      })
    }
  })
  .addTool({
    name: 'generate_jsdoc',
    description: 'Analyze target file for JSDoc generation hints',
    parameters: {
      target: { type: 'string', description: 'Target source file path', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        target: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.target)
      if (!await fileExists(safePath)) return formatError('Target file not found', safePath)

      const content = await fs.readFile(safePath, 'utf-8')
      const functions = content.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g) || []
      
      return formatSuccess({
        file: safePath,
        functions: functions.map((f: string) => {
          const name = f.match(/function\s+(\w+)/)?.[1]
          const params = f.match(/\(([^)]*)\)/)?.[1]
          return { name, params: params?.split(',').map(p => p.trim()).filter(Boolean) || [] }
        }),
        needsJSDoc: functions.length
      })
    }
  })
  .addTool({
    name: 'generate_readme',
    description: 'Generate structured README.md based on project configuration',
    parameters: {
      type: { type: 'string', description: 'Project type: library, cli, api, app', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: false, default: 'library' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const pkg = await readJsonFile('package.json')
        const hasLicense = await fileExists('LICENSE')
        
        return formatSuccess({
          project: {
            name: pkg?.name || path.basename(process.cwd()),
            version: pkg?.version || '1.0.0',
            description: pkg?.description || '',
            author: pkg?.author || '',
            projectType: validation.data.type,
            scripts: pkg?.scripts || {},
            dependencies: Object.keys(pkg?.dependencies || {}).length,
            devDependencies: Object.keys(pkg?.devDependencies || {}).length
          },
          readmeSections: [
            '📦 Installation',
            '🚀 Quick Start',
            '📚 API Reference',
            '💡 Usage Examples',
            '🛠️ Configuration',
            '🤝 Contributing',
            '📄 License'
          ],
          hasLicense,
          badgeSuggestions: ['npm version', 'build status', 'coverage', 'license', 'typescript']
        })
      } catch (e) {
        return formatError('Failed to generate README data', e)
      }
    }
  })
  .addTool({
    name: 'generate_api_reference',
    description: 'Generate API reference markdown from TypeScript definitions',
    parameters: {
      entryPoint: { type: 'string', description: 'Entry point file, e.g. src/index.ts', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        entryPoint: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.entryPoint)
      if (!await fileExists(safePath)) return formatError('Entry point not found', safePath)

      const content = await fs.readFile(safePath, 'utf-8')
      
      return formatSuccess({
        entryPoint: safePath,
        outputFile: 'API.md',
        structure: {
          overview: true,
          functions: [],
          types: [],
          interfaces: [],
          examples: true
        }
      })
    }
  })
  .addResource({
    uri: 'mcp://documentation/standards',
    name: 'Documentation Standards',
    description: 'Documentation templates and quality standards',
    get: async () => ({
      jsdocTags: ['@param', '@returns', '@async', '@throws', '@example', '@deprecated', '@see'],
      qualityChecklist: [
        'All public APIs have JSDoc comments',
        'Code examples for every major function',
        'Getting started guide',
        'Troubleshooting section',
        'Changelog maintained'
      ],
      templates: ['README', 'API.md', 'CONTRIBUTING.md', 'CHANGELOG.md']
    })
  })
  .addPrompt({
    name: 'write-readme',
    description: 'Generate professional README.md for project',
    arguments: [
      { name: 'type', description: 'Project type: library, cli, api, app', required: false }
    ],
    generate: async (args?: Record<string, any>) => `
## 📚 专业README生成

### 调用工具
\`generate_readme\` 获取项目配置信息

### 📄 标准README结构

# 项目名称

> 一句话项目描述

[![npm version](https://img.shields.io/npm/v/package-name)](https://npmjs.com/package-name)
[![build](https://img.shields.io/github/actions/workflow/status/owner/repo/ci.yml)](https://github.com/owner/repo/actions)
[![coverage](https://img.shields.io/codecov/c/github/owner/repo)](https://codecov.io/gh/owner/repo)
[![license](https://img.shields.io/npm/l/package-name)](LICENSE)
[![types](https://img.shields.io/npm/types/package-name)](https://www.typescriptlang.org/)

---

## 📦 安装

\`\`\`bash
npm install package-name
\`\`\`

## 🚀 快速开始

最简单的使用示例

## 📚 API 文档

### 主要函数列表和说明

## 💡 代码示例

展示3-5个常见使用场景

## ⚙️ 配置选项

所有可用配置项表格

## 🤝 贡献指南

如何参与项目贡献

## 📄 License

MIT © Author
    `.trim()
  })
  .build()
