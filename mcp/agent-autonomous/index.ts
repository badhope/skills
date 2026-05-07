import crypto from 'crypto'
import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec, sanitizePath } from '../../packages/core/shared/utils'
import * as fs from 'fs/promises'
import path from 'path'

interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  priority: number
  dependencies: string[]
  result?: string
  createdAt: number
  completedAt?: number
}

interface AgentState {
  objective: string
  tasks: Task[]
  iteration: number
  maxIterations: number
  isRunning: boolean
  completedTasks: string[]
  failedTasks: string[]
}

function generateTaskId(): string {
  return 'task_' + Date.now().toString(36) + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

export default createMCPServer({
  name: 'autonomous-agent',
  version: '2.0.0',
  description: 'Professional Autonomous Agent Framework - BabyAGI inspired task loop with self-directed goal execution',
  author: 'MCP Expert Community',
  icon: '🤖'
})

  .addTool({
    name: 'initialize_objective',
    description: 'Initialize autonomous agent with main objective - Start BabyAGI task execution loop',
    parameters: {
      objective: { type: 'string', description: 'The main goal to achieve', required: true },
      maxIterations: { type: 'number', description: 'Maximum iterations (default 20)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        objective: { type: 'string', required: true },
        maxIterations: { type: 'number', required: false, default: 20, min: 1, max: 100 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const initialTasks: Task[] = [
        {
          id: generateTaskId(),
          title: 'Analyze objective and create task breakdown',
          description: `Analyze: "${validation.data.objective}". Break into 3-5 specific, actionable subtasks with clear success criteria.`,
          status: 'pending',
          priority: 10,
          dependencies: [],
          createdAt: Date.now()
        }
      ]
      const state: AgentState = {
        objective: validation.data.objective,
        tasks: initialTasks,
        iteration: 0,
        maxIterations: validation.data.maxIterations,
        isRunning: true,
        completedTasks: [],
        failedTasks: []
      }
      return formatSuccess({
        agentStarted: true,
        state,
        nextStep: `
## 🤖 Autonomous Agent Initialized

**🎯 Objective:** ${validation.data.objective}

**📋 Execute the following workflow repeatedly:**

1. 🔍 Select highest priority READY task (no uncompleted dependencies)
2. ⚡ Execute this task thoroughly with proper tool usage
3. ✅ Call complete_task with execution result
4. 🧠 Call process_task_result to generate new tasks
5. 🔄 Repeat until objective is achieved

⚠️ Stop condition: ${validation.data.maxIterations} iterations OR objective achieved OR no meaningful progress
        `.trim(),
        frameworkGuidelines: [
          'Each task must have a clear "done" criteria',
          'Always generate 2-3 follow-up tasks after completion',
          'Prioritize tasks that reduce uncertainty',
          'Document all key findings and decisions'
        ]
      })
    }
  })

  .addTool({
    name: 'generate_next_tasks',
    description: 'Generate new tasks based on completed task result - BabyAGI task creation',
    parameters: {
      objective: { type: 'string', description: 'Main objective', required: true },
      completedTaskResult: { type: 'string', description: 'Result from previous task', required: true },
      currentTaskList: { type: 'string', description: 'JSON string of current tasks array', required: true },
      taskCount: { type: 'number', description: 'Number of tasks to generate', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        objective: { type: 'string', required: true },
        completedTaskResult: { type: 'string', required: true },
        currentTaskList: { type: 'string', required: true },
        taskCount: { type: 'number', required: false, default: 3, min: 1, max: 5 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let tasks: Task[] = []
      try {
        tasks = JSON.parse(validation.data.currentTaskList)
      } catch (e) {
        return formatError('Invalid task list JSON', { error: String(e) })
      }

      const existingTitles = new Set(tasks.map(t => t.title.toLowerCase()))
      const newTasks: Task[] = []

      for (let i = 0; i < validation.data.taskCount; i++) {
        const newTask: Task = {
          id: generateTaskId(),
          title: `Follow-up task ${i + 1} from previous execution`,
          description: `Based on result: ${validation.data.completedTaskResult.slice(0, 200)}...
          
Purpose: Advance toward: ${validation.data.objective}
Action: Execute the next logical step based on findings`,
          status: 'pending',
          priority: Math.max(1, 10 - tasks.length - i),
          dependencies: [],
          createdAt: Date.now()
        }
        if (!existingTitles.has(newTask.title.toLowerCase())) {
          newTasks.push(newTask)
        }
      }

      return formatSuccess({
        generated: newTasks.length,
        newTasks,
        generationGuidelines: [
          'Refine these generic titles to be specific and actionable',
          'Add explicit dependencies to enforce execution order',
          'Set priority based on impact and urgency',
          'Include verification/validation steps'
        ],
        pruneStrategy: [
          'Remove duplicate or overlapping tasks',
          'Deprioritize low-impact investigative tasks',
          'Combine similar tasks where possible'
        ]
      })
    }
  })

  .addTool({
    name: 'prioritize_tasks',
    description: 'Re-prioritize task list using execution-aware heuristics - Eisenhower Matrix style',
    parameters: {
      objective: { type: 'string', description: 'Main objective', required: true },
      taskList: { type: 'string', description: 'JSON string of tasks array', required: true },
      strategy: { type: 'string', description: 'Priority strategy: impact, effort, risk, dependency', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        objective: { type: 'string', required: true },
        taskList: { type: 'string', required: true },
        strategy: { type: 'string', required: false, default: 'impact', enum: ['impact', 'effort', 'risk', 'dependency'] }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let tasks: Task[] = []
      try {
        tasks = JSON.parse(validation.data.taskList)
      } catch (e) {
        return formatError('Invalid task list JSON', { error: String(e) })
      }

      const prioritized = tasks.map((task: Task) => {
        let score = task.priority
        const deps = task.dependencies?.length || 0
        const hasResult = task.result ? 1 : 0
        
        if (validation.data.strategy === 'dependency') {
          score += deps * 2
        } else if (validation.data.strategy === 'impact') {
          score -= deps
          score += hasResult * 5
        }
        
        return { ...task, calculatedPriority: score }
      }).sort((a: any, b: any) => b.calculatedPriority - a.calculatedPriority)

      return formatSuccess({
        prioritized: true,
        strategy: validation.data.strategy,
        orderedTasks: prioritized,
        matrixAdvice: `
### 📊 Eisenhower Matrix Application

**DO FIRST (High Impact, Low Effort):**
- Tasks that unblock other tasks
- Tasks with clear, verifiable outcomes

**SCHEDULE (High Impact, High Effort):**
- Complex implementation tasks
- Architecture and design work

**DELEGATE (Low Impact, Low Effort):**
- Documentation, cleanup, boilerplate
- Research with limited scope

**ELIMINATE (Low Impact, High Effort):**
- Nice-to-have features not critical for objective
- Over-engineering and premature optimization
        `,
        warningSigns: [
          prioritized.filter((t: Task) => t.status === 'pending').length > 10 ? '⚠️ Task queue >10 - consider pruning' : '',
          prioritized.filter((t: Task) => !t.description || t.description.length < 20).length > 0 ? '⚠️ Tasks missing descriptions' : ''
        ].filter(Boolean)
      })
    }
  })

  .addTool({
    name: 'mark_task_complete',
    description: 'Mark task as completed with execution result and learnings',
    parameters: {
      taskId: { type: 'string', description: 'ID of the completed task', required: true },
      result: { type: 'string', description: 'Execution result, findings, and key outputs', required: true },
      taskList: { type: 'string', description: 'JSON string of current tasks array', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        taskId: { type: 'string', required: true },
        result: { type: 'string', required: true },
        taskList: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let tasks: Task[] = []
      try {
        tasks = JSON.parse(validation.data.taskList)
      } catch (e) {
        return formatError('Invalid task list JSON', { error: String(e) })
      }

      const updated = tasks.map((task: Task) => {
        if (task.id === validation.data.taskId) {
          return {
            ...task,
            status: 'completed' as const,
            result: validation.data.result,
            completedAt: Date.now()
          }
        }
        return task
      })

      return formatSuccess({
        completed: true,
        taskId: validation.data.taskId,
        updatedTasks: updated,
        completionChecklist: [
          '✅ Task has verifiable output artifact?',
          '✅ All acceptance criteria met?',
          '✅ Blocked tasks now unblocked?',
          '✅ Key decisions documented?',
          '✅ Lessons learned captured?'
        ],
        nextAction: 'Call generate_next_tasks OR process_task_result to continue execution loop'
      })
    }
  })

  .addTool({
    name: 'execution_review',
    description: 'Review progress, detect stagnation, and evaluate termination conditions',
    parameters: {
      objective: { type: 'string', description: 'Main objective', required: true },
      taskList: { type: 'string', description: 'JSON string of tasks array', required: true },
      iteration: { type: 'number', description: 'Current iteration count', required: true },
      maxIterations: { type: 'number', description: 'Maximum allowed iterations', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        objective: { type: 'string', required: true },
        taskList: { type: 'string', required: true },
        iteration: { type: 'number', required: true, min: 0 },
        maxIterations: { type: 'number', required: true, min: 1 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      let tasks: Task[] = []
      try {
        tasks = JSON.parse(validation.data.taskList)
      } catch (e) {
        return formatError('Invalid task list JSON', { error: String(e) })
      }

      const completed = tasks.filter((t: Task) => t.status === 'completed').length
      const pending = tasks.filter((t: Task) => t.status === 'pending').length
      const failed = tasks.filter((t: Task) => t.status === 'failed').length
      const progress = tasks.length > 0 ? completed / tasks.length : 0

      const warnings: string[] = []
      if (validation.data.iteration >= validation.data.maxIterations) {
        warnings.push('🛑 MAX ITERATIONS REACHED - Consider objective achieved or pivot')
      }
      if (pending === 0 && completed > 0) {
        warnings.push('✅ No pending tasks - Objective may be complete!')
      }
      if (progress > 0.8) {
        warnings.push('🎯 High completion rate - Begin final validation and wrap-up')
      }
      if (completed === 0 && validation.data.iteration > 3) {
        warnings.push('⚠️ STAGNATION DETECTED - No completed tasks after 3 iterations')
      }

      return formatSuccess({
        reviewed: true,
        iteration: validation.data.iteration,
        maxIterations: validation.data.maxIterations,
        stats: { total: tasks.length, completed, pending, failed, progress: `${(progress * 100).toFixed(1)}%` },
        warnings,
        recommendations: warnings.length > 0 ? [
          'Verify objective completion criteria explicitly',
          'Generate final summary and validation checklist',
          'Document remaining open items and tech debt'
        ] : [
          'Continue execution loop',
          'Ensure each task produces verifiable output',
          'Maintain momentum on high-priority items'
        ]
      })
    }
  })

  .build()