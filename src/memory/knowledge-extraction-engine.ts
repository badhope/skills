import type { Entity, MemoryEntry } from './knowledge-types.js';
import { inferEntityType } from './knowledge-extractor.js';

/**
 * 从记忆中提取实体和关系的增强规则引擎
 * 从 KnowledgeGraph.extractFromMemory() 中提取的独立模块。
 */

/** 常见技术关键词列表 */
export const TECH_KEYWORDS: string[] = [
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

/**
 * 提取操作回调接口
 * 定义提取过程中需要调用的外部操作
 */
export interface ExtractionCallbacks {
  addEntity: (type: 'person' | 'project' | 'tech' | 'concept' | 'skill', label: string, attributes?: Record<string, string>) => Promise<Entity>;
  addRelationship: (fromId: string, toId: string, type: 'uses' | 'knows' | 'likes' | 'created' | 'related_to', weight?: number) => Promise<unknown>;
  findEntity: (type: string, label: string) => Entity | undefined;
}

/**
 * 从记忆记录中自动提取实体和关系
 *
 * @param memories  记忆条目数组
 * @param callbacks 提取操作回调
 * @returns 提取结果摘要
 */
export async function extractFromMemories(
  memories: MemoryEntry[],
  callbacks: ExtractionCallbacks,
): Promise<{ entitiesAdded: number; relationshipsAdded: number }> {
  let entitiesAdded = 0;
  let relationshipsAdded = 0;

  // 当前用户实体（用于建立关系）
  let currentUserEntity: Entity | undefined;

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
          await callbacks.addEntity('person', name);
          processedEntities.add(`person:${name}`);
          currentUserEntity = callbacks.findEntity('person', name);
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
        const targetType = inferEntityType(target, TECH_KEYWORDS);
        const targetEntity = await callbacks.addEntity(targetType, target);
        if (!processedEntities.has(`${targetType}:${target}`)) {
          processedEntities.add(`${targetType}:${target}`);
          entitiesAdded++;
        }

        // 如果有当前用户，建立 likes 关系
        if (currentUserEntity) {
          const relKey = `${currentUserEntity.id}:likes:${targetEntity.id}`;
          if (!processedRelationships.has(relKey)) {
            await callbacks.addRelationship(currentUserEntity.id, targetEntity.id, 'likes', 0.7);
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

        const targetType = inferEntityType(target, TECH_KEYWORDS);
        const targetEntity = await callbacks.addEntity(targetType, target);
        if (!processedEntities.has(`${targetType}:${target}`)) {
          processedEntities.add(`${targetType}:${target}`);
          entitiesAdded++;
        }

        if (currentUserEntity) {
          const relKey = `${currentUserEntity.id}:uses:${targetEntity.id}`;
          if (!processedRelationships.has(relKey)) {
            await callbacks.addRelationship(currentUserEntity.id, targetEntity.id, 'uses', 0.6);
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
      /项目[名是叫]\s*[""\u300c\u300d]([^""\u300c\u300d]+)[""\u300c\u300d]/g,
    ];
    for (const pattern of projectPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const projectName = match[1].trim();
        if (projectName && !processedEntities.has(`project:${projectName}`)) {
          const projectEntity = await callbacks.addEntity('project', projectName);
          processedEntities.add(`project:${projectName}`);
          entitiesAdded++;

          // 如果有当前用户，建立 created 关系
          if (currentUserEntity) {
            const relKey = `${currentUserEntity.id}:created:${projectEntity.id}`;
            if (!processedRelationships.has(relKey)) {
              await callbacks.addRelationship(currentUserEntity.id, projectEntity.id, 'created', 0.8);
              processedRelationships.add(relKey);
              relationshipsAdded++;
            }
          }
        }
      }
    }

    // 规则 5: 技术关键词 → tech 实体
    for (const tech of TECH_KEYWORDS) {
      // 使用词边界匹配，避免部分匹配
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (regex.test(text)) {
        if (!processedEntities.has(`tech:${tech}`)) {
          await callbacks.addEntity('tech', tech);
          processedEntities.add(`tech:${tech}`);
          entitiesAdded++;

          // 如果有当前用户，建立 uses 关系
          if (currentUserEntity) {
            const techEntity = callbacks.findEntity('tech', tech);
            if (techEntity) {
              const relKey = `${currentUserEntity.id}:uses:${techEntity.id}`;
              if (!processedRelationships.has(relKey)) {
                await callbacks.addRelationship(currentUserEntity.id, techEntity.id, 'uses', 0.5);
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

        const targetType = inferEntityType(target, TECH_KEYWORDS);
        const targetEntity = await callbacks.addEntity(targetType, target);
        if (!processedEntities.has(`${targetType}:${target}`)) {
          processedEntities.add(`${targetType}:${target}`);
          entitiesAdded++;
        }

        if (currentUserEntity) {
          const relKey = `${currentUserEntity.id}:knows:${targetEntity.id}`;
          if (!processedRelationships.has(relKey)) {
            await callbacks.addRelationship(currentUserEntity.id, targetEntity.id, 'knows', 0.6);
            processedRelationships.add(relKey);
            relationshipsAdded++;
          }
        }
      }
    }
  }

  return { entitiesAdded, relationshipsAdded };
}
