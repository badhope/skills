import { MEMORY_DIR } from '../utils/index.js';
import path from 'path';
import fs from 'fs/promises';
import type {
  EntityType,
  RelationshipType,
  Entity,
  Relationship,
  PathNode,
  KnowledgeGraphStats,
  KnowledgeGraphData,
  MemoryEntry,
} from './knowledge-types.js';
import { getRelated, query, findPaths } from './knowledge-query.js';
import { extractFromMemories } from './knowledge-extraction-engine.js';

// Re-export 类型
export type {
  EntityType,
  RelationshipType,
  Entity,
  Relationship,
  PathNode,
  KnowledgeGraphStats,
  KnowledgeGraphData,
  MemoryEntry,
};

// Re-export 查询函数（向后兼容）
export { getRelated, query, findPaths } from './knowledge-query.js';

// ============================================================
// 知识图谱类
// ============================================================

/**
 * 知识图谱
 * 存储实体和关系，用于从记忆中提取的结构化知识。
 * 持久化到 ~/.devflow/memory/knowledge.json
 */
export class KnowledgeGraph {
  private storagePath: string;
  private entities: Record<string, Entity> = {};
  private relationships: Relationship[] = [];
  private initialized = false;

  constructor() {
    this.storagePath = path.join(MEMORY_DIR, 'knowledge.json');
  }

  // ----------------------------------------------------------
  // 初始化与持久化
  // ----------------------------------------------------------

  /** 初始化：创建目录并加载已有数据 */
  async init(): Promise<void> {
    if (this.initialized) return;

    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      const raw = await fs.readFile(this.storagePath, 'utf-8');
      const data: KnowledgeGraphData = JSON.parse(raw);
      this.entities = data.entities || {};
      this.relationships = data.relationships || [];
    } catch {
      // 文件不存在或解析失败，使用空数据
      this.entities = {};
      this.relationships = [];
    }

    this.initialized = true;
  }

  /** 保存到磁盘 */
  async save(): Promise<void> {
    await this.init();
    const data: KnowledgeGraphData = {
      entities: this.entities,
      relationships: this.relationships,
    };
    await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ----------------------------------------------------------
  // 实体操作
  // ----------------------------------------------------------

  /**
   * 添加实体
   * @param type    实体类型
   * @param label   实体标签（显示名称）
   * @param attributes 附加属性键值对
   * @returns 新添加或已存在的实体
   */
  async addEntity(
    type: EntityType,
    label: string,
    attributes?: Record<string, string>,
  ): Promise<Entity> {
    await this.init();

    // 查找是否已存在同类型同标签的实体
    const existing = Object.values(this.entities).find(
      (e) => e.type === type && e.label === label,
    );
    if (existing) {
      // 合并新属性
      if (attributes) {
        Object.assign(existing.attributes, attributes);
      }
      return existing;
    }

    const entity: Entity = {
      id: crypto.randomUUID(),
      type,
      label,
      attributes: attributes || {},
      createdAt: new Date().toISOString(),
    };

    this.entities[entity.id] = entity;
    await this.save();
    return entity;
  }

  /**
   * 获取实体
   * @param id 实体 ID
   */
  async getEntity(id: string): Promise<Entity | undefined> {
    await this.init();
    return this.entities[id];
  }

  // ----------------------------------------------------------
  // 关系操作
  // ----------------------------------------------------------

  /**
   * 添加关系
   * @param fromId 起始实体 ID
   * @param toId   目标实体 ID
   * @param type   关系类型
   * @param weight 关系权重 0-1，默认 0.5
   * @returns 新添加或已存在的关系
   */
  async addRelationship(
    fromId: string,
    toId: string,
    type: RelationshipType,
    weight = 0.5,
  ): Promise<Relationship> {
    await this.init();

    // 校验实体存在
    if (!this.entities[fromId]) {
      throw new Error(`起始实体不存在: ${fromId}`);
    }
    if (!this.entities[toId]) {
      throw new Error(`目标实体不存在: ${toId}`);
    }

    // 查找是否已存在相同关系
    const existing = this.relationships.find(
      (r) => r.fromId === fromId && r.toId === toId && r.type === type,
    );
    if (existing) {
      // 更新权重（取较大值）
      existing.weight = Math.min(1, Math.max(existing.weight, weight));
      await this.save();
      return existing;
    }

    const relationship: Relationship = {
      id: crypto.randomUUID(),
      fromId,
      toId,
      type,
      weight: Math.max(0, Math.min(1, weight)),
      createdAt: new Date().toISOString(),
    };

    this.relationships.push(relationship);
    await this.save();
    return relationship;
  }

  // ----------------------------------------------------------
  // 查询操作（委托给 knowledge-query 模块）
  // ----------------------------------------------------------

  /**
   * 获取与指定实体相关的实体
   * @param entityId 实体 ID
   * @param type     可选，按关系类型过滤
   * @returns 相关实体列表（附带关系信息）
   */
  async getRelatedEntities(
    entityId: string,
    type?: RelationshipType,
  ): Promise<Array<{ entity: Entity; relationship: Relationship }>> {
    await this.init();
    return getRelated(this.entities, this.relationships, entityId, type);
  }

  /**
   * 多条件查询实体
   * @param type       可选，按实体类型过滤
   * @param attributes 可选，按属性键值对过滤（全部匹配）
   * @returns 匹配的实体列表
   */
  async query(
    type?: EntityType,
    attributes?: Record<string, string>,
  ): Promise<Entity[]> {
    await this.init();
    return query(this.entities, type, attributes);
  }

  // ----------------------------------------------------------
  // 路径搜索（委托给 knowledge-query 模块）
  // ----------------------------------------------------------

  /**
   * DFS 路径搜索：查找两个实体之间的路径
   * @param fromId   起始实体 ID
   * @param toId     目标实体 ID
   * @param maxDepth 最大搜索深度，默认 5
   * @returns 路径数组（每条路径是一系列 PathNode），找不到则返回空数组
   */
  async findPaths(
    fromId: string,
    toId: string,
    maxDepth = 5,
  ): Promise<PathNode[][]> {
    await this.init();
    return findPaths(this.entities, this.relationships, fromId, toId, maxDepth);
  }

  // ----------------------------------------------------------
  // 从记忆中提取实体和关系（委托给 knowledge-extraction-engine 模块）
  // ----------------------------------------------------------

  /**
   * 从记忆记录中自动提取实体和关系
   *
   * @param memories 记忆条目数组
   * @returns 提取结果摘要
   */
  async extractFromMemory(
    memories: MemoryEntry[],
  ): Promise<{ entitiesAdded: number; relationshipsAdded: number }> {
    await this.init();

    const result = await extractFromMemories(memories, {
      addEntity: (type, label, attributes) => this.addEntity(type, label, attributes),
      addRelationship: (fromId, toId, type, weight) => this.addRelationship(fromId, toId, type, weight),
      findEntity: (type, label) =>
        Object.values(this.entities).find((e) => e.type === type && e.label === label),
    });

    // 最终保存一次
    await this.save();

    return result;
  }

  // ----------------------------------------------------------
  // 统计信息
  // ----------------------------------------------------------

  /**
   * 获取知识图谱统计信息
   */
  async getStats(): Promise<KnowledgeGraphStats> {
    await this.init();

    const entityByType: Record<EntityType, number> = {
      person: 0,
      project: 0,
      tech: 0,
      concept: 0,
      skill: 0,
    };

    for (const entity of Object.values(this.entities)) {
      entityByType[entity.type]++;
    }

    const relationshipByType: Record<RelationshipType, number> = {
      uses: 0,
      knows: 0,
      likes: 0,
      created: 0,
      related_to: 0,
    };

    for (const rel of this.relationships) {
      relationshipByType[rel.type]++;
    }

    return {
      entityCount: Object.keys(this.entities).length,
      relationshipCount: this.relationships.length,
      entityByType,
      relationshipByType,
    };
  }

  // ----------------------------------------------------------
  // 内部工具方法
  // ----------------------------------------------------------

  /**
   * 获取所有实体（只读副本）
   */
  async getAllEntities(): Promise<Entity[]> {
    await this.init();
    return Object.values(this.entities);
  }

  /**
   * 获取所有关系（只读副本）
   */
  async getAllRelationships(): Promise<Relationship[]> {
    await this.init();
    return [...this.relationships];
  }

  /**
   * 删除实体及其所有关联关系
   */
  async removeEntity(id: string): Promise<boolean> {
    await this.init();

    if (!this.entities[id]) return false;

    delete this.entities[id];
    // 移除所有关联关系
    this.relationships = this.relationships.filter(
      (r) => r.fromId !== id && r.toId !== id,
    );

    await this.save();
    return true;
  }

  /**
   * 删除关系
   */
  async removeRelationship(id: string): Promise<boolean> {
    await this.init();

    const index = this.relationships.findIndex((r) => r.id === id);
    if (index === -1) return false;

    this.relationships.splice(index, 1);
    await this.save();
    return true;
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    await this.init();
    this.entities = {};
    this.relationships = [];
    await this.save();
  }
}

// ============================================================
// 全局单例
// ============================================================

/** 知识图谱全局单例 */
export const knowledgeGraph = new KnowledgeGraph();
