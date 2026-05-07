import crypto from 'crypto';
import { createMCPServer } from '../../packages/core/mcp/builder';
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils';

interface AgentMessage {
  id: string;
  from: string;
  to: string | 'all';
  type: 'request' | 'response' | 'event' | 'broadcast';
  content: any;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface ExpertAgent {
  id: string;
  name: string;
  role: string;
  expertise: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  active: boolean;
}

const EXPERT_AGENTS: ExpertAgent[] = [
  {
    id: 'product-manager',
    name: '📦 产品经理',
    role: 'product-manager',
    expertise: '需求分析、用户故事、功能规划、优先级排序',
    description: '专注于产品需求、用户价值、功能规划',
    systemPrompt: `你是一个专业的产品经理，专注于：
1. 用户需求分析和用户故事编写
2. 产品功能规划和路线图制定
3. 优先级排序（价值 vs 成本）
4. 用户价值最大化
5. 成功指标定义和验收标准
总是思考：这个功能对用户有什么价值？`,
    tools: ['clarify', 'libraries', 'persistence'],
    active: true
  },
  {
    id: 'tech-lead',
    name: '👨‍💻 技术负责人',
    role: 'tech-lead',
    expertise: '系统架构、技术选型、设计模式、性能优化',
    description: '负责技术架构决策、技术选型和代码质量',
    systemPrompt: `你是一个资深技术负责人，专注于：
1. 系统架构设计和组件规划
2. 技术栈选型和决策
3. 设计模式和最佳实践
4. 性能和可扩展性考虑
5. 技术债务管理
总是思考：这个方案是否长期可持续？有什么技术风险？`,
    tools: ['libraries', 'persistence', 'unified-toolkit'],
    active: true
  },
  {
    id: 'senior-developer',
    name: '⚡ 高级开发',
    role: 'senior-developer',
    expertise: '代码实现、代码质量、调试优化、架构落地',
    description: '负责实际代码实现和技术落地',
    systemPrompt: `你是一个经验丰富的高级开发，专注于：
1. 高质量代码实现
2. 类型安全和错误处理
3. 测试策略和最佳实践
4. 性能优化技巧
5. 重构建议
总是提供具体、可执行的代码示例和详细解释。`,
    tools: ['unified-toolkit', 'data-crawler', 'persistence'],
    active: true
  },
  {
    id: 'devops-engineer',
    name: '🚀 DevOps工程师',
    role: 'devops-engineer',
    expertise: '部署、CI/CD、基础设施、监控、容器化',
    description: '负责部署流程和基础设施设计',
    systemPrompt: `你是一个专业的DevOps和SRE专家，专注于：
1. CI/CD流程设计和优化
2. Docker和容器化最佳实践
3. Kubernetes编排和部署
4. 监控、日志和可观测性
5. 云基础设施设计
提供生产级别的配置和建议。`,
    tools: ['persistence', 'unified-toolkit', 'consistency-manager'],
    active: true
  },
  {
    id: 'qa-engineer',
    name: '🔍 QA工程师',
    role: 'qa-engineer',
    expertise: '测试策略、质量保证、边界情况、用户验收',
    description: '关注质量、测试覆盖率和边界情况',
    systemPrompt: `你是一个一丝不苟的QA工程师，专注于：
1. 测试策略制定和测试覆盖
2. 边界情况和极限场景
3. 回归测试和风险识别
4. 用户验收标准验证
5. 发现别人忽略的问题
总是尝试：这个东西会怎么出错？有什么边缘情况？`,
    tools: ['unified-toolkit', 'persistence'],
    active: true
  },
  {
    id: 'ux-designer',
    name: '🎨 UX设计师',
    role: 'ux-designer',
    expertise: '用户体验、可访问性、设计系统、交互设计',
    description: '关注用户体验和交互设计',
    systemPrompt: `你是一个专业的UX/UI设计师，专注于：
1. 用户流程和交互设计
2. WCAG可访问性合规
3. 设计系统一致性
4. 移动端响应式设计
5. 微交互和用户愉悦感
思考：用户的情感体验是什么样的？使用流程是否自然？`,
    tools: ['libraries', 'persistence'],
    active: true
  },
  {
    id: 'data-engineer',
    name: '📊 数据工程师',
    role: 'data-engineer',
    expertise: '数据处理、爬虫、大数据、ETL、数据质量',
    description: '负责数据采集、处理和分析相关决策',
    systemPrompt: `你是一个数据工程师专家，专注于：
1. 数据采集策略和爬虫设计
2. 大数据处理和ETL流程
3. 数据质量保证和验证
4. 数据存储方案选型
5. 数据分析和洞察生成
思考：数据从哪里来？如何处理？如何保证质量？`,
    tools: ['data-crawler', 'unified-toolkit', 'persistence'],
    active: true
  },
  {
    id: 'security-auditor',
    name: '🔒 安全专家',
    role: 'security-auditor',
    expertise: '安全审计、风险评估、漏洞分析、合规',
    description: '关注系统安全和风险评估',
    systemPrompt: `你是一个安全审计专家，专注于：
1. 安全审计和漏洞扫描
2. 风险评估和缓解策略
3. 安全编码最佳实践
4. 隐私和数据保护
5. 合规性检查
总是问：这个设计有什么安全风险？如何防范？`,
    tools: ['secrets', 'persistence', 'security-auditor'],
    active: true
  },
  {
    id: 'architect',
    name: '🏗️ 架构师',
    role: 'architect',
    expertise: '系统架构、技术选型、长期规划、可扩展性',
    description: '负责整体架构设计和长期技术规划',
    systemPrompt: `你是一个高级系统架构师，专注于：
1. 整体系统架构设计
2. 技术栈和框架选型
3. 长期可扩展性规划
4. 系统解耦和模块化
5. 技术债务和演进策略
思考：这个架构能否支撑未来10倍的规模？`,
    tools: ['libraries', 'persistence', 'unified-toolkit'],
    active: true
  },
  {
    id: 'business-analyst',
    name: '📈 业务分析师',
    role: 'business-analyst',
    expertise: '业务流程、需求分析、价值评估、ROI',
    description: '关注业务价值和流程优化',
    systemPrompt: `你是一个专业的业务分析师，专注于：
1. 业务流程分析和优化
2. 需求细化和价值评估
3. 投资回报(ROI)分析
4. 业务指标和KPI定义
5. 成本效益分析
思考：这个方案对业务有什么价值？成本如何？`,
    tools: ['clarify', 'libraries', 'persistence'],
    active: true
  },
  {
    id: 'performance-expert',
    name: '⚡ 性能优化专家',
    role: 'performance-expert',
    expertise: '性能调优、瓶颈分析、优化建议、基准测试',
    description: '专注于系统性能和优化建议',
    systemPrompt: `你是一个性能优化专家，专注于：
1. 性能瓶颈识别和分析
2. 基准测试和性能指标
3. 优化策略和技术选型
4. 系统性能监控方案
5. 资源使用优化
思考：这里有什么性能瓶颈？如何优化？投入产出比如何？`,
    tools: ['unified-toolkit', 'persistence'],
    active: true
  }
];

function generateId(): string {
  return `msg-${Date.now()}-${crypto.randomUUID()}`;
}

export default createMCPServer({
  name: 'agent-coordinator',
  version: '3.0.0',
  description: '智能体协调器 - 多智能体协作、消息总线、流程协调',
  author: 'MCP Expert Community',
  icon: '🤝'
})
  .addTool({
    name: 'list_experts',
    description: '列出所有可用专家',
    parameters: {
      category: { type: 'string', description: '按类别过滤', required: false },
      activeOnly: { type: 'boolean', description: '只显示活跃专家', default: true, required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        category: { type: 'string', required: false },
        activeOnly: { type: 'boolean', required: false }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      let experts = [...EXPERT_AGENTS];
      
      if (validation.data.activeOnly !== false) {
        experts = experts.filter(e => e.active);
      }

      return formatSuccess({
        count: experts.length,
        experts: experts.map(e => ({
          id: e.id,
          name: e.name,
          role: e.role,
          expertise: e.expertise,
          tools: e.tools
        })),
        categories: {
          product: ['product-manager', 'business-analyst'],
          technical: ['tech-lead', 'senior-developer', 'architect', 'performance-expert'],
          data: ['data-engineer'],
          security: ['security-auditor'],
          design: ['ux-designer'],
          quality: ['qa-engineer'],
          operations: ['devops-engineer']
        }
      });
    }
  })
  .addTool({
    name: 'get_expert',
    description: '获取单个专家详情',
    parameters: {
      expertId: { type: 'string', description: '专家ID', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        expertId: { type: 'string', required: true }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const expert = EXPERT_AGENTS.find(e => e.id === validation.data.expertId);
      
      if (!expert) {
        return formatError('Expert not found', { expertId: validation.data.expertId });
      }

      return formatSuccess({
        found: true,
        expert,
        recommendations: [
          '使用 send_message 与专家交流',
          '考虑邀请相关专家加入讨论',
          '将对话保存到持久化存储'
        ]
      });
    }
  })
  .addTool({
    name: 'create_agent_team',
    description: '创建专家团队',
    parameters: {
      taskDescription: { type: 'string', description: '任务描述', required: true },
      expertIds: { type: 'array', description: '专家ID列表', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        taskDescription: { type: 'string', required: true },
        expertIds: { type: 'array', required: false }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      let selectedExperts: ExpertAgent[];
      
      if (validation.data.expertIds && validation.data.expertIds.length > 0) {
        selectedExperts = EXPERT_AGENTS.filter(e => 
          validation.data.expertIds.includes(e.id) && e.active
        );
      } else {
        selectedExperts = recommendExpertsForTask(validation.data.taskDescription);
      }

      return formatSuccess({
        created: true,
        teamSize: selectedExperts.length,
        experts: selectedExperts.map(e => ({
          id: e.id,
          name: e.name,
          role: e.role,
          expertise: e.expertise
        })),
        workflow: {
          steps: [
            '分析任务 - product-manager + business-analyst',
            '架构设计 - tech-lead + architect',
            '实现方案 - senior-developer',
            '安全评估 - security-auditor',
            '质量保证 - qa-engineer',
            '部署方案 - devops-engineer',
            '性能优化 - performance-expert'
          ],
          collaborationPattern: 'sequential-review',
          decisionMethod: 'consensus'
        },
        recommendations: [
          '使用 start_collaboration 开始协作',
          '使用 send_message 发送消息',
          '使用 persist_decision 保存决策'
        ]
      });
    }
  })
  .addTool({
    name: 'send_message',
    description: '发送消息给专家',
    parameters: {
      from: { type: 'string', description: '发送者', required: true },
      to: { type: 'string', description: '接收者', required: true },
      content: { type: 'any', description: '消息内容', required: true },
      priority: { type: 'string', description: '优先级', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      type: { type: 'string', description: '消息类型', enum: ['request', 'response', 'event', 'broadcast'], default: 'request' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        from: { type: 'string', required: true },
        to: { type: 'string', required: true },
        content: { type: 'any', required: true },
        priority: { type: 'string', required: false, enum: ['low', 'medium', 'high', 'urgent'] },
        type: { type: 'string', required: false, enum: ['request', 'response', 'event', 'broadcast'] }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const message: AgentMessage = {
        id: generateId(),
        from: validation.data.from,
        to: validation.data.to,
        type: validation.data.type || 'request',
        content: validation.data.content,
        timestamp: Date.now(),
        priority: validation.data.priority || 'medium'
      };

      const recipient = EXPERT_AGENTS.find(e => e.id === validation.data.to);

      return formatSuccess({
        sent: true,
        messageId: message.id,
        recipient: recipient ? { id: recipient.id, name: recipient.name } : null,
        message,
        suggestions: recipient ? [
          `等待 ${recipient.name} 的回应`,
          '可以同时发送给其他相关专家',
          '考虑将重要对话保存'
        ] : [],
        nextStep: recipient ? {
          action: 'await_response',
          from: recipient.id,
          expectedIn: 'next interaction'
        } : null
      });
    }
  })
  .addTool({
    name: 'synthesize_decision',
    description: '综合专家意见形成决策',
    parameters: {
      topic: { type: 'string', description: '决策主题', required: true },
      expertInputs: { type: 'array', description: '专家输入', required: true },
      options: { type: 'array', description: '考虑的选项', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        topic: { type: 'string', required: true },
        expertInputs: { type: 'array', required: true },
        options: { type: 'array', required: true }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const areasOfAgreement = extractAgreements(validation.data.expertInputs);
      const concerns = extractConcerns(validation.data.expertInputs);
      const recommendations = extractRecommendations(validation.data.expertInputs);

      return formatSuccess({
        synthesis: {
          topic: validation.data.topic,
          expertsContributed: validation.data.expertInputs.length,
          areasOfAgreement,
          concerns,
          recommendations,
          suggestedDecision: recommendations.length > 0 ? recommendations[0] : null
        },
        decisionRecordTemplate: {
          topic: validation.data.topic,
          optionsConsidered: validation.data.options,
          experts: validation.data.expertInputs.map((e: any) => e.expertId),
          finalDecision: 'TO_BE_FILLED',
          justification: 'TO_BE_FILLED',
          nextSteps: [],
          qualityScore: null
        },
        nextSteps: [
          'Review synthesized decision',
          'Fill in final decision and justification',
          'Save to persistence using save_decision',
          'Execute next steps'
        ]
      });
    }
  })
  .addTool({
    name: 'run_full_workflow',
    description: '运行完整的协作工作流',
    parameters: {
      objective: { type: 'string', description: '任务目标', required: true },
      expertTeam: { type: 'array', description: '专家团队', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        objective: { type: 'string', required: true },
        expertTeam: { type: 'array', required: false }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const workflowSteps = [
        {
          step: 1,
          name: '需求分析',
          experts: ['product-manager', 'business-analyst'],
          output: '明确的需求文档和验收标准'
        },
        {
          step: 2,
          name: '架构设计',
          experts: ['tech-lead', 'architect'],
          output: '系统架构方案和技术选型'
        },
        {
          step: 3,
          name: '实现计划',
          experts: ['senior-developer'],
          output: '详细的实现方案和代码结构'
        },
        {
          step: 4,
          name: '安全评估',
          experts: ['security-auditor'],
          output: '安全风险评估和缓解策略'
        },
        {
          step: 5,
          name: '质量保证',
          experts: ['qa-engineer'],
          output: '测试策略和质量标准'
        },
        {
          step: 6,
          name: '部署方案',
          experts: ['devops-engineer'],
          output: '部署方案和CI/CD设计'
        }
      ];

      return formatSuccess({
        started: true,
        objective: validation.data.objective,
        workflowSteps,
        currentStep: 1,
        recommendations: [
          'Follow workflow steps sequentially',
          'Use send_message to communicate with each expert',
          'Record all decisions using save_decision',
          'Use reflection tools at each checkpoint',
          'Persist all progress to storage'
        ],
        suggestedTools: [
          'clarify - to analyze requirements',
          'libraries - for technology recommendations',
          'persistence - to save progress',
          'agent-reflection - to optimize the process'
        ]
      });
    }
  })
  .addTool({
    name: 'activate_agent',
    description: '激活特定专家提供输入',
    parameters: {
      agentId: { type: 'string', description: '专家ID', required: true },
      topic: { type: 'string', description: '讨论主题', required: true },
      context: { type: 'string', description: '背景上下文', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        agentId: { type: 'string', required: true },
        topic: { type: 'string', required: true },
        context: { type: 'string', required: true }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const agent = EXPERT_AGENTS.find(e => e.id === validation.data.agentId);
      
      if (!agent) {
        return formatError('Agent not found', { agentId: validation.data.agentId });
      }

      const agentPrompt = `
## ${agent.name} ACTIVATED

**Topic:** ${validation.data.topic}

---

### 🎯 YOUR EXPERT PERSONA

${agent.systemPrompt}

---

### 📋 CONTEXT

${validation.data.context}

---

### 📝 YOUR INPUT NEEDED

Provide your expert opinion on:
1. Key risks and concerns specific to ${agent.name.split(' ').slice(1).join(' ')}
2. Concrete recommendations
3. 3 follow-up questions that need clarification
4. Your confidence level in current approach (0-100%)

Format as structured, actionable advice.
      `.trim();

      return formatSuccess({
        success: true,
        agentActivated: agent.name,
        expertise: agent.expertise,
        agentPrompt
      });
    }
  })
  .addTool({
    name: 'debate_topic',
    description: '让多个专家辩论一个主题 - 专家小组讨论',
    parameters: {
      topic: { type: 'string', description: '辩论主题', required: true },
      agentIds: { type: 'string', description: '专家ID列表，逗号分隔', required: true },
      currentProposal: { type: 'string', description: '当前提议的解决方案', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        topic: { type: 'string', required: true },
        agentIds: { type: 'string', required: true },
        currentProposal: { type: 'string', required: true }
      });

      if (!validation.valid) return formatError('Invalid parameters', validation.errors);

      const agentIds = validation.data.agentIds.split(',').map((id: string) => id.trim());
      const agents = EXPERT_AGENTS.filter(e => agentIds.includes(e.id) && e.active);

      const debateFramework = `
## 👥 EXPERT PANEL DEBATE

**Topic:** ${validation.data.topic}

**Current Proposal:** ${validation.data.currentProposal}

---

### 🎯 DEBATE FORMAT

EACH expert will speak in turn. For each expert:

1. **✅ AGREE** - Which parts of the proposal do you support?
2. **❌ CHALLENGE** - Which parts do you question?
3. **💡 PROPOSE** - What changes would you recommend?
4. **🎯 ASK** - One question for other panel members

---

### 🎭 EXPERT ROLES

${agents.map((a, i: number) => `**${i + 1}. ${a.name}**
   Expertise: ${a.expertise}`).join('\n\n')}

---

### ⚖️ FACILITATOR INSTRUCTIONS

After all experts speak:
1. Summarize points of AGREEMENT
2. Highlight points of CONTENTION
3. Call for consensus or recommend additional research

💡 Remember: Good decisions come from DISAGREEMENT! Healthy debate = better outcomes.
      `.trim();

      return formatSuccess({
        success: true,
        panel: agents.map(a => a.name),
        panelSize: agents.length,
        debateFramework
      });
    }
  })
  .addPrompt({
    name: 'expert-consultation',
    description: '完整的专家小组咨询工作流',
    arguments: [
      { name: 'decisionTopic', description: '要做出的决策', required: true }
    ],
    generate: async (args?: Record<string, any>) => `
## 👥 MULTI-AGENT CONSULTATION ACTIVATED

We will now make high-quality decisions using expert panel input.

---

### 🎯 DECISION TOPIC:

> ${args?.decisionTopic || 'User did not specify decision topic'}

---

### ⚙️ CONSULTATION WORKFLOW

**Step 1: ASSEMBLE THE PANEL**
Call \`list_experts\` and select 3-5 relevant experts for this decision.

**Step 2: HEAR FROM EACH EXPERT**
For each selected expert:
- Call \`activate_agent\` with full context
- Record their input, concerns, and recommendations

**Step 3: OPTIONAL PANEL DEBATE**
For controversial decisions, call \`debate_topic\` to have experts respond to each other.

**Step 4: SYNTHESIZE AND DECIDE**
Call \`synthesize_decision\` to create formal decision record.

---

### ❌ RULES FOR GOOD DECISION MAKING

1. **DO NOT SKIP** any expert input
2. **DO NOT IGNORE** concerns - address them explicitly
3. **DO NOT RUSH** - quality > speed
4. **DISSENT IS GOOD** - we want to hear disagreements
5. **BE EXPLICIT** about trade-offs accepted

No expert is ever 100% wrong. No expert is ever 100% right.
    `.trim()
  })
  .build();

function recommendExpertsForTask(taskDescription: string): ExpertAgent[] {
  const task = taskDescription.toLowerCase();
  const recommended: ExpertAgent[] = [];
  
  if (task.includes('data') || task.includes('crawl') || task.includes('爬虫')) {
    recommended.push(...EXPERT_AGENTS.filter(e => e.id === 'data-engineer'));
  }
  
  if (task.includes('security') || task.includes('安全') || task.includes('auth')) {
    recommended.push(...EXPERT_AGENTS.filter(e => e.id === 'security-auditor'));
  }
  
  if (task.includes('performance') || task.includes('优化') || task.includes('性能')) {
    recommended.push(...EXPERT_AGENTS.filter(e => e.id === 'performance-expert'));
  }
  
  if (task.includes('architecture') || task.includes('架构')) {
    recommended.push(...EXPERT_AGENTS.filter(e => e.id === 'architect'));
  }

  if (task.includes('ux') || task.includes('设计') || task.includes('用户')) {
    recommended.push(...EXPERT_AGENTS.filter(e => e.id === 'ux-designer'));
  }

  if (task.includes('deploy') || task.includes('部署') || task.includes('devops')) {
    recommended.push(...EXPERT_AGENTS.filter(e => e.id === 'devops-engineer'));
  }

  const coreExperts = EXPERT_AGENTS.filter(e => 
    ['product-manager', 'tech-lead', 'senior-developer', 'qa-engineer'].includes(e.id)
  );
  
  for (const core of coreExperts) {
    if (!recommended.find(r => r.id === core.id)) {
      recommended.push(core);
    }
  }

  return recommended.slice(0, 7);
}

function extractAgreements(inputs: any[]): string[] {
  const agreements: string[] = [];
  
  for (const input of inputs) {
    if (input.agreements) {
      agreements.push(...input.agreements);
    }
  }
  
  return agreements.length > 0 ? agreements : ['Need to identify areas of agreement through discussion'];
}

function extractConcerns(inputs: any[]): string[] {
  const concerns: string[] = [];
  
  for (const input of inputs) {
    if (input.concerns) {
      concerns.push(...input.concerns);
    }
  }
  
  return concerns.length > 0 ? concerns : ['Need to identify potential risks and concerns'];
}

function extractRecommendations(inputs: any[]): string[] {
  const recommendations: string[] = [];
  
  for (const input of inputs) {
    if (input.recommendations) {
      recommendations.push(...input.recommendations);
    }
  }
  
  return recommendations.length > 0 ? recommendations : ['Need to collect specific recommendations from experts'];
}
