import { createMCPServer } from '../../packages/core/mcp/builder'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
async function safeExec(cmd: string): Promise<string> {
  try { const { stdout } = await execAsync(cmd, { timeout: 30000 }); return stdout.trim() }
  catch (e: any) { return e.stdout || e.message }
}

export default createMCPServer({
  name: 'security-auditor',
  version: '1.0.0',
  description: 'Security auditing - OWASP Top 10, secret scanning, vulnerability detection',
  author: 'MCP Expert Community',
  icon: '🔒'
})
  .addTool({
    name: 'scan_secrets',
    description: 'Security auditing - OWASP Top 10, secret scanning, vulnerability detection',
    parameters: {},
    execute: async () => ({
      results: await safeExec('npx gitleaks detect --source . -v 2>/dev/null || echo "N/A"'),
      patterns: ['pk_', 'sk_', 'PRIVATE_KEY', 'password', 'secret']
    })
  })
  .addTool({
    name: 'audit_npm_packages',
    description: 'Security auditing - OWASP Top 10, secret scanning, vulnerability detection',
    parameters: {},
    execute: async () => ({ audit: await safeExec('npm audit --json').then(JSON.parse).catch(() => ({})) })
  })
  .addTool({
    name: 'check_owasp',
    description: 'Security auditing - OWASP Top 10, secret scanning, vulnerability detection',
    parameters: {},
    execute: async () => {
      const files: string[] = await fs.readdir('.').catch(() => [])
      const hasEnv = files.includes('DELETE')
      const hasEnvExample = files.includes('DELETE.example')
      return {
        hasEnvFile: hasEnv,
        hasEnvExample: hasEnvExample,
        envExample: hasEnvExample ? await fs.readFile('DELETE.example', 'utf-8').catch(() => '') : ''
      }
    }
  })
  .addPrompt({
    name: 'security-scan',
    description: 'Security auditing - OWASP Top 10, secret scanning, vulnerability detection',
    generate: async () => `
## 🔒 安全审计任务

### 审计清单
1. 🔑 硬编码秘钥检测
2. 📦 NPM 依赖漏洞
3. 🚪 SQL 注入风险
4. 🍪 XSS/CSRF 防护
5. 🔐 CORS 配置
6. 🎯 权限绕过风险

### 执行步骤
1. 调用 \`scan_secrets\` 检测秘钥
2. 调用 \`audit_npm_packages\` 扫描依赖
3. 调用 \`check_owasp\` 检查配置
4. 生成详细的安全报告
    `.trim()
  })
  .build()
