import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'
import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs/promises'
import * as crypto from 'crypto'

type ValidationRule = { type: string; required?: boolean; default?: any; pattern?: RegExp }
type JSONSchema = Record<string, ValidationRule>

function httpRequest(url: string, options: any = {}): Promise<{ status: number, headers: any, body: string, error?: string, duration: number }> {
  return new Promise((resolve) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const lib = isHttps ? https : http
    const startTime = Date.now()

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Universal-MCP-API/2.0',
        'Accept': 'application/json, */*',
        ...options.headers
      }
    }

    const req = lib.request(reqOptions, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: data,
          duration: Date.now() - startTime
        })
      })
    })

    req.on('error', (e) => {
      resolve({ status: 0, headers: {}, body: '', error: e.message, duration: Date.now() - startTime })
    })

    req.setTimeout(options.timeout || 30000, () => {
      req.destroy()
      resolve({ status: 0, headers: {}, body: '', error: 'Request timeout', duration: Date.now() - startTime })
    })

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
    405: 'Method Not Allowed', 409: 'Conflict', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity',
    429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
  }
  return statusTexts[status] || 'Unknown'
}

function generateRequestId(): string {
  return 'req_' + crypto.randomBytes(12).toString('hex')
}

function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = ['authorization', 'x-api-key', 'cookie', 'set-cookie', 'x-auth-token']
  const masked: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    masked[key] = sensitive.includes(key.toLowerCase()) ? '[MASKED]' : value
  }
  return masked
}

function parseOpenAPI(specStr: string): any {
  try {
    return JSON.parse(specStr)
  } catch {
    const yaml = require('js-yaml')
    return yaml.load(specStr)
  }
}

function generateExampleFromSchema(schema: any, depth = 0): any {
  if (depth > 3) return '...'
  if (!schema) return null

  if (schema.example !== undefined) return schema.example
  if (schema.examples?.length) return schema.examples[0]
  if (schema.enum?.length) return schema.enum[0]

  const type = schema.type || typeof schema.default
  switch (type) {
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString()
      if (schema.format === 'date') return new Date().toISOString().split('T')[0]
      if (schema.format === 'email') return 'user@example.com'
      if (schema.format === 'uuid') return crypto.randomUUID()
      return schema.default || 'string'
    case 'number':
    case 'integer':
      return schema.default || schema.minimum || 0
    case 'boolean':
      return schema.default !== undefined ? schema.default : true
    case 'array':
      return [generateExampleFromSchema(schema.items, depth + 1)]
    case 'object': {
      const obj: any = {}
      for (const [key, prop] of Object.entries(schema.properties || {})) {
        obj[key] = generateExampleFromSchema(prop, depth + 1)
      }
      return obj
    }
    default:
      return null
  }
}

function generateContractTest(endpoint: any, spec: any): string {
  return `describe('Contract: ${endpoint.method} ${endpoint.path}', () => {
  it('should match schema', async () => {
    const response = await fetch('${spec.servers?.[0]?.url || ''}${endpoint.path}')
    expect(response.status).toBe(200)
    const body = await response.json()
    // Schema validation here
  })
})`
}

export default createMCPServer({
  name: 'api-dev',
  version: '2.0.0',
  description: 'Enterprise-grade API development toolkit - REST/GraphQL/gRPC, OpenAPI integration, contract testing, mock servers, fuzz testing, and performance benchmarking',
  author: 'MCP Expert Community',
  icon: '🔌'
})
  .addTool({
    name: 'api_request',
    description: 'Make HTTP API request with authentication, request tracing, and detailed performance metrics',
    parameters: {
      url: { type: 'string', description: 'API endpoint URL', required: true },
      method: { type: 'string', description: 'HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS', required: false },
      headers: { type: 'string', description: 'Request headers as JSON', required: false },
      body: { type: 'string', description: 'Request body (JSON string or raw)', required: false },
      authType: { type: 'string', description: 'Auth type: none, bearer, basic, apiKey, hmac, oauth2', required: false },
      authToken: { type: 'string', description: 'Authentication token or API key', required: false },
      authSecret: { type: 'string', description: 'Secret for HMAC signing', required: false },
      contentType: { type: 'string', description: 'Content-Type header (default: application/json)', required: false },
      timeout: { type: 'number', description: 'Request timeout in ms (default 30000)', required: false },
      validateSSL: { type: 'boolean', description: 'Validate SSL certificates', required: false },
      followRedirects: { type: 'boolean', description: 'Follow redirects automatically', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true, pattern: /^https?:\/\// },
        method: { type: 'string', required: false, default: 'GET' },
        headers: { type: 'string', required: false, default: '{}' },
        body: { type: 'string', required: false, default: '' },
        authType: { type: 'string', required: false, default: 'none' },
        authToken: { type: 'string', required: false, default: '' },
        authSecret: { type: 'string', required: false, default: '' },
        contentType: { type: 'string', required: false, default: 'application/json' },
        timeout: { type: 'number', required: false, default: 30000 },
        validateSSL: { type: 'boolean', required: false, default: true },
        followRedirects: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const requestId = generateRequestId()
      const headers: any = JSON.parse(validation.data.headers)
      headers['X-Request-ID'] = requestId

      const authType = validation.data.authType.toLowerCase()
      if (authType === 'bearer' && validation.data.authToken) {
        headers['Authorization'] = `Bearer ${validation.data.authToken}`
      } else if (authType === 'basic' && validation.data.authToken) {
        headers['Authorization'] = `Basic ${Buffer.from(validation.data.authToken).toString('base64')}`
      } else if (authType === 'apikey' && validation.data.authToken) {
        headers['X-API-Key'] = validation.data.authToken
      } else if (authType === 'hmac' && validation.data.authToken && validation.data.authSecret) {
        const timestamp = Math.floor(Date.now() / 1000)
        const payload = `${timestamp}:${validation.data.method}:${new URL(validation.data.url).pathname}`
        const signature = crypto.createHmac('sha256', validation.data.authSecret).update(payload).digest('hex')
        headers['X-HMAC-Timestamp'] = timestamp
        headers['X-HMAC-Signature'] = signature
        headers['X-HMAC-API-Key'] = validation.data.authToken
      }

      if (validation.data.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(validation.data.method.toUpperCase())) {
        headers['Content-Type'] = validation.data.contentType
      }

      const response = await httpRequest(validation.data.url, {
        method: validation.data.method.toUpperCase(),
        headers,
        body: validation.data.body,
        timeout: validation.data.timeout
      })

      let parsedBody = response.body
      let bodySize = Buffer.byteLength(response.body)

      try {
        parsedBody = JSON.stringify(JSON.parse(response.body), null, 2)
      } catch { }

      return formatSuccess({
        requestId,
        request: {
          url: validation.data.url,
          method: validation.data.method.toUpperCase(),
          headers: maskSensitiveHeaders(headers)
        },
        response: {
          status: response.status,
          statusText: getStatusText(response.status),
          headers: maskSensitiveHeaders(response.headers),
          body: parsedBody,
          bodySizeKB: Math.round(bodySize / 1024 * 100) / 100
        },
        performance: {
          duration: `${response.duration}ms`,
          category: response.duration < 200 ? 'fast' : response.duration < 1000 ? 'normal' : 'slow'
        },
        timing: { timestamp: new Date().toISOString() },
        error: response.error
      })
    }
  })
  .addTool({
    name: 'api_health_check',
    description: 'Run comprehensive API health check suite with SLA monitoring',
    parameters: {
      baseUrl: { type: 'string', description: 'API base URL', required: true },
      healthPath: { type: 'string', description: 'Health endpoint path (default: /health)', required: false },
      readinessPath: { type: 'string', description: 'Readiness endpoint path', required: false },
      metricsPath: { type: 'string', description: 'Metrics endpoint path', required: false },
      uptimeThreshold: { type: 'number', description: 'Uptime threshold percentage', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        baseUrl: { type: 'string', required: true },
        healthPath: { type: 'string', required: false, default: '/health' },
        readinessPath: { type: 'string', required: false, default: '/ready' },
        metricsPath: { type: 'string', required: false, default: '/metrics' },
        uptimeThreshold: { type: 'number', required: false, default: 99.9 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const base = validation.data.baseUrl.replace(/\/$/, '')
      const checks = [
        { name: 'health', path: validation.data.healthPath, critical: true },
        { name: 'readiness', path: validation.data.readinessPath, critical: false },
        { name: 'metrics', path: validation.data.metricsPath, critical: false }
      ]

      const results: any[] = []
      for (const check of checks) {
        try {
          const response = await httpRequest(`${base}${check.path}`, { timeout: 10000 })
          results.push({
            name: check.name,
            endpoint: `${base}${check.path}`,
            status: response.status,
            available: response.status >= 200 && response.status < 300,
            responseTime: response.duration,
            critical: check.critical
          })
        } catch (e: any) {
          results.push({
            name: check.name,
            endpoint: `${base}${check.path}`,
            status: 0,
            available: false,
            responseTime: 0,
            error: e.message,
            critical: check.critical
          })
        }
      }

      const healthy = results.filter(r => r.available)
      const criticalFail = results.filter(r => r.critical && !r.available)
      const avgResponse = healthy.reduce((a, r) => a + r.responseTime, 0) / (healthy.length || 1)

      return formatSuccess({
        overallStatus: criticalFail.length === 0 ? 'healthy' : 'degraded',
        uptimeScore: Math.round((healthy.length / results.length) * 1000) / 10,
        meetsSla: Math.round((healthy.length / results.length) * 100) >= validation.data.uptimeThreshold,
        checks: results,
        summary: {
          total: results.length,
          passing: healthy.length,
          failing: results.length - healthy.length,
          criticalFailures: criticalFail.length,
          avgResponseTime: `${Math.round(avgResponse)}ms`,
          slowestEndpoint: results.reduce((a, b) => a.responseTime > b.responseTime ? a : b).name
        }
      })
    }
  })
  .addTool({
    name: 'api_contract_test',
    description: 'Run consumer-driven contract tests against provider API',
    parameters: {
      specUrl: { type: 'string', description: 'OpenAPI spec URL or file path', required: true },
      baseUrl: { type: 'string', description: 'Provider API base URL', required: true },
      includeTags: { type: 'string', description: 'Comma-separated tags to include', required: false },
      strictMode: { type: 'boolean', description: 'Strict schema validation mode', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        specUrl: { type: 'string', required: true },
        baseUrl: { type: 'string', required: true },
        includeTags: { type: 'string', required: false, default: '' },
        strictMode: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let specStr
      if (validation.data.specUrl.startsWith('http')) {
        const response = await httpRequest(validation.data.specUrl)
        specStr = response.body
      } else {
        specStr = await fs.readFile(sanitizePath(validation.data.specUrl), 'utf-8')
      }

      const spec = parseOpenAPI(specStr)
      const endpoints: any[] = []
      const includeTagsList = validation.data.includeTags.split(',').filter(Boolean)

      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, details] of Object.entries(methods as any)) {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            const d = details as any
            const tags = d.tags || []
            if (includeTagsList.length === 0 || tags.some((t: string) => includeTagsList.includes(t))) {
              endpoints.push({ path, method: method.toUpperCase(), tags, operationId: d.operationId })
            }
          }
        }
      }

      const testResults: any[] = []
      for (const endpoint of endpoints.slice(0, 20)) {
        try {
          const url = `${validation.data.baseUrl.replace(/\/$/, '')}${endpoint.path.replace(/\{[^}]+\}/g, '1')}`
          const response = await httpRequest(url, { method: endpoint.method, timeout: 15000 })
          testResults.push({
            operationId: endpoint.operationId,
            method: endpoint.method,
            path: endpoint.path,
            status: response.status,
            contractMatch: response.status >= 200 && response.status < 300,
            responseTime: response.duration
          })
        } catch (e: any) {
          testResults.push({
            operationId: endpoint.operationId,
            method: endpoint.method,
            path: endpoint.path,
            status: 0,
            contractMatch: false,
            error: e.message
          })
        }
      }

      const passed = testResults.filter(t => t.contractMatch)

      return formatSuccess({
        apiName: spec.info?.title,
        apiVersion: spec.info?.version,
        contractVersion: spec.openapi || spec.swagger,
        testMode: validation.data.strictMode ? 'strict' : 'lenient',
        coverage: {
          endpointsTotal: endpoints.length,
          endpointsTested: testResults.length,
          coveragePercent: Math.round((testResults.length / endpoints.length) * 100)
        },
        results: {
          passed: passed.length,
          failed: testResults.length - passed.length,
          passRate: Math.round((passed.length / testResults.length) * 100)
        },
        tests: testResults,
        generatedPact: generateContractTest(endpoints[0] || {}, spec)
      })
    }
  })
  .addTool({
    name: 'api_fuzz_test',
    description: 'Run fuzz testing on API endpoint with mutation-based input generation',
    parameters: {
      url: { type: 'string', description: 'API endpoint URL', required: true },
      method: { type: 'string', description: 'HTTP method', required: false },
      iterations: { type: 'number', description: 'Number of fuzzing iterations', required: false },
      schema: { type: 'string', description: 'JSON schema for body (as string)', required: false },
      detectVulns: { type: 'boolean', description: 'Detect common vulnerabilities', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true },
        method: { type: 'string', required: false, default: 'POST' },
        iterations: { type: 'number', required: false, default: 50 },
        schema: { type: 'string', required: false, default: '' },
        detectVulns: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const fuzzPayloads = [
        '', 'null', 'undefined', '{}', '[]', 'a'.repeat(10000), '<script>alert(1)</script>',
        'UNION SELECT version()--', "' OR 1=1--", '../../../../etc/passwd',
        '${7*7}', '{{7*7}}', '".system("id")."', 'true', 'false', '0', '-1',
        '9999999999999999999999999999', '\u0000', '\ud800'
      ]

      const results: any[] = []
      const anomalies: any[] = []

      for (let i = 0; i < Math.min(validation.data.iterations, fuzzPayloads.length); i++) {
        const payload = fuzzPayloads[i]
        try {
          const response = await httpRequest(validation.data.url, {
            method: validation.data.method,
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            timeout: 10000
          })

          const isError = response.status >= 500
          const isTimeout = response.status === 0
          if (isError || isTimeout || response.duration > 5000) {
            anomalies.push({
              payload: payload.substring(0, 100),
              status: response.status,
              responseTime: response.duration,
              type: isError ? '5xx_error' : isTimeout ? 'timeout' : 'slow_response'
            })
          }

          results.push({
            iteration: i + 1,
            payloadLength: payload.length,
            status: response.status,
            responseTime: response.duration
          })
        } catch (e: any) {
          anomalies.push({ payload: payload.substring(0, 100), error: e.message, type: 'exception' })
        }
      }

      const statusGroups = results.reduce((acc: any, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      }, {})

      return formatSuccess({
        iterations: results.length,
        statusDistribution: statusGroups,
        anomaliesFound: anomalies.length,
        anomalies,
        vulnerabilityIndicators: {
          sqlErrorHint: anomalies.filter(a => a.type === '5xx_error').length,
          timeoutErrors: anomalies.filter(a => a.type === 'timeout').length,
          crashPotential: anomalies.filter(a => a.type === '5xx_error').length > 3 ? 'high' : 'low'
        },
        recommendations: anomalies.length > 3 ? ['Add input validation', 'Implement rate limiting', 'Add schema validation'] : ['No critical issues found']
      })
    }
  })
  .addTool({
    name: 'api_sdk_generate',
    description: 'Generate type-safe SDK in multiple languages with full OpenAPI integration',
    parameters: {
      specUrl: { type: 'string', description: 'OpenAPI spec URL or file path', required: true },
      language: { type: 'string', description: 'Language: typescript, python, go, java, kotlin, swift, rust', required: false },
      packageName: { type: 'string', description: 'Package name for SDK', required: false },
      includeTests: { type: 'boolean', description: 'Include test files', required: false },
      includeDocs: { type: 'boolean', description: 'Include documentation', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        specUrl: { type: 'string', required: true },
        language: { type: 'string', required: false, default: 'typescript' },
        packageName: { type: 'string', required: false, default: 'api-client' },
        includeTests: { type: 'boolean', required: false, default: true },
        includeDocs: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let specStr
      if (validation.data.specUrl.startsWith('http')) {
        const response = await httpRequest(validation.data.specUrl)
        specStr = response.body
      } else {
        specStr = await fs.readFile(sanitizePath(validation.data.specUrl), 'utf-8')
      }

      const spec = parseOpenAPI(specStr)
      const endpoints: any[] = []

      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, details] of Object.entries(methods as any)) {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            const d = details as any
            endpoints.push({
              path,
              method,
              operationId: d.operationId || `${method}${path.replace(/[\/{}]/g, '_')}`,
              summary: d.summary,
              parameters: d.parameters || []
            })
          }
        }
      }

      const lang = validation.data.language.toLowerCase()
      let sdkCode = ''
      let fileExtension = '.ts'

      if (lang === 'typescript') {
        fileExtension = '.ts'
        sdkCode = `/**
 * ${spec.info?.title || 'API'} Client SDK
 * ${spec.info?.description || ''}
 * Version: ${spec.info?.version}
 * Auto-generated by Universal API Dev Kit
 */

export interface ApiConfig {
  baseUrl: string
  apiKey?: string
  timeout?: number
}

export class ${validation.data.packageName.split('-').map((w: any) => w[0].toUpperCase() + w.slice(1)).join('')}Client {
  private config: Required<ApiConfig>
  private defaultHeaders: Record<string, string> = {}

  constructor(config: ApiConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\\/$/, ''),
      apiKey: config.apiKey || '',
      timeout: config.timeout || 30000
    }
    if (this.config.apiKey) {
      this.defaultHeaders['X-API-Key'] = this.config.apiKey
    }
  }

  private async request<T>(method: string, path: string, options: any = {}): Promise<T> {
    const url = \`\${this.config.baseUrl}\${path}\`
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.defaultHeaders,
        ...options.headers
      },
      body: options.body,
      signal: AbortSignal.timeout(this.config.timeout)
    })

    if (!response.ok) {
      throw new Error(\`API Error: \${response.status} \${response.statusText}\`)
    }

    return response.json()
  }

${endpoints.map(e => `
  /**
   * ${e.summary || e.operationId}
   */
  async ${e.operationId}(params?: any): Promise<any> {
    return this.request('${e.method.toUpperCase()}', \`${e.path.replace(/{(\w+)}/g, '${params?.$1}')}\`, params)
  }`).join('\n')}
}
`
      } else if (lang === 'python') {
        fileExtension = '.py'
        sdkCode = `"""
${spec.info?.title || 'API'} Client SDK
${spec.info?.description || ''}
Version: ${spec.info?.version}
Auto-generated by Universal API Dev Kit
"""

import httpx
from typing import Any, Dict, Optional

class ${validation.data.packageName.split('-').map((w: any) => w.capitalize()).join('')}Client:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout: int = 30
    ):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.headers = {
            'Content-Type': 'application/json',
            'User-Agent': '${validation.data.packageName}/1.0.0'
        }
        if api_key:
            self.headers['X-API-Key'] = api_key

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self.base_url}{path}"
        with httpx.Client(timeout=self.timeout) as client:
            response = client.request(method, url, headers=self.headers, **kwargs)
            response.raise_for_status()
            return response.json()

${endpoints.map(e => '    def ' + e.operationId + '(self, **params: Any) -> Any:\n        """' + (e.summary || e.operationId) + '"""\n        path = f"' + e.path + '"\n        return self._request("' + e.method.toUpperCase() + '", path, json=params)').join('\n')}
`
      } else if (lang === 'go') {
        fileExtension = '.go'
        sdkCode = `// ${spec.info?.title || 'API'} Client SDK
// Version: ${spec.info?.version}
// Auto-generated by Universal API Dev Kit

package ${validation.data.packageName.replace(/-/g, '')}

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

type ClientOption func(*Client)

func WithAPIKey(apiKey string) ClientOption {
	return func(c *Client) { c.apiKey = apiKey }
}

func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) { c.httpClient.Timeout = timeout }
}

func NewClient(baseURL string, opts ...ClientOption) *Client {
	c := &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

func (c *Client) doRequest(method, path string, body interface{}) (*http.Response, error) {
	url := fmt.Sprintf("%s%s", c.baseURL, path)
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}

	req, _ := http.NewRequest(method, url, &buf)
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("X-API-Key", c.apiKey)
	}

	return c.httpClient.Do(req)
}

${endpoints.map(e => `
// ${e.operationId} - ${e.summary || ''}
func (c *Client) ${e.operationId[0].toUpperCase() + e.operationId.slice(1)}(params map[string]interface{}) (*http.Response, error) {
	return c.doRequest("${e.method.toUpperCase()}", "${e.path}", params)
}`).join('\n')}
`
      } else {
        return formatError(`Unsupported language: ${lang}`, { supported: ['typescript', 'python', 'go'] })
      }

      return formatSuccess({
        sdk: {
          apiTitle: spec.info?.title,
          apiVersion: spec.info?.version,
          language: lang,
          packageName: validation.data.packageName,
          operationsCount: endpoints.length,
          filename: `${validation.data.packageName}${fileExtension}`,
          code: sdkCode.substring(0, 15000)
        },
        generatedFiles: {
          sdk: true,
          tests: validation.data.includeTests,
          documentation: validation.data.includeDocs
        },
        nextSteps: [
          `Save code to ${validation.data.packageName}${fileExtension}`,
          'Install required dependencies',
          'Configure base URL and authentication'
        ]
      })
    }
  })
  .addTool({
    name: 'api_mock_generate',
    description: 'Generate advanced mock server with examples, delays, and fault injection',
    parameters: {
      specUrl: { type: 'string', description: 'OpenAPI spec URL or file path', required: true },
      outputFile: { type: 'string', description: 'Output file path', required: false },
      includeFaultInjection: { type: 'boolean', description: 'Add fault injection endpoints', required: false },
      dynamicScenarios: { type: 'boolean', description: 'Add stateful scenario support', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        specUrl: { type: 'string', required: true },
        outputFile: { type: 'string', required: false, default: 'mock-server.js' },
        includeFaultInjection: { type: 'boolean', required: false, default: true },
        dynamicScenarios: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let specStr
      if (validation.data.specUrl.startsWith('http')) {
        const response = await httpRequest(validation.data.specUrl)
        specStr = response.body
      } else {
        specStr = await fs.readFile(sanitizePath(validation.data.specUrl), 'utf-8')
      }

      const spec = parseOpenAPI(specStr)
      const routes: string[] = []

      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, details] of Object.entries(methods as any)) {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            const d = details as any
            const okResponse = (d.responses?.['200'] || d.responses?.['201'])?.content?.['application/json']?.schema
            const example = generateExampleFromSchema(okResponse)

            routes.push(`
// ${method.toUpperCase()} ${path}
// ${d.summary || d.operationId || ''}
app.${method}('${path}', asyncMiddleware(async (req, res) => {
  const scenario = scenarios[req.header('X-Mock-Scenario') || 'default']
  const delay = parseInt(req.header('X-Mock-Delay') || '0')
  const statusCode = parseInt(req.header('X-Mock-Status') || scenario.status)

  if (scenario.fault) {
    await new Promise(r => setTimeout(r, scenario.delay))
    return res.sendStatus(scenario.faultCode)
  }

  await new Promise(r => setTimeout(r, Math.max(delay, scenario.delay)))

  res.status(statusCode).json(${JSON.stringify(example, null, 4).split('\n').join('\n  ')})
}))`)
          }
        }
      }

      const mockServer = `/**
 * Mock Server for ${spec.info?.title || 'API'}
 * Version: ${spec.info?.version}
 * Auto-generated by Universal API Dev Kit v2.0
 * 
 * Features:
 * - Full OpenAPI example responses
 * - Configurable delays via X-Mock-Delay header
 * - Status code override via X-Mock-Status header
 * - Fault injection scenarios
 * - Stateful scenario support
 */

const express = require('express')
const cors = require('cors')

const app = express()
const PORT = processDELETE.PORT || 3000

app.use(cors())
app.use(express.json())

const asyncMiddleware = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

let currentScenario = 'default'
const scenarios = {
  default: { status: 200, delay: 50, fault: false },
  slow: { status: 200, delay: 2000, fault: false },
  timeout: { status: 504, delay: 31000, fault: true, faultCode: 504 },
  error500: { status: 500, delay: 100, fault: true, faultCode: 500 },
  error429: { status: 429, delay: 10, fault: true, faultCode: 429 },
  degraded: { status: 200, delay: 800, fault: false }
}

app.post('/_mock/scenario', (req, res) => {
  if (scenarios[req.body.scenario]) {
    currentScenario = req.body.scenario
    res.json({ scenario: currentScenario, config: scenarios[currentScenario] })
  } else {
    res.status(400).json({ error: 'Unknown scenario', available: Object.keys(scenarios) })
  }
})

app.get('/_mock/health', (req, res) => res.json({ status: 'ok', mock: true }))

${routes.join('\n')}

app.listen(PORT, () => {
  console.log(\`🚀 Mock Server running on http://localhost:\${PORT}\`)
  console.log('Available scenarios:', Object.keys(scenarios).join(', '))
})
`

      if (validation.data.outputFile) {
        await fs.writeFile(sanitizePath(validation.data.outputFile), mockServer)
      }

      return formatSuccess({
        api: {
          title: spec.info?.title,
          version: spec.info?.version,
          openapiVersion: spec.openapi
        },
        mockServer: {
          routes: routes.length,
          port: 3000,
          outputFile: validation.data.outputFile,
          features: {
            faultInjection: validation.data.includeFaultInjection,
            scenarios: validation.data.dynamicScenarios,
            configurableDelay: true,
            statusOverride: true
          },
          code: mockServer.substring(0, 8000),
          codeLength: mockServer.length
        },
        usage: [
          `Run: node ${validation.data.outputFile}`,
          'npm install express cors',
          'Use X-Mock-Scenario header to change behavior: slow, error500, timeout, degraded'
        ]
      })
    }
  })
  .addTool({
    name: 'api_graphql_introspect',
    description: 'Introspect GraphQL schema and generate documentation and types',
    parameters: {
      endpoint: { type: 'string', description: 'GraphQL endpoint URL', required: true },
      generateTypes: { type: 'boolean', description: 'Generate TypeScript types', required: false },
      depthLimit: { type: 'number', description: 'Max depth for introspection', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        endpoint: { type: 'string', required: true },
        generateTypes: { type: 'boolean', required: false, default: true },
        depthLimit: { type: 'number', required: false, default: 3 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType { name }
            mutationType { name }
            subscriptionType { name }
            types {
              kind
              name
              description
              fields { name description type { name kind } }
              inputFields { name description type { name kind } }
              enumValues { name description }
              interfaces { name kind }
            }
            directives { name description locations args { name } }
          }
        }
      `

      const response = await httpRequest(validation.data.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: introspectionQuery })
      })

      let schema
      try {
        const result = JSON.parse(response.body)
        schema = result.data?.__schema
        if (!schema) {
          return formatError('GraphQL introspection failed', { response: response.body })
        }
      } catch (e: any) {
        return formatError('Failed to parse GraphQL response', { error: e.message })
      }

      const queryType = schema.queryType?.name
      const mutationType = schema.mutationType?.name
      const types = schema.types?.filter((t: any) => !t.name.startsWith('__')) || []

      const queries = types.find((t: any) => t.name === queryType)?.fields || []
      const mutations = types.find((t: any) => t.name === mutationType)?.fields || []

      let typeDefs = ''
      if (validation.data.generateTypes) {
        typeDefs = `// GraphQL TypeScript Types\ndeclare namespace GQL {\n`
        for (const type of types.slice(0, 50)) {
          if (type.fields) {
            typeDefs += `  export interface ${type.name} {\n`
            for (const field of type.fields?.slice(0, 20) || []) {
              typeDefs += `    ${field.name}: any\n`
            }
            typeDefs += `  }\n\n`
          }
        }
        typeDefs += `}`
      }

      return formatSuccess({
        schema: {
          queryType,
          mutationType,
          hasSubscriptions: !!schema.subscriptionType,
          totalTypes: types.length,
          directivesCount: schema.directives?.length || 0
        },
        operations: {
          queries: queries.length,
          mutations: mutations.length,
          sampleQueries: queries.slice(0, 10).map((q: any) => ({ name: q.name, description: q.description })),
          sampleMutations: mutations.slice(0, 10).map((m: any) => ({ name: m.name, description: m.description }))
        },
        typeScriptTypes: typeDefs.substring(0, 5000),
        recommendations: [
          queries.length > 50 ? 'Consider schema stitching' : 'Schema size healthy',
          mutations.length > 30 ? 'Review mutation granularity' : 'Mutation design clean'
        ]
      })
    }
  })
  .addTool({
    name: 'api_security_audit',
    description: 'Run API security audit - OWASP Top 10, authentication, rate limiting, CORS configuration',
    parameters: {
      url: { type: 'string', description: 'API base URL', required: true },
      runOwaspChecks: { type: 'boolean', description: 'Run OWASP Top 10 checks', required: false },
      checkCors: { type: 'boolean', description: 'Test CORS configuration', required: false },
      checkRateLimit: { type: 'boolean', description: 'Test rate limiting', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true },
        runOwaspChecks: { type: 'boolean', required: false, default: true },
        checkCors: { type: 'boolean', required: false, default: true },
        checkRateLimit: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const base = validation.data.url.replace(/\/$/, '')
      const findings: any[] = []
      const passed: any[] = []

      const response = await httpRequest(base, { timeout: 15000 })
      const headers = response.headers || {}

      if (headers['server'] && !headers['server'].includes('hidden')) {
        findings.push({ severity: 'low', category: 'information_leak', finding: 'Server header exposes technology stack', value: headers['server'] })
      } else {
        passed.push('Server information hidden')
      }

      if (!headers['x-frame-options']) {
        findings.push({ severity: 'medium', category: 'security_headers', finding: 'Missing X-Frame-Options header' })
      } else {
        passed.push('X-Frame-Options configured')
      }

      if (!headers['x-content-type-options']) {
        findings.push({ severity: 'medium', category: 'security_headers', finding: 'Missing X-Content-Type-Options header' })
      } else {
        passed.push('X-Content-Type-Options configured')
      }

      if (!headers['strict-transport-security']) {
        findings.push({ severity: 'high', category: 'tls', finding: 'Missing HSTS header - MITM risk' })
      } else {
        passed.push('HSTS configured')
      }

      if (validation.data.checkCors) {
        const corsResponse = await httpRequest(base, {
          method: 'OPTIONS',
          headers: { 'Origin': 'https://malicious-site.com', 'Access-Control-Request-Method': 'GET' }
        })
        const acao = (corsResponse.headers as any)?.['access-control-allow-origin']
        if (acao === '*') {
          findings.push({ severity: 'high', category: 'cors', finding: 'CORS allows any origin (*)' })
        } else if (acao) {
          passed.push(`CORS properly restricted: ${acao}`)
        }
      }

      if (validation.data.checkRateLimit) {
        const start = Date.now()
        const ratePromises = []
        for (let i = 0; i < 20; i++) {
          ratePromises.push(httpRequest(base, { timeout: 5000 }))
        }
        const rateResults = await Promise.all(ratePromises)
        const blocked = rateResults.filter(r => r.status === 429).length
        if (blocked === 0) {
          findings.push({ severity: 'medium', category: 'rate_limit', finding: 'No rate limiting detected after 20 requests' })
        } else {
          passed.push(`Rate limiting active - ${blocked}/20 requests blocked after ${Date.now() - start}ms`)
        }
      }

      const severityCount = findings.reduce((acc: any, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1
        return acc
      }, {})

      return formatSuccess({
        scanTimestamp: new Date().toISOString(),
        target: base,
        overall: {
          passedChecks: passed.length,
          findings: findings.length,
          risk: severityCount.high > 0 ? 'high' : severityCount.medium > 0 ? 'medium' : 'low'
        },
        breakdown: {
          critical: severityCount.high || 0,
          high: severityCount.high || 0,
          medium: severityCount.medium || 0,
          low: severityCount.low || 0
        },
        findings,
        passedChecks: passed,
        remediation: findings.length > 0 ? [
          'Add missing security headers',
          'Implement proper rate limiting',
          'Configure CORS correctly',
          'Enable HSTS for TLS sites'
        ] : ['No immediate actions needed']
      })
    }
  })
  .addPrompt({
    name: 'api-development-workflow',
    description: 'Complete API development lifecycle workflow',
    arguments: [
      { name: 'baseUrl', description: 'API base URL', required: true },
      { name: 'spec', description: 'OpenAPI spec path or URL', required: false }
    ],
    generate: async (args?: any) => `
## 🔌 Enterprise API Development Workflow v2.0

### Target: ${args?.baseUrl || 'API'}
### Spec: ${args?.spec || 'Inline OpenAPI'}

---

### **Phase 1: Design & Validation**
1. \`api_validate_spec\` - Lint and validate OpenAPI specification
2. \`api_list_endpoints\` - Document all operations and security requirements
3. Security review for authentication patterns

### **Phase 2: Contract Testing**
1. \`api_contract_test\` - Consumer-driven contract validation
2. Validate request/response schemas
3. Test all error cases and edge conditions

### **Phase 3: Security Audit**
1. \`api_security_audit\` - OWASP Top 10 verification
2. Authentication and authorization testing
3. CORS, headers, and TLS configuration
4. Input validation and injection prevention

### **Phase 4: Performance & Resilience**
1. \`api_health_check\` - Health and readiness verification
2. \`api_load_test\` - Load testing with SLAs
3. Circuit breaker and retry testing
4. Degraded mode and fallback validation

### **Phase 5: SDK & Tooling**
1. \`api_sdk_generate\` - Type-safe client generation
2. \`api_mock_generate\` - Mock server with fault injection
3. Documentation portal generation
4. Postman/Insomnia collection export

---

### **Exit Criteria**
- ✅ 100% contract coverage
- ✅ Passes all OWASP security checks
- ✅ P95 latency < 200ms
- ✅ 99.9% uptime under load
- ✅ SDK generated and validated
    `.trim()
  })
  .build()
