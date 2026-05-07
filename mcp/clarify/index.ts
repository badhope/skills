import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'clarify',
  version: '3.0.0',
  description: '需求澄清和意图理解工具 - 帮助用户明确需求、澄清模糊描述、识别真实意图',
  author: 'MCP Mega-Agent Platform',
  icon: '🔍'
})
  .forAllPlatforms({
    categories: ['Productivity', 'AI'],
    rating: 'professional',
    features: ['意图识别', '需求澄清', '术语解释', '模糊描述处理']
  })
  .addTool({
    name: 'analyze_intent',
    description: '分析用户意图，识别核心需求',
    parameters: {
      input: { type: 'string', description: '用户输入的需求描述', required: true },
      domain: { type: 'string', description: '业务领域', enum: ['frontend', 'backend', 'database', 'devops', 'ai', 'security', 'general'], default: 'general' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        domain: { type: 'string', required: false, enum: ['frontend', 'backend', 'database', 'devops', 'ai', 'security', 'general'] }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const input = params.input.toLowerCase()
      const domain = params.domain || 'general'
      
      const intentPatterns = [
        { intent: 'create', patterns: ['创建', 'build', 'make', '新建', '开发', 'develop', 'write'], confidence: 0.9 },
        { intent: 'fix', patterns: ['修复', 'fix', '解决', 'bug', '错误', '问题', 'correct'], confidence: 0.9 },
        { intent: 'optimize', patterns: ['优化', 'optimize', '性能', 'performance', 'speed', '加速'], confidence: 0.85 },
        { intent: 'debug', patterns: ['调试', 'debug', '排查', 'trace', 'error', 'crash'], confidence: 0.85 },
        { intent: 'review', patterns: ['审查', 'review', '检查', 'audit', 'code review'], confidence: 0.8 },
        { intent: 'design', patterns: ['设计', 'design', '架构', 'architecture', 'plan'], confidence: 0.8 },
        { intent: 'integrate', patterns: ['集成', 'integrate', '对接', 'connect', 'api'], confidence: 0.8 },
        { intent: 'deploy', patterns: ['部署', 'deploy', '发布', 'release', 'deploy'], confidence: 0.8 },
        { intent: 'configure', patterns: ['配置', 'configure', 'setup', 'settings', 'config'], confidence: 0.8 },
        { intent: 'learn', patterns: ['学习', 'learn', '教程', 'tutorial', 'how to'], confidence: 0.8 }
      ]
      
      const matchedIntents = intentPatterns
        .filter(p => p.patterns.some(pt => input.includes(pt)))
        .sort((a, b) => b.confidence - a.confidence)
      
      const keywords = extractKeywords(input)
      const ambiguity = detectAmbiguity(input)
      
      return formatSuccess({
        originalInput: params.input,
        domain,
        intents: matchedIntents.slice(0, 3),
        keywords,
        ambiguity,
        confidence: matchedIntents.length > 0 ? matchedIntents[0].confidence : 0.3,
        suggestions: ambiguity.length > 0 ? [
          '检测到需求可能存在歧义',
          '建议进一步澄清以下方面:',
          ...ambiguity.map((a, i) => `${i + 1}. ${a}`)
        ] : ['需求清晰，可以继续执行']
      })
    }
  })
  .addTool({
    name: 'extract_requirements',
    description: '从用户描述中提取结构化需求',
    parameters: {
      input: { type: 'string', description: '用户输入的需求描述', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const input = params.input
      
      const requirements: Record<string, string[]> = {
        mustHave: [],
        shouldHave: [],
        couldHave: [],
        wontHave: [],
        unclear: []
      }
      
      const mustPatterns = ['必须', '需要', '一定要', '必须要', '必须有', 'need', 'must', 'required']
      const shouldPatterns = ['应该', '最好', '建议', '推荐', 'should', 'recommend']
      const couldPatterns = ['可以', '可能', '或许', 'could', 'may', 'might']
      
      const sentences = input.split(/[。！？.!?]/).filter(s => s.trim())
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim()
        if (!trimmed) continue
        
        if (mustPatterns.some(p => sentence.includes(p))) {
          requirements.mustHave.push(trimmed)
        } else if (shouldPatterns.some(p => sentence.includes(p))) {
          requirements.shouldHave.push(trimmed)
        } else if (couldPatterns.some(p => sentence.includes(p))) {
          requirements.couldHave.push(trimmed)
        } else {
          requirements.mustHave.push(trimmed)
        }
      }
      
      const unclear = detectUnclearParts(input)
      requirements.unclear = unclear
      
      return formatSuccess({
        requirements,
        summary: {
          total: sentences.length,
          mustHave: requirements.mustHave.length,
          shouldHave: requirements.shouldHave.length,
          couldHave: requirements.couldHave.length,
          unclear: requirements.unclear.length
        },
        questions: unclear.length > 0 ? generateClarificationQuestions(unclear) : [],
        nextSteps: [
          '确认需求优先级',
          '澄清模糊的需求点',
          '制定实现计划',
          '开始执行'
        ]
      })
    }
  })
  .addTool({
    name: 'generate_clarification',
    description: '针对模糊需求生成澄清问题',
    parameters: {
      input: { type: 'string', description: '用户输入的需求描述', required: true },
      questionCount: { type: 'number', description: '生成问题数量', default: 5, min: 1, max: 10 }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        questionCount: { type: 'number', required: false, min: 1, max: 10 }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const input = params.input
      const count = params.questionCount || 5
      
      const ambiguityPatterns = [
        { regex: /(什么|哪个|哪些|什么样)/, question: '你指的具体是什么？' },
        { regex: /(如何|怎么|怎样)/, question: '你希望如何实现？' },
        { regex: /(何时|什么时候)/, question: '期望的时间节点是什么？' },
        { regex: /(多少|多大|多长)/, question: '具体的数量或规模是多少？' },
        { regex: /(等等|之类|相关)/, question: '还包括哪些具体内容？' },
        { regex: /(大概|大约|差不多)/, question: '能否给出更精确的要求？' },
        { regex: /(类似|参考)/, question: '有没有具体的参考示例？' },
        { regex: /(比较|相对)/, question: '相对什么标准进行比较？' },
        { regex: /(合适|适合)/, question: '适合的具体标准是什么？' },
        { regex: /(可能|也许|或许)/, question: '是否有明确的要求？' }
      ]
      
      const keywords = extractKeywords(input)
      const questions: string[] = []
      
      for (const pattern of ambiguityPatterns) {
        if (pattern.regex.test(input)) {
          questions.push(pattern.question)
        }
      }
      
      if (questions.length === 0) {
        questions.push('你提到的需求中，最重要的目标是什么？')
        questions.push('这个需求的预期结果是什么？')
        questions.push('有没有需要特别注意的约束条件？')
        questions.push('希望使用什么技术栈来实现？')
        questions.push('有没有参考的示例或文档？')
      }
      
      if (keywords.includes('前端') || keywords.includes('frontend')) {
        questions.push('前端需要支持哪些浏览器？')
        questions.push('是否需要响应式设计？')
      }
      
      if (keywords.includes('后端') || keywords.includes('backend')) {
        questions.push('后端需要支持多少并发用户？')
        questions.push('使用什么数据库？')
      }
      
      if (keywords.includes('API') || keywords.includes('接口')) {
        questions.push('API需要遵循什么规范？')
        questions.push('需要支持哪些认证方式？')
      }
      
      return formatSuccess({
        originalInput: input,
        questions: questions.slice(0, count),
        tip: '通过回答这些问题，可以帮助我更好地理解你的需求，提供更精准的解决方案'
      })
    }
  })
  .addTool({
    name: 'explain_terms',
    description: '解释技术术语和概念',
    parameters: {
      term: { type: 'string', description: '要解释的术语', required: true },
      level: { type: 'string', description: '解释深度', enum: ['basic', 'intermediate', 'advanced'], default: 'intermediate' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        term: { type: 'string', required: true },
        level: { type: 'string', required: false, enum: ['basic', 'intermediate', 'advanced'] }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const term = params.term.toLowerCase()
      const level = params.level || 'intermediate'
      
      const termDefinitions: Record<string, { basic: string; intermediate: string; advanced: string; examples: string[]; related: string[] }> = {
        'react': {
          basic: 'React是一个用于构建用户界面的JavaScript库',
          intermediate: 'React是Facebook开发的UI库，使用组件化和虚拟DOM技术',
          advanced: 'React使用Fiber架构实现增量渲染，支持Hooks、Suspense、Concurrent Mode等高级特性',
          examples: ['React组件', 'React Hooks', 'React Router'],
          related: ['Vue', 'Angular', 'Next.js']
        },
        'typescript': {
          basic: 'TypeScript是JavaScript的超集，添加了类型系统',
          intermediate: 'TypeScript提供静态类型检查，支持ES6+特性，可编译为JavaScript',
          advanced: 'TypeScript支持高级类型如泛型、条件类型、映射类型，提供类型体操能力',
          examples: ['类型定义', '接口', '泛型函数'],
          related: ['JavaScript', 'Flow', 'Dart']
        },
        'api': {
          basic: 'API是应用程序编程接口，用于不同软件之间的通信',
          intermediate: 'API定义了软件组件之间的交互方式，常见类型有REST、GraphQL',
          advanced: 'API设计涉及接口契约、版本控制、认证授权、限流熔断等方面',
          examples: ['REST API', 'GraphQL', 'gRPC'],
          related: ['REST', 'GraphQL', 'SOAP']
        },
        'docker': {
          basic: 'Docker是一个容器化平台，用于打包和运行应用',
          intermediate: 'Docker使用容器技术，实现应用的隔离和可移植性',
          advanced: 'Docker涉及镜像构建优化、网络配置、存储卷管理、多容器编排',
          examples: ['Dockerfile', 'docker-compose', 'Docker Hub'],
          related: ['Kubernetes', 'Podman', 'containerd']
        },
        'kubernetes': {
          basic: 'Kubernetes是一个容器编排平台',
          intermediate: 'K8s自动化容器的部署、扩展和管理',
          advanced: 'K8s涉及Pod调度、Service Mesh、Operator模式、水平自动伸缩',
          examples: ['Pod', 'Service', 'Deployment'],
          related: ['Docker Swarm', 'Nomad', 'OpenShift']
        },
        'ai': {
          basic: 'AI即人工智能，让计算机模拟人类智能',
          intermediate: 'AI包括机器学习、深度学习、自然语言处理等技术',
          advanced: 'AI涉及神经网络架构、训练策略、推理优化、对齐技术',
          examples: ['ChatGPT', 'Stable Diffusion', 'TensorFlow'],
          related: ['ML', 'LLM', 'GPT']
        },
        'llm': {
          basic: 'LLM是大语言模型，能够理解和生成人类语言',
          intermediate: 'LLM基于Transformer架构，通过大量文本训练',
          advanced: 'LLM涉及预训练、微调、提示工程、RAG、工具使用等技术',
          examples: ['GPT-4', 'Claude', 'LLaMA'],
          related: ['GPT', 'Transformer', 'RAG']
        },
        'rag': {
          basic: 'RAG是检索增强生成，让AI结合外部知识',
          intermediate: 'RAG通过检索相关文档来增强LLM的回答',
          advanced: 'RAG涉及向量数据库、检索策略、文档分块、重排序等技术',
          examples: ['向量检索', '文档问答', '知识增强'],
          related: ['LLM', '向量数据库', 'Embedding']
        }
      }
      
      const definition = termDefinitions[term]
      
      if (definition) {
        return formatSuccess({
          term: params.term,
          level,
          definition: definition[level as keyof typeof definition],
          examples: definition.examples,
          relatedTerms: definition.related,
          resources: [
            `查看 ${params.term} 的官方文档`,
            `搜索 "${params.term} tutorial" 获取教程`,
            `了解 ${params.term} 的最佳实践`
          ]
        })
      } else {
        return formatSuccess({
          term: params.term,
          level,
          definition: `未找到 "${params.term}" 的预定义解释。这可能是一个特定领域的术语或缩写。`,
          suggestions: [
            '请提供更多上下文',
            '尝试用不同的方式描述这个术语',
            '检查术语拼写是否正确'
          ]
        })
      }
    }
  })
  .addTool({
    name: 'improve_description',
    description: '帮助用户优化需求描述，使其更清晰准确',
    parameters: {
      input: { type: 'string', description: '用户的原始描述', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true }
      })
      
      if (!validation.valid) {
        return formatError(validation.errors)
      }
      
      const input = params.input
      
      const improvements = []
      let improved = input
      
      if (input.length < 10) {
        improvements.push('描述过于简短，建议提供更多细节')
      }
      
      if (!input.includes('吗') && !input.includes('？') && !input.includes('。')) {
        improvements.push('建议使用完整的句子和标点符号')
      }
      
      const vagueWords = ['做一下', '弄一下', '处理一下', '搞一下', '改一下', '优化一下']
      for (const word of vagueWords) {
        if (input.includes(word)) {
          improved = improved.replace(word, '实现')
          improvements.push(`将"${word}"替换为更明确的动词`)
        }
      }
      
      const ambiguousPhrases = ['相关的', '等等', '之类的', '一些', '大概']
      for (const phrase of ambiguousPhrases) {
        if (input.includes(phrase)) {
          improvements.push(`"${phrase}"可能导致歧义，建议具体化`)
        }
      }
      
      const keyElements = ['目标', '技术栈', '时间', '约束', '期望结果']
      const missingElements = keyElements.filter(el => !input.includes(el))
      
      if (missingElements.length > 0) {
        improvements.push(`建议补充：${missingElements.join('、')}`)
      }
      
      return formatSuccess({
        original: input,
        improved,
        improvements,
        suggestions: [
          '添加具体的技术栈要求',
          '明确期望的时间节点',
          '说明约束条件',
          '描述期望的最终结果',
          '提供参考示例或文档'
        ],
        example: '优化后的描述示例：\n"我需要使用React和TypeScript创建一个用户管理系统，要求支持分页和搜索功能，需要在本周完成。"'
      })
    }
  })
  .build()

function extractKeywords(text: string): string[] {
  const keywordPatterns = [
    '前端', 'frontend', 'react', 'vue', 'nextjs', 'angular', 'typescript', 'javascript', 'css',
    '后端', 'backend', 'node', 'python', 'go', 'rust', 'api', 'rest', 'graphql',
    '数据库', 'database', 'postgres', 'mysql', 'mongodb', 'redis',
    'devops', 'docker', 'kubernetes', 'ci/cd', 'deploy',
    'ai', 'llm', 'rag', 'agent', 'gpt', 'claude',
    'security', '安全', 'auth', 'oauth', 'jwt'
  ]
  
  return keywordPatterns.filter(kw => text.toLowerCase().includes(kw.toLowerCase()))
}

function detectAmbiguity(text: string): string[] {
  const ambiguityIndicators = [
    { pattern: /(什么|哪个|哪些)/, desc: '具体指什么？' },
    { pattern: /(如何|怎么|怎样)/, desc: '如何实现？' },
    { pattern: /(何时|什么时候)/, desc: '时间节点？' },
    { pattern: /(多少|多大)/, desc: '规模或数量？' },
    { pattern: /(等等|之类)/, desc: '包含哪些内容？' },
    { pattern: /(大概|大约)/, desc: '具体标准？' },
    { pattern: /(类似|参考)/, desc: '参考示例？' }
  ]
  
  return ambiguityIndicators
    .filter(ind => ind.pattern.test(text))
    .map(ind => ind.desc)
}

function detectUnclearParts(text: string): string[] {
  const unclearPatterns = [
    /(一些|某些|相关)/,
    /(等等|之类的|等等)/,
    /(大概|大约|差不多)/,
    /(可能|也许|或许)/,
    /(适当|合适)/
  ]
  
  const unclearParts: string[] = []
  const sentences = text.split(/[。！？.!?]/).filter(s => s.trim())
  
  for (const sentence of sentences) {
    for (const pattern of unclearPatterns) {
      if (pattern.test(sentence)) {
        unclearParts.push(sentence.trim())
        break
      }
    }
  }
  
  return unclearParts
}

function generateClarificationQuestions(unclearParts: string[]): string[] {
  const questions: string[] = []
  
  for (const part of unclearParts) {
    if (part.includes('一些') || part.includes('某些')) {
      questions.push(`"${part}"中提到的具体是哪些？`)
    }
    if (part.includes('大概') || part.includes('大约')) {
      questions.push(`"${part}"的具体标准是什么？`)
    }
    if (part.includes('可能') || part.includes('也许')) {
      questions.push(`"${part}"是否有明确的要求？`)
    }
  }
  
  return questions
}