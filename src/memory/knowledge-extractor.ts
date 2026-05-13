import type { Entity, Relationship, EntityType, RelationshipType } from './knowledge-types.js';

// ============================================================
// 技术关键词列表
// ============================================================

const TECH_KEYWORDS: string[] = [
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

// ============================================================
// 工具函数
// ============================================================

/**
 * 根据名称推断实体类型
 * @param name 名称
 * @param techKeywords 技术关键词列表
 */
export function inferEntityType(name: string, techKeywords: string[]): EntityType {
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

// ============================================================
// 从记忆中提取实体和关系
// ============================================================

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
 * @returns 提取的实体和关系
 */
export function extractFromMemory(memories: Array<{ input: string; output?: string }>): {
  entities: Array<{ type: EntityType; label: string; attributes?: Record<string, string> }>;
  relationships: Array<{ fromLabel: string; toLabel: string; type: RelationshipType; weight: number }>;
} {
  const entities: Array<{ type: EntityType; label: string; attributes?: Record<string, string> }> = [];
  const relationships: Array<{ fromLabel: string; toLabel: string; type: RelationshipType; weight: number }> = [];

  // 当前用户实体（用于建立关系）
  let currentUserLabel: string | undefined;

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
          entities.push({ type: 'person', label: name });
          processedEntities.add(`person:${name}`);
          currentUserLabel = name;
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

        const targetType = inferEntityType(target, TECH_KEYWORDS);
        if (!processedEntities.has(`${targetType}:${target}`)) {
          entities.push({ type: targetType, label: target });
          processedEntities.add(`${targetType}:${target}`);
        }

        if (currentUserLabel) {
          const relKey = `${currentUserLabel}:likes:${target}`;
          if (!processedRelationships.has(relKey)) {
            relationships.push({ fromLabel: currentUserLabel, toLabel: target, type: 'likes', weight: 0.7 });
            processedRelationships.add(relKey);
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
        if (!processedEntities.has(`${targetType}:${target}`)) {
          entities.push({ type: targetType, label: target });
          processedEntities.add(`${targetType}:${target}`);
        }

        if (currentUserLabel) {
          const relKey = `${currentUserLabel}:uses:${target}`;
          if (!processedRelationships.has(relKey)) {
            relationships.push({ fromLabel: currentUserLabel, toLabel: target, type: 'uses', weight: 0.6 });
            processedRelationships.add(relKey);
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
          entities.push({ type: 'project', label: projectName });
          processedEntities.add(`project:${projectName}`);

          if (currentUserLabel) {
            const relKey = `${currentUserLabel}:created:${projectName}`;
            if (!processedRelationships.has(relKey)) {
              relationships.push({ fromLabel: currentUserLabel, toLabel: projectName, type: 'created', weight: 0.8 });
              processedRelationships.add(relKey);
            }
          }
        }
      }
    }

    // 规则 5: 技术关键词 → tech 实体
    for (const tech of TECH_KEYWORDS) {
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (regex.test(text)) {
        if (!processedEntities.has(`tech:${tech}`)) {
          entities.push({ type: 'tech', label: tech });
          processedEntities.add(`tech:${tech}`);

          if (currentUserLabel) {
            const relKey = `${currentUserLabel}:uses:${tech}`;
            if (!processedRelationships.has(relKey)) {
              relationships.push({ fromLabel: currentUserLabel, toLabel: tech, type: 'uses', weight: 0.5 });
              processedRelationships.add(relKey);
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
        if (!processedEntities.has(`${targetType}:${target}`)) {
          entities.push({ type: targetType, label: target });
          processedEntities.add(`${targetType}:${target}`);
        }

        if (currentUserLabel) {
          const relKey = `${currentUserLabel}:knows:${target}`;
          if (!processedRelationships.has(relKey)) {
            relationships.push({ fromLabel: currentUserLabel, toLabel: target, type: 'knows', weight: 0.6 });
            processedRelationships.add(relKey);
          }
        }
      }
    }
  }

  return { entities, relationships };
}
