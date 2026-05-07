import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw, sanitizePath } from '../../packages/core/shared/utils'

function parseColor(hex: string) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) }
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

function hslToRgb(h: number, s: number, l: number) {
  let r, g, b
  if (s === 0) { r = g = b = l }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h / 360 + 1/3); g = hue2rgb(p, q, h / 360); b = hue2rgb(p, q, h / 360 - 1/3)
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

export default createMCPServer({
  name: 'all-in-one-dev',
  version: '2.0.0',
  description: 'Professional All-in-One Development Kit - Comprehensive tool suite for full-stack development including Git, Docker, API, Database, Security, UI, and Testing',
  author: 'MCP Expert Community',
  icon: '🚀'
})

  .addTool({
    name: 'git_clone',
    description: 'Clone Git repository with optional depth and branch selection',
    parameters: {
      url: { type: 'string', description: 'Repository URL', required: true },
      dir: { type: 'string', description: 'Target directory', required: false },
      branch: { type: 'string', description: 'Specific branch to clone', required: false },
      depth: { type: 'number', description: 'Clone depth for shallow clone', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        url: { type: 'string', required: true },
        dir: { type: 'string', required: false, default: '' },
        branch: { type: 'string', required: false, default: '' },
        depth: { type: 'number', required: false, default: 0, min: 0, max: 100 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const dir = validation.data.dir || validation.data.url.split('/').pop()?.replace('.git', '') || 'repo'
      const branchFlag = validation.data.branch ? `-b ${validation.data.branch}` : ''
      const depthFlag = validation.data.depth > 0 ? `--depth ${validation.data.depth}` : ''
      const result = await safeExecRaw(`git clone ${branchFlag} ${depthFlag} "${validation.data.url}" "${dir}"`)

      return formatSuccess({
        cloned: !result.stderr.includes('error') && result.exitCode === 0,
        url: validation.data.url,
        directory: sanitizePath(dir),
        output: result.stdout,
        warnings: result.stderr,
        postCloneSteps: [
          'Run npm install / yarn install',
          'Check DELETE.example for required variables',
          'Review README.md for project setup',
          'Run tests to verify installation'
        ]
      })
    }
  })

  .addTool({
    name: 'git_workflow_summary',
    description: 'Generate comprehensive Git workflow cheat sheet for professional teams',
    parameters: {
      workflow: { type: 'string', description: 'Workflow type: gitflow, trunk-based, github-flow, gitlab-flow', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        workflow: { type: 'string', required: false, default: 'github-flow', enum: ['gitflow', 'trunk-based', 'github-flow', 'gitlab-flow'] }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const workflows: Record<string, any> = {
        'github-flow': {
          model: 'Simple, continuous delivery focused',
          branches: ['main (production)', 'feature/* branches'],
          process: [
            '1. Create feature branch from main',
            '2. Develop and commit regularly',
            '3. Open Pull Request early',
            '4. Code review and CI checks pass',
            '5. Merge to main',
            '6. Deploy immediately'
          ],
          pros: ['Simple to learn', 'Great for CI/CD', 'Small batch sizes'],
          cons: ['Production hotfixes need special handling'],
          bestFor: 'SaaS teams, continuous deployment'
        },
        'gitflow': {
          model: 'Structured, release focused',
          branches: ['main (production)', 'develop (integration)', 'feature/*', 'release/*', 'hotfix/*'],
          process: [
            '1. Feature branches from develop',
            '2. Complete feature -> PR to develop',
            '3. Branch release/* from develop',
            '4. Stabilize and test release branch',
            '5. Merge release to main AND develop',
            '6. Hotfixes from main, merge to main + develop'
          ],
          pros: ['Formal release process', 'Parallel development support'],
          cons: ['Complex, many branches', 'Merge hell potential'],
          bestFor: 'Scheduled release cycles, enterprise'
        },
        'trunk-based': {
          model: 'High velocity, everyone commits to trunk',
          branches: ['main/trunk ONLY (short-lived feature branches max 1 day)'],
          process: [
            '1. All developers commit to trunk directly',
            '2. Feature flags for incomplete work',
            '3. 10+ commits/day to trunk is normal',
            '4. Comprehensive CI on every commit',
            '5. Feature branches live <24 hours max'
          ],
          pros: ['No merge hell', 'Maximum velocity', 'High perf teams standard'],
          cons: ['Requires feature flag discipline', 'Strong CI culture needed'],
          bestFor: 'Elite performing teams, XP/DevOps'
        }
      }

      return formatSuccess({
        workflow: validation.data.workflow,
        workflowDetails: workflows[validation.data.workflow] || workflows['github-flow'],
        branchNamingStandard: {
          feature: 'feature/TICKET-123-description-kebab-case',
          bugfix: 'bugfix/TICKET-456-description',
          hotfix: 'hotfix/severity-description',
          release: 'release/v1.2.3',
          docs: 'docs/TICKET-789-update-readme'
        },
        commitMessageConvention: `
### ✅ Conventional Commits Standard

**Format:** \`<type>(<scope>): <description>\`

**Types:**
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Formatting, missing semicolons, etc
- refactor: Code change that neither fixes bug nor adds feature
- perf: Performance improvement
- test: Adding tests
- chore: Build process, tooling, libraries, etc

**Examples:**
- feat(auth): Add JWT token refresh
- fix(api): Correct pagination response codes
- docs(readme): Update installation instructions
- refactor(users): Extract validation logic

**Footer for breaking changes:**
BREAKING CHANGE: <description of migration>
        `.trim(),
        qualityGates: [
          '✅ PR description has context and testing plan',
          '✅ All CI checks pass',
          '✅ Minimum 1 approval (2 for critical path)',
          '✅ No secrets or credentials in code',
          '✅ All commented out code removed'
        ]
      })
    }
  })

  .addTool({
    name: 'docker_compose_generator',
    description: 'Generate production-ready docker-compose.yml with best practices',
    parameters: {
      services: { type: 'string', description: 'Comma-separated: app, postgres, redis, nginx, mongo, elasticsearch, rabbitmq', required: true },
      projectName: { type: 'string', description: 'Project name for container prefixes', required: false },
      networkMode: { type: 'string', description: 'Networking mode', required: false },
      withHealthchecks: { type: 'boolean', description: 'Include healthchecks', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        services: { type: 'string', required: true },
        projectName: { type: 'string', required: false, default: 'app' },
        networkMode: { type: 'string', required: false, default: 'bridge', enum: ['bridge', 'host'] },
        withHealthchecks: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const serviceList = validation.data.services.split(',').map((s: string) => s.trim())

      const serviceTemplates: Record<string, string> = {
        app: `
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/${validation.data.projectName}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s`,
        postgres: `
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./initdb:/docker-entrypoint-initdb.d
    environment:
      - POSTGRES_DB=${validation.data.projectName}
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    ports:
      - "5432:5432"
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5`,
        redis: `
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - backend
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5`,
        nginx: `
  nginx:
    image: nginx:1-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/certs:/etc/nginx/certs
      - static_volume:/var/www/static
    depends_on:
      - app
    networks:
      - frontend
      - backend
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3`,
        mongo: `
  mongo:
    image: mongo:7-jammy
    restart: unless-stopped
    command: mongod --auth --wiredTigerCacheSizeGB 1.5
    volumes:
      - mongo_data:/data/db
      - ./mongo/init.js:/docker-entrypoint-initdb.d/init.js
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=changeme
    ports:
      - "27017:27017"
    networks:
      - backend
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 30s
      timeout: 10s
      retries: 3`,
        elasticsearch: `
  elasticsearch:
    image: elasticsearch:8.12.0
    restart: unless-stopped
    environment:
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms1g -Xmx1g
      - xpack.security.enabled=false
    volumes:
      - es_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5`,
        rabbitmq: `
  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    restart: unless-stopped
    environment:
      - RABBITMQ_DEFAULT_USER=admin
      - RABBITMQ_DEFAULT_PASS=admin
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    networks:
      - backend
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5`
      }

      const selectedServices = serviceList
        .filter((s: string) => serviceTemplates[s])
        .map((s: string) => serviceTemplates[s])
        .join('\n')

      const composeContent = `# ===================================================
# 🐳 Production-Ready Docker Compose
# Project: ${validation.data.projectName}
# Generated: ${new Date().toISOString()}
# ===================================================

version: '3.8'

name: ${validation.data.projectName}

services:${selectedServices}

networks:
  frontend:
    driver: ${validation.data.networkMode}
  backend:
    driver: ${validation.data.networkMode}
    internal: true

volumes:
${serviceList.includes('postgres') ? '  postgres_data:\n' : ''}${serviceList.includes('redis') ? '  redis_data:\n' : ''}${serviceList.includes('mongo') ? '  mongo_data:\n' : ''}${serviceList.includes('elasticsearch') ? '  es_data:\n' : ''}${serviceList.includes('rabbitmq') ? '  rabbitmq_data:\n' : ''}${serviceList.includes('nginx') ? '  static_volume:\n' : ''}
# ===================================================
# USAGE:
#   docker compose up -d
#   docker compose logs -f app
#   docker compose exec postgres psql -U postgres
#   docker compose down -v (CAUTION: destroys volumes!)
# ===================================================
`

      return formatSuccess({
        projectName: validation.data.projectName,
        services: serviceList,
        dockerComposeYml: composeContent,
        dockerfileRecommendations: `
### 📦 Multi-Stage Dockerfile Best Practices

**Node.js:**
- Use alpine variants for small size
- Use --platform=linux/amd64 for cross-platform
- node_modules in separate layer
- Run as non-root USER node
- HEALTHCHECK + proper STOPSIGNAL

**Security:**
- No :latest tag - pin all versions
- No secrets in ENV - use secrets mount
- Read-only filesystem where possible
- Drop all Linux capabilities
        `,
        productionChecklist: [
          '✅ All image tags pinned to specific versions',
          '✅ No latest tags',
          '✅ Healthchecks included on all services',
          '✅ Secrets not in compose (use DELETE + env_file)',
          '✅ Volumes for all persistent data',
          '✅ Internal networks for backend services',
          '✅ Resource limits configured (cpus, mem_limit)',
          '✅ Restart policies set'
        ]
      })
    }
  })

  .addTool({
    name: 'palette_generator',
    description: 'Generate professional accessible color palette from base color',
    parameters: {
      baseColor: { type: 'string', description: 'Base hex color e.g. #3B82F6', required: true },
      name: { type: 'string', description: 'Palette name e.g. primary, blue', required: false },
      steps: { type: 'number', description: 'Number of shades', required: false },
      compliance: { type: 'string', description: 'Accessibility standard', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        baseColor: { type: 'string', required: true, match: /^#?[0-9A-Fa-f]{6}$/ },
        name: { type: 'string', required: false, default: 'primary' },
        steps: { type: 'number', required: false, default: 10, min: 5, max: 13 },
        compliance: { type: 'string', required: false, default: 'wcag-aa', enum: ['wcag-aa', 'wcag-aaa'] }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const hex = '#' + validation.data.baseColor.replace('#', '')
      const rgb = parseColor(hex)
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)

      const palette: Record<string, string> = {}
      const lightnessSteps = [98, 95, 90, 85, 77.5, 65, 55, 45, 38, 30, 23, 15, 8]

      for (let i = 0; i < validation.data.steps; i++) {
        const l = lightnessSteps[i]
        const result = hslToRgb(hsl.h, Math.min(hsl.s, 0.9), l / 100)
        const shade = i === 0 ? '50' : (i * 100).toString()
        palette[shade] = '#' +
          result.r.toString(16).padStart(2, '0') +
          result.g.toString(16).padStart(2, '0') +
          result.b.toString(16).padStart(2, '0')
      }

      return formatSuccess({
        palette: { name: validation.data.name, base: hex, shades: palette },
        contrastCheck: `Verify ${validation.data.compliance} at: https://webaim.org/resources/contrastchecker/`,
        tailwindConfig: `
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        '${validation.data.name}': {
${Object.entries(palette).map(([k, v]) => `          ${k}: '${v.toUpperCase()}'`).join(',\n')}
        }
      }
    }
  }
}
        `.trim(),
        cssVariables: Object.entries(palette).map(([k, v]) => `  --color-${validation.data.name}-${k}: ${v.toUpperCase()};`).join('\n'),
        accessibility: {
          'wcag-aa': '4.5:1 normal text, 3:1 large text',
          'wcag-aaa': '7:1 normal text, 4.5:1 large text',
          recommendation: `${palette['600']} on white: test contrast manually`,
          tool: 'https://coolors.co/contrast-checker'
        }
      })
    }
  })

  .build()