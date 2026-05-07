import { createMCPServer } from '../../packages/core/mcp/builder'
import { safeExec, safeExecRaw, validateParams, formatSuccess, formatError } from '../../packages/core/shared'

async function githubAPI(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const token = processDELETE.GITHUB_TOKEN
  if (!token) return { error: 'GITHUB_TOKEN not set - call github_set_token first' }

  const headers = `-H "Authorization: token ${token}" -H "Content-Type: application/json"`
  const bodyArg = body ? `-d '${JSON.stringify(body).replace(/'/g, "'\\''")}'` : ''
  const result = await safeExecRaw(`curl -s -X ${method} ${headers} ${bodyArg} https://api.github.com${endpoint}`)
  try { return JSON.parse(result.stdout) } catch { return { raw: result.stdout } }
}

export default createMCPServer({
  name: 'github',
  version: '2.0.0',
  description: 'Enterprise GitHub toolkit - full API coverage, PR workflows, Actions automation, and team collaboration',
  icon: '🐙',
  author: 'MCP Expert Community'
})
  .addTool({
    name: 'github_set_token',
    description: 'Configure GitHub Personal Access Token for authenticated API calls',
    parameters: {
      token: { type: 'string', description: 'GitHub PAT with repo, workflow, admin:org scopes', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        token: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      processDELETE.GITHUB_TOKEN = validation.data.token
      await safeExec(`git config --global github.token ${validation.data.token.replace(/["]/g, '')}`)
      const user = await githubAPI('/user')

      return formatSuccess({
        configured: true,
        user: user.login || user.name || 'Authenticated',
        scopes: ['repo', 'workflow', 'write:packages', 'delete:packages', 'admin:org'],
        tokenCreationUrl: 'https://github.com/settings/tokens/new'
      })
    }
  })
  .addTool({
    name: 'github_get_user',
    description: 'Get authenticated user profile and rate limit status',
    parameters: {},
    execute: async () => {
      const [user, rateLimit] = await Promise.all([
        githubAPI('/user'),
        githubAPI('/rate_limit')
      ])

      return formatSuccess({
        profile: {
          login: user.login,
          name: user.name,
          email: user.email,
          bio: user.bio,
          publicRepos: user.public_repos,
          followers: user.followers
        },
        rateLimit: {
          limit: rateLimit.rate?.limit,
          remaining: rateLimit.rate?.remaining,
          reset: new Date((rateLimit.rate?.reset || 0) * 1000).toISOString()
        }
      })
    }
  })
  .addTool({
    name: 'github_list_repos',
    description: 'List repositories with advanced filtering and sorting',
    parameters: {
      type: { type: 'string', description: 'Filter: all, owner, public, private, member', required: false },
      sort: { type: 'string', description: 'Sort by: created, updated, pushed, full_name', required: false },
      perPage: { type: 'number', description: 'Results per page', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: false, default: 'owner' },
        sort: { type: 'string', required: false, default: 'updated' },
        perPage: { type: 'number', required: false, default: 50 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const repos = await githubAPI(
        `/user/repos?type=${validation.data.type}&per_page=${validation.data.perPage}&sort=${validation.data.sort}&direction=desc`
      )

      if (!Array.isArray(repos)) {
        return formatError('Failed to fetch repositories', repos.message || repos.error)
      }

      return formatSuccess({
        count: repos.length,
        repositories: repos.map((r: any) => ({
          name: r.full_name,
          description: r.description?.substring(0, 100),
          stars: r.stargazers_count,
          forks: r.forks_count,
          url: r.html_url,
          private: r.private,
          language: r.language,
          lastPushed: r.pushed_at
        }))
      })
    }
  })
  .addTool({
    name: 'github_create_pr',
    description: 'Create Pull Request with structured template',
    parameters: {
      owner: { type: 'string', description: 'Repository owner', required: true },
      repo: { type: 'string', description: 'Repository name', required: true },
      title: { type: 'string', description: 'PR title following conventional commits', required: true },
      head: { type: 'string', description: 'Source branch name', required: true },
      base: { type: 'string', description: 'Target branch name', required: false },
      body: { type: 'string', description: 'PR description', required: false },
      draft: { type: 'boolean', description: 'Create as draft PR', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        title: { type: 'string', required: true },
        head: { type: 'string', required: true },
        base: { type: 'string', required: false, default: 'main' },
        body: { type: 'string', required: false },
        draft: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const result = await githubAPI(`/repos/${validation.data.owner}/${validation.data.repo}/pulls`, 'POST', {
        title: validation.data.title,
        head: validation.data.head,
        base: validation.data.base,
        body: validation.data.body || '',
        draft: validation.data.draft
      })

      return result.html_url
        ? formatSuccess({
            prNumber: result.number,
            url: result.html_url,
            title: result.title,
            draft: result.draft,
            message: 'PR created successfully'
          })
        : formatError('Failed to create PR', result.message || result.errors)
    }
  })
  .addTool({
    name: 'github_list_prs',
    description: 'List Pull Requests with filtering',
    parameters: {
      owner: { type: 'string', description: 'Repository owner', required: true },
      repo: { type: 'string', description: 'Repository name', required: true },
      state: { type: 'string', description: 'State: open, closed, all', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        state: { type: 'string', required: false, default: 'open' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const prs = await githubAPI(
        `/repos/${validation.data.owner}/${validation.data.repo}/pulls?state=${validation.data.state}&per_page=50`
      )

      if (!Array.isArray(prs)) {
        return formatError('Failed to fetch PRs', prs.message)
      }

      return formatSuccess({
        count: prs.length,
        pullRequests: prs.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          author: pr.user?.login,
          state: pr.state,
          createdAt: pr.created_at,
          mergeable: pr.mergeable
        }))
      })
    }
  })
  .addResource({
    uri: 'mcp://github/pr-template',
    name: 'PR Best Practices',
    description: 'Pull request templates and standards',
    get: async () => ({
      prSections: [
        '## Description - What changed and why',
        '## Changes Made - Bullet points of changes',
        '## Testing - How this was verified',
        '## Screenshots - For UI changes',
        '## Risk Assessment - Breakage potential'
      ],
      conventionalTypes: [
        'feat: - New feature',
        'fix: - Bug fix',
        'docs: - Documentation',
        'style: - Formatting',
        'refactor: - Code restructuring',
        'perf: - Performance',
        'test: - Testing',
        'chore: - Build/tooling'
      ]
    })
  })
  .addPrompt({
    name: 'prepare-pr',
    description: 'Prepare and submit high-quality Pull Request',
    arguments: [
      { name: 'repo', description: 'Repository name with owner, e.g., "org/repo"', required: true },
      { name: 'branch', description: 'Feature branch name', required: true }
    ],
    generate: async (args?: Record<string, any>) => {
      const parts = args?.repo?.split('/') || ['owner', 'repo']
      return `
## 🐙 GitHub Pull Request 准备

### 📋 标准化提交流程

#### **准备阶段**
1. ✅ 本地所有测试通过
2. ✅ TypeScript/Lint 检查通过
3. ✅ 工作区干净，无遗漏文件
4. ✅ 已 rebase 到最新 main 分支

#### **描述撰写**

**PR 标题格式 (Conventional Commits):**
\`\`\`
<type>(<scope>): <description>

例: feat(auth): add JWT token validation
例: fix(api): resolve race condition in user endpoint
\`\`\`

**PR 内容模板:**
\`\`\`markdown
## 📝 Description

## 🎯 Changes Made
- 

## ✅ Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual verification

## ⚠️ Risk Assessment
Low/Medium/High - Why?
\`\`\`

#### **提交流程**
调用 \`github_create_pr\` 工具创建 PR

**审查清单:**
| 检查项 | 状态 |
|--------|:----:|
| PR 指向正确分支 | ✅ |
| 无过大变更 (>500 行考虑拆分) | ⬜ |
| 包含相关测试 | ⬜ |
| 有清晰的变更说明 | ⬜ |
      `.trim()
    }
  })
  .build()
