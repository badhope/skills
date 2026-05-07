import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface MemoryNode {
  id: string;
  content: string;
  type: 'fact' | 'experience' | 'observation' | 'inference' | 'goal';
  importance: number;
  timestamp: Date;
  context?: string;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface MemoryEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  strength: number;
  lastAccessed: Date;
}

export interface MemoryContext {
  recentMemories: string[];
  activeGoals: string[];
  currentTask?: string;
}

export interface MemoryGraphConfig {
  storagePath: string;
  maxNodes: number;
  decayRate: number;
  importanceThreshold: number;
}

export interface MemorySearchResult {
  node: MemoryNode;
  relevance: number;
  pathLength?: number;
}

export class MemoryGraph {
  private nodes: Map<string, MemoryNode> = new Map();
  private edges: Map<string, MemoryEdge> = new Map();
  private nodeIndex: Map<string, string[]> = new Map();
  private config: MemoryGraphConfig;
  private context: MemoryContext = {
    recentMemories: [],
    activeGoals: []
  };

  constructor(config?: Partial<MemoryGraphConfig>) {
    this.config = {
      storagePath: './memory',
      maxNodes: 1000,
      decayRate: 0.01,
      importanceThreshold: 0.1,
      ...config
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.storagePath, { recursive: true });
    await this.loadMemory();
    this.startDecayProcess();
  }

  private async loadMemory(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.storagePath);
      
      for (const file of files) {
        const filePath = path.join(this.config.storagePath, file);
        
        if (file === 'nodes.yaml') {
          const content = await fs.readFile(filePath, 'utf8');
          const data = yaml.load(content) as { nodes: MemoryNode[] };
          if (data?.nodes) {
            for (const node of data.nodes) {
              node.timestamp = new Date(node.timestamp);
              if (node.expiresAt) {
                node.expiresAt = new Date(node.expiresAt);
              }
              this.addNode(node);
            }
          }
        }
        
        if (file === 'edges.yaml') {
          const content = await fs.readFile(filePath, 'utf8');
          const data = yaml.load(content) as { edges: MemoryEdge[] };
          if (data?.edges) {
            for (const edge of data.edges) {
              edge.lastAccessed = new Date(edge.lastAccessed);
              this.addEdge(edge);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load memory: ${error}`);
    }
  }

  async saveMemory(): Promise<void> {
    const nodes = Array.from(this.nodes.values());
    const edges = Array.from(this.edges.values());

    await fs.writeFile(
      path.join(this.config.storagePath, 'nodes.yaml'),
      yaml.dump({ nodes }, { sortKeys: true })
    );
    await fs.writeFile(
      path.join(this.config.storagePath, 'edges.yaml'),
      yaml.dump({ edges }, { sortKeys: true })
    );
  }

  addNode(node: MemoryNode): void {
    this.nodes.set(node.id, node);
    
    this.nodeIndex.set(node.type, [
      ...(this.nodeIndex.get(node.type) || []),
      node.id
    ]);
    
    this.enforceMemoryLimit();
  }

  addEdge(edge: MemoryEdge): void {
    if (!this.nodes.has(edge.from)) {
      throw new Error(`Source node not found: ${edge.from}`);
    }
    if (!this.nodes.has(edge.to)) {
      throw new Error(`Target node not found: ${edge.to}`);
    }
    
    this.edges.set(edge.id, edge);
  }

  private enforceMemoryLimit(): void {
    if (this.nodes.size <= this.config.maxNodes) return;
    
    const sorted = Array.from(this.nodes.values())
      .sort((a, b) => a.importance - b.importance);
    
    const excess = this.nodes.size - this.config.maxNodes;
    for (const node of sorted.slice(0, excess)) {
      this.deleteNode(node.id);
    }
  }

  deleteNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    
    for (const [type, ids] of this.nodeIndex) {
      this.nodeIndex.set(type, ids.filter(id => id !== nodeId));
    }
    
    this.edges = new Map(
      Array.from(this.edges.entries()).filter(
        ([, edge]) => edge.from !== nodeId && edge.to !== nodeId
      )
    );
  }

  getNode(nodeId: string): MemoryNode | undefined {
    return this.nodes.get(nodeId);
  }

  getNodesByType(type: MemoryNode['type']): MemoryNode[] {
    const ids = this.nodeIndex.get(type) || [];
    return ids.map(id => this.nodes.get(id)).filter((n): n is MemoryNode => n !== undefined);
  }

  getRelatedNodes(nodeId: string, relation?: string): MemoryNode[] {
    const relatedIds = new Set<string>();
    
    for (const edge of this.edges.values()) {
      if (relation && edge.relation !== relation) continue;
      
      if (edge.from === nodeId) {
        relatedIds.add(edge.to);
      } else if (edge.to === nodeId) {
        relatedIds.add(edge.from);
      }
    }
    
    return Array.from(relatedIds)
      .map(id => this.nodes.get(id))
      .filter((n): n is MemoryNode => n !== undefined);
  }

  async search(query: string, maxResults: number = 10): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    const queryLower = query.toLowerCase();
    
    for (const [id, node] of this.nodes) {
      if (this.isExpired(node)) continue;
      
      const contentLower = node.content.toLowerCase();
      const contextLower = node.context?.toLowerCase() || '';
      
      let relevance = 0;
      if (contentLower.includes(queryLower)) {
        relevance += 0.7;
      }
      if (contextLower.includes(queryLower)) {
        relevance += 0.3;
      }
      
      if (relevance > 0) {
        const agePenalty = this.calculateAgePenalty(node);
        relevance = Math.max(0, relevance * (1 - agePenalty));
        
        results.push({
          node,
          relevance
        });
      }
    }
    
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, maxResults);
  }

  private isExpired(node: MemoryNode): boolean {
    if (!node.expiresAt) return false;
    return new Date() > node.expiresAt;
  }

  private calculateAgePenalty(node: MemoryNode): number {
    const ageMs = Date.now() - node.timestamp.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return Math.min(0.9, ageDays * this.config.decayRate);
  }

  async retrieveContextualMemory(context: string): Promise<MemoryNode[]> {
    const results = await this.search(context, 5);
    return results.map(r => r.node);
  }

  async updateMemoryImportance(nodeId: string, delta: number): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    node.importance = Math.min(1, Math.max(0, node.importance + delta));
    node.timestamp = new Date();
    
    if (node.importance < this.config.importanceThreshold) {
      this.deleteNode(nodeId);
    }
  }

  async createMemory(
    content: string,
    type: MemoryNode['type'],
    context?: string,
    metadata?: Record<string, any>,
    expiresAt?: Date
  ): Promise<string> {
    const nodeId = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const node: MemoryNode = {
      id: nodeId,
      content,
      type,
      importance: 0.8,
      timestamp: new Date(),
      context,
      metadata,
      expiresAt
    };
    
    this.addNode(node);
    
    if (type === 'goal') {
      this.context.activeGoals.push(nodeId);
      if (this.context.activeGoals.length > 10) {
        this.context.activeGoals.shift();
      }
    }
    
    this.context.recentMemories.push(nodeId);
    if (this.context.recentMemories.length > 20) {
      this.context.recentMemories.shift();
    }
    
    return nodeId;
  }

  async linkMemories(fromId: string, toId: string, relation: string): Promise<void> {
    const edgeId = `edge-${fromId}-${toId}-${relation}`;
    
    const existingEdge = Array.from(this.edges.values()).find(
      e => (e.from === fromId && e.to === toId && e.relation === relation) ||
           (e.from === toId && e.to === fromId && e.relation === relation)
    );
    
    if (existingEdge) {
      existingEdge.strength = Math.min(1, existingEdge.strength + 0.1);
      existingEdge.lastAccessed = new Date();
    } else {
      this.addEdge({
        id: edgeId,
        from: fromId,
        to: toId,
        relation,
        strength: 0.5,
        lastAccessed: new Date()
      });
    }
  }

  getContext(): MemoryContext {
    return { ...this.context };
  }

  setCurrentTask(taskId: string): void {
    this.context.currentTask = taskId;
  }

  clearCurrentTask(): void {
    this.context.currentTask = undefined;
  }

  private startDecayProcess(): void {
    setInterval(async () => {
      await this.decayMemories();
    }, 3600000).unref();
  }

  private async decayMemories(): Promise<void> {
    for (const node of this.nodes.values()) {
      node.importance = Math.max(0, node.importance - this.config.decayRate);
      
      if (node.importance < this.config.importanceThreshold) {
        this.deleteNode(node.id);
      }
    }
  }

  async getStats(): Promise<{
    nodeCount: number;
    edgeCount: number;
    byType: Record<string, number>;
    activeGoals: number;
    recentMemories: number;
  }> {
    const byType: Record<string, number> = {};
    for (const node of this.nodes.values()) {
      byType[node.type] = (byType[node.type] || 0) + 1;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      byType,
      activeGoals: this.context.activeGoals.length,
      recentMemories: this.context.recentMemories.length
    };
  }

  async clear(): Promise<void> {
    this.nodes.clear();
    this.edges.clear();
    this.nodeIndex.clear();
    this.context = { recentMemories: [], activeGoals: [] };
    
    try {
      const files = await fs.readdir(this.config.storagePath);
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          await fs.unlink(path.join(this.config.storagePath, file));
        }
      }
    } catch (error) {
      console.warn(`Failed to clear memory: ${error}`);
    }
  }

  setConfig(config: Partial<MemoryGraphConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): MemoryGraphConfig {
    return { ...this.config };
  }
}

export const memoryGraph = new MemoryGraph();

export default MemoryGraph;
