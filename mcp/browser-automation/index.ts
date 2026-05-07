import { createMCPServer } from '../../packages/core/mcp/builder'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

async function safeExec(cmd: string, cwd?: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 180000 })
    return stdout + stderr
  } catch (e: any) {
    return e.stdout + e.stderr
  }
}

const HUMAN_BEHAVIOR_SCRIPTS = {
  mouseMove: `
    async function humanMouseMove(page, selector) {
      const element = await page.$(selector);
      if (!element) return false;
      const box = await element.boundingBox();
      if (!box) return false;
      
      const startX = Math.random() * 100;
      const startY = Math.random() * 100;
      const endX = box.x + box.width / 2;
      const endY = box.y + box.height / 2;
      
      const steps = 20 + Math.floor(Math.random() * 30);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = startX + (endX - startX) * (t*t*t + 0.3*t*t + 0.1*t);
        const y = startY + (endY - startY) * (t*t*t + 0.2*t*t + 0.15*t);
        await page.mouse.move(x + (Math.random() - 0.5) * 5, y + (Math.random() - 0.5) * 5);
        await page.waitForTimeout(10 + Math.random() * 20);
      }
      return true;
    }
  `,
  typeText: `
    async function humanType(page, selector, text) {
      await page.focus(selector);
      for (const char of text) {
        await page.keyboard.type(char, { delay: 50 + Math.random() * 150 });
        if (Math.random() < 0.05) {
          await page.waitForTimeout(300 + Math.random() * 500);
        }
      }
    }
  `,
  scroll: `
    async function humanScroll(page) {
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      const stepCount = 5 + Math.floor(Math.random() * 10);
      for (let i = 0; i < stepCount; i++) {
        await page.evaluate((h, steps) => {
          window.scrollBy(0, h / steps + (Math.random() - 0.5) * 100);
        }, scrollHeight, stepCount);
        await page.waitForTimeout(200 + Math.random() * 800);
      }
    }
  `
}

const STEALTH_SCRIPT = `
  // 移除webdriver标识
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  
  // 修复chrome.runtime
  window.chrome = { runtime: {} };
  
  // 修复插件
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  
  // 修复语言
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  
  // 修复canvas指纹
  const getImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
    const data = getImageData.call(this, x, y, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] += Math.round(Math.random() * 0.5);
    }
    return data;
  };
  
  // 移除自动化特征
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_;
  delete window.cdc_asdjflasutopfhvcZLmcfl_;
`

const BROWSER_PRESETS = {
  chrome: {
    name: 'Chrome Desktop',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN'
  },
  chromeMac: {
    name: 'Chrome Mac',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  },
  mobile: {
    name: 'iPhone 15 Pro',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    viewport: { width: 393, height: 852 },
    locale: 'zh-CN',
    isMobile: true
  },
  firefox: {
    name: 'Firefox Desktop',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN'
  },
  edge: {
    name: 'Edge Desktop',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.81',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN'
  }
}

export default createMCPServer({
  name: 'browser-automation',
  version: '1.0.0',
  description: '浏览器自动化增强版 - 人类行为模拟、反检测指纹、智能交互',
  icon: '🎭',
  author: 'MCP Expert Community'
})

  .addTool({
    name: 'browser_list_presets',
    description: '列出所有浏览器预设配置',
    parameters: {},
    execute: async () => {
      return {
        total: Object.keys(BROWSER_PRESETS).length,
        presets: Object.entries(BROWSER_PRESETS).map(([key, p]) => ({
          id: key,
          name: p.name,
          userAgent: p.userAgent,
          viewport: p.viewport,
          isMobile: (p as any).isMobile || false
        }))
      }
    }
  })

  .addTool({
    name: 'browser_screenshot',
    description: '高级截图 - 支持人类延迟、隐身模式、预设浏览器',
    parameters: {
      url: { type: 'string', description: '目标URL (包含https://)' },
      outputFile: { type: 'string', description: '输出图片路径' },
      preset: { type: 'string', description: '浏览器预设: chrome, chromeMac, mobile, firefox, edge' },
      stealthMode: { type: 'boolean', description: '启用反检测隐身模式' },
      fullPage: { type: 'boolean', description: '整页截图' },
      delaySeconds: { type: 'number', description: '页面加载后等待秒数' },
      emulateHuman: { type: 'boolean', description: '模拟人类滚动行为' },
      proxy: { type: 'string', description: '代理服务器: http://user:pass@host:port' }
    },
    execute: async (params: any) => {
      const output = params.outputFile || `screenshot_${Date.now()}.png`
      const preset = BROWSER_PRESETS[params.preset as keyof typeof BROWSER_PRESETS] || BROWSER_PRESETS.chrome
      const delay = params.delaySeconds || 3
      const width = preset.viewport.width
      const height = preset.viewport.height

      const script = `
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      ${params.proxy ? `'--proxy-server=${params.proxy}'` : ''},
      '--user-agent=${preset.userAgent}'
    ].filter(Boolean)
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: ${width}, height: ${height} });
  
  ${params.stealthMode ? `await page.evaluateOnNewDocument(() => { ${STEALTH_SCRIPT} });` : ''}
  
  console.log('Navigating to ${params.url}...');
  await page.goto('${params.url}', { waitUntil: 'networkidle2', timeout: 60000 });
  
  console.log('Waiting for ${delay}s...');
  await page.waitForTimeout(${delay * 1000});
  
  ${params.emulateHuman ? `
  // 模拟人类滚动
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 100 + Math.random() * 200));
    await page.waitForTimeout(300 + Math.random() * 500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  ` : ''}
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: '${output}', fullPage: ${params.fullPage || false} });
  
  await browser.close();
  console.log('Screenshot saved to ${output}');
})();
`
      const result = await safeExec(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1 || npx puppeteer-cli print --url="${params.url}" --output="${output}" --width=${width} 2>&1`)

      return {
        success: result.toLowerCase().includes('saved') || result.toLowerCase().includes('screenshot'),
        url: params.url,
        outputFile: output,
        preset: preset.name,
        stealthMode: params.stealthMode || false,
        emulateHuman: params.emulateHuman || false,
        raw: result.substring(0, 2000),
        message: params.stealthMode ? '🎭 隐身模式截图完成' : '📸 截图完成'
      }
    }
  })

  .addTool({
    name: 'browser_extract_text',
    description: '提取页面文本内容 - 隐身模式支持',
    parameters: {
      url: { type: 'string', description: '目标URL' },
      selector: { type: 'string', description: 'CSS选择器，默认提取body' },
      stealthMode: { type: 'boolean', description: '启用隐身模式' },
      preset: { type: 'string', description: '浏览器预设' },
      includeLinks: { type: 'boolean', description: '包含链接列表' },
      includeImages: { type: 'boolean', description: '包含图片列表' }
    },
    execute: async (params: any) => {
      const selector = params.selector || 'body'
      const preset = BROWSER_PRESETS[params.preset as keyof typeof BROWSER_PRESETS] || BROWSER_PRESETS.chrome

      const script = `
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('${preset.userAgent}');
  
  ${params.stealthMode ? `await page.evaluateOnNewDocument(() => { ${STEALTH_SCRIPT} });` : ''}
  
  await page.goto('${params.url}', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  const result = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    return {
      title: document.title,
      text: element ? element.innerText.substring(0, 50000) : '',
      html: element ? element.innerHTML.substring(0, 50000) : '',
      links: ${params.includeLinks} ? Array.from(document.links).map(l => ({text: l.textContent, href: l.href})).slice(0, 50) : [],
      images: ${params.includeImages} ? Array.from(document.images).map(i => ({src: i.src, alt: i.alt})).slice(0, 50) : []
    };
  }, '${selector}');
  
  console.log(JSON.stringify(result, null, 2));
  
  await browser.close();
})();
`
      try {
        const result = await safeExec(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1`)
        
        let extracted = { title: '', text: '', links: [], images: [] }
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            extracted = JSON.parse(jsonMatch[0])
          }
        } catch {}

        return {
          success: true,
          url: params.url,
          selector,
          title: extracted.title,
          textLength: extracted.text?.length || 0,
          text: extracted.text,
          links: extracted.links,
          images: extracted.images,
          raw: result.substring(0, 1000),
          message: `📄 已提取 ${extracted.text?.length || 0} 字符`
        }
      } catch (e: any) {
        return { success: false, error: e.message }
      }
    }
  })

  .addTool({
    name: 'browser_form_submit',
    description: '模拟人类提交表单 - 打字延迟、鼠标移动',
    parameters: {
      url: { type: 'string', description: '表单页面URL' },
      formData: { type: 'string', description: 'JSON: {"selector": "value"} 表单数据' },
      submitSelector: { type: 'string', description: '提交按钮CSS选择器' },
      stealthMode: { type: 'boolean', description: '隐身模式' },
      screenshotResult: { type: 'boolean', description: '结果截图' }
    },
    execute: async (params: any) => {
      let formData: Record<string, string> = {}
      try {
        formData = JSON.parse(params.formData)
      } catch {}

      const fieldsCode = Object.entries(formData).map(([selector, value]) => `
        // 输入 ${selector}
        await page.focus('${selector}');
        for (const char of '${value}') {
          await page.keyboard.type(char, { delay: 50 + Math.random() * 150 });
        }
        await page.waitForTimeout(200 + Math.random() * 500);
      `).join('\n')

      const script = `
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  ${params.stealthMode ? `await page.evaluateOnNewDocument(() => { ${STEALTH_SCRIPT} });` : ''}
  
  await page.goto('${params.url}', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(1500);
  
  ${fieldsCode}
  
  // 人类鼠标移动到提交按钮
  const submitBtn = await page.$('${params.submitSelector || 'button[type="submit"]'}');
  if (submitBtn) {
    const box = await submitBtn.boundingBox();
    if (box) {
      for (let i = 0; i <= 20; i++) {
        await page.mouse.move(box.x + box.width/2 + (Math.random()-0.5)*10, box.y + box.height/2);
        await page.waitForTimeout(15);
      }
    }
    await submitBtn.click({ delay: 100 + Math.random() * 200 });
  }
  
  await page.waitForTimeout(3000);
  console.log('Page URL after submit:', page.url());
  
  ${params.screenshotResult ? `await page.screenshot({ path: 'form_result.png' });` : ''}
  
  await browser.close();
  console.log('Form submitted successfully!');
})();
`
      const result = await safeExec(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1`)

      return {
        success: result.toLowerCase().includes('success'),
        url: params.url,
        fields: Object.keys(formData),
        resultUrl: result.match(/https?:\/\/[^\s]+/)?.[0],
        output: result.substring(0, 1000),
        message: '✅ 表单已模拟人类方式提交'
      }
    }
  })

  .addTool({
    name: 'browser_cookies_export',
    description: '导出/导入浏览器Cookies实现会话持久化',
    parameters: {
      url: { type: 'string', description: '目标网站URL' },
      action: { type: 'string', description: '操作: export, import' },
      cookiesFile: { type: 'string', description: 'Cookies文件路径' }
    },
    execute: async (params: any) => {
      const cookiesFile = params.cookiesFile || 'cookies.json'

      const script = `
const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  ${params.action === 'import' ? `
  // 导入Cookies
  const cookies = JSON.parse(fs.readFileSync('${cookiesFile}', 'utf8'));
  for (const cookie of cookies) {
    await page.setCookie(cookie);
  }
  console.log('Cookies imported:', cookies.length);
  ` : ''}
  
  await page.goto('${params.url}', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);
  
  ${params.action === 'export' ? `
  // 导出Cookies
  const cookies = await page.cookies();
  fs.writeFileSync('${cookiesFile}', JSON.stringify(cookies, null, 2));
  console.log('Cookies exported:', cookies.length);
  ` : ''}
  
  console.log('Current page title:', await page.title());
  await browser.close();
})();
`
      const result = await safeExec(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1`)
      const cookieCount = result.match(/Cookies (?:exported|imported): (\d+)/)?.[1] || '0'

      return {
        success: true,
        action: params.action,
        url: params.url,
        cookiesFile,
        cookieCount: parseInt(cookieCount),
        output: result.substring(0, 500),
        message: `🍪 Cookies ${params.action === 'export' ? '导出' : '导入'}成功: ${cookieCount} 个`
      }
    }
  })

  .addTool({
    name: 'browser_stealth_check',
    description: '检测浏览器反检测效果 - 运行bot检测测试',
    parameters: {
      testUrl: { type: 'string', description: '测试网站URL，默认使用bot检测站' }
    },
    execute: async (params: any) => {
      const testUrl = params.testUrl || 'https://bot.sannysoft.com'

      const script = `
const puppeteer = require('puppeteer');
(async () => {
  console.log('Testing stealth mode...');
  
  const tests = [
    { name: 'WebDriver', test: () => navigator.webdriver },
    { name: 'Chrome Runtime', test: () => !!(window.chrome && window.chrome.runtime) },
    { name: 'Plugins Length', test: () => navigator.plugins.length },
    { name: 'Languages', test: () => navigator.languages.length },
    { name: 'Notification', test: () => Notification.permission !== 'denied' }
  ];
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage();
  
  // 应用stealth脚本
  await page.evaluateOnNewDocument(() => { ${STEALTH_SCRIPT} });
  
  await page.goto('${testUrl}', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(5000);
  
  const results = await page.evaluate(() => {
    return {
      webdriver: navigator.webdriver,
      plugins: navigator.plugins.length,
      languages: navigator.languages,
      chrome: !!window.chrome,
      userAgent: navigator.userAgent,
      title: document.title
    };
  });
  
  console.log(JSON.stringify(results, null, 2));
  
  await page.screenshot({ path: 'stealth_test.png' });
  await browser.close();
  
  console.log('Test completed, screenshot saved');
})();
`
      const result = await safeExec(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1`)

      let testResults = {}
      try {
        const jsonMatch = result.match(/\{[\s\S]*"userAgent"[\s\S]*\}/)
        if (jsonMatch) {
          testResults = JSON.parse(jsonMatch[0])
        }
      } catch {}

      const score = Object.values(testResults).filter(v => v !== false && v !== undefined).length

      return {
        success: true,
        testUrl,
        score: `${score}/5`,
        results: testResults,
        screenshot: 'stealth_test.png',
        message: `🕵️  隐身模式检测: webdriver=${(testResults as any).webdriver ? 'DETECTED ❌' : 'PASSED ✅'}`,
        output: result.substring(0, 1000)
      }
    }
  })

  .build()
