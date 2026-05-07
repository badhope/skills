import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { TaskContext, TaskStep, TaskResult, WorkflowPhase, WorkflowStep } from './types';

export interface TaskState {
  taskId: string;
  description: string;
  complexity: number;
  currentSkill: string;
  currentPhase?: string;
  currentStep?: string;
  history: TaskStep[];
  results: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
}

export interface TaskHistoryEntry {
  timestamp: Date;
  action: string;
  detail: string;
}

export interface ResumeResult {
  success: boolean;
  taskId: string;
  state?: TaskState;
  message?: string;
  stepsToResume?: number;
}

export class TaskStateManager {
  private storagePath: string;
  private stateCache: Map<string, TaskState> = new Map();

  constructor(storagePath: string = './.agent-skills/tasks') {
    this.storagePath = storagePath;
    this.initStorage().catch(console.error);
  }

  private async initStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (e) {
      console.error('Failed to initialize task storage:', e);
    }
  }

  async save(state: TaskState): Promise<void> {
    state.updatedAt = new Date();
    this.stateCache.set(state.taskId, state);

    const filePath = this.getTaskFilePath(state.taskId);
    const data = JSON.stringify(state, (key, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      return value;
    }, 2);

    try {
      await fs.writeFile(filePath, data, 'utf8');
    } catch (e) {
      console.error(`Failed to save task ${state.taskId}:`, e);
      throw e;
    }
  }

  async load(taskId: string): Promise<TaskState | null> {
    const cached = this.stateCache.get(taskId);
    if (cached) {
      return cached;
    }

    const filePath = this.getTaskFilePath(taskId);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const state = JSON.parse(data, (key, value) => {
        if (value && value.__type === 'Date') {
          return new Date(value.value);
        }
        return value;
      }) as TaskState;
      
      this.stateCache.set(taskId, state);
      return state;
    } catch (e) {
      if ((e as Error).message.includes('ENOENT')) {
        return null;
      }
      console.error(`Failed to load task ${taskId}:`, e);
      return null;
    }
  }

  async resume(taskId: string): Promise<ResumeResult> {
    const state = await this.load(taskId);
    
    if (!state) {
      return {
        success: false,
        taskId,
        message: 'Task not found'
      };
    }

    if (state.status === 'completed') {
      return {
        success: false,
        taskId,
        message: 'Task already completed'
      };
    }

    if (state.status === 'failed' && state.retryCount >= state.maxRetries) {
      return {
        success: false,
        taskId,
        message: 'Task has reached maximum retries'
      };
    }

    state.status = 'in_progress';
    state.startedAt = state.startedAt || new Date();
    await this.save(state);

    const stepsToResume = state.history.length;

    return {
      success: true,
      taskId,
      state,
      stepsToResume
    };
  }

  async pause(taskId: string, reason?: string): Promise<boolean> {
    const state = await this.load(taskId);
    
    if (!state) {
      return false;
    }

    if (state.status === 'completed' || state.status === 'failed') {
      return false;
    }

    state.status = 'paused';
    state.error = reason;
    await this.save(state);
    
    return true;
  }

  async complete(taskId: string, result: TaskResult): Promise<void> {
    const state = await this.load(taskId);
    
    if (!state) {
      return;
    }

    state.status = result.success ? 'completed' : 'failed';
    state.completedAt = new Date();
    state.error = result.error;
    
    for (const step of result.steps) {
      if (!state.history.find(h => h.skillName === step.skillName && h.input === step.input)) {
        state.history.push(step);
      }
    }

    Object.assign(state.results, result.data);
    
    await this.save(state);
  }

  async updateProgress(taskId: string, phase?: string, step?: string): Promise<void> {
    const state = await this.load(taskId);
    
    if (!state) {
      return;
    }

    if (phase) state.currentPhase = phase;
    if (step) state.currentStep = step;
    state.updatedAt = new Date();
    
    await this.save(state);
  }

  async recordStep(taskId: string, step: TaskStep): Promise<void> {
    const state = await this.load(taskId);
    
    if (!state) {
      return;
    }

    state.history.push(step);
    state.updatedAt = new Date();
    
    if (step.status === 'failed') {
      state.retryCount++;
      state.error = step.output?.error;
    }
    
    await this.save(state);
  }

  async getTaskList(status?: TaskState['status']): Promise<TaskState[]> {
    try {
      const files = await fs.readdir(this.storagePath);
      const tasks: TaskState[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const taskId = file.replace('.json', '');
          const state = await this.load(taskId);
          if (state) {
            if (!status || state.status === status) {
              tasks.push(state);
            }
          }
        }
      }

      return tasks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (e) {
      console.error('Failed to list tasks:', e);
      return [];
    }
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const filePath = this.getTaskFilePath(taskId);
    
    try {
      await fs.unlink(filePath);
      this.stateCache.delete(taskId);
      return true;
    } catch (e) {
      if ((e as Error).message.includes('ENOENT')) {
        return false;
      }
      console.error(`Failed to delete task ${taskId}:`, e);
      return false;
    }
  }

  async deleteCompletedTasks(olderThanDays: number = 7): Promise<number> {
    const tasks = await this.getTaskList('completed');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let deletedCount = 0;

    for (const task of tasks) {
      if (task.completedAt && task.completedAt < cutoffDate) {
        await this.deleteTask(task.taskId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async createInitialState(description: string, complexity: number): Promise<TaskState> {
    const taskId = `task-${Date.now()}-${crypto.randomUUID()}`;
    
    const state: TaskState = {
      taskId,
      description,
      complexity,
      currentSkill: 'unknown',
      history: [],
      results: {},
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      retryCount: 0,
      maxRetries: 3
    };

    await this.save(state);
    return state;
  }

  async updateSkill(taskId: string, skillName: string): Promise<void> {
    const state = await this.load(taskId);
    
    if (!state) {
      return;
    }

    state.currentSkill = skillName;
    state.status = 'in_progress';
    state.startedAt = state.startedAt || new Date();
    await this.save(state);
  }

  getTaskFilePath(taskId: string): string {
    const sanitizedId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storagePath, `${sanitizedId}.json`);
  }

  getCachedState(taskId: string): TaskState | undefined {
    return this.stateCache.get(taskId);
  }

  clearCache(): void {
    this.stateCache.clear();
  }
}

export const globalTaskStateManager = new TaskStateManager();