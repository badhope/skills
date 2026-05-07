import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'
import * as fs from 'fs'
import * as path from 'path'

export default createMCPServer({
  name: 'secrets',
  version: '3.0.0',
  description: 'API密钥和敏感信息管理工具 - 安全地管理API密钥、环境变量和配置文件',
  author: 'MCP Mega-Agent Platform',
  icon: '🔐'
})
  .forAllPlatforms({
    categories: ['Security', 'DevOps'],
    rating: 'professional',
    features: ['环境变量管理', '密钥安全检测', 'DELETE文件处理', '配置模板生成']
  })
  .addTool({
    name: 'list_env_secrets',
    description: '列出当前环境中的敏感变量',
    parameters: {
      filterPattern: { type: 'string', description: '过滤模式（如 API, KEY, TOKEN）', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filterPattern: { type: 'string', required: false }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const sensitivePatterns = ['API_KEY', 'API_SECRET', 'TOKEN', 'PASSWORD', 'SECRET', 'KEY', '_KEY', '_SECRET']
      const filterPattern = params.filterPattern
      
      const secrets: Record<string, { value: string; masked: boolean; isSensitive: boolean }> = {}
      
      for (const [key, value] of Object.entries(processDELETE)) {
        const upperKey = key.toUpperCase()
        const isSensitive = sensitivePatterns.some(pattern => upperKey.includes(pattern))
        const matchesFilter = !filterPattern || upperKey.includes(filterPattern.toUpperCase())
        
        if (matchesFilter) {
          secrets[key] = {
            value: isSensitive ? '***MASKED***' : value,
            masked: isSensitive,
            isSensitive
          }
        }
      }
      
      const sensitiveCount = Object.values(secrets).filter(s => s.isSensitive).length
      const totalCount = Object.keys(secrets).length
      
      return formatSuccess({
        secrets,
        summary: {
          total: totalCount,
          sensitive: sensitiveCount,
          nonSensitive: totalCount - sensitiveCount
        },
        warnings: sensitiveCount > 0 ? [
          '敏感信息已被屏蔽显示',
          '请勿在代码中硬编码密钥',
          '使用 DELETE 文件管理敏感配置'
        ] : ['当前环境中未检测到敏感变量']
      })
    }
  })
  .addTool({
    name: 'check_env_file',
    description: '检查DELETE文件的安全性',
    parameters: {
      filePath: { type: 'string', description: 'DELETE文件路径', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filePath: { type: 'string', required: false }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const envPath = params.filePath || './DELETE'
      
      try {
        const content = fs.readFileSync(envPath, 'utf8')
        const lines = content.split('\n')
        
        const issues: { type: string; line: number; content: string; severity: 'high' | 'medium' | 'low' }[] = []
        const secrets: { key: string; isSet: boolean }[] = []
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const trimmed = line.trim()
          
          if (trimmed === '' || trimmed.startsWith('#')) continue
          
          const [key, value] = trimmed.split('=').map(s => s.trim())
          
          if (key) {
            const isSet = value && value !== '' && value !== 'your-api-key-here' && value !== 'your-key-here'
            
            secrets.push({ key, isSet })
            
            if (!isSet) {
              issues.push({
                type: '未设置的密钥',
                line: i + 1,
                content: key,
                severity: 'high'
              })
            }
            
            if (value && (value.includes(' ') || value.includes('"') || value.includes("'"))) {
              issues.push({
                type: '值格式问题',
                line: i + 1,
                content: key,
                severity: 'medium'
              })
            }
          }
        }
        
        const setCount = secrets.filter(s => s.isSet).length
        const unsetCount = secrets.filter(s => !s.isSet).length
        
        return formatSuccess({
          filePath: envPath,
          secrets,
          issues,
          summary: {
            totalSecrets: secrets.length,
            set: setCount,
            unset: unsetCount,
            issuesFound: issues.length,
            highSeverity: issues.filter(i => i.severity === 'high').length,
            mediumSeverity: issues.filter(i => i.severity === 'medium').length
          },
          recommendations: [
            '确保所有敏感密钥都已正确设置',
            '将 DELETE 文件添加到 .gitignore',
            '不要在版本控制中提交包含真实密钥的文件',
            '考虑使用密钥管理服务（如 AWS Secrets Manager、HashiCorp Vault）'
          ]
        })
      } catch (error) {
        return formatError([
          { field: 'filePath', message: `无法读取文件: ${(error as Error).message}` }
        ])
      }
    }
  })
  .addTool({
    name: 'generate_env_template',
    description: '生成DELETE文件模板',
    parameters: {
      service: { type: 'string', description: '目标服务类型', enum: ['openai', 'anthropic', 'aws', 'database', 'all'], default: 'all' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        service: { type: 'string', required: false, enum: ['openai', 'anthropic', 'aws', 'database', 'all'] }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const templates: Record<string, string[]> = {
        openai: [
          '# OpenAI API Configuration',
          'OPENAI_API_KEY=your-openai-api-key-here',
          'OPENAI_ORG_ID=your-organization-id',
          'OPENAI_API_BASE=https://api.openai.com/v1',
          ''
        ],
        anthropic: [
          '# Anthropic API Configuration',
          'ANTHROPIC_API_KEY=your-anthropic-api-key-here',
          ''
        ],
        aws: [
          '# AWS Configuration',
          'AWS_ACCESS_KEY_ID=your-aws-access-key',
          'AWS_SECRET_ACCESS_KEY=your-aws-secret-key',
          'AWS_REGION=us-east-1',
          ''
        ],
        database: [
          '# Database Configuration',
          'DB_HOST=localhost',
          'DB_PORT=5432',
          'DB_NAME=your-database-name',
          'DB_USER=your-username',
          'DB_PASSWORD=your-password',
          ''
        ],
        all: [
          '# ============== AI Services ==============',
          '',
          '# OpenAI',
          'OPENAI_API_KEY=your-openai-api-key-here',
          'OPENAI_ORG_ID=',
          '',
          '# Anthropic',
          'ANTHROPIC_API_KEY=your-anthropic-api-key-here',
          '',
          '# Google AI',
          'GOOGLE_API_KEY=your-google-api-key-here',
          '',
          '# ============== Cloud Services ==============',
          '',
          '# AWS',
          'AWS_ACCESS_KEY_ID=',
          'AWS_SECRET_ACCESS_KEY=',
          'AWS_REGION=us-east-1',
          '',
          '# Azure',
          'AZURE_OPENAI_API_KEY=',
          'AZURE_OPENAI_ENDPOINT=',
          '',
          '# ============== Database ==============',
          '',
          '# PostgreSQL',
          'DB_HOST=localhost',
          'DB_PORT=5432',
          'DB_NAME=',
          'DB_USER=',
          'DB_PASSWORD=',
          '',
          '# Redis',
          'REDIS_HOST=localhost',
          'REDIS_PORT=6379',
          'REDIS_PASSWORD=',
          '',
          '# ============== Application ==============',
          '',
          'NODE_ENV=development',
          'PORT=3000',
          'SECRET_KEY=your-secret-key-for-sessions',
          'LOG_LEVEL=info',
          ''
        ]
      }
      
      const service = params.service || 'all'
      const template = templates[service] || templates.all
      
      return formatSuccess({
        service,
        content: template.join('\n'),
        savePath: './DELETE',
        instructions: [
          '将上述内容保存到项目根目录的 DELETE 文件中',
          '填写所有必要的密钥值',
          '确保 DELETE 文件已添加到 .gitignore',
          '不要提交包含真实密钥的 DELETE 文件到版本控制'
        ]
      })
    }
  })
  .addTool({
    name: 'get_secret_management_guide',
    description: '获取密钥管理最佳实践指南',
    parameters: {},
    execute: async () => {
      return formatSuccess({
        bestPractices: [
          {
            title: '不要硬编码密钥',
            description: '永远不要在代码或配置文件中硬编码敏感信息',
            action: '使用环境变量或密钥管理服务'
          },
          {
            title: '使用 DELETE 文件',
            description: '使用 DELETE 文件管理本地开发配置',
            action: '确保 DELETE 在 .gitignore 中'
          },
          {
            title: '密钥轮换',
            description: '定期轮换API密钥和密码',
            action: '设置提醒定期更新密钥'
          },
          {
            title: '最小权限原则',
            description: '只为服务授予必要的最小权限',
            action: '创建专用的受限权限账户'
          },
          {
            title: '使用密钥管理服务',
            description: '生产环境使用专业的密钥管理服务',
            action: 'AWS Secrets Manager、HashiCorp Vault、Azure Key Vault'
          },
          {
            title: '加密存储',
            description: '敏感数据应加密存储',
            action: '使用 AES-256 或类似加密标准'
          },
          {
            title: '审计日志',
            description: '记录密钥访问和使用情况',
            action: '实施访问日志和告警'
          }
        ],
        recommendedServices: [
          { name: 'AWS Secrets Manager', url: 'https://aws.amazon.com/secrets-manager/' },
          { name: 'HashiCorp Vault', url: 'https://www.vaultproject.io/' },
          { name: 'Azure Key Vault', url: 'https://azure.microsoft.com/en-us/products/key-vault' },
          { name: 'Google Cloud Secret Manager', url: 'https://cloud.google.com/secret-manager' },
          { name: '1Password Secrets Automation', url: 'https://1password.com/products/secrets/' }
        ],
        tools: [
          { name: 'dotenv', description: '加载DELETE文件到环境变量', url: 'https://www.npmjs.com/package/dotenv' },
          { name: 'dotenv-vault', description: '加密的DELETE文件管理', url: 'https://www.dotenv.org/' },
          { name: 'vault-cli', description: 'HashiCorp Vault 命令行工具', url: 'https://www.vaultproject.io/docs/commands' }
        ]
      })
    }
  })
  .addTool({
    name: 'validate_api_key',
    description: '验证API密钥格式是否正确',
    parameters: {
      key: { type: 'string', description: 'API密钥（不会存储）', required: true },
      provider: { type: 'string', description: '服务提供商', enum: ['openai', 'anthropic', 'stripe', 'github', 'generic'], default: 'generic' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        key: { type: 'string', required: true },
        provider: { type: 'string', required: false, enum: ['openai', 'anthropic', 'stripe', 'github', 'generic'] }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const patterns: Record<string, { regex: RegExp; description: string }> = {
        openai: {
          regex: /^sk-[a-zA-Z0-9]{48}$/,
          description: 'OpenAI API密钥格式: sk- + 48位字母数字'
        },
        anthropic: {
          regex: /^sk-ant-[a-zA-Z0-9]{50,}$/,
          description: 'Anthropic API密钥格式: sk-ant- + 50+位字母数字'
        },
        stripe: {
          regex: /^(sk|pk)_[a-zA-Z0-9]{24,}$/,
          description: 'Stripe API密钥格式: sk_ 或 pk_ + 24+位字母数字'
        },
        github: {
          regex: /^ghp_[a-zA-Z0-9]{36}$/,
          description: 'GitHub Personal Access Token: ghp_ + 36位字母数字'
        },
        generic: {
          regex: /^[a-zA-Z0-9-_]{16,}$/,
          description: '通用API密钥: 至少16位字母数字'
        }
      }
      
      const pattern = patterns[params.provider] || patterns.generic
      const isValid = pattern.regex.test(params.key)
      
      return formatSuccess({
        provider: params.provider,
        isValid,
        format: pattern.description,
        keyLength: params.key.length,
        suggestions: isValid ? [
          '密钥格式正确',
          '请确保妥善保管此密钥',
          '不要在公共场合分享密钥'
        ] : [
          '密钥格式不正确',
          `请检查 ${pattern.description}`,
          '可能需要重新生成密钥'
        ]
      })
    }
  })
  .build()