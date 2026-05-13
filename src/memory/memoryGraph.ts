import path from 'path';
import fs from 'fs/promises';
import { MEMORY_DIR } from '../utils/index.js';
import type {
  NodeType,
  EdgeType,
  MemoryNode,
  MemoryEdge,
  GraphData,
  SearchResult,
  GraphStats,
  ContextResult,
} from './graph-types.js';
import { generateId, tokenize, computeRelevance, isExpired } from './graph-utils.js';

// Re-export 类型
export type {
  NodeType,
  EdgeType,
};

export type {
  MemoryNode,
  MemoryEdge,
  GraphData,
  SearchResult,
  GraphStats,
  ContextResult,
};

// ============================================================
// 常量
// ============================================================

const STORAGE_DIR = MEMORY_DIR;
const GRAPH_FILE = path.join(STORAGE_DIR, 'graph.json');
const GRAPH_VERSION = '1.0.0';

/** 重要性衰减因子，每次调用 decay 时乘以此值 */
const DECAY_FACTOR = 0.95;
/** 低于此重要性阈值的节点将被清理 */
const IMPORTANCE_THRESHOLD = 0.05;

// ============================================================
// MemoryGraph 类
// ============================================================

/**
 * 基于图结构的记忆管理模块
 *
 * 节点类型：
 *   - fact: 事实（可验证的信息）
 *   - experience: 经历（交互记录、历史事件）
 *   - preference: 偏好（用户习惯、配置选择）
 *   - relation: 关系（实体之间的关联描述）
 *
 * 边类型：
 *   - related_to: 相关联
 *   - derived_from: 派生自
 *   - contradicts: 矛盾
 *
 * 持久化位置：~/.devflow/memory/graph.json
 */
export class MemoryGraph {
  private nodes: Record<string, MemoryNode> = {};
  private edges: MemoryEdge[] = [];
  private initialized = false;

  // ----------------------------------------------------------
  // 初始化与持久化
  // ----------------------------------------------------------

  /**
   * 初始化记忆图谱，加载已有数据
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    await this.load();
    this.initialized = true;
  }

  /**
   * 从磁盘加载图谱数据
   */
  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(GRAPH_FILE, 'utf-8');
      const parsed: GraphData = JSON.parse(data);
      this.nodes = parsed.nodes || {};
      this.edges = parsed.edges || [];
    } catch {
      // 文件不存在或解析失败，使用空图谱
      this.nodes = {};
      this.edges = [];
    }
  }

  /**
   * 将图谱数据持久化到磁盘
   */
  async save(): Promise<void> {
    await this.init();
    const data: GraphData = {
      nodes: this.nodes,
      edges: this.edges,
      version: GRAPH_VERSION,
    };
    await fs.writeFile(GRAPH_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ----------------------------------------------------------
  // 节点操作
  // ----------------------------------------------------------

  /**
   * 添加记忆节点
   * @param type - 节点类型 (fact / experience / preference / relation)
   * @param content - 节点内容
   * @param tags - 可选标签列表
   * @param importance - 可选重要性 (0-1)，默认 0.5
   * @param expiresAt - 可选过期时间 (ISO 字符串)
   * @returns 新创建的节点
   */
  async addNode(
    type: NodeType,
    content: string,
    tags?: string[],
    importance?: number,
    expiresAt?: string,
  ): Promise<MemoryNode> {
    await this.init();

    const now = new Date().toISOString();
    const node: MemoryNode = {
      id: generateId(),
      type,
      content,
      importance: Math.max(0, Math.min(1, importance ?? 0.5)),
      tags: tags || [],
      createdAt: now,
      accessedAt: now,
      expiresAt: expiresAt || undefined,
    };

    this.nodes[node.id] = node;
    await this.save();
    return node;
  }

  /**
   * 根据 ID 获取节点
   */
  async getNode(id: string): Promise<MemoryNode | null> {
    await this.init();
    const node = this.nodes[id];
    if (!node) return null;

    // 更新访问时间
    node.accessedAt = new Date().toISOString();
    await this.save();
    return node;
  }

  /**
   * 删除节点及其关联的所有边
   */
  async removeNode(id: string): Promise<boolean> {
    await this.init();
    if (!this.nodes[id]) return false;

    delete this.nodes[id];
    // 移除所有与该节点相关的边
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    await this.save();
    return true;
  }

  // ----------------------------------------------------------
  // 边操作
  // ----------------------------------------------------------

  /**
   * 创建两个节点之间的关系边
   * @param fromId - 起始节点 ID
   * @param toId - 目标节点 ID
   * @param type - 边类型，默认 related_to
   * @param strength - 关系强度 (0-1)，默认 0.5
   * @returns 新创建的边，如果节点不存在则返回 null
   */
  async linkNodes(
    fromId: string,
    toId: string,
    type: EdgeType = 'related_to',
    strength?: number,
  ): Promise<MemoryEdge | null> {
    await this.init();

    // 验证两个节点都存在
    if (!this.nodes[fromId] || !this.nodes[toId]) return null;
    // 不允许自环
    if (fromId === toId) return null;

    const edge: MemoryEdge = {
      from: fromId,
      to: toId,
      type,
      strength: Math.max(0, Math.min(1, strength ?? 0.5)),
    };

    this.edges.push(edge);
    await this.save();
    return edge;
  }

  /**
   * 删除两个节点之间的边
   */
  async unlinkNodes(fromId: string, toId: string): Promise<boolean> {
    await this.init();
    const before = this.edges.length;
    this.edges = this.edges.filter(e => !(e.from === fromId && e.to === toId));
    if (this.edges.length < before) {
      await this.save();
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------
  // 搜索与查询
  // ----------------------------------------------------------

  /**
   * 关键词搜索节点内容
   * @param query - 搜索关键词
   * @param limit - 最大返回数量，默认 20
   * @returns 按相关性排序的搜索结果
   */
  async search(query: string, limit = 20): Promise<SearchResult[]> {
    await this.init();

    if (!query.trim()) return [];

    const queryTokens = tokenize(query);
    const results: SearchResult[] = [];

    for (const node of Object.values(this.nodes)) {
      // 跳过已过期节点
      if (isExpired(node)) continue;

      // 在内容和标签中搜索
      const contentScore = computeRelevance(queryTokens, node.content);
      const tagScore = computeRelevance(queryTokens, node.tags.join(' '));
      const totalScore = contentScore + tagScore * 0.5; // 标签匹配权重略低

      if (totalScore > 0) {
        results.push({ node, score: totalScore });
      }
    }

    // 按得分降序排列
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 获取与指定节点关联的所有节点（支持多层遍历）
   * @param id - 起始节点 ID
   * @param depth - 遍历深度，默认 1（仅直接关联）
   * @returns 关联节点列表
   */
  async getRelated(id: string, depth = 1): Promise<MemoryNode[]> {
    await this.init();

    if (!this.nodes[id]) return [];

    const visited = new Set<string>();
    const result: MemoryNode[] = [];

    // BFS 遍历
    let frontier = [id];
    visited.add(id);

    for (let d = 0; d < depth; d++) {
      const nextFrontier: string[] = [];

      for (const nodeId of frontier) {
        // 找到所有与 nodeId 相连的边
        const connectedIds: string[] = [];
        for (const edge of this.edges) {
          if (edge.from === nodeId && !visited.has(edge.to)) {
            connectedIds.push(edge.to);
          }
          if (edge.to === nodeId && !visited.has(edge.from)) {
            connectedIds.push(edge.from);
          }
        }

        for (const cid of connectedIds) {
          visited.add(cid);
          nextFrontier.push(cid);
          const node = this.nodes[cid];
          if (node && !isExpired(node)) {
            result.push(node);
          }
        }
      }

      frontier = nextFrontier;
    }

    return result;
  }

  /**
   * 基于上下文查询获取相关子图
   * 先通过关键词搜索找到匹配节点，再扩展其关联节点，返回子图
   * @param query - 查询文本
   * @param expandDepth - 关联扩展深度，默认 1
   * @param maxNodes - 最大节点数量，默认 30
   * @returns 包含节点和边的上下文子图
   */
  async getContext(query: string, expandDepth = 1, maxNodes = 30): Promise<ContextResult> {
    await this.init();

    // 第一步：关键词搜索获取种子节点
    const searchResults = await this.search(query, maxNodes);

    if (searchResults.length === 0) {
      return { nodes: [], edges: [], query };
    }

    const seedNodeIds = new Set(searchResults.map(r => r.node.id));
    const allNodeIds = new Set<string>(seedNodeIds);

    // 第二步：扩展关联节点
    for (const seedId of seedNodeIds) {
      const related = await this.getRelated(seedId, expandDepth);
      for (const node of related) {
        if (allNodeIds.size >= maxNodes) break;
        allNodeIds.add(node.id);
      }
      if (allNodeIds.size >= maxNodes) break;
    }

    // 第三步：收集子图中的边（两端都在 allNodeIds 中的边）
    const subEdges = this.edges.filter(
      e => allNodeIds.has(e.from) && allNodeIds.has(e.to),
    );

    // 第四步：收集节点
    const subNodes = Array.from(allNodeIds)
      .map(id => this.nodes[id])
      .filter((n): n is MemoryNode => !!n && !isExpired(n));

    return {
      nodes: subNodes,
      edges: subEdges,
      query,
    };
  }

  // ----------------------------------------------------------
  // 维护操作
  // ----------------------------------------------------------

  /**
   * 衰减所有节点的重要性，并清理已过期和低重要性的节点
   * @returns 被清理的节点数量
   */
  async decayImportance(): Promise<number> {
    await this.init();

    let removedCount = 0;
    const toRemove: string[] = [];

    for (const [id, node] of Object.entries(this.nodes)) {
      // 检查是否过期
      if (isExpired(node)) {
        toRemove.push(id);
        continue;
      }

      // 衰减重要性
      node.importance *= DECAY_FACTOR;

      // 低于阈值则标记清理
      if (node.importance < IMPORTANCE_THRESHOLD) {
        toRemove.push(id);
      }
    }

    // 执行清理
    for (const id of toRemove) {
      delete this.nodes[id];
      this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
      removedCount++;
    }

    if (removedCount > 0) {
      await this.save();
    }

    return removedCount;
  }

  /**
   * 获取图谱统计信息
   */
  async getStats(): Promise<GraphStats> {
    await this.init();

    const nodesByType: Record<NodeType, number> = {
      fact: 0,
      experience: 0,
      preference: 0,
      relation: 0,
    };
    const edgesByType: Record<EdgeType, number> = {
      related_to: 0,
      derived_from: 0,
      contradicts: 0,
    };

    let totalImportance = 0;
    let expiredNodes = 0;
    const now = Date.now();

    for (const node of Object.values(this.nodes)) {
      nodesByType[node.type]++;
      totalImportance += node.importance;
      if (node.expiresAt && new Date(node.expiresAt).getTime() < now) {
        expiredNodes++;
      }
    }

    for (const edge of this.edges) {
      edgesByType[edge.type]++;
    }

    const totalNodes = Object.keys(this.nodes).length;

    return {
      totalNodes,
      totalEdges: this.edges.length,
      nodesByType,
      edgesByType,
      averageImportance: totalNodes > 0
        ? Math.round((totalImportance / totalNodes) * 100) / 100
        : 0,
      expiredNodes,
      storagePath: GRAPH_FILE,
    };
  }

  /**
   * 获取所有节点（可选按类型过滤）
   */
  async getAllNodes(type?: NodeType): Promise<MemoryNode[]> {
    await this.init();
    let nodes = Object.values(this.nodes);
    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }
    // 过滤已过期节点
    return nodes.filter(n => !isExpired(n));
  }

  /**
   * 获取所有边（可选按类型过滤）
   */
  async getAllEdges(type?: EdgeType): Promise<MemoryEdge[]> {
    await this.init();
    if (type) {
      return this.edges.filter(e => e.type === type);
    }
    return [...this.edges];
  }

  /**
   * 清空整个图谱
   */
  async clear(): Promise<void> {
    await this.init();
    this.nodes = {};
    this.edges = [];
    await this.save();
  }
}

// ============================================================
// 全局单例
// ============================================================

export const memoryGraph = new MemoryGraph();
