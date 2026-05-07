import { SkillOrchestrator } from '../skills/orchestrator';
import { AgentMessageBus } from '../agentMessageBus';

describe('SkillOrchestrator', () => {
  let orchestrator: SkillOrchestrator;
  let messageBus: AgentMessageBus;

  beforeEach(() => {
    messageBus = new AgentMessageBus();
    orchestrator = new SkillOrchestrator(messageBus, { maxIterations: 10, timeout: 60000, enableParallel: false });
  });

  describe('Skill Registration', () => {
    it('should register and retrieve skills', () => {
      const skills = orchestrator.getAllSkills();
      expect(skills.length).toBe(7);
      expect(skills.map(s => s.skillId)).toContain('task-planner');
      expect(skills.map(s => s.skillId)).toContain('fullstack-engine');
      expect(skills.map(s => s.skillId)).toContain('testing-master');
      expect(skills.map(s => s.skillId)).toContain('security-auditor');
      expect(skills.map(s => s.skillId)).toContain('code-quality-expert');
      expect(skills.map(s => s.skillId)).toContain('bug-hunter');
      expect(skills.map(s => s.skillId)).toContain('devops-engineer');
    });

    it('should retrieve individual skill', () => {
      const skill = orchestrator.getSkill('task-planner');
      expect(skill).toBeDefined();
      expect(skill?.skillId).toBe('task-planner');
    });

    it('should return undefined for non-existent skill', () => {
      const skill = orchestrator.getSkill('non-existent-skill');
      expect(skill).toBeUndefined();
    });
  });

  describe('Workflow Execution', () => {
    it('should execute simple workflow with task-planner', async () => {
      const result = await orchestrator.executeWorkflow(
        {
          name: 'Test Workflow',
          stages: [
            { id: 'planning', name: 'Planning', skill: 'task-planner', required: true }
          ]
        },
        'Create a simple React Todo application',
        ['filesystem', 'terminal']
      );

      expect(result.status).toBe('completed');
      expect(result.results.length).toBe(1);
      expect(result.results[0].success).toBe(true);
    });

    it('should fail when required tools are missing', async () => {
      const result = await orchestrator.executeWorkflow(
        {
          name: 'Test Workflow',
          stages: [
            { id: 'planning', name: 'Planning', skill: 'security-auditor', required: true }
          ]
        },
        'Audit the codebase',
        []
      );

      expect(result.status).toBe('failed');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].errors).toContain('Missing required tools for skill: security-auditor');
    });

    it('should execute workflow with multiple stages', async () => {
      const result = await orchestrator.executeWorkflow(
        {
          name: 'Full Workflow',
          stages: [
            { id: 'planning', name: 'Task Planning', skill: 'task-planner', required: true },
            { id: 'implementation', name: 'Implementation', skill: 'fullstack-engine', required: true },
            { id: 'testing', name: 'Testing', skill: 'testing-master', required: true }
          ]
        },
        'Create a simple React application',
        ['filesystem', 'terminal', 'git', 'testing']
      );

      expect(result.status).toBe('completed');
      expect(result.results.length).toBe(3);
      expect(result.results.every(r => r.success)).toBe(true);
    });

    it('should stop on first failed stage if required', async () => {
      const result = await orchestrator.executeWorkflow(
        {
          name: 'Failing Workflow',
          stages: [
            { id: 'planning', name: 'Planning', skill: 'task-planner', required: true },
            { id: 'failing', name: 'Failing Stage', skill: 'non-existent-skill', required: true }
          ]
        },
        'Test task',
        ['filesystem', 'terminal']
      );

      expect(result.status).toBe('failed');
      expect(result.results.length).toBe(2);
    });
  });

  describe('Skill Execution', () => {
    it('should execute task-planner skill successfully', async () => {
      const result = await orchestrator.executeSkill(
        'task-planner',
        'Create a new project with React',
        ['filesystem', 'terminal']
      );

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should execute fullstack-engine skill successfully', async () => {
      const result = await orchestrator.executeSkill(
        'fullstack-engine',
        'Build a React application with TypeScript',
        ['filesystem', 'terminal', 'git']
      );

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should execute testing-master skill successfully', async () => {
      const result = await orchestrator.executeSkill(
        'testing-master',
        'Create unit tests for the application',
        ['testing', 'terminal', 'filesystem']
      );

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should execute security-auditor skill successfully', async () => {
      const result = await orchestrator.executeSkill(
        'security-auditor',
        'Perform security audit on the codebase',
        ['security_scan', 'filesystem']
      );

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should execute code-quality-expert skill successfully', async () => {
      const result = await orchestrator.executeSkill(
        'code-quality-expert',
        'Review code quality and provide recommendations',
        ['code_review', 'code_lint']
      );

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should execute bug-hunter skill successfully', async () => {
      const result = await orchestrator.executeSkill(
        'bug-hunter',
        'The application crashes when clicking the submit button. Steps: 1. Go to form page 2. Fill in fields 3. Click submit',
        ['filesystem', 'terminal']
      );

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should execute devops-engineer skill successfully', async () => {
      const result = await orchestrator.executeSkill(
        'devops-engineer',
        'Deploy the application to production using Docker',
        ['terminal', 'docker', 'git']
      );

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });
  });

  describe('Skill Determination', () => {
    it('should determine security-auditor for security-related stages', () => {
      const skillId = (orchestrator as any).determineSkillForStage(
        { name: 'Security Audit', description: 'Audit security' },
        'test'
      );
      expect(skillId).toBe('security-auditor');
    });

    it('should determine testing-master for test-related stages', () => {
      const skillId = (orchestrator as any).determineSkillForStage(
        { name: 'Testing Phase', description: 'Run tests' },
        'test'
      );
      expect(skillId).toBe('testing-master');
    });

    it('should determine task-planner for planning stages', () => {
      const skillId = (orchestrator as any).determineSkillForStage(
        { name: 'Project Planning', description: 'Plan the project' },
        'test'
      );
      expect(skillId).toBe('task-planner');
    });

    it('should determine bug-hunter for bug-related stages', () => {
      const skillId = (orchestrator as any).determineSkillForStage(
        { name: 'Bug Analysis', description: 'Analyze bug' },
        'test'
      );
      expect(skillId).toBe('bug-hunter');
    });

    it('should determine devops-engineer for deployment stages', () => {
      const skillId = (orchestrator as any).determineSkillForStage(
        { name: 'Deployment', description: 'Deploy application' },
        'test'
      );
      expect(skillId).toBe('devops-engineer');
    });

    it('should default to fullstack-engine for unknown stages', () => {
      const skillId = (orchestrator as any).determineSkillForStage(
        { name: 'Unknown Stage', description: 'Unknown description' },
        'test'
      );
      expect(skillId).toBe('fullstack-engine');
    });
  });
});
