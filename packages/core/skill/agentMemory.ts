import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface Interaction {
  id: string;
  taskId: string;
  input: string;
  output: string;
  skillUsed: string;
  timestamp: Date;
  context: Record<string, any>;
  tags: string[];
}

export interface MemorySearchResult {
  interaction: Interaction;
  similarity: number;
  relevance: number;
}

export interface MemorySummary {
  totalInteractions: number;
  uniqueTasks: number;
  skillsUsed: string[];
  recentActivity: Interaction[];
}

export interface InvertedIndexEntry {
  interactionId: string;
  score: number;
}

export class AgentMemory {
  private storagePath: string;
  private interactions: Map<string, Interaction> = new Map();
  private taskIndex: Map<string, string[]> = new Map();
  private skillIndex: Map<string, string[]> = new Map();
  private tagIndex: Map<string, string[]> = new Map();
  private wordIndex: Map<string, InvertedIndexEntry[]> = new Map();
  private dirty: boolean = false;
  private maxMemoryAgeDays: number = 30;
  private maxInteractions: number = 10000;

  constructor(storagePath: string = './.agent-skills/memory') {
    this.storagePath = storagePath;
    this.initStorage().catch(console.error);
    this.loadMemory().catch(console.error);
    this.startAutoCleanup();
  }

  private async initStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (e) {
      console.error('Failed to initialize memory storage:', e);
    }
  }

  private async loadMemory(): Promise<void> {
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.storagePath, file);
          const data = await fs.readFile(filePath, 'utf8');
          const interaction = JSON.parse(data, (key, value) => {
            if (value && value.__type === 'Date') {
              return new Date(value.value);
            }
            return value;
          }) as Interaction;
          this.interactions.set(interaction.id, interaction);
          this.updateIndexes(interaction);
        }
      }
    } catch (e) {
      console.error('Failed to load memory:', e);
    }
  }

  private updateIndexes(interaction: Interaction): void {
    this.addToIndex(this.taskIndex, interaction.taskId, interaction.id);
    this.addToIndex(this.skillIndex, interaction.skillUsed, interaction.id);
    
    for (const tag of interaction.tags) {
      this.addToIndex(this.tagIndex, tag, interaction.id);
    }
    
    this.updateWordIndex(interaction);
  }

  private addToIndex(index: Map<string, string[]>, key: string, value: string): void {
    if (!index.has(key)) {
      index.set(key, []);
    }
    if (!index.get(key)!.includes(value)) {
      index.get(key)!.push(value);
    }
  }

  private updateWordIndex(interaction: Interaction): void {
    const text = `${interaction.input} ${interaction.output}`.toLowerCase();
    const words = this.tokenize(text);
    
    for (const word of words) {
      if (word.length < 3) continue;
      
      if (!this.wordIndex.has(word)) {
        this.wordIndex.set(word, []);
      }
      
      const existing = this.wordIndex.get(word)!.find(e => e.interactionId === interaction.id);
      if (!existing) {
        this.wordIndex.get(word)!.push({
          interactionId: interaction.id,
          score: this.calculateWordScore(word, text)
        });
      }
    }
  }

  private tokenize(text: string): string[] {
    return text.split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/).filter(w => w.length > 0);
  }

  private calculateWordScore(word: string, text: string): number {
    const frequency = (text.match(new RegExp(word, 'gi')) || []).length;
    const position = text.indexOf(word);
    const proximityBonus = position < 50 ? 2 : 1;
    
    return frequency * proximityBonus;
  }

  async remember(interaction: Omit<Interaction, 'id' | 'timestamp'>): Promise<void> {
    const newInteraction: Interaction = {
      ...interaction,
      id: `mem-${Date.now()}-${crypto.randomUUID()}`,
      timestamp: new Date()
    };

    this.interactions.set(newInteraction.id, newInteraction);
    this.updateIndexes(newInteraction);
    this.dirty = true;

    await this.persistInteraction(newInteraction);
  }

  private async persistInteraction(interaction: Interaction): Promise<void> {
    const filePath = path.join(this.storagePath, `${interaction.id}.json`);
    const data = JSON.stringify(interaction, (key, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      return value;
    }, 2);

    try {
      await fs.writeFile(filePath, data, 'utf8');
    } catch (e) {
      console.error(`Failed to save memory ${interaction.id}:`, e);
      throw e;
    }
  }

  async recall(context: string, limit: number = 10): Promise<MemorySearchResult[]> {
    const results = new Map<string, MemorySearchResult>();
    const contextWords = this.tokenize(context.toLowerCase()).filter(w => w.length >= 2);

    if (contextWords.length === 0) {
      return this.getRecentInteractions(limit);
    }

    for (const word of contextWords) {
      const entries = this.wordIndex.get(word);
      if (!entries) continue;

      for (const entry of entries) {
        const interaction = this.interactions.get(entry.interactionId);
        if (!interaction) continue;

        const existing = results.get(entry.interactionId);
        const baseScore = entry.score;
        const matchCount = this.countMatchingWords(interaction, contextWords);
        const relevance = (matchCount / contextWords.length) * baseScore;

        if (!existing || relevance > existing.relevance) {
          results.set(entry.interactionId, {
            interaction,
            similarity: matchCount / contextWords.length,
            relevance: Math.min(relevance, 1)
          });
        }
      }
    }

    return Array.from(results.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  private countMatchingWords(interaction: Interaction, words: string[]): number {
    const text = `${interaction.input} ${interaction.output}`.toLowerCase();
    return words.filter(w => text.includes(w)).length;
  }

  private getRecentInteractions(limit: number): MemorySearchResult[] {
    return Array.from(this.interactions.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map(interaction => ({
        interaction,
        similarity: 0,
        relevance: 0
      }));
  }

  async recallByTask(taskId: string, limit: number = 10): Promise<Interaction[]> {
    const interactionIds = this.taskIndex.get(taskId) || [];
    return interactionIds
      .map(id => this.interactions.get(id))
      .filter((i): i is Interaction => i !== undefined)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async recallBySkill(skillName: string, limit: number = 10): Promise<Interaction[]> {
    const interactionIds = this.skillIndex.get(skillName) || [];
    return interactionIds
      .map(id => this.interactions.get(id))
      .filter((i): i is Interaction => i !== undefined)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async recallByTag(tag: string, limit: number = 10): Promise<Interaction[]> {
    const interactionIds = this.tagIndex.get(tag) || [];
    return interactionIds
      .map(id => this.interactions.get(id))
      .filter((i): i is Interaction => i !== undefined)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async forget(olderThan: Date): Promise<number> {
    let deletedCount = 0;

    for (const [id, interaction] of this.interactions) {
      if (interaction.timestamp < olderThan) {
        await this.deleteInteraction(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async forgetByTask(taskId: string): Promise<number> {
    const interactionIds = this.taskIndex.get(taskId) || [];
    let deletedCount = 0;

    for (const id of interactionIds) {
      await this.deleteInteraction(id);
      deletedCount++;
    }

    this.taskIndex.delete(taskId);
    return deletedCount;
  }

  private async deleteInteraction(id: string): Promise<void> {
    const interaction = this.interactions.get(id);
    if (!interaction) return;

    const filePath = path.join(this.storagePath, `${id}.json`);
    try {
      await fs.unlink(filePath);
    } catch (e) {
      console.error(`Failed to delete memory ${id}:`, e);
    }

    this.interactions.delete(id);
    this.removeFromAllIndexes(id);
  }

  private removeFromAllIndexes(id: string): void {
    for (const [_, ids] of this.taskIndex) {
      const idx = ids.indexOf(id);
      if (idx !== -1) ids.splice(idx, 1);
    }
    for (const [_, ids] of this.skillIndex) {
      const idx = ids.indexOf(id);
      if (idx !== -1) ids.splice(idx, 1);
    }
    for (const [_, ids] of this.tagIndex) {
      const idx = ids.indexOf(id);
      if (idx !== -1) ids.splice(idx, 1);
    }
    for (const [_, entries] of this.wordIndex) {
      const idx = entries.findIndex(e => e.interactionId === id);
      if (idx !== -1) entries.splice(idx, 1);
    }
  }

  async getSummary(): Promise<MemorySummary> {
    const taskIds = new Set(this.interactions.values().map(i => i.taskId));
    const skills = new Set(this.interactions.values().map(i => i.skillUsed));
    const recent = this.getRecentInteractions(5);

    return {
      totalInteractions: this.interactions.size,
      uniqueTasks: taskIds.size,
      skillsUsed: Array.from(skills),
      recentActivity: recent.map(r => r.interaction)
    };
  }

  async getStats(): Promise<Record<string, any>> {
    const summary = await this.getSummary();
    const skillUsage: Record<string, number> = {};

    for (const interaction of this.interactions.values()) {
      skillUsage[interaction.skillUsed] = (skillUsage[interaction.skillUsed] || 0) + 1;
    }

    const recentDates: Record<string, number> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    for (const interaction of this.interactions.values()) {
      const dateStr = interaction.timestamp.toDateString();
      recentDates[dateStr] = (recentDates[dateStr] || 0) + 1;
    }

    return {
      ...summary,
      skillUsage,
      interactionsToday: recentDates[today] || 0,
      interactionsYesterday: recentDates[yesterday] || 0,
      indexSize: this.wordIndex.size
    };
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.storagePath, file));
        }
      }
    } catch (e) {
      console.error('Failed to clear memory:', e);
    }

    this.interactions.clear();
    this.taskIndex.clear();
    this.skillIndex.clear();
    this.tagIndex.clear();
    this.wordIndex.clear();
    this.dirty = false;
  }

  private startAutoCleanup(): void {
    setInterval(async () => {
      await this.cleanupOldMemory();
      await this.enforceMemoryLimit();
    }, 3600000).unref();
  }

  private async cleanupOldMemory(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.maxMemoryAgeDays);
    
    const deleted = await this.forget(cutoffDate);
    if (deleted > 0) {
      console.log(`[AgentMemory] 清理了 ${deleted} 条过期记忆`);
    }
  }

  private async enforceMemoryLimit(): Promise<void> {
    if (this.interactions.size <= this.maxInteractions) return;
    
    const excess = this.interactions.size - this.maxInteractions;
    const oldest = Array.from(this.interactions.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(0, excess);
    
    for (const interaction of oldest) {
      await this.deleteInteraction(interaction.id);
    }
    
    console.log(`[AgentMemory] 清理了 ${excess} 条旧记忆以保持限制`);
  }

  setMaxMemoryAgeDays(days: number): void {
    this.maxMemoryAgeDays = days;
  }

  setMaxInteractions(max: number): void {
    this.maxInteractions = max;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    
    for (const interaction of this.interactions.values()) {
      await this.persistInteraction(interaction);
    }
    this.dirty = false;
  }
}

export const globalAgentMemory = new AgentMemory();