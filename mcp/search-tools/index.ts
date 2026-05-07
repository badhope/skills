import { createMCPServer } from '../../packages/core/mcp/builder'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as https from 'https'
import * as http from 'http'

const execAsync = promisify(exec)

async function safeExec(cmd: string, timeout: number = 30000): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout })
    return stdout.trim() || stderr.trim()
  } catch (e: any) {
    return e.stdout?.trim() || e.stderr?.trim() || e.message
  }
}

async function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

async function searchGitHub(query: string, token?: string): Promise<any> {
  const headers: any = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Universal-MCP-Search/1.0'
  }
  if (token) headers['Authorization'] = `token ${token}`

  const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=10`
  const data = await httpsGet(url)
  try {
    return JSON.parse(data)
  } catch {
    return { error: data }
  }
}

async function searchStackOverflow(query: string): Promise<any> {
  const url = `https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&filter=!nNPvSNeT5`
  const data = await httpsGet(url)
  try {
    return JSON.parse(data)
  } catch {
    return { error: data }
  }
}

async function searchArxiv(query: string): Promise<any> {
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=10&sortBy=relevance`
  const data = await httpsGet(url)
  const items: any[] = []
  const regex = /<entry>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<summary>([\s\S]*?)<\/summary>[\s\S]*?<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>[\s\S]*?<published>([\s\S]*?)<\/published>[\s\S]*?<id>([\s\S]*?)<\/id>[\s\S]*?<\/entry>/g
  let match
  while ((match = regex.exec(data)) !== null && items.length < 10) {
    items.push({
      title: match[1].trim(),
      summary: match[2].trim().substring(0, 500),
      author: match[3].trim(),
      published: match[4].trim(),
      url: match[5].trim()
    })
  }
  return { items, count: items.length }
}

export default createMCPServer({
  name: 'search-tools',
  version: '1.0.0',
  description: 'Comprehensive search and documentation toolkit - GitHub code search, StackOverflow, academic papers, and multi-source research',
  author: 'MCP Expert Community',
  icon: '🔍'
})
  .addTool({
    name: 'search_github_code',
    description: 'Search GitHub repositories and code',
    parameters: {
      query: { type: 'string', description: 'Search query for code, repos, or issues', required: true },
      type: { type: 'string', description: 'Search type: code, repo, issues', required: false },
      language: { type: 'string', description: 'Filter by language (e.g., python, javascript)', required: false },
      token: { type: 'string', description: 'GitHub personal access token for higher rate limits', required: false }
    },
    execute: async (params: any) => {
      let query = params.query
      if (params.language) query += ` language:${params.language}`
      if (params.type === 'repo') query += ' in:name,description'

      const result = await searchGitHub(query, params.token)

      if (result.error) {
        return { success: false, error: result.error, raw: JSON.stringify(result).substring(0, 2000) }
      }

      return {
        success: true,
        query: params.query,
        totalCount: result.total_count,
        items: (result.items || []).slice(0, 10).map((item: any) => ({
          name: item.name,
          path: item.path,
          repository: item.repository?.full_name,
          url: item.html_url,
          score: item.score,
          language: item.repository?.language
        }))
      }
    }
  })
  .addTool({
    name: 'search_stackoverflow',
    description: 'Search StackOverflow for programming Q&A',
    parameters: {
      query: { type: 'string', description: 'Programming question or error message', required: true },
      tags: { type: 'string', description: 'Comma-separated tags (e.g., python,django)', required: false },
      votes: { type: 'number', description: 'Minimum vote threshold', required: false }
    },
    execute: async (params: any) => {
      let query = params.query
      if (params.tags) query += ` ${params.tags.split(',').map((t: string) => `[${t.trim()}]`).join(' ')}`

      const result = await searchStackOverflow(query)

      if (result.error) {
        return { success: false, error: result.error }
      }

      let items = result.items || []
      if (params.votes) {
        items = items.filter((item: any) => item.score >= params.votes)
      }

      return {
        success: true,
        query: params.query,
        totalCount: result.total || items.length,
        items: items.slice(0, 10).map((item: any) => ({
          title: item.title,
          excerpt: item.excerpt?.substring(0, 300),
          score: item.score,
          isAnswered: item.is_answered,
          answerCount: item.answer_count,
          tags: item.tags,
          url: item.link
        }))
      }
    }
  })
  .addTool({
    name: 'search_arxiv',
    description: 'Search academic papers on arXiv',
    parameters: {
      query: { type: 'string', description: 'Research topic or keywords', required: true },
      category: { type: 'string', description: 'arXiv category (cs.AI, cs.LG, math.CO, etc.)', required: false },
      maxResults: { type: 'number', description: 'Maximum number of results (default 10)', required: false }
    },
    execute: async (params: any) => {
      let query = params.query
      if (params.category) query = `cat:${params.category} AND ${query}`

      const result = await searchArxiv(query)

      return {
        success: true,
        query: params.query,
        category: params.category,
        count: result.count,
        papers: result.items?.slice(0, params.maxResults || 10)
      }
    }
  })
  .addTool({
    name: 'search_npm',
    description: 'Search npm registry for packages',
    parameters: {
      query: { type: 'string', description: 'Package name or keywords', required: true },
      quality: { type: 'boolean', description: 'Sort by quality score', required: false },
      popularity: { type: 'boolean', description: 'Sort by popularity', required: false }
    },
    execute: async (params: any) => {
      const sort = params.quality ? 'quality' : (params.popularity ? 'popularity' : 'relevance')
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(params.query)}&size=10&sort=${sort}`
      const data = await httpsGet(url)

      try {
        const result = JSON.parse(data)
        return {
          success: true,
          query: params.query,
          count: result.objects?.length || 0,
          packages: result.objects?.slice(0, 10).map((pkg: any) => ({
            name: pkg.package.name,
            version: pkg.package.version,
            description: pkg.package.description,
            downloads: pkg.package.downloads?.[0]?.count,
            url: pkg.package.links?.npm
          }))
        }
      } catch {
        return { success: false, error: 'Failed to parse npm response' }
      }
    }
  })
  .addTool({
    name: 'search_pypi',
    description: 'Search Python packages on PyPI',
    parameters: {
      query: { type: 'string', description: 'Package name or keywords', required: true }
    },
    execute: async (params: any) => {
      const url = `https://pypi.org/search/?q=${encodeURIComponent(params.query)}&o=`
      const data = await httpsGet(url)

      const regex = /<a class="package-snippet__title"[^>]*>[\s\S]*?<span class="package-snippet__name">([\s\S]*?)<\/span>[\s\S]*?<span class="package-snippet__version">([\s\S]*?)<\/span>[\s\S]*?<p class="package-snippet__description">([\s\S]*?)<\/p>/g
      const packages: any[] = []
      let match

      while ((match = regex.exec(data)) !== null && packages.length < 10) {
        packages.push({
          name: match[1].trim(),
          version: match[2].trim(),
          description: match[3].trim()
        })
      }

      return {
        success: true,
        query: params.query,
        count: packages.length,
        packages
      }
    }
  })
  .addTool({
    name: 'search_google',
    description: 'Search the web using Google (via serper.dev or custom)',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
      apiKey: { type: 'string', description: 'Serper.dev API key for accurate results', required: false },
      numResults: { type: 'number', description: 'Number of results (default 10)', required: false }
    },
    execute: async (params: any) => {
      if (params.apiKey) {
        const data = JSON.stringify({ query: params.query, numResults: params.numResults || 10 })
        return new Promise((resolve) => {
          const url = new URL('https://google.serper.dev/search')
          const postData = JSON.stringify({ query: params.query, numResults: params.numResults || 10 })

          const req = https.request({
            hostname: 'google.serper.dev',
            path: '/search',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': params.apiKey }
          }, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
              try {
                const result = JSON.parse(data)
                resolve({
                  success: true,
                  query: params.query,
                  results: result.organic?.slice(0, 10) || []
                })
              } catch {
                resolve({ success: false, error: 'Failed to parse response' })
              }
            })
          })
          req.write(postData)
          req.end()
        })
      }

      const result = await safeExec(`curl -s "https://www.google.com/search?q=${encodeURIComponent(params.query)}" 2>&1 | head -100`)
      return {
        success: false,
        message: 'Google search requires API key. Try StackOverflow or use curl for basic results.',
        raw: result.substring(0, 2000)
      }
    }
  })
  .addTool({
    name: 'search_github_docs',
    description: 'Search GitHub documentation and wikis',
    parameters: {
      query: { type: 'string', description: 'Documentation search query', required: true },
      owner: { type: 'string', description: 'Repository owner', required: false },
      repo: { type: 'string', description: 'Repository name', required: false },
      token: { type: 'string', description: 'GitHub token', required: false }
    },
    execute: async (params: any) => {
      let query = params.query
      if (params.owner && params.repo) {
        query += ` repo:${params.owner}/${params.repo}`
      }

      const headers: any = { 'Accept': 'application/vnd.github.v3+json' }
      if (params.token) headers['Authorization'] = `token ${params.token}`

      const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}+in:readme&per_page=10`
      const data = await httpsGet(url)

      try {
        const result = JSON.parse(data)
        return {
          success: true,
          query: params.query,
          totalCount: result.total_count,
          results: (result.items || []).slice(0, 10).map((item: any) => ({
            name: item.name,
            repository: item.repository?.full_name,
            path: item.path,
            url: item.html_url,
            textMatches: item.text_matches
          }))
        }
      } catch {
        return { success: false, error: 'Failed to parse response' }
      }
    }
  })
  .addTool({
    name: 'search_ddg',
    description: 'Search using DuckDuckGo (privacy-focused)',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
      numResults: { type: 'number', description: 'Number of results (default 10)', required: false }
    },
    execute: async (params: any) => {
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(params.query)}`
      const data = await httpsGet(url)

      const results: any[] = []
      const regex = /<a class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
      let match

      while ((match = regex.exec(data)) !== null && results.length < (params.numResults || 10)) {
        results.push({
          title: match[2].replace(/<[^>]*>/g, '').trim(),
          url: match[1],
          snippet: match[3].replace(/<[^>]*>/g, '').trim()
        })
      }

      return {
        success: true,
        query: params.query,
        count: results.length,
        results
      }
    }
  })
  .addTool({
    name: 'search_reddit',
    description: 'Search Reddit for discussions',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
      subreddit: { type: 'string', description: 'Specific subreddit to search', required: false },
      sort: { type: 'string', description: 'Sort by: relevance, hot, top, new', required: false }
    },
    execute: async (params: any) => {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(params.query)}${params.subreddit ? `&restrict_sr=${params.subreddit}` : ''}&sort=${params.sort || 'relevance'}&limit=10`
      const data = await httpsGet(url)

      try {
        const result = JSON.parse(data)
        return {
          success: true,
          query: params.query,
          subreddit: params.subreddit,
          posts: (result.data?.children || []).slice(0, 10).map((post: any) => ({
            title: post.data.title,
            author: post.data.author,
            subreddit: post.data.subreddit,
            score: post.data.score,
            numComments: post.data.num_comments,
            url: post.data.url,
            permalink: `https://reddit.com${post.data.permalink}`
          }))
        }
      } catch {
        return { success: false, error: 'Failed to parse Reddit response' }
      }
    }
  })
  .addPrompt({
    name: 'research-topic',
    description: 'Comprehensive multi-source research on a topic',
    arguments: [
      { name: 'topic', description: 'Research topic or question', required: true }
    ],
    generate: async (args?: any) => `
## 🔍 Research Task: ${args?.topic}

### Step 1: Gather Information
1. Call \`search_google\` for general information
2. Call \`search_stackoverflow\` for technical solutions
3. Call \`search_arxiv\` for academic papers
4. Call \`search_github_code\` for code examples

### Step 2: Synthesize
- Compile key findings from all sources
- Note any conflicting information
- Identify knowledge gaps

### Step 3: Present
- Executive summary
- Detailed findings by source
- Recommendations and next steps
    `.trim()
  })
  .build()