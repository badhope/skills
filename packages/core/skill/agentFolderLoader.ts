import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import {
  AgentDefinition,
  AgentYaml,
  IntentDefinition,
  WorkflowDefinition,
  ToolCallDefinition,
  TestCase,
  StageDefinition
} from './types';

export class AgentFolderLoader {
  async loadFromFolder(folderPath: string): Promise<AgentDefinition> {
    try {
      await fs.access(folderPath);
      
      const agentYaml = await this.loadAgentYaml(folderPath);
      const systemPrompt = await this.loadSystemPrompt(folderPath);
      const intents = await this.loadIntents(folderPath);
      const workflows = await this.loadWorkflows(folderPath);
      const toolCalls = await this.loadToolCalls(folderPath);
      const knowledgeBase = await this.loadKnowledgeBase(folderPath);
      const testCases = await this.loadTestCases(folderPath);

      return {
        agentYaml,
        systemPrompt,
        intents,
        workflows,
        toolCalls,
        knowledgeBase,
        testCases
      };
    } catch (error) {
      console.error(`Failed to load agent from ${folderPath}:`, error);
      throw error;
    }
  }

  async loadAgentYaml(folderPath: string): Promise<AgentYaml> {
    const agentYamlPath = path.join(folderPath, 'agent.yaml');
    const content = await fs.readFile(agentYamlPath, 'utf-8');
    const data = yaml.load(content) as any;
    
    return {
      version: data.version || '1.0.0',
      id: data.id || path.basename(folderPath),
      name: data.name || path.basename(folderPath),
      description: data.description || '',
      author: data.author || 'Unknown',
      tags: data.tags || [],
      capabilities: (data.capabilities || []).map((cap: any) => ({
        id: cap.id || cap.name.toLowerCase().replace(/\s+/g, '-'),
        name: cap.name,
        description: cap.description || '',
        keywords: cap.keywords || []
      })),
      tools: (data.tools || []).map((tool: any) => ({
        id: tool.id || tool.name.toLowerCase().replace(/\s+/g, '-'),
        name: tool.name,
        required: tool.required !== false,
        fallback: tool.fallback || ''
      })),
      execution: {
        maxIterations: data.execution?.maxIterations || 30,
        defaultTimeout: data.execution?.defaultTimeout || 60000,
        enableReflection: data.execution?.enableReflection !== false,
        requireConfirmation: data.execution?.requireConfirmation !== false
      },
      output: {
        format: data.output?.format || 'markdown',
        includeSteps: data.output?.includeSteps !== false,
        includeConfidence: data.output?.includeConfidence !== false,
        includeRecommendations: data.output?.includeRecommendations !== false
      }
    };
  }

  async loadSystemPrompt(folderPath: string): Promise<string> {
    try {
      const systemPromptPath = path.join(folderPath, 'system-prompt.md');
      return await fs.readFile(systemPromptPath, 'utf-8');
    } catch {
      try {
        const systemPromptPath = path.join(folderPath, 'system_prompt.md');
        return await fs.readFile(systemPromptPath, 'utf-8');
      } catch {
        return '# Agent\n\nThis agent will process your request.';
      }
    }
  }

  async loadIntents(folderPath: string): Promise<IntentDefinition[]> {
    const intents: IntentDefinition[] = [];
    const workflowDir = path.join(folderPath, 'workflow');
    
    try {
      await fs.access(workflowDir);
      
      const intentYamlPath = path.join(workflowDir, 'intent.yaml');
      const intentYmlPath = path.join(workflowDir, 'intent.yml');
      const intentsYamlPath = path.join(workflowDir, 'intents.yaml');
      const intentsYmlPath = path.join(workflowDir, 'intents.yml');
      
      let content = '';
      
      for (const filePath of [intentYamlPath, intentYmlPath, intentsYamlPath, intentsYmlPath]) {
        try {
          content = await fs.readFile(filePath, 'utf-8');
          break;
        } catch {
          continue;
        }
      }
      
      if (content) {
        const data = yaml.load(content) as any;
        const intentList = data.intents || data;
        
        if (Array.isArray(intentList)) {
          for (const intent of intentList) {
            intents.push({
              id: intent.id || intent.name.toLowerCase().replace(/\s+/g, '-'),
              name: intent.name,
              description: intent.description || '',
              keywords: intent.keywords || [],
              confidenceThreshold: intent.confidenceThreshold || 0.7,
              workflow: intent.workflow || 'default'
            });
          }
        }
      }
    } catch {
      console.warn('No intent definitions found, using default');
    }
    
    if (intents.length === 0) {
      intents.push({
        id: 'default',
        name: 'Default',
        description: 'Default intent for general requests',
        keywords: [],
        confidenceThreshold: 0.0,
        workflow: 'default'
      });
    }
    
    return intents;
  }

  async loadWorkflows(folderPath: string): Promise<Record<string, WorkflowDefinition>> {
    const workflows: Record<string, WorkflowDefinition> = {};
    const workflowDir = path.join(folderPath, 'workflow');
    
    try {
      await fs.access(workflowDir);
      
      const stagesYamlPath = path.join(workflowDir, 'stages.yaml');
      const stagesYmlPath = path.join(workflowDir, 'stages.yml');
      
      let content = '';
      
      for (const filePath of [stagesYamlPath, stagesYmlPath]) {
        try {
          content = await fs.readFile(filePath, 'utf-8');
          break;
        } catch {
          continue;
        }
      }
      
      if (content) {
        const data = yaml.load(content) as any;
        
        for (const [workflowId, workflowData] of Object.entries(data)) {
          if (workflowData && typeof workflowData === 'object') {
            const wfData = workflowData as any;
            const stages: StageDefinition[] = (wfData.stages || []).map((stage: any, index: number) => ({
              id: stage.id || `stage-${index + 1}`,
              name: stage.name || `Stage ${index + 1}`,
              description: stage.description || '',
              required: stage.required !== false,
              timeout: stage.timeout || 30000,
              tools: stage.tools || [],
              outputs: stage.outputs || []
            }));
            
            workflows[workflowId] = {
              id: workflowId,
              name: wfData.name || workflowId,
              description: wfData.description || '',
              stages
            };
          }
        }
      }
    } catch {
      console.warn('No workflow definitions found, using default');
    }
    
    if (Object.keys(workflows).length === 0) {
      workflows['default'] = {
        id: 'default',
        name: 'Default Workflow',
        description: 'Default workflow for processing requests',
        stages: [
          {
            id: 'stage-1',
            name: 'Understand Request',
            description: 'Analyze and understand the user request',
            required: true,
            timeout: 30000,
            tools: [],
            outputs: ['understanding.md']
          },
          {
            id: 'stage-2',
            name: 'Generate Response',
            description: 'Generate appropriate response',
            required: true,
            timeout: 60000,
            tools: [],
            outputs: ['response.md']
          },
          {
            id: 'stage-3',
            name: 'Validate Response',
            description: 'Validate the generated response',
            required: true,
            timeout: 30000,
            tools: [],
            outputs: ['validation.md']
          }
        ]
      };
    }
    
    return workflows;
  }

  async loadToolCalls(folderPath: string): Promise<ToolCallDefinition[]> {
    const toolCalls: ToolCallDefinition[] = [];
    const workflowDir = path.join(folderPath, 'workflow');
    
    try {
      await fs.access(workflowDir);
      
      const toolsYamlPath = path.join(workflowDir, 'tools.yaml');
      const toolsYmlPath = path.join(workflowDir, 'tools.yml');
      
      let content = '';
      
      for (const filePath of [toolsYamlPath, toolsYmlPath]) {
        try {
          content = await fs.readFile(filePath, 'utf-8');
          break;
        } catch {
          continue;
        }
      }
      
      if (content) {
        const data = yaml.load(content) as any;
        const toolCallList = data['tool-calls'] || data['toolCalls'] || data.tools || [];
        
        if (Array.isArray(toolCallList)) {
          for (const toolCall of toolCallList) {
            toolCalls.push({
              id: toolCall.id || toolCall.toolId || '',
              toolId: toolCall.toolId || toolCall.id || '',
              operation: toolCall.operation || 'execute',
              parameters: toolCall.parameters || {},
              safetyLevel: (toolCall.safetyLevel || 'low') as 'low' | 'medium' | 'high',
              requiresConfirmation: toolCall.requiresConfirmation !== false
            });
          }
        }
      }
    } catch {
      console.warn('No tool call definitions found');
    }
    
    return toolCalls;
  }

  async loadKnowledgeBase(folderPath: string): Promise<string[]> {
    const knowledgeBase: string[] = [];
    const knowledgeDir = path.join(folderPath, 'knowledge');
    
    try {
      await fs.access(knowledgeDir);
      
      const entries = await fs.readdir(knowledgeDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          const filePath = path.join(knowledgeDir, entry.name);
          const content = await fs.readFile(filePath, 'utf-8');
          knowledgeBase.push(content);
        } else if (entry.isDirectory()) {
          const subDir = path.join(knowledgeDir, entry.name);
          const subFiles = await this.loadKnowledgeBase(subDir);
          knowledgeBase.push(...subFiles);
        }
      }
    } catch {
      console.warn('No knowledge base found');
    }
    
    return knowledgeBase;
  }

  async loadTestCases(folderPath: string): Promise<TestCase[]> {
    const testCases: TestCase[] = [];
    const testsDir = path.join(folderPath, 'tests');
    
    try {
      await fs.access(testsDir);
      
      const testYamlPath = path.join(testsDir, 'test_cases.yaml');
      const testYmlPath = path.join(testsDir, 'test_cases.yml');
      const testsYamlPath = path.join(testsDir, 'tests.yaml');
      const testsYmlPath = path.join(testsDir, 'tests.yml');
      
      let content = '';
      
      for (const filePath of [testYamlPath, testYmlPath, testsYamlPath, testsYmlPath]) {
        try {
          content = await fs.readFile(filePath, 'utf-8');
          break;
        } catch {
          continue;
        }
      }
      
      if (content) {
        const data = yaml.load(content) as any;
        const testCaseList = data.testCases || data.test_cases || data.tests || [];
        
        if (Array.isArray(testCaseList)) {
          for (const tc of testCaseList) {
            testCases.push({
              id: tc.id || tc.name.toLowerCase().replace(/\s+/g, '-'),
              name: tc.name,
              description: tc.description || '',
              input: tc.input || '',
              expectedStages: tc.expectedStages || tc.expected_stages || [],
              expectedOutputs: tc.expectedOutputs || tc.expected_outputs || [],
              expectedConfidence: tc.expectedConfidence || tc.expected_confidence || 0.8
            });
          }
        }
      }
    } catch {
      console.warn('No test cases found');
    }
    
    return testCases;
  }

  async listAgentFolders(basePath: string): Promise<string[]> {
    const agentFolders: string[] = [];
    
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderPath = path.join(basePath, entry.name);
          const agentYamlPath = path.join(folderPath, 'agent.yaml');
          
          try {
            await fs.access(agentYamlPath);
            agentFolders.push(folderPath);
          } catch {
            continue;
          }
        }
      }
    } catch {
      console.warn(`Failed to list agent folders in ${basePath}`);
    }
    
    return agentFolders;
  }
}
