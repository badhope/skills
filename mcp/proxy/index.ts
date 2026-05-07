import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'proxy',
  version: '3.0.0',
  description: '网络代理配置和管理工具 - 支持HTTP/HTTPS/SOCKS代理配置、环境变量设置和API访问测试',
  author: 'MCP Mega-Agent Platform',
  icon: '🔌'
})
  .forAllPlatforms({
    categories: ['Network', 'Security'],
    rating: 'professional',
    features: ['代理配置检测', '环境变量设置', '网络连通性测试', 'API访问测试']
  })
  .addTool({
    name: 'detect_proxy_settings',
    description: '检测当前系统的代理配置状态',
    parameters: {},
    execute: async () => {
      const proxySettings = {
        httpProxy: processDELETE.HTTP_PROXY || processDELETE.http_proxy || '未设置',
        httpsProxy: processDELETE.HTTPS_PROXY || processDELETE.https_proxy || '未设置',
        noProxy: processDELETE.NO_PROXY || processDELETE.no_proxy || '未设置',
        socksProxy: processDELETE.SOCKS_PROXY || processDELETE.socks_proxy || '未设置',
        allProxy: processDELETE.ALL_PROXY || processDELETE.all_proxy || '未设置'
      }
      
      return formatSuccess({
        proxySettings,
        hasProxy: !!proxySettings.httpProxy || !!proxySettings.httpsProxy || !!proxySettings.socksProxy,
        tips: [
          'HTTP_PROXY 和 HTTPS_PROXY 分别用于 HTTP 和 HTTPS 请求',
          'NO_PROXY 用于指定不需要代理的域名列表',
          'SOCKS_PROXY 用于 SOCKS 代理协议'
        ]
      })
    }
  })
  .addTool({
    name: 'test_network_connectivity',
    description: '测试网络连通性和外部API访问',
    parameters: {
      url: { type: 'string', description: '要测试的URL', required: false },
      timeout: { type: 'number', description: '超时时间（毫秒）', default: 10000 }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: false },
        timeout: { type: 'number', required: false, min: 1000, max: 30000 }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const testUrls = params.url ? [params.url] : [
        'https://api.openai.com',
        'https://api.anthropic.com',
        'https://api.github.com',
        'https://www.google.com',
        'https://www.baidu.com'
      ]
      
      const results: Record<string, { success: boolean; latency?: number; error?: string }> = {}
      const timeout = params.timeout || 10000
      
      for (const url of testUrls) {
        try {
          const startTime = Date.now()
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)
          
          await fetch(url, {
            signal: controller.signal,
            method: 'HEAD',
            mode: 'no-cors'
          }).catch(() => {})
          
          clearTimeout(timeoutId)
          const latency = Date.now() - startTime
          
          results[url] = { success: true, latency }
        } catch (error) {
          results[url] = { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }
        }
      }
      
      const successCount = Object.values(results).filter(r => r.success).length
      const failureCount = Object.values(results).filter(r => !r.success).length
      
      return formatSuccess({
        results,
        summary: {
          total: testUrls.length,
          success: successCount,
          failed: failureCount,
          successRate: Math.round((successCount / testUrls.length) * 100)
        },
        recommendations: failureCount > 0 ? [
          '如果外部API无法访问，请检查代理配置',
          '尝试设置 HTTP_PROXY 和 HTTPS_PROXY 环境变量',
          '检查防火墙设置是否阻止了外部连接',
          '考虑使用VPN或代理服务访问受限资源'
        ] : ['网络连接正常，可以访问外部资源']
      })
    }
  })
  .addTool({
    name: 'get_proxy_config_guide',
    description: '获取详细的代理配置指南',
    parameters: {
      os: { type: 'string', description: '操作系统类型', enum: ['windows', 'linux', 'macos'], required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        os: { type: 'string', required: false, enum: ['windows', 'linux', 'macos'] }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const os = params.os || 'windows'
      
      const guides: Record<string, { envSetup: string; permanentSetup: string; notes: string[] }> = {
        windows: {
          envSetup: 'set HTTP_PROXY=http://proxy.example.com:8080\nset HTTPS_PROXY=https://proxy.example.com:8080\nset NO_PROXY=localhost,127.0.0.1,*.example.com',
          permanentSetup: '控制面板 → 系统和安全 → 系统 → 高级系统设置 → 环境变量',
          notes: [
            '在命令行设置的环境变量仅对当前会话有效',
            '如需永久生效，请在系统环境变量中设置',
            'PowerShell 用户可以使用 $env:HTTP_PROXY="..." 设置临时变量'
          ]
        },
        linux: {
          envSetup: 'export HTTP_PROXY=http://proxy.example.com:8080\nexport HTTPS_PROXY=https://proxy.example.com:8080\nexport NO_PROXY=localhost,127.0.0.1,*.example.com',
          permanentSetup: '将上述命令添加到 ~/.bashrc 或 ~/.zshrc 文件末尾',
          notes: [
            '使用 source ~/.bashrc 使配置立即生效',
            '对于 sudo 命令，可能需要使用 sudo -E 保留环境变量',
            '检查 /etc/profile 了解系统级代理配置'
          ]
        },
        macos: {
          envSetup: 'export HTTP_PROXY=http://proxy.example.com:8080\nexport HTTPS_PROXY=https://proxy.example.com:8080\nexport NO_PROXY=localhost,127.0.0.1,*.example.com',
          permanentSetup: '将上述命令添加到 ~/.bash_profile 或 ~/.zshrc 文件末尾',
          notes: [
            'macOS 10.15+ 默认使用 zsh，配置文件为 ~/.zshrc',
            '可以在"系统偏好设置"→"网络"→"高级"中设置系统级代理',
            'GUI应用可能需要重启才能识别新的代理设置'
          ]
        }
      }
      
      const guide = guides[os]
      
      return formatSuccess({
        os,
        guide,
        additionalResources: [
          '测试代理是否生效: curl --proxy $HTTP_PROXY https://www.google.com',
          '查看当前代理设置: env | grep -i proxy',
          'npm代理配置: npm config set proxy $HTTP_PROXY',
          'git代理配置: git config --global http.proxy $HTTP_PROXY'
        ]
      })
    }
  })
  .addTool({
    name: 'suggest_proxy_services',
    description: '推荐常用的代理服务和解决方案',
    parameters: {},
    execute: async () => {
      return formatSuccess({
        categories: {
          'VPN服务': [
            { name: 'ExpressVPN', features: ['全球节点', '高速稳定', '隐私保护'], url: 'https://www.expressvpn.com' },
            { name: 'NordVPN', features: ['5000+节点', '双重加密', 'P2P支持'], url: 'https://nordvpn.com' },
            { name: 'Surfshark', features: ['无限设备', 'CleanWeb', '多协议'], url: 'https://surfshark.com' }
          ],
          '代理服务': [
            { name: 'SmartProxy', features: ['数据中心代理', '住宅代理', 'API支持'], url: 'https://smartproxy.com' },
            { name: 'Oxylabs', features: ['大规模代理池', '企业级', '定制方案'], url: 'https://oxylabs.io' },
            { name: 'BrightData', features: ['全球住宅代理', '高成功率', '开发者友好'], url: 'https://brightdata.com' }
          ],
          '开源解决方案': [
            { name: 'Shadowsocks', features: ['轻量级', '开源', '跨平台'], url: 'https://shadowsocks.org' },
            { name: 'V2Ray', features: ['多协议支持', '灵活配置', '高性能'], url: 'https://www.v2ray.com' },
            { name: 'Clash', features: ['规则引擎', '透明代理', 'GUI客户端'], url: 'https://github.com/Dreamacro/clash' }
          ],
          '开发工具': [
            { name: 'Proxychains', features: ['命令行代理', 'SOCKS支持', '灵活配置'], url: 'https://github.com/rofl0r/proxychains-ng' },
            { name: 'mitmproxy', features: ['HTTP代理', '流量分析', '调试工具'], url: 'https://mitmproxy.org' },
            { name: 'Charles', features: ['HTTP抓包', '调试代理', 'SSL解密'], url: 'https://www.charlesproxy.com' }
          ]
        },
        recommendations: [
          '开发环境推荐使用 mitmproxy 或 Charles 进行API调试',
          '生产环境建议使用企业级代理服务保证稳定性',
          '定期测试代理连通性确保服务正常',
          '注意代理服务的合规性和隐私政策'
        ]
      })
    }
  })
  .build()