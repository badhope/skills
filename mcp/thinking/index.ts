import crypto from 'crypto';
import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core'
import * as fs from 'fs/promises'
import * as path from 'path'

const THINKING_DIR = path.join(process.cwd(), '.agent-thinking')

interface ThinkStep {
  id: string
  stepNumber: number
  title: string
  content: string
  type: 'observation' | 'reasoning' | 'hypothesis' | 'verification' | 'conclusion'
  confidence: number
  next: string[]
  assumptions: string[]
  timestamp: string
  parentId?: string
}

interface ThinkingSession {
  id: string
  problem: string
  context: string
  startTime: string
  lastUpdate: string
  steps: ThinkStep[]
  status: 'active' | 'reviewing' | 'completed'
  metadata: Record<string, any>
}

async function ensureThinkingDir(): Promise<void> {
  await fs.mkdir(THINKING_DIR, { recursive: true })
}

async function saveSession(session: ThinkingSession): Promise<void> {
  await ensureThinkingDir()
  const sessionPath = path.join(THINKING_DIR, `${session.id}.json`)
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2))
}

async function loadSession(sessionId: string): Promise<ThinkingSession | null> {
  try {
    const sessionPath = path.join(THINKING_DIR, `${sessionId}.json`)
    const data = await fs.readFile(sessionPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

function generateId(): string {
  return crypto.randomUUID()
}

const VALID_THINK_TYPES = ['observation', 'reasoning', 'hypothesis', 'verification', 'conclusion']

const TYPE_EMOJIS: Record<string, string> = {
  observation: '👁️',
  reasoning: '💭',
  hypothesis: '💡',
  verification: '✅',
  conclusion: '🎯'
}

function getConfidenceInfo(confidence: number) {
  const level = confidence >= 90 ? '极高' : confidence >= 70 ? '高' : confidence >= 50 ? '中等' : '低'
  const emoji = confidence >= 90 ? '🔵' : confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴'
  return { level, emoji }
}

export default createMCPServer({
  name: 'sequential-thinking',
  version: '2.0.0',
  description: 'Enterprise Chain-of-Thought System - Structured reasoning framework with persistence, critical review, and cognitive bias mitigation for complex problem solving',
  author: 'MCP Expert Community',
  icon: '🧠'
})

  .addTool({
    name: 'thinking_start',
    description: 'Initialize structured deep thinking session with persistence',
    parameters: {
      problem: { type: 'string', description: 'The core problem to solve', required: true },
      context: { type: 'string', description: 'Known background information and constraints', required: false },
      expectedComplexity: { type: 'string', description: 'simple, medium, complex, very_complex', required: false },
      domain: { type: 'string', description: 'Problem domain: coding, math, business, research', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        problem: { type: 'string', required: true },
        context: { type: 'string', required: false, default: '' },
        expectedComplexity: { type: 'string', required: false, default: 'complex' },
        domain: { type: 'string', required: false, default: 'general' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const sessionId = generateId()
      const now = new Date().toISOString()

      const session: ThinkingSession = {
        id: sessionId,
        problem: validation.data.problem,
        context: validation.data.context,
        startTime: now,
        lastUpdate: now,
        steps: [],
        status: 'active',
        metadata: {
          complexity: validation.data.expectedComplexity,
          domain: validation.data.domain,
          recommendedSteps: validation.data.expectedComplexity === 'very_complex' ? 15 : 
                          validation.data.expectedComplexity === 'complex' ? 10 :
                          validation.data.expectedComplexity === 'medium' ? 6 : 3
        }
      }

      await saveSession(session)

      const { recommendedSteps } = session.metadata

      return formatSuccess({
        sessionId,
        started: true,
        problem: validation.data.problem,
        complexity: validation.data.expectedComplexity,
        domain: validation.data.domain,
        recommendedSteps,
        framework: `
## 🧠 结构化深度思考框架 - 第1阶段：问题定义

### 📌 核心问题
> ${validation.data.problem}

${validation.data.context ? `### 📚 背景信息\n${validation.data.context}\n` : ''}

---

### 🎯 标准思考流程

**Phase 1: 问题拆解与边界定义**
▢ 明确所有已知条件和约束
▢ 识别并显性化所有隐含假设
▢ 定义成功标准和验收条件
▢ 划定解决边界（什么不在范围内）

**Phase 2: 多路径探索（${Math.round(recommendedSteps * 0.4)} 步）**
▢ 生成3-5种可能的解决路径
▢ 评估每条路径的可行性与风险
▢ 识别关键难点和不确定点
▢ 考虑反例和边缘情况

**Phase 3: 深度推理验证（${Math.round(recommendedSteps * 0.4)} 步）**
▢ 逐步推导，每步只做一个逻辑跳跃
▢ 主动寻找逻辑漏洞和矛盾
▢ 交叉验证结论的一致性
▢ 尝试证伪而不仅仅证实

**Phase 4: 批判性审查（必须）**
▢ 调用 thinking_review 进行自动化审查
▢ 检查认知偏差
▢ 验证所有假设的合理性

**Phase 5: 结构化总结**
▢ 总结核心发现
▢ 列出遗留的不确定性
▢ 给出明确的行动建议

---
✅ 思考会话已创建并持久化。
⚠️ 强制执行规则：
   1. 不允许跳步，一步只做一件事
   2. 置信度要诚实，不要虚高
   3. 每一步都要记录假设
   4. 必须经过审查才能得出最终结论
        `.trim()
      })
    }
  })

  .addTool({
    name: 'thinking_add_step',
    description: 'Record structured thinking step with metadata and persistence',
    parameters: {
      sessionId: { type: 'string', description: 'Thinking session ID', required: true },
      title: { type: 'string', description: 'Title for this thinking step', required: true },
      content: { type: 'string', description: 'Detailed thinking content', required: true },
      type: { type: 'string', description: 'Thinking type: observation, reasoning, hypothesis, verification, conclusion', required: true },
      confidence: { type: 'number', description: 'Confidence 0-100 (be honest!)', required: false },
      assumptions: { type: 'string', description: 'Comma-separated assumptions this step depends on', required: false },
      alternatives: { type: 'string', description: 'Comma-separated alternative conclusions considered', required: false },
      parentStepId: { type: 'string', description: 'Parent step ID for branching', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sessionId: { type: 'string', required: true },
        title: { type: 'string', required: true },
        content: { type: 'string', required: true },
        type: { type: 'string', required: true },
        confidence: { type: 'number', required: false, default: 75 },
        assumptions: { type: 'string', required: false },
        alternatives: { type: 'string', required: false },
        parentStepId: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (!VALID_THINK_TYPES.includes(validation.data.type)) {
        return formatError('Invalid thinking type', `Type must be one of: ${VALID_THINK_TYPES.join(', ')}`)
      }

      const session = await loadSession(validation.data.sessionId)
      if (!session) {
        return formatError('Session not found', `No thinking session with ID: ${validation.data.sessionId}`)
      }

      const confidence = Math.min(100, Math.max(0, validation.data.confidence))
      const confInfo = getConfidenceInfo(confidence)

      const step: ThinkStep = {
        id: generateId(),
        stepNumber: session.steps.length + 1,
        title: validation.data.title,
        content: validation.data.content,
        type: validation.data.type,
        confidence,
        next: [],
        assumptions: validation.data.assumptions?.split(',').map((s: string) => s.trim()).filter(Boolean) || [],
        timestamp: new Date().toISOString(),
        parentId: validation.data.parentStepId
      }

      session.steps.push(step)
      session.lastUpdate = step.timestamp
      await saveSession(session)

      const altList = validation.data.alternatives?.split(',').map((s: string) => s.trim()).filter(Boolean) || []

      return formatSuccess({
        sessionId: validation.data.sessionId,
        stepSaved: true,
        stepNumber: step.stepNumber,
        stepId: step.id,
        totalSteps: session.steps.length,
        type: validation.data.type,
        typeEmoji: TYPE_EMOJIS[validation.data.type],
        confidence,
        confidenceLevel: confInfo.level,
        confidenceEmoji: confInfo.emoji,
        assumptionsCount: step.assumptions.length,
        hasAlternatives: altList.length > 0,
        recommendation: confidence < 50 
          ? '⚠️ 置信度很低，请考虑：1) 验证假设 2) 收集更多信息 3) 回溯重新思考'
          : confidence < 70 
          ? '💡 置信度中等，建议在后续步骤中专门验证'
          : session.steps.length >= session.metadata.recommendedSteps
          ? '✅ 可以进入批判性审查阶段了'
          : `✅ 继续下一步思考 (${session.steps.length}/${session.metadata.recommendedSteps} 步)`,
        stepPreview: {
          title: validation.data.title,
          contentPreview: validation.data.content.substring(0, 150)
        }
      })
    }
  })

  .addTool({
    name: 'thinking_review',
    description: 'Automated critical review of thinking chain - detects gaps, biases and logical errors',
    parameters: {
      sessionId: { type: 'string', description: 'Thinking session ID to review', required: true },
      focusAreas: { type: 'string', description: 'Comma-separated areas: logic, assumptions, bias, completeness, alternatives', required: false },
      strictness: { type: 'string', description: 'Review strictness: lenient, standard, strict', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sessionId: { type: 'string', required: true },
        focusAreas: { type: 'string', required: false, default: 'logic,assumptions,bias,completeness,alternatives' },
        strictness: { type: 'string', required: false, default: 'standard' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const session = await loadSession(validation.data.sessionId)
      if (!session) {
        return formatError('Session not found', `No thinking session with ID: ${validation.data.sessionId}`)
      }

      const focusList = validation.data.focusAreas.split(',').map((s: string) => s.trim())
      const strictMultiplier = validation.data.strictness === 'strict' ? 1.5 : 
                             validation.data.strictness === 'lenient' ? 0.7 : 1.0

      const findings: any[] = []
      let score = 100

      if (focusList.includes('completeness')) {
        const minSteps = session.metadata.recommendedSteps * 0.6 * strictMultiplier
        if (session.steps.length < minSteps) {
          score -= 20
          findings.push({
            severity: 'high',
            area: 'completeness',
            message: `思考深度不足：仅进行了 ${session.steps.length} 步，建议至少 ${Math.ceil(minSteps)} 步`,
            suggestion: '继续深入分解问题，不要急于得出结论'
          })
        } else {
          findings.push({
            severity: 'pass',
            area: 'completeness',
            message: `思考步数充足 (${session.steps.length} 步)`
          })
        }
      }

      if (focusList.includes('assumptions')) {
        const stepsWithoutAssumptions = session.steps.filter(s => s.assumptions.length === 0).length
        const ratio = stepsWithoutAssumptions / session.steps.length
        if (ratio > 0.5 * strictMultiplier) {
          score -= Math.round(ratio * 25)
          findings.push({
            severity: 'medium',
            area: 'assumptions',
            message: `${stepsWithoutAssumptions}/${session.steps.length} 步没有明确说明假设`,
            suggestion: '每一步推理都依赖隐含假设，把它们写出来能发现漏洞'
          })
        } else {
          findings.push({
            severity: 'pass',
            area: 'assumptions',
            message: `假设显性化做得很好`
          })
        }
      }

      if (focusList.includes('logic')) {
        const hasVerification = session.steps.some(s => s.type === 'verification')
        if (!hasVerification) {
          score -= 20
          findings.push({
            severity: 'high',
            area: 'logic',
            message: '缺少独立验证步骤',
            suggestion: '专门花一步来验证之前的推理，尝试证伪它'
          })
        } else {
          findings.push({
            severity: 'pass',
            area: 'logic',
            message: '包含验证步骤，符合科学思维方法'
          })
        }

        const lowConfSteps = session.steps.filter(s => s.confidence < 50).length
        if (lowConfSteps > 0) {
          score -= lowConfSteps * 5
          findings.push({
            severity: 'medium',
            area: 'logic',
            message: `存在 ${lowConfSteps} 个低置信度步骤 (<50%)`,
            suggestion: '低置信点往往是整个推理链中最脆弱的环节'
          })
        }
      }

      if (focusList.includes('alternatives')) {
        const hypothesisSteps = session.steps.filter(s => s.type === 'hypothesis').length
        if (hypothesisSteps < 2) {
          score -= 15
          findings.push({
            severity: 'medium',
            area: 'alternatives',
            message: '只考虑了少于2种可能的假设',
            suggestion: '避免隧道效应：强迫自己思考至少2-3种完全不同的可能性'
          })
        } else {
          findings.push({
            severity: 'pass',
            area: 'alternatives',
            message: `探索了多种假设 (${hypothesisSteps} 个)`
          })
        }
      }

      const biasWarnings = [
        '🔍 证实偏差？你是否只在寻找支持已有结论的证据？',
        '🔍 锚定效应？你是否过度依赖了最初的某个信息？',
        '🔍 易得性偏差？你是否偏好容易想到的答案？',
        '🔍 框架效应？问题的表述方式是否影响了你的判断？',
        '🔍 沉没成本谬误？会不会因为已经投入了就不愿改变方向？'
      ]

      session.status = 'reviewing'
      session.lastUpdate = new Date().toISOString()
      await saveSession(session)

      const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D'

      return formatSuccess({
        reviewed: true,
        sessionId: validation.data.sessionId,
        overallScore: Math.max(0, score),
        qualityGrade: grade,
        strictness: validation.data.strictness,
        stepsReviewed: session.steps.length,
        findings,
        cognitiveBiasCheck: biasWarnings,
        reviewSummary: `
📋 批判性审查完成 - 评分: ${Math.max(0, score)}/100 (${grade})

**关键发现摘要:**
${findings.filter(f => f.severity !== 'pass').map(f => `• [${f.severity.toUpperCase()}] ${f.message}`).join('\n') || '• 未发现重大问题'}

---

💡 黄金审查法则：
1. 慢即是快：把推理拆成最细的步骤
2. 假设万岁：把所有隐含假设写出来
3. 主动证伪：专门找自己错的证据
4. 并行探索：同时追踪多条推理路径
5. 元认知：思考你自己的思考过程

${score < 70 ? '⚠️ 建议先修复以上问题再得出结论！' : score < 85 ? '💡 可以改进，但可以继续了。' : '✅ 思考质量很高！'}
        `.trim()
      })
    }
  })

  .addTool({
    name: 'thinking_branch',
    description: 'Create branch in thinking - explore alternative reasoning paths',
    parameters: {
      sessionId: { type: 'string', description: 'Original thinking session ID', required: true },
      fromStepId: { type: 'string', description: 'Step ID to branch from', required: true },
      branchReason: { type: 'string', description: 'Why branching: assumption_changed, new_information, alternative_interpretation', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sessionId: { type: 'string', required: true },
        fromStepId: { type: 'string', required: true },
        branchReason: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const originalSession = await loadSession(validation.data.sessionId)
      if (!originalSession) {
        return formatError('Session not found', `No thinking session with ID: ${validation.data.sessionId}`)
      }

      const stepIndex = originalSession.steps.findIndex(s => s.id === validation.data.fromStepId)
      if (stepIndex === -1) {
        return formatError('Step not found', `Step ${validation.data.fromStepId} not in session`)
      }

      const branchSessionId = generateId()
      const now = new Date().toISOString()

      const branchedSession: ThinkingSession = {
        id: branchSessionId,
        problem: originalSession.problem + ' [BRANCHED]',
        context: `Branched from step ${stepIndex + 1} of session ${validation.data.sessionId}\nBranch reason: ${validation.data.branchReason}\n\n${originalSession.context}`,
        startTime: now,
        lastUpdate: now,
        steps: originalSession.steps.slice(0, stepIndex + 1),
        status: 'active',
        metadata: {
          ...originalSession.metadata,
          branchedFrom: validation.data.sessionId,
          branchedStep: validation.data.fromStepId,
          branchReason: validation.data.branchReason
        }
      }

      await saveSession(branchedSession)

      return formatSuccess({
        branched: true,
        originalSessionId: validation.data.sessionId,
        branchSessionId,
        branchedFromStep: stepIndex + 1,
        branchReason: validation.data.branchReason,
        stepsCarriedOver: stepIndex + 1,
        recommendation: 'Continue thinking on the new branch. This is how real thinking works - you don\'t have to be right the first time!'
      })
    }
  })

  .addTool({
    name: 'thinking_conclude',
    description: 'Conclude thinking session with structured final report',
    parameters: {
      sessionId: { type: 'string', description: 'Thinking session ID', required: true },
      finalAnswer: { type: 'string', description: 'Final answer or conclusion', required: true },
      overallConfidence: { type: 'number', description: 'Overall confidence 0-100', required: true },
      remainingUncertainties: { type: 'string', description: 'Comma-separated remaining uncertainties', required: false },
      alternativeConclusions: { type: 'string', description: 'Comma-separated alternative conclusions considered', required: false },
      followUpActions: { type: 'string', description: 'Comma-separated recommended follow-up actions', required: false },
      skipReviewWarning: { type: 'boolean', description: 'Skip review requirement (not recommended)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sessionId: { type: 'string', required: true },
        finalAnswer: { type: 'string', required: true },
        overallConfidence: { type: 'number', required: true },
        remainingUncertainties: { type: 'string', required: false },
        alternativeConclusions: { type: 'string', required: false },
        followUpActions: { type: 'string', required: false },
        skipReviewWarning: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const session = await loadSession(validation.data.sessionId)
      if (!session) {
        return formatError('Session not found', `No thinking session with ID: ${validation.data.sessionId}`)
      }

      if (session.status !== 'reviewing' && !validation.data.skipReviewWarning) {
        return formatError(
          'Critical review required',
          'You must run thinking_review before concluding. Use skipReviewWarning=true to bypass.'
        )
      }

      const uncertainties = validation.data.remainingUncertainties?.split(',').map((s: string) => s.trim()).filter(Boolean) || []
      const alternatives = validation.data.alternativeConclusions?.split(',').map((s: string) => s.trim()).filter(Boolean) || []
      const followUps = validation.data.followUpActions?.split(',').map((s: string) => s.trim()).filter(Boolean) || []
      const confidence = Math.min(100, Math.max(0, validation.data.overallConfidence))
      const grade = confidence >= 95 ? 'S' : confidence >= 90 ? 'A+' : confidence >= 80 ? 'A' : 
                     confidence >= 70 ? 'B' : confidence >= 60 ? 'C' : 'D'

      session.status = 'completed'
      session.lastUpdate = new Date().toISOString()
      session.metadata.finalConfidence = confidence
      session.metadata.grade = grade
      await saveSession(session)

      const thinkingTime = Math.round((new Date(session.lastUpdate).getTime() - new Date(session.startTime).getTime()) / 1000 / 60)

      return formatSuccess({
        concluded: true,
        sessionId: validation.data.sessionId,
        thinkingComplete: true,
        finalReport: {
          originalProblem: session.problem,
          totalThinkingSteps: session.steps.length,
          thinkingTimeMinutes: thinkingTime,
          finalAnswer: validation.data.finalAnswer,
          overallConfidence: confidence,
          confidenceGrade: grade,
          remainingUncertainties: uncertainties,
          alternativeConclusionsConsidered: alternatives,
          followUpActions: followUps
        },
        qualityIndicators: {
          completedCriticalReview: session.status === 'completed' || session.status === 'reviewing',
          explicitUncertainties: uncertainties.length > 0 ? '✅ 已说明不确定性' : '💡 诚实地说明不知道什么比假装全知更重要',
          consideredAlternatives: alternatives.length > 0 ? `✅ 考虑了 ${alternatives.length} 个备选答案` : '💡 强迫自己思考其他可能',
          hasFollowUps: followUps.length > 0 ? `✅ 有 ${followUps.length} 项后续行动` : '💡 思考的终点应该是行动'
        },
        closingRemarks: `
🧠 深度思考完成！

**最终置信度: ${confidence}% (${grade})**
• 总思考步数: ${session.steps.length} 步
• 用时估算: ~${thinkingTime} 分钟
• 遗留不确定性: ${uncertainties.length} 项
• 备选方案: ${alternatives.length} 个

---

✨ 思考的真正胜利：
你不是更确定自己是对的，而是更清楚自己为什么是对的（以及什么时候可能是错的）。

${confidence >= 90 ? '🏆 非常高的置信度！但永远保持开放。' : 
  confidence >= 70 ? '✅ 可以采纳结论。继续收集数据来迭代。' :
  '⚠️ 置信度较低。建议作为假设而非结论。'}
        `.trim()
      })
    }
  })

  .addTool({
    name: 'thinking_load',
    description: 'Load and inspect existing thinking session',
    parameters: {
      sessionId: { type: 'string', description: 'Thinking session ID', required: true },
      includeFullSteps: { type: 'boolean', description: 'Include full step content', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sessionId: { type: 'string', required: true },
        includeFullSteps: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const session = await loadSession(validation.data.sessionId)
      if (!session) {
        return formatError('Session not found', `No thinking session with ID: ${validation.data.sessionId}`)
      }

      return formatSuccess({
        loaded: true,
        sessionId: validation.data.sessionId,
        problem: session.problem,
        status: session.status,
        startTime: session.startTime,
        lastUpdate: session.lastUpdate,
        totalSteps: session.steps.length,
        metadata: session.metadata,
        stepSummary: session.steps.map(s => ({
          step: s.stepNumber,
          id: s.id,
          type: s.type,
          title: s.title,
          confidence: s.confidence,
          assumptions: s.assumptions.length,
          content: validation.data.includeFullSteps ? s.content : s.content.substring(0, 80) + '...'
        })),
        storageLocation: path.join(THINKING_DIR, `${validation.data.sessionId}.json`)
      })
    }
  })

  .addTool({
    name: 'thinking_list',
    description: 'List all thinking sessions',
    parameters: {
      limit: { type: 'number', description: 'Maximum sessions to list', required: false },
      status: { type: 'string', description: 'Filter by status: active, reviewing, completed', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        limit: { type: 'number', required: false, default: 20 },
        status: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      await ensureThinkingDir()
      const files = await fs.readdir(THINKING_DIR)
      const sessions: any[] = []

      for (const file of files.filter(f => f.endsWith('.json')).slice(0, validation.data.limit)) {
        try {
          const content = await fs.readFile(path.join(THINKING_DIR, file), 'utf8')
          const s = JSON.parse(content)
          if (!validation.data.status || s.status === validation.data.status) {
            sessions.push({
              id: s.id,
              problem: s.problem.substring(0, 60),
              status: s.status,
              steps: s.steps.length,
              startTime: s.startTime,
              grade: s.metadata?.grade
            })
          }
        } catch {}
      }

      sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

      return formatSuccess({
        totalSessions: sessions.length,
        filteredByStatus: validation.data.status,
        sessions: sessions.slice(0, validation.data.limit)
      })
    }
  })

  .addResource({
    name: 'cognitive-bias-reference',
    uri: 'docs://thinking/cognitive-biases',
    description: 'Cognitive Biases Reference Card',
    mimeType: 'text/markdown',
    get: async () => `
## 🧠 认知偏差速查表

### 最影响推理的 10 种偏差

| 偏差 | 表现 | 防御策略 |
|------|------|----------|
| **证实偏差** | 只找支持自己结论的证据 | 主动寻找证伪证据 |
| **锚定效应** | 过度依赖最初信息 | 生成至少3种完全不同的起点 |
| **易得性偏差** | 偏好容易想到/记忆深刻的答案 | 使用基线数据和外部参考 |
| **框架效应** | 受问题表述方式影响 | 用不同方式重述问题 |
| **沉没成本** | 不愿放弃已经投入的路径 | 从零开始重新评估 |
| **过度自信** | 高估自己判断的准确性 | 减掉10-20%的置信度 |
| **从众效应** | 跟随多数人的观点 | 独立评估再看共识 |
| **光环效应** | 被某一优点影响全局判断 | 分解维度逐项评分 |
| **盲点偏差** | 只看到别人的偏差 | 假设自己也有偏差 |
| **结果偏差** | 以结果好坏评判决策质量 | 评估决策过程本身 |

---

### 🛡️ 通用防御策略
1. **元认知**: 思考"我为什么会这么想？"
2. **事前验尸**: 假设结论是错的，找出可能的原因
3. **反向思考**: 尝试证明自己是错的
4. **第三方视角**: 想象这是朋友的问题，你会怎么建议
5. **延迟判断**: 睡一觉再说
    `.trim()
  })

  .addPrompt({
    name: 'advanced-cot-framework',
    description: 'Full Chain-of-Thought Prompt Engineering Template',
    arguments: [
      { name: 'problem', description: 'The complex problem to solve', required: true }
    ],
    generate: async (args?: Record<string, any>) => `
## 🧠 高级思维链工作流: ${args?.problem || 'Problem'}

### ⚙️ 系统指令 - 强制执行
从现在开始，你要像一个严谨的科学家那样思考。
你必须**严格走完下面的每一步流程**，不允许跳步。
你必须**对每一步都诚实给出置信度**，不要虚高。
你必须**把所有隐含假设写出来**，这是发现漏洞的关键。

---

### 📌 执行流程

1. **初始化会话**
\`\`\`
thinking_start
  problem: "${args?.problem || ''}"
  context: "把你现在知道的所有相关信息写在这里"
  expectedComplexity: "complex"
\`\`\`

2. **分解并探索**
对每个思考节点单独调用:
\`\`\`
thinking_add_step
  sessionId: "从第一步获取"
  type: observation | reasoning | hypothesis
  title: "本步的标题"
  content: "详细的思考内容"
  confidence: 0-100之间的数字
  assumptions: "本步依赖的假设，用逗号分隔"
\`\`\`

3. **强制执行审查**
在得出结论前必须调用:
\`\`\`
thinking_review
  sessionId: "..."
  strictness: "standard"
\`\`\`

4. **修复问题后审查通过**

5. **得出最终结论**
\`\`\`
thinking_conclude
  sessionId: "..."
  finalAnswer: "你的最终答案"
  overallConfidence: 0-100
  remainingUncertainties: "还有哪些点不100%确定"
\`\`\`

---

⚠️ 最终警告：
直接给出答案 = 0分
走完流程但不诚实 = 20分
诚实写出不确定性和假设 = 100分
    `.trim()
  })
  .build()