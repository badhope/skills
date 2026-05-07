import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as https from 'https'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

async function safeExec(cmd: string, options: any = {}): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 60000, ...options })
    return String(stdout || stderr || '').trim()
  } catch (e: any) {
    return String(e.stdout || e.stderr || e.message || '').trim()
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

function calculatePackageHealth(info: any): { score: number; factors: Record<string, number> } {
  const factors: Record<string, number> = {}
  
  factors.maintainers = Math.min((info.maintainersCount || 0) * 10, 20)
  factors.age = info.time ? 15 : 5
  factors.dependencies = info.dependenciesCount < 20 ? 10 : info.dependenciesCount < 50 ? 5 : 0
  factors.license = info.license && !info.license.includes('GPL') && !info.license.includes('Unknown') ? 10 : 5
  factors.repository = info.repository ? 10 : 0
  factors.keywords = (info.keywords?.length || 0) > 3 ? 5 : 2
  factors.homepage = info.homepage ? 10 : 0
  factors.bugs = info.bugs ? 5 : 0
  
  const score = Object.values(factors).reduce((a, b) => a + b, 0)
  
  return { score, factors }
}

async function getNpmPackageInfo(packageName: string): Promise<any> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
  try {
    const data = await httpsGet(url)
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function getPyPiPackageInfo(packageName: string): Promise<any> {
  const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`
  try {
    const data = await httpsGet(url)
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function checkVulnerabilitiesNpm(): Promise<any> {
  const result = await safeExec('npm audit --json 2>/dev/null || echo "{}"')
  try {
    return JSON.parse(result)
  } catch {
    return { raw: result }
  }
}

async function detectPackageManager(): Promise<string[]> {
  const detected: string[] = []
  try {
    await fs.access('package.json')
    detected.push('npm')
  } catch {}
  try {
    await fs.access('requirements.txt')
    detected.push('pip')
  } catch {}
  try {
    await fs.access('pyproject.toml')
    detected.push('poetry')
  } catch {}
  try {
    await fs.access('go.mod')
    detected.push('go')
  } catch {}
  return detected
}

const LICENSE_COMPATIBILITY: Record<string, string[]> = {
  'MIT': ['MIT', 'BSD', 'Apache', 'ISC', 'LGPL', 'Proprietary'],
  'BSD': ['MIT', 'BSD', 'Apache', 'ISC', 'LGPL', 'Proprietary'],
  'Apache-2.0': ['MIT', 'BSD', 'Apache', 'ISC', 'LGPL', 'Proprietary'],
  'ISC': ['MIT', 'BSD', 'Apache', 'ISC', 'LGPL', 'Proprietary'],
  'GPL-3.0': ['GPL', 'LGPL'],
  'GPL-2.0': ['GPL', 'LGPL'],
  'LGPL': ['MIT', 'BSD', 'Apache', 'ISC', 'LGPL'],
  'AGPL': ['AGPL'],
  'MPL': ['MIT', 'BSD', 'Apache', 'ISC', 'MPL', 'LGPL']
}

function getLicenseRisk(license: string): { level: string; score: number; description: string } {
  const riskMap: Record<string, { level: string; score: number; description: string }> = {
    'MIT': { level: 'Low', score: 10, description: 'Permissive - Safe for commercial use' },
    'BSD': { level: 'Low', score: 10, description: 'Permissive - Safe for commercial use' },
    'Apache-2.0': { level: 'Low', score: 10, description: 'Permissive with patent grant' },
    'ISC': { level: 'Low', score: 10, description: 'Permissive - Simplified MIT' },
    'LGPL': { level: 'Medium', score: 6, description: 'Weak copyleft - Dynamic linking allowed' },
    'MPL': { level: 'Medium', score: 6, description: 'File-level copyleft' },
    'GPL': { level: 'High', score: 3, description: 'Strong copyleft - Derivative works must be GPL' },
    'AGPL': { level: 'High', score: 2, description: 'Network copyleft - SaaS use requires source' },
    'CC0': { level: 'Low', score: 10, description: 'Public domain equivalent' },
    'Unlicense': { level: 'Low', score: 10, description: 'Public domain' },
    'Unknown': { level: 'Critical', score: 0, description: 'Unknown license - High legal risk' },
    'Proprietary': { level: 'Medium', score: 5, description: 'Proprietary - Check license terms' }
  }
  
  for (const [key, value] of Object.entries(riskMap)) {
    if (license && license.includes(key)) {
      return value
    }
  }
  return { level: 'Unknown', score: 5, description: 'Unclassified license' }
}

export default createMCPServer({
  name: 'library-manager',
  version: '2.0.0',
  description: 'Professional Library & Dependency Management Toolkit - Package intelligence, security scanning, license compliance, dependency visualization, and health analytics',
  author: 'MCP Expert Community',
  icon: '📦'
})
  .addTool({
    name: 'lib_search_npm',
    description: 'Search and analyze npm packages with health scoring, quality metrics, and adoption statistics',
    parameters: {
      query: { type: 'string', description: 'Search query or package name', required: true },
      sortBy: { type: 'string', description: 'Sort by: popularity, quality, maintenance, relevance, health' },
      limit: { type: 'number', description: 'Number of results (default 10)', required: false },
      exactMatch: { type: 'boolean', description: 'Return only exact match package details', required: false },
      includeHealth: { type: 'boolean', description: 'Include health score analysis', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        query: { type: 'string', required: true },
        sortBy: { type: 'string', required: false, default: 'relevance' },
        limit: { type: 'number', required: false, default: 10 },
        exactMatch: { type: 'boolean', required: false, default: false },
        includeHealth: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (validation.data.exactMatch) {
        const pkg = await getNpmPackageInfo(validation.data.query)
        if (!pkg) return formatError('Package not found in npm registry')
        
        const latest = pkg['dist-tags']?.latest
        const info = pkg.versions?.[latest] || {}
        const maintainersCount = pkg.maintainers?.length || 0
        const dependenciesCount = Object.keys(info.dependencies || {}).length
        
        const health = validation.data.includeHealth ? calculatePackageHealth({
          maintainersCount,
          time: pkg.time?.[latest],
          dependenciesCount,
          license: info.license || pkg.license,
          repository: pkg.repository?.url,
          homepage: pkg.homepage,
          bugs: pkg.bugs?.url,
          keywords: pkg.keywords
        }) : null
        
        return formatSuccess({
          packageManager: 'npm',
          name: pkg.name,
          description: pkg.description,
          latestVersion: latest,
          license: info.license || pkg.license,
          licenseRisk: getLicenseRisk(info.license || pkg.license),
          author: pkg.author,
          keywords: pkg.keywords || [],
          repository: pkg.repository?.url,
          homepage: pkg.homepage,
          bugs: pkg.bugs?.url,
          lastPublished: pkg.time?.[latest],
          maintainersCount,
          dependenciesCount,
          devDependenciesCount: Object.keys(info.devDependencies || {}).length,
          peerDependenciesCount: Object.keys(info.peerDependencies || {}).length,
          healthScore: health?.score,
          healthFactors: health?.factors,
          distTags: pkg['dist-tags'],
          availableVersions: Object.keys(pkg.versions || {}).slice(-20).reverse()
        })
      }

      const limit = Math.min(validation.data.limit, 50)
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(validation.data.query)}&size=${limit}`
      const data = await httpsGet(url)
      
      try {
        const result = JSON.parse(data)
        let packages = result.objects?.map((obj: any) => ({
          name: obj.package.name,
          version: obj.package.version,
          description: obj.package.description?.substring(0, 200),
          author: obj.package.author?.name,
          keywords: obj.package.keywords?.slice(0, 8) || [],
          date: obj.package.date,
          links: obj.package.links,
          publisher: obj.package.publisher?.username,
          finalScore: obj.score?.final,
          popularityScore: obj.score?.detail?.popularity,
          qualityScore: obj.score?.detail?.quality,
          maintenanceScore: obj.score?.detail?.maintenance,
          communityScore: obj.score?.detail?.community,
          healthScore: Math.round(((obj.score?.final || 0) * 50) + 50)
        })) || []

        const sortKey = validation.data.sortBy
        if (sortKey === 'popularity') {
          packages.sort((a: any, b: any) => b.popularityScore - a.popularityScore)
        } else if (sortKey === 'quality') {
          packages.sort((a: any, b: any) => b.qualityScore - a.qualityScore)
        } else if (sortKey === 'maintenance') {
          packages.sort((a: any, b: any) => b.maintenanceScore - a.maintenanceScore)
        } else if (sortKey === 'health') {
          packages.sort((a: any, b: any) => b.healthScore - a.healthScore)
        }

        return formatSuccess({
          query: validation.data.query,
          packageManager: 'npm',
          totalResults: result.total,
          returnedResults: packages.length,
          sortBy: sortKey,
          packages: packages.slice(0, limit)
        })
      } catch (e) {
        return formatError('npm search failed', e)
      }
    }
  })
  .addTool({
    name: 'lib_search_pypi',
    description: 'Search and analyze PyPI Python packages with metadata and quality assessment',
    parameters: {
      query: { type: 'string', description: 'Search query or package name', required: true },
      exactMatch: { type: 'boolean', description: 'Return only exact match package details', required: false },
      includeReleases: { type: 'boolean', description: 'Include recent releases history', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        query: { type: 'string', required: true },
        exactMatch: { type: 'boolean', required: false, default: false },
        includeReleases: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (validation.data.exactMatch) {
        const pkg = await getPyPiPackageInfo(validation.data.query)
        if (!pkg || !pkg.info) return formatError('Package not found in PyPI registry')
        
        return formatSuccess({
          packageManager: 'pypi',
          name: pkg.info.name,
          version: pkg.info.version,
          summary: pkg.info.summary,
          description: pkg.info.description?.substring(0, 1000),
          author: pkg.info.author,
          authorEmail: pkg.info.author_email,
          license: pkg.info.license,
          licenseRisk: getLicenseRisk(pkg.info.license),
          homePage: pkg.info.home_page,
          keywords: pkg.info.keywords,
          classifiers: pkg.info.classifiers || [],
          requiresDist: pkg.info.requires_dist?.slice(0, 30) || [],
          projectUrls: pkg.info.project_urls,
          requiresPython: pkg.info.requires_python,
          totalReleases: Object.keys(pkg.releases || {}).length,
          recentReleases: validation.data.includeReleases ? 
            Object.entries(pkg.releases || {}).slice(-10).reverse().map(([v, files]: [string, any]) => ({
              version: v,
              uploadTime: files?.[0]?.upload_time,
              downloads: files?.length || 0
            })) : undefined,
          releaseUrls: pkg.urls?.slice(0, 5).map((u: any) => ({
            filename: u.filename,
            packagetype: u.packagetype,
            pythonVersion: u.python_version,
            size: u.size,
            md5Digest: u.md5_digest
          })) || []
        })
      }

      const url = `https://pypi.org/search/?q=${encodeURIComponent(validation.data.query)}`
      const data = await httpsGet(url)
      
      const regex = /<a class="package-snippet__name"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span class="package-snippet__version">([\s\S]*?)<\/span>[\s\S]*?<p class="package-snippet__description">([\s\S]*?)<\/p>[\s\S]*?<span class="package-snippet__released">([\s\S]*?)<\/span>/g
      const packages: any[] = []
      let match

      while ((match = regex.exec(data)) !== null && packages.length < 30) {
        packages.push({
          name: match[1].trim(),
          version: match[2].trim(),
          description: match[3].trim(),
          released: match[4].trim()
        })
      }

      return formatSuccess({
        query: validation.data.query,
        packageManager: 'pypi',
        totalFound: packages.length,
        packages
      })
    }
  })
  .addTool({
    name: 'lib_vulnerability_scan',
    description: 'Comprehensive dependency vulnerability scanning with severity filtering and remediation guidance',
    parameters: {
      packageManager: { type: 'string', description: 'Package manager: npm, yarn, pip, poetry, go, auto' },
      severity: { type: 'string', description: 'Minimum severity: critical, high, moderate, low' },
      fix: { type: 'boolean', description: 'Attempt to auto-fix vulnerabilities', required: false },
      includeCvss: { type: 'boolean', description: 'Include CVSS scores where available', required: false },
      outputFormat: { type: 'string', description: 'Output format: summary, detailed, json', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        packageManager: { type: 'string', required: false, default: 'auto' },
        severity: { type: 'string', required: false, default: 'low' },
        fix: { type: 'boolean', required: false, default: false },
        includeCvss: { type: 'boolean', required: false, default: true },
        outputFormat: { type: 'string', required: false, default: 'detailed' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const pm = validation.data.packageManager === 'auto' ? 
        (await detectPackageManager()) : [validation.data.packageManager]
      
      const results: any = {}
      const allVulnerabilities: any[] = []
      
      if (pm.includes('npm') || pm.includes('yarn') || pm.includes('all')) {
        const audit = await checkVulnerabilitiesNpm()
        const vulnerabilities = audit.vulnerabilities || {}
        const metadata = audit.metadata || {}
        
        const counts = { critical: 0, high: 0, moderate: 0, low: 0 }
        
        for (const v of Object.values(vulnerabilities) as any[]) {
          if (v.severity === 'critical') counts.critical++
          if (v.severity === 'high') counts.high++
          if (v.severity === 'moderate') counts.moderate++
          if (v.severity === 'low') counts.low++
          allVulnerabilities.push({ source: 'npm', ...v })
        }
        
        results.npm = {
          scanCompleted: true,
          packageManager: 'npm',
          vulnerabilitiesCount: Object.keys(vulnerabilities).length,
          severityBreakdown: counts,
          actions: audit.metadata?.actions || [],
          vulnerableModules: Object.entries(vulnerabilities).slice(0, 50).map(([name, v]: [string, any]) => ({
            name,
            severity: v.severity,
            title: v.title,
            range: v.range,
            fixAvailable: v.fixAvailable,
            via: v.via?.slice(0, 5) || [],
            effects: v.effects?.slice(0, 5) || [],
            recommendation: v.fixAvailable ? 
              (v.fixAvailable === true ? 'Update to latest version' : 
               `Run: npm install ${v.fixAvailable}`) : 'Manual review required'
          }))
        }
      }
      
      if (pm.includes('pip') || pm.includes('poetry') || pm.includes('all')) {
        const safety = await safeExec('safety check --json 2>/dev/null || pip-audit --format json 2>/dev/null || echo "[]"')
        try {
          const vulns = JSON.parse(safety)
          const pipVulns = Array.isArray(vulns) ? vulns : (vulns.vulnerabilities || [])
          
          pipVulns.forEach((v: any) => allVulnerabilities.push({ source: 'pip', ...v }))
          
          results.pip = {
            scanCompleted: true,
            vulnerabilitiesCount: pipVulns.length,
            findings: pipVulns.slice(0, 50).map((v: any) => ({
              package: v.package || v.name || v.dependency,
              installed: v.installed_version || v.version,
              affected: v.vulnerable_spec || v.vuln_versions || v.advisory,
              id: v.vuln_id || v.id,
              severity: v.severity || 'unknown',
              cvss: validation.data.includeCvss ? v.cvss_score : undefined,
              advisory: v.advisory?.substring(0, 300) || v.description?.substring(0, 300)
            }))
          }
        } catch {
          results.pip = { rawOutput: safety.substring(0, 3000) }
        }
      }

      if (pm.includes('go') || pm.includes('all')) {
        const goVuln = await safeExec('go vet 2>&1 || go list -m -json all 2>&1 | head -1000')
        results.go = { rawOutput: goVuln.substring(0, 3000) }
      }
      
      if (validation.data.fix && (pm.includes('npm') || pm.includes('all'))) {
        results.fixAttempted = true
        results.fixResult = await safeExec('npm audit fix 2>&1')
      }

      const severityWeights: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 }
      const minSeverity = severityWeights[validation.data.severity] || 1
      const filtered = allVulnerabilities.filter(v => 
        (severityWeights[v.severity] || 1) >= minSeverity
      )

      const riskLevel = filtered.some(v => v.severity === 'critical') ? 'Critical' :
                        filtered.some(v => v.severity === 'high') ? 'High' :
                        filtered.some(v => v.severity === 'moderate') ? 'Medium' :
                        filtered.length > 0 ? 'Low' : 'None'
      
      return formatSuccess({
        scanDate: new Date().toISOString(),
        packageManagers: pm,
        minimumSeverity: validation.data.severity,
        riskLevel,
        results,
        summary: {
          totalVulnerabilities: allVulnerabilities.length,
          filteredVulnerabilities: filtered.length,
          severityBreakdown: {
            critical: allVulnerabilities.filter(v => v.severity === 'critical').length,
            high: allVulnerabilities.filter(v => v.severity === 'high').length,
            moderate: allVulnerabilities.filter(v => v.severity === 'moderate').length,
            low: allVulnerabilities.filter(v => v.severity === 'low').length
          },
          recommendations: [
            filtered.some(v => v.severity === 'critical') ? '🔴 Address CRITICAL vulnerabilities immediately' : null,
            filtered.some(v => v.severity === 'high') ? '🟠 Schedule HIGH severity fixes within 7 days' : null,
            !validation.data.fix && filtered.length > 0 ? '🟡 Consider running with fix:true to auto-apply patches' : null
          ].filter(Boolean)
        }
      })
    }
  })
  .addTool({
    name: 'lib_license_check',
    description: 'License compliance audit with risk assessment and compatibility verification',
    parameters: {
      packageManager: { type: 'string', description: 'Package manager: npm, pip, go, all, auto' },
      includeDev: { type: 'boolean', description: 'Include dev dependencies', required: false },
      checkCompatibility: { type: 'boolean', description: 'Check license compatibility with project', required: false },
      projectLicense: { type: 'string', description: 'Project license for compatibility check', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        packageManager: { type: 'string', required: false, default: 'auto' },
        includeDev: { type: 'boolean', required: false, default: false },
        checkCompatibility: { type: 'boolean', required: false, default: true },
        projectLicense: { type: 'string', required: false, default: 'MIT' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const pm = validation.data.packageManager === 'auto' ? 
        (await detectPackageManager()) : [validation.data.packageManager]
      
      const results: any = {}
      const allLicenses: Record<string, number> = {}
      const allPackages: { package: string; license: string }[] = []
      
      if (pm.includes('npm') || pm.includes('all')) {
        const cmd = validation.data.includeDev ? 
          'npx license-checker --json 2>/dev/null || echo "{}"' : 
          'npx license-checker --production --json 2>/dev/null || echo "{}"'
        const raw = await safeExec(cmd)
        
        try {
          const licenses = JSON.parse(raw)
          const npmLicenses: Record<string, string[]> = {}
          
          for (const [pkg, info] of Object.entries(licenses) as [string, any]) {
            const license = String(info.licenses || 'Unknown').replace(/['"]+/g, '')
            if (!npmLicenses[license]) npmLicenses[license] = []
            npmLicenses[license].push(pkg)
            allLicenses[license] = (allLicenses[license] || 0) + 1
            allPackages.push({ package: pkg, license })
          }
          
          results.npm = {
            totalPackages: Object.keys(licenses).length,
            includeDev: validation.data.includeDev,
            licenses: Object.entries(npmLicenses).map(([license, packages]) => ({
              license,
              risk: getLicenseRisk(license),
              count: packages.length,
              percentage: Math.round((packages.length / Object.keys(licenses).length) * 100),
              packages: packages.slice(0, 15)
            })).sort((a, b) => b.count - a.count)
          }
        } catch (e) {
          results.npm = { error: 'License check failed', raw: raw.substring(0, 1000) }
        }
      }
      
      if (pm.includes('pip') || pm.includes('all')) {
        const pipCheck = await safeExec('pip-licenses --format=json 2>/dev/null || python -m piplicenses --format=json 2>/dev/null || echo "[]"')
        try {
          const licenses = JSON.parse(pipCheck)
          const pipLicenses: Record<string, string[]> = {}
          
          for (const pkg of licenses) {
            const license = String(pkg.License || pkg.license || 'Unknown')
            if (!pipLicenses[license]) pipLicenses[license] = []
            pipLicenses[license].push(`${pkg.Name || pkg.name}@${pkg.Version || pkg.version}`)
            allLicenses[license] = (allLicenses[license] || 0) + 1
            allPackages.push({ package: `${pkg.Name || pkg.name}@${pkg.Version || pkg.version}`, license })
          }
          
          results.pip = {
            totalPackages: licenses.length,
            licenses: Object.entries(pipLicenses).map(([license, packages]) => ({
              license,
              risk: getLicenseRisk(license),
              count: packages.length,
              percentage: Math.round((packages.length / licenses.length) * 100),
              packages: packages.slice(0, 15)
            })).sort((a, b) => b.count - a.count)
          }
        } catch {
          results.pip = { raw: pipCheck.substring(0, 1000) }
        }
      }

      const highRiskLicenses = Object.entries(allLicenses)
        .filter(([license]) => getLicenseRisk(license).score <= 3)
        .map(([license, count]) => ({ license, count }))

      const incompatibilityWarnings: string[] = []
      if (validation.data.checkCompatibility) {
        const projectLicense = validation.data.projectLicense
        const compatible = LICENSE_COMPATIBILITY[projectLicense] || []
        
        for (const pkg of allPackages) {
          const isCompatible = compatible.some(c => pkg.license.includes(c))
          if (!isCompatible && !pkg.license.includes('MIT') && !pkg.license.includes('BSD')) {
            incompatibilityWarnings.push(`⚠️ ${pkg.package}: ${pkg.license} may be incompatible with ${projectLicense}`)
          }
        }
      }
      
      return formatSuccess({
        scanDate: new Date().toISOString(),
        packageManagers: pm,
        projectLicense: validation.data.projectLicense,
        results,
        summary: {
          totalPackagesScanned: allPackages.length,
          uniqueLicenses: Object.keys(allLicenses).length,
          licenseBreakdown: allLicenses,
          riskSummary: {
            highRiskCount: highRiskLicenses.length,
            highRiskLicenses,
            incompatibilityWarnings: incompatibilityWarnings.slice(0, 20)
          },
          overallCompliance: highRiskLicenses.length === 0 ? 
            (incompatibilityWarnings.length === 0 ? '✅ Pass' : '⚠️ Review') : '🔴 Action Required'
        }
      })
    }
  })
  .addTool({
    name: 'lib_dependency_health',
    description: 'Comprehensive dependency health assessment and quality metrics',
    parameters: {
      packageManager: { type: 'string', description: 'Package manager: npm, pip, all, auto' },
      analysisDepth: { type: 'string', description: 'Analysis depth: quick, standard, deep' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        packageManager: { type: 'string', required: false, default: 'auto' },
        analysisDepth: { type: 'string', required: false, default: 'standard' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const pm = validation.data.packageManager === 'auto' ? 
        (await detectPackageManager()) : [validation.data.packageManager]

      const metrics: any = {
        packageCount: 0,
        directDependencies: 0,
        transitiveDependencies: 0,
        outdated: 0,
        deprecated: 0,
        unused: 0,
        duplicateVersions: 0,
        averagePackageAge: 0
      }
      const recommendations: string[] = []

      if (pm.includes('npm') || pm.includes('all')) {
        try {
          const ls = await safeExec('npm ls --json 2>/dev/null || echo "{}"')
          const tree = JSON.parse(ls)
          const allDeps = Object.keys(tree.dependencies || {})
          
          metrics.packageCount += allDeps.length
          metrics.directDependencies = allDeps.length

          const outdated = await safeExec('npm outdated --json 2>/dev/null || echo "{}"')
          const outdatedDeps = JSON.parse(outdated)
          metrics.outdated = Object.keys(outdatedDeps).length

          if (metrics.outdated > 0) {
            recommendations.push(`📦 Update ${metrics.outdated} outdated dependencies`)
          }

          const depths = await safeExec('npm ls --depth=0 2>&1 | wc -l')
          metrics.transitiveDependencies = Math.max(0, parseInt(depths) - metrics.directDependencies - 2)

          if (metrics.outdated / metrics.directDependencies > 0.3) {
            recommendations.push('🔧 High number of outdated dependencies - consider dependency update sprint')
          }
        } catch (e) {
        }
      }

      const healthScore = Math.max(0, Math.min(100, 100 - 
        (metrics.outdated * 2) -
        (metrics.duplicateVersions * 5) -
        (metrics.deprecated * 10)
      ))

      const grade = healthScore >= 80 ? 'A' :
                    healthScore >= 65 ? 'B' :
                    healthScore >= 50 ? 'C' :
                    healthScore >= 35 ? 'D' : 'F'

      return formatSuccess({
        packageManagers: pm,
        analysisDepth: validation.data.analysisDepth,
        metrics,
        healthScore,
        grade,
        healthRating: grade <= 'B' ? '✅ Healthy' : grade === 'C' ? '⚠️ Moderate' : '🔴 Needs Attention',
        recommendations: recommendations.slice(0, 10),
        improvementAreas: [
          metrics.outdated > 0 ? 'Update outdated dependencies' : null,
          metrics.duplicateVersions > 0 ? 'Resolve duplicate package versions' : null,
          metrics.unused > 0 ? 'Remove unused dependencies' : null
        ].filter(Boolean)
      })
    }
  })
  .addTool({
    name: 'lib_dependency_tree',
    description: 'Visualize and analyze project dependency tree with filtering',
    parameters: {
      packageManager: { type: 'string', description: 'Package manager: npm, pip, go' },
      depth: { type: 'number', description: 'Maximum depth to display', required: false },
      filter: { type: 'string', description: 'Filter by package name pattern', required: false },
      format: { type: 'string', description: 'Output format: text, json, mermaid', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        packageManager: { type: 'string', required: false, default: 'npm' },
        depth: { type: 'number', required: false, default: 2 },
        filter: { type: 'string', required: false, default: '' },
        format: { type: 'string', required: false, default: 'text' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const pm = validation.data.packageManager
      const depth = Math.min(validation.data.depth, 5)
      
      let treeText = ''
      let stats: any = {}
      
      if (pm === 'npm') {
        treeText = await safeExec(`npm ls --depth=${depth} ${validation.data.filter || ''} 2>&1`)
        stats.totalLines = treeText.split('\n').length
      } else if (pm === 'pip') {
        treeText = await safeExec(`pipdeptree --depth ${depth} ${validation.data.filter ? `-p ${validation.data.filter}` : ''} 2>&1`)
      } else if (pm === 'go') {
        treeText = await safeExec('go mod graph 2>&1 | head -300')
      } else {
        return formatError('Unsupported package manager')
      }

      if (validation.data.format === 'mermaid') {
        const lines = treeText.split('\n').filter(l => l.trim())
        const mermaid = ['graph TD']
        const seen = new Set<string>()
        
        for (const line of lines.slice(0, 50)) {
          const parts = line.split(/@[0-9]/)
          if (parts.length >= 2) {
            const parent = parts[0].replace(/[^\w]/g, '_')
            const child = parts[1].split(' ').pop()?.replace(/[^\w]/g, '_')
            if (parent && child && !seen.has(`${parent}-${child}`)) {
              mermaid.push(`  ${parent} --> ${child}`)
              seen.add(`${parent}-${child}`)
            }
          }
        }
        
        return formatSuccess({
          packageManager: pm,
          format: 'mermaid',
          mermaidDiagram: mermaid.join('\n'),
          nodeCount: mermaid.length - 1
        })
      }
      
      return formatSuccess({
        packageManager: pm,
        maxDepth: depth,
        filter: validation.data.filter,
        treeSize: stats.totalLines || treeText.split('\n').length,
        tree: treeText.substring(0, 20000)
      })
    }
  })
  .addTool({
    name: 'lib_outdated_check',
    description: 'Check for outdated dependencies with semantic versioning analysis',
    parameters: {
      packageManager: { type: 'string', description: 'Package manager: npm, pip, go, auto' },
      severityFilter: { type: 'string', description: 'Filter by: major, minor, patch, all', required: false },
      includeChangelog: { type: 'boolean', description: 'Include changelog links', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        packageManager: { type: 'string', required: false, default: 'auto' },
        severityFilter: { type: 'string', required: false, default: 'all' },
        includeChangelog: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const pm = validation.data.packageManager === 'auto' ? 
        (await detectPackageManager()) : [validation.data.packageManager]

      const results: any = {}
      const allOutdated: any[] = []
      
      if (pm.includes('npm') || pm.includes('all')) {
        const raw = await safeExec('npm outdated --json 2>/dev/null || echo "{}"')
        try {
          const outdated = JSON.parse(raw)
          
          const categorized = Object.entries(outdated).map(([name, info]: [string, any]) => {
            const current = info.current?.split('.').map(Number) || [0, 0, 0]
            const latest = info.latest?.split('.').map(Number) || [0, 0, 0]
            
            let updateType = 'unknown'
            if (current[0] < latest[0]) updateType = 'major'
            else if (current[1] < latest[1]) updateType = 'minor'
            else if (current[2] < latest[2]) updateType = 'patch'
            
            return { name, current: info.current, wanted: info.wanted, latest: info.latest, updateType, location: info.location }
          })

          const filtered = validation.data.severityFilter === 'all' ? categorized :
            categorized.filter(p => p.updateType === validation.data.severityFilter)

          filtered.forEach(p => allOutdated.push({ source: 'npm', ...p }))
          
          results.npm = {
            totalOutdated: Object.keys(outdated).length,
            filteredCount: filtered.length,
            breakdown: {
              major: categorized.filter(p => p.updateType === 'major').length,
              minor: categorized.filter(p => p.updateType === 'minor').length,
              patch: categorized.filter(p => p.updateType === 'patch').length
            },
            packages: filtered
          }
        } catch {
          results.npm = { raw: raw.substring(0, 1000) }
        }
      }
      
      return formatSuccess({
        checkDate: new Date().toISOString(),
        packageManagers: pm,
        filteredBy: validation.data.severityFilter,
        results,
        summary: {
          totalOutdated: allOutdated.length,
          breakdownByType: {
            major: allOutdated.filter(p => p.updateType === 'major').length,
            minor: allOutdated.filter(p => p.updateType === 'minor').length,
            patch: allOutdated.filter(p => p.updateType === 'patch').length
          },
          recommendations: [
            allOutdated.some(p => p.updateType === 'patch') ? '✓ Apply PATCH updates immediately' : null,
            allOutdated.some(p => p.updateType === 'minor') ? '✓ Schedule MINOR updates this sprint' : null,
            allOutdated.some(p => p.updateType === 'major') ? '⚠️ Plan MAJOR updates carefully - breaking changes likely' : null
          ].filter(Boolean)
        }
      })
    }
  })
  .addPrompt({
    name: 'dependency-health-assessment',
    description: 'Comprehensive project dependency review',
    arguments: [],
    generate: async () => `## 📦 Dependency Health Assessment Prompt

Please conduct a comprehensive dependency review:

### Phase 1: Initial Scan
1. Run: \`lib_vulnerability_scan\`
2. Run: \`lib_license_check\`
3. Run: \`lib_dependency_health\`
4. Run: \`lib_outdated_check\`

### Phase 2: Detailed Analysis
For each high-risk finding:
1. Check exact package details using \`lib_search_npm\` or \`lib_search_pypi\`
2. Verify vulnerability CVSS scores and severity
3. Assess license compatibility with project goals
4. Identify unused dependencies to remove

### Phase 3: Remediation Plan
1. Prioritize updates by severity
2. Group compatible updates together
3. Schedule breaking change updates separately
4. Document dependency version policies

### Success Metrics
- Zero critical/high vulnerabilities
- <10% outdated dependencies
- No copyleft license conflicts
- Regular dependency update schedule`
  })
  .addResource({
    name: 'dependency-management-playbook',
    uri: 'docs://library-manager/playbook',
    description: 'Professional Dependency Management Playbook',
    mimeType: 'text/markdown',
    get: async () => `
# 📚 Dependency Management Playbook

## The 5 Golden Rules

### 1. Version Pinning Strategy
**Production**: Pin exact versions  
**Libraries**: Use semver ranges (^1.2.3)  
**Critical Dependencies**: Pin SHA hashes

### 2. Update Cadence
| Severity | Update Window | Examples |
|----------|--------------|----------|
| Critical | 24 hours | Log4j, Heartbleed |
| High | 7 days | XSS, RCE vectors |
| Medium | 30 days | Performance, bugs |
| Low | Quarterly | Refactoring |

### 3. License Compliance Matrix
| License | Commercial Use | Relicensing | Patent Grant |
|---------|---------------|-------------|-------------|
| MIT | ✅ Yes | ✅ Yes | ❌ No |
| Apache | ✅ Yes | ✅ Yes | ✅ Yes |
| GPL | ⚠️ No | ❌ No | ❌ No |
| AGPL | 🔴 No | ❌ No | ❌ No |

### 4. Dependency Size Budget
- **Core dependencies**: < 20 direct
- **Full stack app**: < 50 direct
- **Libraries**: < 10 direct
- **CLI tools**: < 30 direct

### 5. Health Score Formula
\\[\nScore = 100 - (Outdated \\times 2) - (Duplicates \\times 5) - (Vulns \\times 10)\n\\]

| Grade | Action |
|-------|--------|
| A | Maintain |
| B | Monitor |
| C | Schedule updates |
| D/F | Emergency review |

## Anti-Patterns to Avoid

1. **Copy-pasting from StackOverflow** without auditing
2. **Using \`latest\`** tag in production
3. **Fear of updating** - "If it works don't touch" is a myth
4. **Deep dependency chains** - prefer fewer, higher-quality packages
5. **Ignoring peerDependency warnings**

## Quick Win Optimization

1. Run: \`npx depcheck\` monthly
2. Use: \`npm dedupe\` quarterly
3. Replace: 10 micro-dependencies with 1 well-maintained library
4. Audit: \`ls node_modules | wc -l\` - target < 1000
`
  })
