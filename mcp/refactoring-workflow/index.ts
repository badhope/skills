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
  name: 'refactoring-workflow',
  version: '1.0.0',
  description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation',
  author: 'MCP Expert Community',
  icon: '♻️'
})
  .addTool({
    name: 'before_refactor_check',
    description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation',
    parameters: {
      targetFiles: { type: 'string', description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation', required: true }
    },
    execute: async (params: Record<string, any>) => ({
      tests: await safeExec('npm test 2>&1 | tail -5'),
      status: await safeExec('git status --porcelain'),
      files: params.targetFiles.split(','),
      branch: await safeExec('git branch --show-current')
    })
  })
  .addTool({
    name: 'create_safety_commit',
    description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation',
    parameters: {},
    execute: async () => ({
      stash: await safeExec('git stash || echo "no stash"'),
      commit: await safeExec('git commit -a -m "refactor: safety point BEFORE refactoring" --allow-empty')
    })
  })
  .addTool({
    name: 'verify_after_refactor',
    description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation',
    parameters: {},
    execute: async () => ({
      testsPassed: await safeExec('npm test 2>&1 | tail -10'),
      diff: await safeExec('git diff --stat'),
      noNewErrors: await safeExec('npx tsc --noEmit 2>&1 | tail -5 || echo "ok"')
    })
  })
  .addPrompt({
    name: 'safe-refactor',
    description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation',
    arguments: [
      { name: 'files', description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation', required: true },
      { name: 'goal', description: 'Standardized refactoring workflow - safety checks, incremental improvement, validation', required: true }
    ],
    generate: async (args?: Record<string, any>) => `
## ♻️ 安全重构工作流

### 🎯 目标: ${args?.goal}
### 📁 文件: ${args?.files}

---

### ✅ 重构前检查清单
1. 🔘 调用 \`before_refactor_check\`
   - 所有测试通过
   - Git 工作区干净
   - 在特性分支上工作

2. 🔘 测试覆盖率 >= 80%
   - 如果没有，先补测试

3. 🔘 调用 \`create_safety_commit\` 创建回退点

---

### 🔄 重构循环（小步提交）

**每次只做一件事！**

| 步骤 | 动作 | 验证 |
|------|------|------|
| 1 | 重命名变量/函数 | 运行测试 |
| 2 | 提取函数 | 运行测试 |
| 3 | 提取类 | 运行测试 |
| 4 | 移动文件 | 运行测试 |

---

### ✅ 重构后验证
调用 \`verify_after_refactor\`
- 🔘 所有测试通过
- 🔘 TypeScript 无错误
- 🔘 Git diff 符合预期

---

### 💡 重构戒律
- 重构期间不添加新功能
- 每次修改不超过 50 行
- 每 15 分钟运行一次测试
    `.trim()
  })
  .build()
