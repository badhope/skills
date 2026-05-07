import { BaseSkill, SkillContext, SkillResult } from './base-skill';
import { MessageBus } from '../agentMessageBus';

export interface BugReport {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
}

export interface BugAnalysis {
  bugReport: BugReport;
  rootCause: string;
  affectedComponents: string[];
  suggestedFix: string;
  estimatedEffort: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export class BugHunterSkill extends BaseSkill {
  readonly skillId = 'bug-hunter';
  readonly skillName = 'Bug Hunter';
  readonly description = 'Identify, analyze, and fix bugs in codebase';
  readonly requiredTools = ['filesystem', 'terminal'];
  readonly recommendedTools = ['testing', 'search', 'code_review', 'log_analysis'];

  constructor(messageBus: MessageBus) {
    super(messageBus);
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    this.log(`Starting bug hunt for: ${context.userInput}`);

    const outputs = [];

    // Step 1: Parse bug report
    const bugReport = this.parseBugReport(context.userInput);
    outputs.push({ type: 'bugReport', data: bugReport });

    // Step 2: Analyze and identify root cause
    const analysis = await this.analyzeBug(bugReport);
    outputs.push({ type: 'analysis', data: analysis });

    // Step 3: Suggest fix
    if (analysis.rootCause) {
      const fix = this.generateFixSuggestion(analysis);
      outputs.push({ type: 'fixSuggestion', data: fix });
    }

    this.log(`Bug analysis completed. Severity: ${bugReport.severity}`);

    return {
      success: true,
      outputs,
      confidence: 0.85,
      nextSkills: analysis.riskLevel === 'high' ? ['testing-master'] : []
    };
  }

  private parseBugReport(input: string): BugReport {
    const severityKeywords: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      'critical': 'critical',
      'urgent': 'critical',
      'crash': 'critical',
      'high': 'high',
      'important': 'high',
      'medium': 'medium',
      'minor': 'low',
      'low': 'low'
    };

    let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    for (const [keyword, level] of Object.entries(severityKeywords)) {
      if (input.toLowerCase().includes(keyword)) {
        severity = level;
        break;
      }
    }

    return {
      id: `bug-${Date.now()}`,
      title: this.extractTitle(input),
      description: input,
      severity,
      stepsToReproduce: this.extractSteps(input),
      expectedBehavior: 'Expected behavior based on input',
      actualBehavior: 'Actual behavior described in input'
    };
  }

  private extractTitle(input: string): string {
    const lines = input.split('\n');
    for (const line of lines) {
      if (line.trim().length > 0 && !line.toLowerCase().startsWith('steps')) {
        return line.trim().substring(0, 100);
      }
    }
    return 'Bug Report';
  }

  private extractSteps(input: string): string[] {
    const lowerInput = input.toLowerCase();
    const stepsIndex = lowerInput.indexOf('steps');
    if (stepsIndex !== -1) {
      const stepsSection = input.substring(stepsIndex);
      const lines = stepsSection.split('\n').slice(1);
      return lines.filter(l => l.trim().length > 0).map(l => l.trim());
    }
    return ['1. Reproduce the issue', '2. Observe the bug'];
  }

  private async analyzeBug(bugReport: BugReport): Promise<BugAnalysis> {
    // Simulate bug analysis
    const affectedComponents: string[] = [];
    
    if (bugReport.description.toLowerCase().includes('api') || 
        bugReport.description.toLowerCase().includes('endpoint')) {
      affectedComponents.push('API Layer');
    }
    if (bugReport.description.toLowerCase().includes('database') || 
        bugReport.description.toLowerCase().includes('db')) {
      affectedComponents.push('Database Layer');
    }
    if (bugReport.description.toLowerCase().includes('ui') || 
        bugReport.description.toLowerCase().includes('frontend')) {
      affectedComponents.push('Frontend Components');
    }

    const riskLevel = bugReport.severity === 'critical' ? 'high' :
                      bugReport.severity === 'high' ? 'medium' : 'low';

    return {
      bugReport,
      rootCause: this.determineRootCause(bugReport),
      affectedComponents: affectedComponents.length > 0 ? affectedComponents : ['Unknown'],
      suggestedFix: 'Review affected components and implement fix',
      estimatedEffort: bugReport.severity === 'critical' ? 8 :
                       bugReport.severity === 'high' ? 4 : 2,
      riskLevel
    };
  }

  private determineRootCause(bugReport: BugReport): string {
    const keywords = bugReport.description.toLowerCase();
    
    if (keywords.includes('null') || keywords.includes('undefined')) {
      return 'Null/undefined reference error - missing null check';
    }
    if (keywords.includes('timeout') || keywords.includes('slow')) {
      return 'Performance issue - potential infinite loop or inefficient algorithm';
    }
    if (keywords.includes('error') || keywords.includes('exception')) {
      return 'Exception not properly handled - missing try-catch block';
    }
    if (keywords.includes('crash') || keywords.includes('hang')) {
      return 'Fatal error - unhandled exception or resource exhaustion';
    }
    
    return 'Need further investigation - review logs and reproduce the issue';
  }

  private generateFixSuggestion(analysis: BugAnalysis): {
    description: string;
    implementationSteps: string[];
    verificationSteps: string[];
  } {
    return {
      description: `Fix for: ${analysis.bugReport.title}`,
      implementationSteps: [
        `1. Review affected components: ${analysis.affectedComponents.join(', ')}`,
        `2. Implement fix based on root cause: ${analysis.rootCause}`,
        '3. Write unit tests to cover the fix',
        '4. Verify fix resolves the issue'
      ],
      verificationSteps: [
        '1. Reproduce the original bug to confirm it exists',
        '2. Apply the fix',
        '3. Verify the bug is resolved',
        '4. Run regression tests'
      ]
    };
  }
}
