import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'web-crawler',
  version: '2.0.0',
  description: 'Web crawler toolkit - recursive crawling, sitemap, robots.txt, extraction',
  author: 'MCP Expert Community',
  icon: '🕷️'
})
  .addTool({
    name: 'crawl_config',
    description: 'Generate crawler configuration',
    parameters: {
      startUrl: { type: 'string', description: 'Start URL', required: true },
      maxDepth: { type: 'number', description: 'Max crawl depth', required: false },
      maxPages: { type: 'number', description: 'Max pages to crawl', required: false },
      concurrency: { type: 'number', description: 'Concurrent requests', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        startUrl: { type: 'string', required: true },
        maxDepth: { type: 'number', required: false, default: 3 },
        maxPages: { type: 'number', required: false, default: 100 },
        concurrency: { type: 'number', required: false, default: 5 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        config: {
          startUrl: validation.data.startUrl,
          maxDepth: validation.data.maxDepth,
          maxPages: validation.data.maxPages,
          concurrency: validation.data.concurrency,
          respectRobotsTxt: true,
          obeyNofollow: true
        },
        libraries: ['crawler', 'simplecrawler', 'cheerio', 'axios']
      })
    }
  })
  .addTool({
    name: 'crawl_seo',
    description: 'SEO audit checklist',
    parameters: {
      url: { type: 'string', description: 'URL to audit', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        checks: [
          'Title tag length (50-60 chars)',
          'Meta description (150-160 chars)',
          'H1 presence (exactly one)',
          'Image alt attributes',
          'Canonical URL',
          'Robots meta tag',
          'Open Graph tags',
          'Schema.org markup',
          'Page load time < 3s'
        ],
        sitemap: `${validation.data.url}/sitemap.xml`,
        robots: `${validation.data.url}/robots.txt`
      })
    }
  })
  .addTool({
    name: 'crawl_extract',
    description: 'Data extraction patterns',
    parameters: {
      patterns: { type: 'string', description: 'Comma-separated patterns', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        patterns: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        regexPatterns: {
          emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
          phones: /[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{8,}/,
          urls: /https?:\/\/[^\s"'<>]+/
        },
        extractCommand: 'Use Cheerio for jQuery-like DOM extraction'
      })
    }
  })
  .build()
