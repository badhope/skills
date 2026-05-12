import { MEMORY_DIR } from '../utils/index.js';
import path from 'path';
import fs from 'fs/promises';

// ============================================================
// 类型定义
// ============================================================

/** 实体类型 */
export type EntityType = 'person' | 'project' | 'tech' | 'concept' | 'skill';

/** 关系类型 */
export type RelationshipType = 'uses' | 'knows' | 'likes' | 'created' | 'related_to';

/** 实体 */
export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  attributes: Record<string, string>;
  createdAt: string;
}

/** 关系 */
export interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  type: RelationshipType;
  weight: number;
  createdAt: string;
}

/** 持久化存储结构 */
interface KnowledgeGraphData {
  entities: Record<string, Entity>;
  relationships: Relationship[];
}

/** 路径中的节点 */
export interface PathNode {
  entityId: string;
  label: string;
  type: EntityType;
  relationshipType: RelationshipType;
}

/** 统计信息 */
export interface KnowledgeGraphStats {
  entityCount: number;
  relationshipCount: number;
  entityByType: Record<EntityType, number>;
  relationshipByType: Record<RelationshipType, number>;
}

/** 记忆条目（与 manager.ts 中的 MemoryInteraction 兼容） */
interface MemoryEntry {
  input: string;
  output?: string;
  timestamp?: string | Date;
  tags?: string[];
}

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
  // 查询操作
  // ----------------------------------------------------------

  /**
   * 获取与指定实体相关的实体
   * @param entityId 实体 ID
   * @param type     可选，按关系类型过滤
   * @returns 相关实体列表（附带关系信息）
   */
  async getRelated(
    entityId: string,
    type?: RelationshipType,
  ): Promise<Array<{ entity: Entity; relationship: Relationship }>> {
    await this.init();

    const results: Array<{ entity: Entity; relationship: Relationship }> = [];

    for (const rel of this.relationships) {
      if (type && rel.type !== type) continue;

      let targetId: string | undefined;
      if (rel.fromId === entityId) {
        targetId = rel.toId;
      } else if (rel.toId === entityId) {
        targetId = rel.fromId;
      }

      if (targetId && this.entities[targetId]) {
        results.push({
          entity: this.entities[targetId],
          relationship: rel,
        });
      }
    }

    return results;
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

    let results = Object.values(this.entities);

    if (type) {
      results = results.filter((e) => e.type === type);
    }

    if (attributes) {
      results = results.filter((e) => {
        for (const [key, value] of Object.entries(attributes)) {
          if (e.attributes[key] !== value) return false;
        }
        return true;
      });
    }

    return results;
  }

  // ----------------------------------------------------------
  // 路径搜索
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

    if (!this.entities[fromId] || !this.entities[toId]) return [];
    if (fromId === toId) return [];

    const allPaths: PathNode[][] = [];

    // 构建邻接表
    const adjacency = new Map<string, Array<{ neighborId: string; relType: RelationshipType }>>();
    for (const rel of this.relationships) {
      // 双向添加
      if (!adjacency.has(rel.fromId)) adjacency.set(rel.fromId, []);
      if (!adjacency.has(rel.toId)) adjacency.set(rel.toId, []);

      adjacency.get(rel.fromId)!.push({ neighborId: rel.toId, relType: rel.type });
      adjacency.get(rel.toId)!.push({ neighborId: rel.fromId, relType: rel.type });
    }

    // DFS
    const visited = new Set<string>();
    const currentPath: PathNode[] = [];

    const startEntity = this.entities[fromId];
    currentPath.push({
      entityId: fromId,
      label: startEntity.label,
      type: startEntity.type,
      relationshipType: 'related_to', // 起始节点无关系类型
    });

    const dfs = (nodeId: string, depth: number): void => {
      if (depth > maxDepth) return;
      if (nodeId === toId) {
        allPaths.push([...currentPath]);
        return;
      }

      visited.add(nodeId);
      const neighbors = adjacency.get(nodeId) || [];

      for (const { neighborId, relType } of neighbors) {
        if (visited.has(neighborId)) continue;

        const neighborEntity = this.entities[neighborId];
        if (!neighborEntity) continue;

        currentPath.push({
          entityId: neighborId,
          label: neighborEntity.label,
          type: neighborEntity.type,
          relationshipType: relType,
        });

        dfs(neighborId, depth + 1);

        currentPath.pop();
      }

      visited.delete(nodeId);
    };

    dfs(fromId, 0);

    // 按路径长度排序（短路径优先）
    allPaths.sort((a, b) => a.length - b.length);
    return allPaths;
  }

  // ----------------------------------------------------------
  // 从记忆中提取实体和关系
  // ----------------------------------------------------------

  /**
   * 从记忆记录中自动提取实体和关系
   *
   * 提取规则：
   * - "我是/叫/名字是 XXX" → 提取 person 实体
   * - "喜欢/偏好/常用 XXX" → 提取 likes 关系
   * - "使用/用了 XXX" → 提取 uses 关系
   * - "项目叫/名为 XXX" → 提取 project 实体
   * - 技术关键词（如 Rust, Python, React）→ 提取 tech 实体
   *
   * @param memories 记忆条目数组
   * @returns 提取结果摘要
   */
  async extractFromMemory(
    memories: MemoryEntry[],
  ): Promise<{ entitiesAdded: number; relationshipsAdded: number }> {
    await this.init();

    let entitiesAdded = 0;
    let relationshipsAdded = 0;

    // 当前用户实体（用于建立关系）
    let currentUserEntity: Entity | undefined;

    // 常见技术关键词列表
    const techKeywords = [
      'JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Java', 'C++', 'C#',
      'Ruby', 'PHP', 'Swift', 'Kotlin', 'Dart', 'Scala', 'Haskell', 'Elixir',
      'React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Gatsby',
      'Node.js', 'Deno', 'Bun', 'Express', 'Koa', 'Fastify', 'NestJS',
      'Docker', 'Kubernetes', 'K8s', 'Terraform', 'Ansible',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Elasticsearch',
      'GraphQL', 'REST', 'gRPC', 'WebSocket',
      'Git', 'GitHub', 'GitLab', 'Bitbucket',
      'AWS', 'Azure', 'GCP', 'Vercel', 'Netlify', 'Cloudflare',
      'Linux', 'Ubuntu', 'Debian', 'CentOS', 'Alpine',
      'TailwindCSS', 'Bootstrap', 'Sass', 'Less', 'CSS', 'HTML',
      'Webpack', 'Vite', 'esbuild', 'Rollup', 'Turbopack',
      'Jest', 'Vitest', 'Mocha', 'Cypress', 'Playwright',
      'TensorFlow', 'PyTorch', 'OpenCV', 'Pandas', 'NumPy',
      'Flutter', 'React Native', 'Electron', 'Tauri',
      'Nginx', 'Apache', 'Caddy', 'Traefik',
      'RabbitMQ', 'Kafka', 'Zookeeper', 'Consul',
      'Elasticsearch', 'Logstash', 'Kibana', 'Prometheus', 'Grafana',
      'OAuth', 'JWT', 'SAML', 'SSO', 'LDAP',
      'CI/CD', 'GitHub Actions', 'Jenkins', 'Travis CI', 'CircleCI',
      'Figma', 'Sketch', 'Adobe XD',
      'Lua', 'Perl', 'R', 'MATLAB', 'Shell', 'Bash', 'PowerShell',
      'Zig', 'Carbon', 'Nim', 'V', 'Crystal', 'Julia',
      'SolidJS', 'Qwik', 'Astro', 'Remix', 'SolidStart',
      'tRPC', 'Prisma', 'Drizzle', 'TypeORM', 'Sequelize',
      'Supabase', 'Firebase', 'Appwrite', 'PocketBase',
      'Hono', 'Fastify', 'Axum', 'Actix', 'Spring',
      'Django', 'Flask', 'FastAPI', 'Rails', 'Laravel', 'Phoenix',
      'Redis', 'Memcached', 'Cassandra', 'DynamoDB', 'CockroachDB',
      'Neo4j', 'ArangoDB', 'InfluxDB', 'TimescaleDB',
      'WebSocket', 'SSE', 'Socket.io', 'MQTT',
      'OpenAI', 'Anthropic', 'LangChain', 'LlamaIndex',
      'MCP', 'Claude', 'GPT', 'BERT', 'Transformer',
    ];

    // 用于去重的集合
    const processedEntities = new Set<string>();
    const processedRelationships = new Set<string>();

    for (const memory of memories) {
      const text = `${memory.input} ${memory.output || ''}`;

      // 规则 1: "我是/叫/名字是 XXX" → person 实体
      const personPatterns = [
        /我是\s*([^\s,，。.!！?？]+)/g,
        /我叫\s*([^\s,，。.!！?？]+)/g,
        /名字是\s*([^\s,，。.!！?？]+)/g,
        /我的名字是\s*([^\s,，。.!！?？]+)/g,
      ];
      for (const pattern of personPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const name = match[1].trim();
          if (name && !processedEntities.has(`person:${name}`)) {
            await this.addEntity('person', name);
            processedEntities.add(`person:${name}`);
            currentUserEntity = Object.values(this.entities).find(
              (e) => e.type === 'person' && e.label === name,
            );
            entitiesAdded++;
          }
        }
      }

      // 规则 2: "喜欢/偏好/常用 XXX" → likes 关系
      const likePatterns = [
        /喜欢\s*([^\s,，。.!！?？]+)/g,
        /偏好\s*([^\s,，。.!！?？]+)/g,
        /常用\s*([^\s,，。.!！?？]+)/g,
        /最爱\s*([^\s,，。.!！?？]+)/g,
      ];
      for (const pattern of likePatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const target = match[1].trim();
          if (!target) continue;

          // 确保目标实体存在
          const targetType = this.inferEntityType(target, techKeywords);
          const targetEntity = await this.addEntity(targetType, target);
          if (!processedEntities.has(`${targetType}:${target}`)) {
            processedEntities.add(`${targetType}:${target}`);
            entitiesAdded++;
          }

          // 如果有当前用户，建立 likes 关系
          if (currentUserEntity) {
            const relKey = `${currentUserEntity.id}:likes:${targetEntity.id}`;
            if (!processedRelationships.has(relKey)) {
              await this.addRelationship(currentUserEntity.id, targetEntity.id, 'likes', 0.7);
              processedRelationships.add(relKey);
              relationshipsAdded++;
            }
          }
        }
      }

      // 规则 3: "使用/用了 XXX" → uses 关系
      const usePatterns = [
        /使用\s*([^\s,，。.!！?？]+)/g,
        /用了\s*([^\s,，。.!！?？]+)/g,
        /在用\s*([^\s,，。.!！?？]+)/g,
        /正在用\s*([^\s,，。.!！?？]+)/g,
        /采用\s*([^\s,，。.!！?？]+)/g,
      ];
      for (const pattern of usePatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const target = match[1].trim();
          if (!target) continue;

          const targetType = this.inferEntityType(target, techKeywords);
          const targetEntity = await this.addEntity(targetType, target);
          if (!processedEntities.has(`${targetType}:${target}`)) {
            processedEntities.add(`${targetType}:${target}`);
            entitiesAdded++;
          }

          if (currentUserEntity) {
            const relKey = `${currentUserEntity.id}:uses:${targetEntity.id}`;
            if (!processedRelationships.has(relKey)) {
              await this.addRelationship(currentUserEntity.id, targetEntity.id, 'uses', 0.6);
              processedRelationships.add(relKey);
              relationshipsAdded++;
            }
          }
        }
      }

      // 规则 4: "项目叫/名为 XXX" → project 实体
      const projectPatterns = [
        /项目叫\s*([^\s,，。.!！?？]+)/g,
        /项目名为\s*([^\s,，。.!！?？]+)/g,
        /项目名是\s*([^\s,，。.!！?？]+)/g,
        /项目[名是叫]\s*[""「」]([^""「」]+)[""「」]/g,
      ];
      for (const pattern of projectPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const projectName = match[1].trim();
          if (projectName && !processedEntities.has(`project:${projectName}`)) {
            const projectEntity = await this.addEntity('project', projectName);
            processedEntities.add(`project:${projectName}`);
            entitiesAdded++;

            // 如果有当前用户，建立 created 关系
            if (currentUserEntity) {
              const relKey = `${currentUserEntity.id}:created:${projectEntity.id}`;
              if (!processedRelationships.has(relKey)) {
                await this.addRelationship(currentUserEntity.id, projectEntity.id, 'created', 0.8);
                processedRelationships.add(relKey);
                relationshipsAdded++;
              }
            }
          }
        }
      }

      // 规则 5: 技术关键词 → tech 实体
      for (const tech of techKeywords) {
        // 使用词边界匹配，避免部分匹配
        const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        if (regex.test(text)) {
          if (!processedEntities.has(`tech:${tech}`)) {
            await this.addEntity('tech', tech);
            processedEntities.add(`tech:${tech}`);
            entitiesAdded++;

            // 如果有当前用户，建立 uses 关系
            if (currentUserEntity) {
              const techEntity = Object.values(this.entities).find(
                (e) => e.type === 'tech' && e.label === tech,
              );
              if (techEntity) {
                const relKey = `${currentUserEntity.id}:uses:${techEntity.id}`;
                if (!processedRelationships.has(relKey)) {
                  await this.addRelationship(currentUserEntity.id, techEntity.id, 'uses', 0.5);
                  processedRelationships.add(relKey);
                  relationshipsAdded++;
                }
              }
            }
          }
        }
      }

      // 额外规则: "知道/了解/熟悉 XXX" → knows 关系
      const knowPatterns = [
        /知道\s*([^\s,，。.!！?？]+)/g,
        /了解\s*([^\s,，。.!！?？]+)/g,
        /熟悉\s*([^\s,，。.!！?？]+)/g,
      ];
      for (const pattern of knowPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const target = match[1].trim();
          if (!target) continue;

          const targetType = this.inferEntityType(target, techKeywords);
          const targetEntity = await this.addEntity(targetType, target);
          if (!processedEntities.has(`${targetType}:${target}`)) {
            processedEntities.add(`${targetType}:${target}`);
            entitiesAdded++;
          }

          if (currentUserEntity) {
            const relKey = `${currentUserEntity.id}:knows:${targetEntity.id}`;
            if (!processedRelationships.has(relKey)) {
              await this.addRelationship(currentUserEntity.id, targetEntity.id, 'knows', 0.6);
              processedRelationships.add(relKey);
              relationshipsAdded++;
            }
          }
        }
      }
    }

    // 最终保存一次
    await this.save();

    return { entitiesAdded, relationshipsAdded };
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
   * 根据名称推断实体类型
   * @param name 名称
   * @param techKeywords 技术关键词列表
   */
  private inferEntityType(name: string, techKeywords: string[]): EntityType {
    // 检查是否是技术关键词
    if (techKeywords.some((tech) => tech.toLowerCase() === name.toLowerCase())) {
      return 'tech';
    }

    // 检查是否包含编程语言常见后缀
    if (/\.(js|ts|py|rs|go|java|rb|php|swift|kt|dart|c|cpp|h|cs|lua|pl|r|m|sh|ps1)$/i.test(name)) {
      return 'tech';
    }

    // 检查是否是框架/库名（驼峰或短横线命名）
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name) || /^[a-z]+-[a-z]+(-[a-z]+)*$/.test(name)) {
      return 'tech';
    }

    // 默认为概念
    return 'concept';
  }

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
