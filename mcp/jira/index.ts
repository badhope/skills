import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw } from '../../packages/core/shared/utils'

async function jiraAPI(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const email = processDELETE.JIRA_EMAIL
  const token = processDELETE.JIRA_API_TOKEN
  const domain = processDELETE.JIRA_DOMAIN
  if (!domain) return { error: 'Jira domain not configured, use jira_set_auth first' }
  
  const auth = email && token ? `-u "${email}:${token}"` : ''
  const bodyArg = body ? `-H "Content-Type: application/json" -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'` : ''
  const result = await safeExecRaw(`curl -s -X ${method} ${auth} ${bodyArg} https://${domain}.atlassian.net/rest/api/3${endpoint}`)
  try { return JSON.parse(result.stdout || result.stderr) } catch { return { error: (result.stdout || result.stderr).substring(0, 1000) } }
}

export default createMCPServer({
  name: 'jira',
  version: '2.0.0',
  description: 'Enterprise Jira API toolkit - Projects, issues, sprints, workflows, search and agile board management',
  author: 'MCP Expert Community',
  icon: '📋'
})
  .addTool({
    name: 'jira_set_auth',
    description: 'Configure Jira authentication with domain, email, and API token',
    parameters: {
      domain: { type: 'string', description: 'Jira cloud domain (e.g., yourcompany)', required: true },
      email: { type: 'string', description: 'Atlassian account email', required: true },
      token: { type: 'string', description: 'Jira API token', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        domain: { type: 'string', required: true },
        email: { type: 'string', required: true },
        token: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      processDELETE.JIRA_DOMAIN = validation.data.domain
      processDELETE.JIRA_EMAIL = validation.data.email
      processDELETE.JIRA_API_TOKEN = validation.data.token
      
      return formatSuccess({
        configured: true,
        baseUrl: `https://${validation.data.domain}.atlassian.net`,
        tokenUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
        scopes: ['read:jira-user', 'read:jira-work', 'write:jira-work']
      })
    }
  })
  .addTool({
    name: 'jira_search',
    description: 'Advanced JQL search for issues with pagination',
    parameters: {
      jql: { type: 'string', description: 'JQL query string', required: true },
      maxResults: { type: 'number', description: 'Max results', required: false },
      fields: { type: 'string', description: 'Fields to return: summary,status,assignee', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        jql: { type: 'string', required: true },
        maxResults: { type: 'number', required: false, default: 20 },
        fields: { type: 'string', required: false, default: 'summary,status,assignee,created,updated' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const body = {
        jql: validation.data.jql,
        maxResults: validation.data.maxResults,
        fields: validation.data.fields.split(',')
      }
      const result = await jiraAPI('/search', 'POST', body)
      
      return result.error ? formatError('Search failed', result.error) : formatSuccess({
        total: result.total,
        issues: (result.issues || []).map((i: any) => ({
          key: i.key,
          summary: i.fields?.summary,
          status: i.fields?.status?.name,
          assignee: i.fields?.assignee?.displayName || 'Unassigned'
        }))
      })
    }
  })
  .addTool({
    name: 'jira_create_issue',
    description: 'Create a new Jira issue with fields',
    parameters: {
      projectKey: { type: 'string', description: 'Project key (e.g., PROJ)', required: true },
      summary: { type: 'string', description: 'Issue summary', required: true },
      description: { type: 'string', description: 'Issue description', required: false },
      issueType: { type: 'string', description: 'Bug, Task, Story, Epic', required: false },
      priority: { type: 'string', description: 'High, Medium, Low', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        projectKey: { type: 'string', required: true },
        summary: { type: 'string', required: true },
        description: { type: 'string', required: false, default: '' },
        issueType: { type: 'string', required: false, default: 'Task' },
        priority: { type: 'string', required: false, default: 'Medium' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const body = {
        fields: {
          project: { key: validation.data.projectKey },
          summary: validation.data.summary,
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: validation.data.description }] }] },
          issuetype: { name: validation.data.issueType },
          priority: { name: validation.data.priority }
        }
      }
      const result = await jiraAPI('/issue', 'POST', body)
      
      return result.error ? formatError('Create failed', result.error) : formatSuccess({
        created: true,
        issueKey: result.key,
        issueId: result.id,
        browseUrl: `https://${processDELETE.JIRA_DOMAIN}.atlassian.net/browse/${result.key}`
      })
    }
  })
  .addTool({
    name: 'jira_get_sprints',
    description: 'Get active and future sprints for agile board',
    parameters: {
      boardId: { type: 'number', description: 'Board ID', required: true },
      state: { type: 'string', description: 'active,future,closed', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        boardId: { type: 'number', required: true },
        state: { type: 'string', required: false, default: 'active' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const result = await jiraAPI(`/board/${validation.data.boardId}/sprint?state=${validation.data.state}`)
      
      return result.error ? formatError('Failed', result.error) : formatSuccess({
        sprints: result.values || [],
        velocityTip: 'Calculate velocity = completedStoryPoints / numberOfSprints'
      })
    }
  })
  .addTool({
    name: 'jira_get_projects',
    description: 'List all accessible Jira projects',
    parameters: {},
    execute: async () => {
      const result = await jiraAPI('/project/search')
      
      return result.error ? formatError('Failed', result.error) : formatSuccess({
        projects: (result.values || []).map((p: any) => ({
          id: p.id,
          key: p.key,
          name: p.name,
          type: p.projectTypeKey
        })),
        total: result.total
      })
    }
  })
  .addTool({
    name: 'jira_transition',
    description: 'Transition issue through workflow',
    parameters: {
      issueKey: { type: 'string', description: 'Issue key (e.g., PROJ-123)', required: true },
      transitionName: { type: 'string', description: 'To Do, In Progress, Done', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        issueKey: { type: 'string', required: true },
        transitionName: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const transitions = await jiraAPI(`/issue/${validation.data.issueKey}/transitions`)
      const transition = (transitions.transitions || []).find((t: any) => 
        t.name.toLowerCase() === validation.data.transitionName.toLowerCase()
      )
      
      if (!transition) return formatError('Transition not found', { available: (transitions.transitions || []).map((t: any) => t.name) })
      
      const result = await jiraAPI(`/issue/${validation.data.issueKey}/transitions`, 'POST', {
        transition: { id: transition.id }
      })
      
      return result.errors ? formatError('Transition failed', result.errors) : formatSuccess({
        transitioned: true,
        issueKey: validation.data.issueKey,
        transition: validation.data.transitionName
      })
    }
  })
  .build()