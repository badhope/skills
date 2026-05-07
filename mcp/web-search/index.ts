import { createMCPServer } from '../../packages/core/mcp/builder'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

async function duckDuckGoSearch(query: string, limit: number = 10): Promise<any[]> {
  const results: any[] = []
  try {
    const html = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': USER_AGENT }
    }).then(r => r.text())
    
    const resultRegex = /<div class="result__body">[\s\S]*?<a class="result__a" href="([^"]+)">([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/g
    let match
    let count = 0
    while ((match = resultRegex.exec(html)) !== null && count < limit) {
      results.push({
        title: match[2].replace(/<b>/g, '').replace(/<\/b>/g, '').trim(),
        url: match[1],
        snippet: match[3].replace(/<b>/g, '').replace(/<\/b>/g, '').trim()
      })
      count++
    }
  } catch (e) {}
  return results
}

async function wikipediaSearch(query: string, limit: number = 5): Promise<any[]> {
  try {
    const data: any = await fetch(
      `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`
    ).then(r => r.json())
    return data?.query?.search?.map((item: any) => ({
      title: item.title,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      snippet: item.snippet.replace(/<\/?span[^>]*>/g, '').replace(/&quot;/g, '"')
    })) || []
  } catch (e) {
    return []
  }
}

async function getPageContent(url: string): Promise<{ html: string; text: string }> {
  const html = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT }
  }).then(r => r.text())
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
  return { html, text }
}

export default createMCPServer({
  name: 'web-search',
  version: '1.0.0',
  description: '全网搜索引擎 - 实时网页搜索、维基百科、新闻检索、URL内容提取',
  author: 'MCP Expert Community',
  icon: '🔍'
})
  .addTool({
    name: 'web_search',
    description: '全网搜索 - DuckDuckGo 匿名搜索引擎',
    parameters: {
      query: { type: 'string', description: '搜索关键词', required: true },
      limit: { type: 'number', description: '结果数量默认10', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const results = await duckDuckGoSearch(params.query, params.limit || 10)
      return {
        success: true,
        query: params.query,
        engine: 'DuckDuckGo',
        count: results.length,
        results
      }
    }
  })
  .addTool({
    name: 'wikipedia_search',
    description: '维基百科搜索 - 中文',
    parameters: {
      query: { type: 'string', description: '搜索关键词', required: true },
      limit: { type: 'number', description: '结果数量默认5', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const results = await wikipediaSearch(params.query, params.limit || 5)
      return {
        success: true,
        query: params.query,
        source: 'Wikipedia 中文维基',
        count: results.length,
        results
      }
    }
  })
  .addTool({
    name: 'fetch_url_content',
    description: '获取任意URL的页面内容',
    parameters: {
      url: { type: 'string', description: '要获取的URL', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const content = await getPageContent(params.url)
      return {
        success: true,
        url: params.url,
        contentLength: content.text.length,
        content
      }
    }
  })
  .build()
