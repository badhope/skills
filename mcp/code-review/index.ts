import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, sanitizePath, fileExists } from '../../packages/core/shared'
import fs from 'fs/promises'

function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1
  const patterns = [
    /\bif\b/g, /\belse\s+if\b/g, /\bfor\b/g, /\bwhile\b/g,
    /\bcase\b/g, /\bcatch\b/g, /\?/g, /\|\|/g, /&&/g,
    /\bswitch\b/g, /\bthrow\b/g, /\breturn\s+.+/g
  ]
  patterns.forEach(pattern => {
    const matches = code.match(pattern)
    if (matches) complexity += matches.length
  })
  return complexity
}

function countLines(code: string): { total: number; code: number; comment: number; blank: number } {
  const lines = code.split('\n')
  let comment = 0
  let blank = 0
  let inBlockComment = false
  
  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) {
      blank++
    } else if (trimmed.startsWith('/*')) {
      inBlockComment = true
      comment++
    } else if (inBlockComment) {
      comment++
      if (trimmed.includes('*/')) inBlockComment = false
    } else if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      comment++
    }
  })
  
  return { total: lines.length, code: lines.length - comment - blank, comment, blank }
}

function detectBugs(code: string): Array<{ type: string; line: number; message: string; severity: 'low' | 'medium' | 'high' }> {
  const issues: Array<{ type: string; line: number; message: string; severity: 'low' | 'medium' | 'high' }> = []
  const lines = code.split('\n')
  
  lines.forEach((line, idx) => {
    const lineNum = idx + 1
    
    if (/(=|==|!=|!==|<|>|<=|>=)\s*$/.test(line.trim()) && !line.includes('?')) {
      issues.push({ type: 'Possible Bug', line: lineNum, message: '表达式可能未完成，跨行断裂风险', severity: 'medium' })
    }
    if (line.includes('console.log') && !line.includes('//')) {
      issues.push({ type: 'Code Smell', line: lineNum, message: '生产代码应移除 console.log', severity: 'low' })
    }
    if (line.includes('debugger') && !line.includes('//')) {
      issues.push({ type: 'Critical', line: lineNum, message: '生产代码绝对不能包含 debugger 语句', severity: 'high' })
    }
    if (/eval\s*\(/.test(line) && !line.includes('//')) {
      issues.push({ type: 'Security', line: lineNum, message: 'eval() 存在严重代码注入安全风险', severity: 'high' })
    }
    if (/innerHTML\s*=|outerHTML\s*=/.test(line) && !line.includes('//')) {
      issues.push({ type: 'Security', line: lineNum, message: 'innerHTML 可能导致 XSS 攻击', severity: 'medium' })
    }
    if (/setTimeout\s*\(\s*["']/.test(line)) {
      issues.push({ type: 'Security', line: lineNum, message: 'setTimeout 字符串参数等同于 eval', severity: 'high' })
    }
  })
  
  return issues
}

function detectCodeStyle(code: string): Array<{ type: string; line: number; message: string }> {
  const issues: Array<{ type: string; line: number; message: string }> = []
  const lines = code.split('\n')
  
  lines.forEach((line, idx) => {
    const lineNum = idx + 1
    if (line.includes('\t')) issues.push({ type: 'Style', line: lineNum, message: '使用 tabs 代替 spaces，建议统一使用空格' })
    if (line.trim().length > 120) issues.push({ type: 'Style', line: lineNum, message: '行长度超过 120 字符，建议折行' })
    if (line.endsWith(' ') && line.trim()) issues.push({ type: 'Style', line: lineNum, message: '行尾存在多余空格' })
  })
  
  return issues
}

function calculateMaintainabilityIndex(metrics: any): string {
  const rawIndex = Math.max(0, 171 - 5.2 * Math.log(metrics.complexity || 1) - 0.23 * metrics.loc.code)
  if (rawIndex >= 100) return 'A+'
  if (rawIndex >= 80) return 'A'
  if (rawIndex >= 60) return 'B'
  if (rawIndex >= 40) return 'C'
  return 'D'
}

export default createMCPServer({
  name: 'code-review',
  version: '2.0.0',
  description: 'Enterprise-grade code quality analysis - bugs, complexity, security, maintainability with standardized reporting',
  author: 'MCP Expert Community',
  icon: '🔍'
})
  .addTool({
    name: 'detect_bugs',
    description: 'Static bug detection analysis with severity classification',
    parameters: {
      filepath: { type: 'string', description: 'File path to analyze', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filepath: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.filepath)
      if (!await fileExists(safePath)) return formatError('File not found', safePath)

      try {
        const code = await fs.readFile(safePath, 'utf-8')
        const bugs = detectBugs(code)
        return formatSuccess({
          filepath: safePath,
          bugs,
          totalFound: bugs.length,
          bySeverity: {
            high: bugs.filter(b => b.severity === 'high').length,
            medium: bugs.filter(b => b.severity === 'medium').length,
            low: bugs.filter(b => b.severity === 'low').length
          }
        })
      } catch (e) {
        return formatError('Failed to analyze file', e)
      }
    }
  })
  .addTool({
    name: 'analyze_complexity',
    description: 'Cyclomatic complexity and lines of code analysis',
    parameters: {
      filepath: { type: 'string', description: 'File path to analyze', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filepath: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.filepath)
      if (!await fileExists(safePath)) return formatError('File not found', safePath)

      try {
        const code = await fs.readFile(safePath, 'utf-8')
        return formatSuccess({
          filepath: safePath,
          cyclomaticComplexity: calculateCyclomaticComplexity(code),
          lines: countLines(code)
        })
      } catch (e) {
        return formatError('Failed to analyze file', e)
      }
    }
  })
  .addTool({
    name: 'code_style_check',
    description: 'Code style and formatting validation',
    parameters: {
      filepath: { type: 'string', description: 'File path to analyze', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filepath: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.filepath)
      if (!await fileExists(safePath)) return formatError('File not found', safePath)

      try {
        const code = await fs.readFile(safePath, 'utf-8')
        const styleIssues = detectCodeStyle(code)
        return formatSuccess({
          filepath: safePath,
          issues: styleIssues,
          totalIssues: styleIssues.length
        })
      } catch (e) {
        return formatError('Failed to analyze file', e)
      }
    }
  })
  .addTool({
    name: 'maintainability_analysis',
    description: 'Calculate code maintainability index and quality metrics',
    parameters: {
      filepath: { type: 'string', description: 'File path to analyze', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filepath: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.filepath)
      if (!await fileExists(safePath)) return formatError('File not found', safePath)

      try {
        const code = await fs.readFile(safePath, 'utf-8')
        const complexity = calculateCyclomaticComplexity(code)
        const loc = countLines(code)
        const maintainability = calculateMaintainabilityIndex({ complexity, loc })
        
        return formatSuccess({
          filepath: safePath,
          maintainabilityIndex: maintainability,
          metrics: {
            cyclomaticComplexity: complexity,
            linesOfCode: loc,
            halsteadVolume: Math.round(loc.code * Math.log2(Math.max(1, complexity))),
            commentRatio: loc.total > 0 ? ((loc.comment / loc.total) * 100).toFixed(1) + '%' : 'N/A'
          },
          suggestions: [
            complexity > 50 ? '🔴 圈复杂度过高，建议拆分函数' : '✅ 圈复杂度合理',
            loc.code > 500 ? '🟡 代码行数过多，建议拆分模块' : '✅ 代码规模合理',
            loc.comment / loc.total < 0.1 ? '🟡 注释率偏低，建议添加说明' : '✅ 注释率合理'
          ]
        })
      } catch (e) {
        return formatError('Failed to analyze file', e)
      }
    }
  })
  .addTool({
    name: 'full_code_review',
    description: 'Comprehensive quality report with scoring and grading',
    parameters: {
      filepath: { type: 'string', description: 'File path to analyze', required: true },
      focus: { type: 'string', description: 'Review focus: all, bugs, style, security, complexity', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        filepath: { type: 'string', required: true },
        focus: { type: 'string', required: false, default: 'all' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const safePath = sanitizePath(validation.data.filepath)
      if (!await fileExists(safePath)) return formatError('File not found', safePath)

      try {
        const code = await fs.readFile(safePath, 'utf-8')
        const focus = validation.data.focus
        
        const complexity = calculateCyclomaticComplexity(code)
        const loc = countLines(code)
        const bugs = detectBugs(code)
        const style = detectCodeStyle(code)
        const maintainability = calculateMaintainabilityIndex({ complexity, loc })
        
        const score = Math.max(0, 100
          - Math.min(30, bugs.filter(b => b.severity === 'high').length * 15)
          - Math.min(20, bugs.filter(b => b.severity === 'medium').length * 5)
          - Math.min(10, bugs.filter(b => b.severity === 'low').length * 2)
          - Math.min(20, style.length)
          - Math.min(20, Math.max(0, complexity - 20)))
        
        let grade = 'F'
        if (score >= 90) grade = 'A'
        else if (score >= 80) grade = 'B'
        else if (score >= 70) grade = 'C'
        else if (score >= 60) grade = 'D'
        
        return formatSuccess({
          filepath: safePath,
          reviewFocus: focus,
          overallScore: score,
          overallGrade: grade,
          maintainability,
          metrics: {
            cyclomaticComplexity: complexity,
            linesOfCode: loc,
            bugsFound: bugs.length,
            styleIssues: style.length,
            securityVulnerabilities: bugs.filter(b => b.type === 'Security').length
          },
          topIssues: bugs.slice(0, 5),
          recommendations: [
            score >= 80 ? '✅ 代码质量优秀，继续保持！' : '⚠️ 建议改进代码质量',
            bugs.filter(b => b.severity === 'high').length > 0 ? '🔴 需要优先修复高严重级别问题' : '✅ 无高危问题',
            complexity > 30 ? '🟡 复杂度偏高，考虑重构拆分' : '✅ 复杂度控制良好',
            style.length > 10 ? '🟡 代码规范问题较多，建议统一格式化' : '✅ 代码规范良好'
          ].filter(Boolean)
        })
      } catch (e) {
        return formatError('Failed to perform full review', e)
      }
    }
  })
  .addResource({
    uri: 'mcp://code-review/quality-dashboard',
    name: 'Code Quality Dashboard',
    description: 'Project-wide code quality metrics and trends',
    get: async () => {
      return {
        standards: {
          maxCyclomaticComplexity: 50,
          maxFunctionLines: 50,
          minCommentRatio: 0.1,
          targetMaintainability: 'A'
        },
        checks: [
          { name: 'Bug Detection', status: 'ready', coverage: 12 },
          { name: 'Security Scan', status: 'ready', coverage: 6 },
          { name: 'Style Check', status: 'ready', coverage: 4 },
          { name: 'Complexity Analysis', status: 'ready', coverage: 8 }
        ]
      }
    }
  })
  .addPrompt({
    name: 'deep-review',
    description: 'AI-powered comprehensive code review workflow',
    arguments: [
      { name: 'filepath', description: 'Path of file to review', required: true }
    ],
    generate: async (args?: Record<string, any>) => {
      const safePath = args?.filepath ? sanitizePath(args.filepath) : ''
      return `
## 🔍 AI深度代码审查: ${safePath || '目标文件'}

### 📊 标准化审查流程

**第1步: 基础质量扫描**
调用 \`full_code_review\` 获取整体评分和概览

**第2步: 深度Bug检测**
调用 \`detect_bugs\` 找出所有潜在问题

**第3步: 复杂度与可维护性分析**  
调用 \`analyze_complexity\` 和 \`maintainability_analysis\`

**第4步: AI 综合评审**
基于以上数据，结构化输出：

| 维度 | 评分 | 状态 | 行动项 |
|------|------|------|--------|
| 功能正确性 | /10 | | |
| 安全性 | /10 | | |
| 性能效率 | /10 | | |
| 可维护性 | /10 | | |
| 代码规范 | /10 | | |

**第5步: 生成改进方案**
1. 🔴 P0 阻断性问题 - 必须立即修复
2. 🟡 P1 重要改进 - 近期修复
3. 🟢 P2 优化建议 - 按需处理

### 🎯 企业级质量标准
- 安全漏洞零容忍
- 整体评分 >= 80分
- 无高危级别Bug
- 圈复杂度单个函数 < 50
      `.trim()
    }
  })
  .build()
