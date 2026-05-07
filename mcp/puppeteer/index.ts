import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'puppeteer',
  version: '2.0.0',
  description: 'Puppeteer toolkit - screenshots, scraping, automation, PDF generation',
  author: 'MCP Expert Community',
  icon: '🎭'
})
  .addTool({
    name: 'puppet_screenshot',
    description: 'Generate screenshot code',
    parameters: {
      url: { type: 'string', description: 'Target URL', required: true },
      selector: { type: 'string', description: 'CSS selector', required: false },
      fullPage: { type: 'boolean', description: 'Full page', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true },
        selector: { type: 'string', required: false, default: '' },
        fullPage: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        code: `
const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.goto('${validation.data.url}', { waitUntil: 'networkidle2' })
${validation.data.selector ? `await page.waitForSelector('${validation.data.selector}')` : ''}
await page.screenshot({ ${validation.data.selector ? `clip: await page.evaluate(s => document.querySelector(s).getBoundingClientRect(), '${validation.data.selector}')` : `fullPage: ${validation.data.fullPage}`}, path: 'screenshot.png' })
await browser.close()
        `.trim(),
        viewports: { mobile: '375x667', tablet: '768x1024', desktop: '1920x1080' }
      })
    }
  })
  .addTool({
    name: 'puppet_scrape',
    description: 'Generate scraping code',
    parameters: {
      url: { type: 'string', description: 'Target URL', required: true },
      selector: { type: 'string', description: 'CSS selector', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true },
        selector: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        code: `
const browser = await puppeteer.launch()
const page = await browser.newPage()
await page.goto('${validation.data.url}')
const data = await page.$$eval('${validation.data.selector}', elements => 
  elements.map(el => ({ text: el.textContent, href: el.href }))
)
console.log(data)
await browser.close()
        `.trim(),
        antiDetect: [
          'page.setUserAgent()',
          'page.setExtraHTTPHeaders()',
          'await page.waitForTimeout()'
        ]
      })
    }
  })
  .addTool({
    name: 'puppet_pdf',
    description: 'Generate PDF from URL',
    parameters: {
      url: { type: 'string', description: 'Target URL', required: true },
      format: { type: 'string', description: 'A4|Letter|Legal', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true },
        format: { type: 'string', required: false, default: 'A4' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        code: `await page.pdf({ path: 'output.pdf', format: '${validation.data.format}', printBackground: true, margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }})`,
        formats: ['A4', 'Letter', 'Legal', 'Tabloid']
      })
    }
  })
  .build()
