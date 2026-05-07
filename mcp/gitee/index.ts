import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw } from '../../packages/core/shared/utils'

async function giteeAPI(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const token = processDELETE.GITEE_TOKEN
  const headers = token ? `-H "Authorization: token ${token}"` : ''
  const bodyArg = body ? `-H "Content-Type: application/json" -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'` : ''
  const result = await safeExecRaw(`curl -s -X ${method} ${headers} ${bodyArg} https://gitee.com/api/v5${endpoint}`)
  try { return JSON.parse(result.stdout || result.stderr) } catch { return { error: (result.stdout || result.stderr).substring(0, 1000) } }
}

export default createMCPServer({
  name: 'gitee',
  version: '2.0.0',
  description: 'Enterprise Gitee(码云) API toolkit - Chinese Git hosting platform repository, PR, issues and user management',
  author: 'MCP Expert Community',
  icon: '🐎'
})
  .addTool({
    name: 'gitee_set_token',
    description: 'Set Gitee Personal Access Token for authenticated API calls',
    parameters: {
      token: { type: 'string', description: 'Gitee Personal Access Token', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        token: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      processDELETE.GITEE_TOKEN = validation.data.token
      
      return formatSuccess({
        configured: true,
        tokenUrl: 'https://gitee.com/profile/personal_access_tokens',
        scopes: ['projects', 'user_info', 'repo', 'pull_requests', 'issues', 'notes'],
        apiDocs: 'https://gitee.com/api/v5/swagger'
      })
    }
  })
  .addTool({
    name: 'gitee_get_user_repos',
    description: 'List all repositories for authenticated user',
    parameters: {
      type: { type: 'string', description: 'owner, public, private, member', required: false },
      sort: { type: 'string', description: 'created, updated, pushed, full_name', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: false, default: 'owner' },
        sort: { type: 'string', required: false, default: 'updated' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const result = await giteeAPI(`/user/repos?type=${validation.data.type}&sort=${validation.data.sort}&per_page=20`)
      
      return result.message ? formatError('API Error', result.message) : formatSuccess({
        repositories: (Array.isArray(result) ? result : []).map((r: any) => ({
          id: r.id,
          fullName: r.full_name,
          description: r.description,
          stars: r.stargazers_count,
          forks: r.forks_count,
          language: r.language,
          updated: r.updated_at
        })),
        total: Array.isArray(result) ? result.length : 0
      })
    }
  })
  .addTool({
    name: 'gitee_create_repo',
    description: 'Create a new repository on Gitee',
    parameters: {
      name: { type: 'string', description: 'Repository name', required: true },
      description: { type: 'string', description: 'Repository description', required: false },
      private: { type: 'boolean', description: 'Make repository private', required: false },
      hasIssues: { type: 'boolean', description: 'Enable issues', required: false },
      hasWiki: { type: 'boolean', description: 'Enable wiki', required: false },
      license: { type: 'string', description: 'License template: MIT, Apache-2.0, GPL-3.0', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        description: { type: 'string', required: false, default: '' },
        private: { type: 'boolean', required: false, default: false },
        hasIssues: { type: 'boolean', required: false, default: true },
        hasWiki: { type: 'boolean', required: false, default: true },
        license: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const body: any = {
        name: validation.data.name,
        description: validation.data.description,
        private: validation.data.private,
        has_issues: validation.data.hasIssues,
        has_wiki: validation.data.hasWiki
      }
      if (validation.data.license) body.license = validation.data.license

      const result = await giteeAPI('/user/repos', 'POST', body)
      
      return result.message ? formatError('Create failed', result.message) : formatSuccess({
        created: true,
        fullName: result.full_name,
        htmlUrl: result.html_url,
        cloneUrl: result.clone_url,
        tips: 'Chinese developer community support, Gitee Pages, and Actions CI/CD available'
      })
    }
  })
  .addTool({
    name: 'gitee_create_pr',
    description: 'Create a new pull request',
    parameters: {
      owner: { type: 'string', description: 'Repository owner (username or org)', required: true },
      repo: { type: 'string', description: 'Repository name', required: true },
      title: { type: 'string', description: 'PR title', required: true },
      head: { type: 'string', description: 'Source branch', required: true },
      base: { type: 'string', description: 'Target branch', required: false },
      body: { type: 'string', description: 'PR description', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        title: { type: 'string', required: true },
        head: { type: 'string', required: true },
        base: { type: 'string', required: false, default: 'master' },
        body: { type: 'string', required: false, default: '' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const body = {
        title: validation.data.title,
        head: validation.data.head,
        base: validation.data.base,
        body: validation.data.body
      }
      const result = await giteeAPI(`/repos/${validation.data.owner}/${validation.data.repo}/pulls`, 'POST', body)
      
      return result.message ? formatError('Create failed', result.message) : formatSuccess({
        created: true,
        number: result.number,
        htmlUrl: result.html_url,
        state: result.state
      })
    }
  })
  .addTool({
    name: 'gitee_get_issues',
    description: 'List issues for a repository',
    parameters: {
      owner: { type: 'string', description: 'Repository owner', required: true },
      repo: { type: 'string', description: 'Repository name', required: true },
      state: { type: 'string', description: 'open, closed, all', required: false },
      labels: { type: 'string', description: 'Comma-separated label list', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        state: { type: 'string', required: false, default: 'open' },
        labels: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const query = new URLSearchParams({ state: validation.data.state } as any)
      if (validation.data.labels) query.set('labels', validation.data.labels)

      const result = await giteeAPI(`/repos/${validation.data.owner}/${validation.data.repo}/issues?${query.toString()}`)
      
      return result.message ? formatError('Failed', result.message) : formatSuccess({
        issues: (Array.isArray(result) ? result : []).map((i: any) => ({
          id: i.id,
          number: i.number,
          title: i.title,
          state: i.state,
          author: i.user?.login,
          createdAt: i.created_at,
          comments: i.comments
        }))
      })
    }
  })
  .addTool({
    name: 'gitee_deploy_pages',
    description: 'Deploy Gitee Pages static site',
    parameters: {
      owner: { type: 'string', description: 'Repository owner', required: true },
      repo: { type: 'string', description: 'Repository name', required: true },
      branch: { type: 'string', description: 'Source branch', required: false },
      directory: { type: 'string', description: 'Build directory (e.g., dist, build)', required: false },
      https: { type: 'boolean', description: 'Force HTTPS', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        owner: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        branch: { type: 'string', required: false, default: 'gh-pages' },
        directory: { type: 'string', required: false, default: '/' },
        https: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const body = {
        branch: validation.data.branch,
        directory: validation.data.directory,
        https: validation.data.https
      }
      const result = await giteeAPI(`/repos/${validation.data.owner}/${validation.data.repo}/pages`, 'POST', body)
      
      return result.message ? formatError('Pages deploy failed', result.message) : formatSuccess({
        deployed: true,
        pagesUrl: result.html_url,
        branch: validation.data.branch,
        tips: 'Gitee offers free CDN for Chinese mainland users'
      })
    }
  })
  .build()