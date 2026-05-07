export interface SkillTrigger {
  keywords: string[];
  patterns: string[];
  conditions: string[];
}

export interface SkillMetrics {
  avg_execution_time: string;
  success_rate: number;
  token_efficiency: number;
  complexity_accuracy?: number;
}

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  layer: 'meta' | 'engine' | 'workflow' | 'action';
  role: string;
  invokes: string[];
  invoked_by: string[];
  capabilities: string[];
  triggers: SkillTrigger;
  metrics?: SkillMetrics;
}

export interface WorkflowStep {
  id: string;
  description: string;
  type?: 'action' | 'tool' | 'invoke' | 'workflow' | 'loop' | 'conditional' | 'wait' | 'end';
  skill?: string;
  tool?: string;
  workflow?: string;
  loopCount?: number;
  condition?: string;
  params?: Record<string, any>;
  estimatedTime?: string;
  dependencies: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  parallel?: boolean;
  waitDuration?: number;
  retries?: number;
  timeout?: number;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  description?: string;
  tasks: WorkflowStep[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  phases: WorkflowPhase[];
}

export interface DecisionNode {
  id: string;
  question: string;
  yes?: string;
  no?: string;
  default?: string;
  children?: DecisionNode[];
}

export interface DecisionTree {
  id: string;
  name: string;
  root: DecisionNode;
}

export interface ToolReference {
  name: string;
  purpose: string;
  fallback: string;
}

export interface SkillDefinition {
  metadata: SkillMetadata;
  content: string;
  workflows: Workflow[];
  decisionTrees: DecisionTree[];
  tools: ToolReference[];
  examples: string[];
  constraints: Record<string, any>;
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  keywords: string[];
}

export interface AgentToolDependency {
  id: string;
  name: string;
  required: boolean;
  fallback: string;
}

export interface AgentExecutionConfig {
  maxIterations: number;
  defaultTimeout: number;
  enableReflection: boolean;
  requireConfirmation: boolean;
}

export interface AgentOutputConfig {
  format: 'markdown' | 'json' | 'html';
  includeSteps: boolean;
  includeConfidence: boolean;
  includeRecommendations: boolean;
}

export interface KnowledgeConfig {
  enabled: boolean;
  embeddingModel: string;
  chunkSize: number;
  similarityThreshold: number;
  topK: number;
}

export interface MemoryConfig {
  enabled: boolean;
  maxNodes: number;
  decayRate: number;
}

export interface AgentYaml {
  version: string;
  id: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  capabilities: AgentCapability[];
  tools: AgentToolDependency[];
  execution: AgentExecutionConfig;
  output: AgentOutputConfig;
  knowledge?: KnowledgeConfig;
  memory?: MemoryConfig;
}

export interface IntentDefinition {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  confidenceThreshold: number;
  workflow: string;
}

export interface StageDefinition {
  id: string;
  name: string;
  description: string;
  required: boolean;
  timeout: number;
  tools: string[];
  outputs: string[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  stages: StageDefinition[];
}

export interface ToolCallDefinition {
  id: string;
  toolId: string;
  operation: string;
  parameters: Record<string, { type: string; required: boolean; description: string }>;
  safetyLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  input: string;
  expectedStages: string[];
  expectedOutputs: string[];
  expectedConfidence: number;
}

export interface AgentDefinition {
  agentYaml: AgentYaml;
  systemPrompt: string;
  intents: IntentDefinition[];
  workflows: Record<string, WorkflowDefinition>;
  toolCalls: ToolCallDefinition[];
  knowledgeBase: string[];
  testCases: TestCase[];
}

export interface StageExecutionResult {
  stageId: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  outputs: string[];
  confidence: number;
  error?: string;
}

export interface AgentExecutionResult {
  agentId: string;
  taskId: string;
  status: 'completed' | 'failed' | 'in-progress';
  timestamp: Date;
  stages: StageExecutionResult[];
  finalOutputs: Array<{ type: string; path: string; description: string }>;
  overallConfidence: number;
  reflection?: {
    successFactors: string[];
    improvementAreas: string[];
  };
}

export interface TaskAnalysis {
  complexity: number;
  factors: string[];
  estimatedTime: string;
  confidence: number;
  matchedSkill: string;
  recommendedWorkflow: string;
}

export interface TaskContext {
  id: string;
  description: string;
  complexity: number;
  currentSkill: string;
  history: TaskStep[];
  results: Record<string, any>;
}

export interface TaskStep {
  skillName: string;
  input: any;
  output: any;
  timestamp: Date;
  status: 'success' | 'failed' | 'pending';
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  steps: TaskStep[];
}