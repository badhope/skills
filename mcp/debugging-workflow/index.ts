import { createMCPServer } from '../../packages/core/mcp/builder'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
async function safeExec(cmd: string): Promise<string> {
  try { const { stdout } = await execAsync(cmd, { timeout: 15000 }); return stdout.trim() }
  catch (e: any) { return e.stdout || e.message }
}

export default createMCPServer({
  name: 'debugging-workflow',
  version: '1.0.0',
  description: 'Standardized debugging workflow - system diagnostics, root cause analysis, reproduction verification',
  author: 'MCP Expert Community',
  icon: '🔧'
})
  .addTool({
    name: 'collect_system_info',
    description: 'Standardized debugging workflow - system diagnostics, root cause analysis, reproduction verification',
    parameters: {},
    execute: async () => ({
      os: await safeExec('node -e "console.log(process.platform, process.arch)"'),
      node: await safeExec('node --version'),
      npm: await safeExec('npm --version'),
      git: await safeExec('git --version'),
      env: Object.keys(processDELETE).filter(k => k.includes('NODE') || k.includes('PATH')).slice(0, 10)
    })
  })
  .addTool({
    name: 'check_logs_and_errors',
    description: 'Standardized debugging workflow - system diagnostics, root cause analysis, reproduction verification',
    parameters: {},
    execute: async () => ({
      gitChanges: await safeExec('git diff HEAD~1 --name-only'),
      lastCommit: await safeExec('git log -1 --oneline')
    })
  })
  .addTool({
    name: 'verify_fix',
    description: 'Standardized debugging workflow - system diagnostics, root cause analysis, reproduction verification',
    parameters: {
      testCommand: { type: 'string', description: 'Standardized debugging workflow - system diagnostics, root cause analysis, reproduction verification', required: false }
    },
    execute: async (params: Record<string, any>) => ({
      build: await safeExec(params.testCommand || 'npm run build 2>&1 || echo "skip"'),
      tests: await safeExec('npm test 2>&1 | tail -20 || echo "skip"')
    })
  })
  .addPrompt({
    name: 'debug-error',
    description: 'Standardized debugging workflow - system diagnostics, root cause analysis, reproduction verification',
    arguments: [
      { name: 'error', description: 'Standardized debugging workflow - system diagnostics, root cause analysis, reproduction verification', required: true }
    ],
    generate: async (args?: Record<string, any>) => `
## 🔧 调试工作流: ${args?.error}

### 📋 标准调试步骤

#### 阶段 1 - 信息收集
1. 调用 \`collect_system_info\` 环境检查
2. 调用 \`check_logs_and_errors\` 日志分析
3. 确认: 最近什么变更导致了问题？

#### 阶段 2 - 根因分析
4. 使用二分法定位问题 Commit
5. 列出可能原因 2-3 个
6. 逐一验证排除

#### 阶段 3 - 修复验证
7. 给出最小修复方案
8. 调用 \`verify_fix\` 验证修复
9. 总结: 根因 + 预防措施

### ⚠️ 调试原则
- 首先复现问题
- 一次只改变一个变量
- 验证每个假设
- 写下过程避免重复
    `.trim()
  })
  .build()
