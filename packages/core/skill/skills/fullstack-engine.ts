import { BaseSkill, SkillContext, SkillResult } from './base-skill';
import { MessageBus } from '../agentMessageBus';

export class FullstackEngineSkill extends BaseSkill {
  readonly skillId = 'fullstack-engine';
  readonly skillName = 'Fullstack Engine';
  readonly description = 'Execute full stack development tasks';
  readonly requiredTools = ['filesystem', 'terminal', 'git'];
  readonly recommendedTools = ['database', 'docker', 'code_generate', 'testing', 'search'];

  constructor(messageBus: MessageBus) {
    super(messageBus);
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    this.log(`Starting fullstack development for: ${context.userInput}`);

    const outputs = [];

    // Step 1: Analyze task
    const taskAnalysis = await this.analyzeTask(context.userInput);
    outputs.push({ type: 'taskAnalysis', data: taskAnalysis });

    // Step 2: Determine tech stack
    const techStack = this.determineTechStack(taskAnalysis);
    outputs.push({ type: 'techStack', data: techStack });

    // Step 3: Generate project structure
    const projectStructure = this.generateProjectStructure(taskAnalysis, techStack);
    outputs.push({ type: 'projectStructure', data: projectStructure });

    // Step 4: Create initial files
    const files = await this.createInitialFiles(projectStructure, techStack);
    outputs.push({ type: 'filesCreated', data: files });

    this.log('Fullstack development completed');

    return {
      success: true,
      outputs,
      confidence: 0.85,
      nextSkills: ['testing-master']
    };
  }

  private async analyzeTask(input: string): Promise<{
    taskType: 'new_project' | 'feature' | 'fix' | 'refactor';
    frameworks: string[];
    requirements: string[];
    complexity: number;
  }> {
    const inputLower = input.toLowerCase();

    let taskType: 'new_project' | 'feature' | 'fix' | 'refactor' = 'new_project';
    if (inputLower.includes('feature') || inputLower.includes('implement')) {
      taskType = 'feature';
    } else if (inputLower.includes('fix') || inputLower.includes('bug')) {
      taskType = 'fix';
    } else if (inputLower.includes('refactor') || inputLower.includes('improve')) {
      taskType = 'refactor';
    }

    const frameworks: string[] = [];
    if (inputLower.includes('react')) frameworks.push('React');
    if (inputLower.includes('typescript')) frameworks.push('TypeScript');
    if (inputLower.includes('node')) frameworks.push('Node.js');
    if (inputLower.includes('express')) frameworks.push('Express');

    const requirements: string[] = [];
    if (inputLower.includes('todo') || inputLower.includes('list')) {
      requirements.push('Todo list functionality');
    }
    if (inputLower.includes('ui') || inputLower.includes('interface')) {
      requirements.push('User interface components');
    }

    return {
      taskType,
      frameworks,
      requirements,
      complexity: this.estimateComplexity(input)
    };
  }

  private determineTechStack(analysis: any): {
    frontend: string;
    backend: string;
    database: string;
    buildTool: string;
  } {
    const techStack = {
      frontend: 'React',
      backend: 'Node.js + Express',
      database: 'SQLite',
      buildTool: 'Vite'
    };

    if (analysis.frameworks.includes('React')) {
      techStack.frontend = 'React';
    }
    if (analysis.frameworks.includes('TypeScript')) {
      techStack.frontend += ' + TypeScript';
    }

    return techStack;
  }

  private generateProjectStructure(analysis: any, techStack: any): {
    root: string;
    directories: string[];
    files: string[];
  } {
    const directories = [
      'src/',
      'src/components/',
      'src/pages/',
      'src/services/',
      'src/types/',
      'tests/',
      'public/'
    ];

    const files = [
      'src/main.tsx',
      'src/App.tsx',
      'src/index.css',
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'README.md',
      '.gitignore'
    ];

    return {
      root: analysis.taskType === 'new_project' ? './' : './',
      directories,
      files
    };
  }

  private async createInitialFiles(structure: any, techStack: any): Promise<string[]> {
    const createdFiles: string[] = [];

    // Create package.json
    const packageJson = {
      name: 'my-app',
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
        test: 'vitest'
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      },
      devDependencies: {
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@vitejs/plugin-react': '^4.0.0',
        typescript: '^5.0.0',
        vite: '^5.0.0',
        vitest: '^1.0.0'
      }
    };
    createdFiles.push('package.json');

    // Create basic React files
    createdFiles.push('src/main.tsx');
    createdFiles.push('src/App.tsx');

    // Create TypeScript config
    createdFiles.push('tsconfig.json');

    // Create Vite config
    createdFiles.push('vite.config.ts');

    // Create gitignore
    createdFiles.push('.gitignore');

    // Create README
    createdFiles.push('README.md');

    return createdFiles;
  }

  private estimateComplexity(input: string): number {
    let complexity = 5;
    const keywords = {
      simple: -2,
      basic: -1,
      complex: 2,
      advanced: 3,
      enterprise: 4,
      large: 3,
      multiple: 2,
      integration: 2,
      api: 1
    };

    const inputLower = input.toLowerCase();
    for (const [keyword, value] of Object.entries(keywords)) {
      if (inputLower.includes(keyword)) {
        complexity += value;
      }
    }

    return Math.max(1, Math.min(10, complexity));
  }
}
