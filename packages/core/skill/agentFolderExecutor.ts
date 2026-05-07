import crypto from 'crypto';
import {
  AgentDefinition,
  IntentDefinition,
  WorkflowDefinition,
  StageDefinition,
  StageExecutionResult,
  AgentExecutionResult
} from './types';

export class AgentFolderExecutor {
  private agent: AgentDefinition;

  constructor(agent: AgentDefinition) {
    this.agent = agent;
  }

  async execute(taskDescription: string): Promise<AgentExecutionResult> {
    const taskId = `task-${Date.now()}-${crypto.randomUUID()}`;
    const startTime = Date.now();

    console.log(`[AgentExecutor] Starting execution: ${this.agent.agentYaml.name}`);
    console.log(`[AgentExecutor] Task: ${taskDescription}`);

    // Handle empty or whitespace-only input
    if (!taskDescription || taskDescription.trim().length === 0) {
      console.warn('[AgentExecutor] Empty input detected, returning validation error');
      return this.createEmptyInputResult(this.agent.agentYaml.id, taskId, startTime);
    }

    // Handle invalid/garbage input (special characters only)
    const isInvalidInput = /^[^a-zA-Z0-9\u4e00-\u9fa5]+$/.test(taskDescription.trim());
    if (isInvalidInput) {
      console.warn('[AgentExecutor] Invalid input detected, returning validation error');
      return this.createInvalidInputResult(this.agent.agentYaml.id, taskId, startTime);
    }

    const stages: StageExecutionResult[] = [];

    try {
      const intent = this.recognizeIntent(taskDescription);
      console.log(`[AgentExecutor] Recognized intent: ${intent.name}`);

      const workflow = this.agent.workflows[intent.workflow];

      if (!workflow) {
        throw new Error(`Workflow "${intent.workflow}" not found`);
      }

      for (const stage of workflow.stages) {
        const stageResult = await this.executeStage(stage, taskDescription, taskId);
        stages.push(stageResult);

        if (stageResult.status === 'failed' && stage.required) {
          return this.createFailureResult(
            this.agent.agentYaml.id,
            taskId,
            stages,
            stageResult.error || 'Required stage failed'
          );
        }
      }

      const finalOutputs = this.collectFinalOutputs(stages);
      const overallConfidence = this.calculateOverallConfidence(stages);
      const reflection = this.agent.agentYaml.execution.enableReflection ?
        this.generateReflection(stages) : undefined;

      return {
        agentId: this.agent.agentYaml.id,
        taskId,
        status: 'completed',
        timestamp: new Date(startTime),
        stages,
        finalOutputs,
        overallConfidence,
        reflection
      };
    } catch (error) {
      return this.createFailureResult(
        this.agent.agentYaml.id,
        taskId,
        stages,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private recognizeIntent(taskDescription: string): IntentDefinition {
    let bestMatch: IntentDefinition | null = null;
    let bestScore = 0;

    for (const intent of this.agent.intents) {
      let score = 0;
      const lowerTask = taskDescription.toLowerCase();

      for (const keyword of intent.keywords) {
        if (lowerTask.includes(keyword.toLowerCase())) {
          score += 1 / intent.keywords.length;
        }
      }

      if (score >= intent.confidenceThreshold && score > bestScore) {
        bestScore = score;
        bestMatch = intent;
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    return this.agent.intents.find(i => i.id === 'default') || this.agent.intents[0];
  }

  private async executeStage(
    stage: StageDefinition,
    taskDescription: string,
    taskId: string
  ): Promise<StageExecutionResult> {
    const startTime = new Date();

    console.log(`[AgentExecutor] Executing stage: ${stage.name}`);

    const result: StageExecutionResult = {
      stageId: stage.id,
      name: stage.name,
      status: 'in-progress',
      startTime,
      outputs: [],
      confidence: 0.8
    };

    try {
      await this.sleep(Math.min(1000, stage.timeout));

      result.outputs = stage.outputs.map(output => `${output}`);
      result.status = 'completed';
      result.endTime = new Date();
      result.confidence = 0.85;

      console.log(`[AgentExecutor] Stage completed: ${stage.name}`);
    } catch (error) {
      result.status = 'failed';
      result.endTime = new Date();
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.confidence = 0;

      console.error(`[AgentExecutor] Stage failed: ${stage.name}`, result.error);
    }

    return result;
  }

  private collectFinalOutputs(stages: StageExecutionResult[]): Array<{ type: string; path: string; description: string }> {
    const finalOutputs: Array<{ type: string; path: string; description: string }> = [];

    for (const stage of stages) {
      for (const output of stage.outputs) {
        finalOutputs.push({
          type: 'file',
          path: output,
          description: `Output from ${stage.name}`
        });
      }
    }

    return finalOutputs;
  }

  private calculateOverallConfidence(stages: StageExecutionResult[]): number {
    if (stages.length === 0) return 0;

    const completedStages = stages.filter(s => s.status === 'completed');
    if (completedStages.length === 0) return 0;

    const totalConfidence = completedStages.reduce((sum, s) => sum + s.confidence, 0);
    return totalConfidence / completedStages.length;
  }

  private generateReflection(stages: StageExecutionResult[]): {
    successFactors: string[];
    improvementAreas: string[];
  } {
    const successFactors: string[] = [];
    const improvementAreas: string[] = [];

    const completedStages = stages.filter(s => s.status === 'completed');
    const failedStages = stages.filter(s => s.status === 'failed');

    if (completedStages.length > 0) {
      successFactors.push(`Successfully completed ${completedStages.length} stages`);
    }

    if (failedStages.length > 0) {
      improvementAreas.push(`${failedStages.length} stages failed to complete`);
    }

    const highConfidence = completedStages.filter(s => s.confidence >= 0.9);
    if (highConfidence.length > 0) {
      successFactors.push(`${highConfidence.length} stages completed with high confidence`);
    }

    const lowConfidence = completedStages.filter(s => s.confidence < 0.7);
    if (lowConfidence.length > 0) {
      improvementAreas.push(`${lowConfidence.length} stages had low confidence`);
    }

    return {
      successFactors,
      improvementAreas
    };
  }

  private createEmptyInputResult(
    agentId: string,
    taskId: string,
    startTime: number
  ): AgentExecutionResult {
    return {
      agentId,
      taskId,
      status: 'failed',
      timestamp: new Date(startTime),
      stages: [{
        stageId: 'input-validation',
        name: 'Input Validation',
        status: 'failed',
        startTime: new Date(startTime),
        endTime: new Date(),
        outputs: [],
        confidence: 0,
        error: 'Input validation failed: Empty or whitespace-only input received'
      }],
      finalOutputs: [],
      overallConfidence: 0,
      reflection: {
        successFactors: [],
        improvementAreas: ['Empty input validation should be handled gracefully']
      }
    };
  }

  private createInvalidInputResult(
    agentId: string,
    taskId: string,
    startTime: number
  ): AgentExecutionResult {
    return {
      agentId,
      taskId,
      status: 'failed',
      timestamp: new Date(startTime),
      stages: [{
        stageId: 'input-validation',
        name: 'Input Validation',
        status: 'failed',
        startTime: new Date(startTime),
        endTime: new Date(),
        outputs: [],
        confidence: 0,
        error: 'Input validation failed: Invalid or garbled input detected. Please provide meaningful task description.'
      }],
      finalOutputs: [],
      overallConfidence: 0,
      reflection: {
        successFactors: [],
        improvementAreas: ['Invalid input should be rejected with clear feedback']
      }
    };
  }

  private createFailureResult(
    agentId: string,
    taskId: string,
    stages: StageExecutionResult[],
    error: string
  ): AgentExecutionResult {
    return {
      agentId,
      taskId,
      status: 'failed',
      timestamp: new Date(),
      stages,
      finalOutputs: [],
      overallConfidence: 0,
      reflection: {
        successFactors: [],
        improvementAreas: [error]
      }
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateSystemPrompt(): string {
    let prompt = this.agent.systemPrompt;

    if (this.agent.knowledgeBase.length > 0) {
      prompt += '\n\n## Knowledge Base\n\n';
      prompt += this.agent.knowledgeBase.join('\n\n---\n\n');
    }

    return prompt;
  }

  getAgentInfo(): {
    id: string;
    name: string;
    description: string;
    version: string;
    capabilities: string[];
    tools: string[];
  } {
    return {
      id: this.agent.agentYaml.id,
      name: this.agent.agentYaml.name,
      description: this.agent.agentYaml.description,
      version: this.agent.agentYaml.version,
      capabilities: this.agent.agentYaml.capabilities.map(c => c.name),
      tools: this.agent.agentYaml.tools.map(t => t.name)
    };
  }
}
