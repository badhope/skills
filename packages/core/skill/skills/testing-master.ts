import { BaseSkill, SkillContext, SkillResult } from './base-skill';
import { MessageBus } from '../agentMessageBus';

export class TestingMasterSkill extends BaseSkill {
  readonly skillId = 'testing-master';
  readonly skillName = 'Testing Master';
  readonly description = 'Create and execute test cases';
  readonly requiredTools = ['testing', 'terminal', 'filesystem'];
  readonly recommendedTools = ['code_generate', 'search'];

  constructor(messageBus: MessageBus) {
    super(messageBus);
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    this.log(`Starting testing for: ${context.userInput}`);

    const outputs = [];

    // Step 1: Analyze what needs testing
    const testAnalysis = this.analyzeTestingNeeds(context.userInput);
    outputs.push({ type: 'testAnalysis', data: testAnalysis });

    // Step 2: Create test plan
    const testPlan = this.createTestPlan(testAnalysis);
    outputs.push({ type: 'testPlan', data: testPlan });

    // Step 3: Generate test cases
    const testCases = this.generateTestCases(testAnalysis);
    outputs.push({ type: 'testCases', data: testCases });

    // Step 4: Create test files
    const testFiles = this.createTestFiles(testCases);
    outputs.push({ type: 'testFiles', data: testFiles });

    this.log('Testing process complete');

    return {
      success: true,
      outputs,
      confidence: 0.8,
      nextSkills: []
    };
  }

  private analyzeTestingNeeds(input: string): {
    testType: 'unit' | 'integration' | 'e2e' | 'all';
    coverageGoal: number;
    priorityAreas: string[];
  } {
    const inputLower = input.toLowerCase();

    let testType: 'unit' | 'integration' | 'e2e' | 'all' = 'unit';
    if (inputLower.includes('e2e') || inputLower.includes('end-to-end')) {
      testType = 'e2e';
    } else if (inputLower.includes('integration')) {
      testType = 'integration';
    } else if (inputLower.includes('all') || inputLower.includes('comprehensive')) {
      testType = 'all';
    }

    const priorityAreas: string[] = [];
    if (inputLower.includes('react') || inputLower.includes('component')) {
      priorityAreas.push('Components');
    }
    if (inputLower.includes('api') || inputLower.includes('server')) {
      priorityAreas.push('APIs');
    }
    if (inputLower.includes('database')) {
      priorityAreas.push('Database');
    }

    return {
      testType,
      coverageGoal: 80,
      priorityAreas
    };
  }

  private createTestPlan(analysis: any): {
    testSuites: { name: string; testCount: number }[];
    tools: string[];
    approach: string;
  } {
    const testSuites: { name: string; testCount: number }[] = [
      { name: 'Unit Tests', testCount: 10 }
    ];

    if (analysis.testType === 'integration' || analysis.testType === 'all') {
      testSuites.push({ name: 'Integration Tests', testCount: 5 });
    }

    if (analysis.testType === 'e2e' || analysis.testType === 'all') {
      testSuites.push({ name: 'E2E Tests', testCount: 3 });
    }

    return {
      testSuites,
      tools: ['Vitest', 'React Testing Library'],
      approach: 'Red-Green-Refactor approach with TDD'
    };
  }

  private generateTestCases(analysis: any): {
    name: string;
    type: string;
    description: string;
    expected: string;
  }[] {
    const testCases = [
      {
        name: 'should render correctly',
        type: 'unit',
        description: 'Component renders without errors',
        expected: 'Component is in document'
      },
      {
        name: 'should handle user input',
        type: 'unit',
        description: 'Component responds to user interactions',
        expected: 'State updates correctly'
      },
      {
        name: 'should handle edge cases',
        type: 'unit',
        description: 'Component handles invalid inputs gracefully',
        expected: 'No errors, appropriate feedback'
      }
    ];

    if (analysis.priorityAreas.includes('APIs')) {
      testCases.push({
        name: 'should respond to GET requests',
        type: 'integration',
        description: 'API responds to GET requests',
        expected: '200 status, correct data'
      });
    }

    return testCases;
  }

  private createTestFiles(testCases: any): string[] {
    const files: string[] = [
      'tests/setup.ts',
      'tests/utils.test.ts',
      'tests/App.test.tsx'
    ];

    return files;
  }
}
