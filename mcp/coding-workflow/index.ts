import { createMCPServer } from '../../packages/core/mcp/builder'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function safeExec(cmd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 15000 })
    return stdout.trim()
  } catch (e: any) {
    return e.stdout?.trim() || e.message
  }
}

export default createMCPServer({
  name: 'coding-workflow',
  version: '1.0.0',
  description: 'Standard development workflow - feature branch, TDD cycle, code review, release',
  icon: '🚀'
})
  .addTool({
    name: 'create_feature_branch',
    description: 'Create feature branch from latest base branch',
    parameters: {
      name: { type: 'string', description: 'Branch name: feature/login-page', required: true },
      base: { type: 'string', description: 'Base branch, defaults to main', required: false }
    },
    execute: async (params: Record<string, any>) => ({
      checkout: await safeExec(`git checkout ${params.base || 'main'}`),
      pull: await safeExec('git pull'),
      branch: await safeExec(`git checkout -b ${params.name}`)
    })
  })
  .addTool({
    name: 'tdd_cycle',
    description: 'Start TDD development cycle',
    parameters: {
      feature: { type: 'string', description: 'Feature description', required: true }
    },
    execute: async (params: Record<string, any>) => ({ feature: params.feature })
  })
  .addTool({
    name: 'prepare_pr',
    description: 'Prepare Pull Request submission',
    parameters: {},
    execute: async () => ({
      diff: await safeExec('git diff main --stat'),
      commits: await safeExec('git log main..HEAD --oneline'),
      branch: await safeExec('git branch --show-current')
    })
  })
  .addPrompt({
    name: 'start-feature',
    description: 'Start standardized feature development workflow',
    arguments: [
      { name: 'name', description: 'Feature name', required: true },
      { name: 'description', description: 'Detailed feature description', required: true }
    ],
    generate: async (args?: Record<string, any>) => `
## 🚀 Feature Development Workflow

### Feature: ${args?.name}
### Description: ${args?.description}

---

### Phase 1: Setup
1. Create feature branch: \`feature/${args?.name}\`
2. Sync with latest main

### Phase 2: TDD Cycle
3. Write failing test first
4. Implement minimal code to pass
5. Refactor for clean architecture
6. Repeat until feature complete

### Phase 3: Quality
7. All tests passing with good coverage
8. Code review self-check
9. Final cleanup and documentation

### Phase 4: PR Ready
10. Prepare PR with clear description
11. Link to related issues
12. Request review
    `.trim()
  })
  .build()
