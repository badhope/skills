export * from './types';
export { SkillLoader } from './loader';
export { SkillRegistry } from './registry';
export { SkillOrchestrator } from './orchestrator';
export { ToolDiscoveryEngine, ToolMatch, ToolRecommendation } from './toolDiscovery';
export { ToolExecutor, ToolExecutionResult, globalToolExecutor } from './toolExecutor';
export { WorkflowEngine, WorkflowExecutionConfig } from './workflowEngine';
export { ErrorHandler, ErrorRecovery, ErrorRecord, ErrorType, SafeErrorResponse, globalErrorHandler } from './errorHandler';
export { Monitor, Metric, PerformanceReport, OperationLog, globalMonitor } from './monitor';
export { AgentRunner, AgentConfig, AgentResponse } from './agentRunner';
export { TaskStateManager, TaskState, TaskHistoryEntry, ResumeResult, globalTaskStateManager } from './taskStateManager';
export { AgentMemory, Interaction, MemorySearchResult, MemorySummary, InvertedIndexEntry, globalAgentMemory } from './agentMemory';
export { SkillVersionManager, SkillVersion, VersionDiff, Change, VersionHistory, globalVersionManager } from './versionManager';
export { SkillCache, ExecutionCache, ResultReuseManager, CacheEntry, CacheStats, ExecutionCacheKey, ExecutionCacheEntry, globalResultReuseManager, globalSkillCache, globalExecutionCache } from './performanceOptimizer';
export { HumanInTheLoopManager, ConfirmationRequest, ConfirmationType, ConfirmationOption, ConfirmationResponse, globalHumanInTheLoopManager } from './humanInTheLoop';
export { TaskVisualizationManager, TaskProgress, PhaseProgress, TaskStepProgress, WorkflowVisualization, GraphNode, VisualizationSummary, globalTaskVisualizationManager } from './taskVisualization';
export { PermissionManager, Role, Permission, User, PermissionCheck, globalPermissionManager, requirePermission, requireAllPermissions } from './permissionManager';
export { ConcurrencyManager, ConcurrencyLimit, RateLimit, TaskSlot, globalConcurrencyManager } from './concurrencyManager';
export { ToolSkillMapper, toolSkillMapper, ToolCategory, SkillToolMapping, FallbackStrategy, PlatformToolAdapter, CapabilityEntry, ToolSkillMappingConfig } from './toolSkillMapper';
export { AgentMessageBus, globalMessageBus, Message, MessageHandler, AgentSubscription, MessageBusStats, AgentStatus } from './agentMessageBus';
export { DecisionReflector, decisionReflector, Decision, Alternative, DecisionOutcome, Reflection, ImprovementSuggestion, ReflectionQuery, DecisionStats } from './decisionReflector';
export { TestValidator, testValidator, TestCase, TestResult, ValidationResult, ValidationReport, ValidationConfig } from './testValidator';
export { RAGModule, ragModule, Document, EmbeddingConfig, RAGConfig, SearchResult, RAGQueryResult } from './ragModule';
export { KnowledgeGraph, knowledgeGraph, Entity, Relationship, GraphConfig, GraphQueryResult } from './knowledgeGraph';
export { MemoryGraph, memoryGraph, MemoryNode, MemoryEdge, MemoryContext, MemoryGraphConfig, MemorySearchResult } from './memoryGraph';

// Skill System exports
export { BaseSkill, SkillContext, SkillResult } from './skills/base-skill';
export { TaskPlannerSkill } from './skills/task-planner';
export { FullstackEngineSkill } from './skills/fullstack-engine';
export { TestingMasterSkill } from './skills/testing-master';
export { SecurityAuditorSkill, SecurityIssue, VulnerabilityScan } from './skills/security-auditor';
export { CodeQualityExpertSkill, CodeIssue, CodeMetrics } from './skills/code-quality-expert';
export { BugHunterSkill, BugReport, BugAnalysis } from './skills/bug-hunter';
export { DevOpsEngineerSkill, DeploymentConfig, DeploymentResult } from './skills/devops-engineer';
export { SkillOrchestrator, OrchestratorConfig, WorkflowExecution } from './skills/orchestrator';

// Folder as Agent exports
export { AgentFolderLoader } from './agentFolderLoader';
export { AgentFolderExecutor } from './agentFolderExecutor';
export { AgentPackager } from './agentPackager';

import { SkillLoader } from './loader';
import { SkillRegistry } from './registry';
import { SkillOrchestrator as OldSkillOrchestrator } from './orchestrator';
import { SkillOrchestrator as NewSkillOrchestrator } from './skills/orchestrator';
import { ToolDiscoveryEngine } from './toolDiscovery';
import { globalToolExecutor } from './toolExecutor';
import { WorkflowEngine } from './workflowEngine';
import { globalErrorHandler } from './errorHandler';
import { globalMonitor } from './monitor';
import { AgentRunner } from './agentRunner';
import { AgentFolderLoader } from './agentFolderLoader';
import { AgentPackager } from './agentPackager';
import { globalMessageBus } from './agentMessageBus';

export const globalSkillRegistry = new SkillRegistry();
export const globalSkillLoader = new SkillLoader();
export const globalSkillOrchestrator = new OldSkillOrchestrator(globalSkillRegistry);
export const globalNewSkillOrchestrator = new NewSkillOrchestrator(globalMessageBus);
export const globalToolDiscovery = new ToolDiscoveryEngine(globalSkillRegistry);
export const globalWorkflowEngine = new WorkflowEngine(globalSkillRegistry);
export const globalAgentRunner = new AgentRunner(globalSkillRegistry);
export const globalAgentFolderLoader = new AgentFolderLoader();
export const globalAgentPackager = new AgentPackager();

export async function loadSkillsFromDirectory(dirPath: string): Promise<{
  loaded: number;
  failed: number;
}> {
  const skills = await globalSkillLoader.loadFromSkillDir(dirPath);
  let failed = 0;

  for (const skill of skills) {
    try {
      globalSkillRegistry.registerSkill(skill);
    } catch {
      failed++;
    }
  }

  return {
    loaded: skills.length - failed,
    failed
  };
}

export async function executeSkill(taskDescription: string): Promise<any> {
  const agentRunner = new AgentRunner(globalSkillRegistry);
  return agentRunner.run(taskDescription);
}

export function findSkills(taskDescription: string) {
  return globalSkillRegistry.matchSkills(taskDescription);
}

export function discoverTools(taskDescription: string) {
  return globalToolDiscovery.discoverTools(taskDescription);
}

export function getAgentRunner(): AgentRunner {
  return globalAgentRunner;
}

export async function diagnoseTask(taskDescription: string): Promise<any> {
  return globalAgentRunner.diagnose(taskDescription);
}

// Folder as Agent convenience functions
export async function loadAgentFromFolder(folderPath: string) {
  return globalAgentFolderLoader.loadFromFolder(folderPath);
}

export async function listAgents(basePath: string) {
  return globalAgentFolderLoader.listAgentFolders(basePath);
}

export async function createAgentFromTemplate(
  outputPath: string,
  name: string,
  description?: string,
  author?: string,
  version?: string
) {
  return globalAgentPackager.createAgentFromTemplate(
    outputPath,
    name,
    description,
    author,
    version
  );
}

export async function packageAgent(folderPath: string, outputPath: string) {
  return globalAgentPackager.packageAgent(folderPath, outputPath);
}

export async function validateAgentFolder(folderPath: string) {
  return globalAgentPackager.validateAgentFolder(folderPath);
}
