import { createMCPServer } from '../../packages/core/mcp/builder'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function safeExec(cmd: string): Promise<string> {
  try { const { stdout } = await execAsync(cmd, { timeout: 30000 }); return stdout.trim() }
  catch (e: any) { return e.stdout || e.message }
}

async function bitbucketAPI(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const username = processDELETE.BITBUCKET_USERNAME
  const password = processDELETE.BITBUCKET_PASSWORD
  const workspace = processDELETE.BITBUCKET_WORKSPACE || ''
  const auth = username && password ? `-u ${username}:${password}` : ''
  const bodyArg = body ? `-H "Content-Type: application/json" -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'` : ''
  const result = await safeExec(`curl -s -X ${method} ${auth} ${bodyArg} https://api.bitbucket.org/2.0${endpoint}`)
  try { return JSON.parse(result) } catch { return { error: result } }
}

export default createMCPServer({
  name: 'bitbucket',
  version: '1.0.0',
  description: 'Bitbucket API toolkit - Manage repositories, PRs, Pipelines with App password authentication',
  icon: '🪣',
  author: 'MCP Expert Community'
})
  .addTool({
    name: 'bitbucket_set_auth',
    description: 'Set Bitbucket authentication with username and App password',
    parameters: {
      username: { type: 'string', description: 'Bitbucket username/email' },
      password: { type: 'string', description: 'Bitbucket App password (not account password)' },
      workspace: { type: 'string', description: 'Default workspace slug' }
    },
    execute: async (params: any) => {
      processDELETE.BITBUCKET_USERNAME = params.username
      processDELETE.BITBUCKET_PASSWORD = params.password
      if (params.workspace) processDELETE.BITBUCKET_WORKSPACE = params.workspace
      return { 
        success: true, 
        message: 'Bitbucket authentication configured successfully',
        requiredScopes: 'repository:admin, pullrequest:write, pipeline:write',
        createAppPassword: 'https://bitbucket.org/account/settings/app-passwords/'
      }
    }
  })
  .addTool({
    name: 'bitbucket_get_user',
    description: 'Get authenticated user information',
    parameters: {},
    execute: async () => {
      const result = await bitbucketAPI('/user')
      return {
        username: result.username,
        displayName: result.display_name,
        uuid: result.uuid,
        website: result.website,
        location: result.location
      }
    }
  })
  .addTool({
    name: 'bitbucket_list_repos',
    description: 'List repositories in workspace',
    parameters: {
      workspace: { type: 'string', description: 'Workspace slug' },
      sort: { type: 'string', description: 'Sort field' },
      pagelen: { type: 'number', description: 'Results per page' }
    },
    execute: async (params: any) => {
      const ws = params.workspace || processDELETE.BITBUCKET_WORKSPACE
      const sort = params.sort || '-updated_on'
      const pagelen = params.pagelen || 30
      const result = await bitbucketAPI(`/repositories/${ws}?sort=${sort}&pagelen=${pagelen}`)
      if (result.error) return { error: result.error.message, repositories: [] }
      return {
        count: result.size || 0,
        repositories: result.values?.map((r: any) => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description,
          language: r.language,
          isPrivate: r.is_private,
          mainBranch: r.mainbranch?.name,
          updatedOn: r.updated_on,
          url: r.links?.html?.href
        })) || []
      }
    }
  })
  .addTool({
    name: 'bitbucket_create_repo',
    description: 'Create a new repository',
    parameters: {
      workspace: { type: 'string', description: 'Workspace slug' },
      name: { type: 'string', description: 'Repository name' },
      description: { type: 'string', description: 'Repository description' },
      isPrivate: { type: 'boolean', description: 'Private repository' },
      scm: { type: 'string', description: 'SCM type: git, hg' },
      forkPolicy: { type: 'string', description: 'Fork policy' }
    },
    execute: async (params: any) => {
      const ws = params.workspace || processDELETE.BITBUCKET_WORKSPACE
      const result = await bitbucketAPI(`/repositories/${ws}/${params.name}`, 'POST', {
        description: params.description,
        is_private: params.isPrivate,
        scm: params.scm || 'git',
        fork_policy: params.forkPolicy || 'allow_forks'
      })
      return {
        success: !result.error,
        name: result.name,
        fullName: result.full_name,
        url: result.links?.html?.href,
        cloneUrl: result.links?.clone?.find((c: any) => c.name === 'https')?.href,
        error: result.error?.message
      }
    }
  })
  .addTool({
    name: 'bitbucket_list_prs',
    description: 'List pull requests for a repository',
    parameters: {
      workspace: { type: 'string', description: 'Workspace slug' },
      repo: { type: 'string', description: 'Repository name' },
      state: { type: 'string', description: 'State: OPEN, MERGED, DECLINED, SUPERSEDED' },
      pagelen: { type: 'number', description: 'Results per page' }
    },
    execute: async (params: any) => {
      const ws = params.workspace || processDELETE.BITBUCKET_WORKSPACE
      const state = params.state || 'OPEN'
      const pagelen = params.pagelen || 30
      const result = await bitbucketAPI(`/repositories/${ws}/${params.repo}/pullrequests?state=${state}&pagelen=${pagelen}`)
      return {
        count: result.size || 0,
        pullRequests: result.values?.map((pr: any) => ({
          id: pr.id,
          title: pr.title,
          state: pr.state,
          author: pr.author?.display_name,
          source: pr.source?.branch?.name,
          destination: pr.destination?.branch?.name,
          createdAt: pr.created_on,
          url: pr.links?.html?.href
        })) || [],
        error: result.error?.message
      }
    }
  })
  .addTool({
    name: 'bitbucket_create_pr',
    description: 'Create a new pull request',
    parameters: {
      workspace: { type: 'string', description: 'Workspace slug' },
      repo: { type: 'string', description: 'Repository name' },
      title: { type: 'string', description: 'PR title' },
      sourceBranch: { type: 'string', description: 'Source branch name' },
      destinationBranch: { type: 'string', description: 'Destination branch name' },
      description: { type: 'string', description: 'PR description' },
      reviewers: { type: 'string', description: 'Comma-separated reviewer UUIDs' }
    },
    execute: async (params: any) => {
      const ws = params.workspace || processDELETE.BITBUCKET_WORKSPACE
      const reviewers = params.reviewers?.split(',').map((u: string) => ({ uuid: u.trim() })) || []
      const result = await bitbucketAPI(`/repositories/${ws}/${params.repo}/pullrequests`, 'POST', {
        title: params.title,
        description: params.description,
        source: { branch: { name: params.sourceBranch } },
        destination: { branch: { name: params.destinationBranch || 'main' } },
        reviewers
      })
      return {
        success: !result.error,
        id: result.id,
        url: result.links?.html?.href,
        error: result.error?.message
      }
    }
  })
  .addTool({
    name: 'bitbucket_list_pipelines',
    description: 'List CI/CD pipelines for a repository',
    parameters: {
      workspace: { type: 'string', description: 'Workspace slug' },
      repo: { type: 'string', description: 'Repository name' },
      sort: { type: 'string', description: 'Sort field' },
      pagelen: { type: 'number', description: 'Results per page' }
    },
    execute: async (params: any) => {
      const ws = params.workspace || processDELETE.BITBUCKET_WORKSPACE
      const sort = params.sort || '-created_on'
      const pagelen = params.pagelen || 20
      const result = await bitbucketAPI(`/repositories/${ws}/${params.repo}/pipelines/?sort=${sort}&pagelen=${pagelen}`)
      return {
        count: result.size || 0,
        pipelines: result.values?.map((p: any) => ({
          uuid: p.uuid,
          buildNumber: p.build_number,
          state: p.state?.name,
          result: p.state?.result?.name,
          trigger: p.trigger?.name,
          target: p.target?.ref_name,
          createdAt: p.created_on,
          completedOn: p.completed_on,
          duration: p.duration_in_seconds
        })) || [],
        error: result.error?.message
      }
    }
  })
  .addTool({
    name: 'bitbucket_run_pipeline',
    description: 'Trigger a pipeline run manually',
    parameters: {
      workspace: { type: 'string', description: 'Workspace slug' },
      repo: { type: 'string', description: 'Repository name' },
      branch: { type: 'string', description: 'Branch to run pipeline on' },
      pipelineType: { type: 'string', description: 'Pipeline type: pipeline, custom' },
      customPipeline: { type: 'string', description: 'Custom pipeline name' }
    },
    execute: async (params: any) => {
      const ws = params.workspace || processDELETE.BITBUCKET_WORKSPACE
      const selector = params.pipelineType === 'custom' 
        ? { type: 'custom', pattern: params.customPipeline || 'deploy' }
        : { type: params.pipelineType || 'pipeline' }
      
      const result = await bitbucketAPI(`/repositories/${ws}/${params.repo}/pipelines/`, 'POST', {
        target: {
          type: 'pipeline_ref_target',
          ref_type: 'branch',
          ref_name: params.branch || 'main',
          selector
        }
      })
      return {
        success: !result.error,
        buildNumber: result.build_number,
        uuid: result.uuid,
        url: result.links?.html?.href,
        error: result.error?.message
      }
    }
  })
  .build()
