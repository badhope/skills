import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'libraries',
  version: '3.0.0',
  description: '库推荐和开源项目发现工具 - 帮助开发者发现优质开源库、API和工具',
  author: 'MCP Mega-Agent Platform',
  icon: '📚'
})
  .forAllPlatforms({
    categories: ['Productivity', 'Development'],
    rating: 'professional',
    features: ['库推荐', '开源项目发现', 'API发现', '技术选型建议']
  })
  .addTool({
    name: 'recommend_libraries',
    description: '根据需求推荐合适的开源库',
    parameters: {
      category: { type: 'string', description: '技术类别', enum: ['frontend', 'backend', 'database', 'ai', 'devops', 'testing', 'utility', 'all'], default: 'all' },
      language: { type: 'string', description: '编程语言', enum: ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'all'], default: 'all' },
      limit: { type: 'number', description: '推荐数量', default: 5, min: 1, max: 10 }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        category: { type: 'string', required: false, enum: ['frontend', 'backend', 'database', 'ai', 'devops', 'testing', 'utility', 'all'] },
        language: { type: 'string', required: false, enum: ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'all'] },
        limit: { type: 'number', required: false, min: 1, max: 10 }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const category = params.category || 'all'
      const language = params.language || 'all'
      const limit = params.limit || 5
      
      const libraries: Record<string, Array<{
        name: string;
        description: string;
        language: string;
        stars: string;
        url: string;
        features: string[];
        alternatives: string[];
        useCases: string[];
      }>> = {
        frontend: [
          {
            name: 'React',
            description: '用于构建用户界面的JavaScript库',
            language: 'JavaScript/TypeScript',
            stars: '212k',
            url: 'https://react.dev',
            features: ['组件化', '虚拟DOM', 'Hooks', 'Server Components'],
            alternatives: ['Vue', 'Angular', 'Svelte'],
            useCases: ['单页应用', '复杂UI', '移动端Web']
          },
          {
            name: 'Vue',
            description: '渐进式JavaScript框架',
            language: 'JavaScript/TypeScript',
            stars: '204k',
            url: 'https://vuejs.org',
            features: ['响应式', 'Composition API', 'Vue 3', 'Pinia'],
            alternatives: ['React', 'Svelte', 'Solid'],
            useCases: ['单页应用', '企业应用', '移动端']
          },
          {
            name: 'Next.js',
            description: 'React全栈框架',
            language: 'TypeScript',
            stars: '123k',
            url: 'https://nextjs.org',
            features: ['App Router', 'RSC', 'Turbopack', 'Edge Runtime'],
            alternatives: ['Nuxt', 'Remix', 'SvelteKit'],
            useCases: ['全栈应用', 'SEO优化', '企业级应用']
          },
          {
            name: 'Tailwind CSS',
            description: '实用优先的CSS框架',
            language: 'CSS',
            stars: '76k',
            url: 'https://tailwindcss.com',
            features: ['实用类', '设计令牌', '响应式', 'JIT模式'],
            alternatives: ['Bootstrap', 'Material UI', 'Chakra UI'],
            useCases: ['快速原型', '设计系统', '响应式设计']
          },
          {
            name: 'Zod',
            description: 'TypeScript-first验证库',
            language: 'TypeScript',
            stars: '37k',
            url: 'https://zod.dev',
            features: ['类型安全', '自动推断', '组合式', '错误处理'],
            alternatives: ['Yup', 'Joi', 'Valibot'],
            useCases: ['表单验证', 'API验证', '配置验证']
          }
        ],
        backend: [
          {
            name: 'FastAPI',
            description: '现代快速的Python API框架',
            language: 'Python',
            stars: '64k',
            url: 'https://fastapi.tiangolo.com',
            features: ['类型提示', '自动文档', '异步支持', '依赖注入'],
            alternatives: ['Django REST', 'Flask', 'Starlette'],
            useCases: ['API开发', '微服务', '机器学习API']
          },
          {
            name: 'NestJS',
            description: '渐进式Node.js框架',
            language: 'TypeScript',
            stars: '61k',
            url: 'https://nestjs.com',
            features: ['模块化', '依赖注入', 'TypeScript', '微服务'],
            alternatives: ['Express', 'Fastify', 'Koa'],
            useCases: ['企业后端', '微服务', 'API网关']
          },
          {
            name: 'Gin',
            description: 'Go语言高性能Web框架',
            language: 'Go',
            stars: '70k',
            url: 'https://gin-gonic.com',
            features: ['高性能', '中间件', '路由', 'JSON绑定'],
            alternatives: ['Echo', 'Fiber', 'Chi'],
            useCases: ['高性能API', '微服务', '云原生']
          },
          {
            name: 'Axum',
            description: 'Rust异步Web框架',
            language: 'Rust',
            stars: '18k',
            url: 'https://docs.rs/axum',
            features: ['异步', '类型安全', '高性能', 'Tower生态'],
            alternatives: ['Actix-web', 'Rocket', 'Warp'],
            useCases: ['高性能服务', '系统编程', '安全关键']
          },
          {
            name: 'tRPC',
            description: '端到端类型安全的API框架',
            language: 'TypeScript',
            stars: '27k',
            url: 'https://trpc.io',
            features: ['类型安全', '自动类型推断', '零代码生成', '全栈集成'],
            alternatives: ['GraphQL', 'REST', 'gRPC'],
            useCases: ['全栈应用', '类型安全API', '实时更新']
          }
        ],
        database: [
          {
            name: 'Prisma',
            description: '下一代ORM',
            language: 'TypeScript',
            stars: '46k',
            url: 'https://www.prisma.io',
            features: ['类型安全', '自动迁移', '查询构建器', '多数据库'],
            alternatives: ['TypeORM', 'Sequelize', 'Django ORM'],
            useCases: ['数据库访问', '数据建模', '迁移管理']
          },
          {
            name: 'Drizzle ORM',
            description: 'TypeScript优先的ORM',
            language: 'TypeScript',
            stars: '14k',
            url: 'https://orm.drizzle.team',
            features: ['SQL优先', '类型安全', '零开销', '灵活'],
            alternatives: ['Prisma', 'Kysely', 'Zapatos'],
            useCases: ['高性能数据库', '复杂查询', '类型安全']
          },
          {
            name: 'Redis OM',
            description: 'Redis对象映射器',
            language: '多种语言',
            stars: '4k',
            url: 'https://github.com/redis/redis-om',
            features: ['对象映射', '全文搜索', 'JSON支持', '索引'],
            alternatives: ['ioredis', 'redis-py', 'go-redis'],
            useCases: ['缓存', '会话存储', '实时数据']
          },
          {
            name: 'Mongoose',
            description: 'MongoDB ODM',
            language: 'JavaScript/TypeScript',
            stars: '26k',
            url: 'https://mongoosejs.com',
            features: ['Schema定义', '中间件', '验证', '查询构建'],
            alternatives: ['Prisma', 'MongoDB Driver', 'Typegoose'],
            useCases: ['MongoDB应用', '文档数据库', '灵活数据']
          }
        ],
        ai: [
          {
            name: 'LangChain',
            description: '构建LLM应用的框架',
            language: 'Python/TypeScript',
            stars: '82k',
            url: 'https://www.langchain.com',
            features: ['LLM集成', 'RAG', '工具使用', '记忆系统'],
            alternatives: ['LlamaIndex', 'DSPy', 'Haystack'],
            useCases: ['AI代理', 'RAG系统', '自动化工作流']
          },
          {
            name: 'LlamaIndex',
            description: '数据增强LLM框架',
            language: 'Python/TypeScript',
            stars: '27k',
            url: 'https://www.llamaindex.ai',
            features: ['数据连接', '索引构建', '查询引擎', 'RAG'],
            alternatives: ['LangChain', 'Haystack', 'Marqo'],
            useCases: ['企业RAG', '文档问答', '知识管理']
          },
          {
            name: 'Pillow',
            description: 'Python图像处理库',
            language: 'Python',
            stars: '10k',
            url: 'https://python-pillow.org',
            features: ['图像操作', '格式转换', '滤镜', '缩略图'],
            alternatives: ['OpenCV', 'scikit-image', 'Matplotlib'],
            useCases: ['图像处理', '计算机视觉', '图像生成']
          },
          {
            name: 'PyTorch',
            description: '深度学习框架',
            language: 'Python',
            stars: '73k',
            url: 'https://pytorch.org',
            features: ['张量计算', '自动微分', 'GPU加速', '神经网络'],
            alternatives: ['TensorFlow', 'JAX', 'MXNet'],
            useCases: ['深度学习', 'AI训练', '研究']
          }
        ],
        devops: [
          {
            name: 'Docker Compose',
            description: '多容器应用编排',
            language: 'YAML',
            stars: '31k',
            url: 'https://docs.docker.com/compose',
            features: ['多容器', '网络', '卷管理', '一键部署'],
            alternatives: ['Kubernetes', 'Podman Compose', 'Nomad'],
            useCases: ['本地开发', '测试环境', '小型部署']
          },
          {
            name: 'Helm',
            description: 'Kubernetes包管理器',
            language: 'Go',
            stars: '25k',
            url: 'https://helm.sh',
            features: ['Chart管理', '模板', '版本控制', '回滚'],
            alternatives: ['Kustomize', 'Argo CD', 'Flux'],
            useCases: ['K8s部署', '应用管理', 'CI/CD']
          },
          {
            name: 'Terraform',
            description: '基础设施即代码',
            language: 'HCL',
            stars: '46k',
            url: 'https://www.terraform.io',
            features: ['声明式', '多云支持', '状态管理', '模块化'],
            alternatives: ['AWS CDK', 'Pulumi', 'Ansible'],
            useCases: ['云基础设施', '自动化部署', '环境管理']
          }
        ],
        testing: [
          {
            name: 'Jest',
            description: 'JavaScript测试框架',
            language: 'JavaScript/TypeScript',
            stars: '45k',
            url: 'https://jestjs.io',
            features: ['快照测试', 'Mock', '覆盖率', '并行执行'],
            alternatives: ['Vitest', 'Mocha', 'AVA'],
            useCases: ['单元测试', '集成测试', '快照测试']
          },
          {
            name: 'Vitest',
            description: '下一代前端测试框架',
            language: 'TypeScript',
            stars: '13k',
            url: 'https://vitest.dev',
            features: ['ESM优先', '极速', 'HMR', 'Jest兼容'],
            alternatives: ['Jest', 'Playwright', 'Cypress'],
            useCases: ['前端测试', '组件测试', '快速迭代']
          },
          {
            name: 'Playwright',
            description: '端到端测试框架',
            language: 'TypeScript/Python',
            stars: '44k',
            url: 'https://playwright.dev',
            features: ['多浏览器', '自动等待', '截图', '移动端'],
            alternatives: ['Cypress', 'Selenium', 'Puppeteer'],
            useCases: ['E2E测试', '视觉测试', '自动化']
          },
          {
            name: 'PyTest',
            description: 'Python测试框架',
            language: 'Python',
            stars: '10k',
            url: 'https://docs.pytest.org',
            features: ['简单', 'fixture', '插件', '参数化'],
            alternatives: ['unittest', 'nose2', 'tox'],
            useCases: ['Python测试', '单元测试', '集成测试']
          }
        ],
        utility: [
          {
            name: 'Lodash',
            description: 'JavaScript实用工具库',
            language: 'JavaScript',
            stars: '57k',
            url: 'https://lodash.com',
            features: ['集合操作', '函数式', '性能优化', '模块化'],
            alternatives: ['Ramda', 'Underscore', 'Native ES6+'],
            useCases: ['数据处理', '函数式编程', '工具函数']
          },
          {
            name: 'Requests',
            description: 'Python HTTP库',
            language: 'Python',
            stars: '45k',
            url: 'https://requests.readthedocs.io',
            features: ['简洁API', '会话', '认证', '超时'],
            alternatives: ['httpx', 'aiohttp', 'urllib'],
            useCases: ['HTTP请求', 'API调用', '网络爬虫']
          },
          {
            name: 'RxJS',
            description: '响应式编程库',
            language: 'TypeScript',
            stars: '29k',
            url: 'https://rxjs.dev',
            features: ['响应式流', '操作符', '异步处理', '组合'],
            alternatives: ['Most.js', 'Bacon.js', 'ReactiveX'],
            useCases: ['事件处理', '数据流', '实时更新']
          }
        ]
      }
      
      let filtered = []
      
      if (category === 'all') {
        for (const cat of Object.keys(libraries)) {
          filtered = [...filtered, ...libraries[cat as keyof typeof libraries]]
        }
      } else {
        filtered = libraries[category as keyof typeof libraries] || []
      }
      
      if (language !== 'all') {
        filtered = filtered.filter(lib => 
          lib.language.toLowerCase().includes(language.toLowerCase())
        )
      }
      
      filtered = filtered.sort((a, b) => {
        const starsA = parseInt(a.stars.replace('k', '000'))
        const starsB = parseInt(b.stars.replace('k', '000'))
        return starsB - starsA
      })
      
      return formatSuccess({
        category,
        language,
        count: filtered.length,
        libraries: filtered.slice(0, limit),
        tips: [
          '根据Star数排序，优先推荐流行且维护良好的库',
          '考虑项目活跃度和社区支持',
          '查看文档质量和更新频率',
          '评估学习曲线和团队熟悉度'
        ]
      })
    }
  })
  .addTool({
    name: 'find_apis',
    description: '发现有用的开源API和服务',
    parameters: {
      category: { type: 'string', description: 'API类别', enum: ['ai', 'payment', 'weather', 'maps', 'social', 'news', 'data', 'all'], default: 'all' },
      limit: { type: 'number', description: '推荐数量', default: 5, min: 1, max: 10 }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        category: { type: 'string', required: false, enum: ['ai', 'payment', 'weather', 'maps', 'social', 'news', 'data', 'all'] },
        limit: { type: 'number', required: false, min: 1, max: 10 }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const category = params.category || 'all'
      const limit = params.limit || 5
      
      const apis: Record<string, Array<{
        name: string;
        description: string;
        provider: string;
        url: string;
        auth: string;
        freeTier: boolean;
        features: string[];
        useCases: string[];
      }>> = {
        ai: [
          {
            name: 'OpenAI API',
            description: '访问GPT系列模型和DALL-E图像生成',
            provider: 'OpenAI',
            url: 'https://platform.openai.com',
            auth: 'API Key',
            freeTier: true,
            features: ['GPT-4', 'DALL-E', 'Whisper', 'Embeddings'],
            useCases: ['聊天机器人', '内容生成', '语音识别']
          },
          {
            name: 'Anthropic API',
            description: '访问Claude大语言模型',
            provider: 'Anthropic',
            url: 'https://console.anthropic.com',
            auth: 'API Key',
            freeTier: true,
            features: ['Claude 3', '长上下文', 'XML支持', '工具使用'],
            useCases: ['长文档处理', '企业AI', '合规AI']
          },
          {
            name: 'Google Gemini API',
            description: '访问Google的Gemini模型',
            provider: 'Google',
            url: 'https://ai.google.dev',
            auth: 'API Key',
            freeTier: true,
            features: ['Gemini 1.5', '多模态', '代码生成', '安全性'],
            useCases: ['多模态AI', '搜索增强', '教育AI']
          },
          {
            name: 'Stability AI API',
            description: 'AI图像生成服务',
            provider: 'Stability AI',
            url: 'https://platform.stability.ai',
            auth: 'API Key',
            freeTier: true,
            features: ['Stable Diffusion', '图像生成', '图像编辑', '风格转换'],
            useCases: ['图像生成', '设计', '游戏素材']
          }
        ],
        payment: [
          {
            name: 'Stripe API',
            description: '支付处理平台',
            provider: 'Stripe',
            url: 'https://stripe.com/docs/api',
            auth: 'API Key',
            freeTier: true,
            features: ['支付处理', '订阅', '发票', '退款'],
            useCases: ['电商支付', '订阅服务', 'SaaS收费']
          },
          {
            name: 'PayPal API',
            description: '全球支付解决方案',
            provider: 'PayPal',
            url: 'https://developer.paypal.com',
            auth: 'OAuth',
            freeTier: true,
            features: ['支付', '转账', '商家服务', '全球支持'],
            useCases: ['跨境支付', '在线交易', '市场平台']
          }
        ],
        weather: [
          {
            name: 'OpenWeatherMap API',
            description: '天气数据API',
            provider: 'OpenWeatherMap',
            url: 'https://openweathermap.org/api',
            auth: 'API Key',
            freeTier: true,
            features: ['当前天气', '预报', '历史数据', '气象预警'],
            useCases: ['天气应用', '农业', '物流']
          },
          {
            name: 'WeatherAPI.com',
            description: '全球天气数据',
            provider: 'WeatherAPI',
            url: 'https://www.weatherapi.com',
            auth: 'API Key',
            freeTier: true,
            features: ['实时天气', '预报', '天文数据', '空气质量'],
            useCases: ['天气应用', '旅行APP', '户外活动']
          }
        ],
        maps: [
          {
            name: 'Google Maps API',
            description: '谷歌地图服务',
            provider: 'Google',
            url: 'https://developers.google.com/maps',
            auth: 'API Key',
            freeTier: true,
            features: ['地图显示', '地理编码', '路线规划', '地点搜索'],
            useCases: ['地图应用', '导航', '位置服务']
          },
          {
            name: 'OpenStreetMap API',
            description: '开源地图数据',
            provider: 'OSM Foundation',
            url: 'https://wiki.openstreetmap.org/wiki/API',
            auth: 'None',
            freeTier: true,
            features: ['地图数据', '地理编码', '路由', '开源'],
            useCases: ['开源地图', '自定义地图', '研究']
          }
        ],
        social: [
          {
            name: 'GitHub API',
            description: '访问GitHub数据',
            provider: 'GitHub',
            url: 'https://docs.github.com/en/rest',
            auth: 'OAuth/Token',
            freeTier: true,
            features: ['仓库管理', '用户数据', '事件', 'Webhooks'],
            useCases: ['开发工具', '统计分析', '自动化']
          },
          {
            name: 'Twitter API',
            description: '访问Twitter/X数据',
            provider: 'X Corp',
            url: 'https://developer.twitter.com',
            auth: 'OAuth',
            freeTier: false,
            features: ['推文', '用户', '搜索', '实时流'],
            useCases: ['社交媒体', '舆情分析', '自动化']
          }
        ],
        news: [
          {
            name: 'NewsAPI',
            description: '新闻聚合API',
            provider: 'NewsAPI.org',
            url: 'https://newsapi.org',
            auth: 'API Key',
            freeTier: true,
            features: ['新闻搜索', '头条', '分类', '多语言'],
            useCases: ['新闻应用', '内容聚合', '监控']
          },
          {
            name: 'Reddit API',
            description: '访问Reddit数据',
            provider: 'Reddit',
            url: 'https://www.reddit.com/dev/api',
            auth: 'OAuth',
            freeTier: true,
            features: ['帖子', '评论', '子版块', '投票'],
            useCases: ['社区数据', '内容聚合', '社交分析']
          }
        ],
        data: [
          {
            name: 'REST Countries',
            description: '国家数据API',
            provider: 'REST Countries',
            url: 'https://restcountries.com',
            auth: 'None',
            freeTier: true,
            features: ['国家信息', '边界', '语言', '货币'],
            useCases: ['国际化', '地理应用', '教育']
          },
          {
            name: 'JSONPlaceholder',
            description: '假数据API',
            provider: 'JSONPlaceholder',
            url: 'https://jsonplaceholder.typicode.com',
            auth: 'None',
            freeTier: true,
            features: ['假数据', 'CRUD', '图片', '评论'],
            useCases: ['开发测试', '原型', '学习']
          }
        ]
      }
      
      let filtered = []
      
      if (category === 'all') {
        for (const cat of Object.keys(apis)) {
          filtered = [...filtered, ...apis[cat as keyof typeof apis]]
        }
      } else {
        filtered = apis[category as keyof typeof apis] || []
      }
      
      return formatSuccess({
        category,
        count: filtered.length,
        apis: filtered.slice(0, limit),
        tips: [
          '优先考虑提供免费套餐的API用于开发和测试',
          '关注API的调用限制和定价',
          '检查API文档的质量和更新频率',
          '考虑服务商的可靠性和支持'
        ]
      })
    }
  })
  .addTool({
    name: 'compare_libraries',
    description: '比较多个库的优缺点',
    parameters: {
      libraries: { type: 'array', description: '要比较的库名称列表', required: true, items: { type: 'string' } }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        libraries: { type: 'array', required: true }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const libNames = params.libraries as string[]
      
      const comparisons: Record<string, {
        name: string;
        pros: string[];
        cons: string[];
        bestFor: string[];
        popularity: string;
        learningCurve: string;
        ecosystem: string;
      }> = {
        'React': {
          name: 'React',
          pros: ['生态成熟', '社区活跃', '灵活性高', 'Hooks强大', 'SSR支持好'],
          cons: ['样板代码多', '需要额外配置', '状态管理复杂', 'JSX学习曲线'],
          bestFor: ['大型应用', '需要高度定制', '前端团队'],
          popularity: '极高',
          learningCurve: '中等',
          ecosystem: '非常丰富'
        },
        'Vue': {
          name: 'Vue',
          pros: ['学习曲线平缓', '响应式简单', '模板语法直观', '官方工具完善', '体积小'],
          cons: ['生态相对小', '企业采用率较低', '某些模式不够成熟'],
          bestFor: ['快速开发', '中小型项目', '新手友好'],
          popularity: '高',
          learningCurve: '低',
          ecosystem: '良好'
        },
        'Svelte': {
          name: 'Svelte',
          pros: ['编译时优化', '体积极小', '语法简洁', '性能优异', '学习曲线低'],
          cons: ['生态较小', '社区相对小', '大型项目经验少'],
          bestFor: ['性能敏感', '小型应用', '快速原型'],
          popularity: '中',
          learningCurve: '低',
          ecosystem: '正在成长'
        },
        'Angular': {
          name: 'Angular',
          pros: ['全功能框架', 'TypeScript原生', '官方支持强', '企业级', 'DI系统'],
          cons: ['学习曲线陡峭', '体积大', '灵活性低', '更新频繁'],
          bestFor: ['大型企业应用', '需要完整框架', 'Java背景团队'],
          popularity: '中',
          learningCurve: '高',
          ecosystem: '完善'
        },
        'Next.js': {
          name: 'Next.js',
          pros: ['全栈能力', 'App Router', 'RSC', '优化好', '部署简单'],
          cons: ['学习曲线', '服务器成本', '锁定Vercel'],
          bestFor: ['全栈应用', 'SEO重要', '企业级'],
          popularity: '高',
          learningCurve: '中等',
          ecosystem: '丰富'
        },
        'Nuxt': {
          name: 'Nuxt',
          pros: ['Vue生态', '全栈能力', 'DX优秀', '配置简单'],
          cons: ['生态较小', '社区支持少'],
          bestFor: ['Vue全栈', '快速开发', '中小型项目'],
          popularity: '中',
          learningCurve: '低',
          ecosystem: '良好'
        },
        'FastAPI': {
          name: 'FastAPI',
          pros: ['类型提示', '自动文档', '异步支持', '性能好', '现代设计'],
          cons: ['相对新', '生态小', 'Python生态'],
          bestFor: ['Python后端', 'API优先', '快速开发'],
          popularity: '高',
          learningCurve: '低',
          ecosystem: '良好'
        },
        'NestJS': {
          name: 'NestJS',
          pros: ['TypeScript', '模块化', 'DI系统', '企业级', '微服务支持'],
          cons: ['学习曲线', '样板代码', '性能开销'],
          bestFor: ['Node.js企业后端', '微服务', 'TypeScript团队'],
          popularity: '高',
          learningCurve: '中等',
          ecosystem: '良好'
        },
        'Gin': {
          name: 'Gin',
          pros: ['高性能', '轻量级', '中间件丰富', '路由快'],
          cons: ['Go语言', '生态有限', '模板较少'],
          bestFor: ['高性能API', '微服务', '云原生'],
          popularity: '高',
          learningCurve: '低',
          ecosystem: '良好'
        },
        'Prisma': {
          name: 'Prisma',
          pros: ['类型安全', '自动迁移', '查询构建', '多数据库'],
          cons: ['性能开销', '灵活性有限', '学习曲线'],
          bestFor: ['类型安全优先', '快速开发', '团队协作'],
          popularity: '高',
          learningCurve: '中等',
          ecosystem: '良好'
        },
        'Drizzle': {
          name: 'Drizzle',
          pros: ['SQL优先', '零开销', '类型安全', '灵活性'],
          cons: ['相对新', '生态小', '文档少'],
          bestFor: ['性能敏感', '需要SQL控制', 'TypeScript'],
          popularity: '中',
          learningCurve: '中等',
          ecosystem: '正在成长'
        },
        'Jest': {
          name: 'Jest',
          pros: ['开箱即用', '快照测试', 'Mock强大', '覆盖率'],
          cons: ['速度慢', '配置复杂', '生态锁定'],
          bestFor: ['JavaScript测试', '快照测试', '团队测试'],
          popularity: '极高',
          learningCurve: '低',
          ecosystem: '丰富'
        },
        'Vitest': {
          name: 'Vitest',
          pros: ['极速', 'ESM优先', 'HMR', 'Jest兼容'],
          cons: ['相对新', '生态小', '某些功能不完善'],
          bestFor: ['前端测试', '快速迭代', 'Vite项目'],
          popularity: '高',
          learningCurve: '低',
          ecosystem: '正在成长'
        },
        'Playwright': {
          name: 'Playwright',
          pros: ['多浏览器', '自动等待', '截图', '移动端'],
          cons: ['资源重', '学习曲线', '配置复杂'],
          bestFor: ['E2E测试', '视觉测试', '跨浏览器'],
          popularity: '高',
          learningCurve: '中等',
          ecosystem: '良好'
        },
        'LangChain': {
          name: 'LangChain',
          pros: ['LLM集成', 'RAG支持', '工具使用', '生态丰富'],
          cons: ['复杂性', '学习曲线', '性能开销'],
          bestFor: ['AI代理', 'RAG系统', '复杂LLM应用'],
          popularity: '高',
          learningCurve: '高',
          ecosystem: '丰富'
        },
        'LlamaIndex': {
          name: 'LlamaIndex',
          pros: ['数据连接', '索引构建', '查询引擎', 'RAG优化'],
          cons: ['相对新', '文档少', '生态小'],
          bestFor: ['企业RAG', '文档问答', '知识管理'],
          popularity: '中',
          learningCurve: '中等',
          ecosystem: '正在成长'
        },
        'Docker Compose': {
          name: 'Docker Compose',
          pros: ['简单易用', '本地开发', '配置简单', '一键部署'],
          cons: ['生产有限', '扩展性差', '网络复杂'],
          bestFor: ['本地开发', '测试环境', '小型部署'],
          popularity: '极高',
          learningCurve: '低',
          ecosystem: '丰富'
        },
        'Kubernetes': {
          name: 'Kubernetes',
          pros: ['强大', '高可用', '自动扩展', '云原生'],
          cons: ['复杂度高', '学习曲线陡峭', '资源开销'],
          bestFor: ['生产环境', '大规模', '微服务'],
          popularity: '极高',
          learningCurve: '高',
          ecosystem: '非常丰富'
        },
        'Terraform': {
          name: 'Terraform',
          pros: ['声明式', '多云支持', '状态管理', '模块化'],
          cons: ['HCL学习', '状态管理复杂', '调试困难'],
          bestFor: ['基础设施即代码', '多云部署', '规模化'],
          popularity: '高',
          learningCurve: '中等',
          ecosystem: '丰富'
        }
      }
      
      const results = libNames
        .map(name => comparisons[name])
        .filter(Boolean)
      
      return formatSuccess({
        libraries: libNames,
        comparedCount: results.length,
        notFound: libNames.filter(name => !comparisons[name]),
        comparison: results,
        recommendations: results.length >= 2 ? generateRecommendation(results) : []
      })
    }
  })
  .addTool({
    name: 'get_best_practices',
    description: '获取技术选型的最佳实践建议',
    parameters: {
      scenario: { type: 'string', description: '应用场景', enum: ['startup', 'enterprise', 'personal', 'api', 'mobile', 'ai'], default: 'startup' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        scenario: { type: 'string', required: false, enum: ['startup', 'enterprise', 'personal', 'api', 'mobile', 'ai'] }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const scenario = params.scenario || 'startup'
      
      const bestPractices: Record<string, {
        description: string;
        frontend: string[];
        backend: string[];
        database: string[];
        devops: string[];
        ai: string[];
        recommendations: string[];
      }> = {
        startup: {
          description: '初创公司 - 快速迭代、快速验证',
          frontend: ['Next.js', 'React/Vue', 'Tailwind CSS', 'Vite'],
          backend: ['Next.js API', 'FastAPI', 'Supabase', 'Firebase'],
          database: ['PostgreSQL', 'Supabase', 'PlanetScale', 'MongoDB Atlas'],
          devops: ['Vercel', 'Railway', 'Docker Compose', 'GitHub Actions'],
          ai: ['OpenAI API', 'Vercel AI SDK', 'LangChain'],
          recommendations: [
            '优先选择全栈框架减少配置',
            '使用PaaS服务减少运维',
            '保持技术栈简单',
            '快速验证假设比完美更重要'
          ]
        },
        enterprise: {
          description: '企业级应用 - 稳定性、可扩展性、安全性',
          frontend: ['React', 'Next.js', 'TypeScript', 'Design System'],
          backend: ['NestJS', 'Go (Gin)', 'Kotlin', 'gRPC'],
          database: ['PostgreSQL', 'Redis', 'Elasticsearch', 'AWS RDS'],
          devops: ['Kubernetes', 'Terraform', 'CI/CD', 'Monitoring'],
          ai: ['Enterprise AI', 'Self-hosted models', 'Security-first'],
          recommendations: [
            '选择成熟稳定的技术',
            '注重代码质量和测试',
            '建立完善的DevOps流程',
            '考虑长期维护成本'
          ]
        },
        personal: {
          description: '个人项目 - 学习、兴趣、实验',
          frontend: ['React/Vue/Svelte', 'Tailwind CSS', 'Vite'],
          backend: ['Node.js', 'Python', 'Go', 'Deno'],
          database: ['SQLite', 'PostgreSQL', 'Redis'],
          devops: ['Vercel', 'Netlify', 'Fly.io', 'Docker'],
          ai: ['OpenAI API', 'LLaMA', 'Hugging Face'],
          recommendations: [
            '尝试新技术和框架',
            '保持代码整洁但不必过度设计',
            '利用免费托管服务',
            '记录学习过程'
          ]
        },
        api: {
          description: 'API服务 - 高性能、高可用、API优先',
          frontend: ['OpenAPI Spec', 'Swagger UI', 'Redoc'],
          backend: ['FastAPI', 'Gin', 'NestJS', 'tRPC'],
          database: ['PostgreSQL', 'Redis', 'ClickHouse'],
          devops: ['Docker', 'Kubernetes', 'API Gateway', 'Rate Limiting'],
          ai: ['API-first AI', 'Vector DB'],
          recommendations: [
            '先定义API契约再实现',
            '注重文档和版本控制',
            '实现限流和熔断',
            '监控API性能'
          ]
        },
        mobile: {
          description: '移动端应用 - 跨平台、性能、用户体验',
          frontend: ['React Native', 'Flutter', 'Swift/Kotlin'],
          backend: ['REST API', 'GraphQL', 'gRPC'],
          database: ['PostgreSQL', 'Firebase', 'Realm'],
          devops: ['App Center', 'Fastlane', 'CI/CD'],
          ai: ['On-device AI', 'Edge ML'],
          recommendations: [
            '考虑跨平台还是原生',
            '优化应用包大小',
            '注重离线体验',
            '处理网络不稳定场景'
          ]
        },
        ai: {
          description: 'AI应用 - LLM、RAG、智能系统',
          frontend: ['React', 'Next.js', 'Stream UI'],
          backend: ['FastAPI', 'LangChain', 'LlamaIndex'],
          database: ['Vector DB', 'PostgreSQL', 'Redis'],
          devops: ['GPU instances', 'Model caching', 'Monitoring'],
          ai: ['LLM API', 'RAG', 'Fine-tuning', 'Embeddings'],
          recommendations: [
            '先从API开始再考虑自建',
            '注重成本控制',
            '实现良好的错误处理',
            '考虑模型安全和对齐'
          ]
        }
      }
      
      return formatSuccess({
        scenario,
        ...bestPractices[scenario],
        additionalTips: [
          '评估团队现有技能',
          '考虑社区支持和文档',
          '评估长期维护成本',
          '从小规模开始验证',
          '保持技术栈精简'
        ]
      })
    }
  })
  .build()

function generateRecommendation(libraries: Array<{
  name: string;
  pros: string[];
  cons: string[];
  bestFor: string[];
  popularity: string;
  learningCurve: string;
  ecosystem: string;
}>): string[] {
  const recommendations: string[] = []
  
  const sortedByPopularity = [...libraries].sort((a, b) => {
    const order = { '极高': 4, '高': 3, '中': 2, '低': 1 }
    return order[b.popularity] - order[a.popularity]
  })
  
  const sortedByLearningCurve = [...libraries].sort((a, b) => {
    const order = { '低': 1, '中等': 2, '高': 3 }
    return order[a.learningCurve] - order[b.learningCurve]
  })
  
  recommendations.push(`最流行的选择: ${sortedByPopularity[0].name}`)
  recommendations.push(`学习曲线最低: ${sortedByLearningCurve[0].name}`)
  
  const ecosystemRich = libraries.filter(l => l.ecosystem === '非常丰富' || l.ecosystem === '丰富')
  if (ecosystemRich.length > 0) {
    recommendations.push(`生态系统最完善: ${ecosystemRich.map(l => l.name).join(', ')}`)
  }
  
  return recommendations
}