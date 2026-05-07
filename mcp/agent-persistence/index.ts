import crypto from 'crypto';
import { createMCPServer } from '../../packages/core/mcp/builder';
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ReflectionLog {
  id: string;
  timestamp: number;
  taskDescription: string;
  executionProcess: string;
  finalOutcome: string;
  duration?: string;
  whatWentWell: string[];
  whatWentWrong: string[];
  keyLessons: string[];
  improvements: string[];
  implemented: boolean;
}

interface DecisionRecord {
  id: string;
  timestamp: number;
  topic: string;
  experts: string[];
  optionsConsidered: string[];
  finalDecision: string;
  justification: string;
  nextSteps: string[];
  reviewDate?: string;
  qualityScore?: number;
}

interface TaskRecord {
  id: string;
  objective: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  tasks: any[];
  completedTasks: string[];
  failedTasks: string[];
  toolCalls: any[];
  reflections: string[];
  agentInteractions: any[];
}

const STORAGE_DIR = path.join(process.cwd(), '.agent-storage');

async function ensureStorageDir() {
  try {
    await fs.access(STORAGE_DIR);
  } catch {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  }
  await ensureSubDir('tasks');
  await ensureSubDir('reflections');
  await ensureSubDir('decisions');
  await ensureSubDir('logs');
}

async function ensureSubDir(dir: string) {
  const fullPath = path.join(STORAGE_DIR, dir);
  try {
    await fs.access(fullPath);
  } catch {
    await fs.mkdir(fullPath, { recursive: true });
  }
}

function generateId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export default createMCPServer({
  name: 'agent-persistence',
  version: '3.0.0',
  description: '持久化存储系统 - 任务、反思、决策历史存储',
  author: 'MCP Expert Community',
  icon: '💾'
})
  .addTool({
    name: 'save_task',
    description: '保存任务记录',
    parameters: {
      objective: { type: 'string', description: '任务目标', required: true },
      tasks: { type: 'array', description: '任务列表', required: false },
      status: { type: 'string', description: '任务状态', enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'in_progress' },
      metadata: { type: 'object', description: '附加元数据', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        objective: { type: 'string', required: true },
        tasks: { type: 'array', required: false },
        status: { type: 'string', required: false, enum: ['pending', 'in_progress', 'completed', 'failed'] },
        metadata: { type: 'object', required: false }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      await ensureStorageDir();

      const taskRecord: TaskRecord = {
        id: generateId(),
        objective: validation.data.objective,
        startTime: Date.now(),
        status: validation.data.status || 'in_progress',
        tasks: validation.data.tasks || [],
        completedTasks: [],
        failedTasks: [],
        toolCalls: [],
        reflections: [],
        agentInteractions: [],
        ...validation.data.metadata
      };

      const filePath = path.join(STORAGE_DIR, 'tasks', `${taskRecord.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(taskRecord, null, 2));

      return formatSuccess({
        saved: true,
        taskId: taskRecord.id,
        filePath,
        taskRecord,
        recommendations: [
          '继续更新任务进度',
          '添加工具调用记录',
          '完成后保存最终状态'
        ]
      });
    }
  })
  .addTool({
    name: 'update_task',
    description: '更新任务记录',
    parameters: {
      taskId: { type: 'string', description: '任务ID', required: true },
      updates: { type: 'object', description: '更新内容', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        taskId: { type: 'string', required: true },
        updates: { type: 'object', required: true }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      await ensureStorageDir();

      const filePath = path.join(STORAGE_DIR, 'tasks', `${validation.data.taskId}.json`);
      
      try {
        const existingData = await fs.readFile(filePath, 'utf-8');
        const taskRecord = JSON.parse(existingData) as TaskRecord;
        
        const updatedTask = {
          ...taskRecord,
          ...validation.data.updates,
          updatedAt: Date.now()
        };

        if (validation.data.updates.status === 'completed' || validation.data.updates.status === 'failed') {
          updatedTask.endTime = Date.now();
        }

        await fs.writeFile(filePath, JSON.stringify(updatedTask, null, 2));

        return formatSuccess({
          updated: true,
          taskId: validation.data.taskId,
          updatedTask,
          recommendations: [
            '继续更新其他字段',
            '考虑添加反思记录',
            '检查是否需要保存决策'
          ]
        });
      } catch (error) {
        return formatError('Failed to update task', {
          taskId: validation.data.taskId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  })
  .addTool({
    name: 'get_task',
    description: '获取任务记录',
    parameters: {
      taskId: { type: 'string', description: '任务ID', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        taskId: { type: 'string', required: true }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const filePath = path.join(STORAGE_DIR, 'tasks', `${validation.data.taskId}.json`);
      
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        const taskRecord = JSON.parse(data);
        
        return formatSuccess({
          found: true,
          taskId: validation.data.taskId,
          taskRecord
        });
      } catch (error) {
        return formatError('Task not found', {
          taskId: validation.data.taskId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  })
  .addTool({
    name: 'list_tasks',
    description: '列出所有任务记录',
    parameters: {
      status: { type: 'string', description: '按状态过滤', required: false },
      limit: { type: 'number', description: '返回数量限制', default: 50, required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        status: { type: 'string', required: false },
        limit: { type: 'number', required: false, min: 1, max: 1000 }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      await ensureStorageDir();
      
      const tasksDir = path.join(STORAGE_DIR, 'tasks');
      
      try {
        const files = await fs.readdir(tasksDir);
        let taskRecords: TaskRecord[] = [];

        for (const file of files) {
          if (file.endsWith('.json')) {
            const data = await fs.readFile(path.join(tasksDir, file), 'utf-8');
            taskRecords.push(JSON.parse(data));
          }
        }

        taskRecords.sort((a, b) => b.startTime - a.startTime);

        if (validation.data.status) {
          taskRecords = taskRecords.filter(t => t.status === validation.data.status);
        }

        const limit = validation.data.limit || 50;
        taskRecords = taskRecords.slice(0, limit);

        return formatSuccess({
          count: taskRecords.length,
          totalFiles: files.length,
          tasks: taskRecords.map(t => ({
            id: t.id,
            objective: t.objective,
            status: t.status,
            startTime: t.startTime,
            endTime: t.endTime
          }))
        });
      } catch (error) {
        return formatSuccess({
          count: 0,
          tasks: [],
          message: 'No tasks found or storage not initialized'
        });
      }
    }
  })
  .addTool({
    name: 'save_reflection',
    description: '保存反思记录',
    parameters: {
      taskDescription: { type: 'string', description: '任务描述', required: true },
      executionProcess: { type: 'string', description: '执行过程', required: true },
      finalOutcome: { type: 'string', description: '最终结果', required: true },
      whatWentWell: { type: 'array', description: '成功之处', required: false },
      whatWentWrong: { type: 'array', description: '不足之外', required: false },
      keyLessons: { type: 'array', description: '关键教训', required: false },
      improvements: { type: 'array', description: '改进建议', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        taskDescription: { type: 'string', required: true },
        executionProcess: { type: 'string', required: true },
        finalOutcome: { type: 'string', required: true },
        whatWentWell: { type: 'array', required: false },
        whatWentWrong: { type: 'array', required: false },
        keyLessons: { type: 'array', required: false },
        improvements: { type: 'array', required: false }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      await ensureStorageDir();

      const reflectionLog: ReflectionLog = {
        id: generateId(),
        timestamp: Date.now(),
        taskDescription: validation.data.taskDescription,
        executionProcess: validation.data.executionProcess,
        finalOutcome: validation.data.finalOutcome,
        whatWentWell: validation.data.whatWentWell || [],
        whatWentWrong: validation.data.whatWentWrong || [],
        keyLessons: validation.data.keyLessons || [],
        improvements: validation.data.improvements || [],
        implemented: false
      };

      const filePath = path.join(STORAGE_DIR, 'reflections', `${reflectionLog.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(reflectionLog, null, 2));

      return formatSuccess({
        saved: true,
        reflectionId: reflectionLog.id,
        filePath,
        reflectionLog,
        recommendations: [
          '标记改进为已实现',
          '关联到任务记录',
          '定期回顾反思历史'
        ]
      });
    }
  })
  .addTool({
    name: 'save_decision',
    description: '保存决策记录',
    parameters: {
      topic: { type: 'string', description: '决策主题', required: true },
      experts: { type: 'array', description: '参与专家', required: true },
      optionsConsidered: { type: 'array', description: '考虑的选项', required: true },
      finalDecision: { type: 'string', description: '最终决策', required: true },
      justification: { type: 'string', description: '决策理由', required: false },
      nextSteps: { type: 'array', description: '下一步行动', required: false },
      qualityScore: { type: 'number', description: '质量评分', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        topic: { type: 'string', required: true },
        experts: { type: 'array', required: true },
        optionsConsidered: { type: 'array', required: true },
        finalDecision: { type: 'string', required: true },
        justification: { type: 'string', required: false },
        nextSteps: { type: 'array', required: false },
        qualityScore: { type: 'number', required: false, min: 0, max: 100 }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      await ensureStorageDir();

      const decisionRecord: DecisionRecord = {
        id: generateId(),
        timestamp: Date.now(),
        topic: validation.data.topic,
        experts: validation.data.experts,
        optionsConsidered: validation.data.optionsConsidered,
        finalDecision: validation.data.finalDecision,
        justification: validation.data.justification || '',
        nextSteps: validation.data.nextSteps || [],
        qualityScore: validation.data.qualityScore
      };

      const filePath = path.join(STORAGE_DIR, 'decisions', `${decisionRecord.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(decisionRecord, null, 2));

      return formatSuccess({
        saved: true,
        decisionId: decisionRecord.id,
        filePath,
        decisionRecord,
        recommendations: [
          '执行下一步行动',
          '记录决策执行结果',
          '定期回顾历史决策'
        ]
      });
    }
  })
  .addTool({
    name: 'get_reflections',
    description: '获取反思记录列表',
    parameters: {
      limit: { type: 'number', description: '返回数量', default: 20, required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        limit: { type: 'number', required: false, min: 1, max: 1000 }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      await ensureStorageDir();
      
      const reflectionsDir = path.join(STORAGE_DIR, 'reflections');
      
      try {
        const files = await fs.readdir(reflectionsDir);
        let reflections: ReflectionLog[] = [];

        for (const file of files) {
          if (file.endsWith('.json')) {
            const data = await fs.readFile(path.join(reflectionsDir, file), 'utf-8');
            reflections.push(JSON.parse(data));
          }
        }

        reflections.sort((a, b) => b.timestamp - a.timestamp);
        const limit = validation.data.limit || 20;
        reflections = reflections.slice(0, limit);

        return formatSuccess({
          count: reflections.length,
          reflections: reflections.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            taskDescription: r.taskDescription,
            finalOutcome: r.finalOutcome,
            keyLessons: r.keyLessons.length,
            implemented: r.implemented
          })),
          patternAnalysis: {
            totalReflections: reflections.length,
            implementedImprovements: reflections.filter(r => r.implemented).length,
            commonLessons: getCommonLessons(reflections)
          }
        });
      } catch (error) {
        return formatSuccess({
          count: 0,
          reflections: [],
          message: 'No reflections found or storage not initialized'
        });
      }
    }
  })
  .addTool({
    name: 'get_storage_stats',
    description: '获取存储统计信息',
    parameters: {},
    execute: async () => {
      await ensureStorageDir();

      const taskCount = await countFilesInDir('tasks');
      const reflectionCount = await countFilesInDir('reflections');
      const decisionCount = await countFilesInDir('decisions');

      return formatSuccess({
        stats: {
          tasks: taskCount,
          reflections: reflectionCount,
          decisions: decisionCount,
          totalRecords: taskCount + reflectionCount + decisionCount
        },
        storageDir: STORAGE_DIR,
        recommendations: [
          '定期清理旧数据',
          '备份重要数据',
          '考虑归档历史记录'
        ]
      });
    }
  })
  .build();

async function countFilesInDir(dir: string): Promise<number> {
  try {
    const files = await fs.readdir(path.join(STORAGE_DIR, dir));
    return files.filter(f => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function getCommonLessons(reflections: ReflectionLog[]): string[] {
  const allLessons = reflections.flatMap(r => r.keyLessons);
  const counts: Record<string, number> = {};
  
  for (const lesson of allLessons) {
    counts[lesson] = (counts[lesson] || 0) + 1;
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([lesson]) => lesson);
}
