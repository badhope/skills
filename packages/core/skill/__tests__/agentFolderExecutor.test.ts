import { AgentFolderExecutor } from '../agentFolderExecutor';
import { AgentDefinition } from '../types';

describe('AgentFolderExecutor - Edge Cases', () => {
  let executor: AgentFolderExecutor;
  let mockAgent: AgentDefinition;

  beforeEach(() => {
    mockAgent = {
      agentYaml: {
        version: '1.0.0',
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test agent for unit tests',
        author: 'Test',
        tags: ['test'],
        capabilities: [],
        tools: [],
        execution: {
          maxIterations: 10,
          defaultTimeout: 60000,
          enableReflection: true,
          requireConfirmation: false
        },
        output: {
          format: 'markdown',
          includeSteps: true,
          includeConfidence: true,
          includeRecommendations: true
        }
      },
      systemPrompt: 'You are a test agent.',
      intents: [
        {
          id: 'bug-fixing',
          name: 'Bug Fixing',
          description: 'Fix bugs',
          keywords: ['fix', 'bug', 'error', '修复', '调试'],
          confidenceThreshold: 0.3,
          workflow: 'bug-fix-workflow'
        },
        {
          id: 'default',
          name: 'Default',
          description: 'Default intent',
          keywords: [],
          confidenceThreshold: 0,
          workflow: 'full-project-workflow'
        }
      ],
      workflows: {
        'bug-fix-workflow': {
          id: 'bug-fix-workflow',
          name: 'Bug Fix Workflow',
          stages: [
            {
              id: 'analysis',
              name: 'Bug Analysis',
              description: 'Analyze the bug',
              required: true,
              timeout: 30000,
              outputs: ['bug-analysis-report.md']
            }
          ]
        },
        'full-project-workflow': {
          id: 'full-project-workflow',
          name: 'Full Project Workflow',
          stages: [
            {
              id: 'planning',
              name: 'Project Planning',
              description: 'Plan the project',
              required: true,
              timeout: 30000,
              outputs: ['requirements-document.md']
            }
          ]
        }
      },
      knowledgeBase: [],
      testCases: []
    };

    executor = new AgentFolderExecutor(mockAgent);
  });

  describe('Empty Input Handling', () => {
    it('should handle empty string input', async () => {
      const result = await executor.execute('');

      expect(result.status).toBe('failed');
      expect(result.stages[0].name).toBe('Input Validation');
      expect(result.stages[0].error).toContain('Empty');
      expect(result.overallConfidence).toBe(0);
    });

    it('should handle whitespace-only input', async () => {
      const result = await executor.execute('   ');

      expect(result.status).toBe('failed');
      expect(result.stages[0].name).toBe('Input Validation');
      expect(result.stages[0].error).toContain('Empty');
    });

    it('should handle tab and newline whitespace', async () => {
      const result = await executor.execute('\t\n  \t\n');

      expect(result.status).toBe('failed');
      expect(result.stages[0].error).toContain('Empty');
    });
  });

  describe('Invalid Input Handling', () => {
    it('should handle special characters only input', async () => {
      const result = await executor.execute('!@#$%^&*()_+-=[]{}|;:,.<>?');

      expect(result.status).toBe('failed');
      expect(result.stages[0].name).toBe('Input Validation');
      expect(result.stages[0].error).toContain('Invalid');
    });

    it('should handle random garbage input', async () => {
      const result = await executor.execute('!!&&@@#@$@$%^%^invalid##$$%%');

      expect(result.status).toBe('failed');
      expect(result.stages[0].error).toContain('Invalid');
    });

    it('should handle mixed special characters', async () => {
      const result = await executor.execute('!@#$%^&*() 你好世界 #$%^&*()!@#$%');

      expect(result.status).toBe('failed');
      expect(result.stages[0].error).toContain('Invalid');
    });
  });

  describe('Normal Input Handling', () => {
    it('should handle normal task description', async () => {
      const result = await executor.execute('Create a simple React Todo application');

      expect(result.status).toBe('completed');
      expect(result.stages.length).toBeGreaterThan(0);
      expect(result.overallConfidence).toBeGreaterThan(0);
    });

    it('should handle Chinese task description', async () => {
      const result = await executor.execute('创建一个简单的待办事项应用');

      expect(result.status).toBe('completed');
      expect(result.stages.length).toBeGreaterThan(0);
    });

    it('should handle mixed language input', async () => {
      const result = await executor.execute('Create a Todo app with React and TypeScript');

      expect(result.status).toBe('completed');
      expect(result.stages.length).toBeGreaterThan(0);
    });
  });

  describe('Intent Recognition', () => {
    it('should recognize bug-fixing intent from keywords', async () => {
      const result = await executor.execute('Fix the bug in the login form');

      expect(result.status).toBe('completed');
    });

    it('should fall back to default intent when no match', async () => {
      const result = await executor.execute('Do something random');

      expect(result.status).toBe('completed');
    });
  });

  describe('Reflection Generation', () => {
    it('should generate reflection when enabled', async () => {
      const result = await executor.execute('Create a simple React application');

      expect(result.status).toBe('completed');
      expect(result.reflection).toBeDefined();
      expect(result.reflection?.successFactors).toBeDefined();
      expect(result.reflection?.improvementAreas).toBeDefined();
    });

    it('should generate improvement areas for failed stages', async () => {
      const mockAgentWithFailingStage: AgentDefinition = {
        ...mockAgent,
        workflows: {
          'full-project-workflow': {
            id: 'full-project-workflow',
            name: 'Failing Workflow',
            stages: [
              {
                id: 'failing',
                name: 'Failing Stage',
                description: 'This will fail',
                required: true,
                timeout: 100,
                outputs: []
              }
            ]
          }
        }
      };

      const failingExecutor = new AgentFolderExecutor(mockAgentWithFailingStage);
      const result = await failingExecutor.execute('Test task');

      expect(result.reflection?.improvementAreas.length).toBeGreaterThan(0);
    });
  });

  describe('System Prompt Generation', () => {
    it('should generate basic system prompt', () => {
      const prompt = executor.generateSystemPrompt();

      expect(prompt).toContain('You are a test agent');
    });

    it('should include knowledge base in system prompt when available', () => {
      const agentWithKnowledge: AgentDefinition = {
        ...mockAgent,
        knowledgeBase: ['Some domain knowledge', 'More knowledge']
      };

      const executorWithKnowledge = new AgentFolderExecutor(agentWithKnowledge);
      const prompt = executorWithKnowledge.generateSystemPrompt();

      expect(prompt).toContain('Knowledge Base');
      expect(prompt).toContain('Some domain knowledge');
    });
  });

  describe('Agent Info', () => {
    it('should return correct agent info', () => {
      const info = executor.getAgentInfo();

      expect(info.id).toBe('test-agent');
      expect(info.name).toBe('Test Agent');
      expect(info.version).toBe('1.0.0');
      expect(info.capabilities).toEqual([]);
      expect(info.tools).toEqual([]);
    });
  });
});
