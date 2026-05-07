import { SkillDefinition, TaskContext, TaskResult, WorkflowStep } from './types';

export interface CacheEntry {
  key: string;
  value: any;
  timestamp: Date;
  ttl: number;
  accessedCount: number;
  lastAccessed: Date;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

export interface ExecutionCacheKey {
  skillName: string;
  stepId: string;
  inputHash: string;
}

export interface ExecutionCacheEntry {
  key: ExecutionCacheKey;
  result: any;
  timestamp: Date;
  ttl: number;
}

export class SkillCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private defaultTTL: number;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    maxSize: 0,
    hitRate: 0
  };

  constructor(maxSize: number = 1000, defaultTTL: number = 3600000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.stats.maxSize = maxSize;
    this.startCleanupInterval();
  }

  get<T = any>(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.size--;
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    entry.accessedCount++;
    entry.lastAccessed = new Date();
    this.stats.hits++;
    this.updateHitRate();
    
    return entry.value as T;
  }

  set<T = any>(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLeastUsed();
    }

    const entry: CacheEntry = {
      key,
      value,
      timestamp: new Date(),
      ttl: ttl || this.defaultTTL,
      accessedCount: 1,
      lastAccessed: new Date()
    };

    this.cache.set(key, entry);
    this.stats.size++;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    if (existed) {
      this.stats.size--;
    }
    return existed;
  }

  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.hitRate = 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private evictLeastUsed(): void {
    let leastUsed: string | null = null;
    let minScore = Infinity;

    for (const [key, entry] of this.cache) {
      const score = entry.accessedCount + (Date.now() - entry.lastAccessed.getTime()) / 1000;
      if (score < minScore) {
        minScore = score;
        leastUsed = key;
      }
    }

    if (leastUsed) {
      this.cache.delete(leastUsed);
      this.stats.evictions++;
      this.stats.size--;
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      let evicted = 0;

      for (const [key, entry] of this.cache) {
        if (now - entry.timestamp.getTime() > entry.ttl) {
          this.cache.delete(key);
          evicted++;
        }
      }

      if (evicted > 0) {
        this.stats.evictions += evicted;
        this.stats.size = this.cache.size;
      }
    }, 60000).unref();
  }
}

export class ExecutionCache {
  private cache: Map<string, ExecutionCacheEntry> = new Map();
  private maxSize: number = 500;
  private defaultTTL: number = 7200000;

  get(key: ExecutionCacheKey): any | undefined {
    const cacheKey = this.serializeKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) return undefined;

    if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(cacheKey);
      return undefined;
    }

    return entry.result;
  }

  set(key: ExecutionCacheKey, result: any, ttl?: number): void {
    const cacheKey = this.serializeKey(key);

    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(cacheKey, {
      key,
      result,
      timestamp: new Date(),
      ttl: ttl || this.defaultTTL
    });
  }

  has(key: ExecutionCacheKey): boolean {
    const cacheKey = this.serializeKey(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(cacheKey);
      return false;
    }
    
    return true;
  }

  delete(key: ExecutionCacheKey): void {
    const cacheKey = this.serializeKey(key);
    this.cache.delete(cacheKey);
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }

  private serializeKey(key: ExecutionCacheKey): string {
    return `${key.skillName}:${key.stepId}:${key.inputHash}`;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp.getTime() < oldestTime) {
        oldestTime = entry.timestamp.getTime();
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

export class ResultReuseManager {
  private executionCache: ExecutionCache;
  private skillCache: SkillCache;

  constructor() {
    this.executionCache = new ExecutionCache();
    this.skillCache = new SkillCache();
  }

  async getCachedResult(skillName: string, step: WorkflowStep, input: any): Promise<any | undefined> {
    const inputHash = this.hashInput(input);
    const key: ExecutionCacheKey = {
      skillName,
      stepId: step.id,
      inputHash
    };

    return this.executionCache.get(key);
  }

  async cacheResult(skillName: string, step: WorkflowStep, input: any, result: any): Promise<void> {
    const inputHash = this.hashInput(input);
    const key: ExecutionCacheKey = {
      skillName,
      stepId: step.id,
      inputHash
    };

    this.executionCache.set(key, result);
  }

  getCachedSkill(skillName: string): SkillDefinition | undefined {
    return this.skillCache.get<SkillDefinition>(`skill:${skillName}`);
  }

  cacheSkill(skill: SkillDefinition): void {
    this.skillCache.set(`skill:${skill.metadata.name}`, skill, 300000);
  }

  clearCache(): void {
    this.executionCache.clear();
    this.skillCache.clear();
  }

  getStats(): { executionCacheSize: number; skillCacheStats: CacheStats } {
    return {
      executionCacheSize: this.executionCache.getSize(),
      skillCacheStats: this.skillCache.getStats()
    };
  }

  private hashInput(input: any): string {
    const str = JSON.stringify(input, Object.keys(input).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export const globalResultReuseManager = new ResultReuseManager();
export const globalSkillCache = new SkillCache();
export const globalExecutionCache = new ExecutionCache();