import { TaskContext } from './types';

export interface ConcurrencyLimit {
  type: 'global' | 'skill' | 'user';
  limit: number;
  current: number;
}

export interface RateLimit {
  windowMs: number;
  maxRequests: number;
  remaining: number;
  resetTime: Date;
}

export interface TaskSlot {
  taskId: string;
  skillName: string;
  userId?: string;
  startTime: Date;
}

export class ConcurrencyManager {
  private globalLimit: number = 10;
  private skillLimits: Map<string, number> = new Map();
  private userLimits: Map<string, number> = new Map();
  
  private globalSlots: TaskSlot[] = [];
  private skillSlots: Map<string, TaskSlot[]> = new Map();
  private userSlots: Map<string, TaskSlot[]> = new Map();
  
  private rateLimits: Map<string, RateLimit> = new Map();

  constructor(globalLimit: number = 10) {
    this.globalLimit = globalLimit;
    this.startCleanupInterval();
  }

  setGlobalLimit(limit: number): void {
    this.globalLimit = limit;
  }

  setSkillLimit(skillName: string, limit: number): void {
    this.skillLimits.set(skillName, limit);
  }

  setUserLimit(userId: string, limit: number): void {
    this.userLimits.set(userId, limit);
  }

  async acquireSlot(taskId: string, skillName: string, userId?: string): Promise<boolean> {
    const canProceed = this.canExecute(taskId, skillName, userId);
    
    if (!canProceed) {
      await this.waitForSlot(taskId, skillName, userId);
    }

    this.addSlot(taskId, skillName, userId);
    return true;
  }

  releaseSlot(taskId: string, skillName: string, userId?: string): void {
    this.removeSlot(taskId, skillName, userId);
  }

  canExecute(taskId: string, skillName: string, userId?: string): boolean {
    if (this.globalSlots.length >= this.globalLimit) {
      return false;
    }

    const skillLimit = this.skillLimits.get(skillName) || 5;
    const skillCurrent = this.skillSlots.get(skillName)?.length || 0;
    if (skillCurrent >= skillLimit) {
      return false;
    }

    if (userId) {
      const userLimit = this.userLimits.get(userId) || 3;
      const userCurrent = this.userSlots.get(userId)?.length || 0;
      if (userCurrent >= userLimit) {
        return false;
      }
    }

    return true;
  }

  private async waitForSlot(taskId: string, skillName: string, userId?: string): Promise<void> {
    const checkInterval = 100;
    const maxWaitTime = 60000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      if (this.canExecute(taskId, skillName, userId)) {
        return;
      }
      await this.sleep(checkInterval);
    }

    throw new Error('Timeout waiting for execution slot');
  }

  private addSlot(taskId: string, skillName: string, userId?: string): void {
    const slot: TaskSlot = {
      taskId,
      skillName,
      userId,
      startTime: new Date()
    };

    this.globalSlots.push(slot);
    
    if (!this.skillSlots.has(skillName)) {
      this.skillSlots.set(skillName, []);
    }
    this.skillSlots.get(skillName)!.push(slot);

    if (userId) {
      if (!this.userSlots.has(userId)) {
        this.userSlots.set(userId, []);
      }
      this.userSlots.get(userId)!.push(slot);
    }
  }

  private removeSlot(taskId: string, skillName: string, userId?: string): void {
    const slotIndex = this.globalSlots.findIndex(s => s.taskId === taskId);
    if (slotIndex !== -1) {
      this.globalSlots.splice(slotIndex, 1);
    }

    const skillSlotList = this.skillSlots.get(skillName);
    if (skillSlotList) {
      const idx = skillSlotList.findIndex(s => s.taskId === taskId);
      if (idx !== -1) {
        skillSlotList.splice(idx, 1);
      }
    }

    if (userId) {
      const userSlotList = this.userSlots.get(userId);
      if (userSlotList) {
        const idx = userSlotList.findIndex(s => s.taskId === taskId);
        if (idx !== -1) {
          userSlotList.splice(idx, 1);
        }
      }
    }
  }

  getStats(): {
    global: ConcurrencyLimit;
    skills: Record<string, ConcurrencyLimit>;
    users: Record<string, ConcurrencyLimit>;
  } {
    const skills: Record<string, ConcurrencyLimit> = {};
    for (const [skill, limit] of this.skillLimits) {
      skills[skill] = {
        type: 'skill',
        limit,
        current: this.skillSlots.get(skill)?.length || 0
      };
    }

    const users: Record<string, ConcurrencyLimit> = {};
    for (const [user, limit] of this.userLimits) {
      users[user] = {
        type: 'user',
        limit,
        current: this.userSlots.get(user)?.length || 0
      };
    }

    return {
      global: {
        type: 'global',
        limit: this.globalLimit,
        current: this.globalSlots.length
      },
      skills,
      users
    };
  }

  async checkRateLimit(key: string, windowMs: number = 60000, maxRequests: number = 100): Promise<boolean> {
    const now = Date.now();
    let rateLimit = this.rateLimits.get(key);

    if (!rateLimit || now >= rateLimit.resetTime.getTime()) {
      rateLimit = {
        windowMs,
        maxRequests,
        remaining: maxRequests,
        resetTime: new Date(now + windowMs)
      };
      this.rateLimits.set(key, rateLimit);
    }

    if (rateLimit.remaining <= 0) {
      return false;
    }

    rateLimit.remaining--;
    return true;
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 300000;
      const warningAge = 120000;

      for (const slot of this.globalSlots) {
        const age = now - slot.startTime.getTime();
        if (age > warningAge && age < maxAge) {
          console.warn(`[ConcurrencyManager] 任务 ${slot.taskId} 运行时间过长 (${Math.floor(age / 1000)}s)`);
        }
      }

      const cleanedGlobal = this.globalSlots.filter(s => now - s.startTime.getTime() < maxAge);
      const cleanedCount = this.globalSlots.length - cleanedGlobal.length;
      if (cleanedCount > 0) {
        console.warn(`[ConcurrencyManager] 清理了 ${cleanedCount} 个超时任务`);
      }
      this.globalSlots = cleanedGlobal;

      for (const [skill, slots] of this.skillSlots) {
        const filtered = slots.filter(s => now - s.startTime.getTime() < maxAge);
        if (filtered.length === 0) {
          this.skillSlots.delete(skill);
        } else {
          this.skillSlots.set(skill, filtered);
        }
      }

      for (const [user, slots] of this.userSlots) {
        const filtered = slots.filter(s => now - s.startTime.getTime() < maxAge);
        if (filtered.length === 0) {
          this.userSlots.delete(user);
        } else {
          this.userSlots.set(user, filtered);
        }
      }
    }, 60000).unref();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async withConcurrencyControl<T>(
    taskId: string,
    skillName: string,
    userId: string | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    await this.acquireSlot(taskId, skillName, userId);
    try {
      return await fn();
    } finally {
      this.releaseSlot(taskId, skillName, userId);
    }
  }
}

export const globalConcurrencyManager = new ConcurrencyManager();