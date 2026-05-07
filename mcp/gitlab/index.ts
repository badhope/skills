import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw } from '../../packages/core/shared/utils'

async function gitlabAPI(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const token = processDELETE.GITLAB_TOKEN
  const host = processDELETE.GITLAB_HOST || 'gitlab.com'
  const headers = token ? `-H "PRIVATE-TOKEN: ${token}"` : ''
  const bodyArg = body ? `-H "Content-Type: application/json" -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'` : ''
  const result = await safeExecRaw(`curl -s -X ${method} ${headers} ${bodyArg} https://${host}/api/v4${endpoint}`)
  try { return JSON.parse(result.stdout || result.stderr) } catch { return { error: (result.stdout || result.stderr).substring(0, 1000) } }
}

export default createMCPServer({
  name: 'gitlab',
  version: '2.0.0',
  description: 'Enterprise GitLab API toolkit - Repositories, merge requests, CI/CD pipelines, issues, groups and user management',
  author: 'MCP Expert Community',
  icon: '🦊'
})
  .addTool({
    name: 'gitlab_set_token',
    description: 'Set GitLab Personal Access Token for authenticated API calls',
    parameters: {
      token: { type: 'string', description: 'GitLab Personal Access Token (api scope)', required: true },
      host: { type: 'string', description: 'GitLab host (for self-managed instances)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        token: { type: 'string', required: true },
        host: { type: 'string', required: false, default: 'gitlab.com' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      processDELETE.GITLAB_TOKEN = validation.data.token
      processDELETE.GITLAB_HOST = validation.data.host
      
      return formatSuccess({
        configured: true,
        host: validation.data.host,
        tokenUrl: `https://${validation.data.host}/-/profile/personal_access_tokens`,
        scopes: ['api', 'read_api', 'read_repository', 'write_repository']
      })
    }
  })
  .addTool({
    name: 'gitlab_get_projects',
    description: 'List projects accessible to authenticated user',
    parameters: {
      search: { type: 'string', description: 'Search by project name', required: false },
      membership: { type: 'boolean', description: 'Only projects user is member of', required: false },
      perPage: { type: 'number', description: 'Results per page', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        search: { type: 'string', required: false, default: '' },
        membership: { type: 'boolean', required: false, default: true },
        perPage: { type: 'number', required: false, default: 20 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const query = new URLSearchParams({
        per_page: String(validation.data.perPage),
        membership: String(validation.data.membership),
        order_by: 'last_activity_at'
      } as any)
      if (validation.data.search) query.set('search', validation.data.search)

      const result = await gitlabAPI(`/projects?${query.toString()}`)
      
      return result.error ? formatError('Failed', result.error) : formatSuccess({
        projects: (Array.isArray(result) ? result : []).map((p: any) => ({
          id: p.id,
          name: p.name_with_namespace,
          path: p.path_with_namespace,
          defaultBranch: p.default_branch,
          lastActivity: p.last_activity_at
        })),
        count: Array.isArray(result) ? result.length : 0
      })
    }
  })
  .addTool({
    name: 'gitlab_create_mr',
    description: 'Create a new merge request',
    parameters: {
      projectId: { type: 'number', description: 'Project ID', required: true },
      sourceBranch: { type: 'string', description: 'Source branch name', required: true },
      targetBranch: { type: 'string', description: 'Target branch (main, master)', required: false },
      title: { type: 'string', description: 'MR title', required: true },
      description: { type: 'string', description: 'MR description', required: false },
      removeSourceBranch: { type: 'boolean', description: 'Delete source after merge', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        projectId: { type: 'number', required: true },
        sourceBranch: { type: 'string', required: true },
        targetBranch: { type: 'string', required: false, default: 'main' },
        title: { type: 'string', required: true },
        description: { type: 'string', required: false, default: '' },
        removeSourceBranch: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const body = {
        source_branch: validation.data.sourceBranch,
        target_branch: validation.data.targetBranch,
        title: validation.data.title,
        description: validation.data.description,
        remove_source_branch: validation.data.removeSourceBranch
      }
      const result = await gitlabAPI(`/projects/${validation.data.projectId}/merge_requests`, 'POST', body)
      
      return result.error || result.message ? formatError('Create failed', result.error || result.message) : formatSuccess({
        created: true,
        mrId: result.iid,
        webUrl: result.web_url,
        project: result.project_id
      })
    }
  })
  .addTool({
    name: 'gitlab_get_pipelines',
    description: 'Get CI/CD pipelines for project',
    parameters: {
      projectId: { type: 'number', description: 'Project ID', required: true },
      status: { type: 'string', description: 'running, pending, success, failed, canceled', required: false },
      ref: { type: 'string', description: 'Branch or tag name', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        projectId: { type: 'number', required: true },
        status: { type: 'string', required: false },
        ref: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const query = new URLSearchParams()
      if (validation.data.status) query.set('status', validation.data.status)
      if (validation.data.ref) query.set('ref', validation.data.ref)

      const result = await gitlabAPI(`/projects/${validation.data.projectId}/pipelines?${query.toString()}`)
      
      return result.error ? formatError('Failed', result.error) : formatSuccess({
        pipelines: (Array.isArray(result) ? result : []).map((p: any) => ({
          id: p.id,
          ref: p.ref,
          status: p.status,
          source: p.source,
          createdAt: p.created_at,
          duration: `${Math.round((p.duration || 0) / 60)}m ${(p.duration || 0) % 60}s`
        }))
      })
    }
  })
  .addTool({
    name: 'gitlab_create_issue',
    description: 'Create a new issue in project',
    parameters: {
      projectId: { type: 'number', description: 'Project ID', required: true },
      title: { type: 'string', description: 'Issue title', required: true },
      description: { type: 'string', description: 'Issue description', required: false },
      labels: { type: 'string', description: 'Comma-separated labels', required: false },
      assigneeId: { type: 'number', description: 'Assignee user ID', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        projectId: { type: 'number', required: true },
        title: { type: 'string', required: true },
        description: { type: 'string', required: false, default: '' },
        labels: { type: 'string', required: false, default: '' },
        assigneeId: { type: 'number', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const body: any = {
        title: validation.data.title,
        description: validation.data.description
      }
      if (validation.data.labels) body.labels = validation.data.labels
      if (validation.data.assigneeId) body.assignee_id = validation.data.assigneeId

      const result = await gitlabAPI(`/projects/${validation.data.projectId}/issues`, 'POST', body)
      
      return result.error || result.message ? formatError('Create failed', result.error || result.message) : formatSuccess({
        created: true,
        issueId: result.iid,
        webUrl: result.web_url,
        state: result.state
      })
    }
  })
  .addTool({
    name: 'gitlab_get_groups',
    description: 'List groups and subgroups',
    parameters: {
      search: { type: 'string', description: 'Search group name', required: false },
      topLevelOnly: { type: 'boolean', description: 'Only top-level groups', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        search: { type: 'string', required: false, default: '' },
        topLevelOnly: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const query = new URLSearchParams({ per_page: '20' } as any)
      if (validation.data.search) query.set('search', validation.data.search)
      if (validation.data.topLevelOnly) query.set('top_level_only', 'true')

      const result = await gitlabAPI(`/groups?${query.toString()}`)
      
      return result.error ? formatError('Failed', result.error) : formatSuccess({
        groups: (Array.isArray(result) ? result : []).map((g: any) => ({
          id: g.id,
          name: g.name,
          path: g.full_path,
          description: g.description,
          projects: g.projects_count || 0
        }))
      })
    }
  })
  .build()