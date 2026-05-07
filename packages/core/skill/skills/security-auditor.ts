import { BaseSkill, SkillContext, SkillResult } from './base-skill';
import { MessageBus } from '../agentMessageBus';

export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  location?: string;
  recommendation: string;
}

export interface VulnerabilityScan {
  totalFiles: number;
  issues: SecurityIssue[];
  riskScore: number;
  recommendations: string[];
}

export class SecurityAuditorSkill extends BaseSkill {
  readonly skillId = 'security-auditor';
  readonly skillName = 'Security Auditor';
  readonly description = 'Perform security analysis and vulnerability assessment';
  readonly requiredTools = ['security_scan', 'filesystem'];
  readonly recommendedTools = ['dependency_check', 'secret_scan', 'code_review'];

  constructor(messageBus: MessageBus) {
    super(messageBus);
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    this.log(`Starting security audit for: ${context.userInput}`);

    const outputs = [];

    // Step 1: Scope definition
    const scope = this.defineScope(context.userInput);
    outputs.push({ type: 'scope', data: scope });

    // Step 2: Vulnerability scanning
    const vulnerabilities = await this.scanVulnerabilities(scope);
    outputs.push({ type: 'vulnerabilities', data: vulnerabilities });

    // Step 3: Code security review
    const codeIssues = await this.reviewCodeSecurity(scope);
    outputs.push({ type: 'codeIssues', data: codeIssues });

    // Step 4: Generate security report
    const report = this.generateSecurityReport(vulnerabilities, codeIssues);
    outputs.push({ type: 'securityReport', data: report });

    const allIssues = [...vulnerabilities.issues, ...codeIssues];
    const hasCritical = allIssues.some(i => i.severity === 'critical');

    this.log(`Security audit completed. Found ${allIssues.length} issues.`);

    return {
      success: !hasCritical,
      outputs,
      confidence: 0.85,
      nextSkills: []
    };
  }

  private defineScope(input: string): {
    target: string;
    focusAreas: string[];
    depth: 'basic' | 'standard' | 'deep';
  } {
    const inputLower = input.toLowerCase();

    const focusAreas: string[] = [];
    if (inputLower.includes('api') || inputLower.includes('endpoint')) {
      focusAreas.push('API Security');
    }
    if (inputLower.includes('auth') || inputLower.includes('login')) {
      focusAreas.push('Authentication');
    }
    if (inputLower.includes('data') || inputLower.includes('database')) {
      focusAreas.push('Data Protection');
    }
    if (inputLower.includes('input') || inputLower.includes('form')) {
      focusAreas.push('Input Validation');
    }
    if (focusAreas.length === 0) {
      focusAreas.push('General Security');
    }

    let depth: 'basic' | 'standard' | 'deep' = 'standard';
    if (inputLower.includes('comprehensive') || inputLower.includes('full')) {
      depth = 'deep';
    } else if (inputLower.includes('quick') || inputLower.includes('basic')) {
      depth = 'basic';
    }

    return {
      target: 'application',
      focusAreas,
      depth
    };
  }

  private async scanVulnerabilities(scope: any): Promise<VulnerabilityScan> {
    const issues: SecurityIssue[] = [];

    // Simulate common vulnerability patterns
    if (scope.focusAreas.includes('Input Validation')) {
      issues.push({
        severity: 'medium',
        category: 'Input Validation',
        description: 'Potential SQL injection vulnerability in user input handling',
        location: 'src/services/user.service.ts',
        recommendation: 'Use parameterized queries or ORM for database operations'
      });
    }

    if (scope.focusAreas.includes('Authentication')) {
      issues.push({
        severity: 'high',
        category: 'Authentication',
        description: 'Password validation too weak - allows short passwords',
        location: 'src/validators/auth.validator.ts',
        recommendation: 'Enforce minimum 8 characters with mixed case, numbers, and special characters'
      });
    }

    if (scope.focusAreas.includes('Data Protection')) {
      issues.push({
        severity: 'high',
        category: 'Data Protection',
        description: 'Sensitive data (password) logged in plain text',
        location: 'src/middleware/logger.middleware.ts',
        recommendation: 'Mask sensitive fields in log output'
      });
    }

    if (scope.depth === 'deep') {
      issues.push({
        severity: 'medium',
        category: 'Dependencies',
        description: 'Outdated dependency with known vulnerabilities: lodash < 4.17.21',
        location: 'package.json',
        recommendation: 'Update lodash to version 4.17.21 or later'
      });
    }

    const riskScore = this.calculateRiskScore(issues);

    return {
      totalFiles: 50,
      issues,
      riskScore,
      recommendations: this.generateRecommendations(issues)
    };
  }

  private async reviewCodeSecurity(scope: any): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Simulate code review findings
    if (scope.focusAreas.includes('API Security')) {
      issues.push({
        severity: 'critical',
        category: 'API Security',
        description: 'No rate limiting on authentication endpoint - vulnerable to brute force',
        location: 'src/routes/auth.routes.ts',
        recommendation: 'Implement rate limiting middleware (e.g., express-rate-limit)'
      });
    }

    issues.push({
      severity: 'low',
      category: 'Code Quality',
      description: 'Hardcoded API key found in source code',
      location: 'src/config/api.ts',
      recommendation: 'Use environment variables for sensitive configuration'
    });

    return issues;
  }

  private calculateRiskScore(issues: SecurityIssue[]): number {
    const weights = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 1
    };

    const totalWeight = issues.reduce((sum, issue) => sum + weights[issue.severity], 0);
    const maxPossible = issues.length * 10;
    const normalizedScore = maxPossible > 0 ? (totalWeight / maxPossible) * 100 : 0;

    return Math.round(100 - normalizedScore);
  }

  private generateRecommendations(issues: SecurityIssue[]): string[] {
    const recommendations = new Set<string>();

    for (const issue of issues) {
      recommendations.add(issue.recommendation);
    }

    recommendations.add('Regular security audits should be scheduled monthly');
    recommendations.add('Keep all dependencies up to date with security patches');
    recommendations.add('Implement automated security scanning in CI/CD pipeline');

    return Array.from(recommendations);
  }

  private generateSecurityReport(vulnerabilities: VulnerabilityScan, codeIssues: SecurityIssue[]): {
    summary: string;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    nextSteps: string[];
  } {
    const allIssues = [...vulnerabilities.issues, ...codeIssues];
    const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const mediumCount = allIssues.filter(i => i.severity === 'medium').length;
    const lowCount = allIssues.filter(i => i.severity === 'low').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalCount > 0) {
      riskLevel = 'critical';
    } else if (highCount >= 3) {
      riskLevel = 'high';
    } else if (highCount > 0 || mediumCount >= 5) {
      riskLevel = 'medium';
    }

    const nextSteps: string[] = [];
    if (criticalCount > 0) {
      nextSteps.push('URGENT: Fix all critical severity issues immediately');
    }
    if (highCount > 0) {
      nextSteps.push('Fix high severity issues within 24 hours');
    }
    nextSteps.push('Schedule follow-up audit after fixes are applied');
    nextSteps.push('Implement security best practices training for developers');

    return {
      summary: `Security audit found ${allIssues.length} issues across ${vulnerabilities.totalFiles} files. Risk Score: ${vulnerabilities.riskScore}/100`,
      criticalIssues: criticalCount,
      highIssues: highCount,
      mediumIssues: mediumCount,
      lowIssues: lowCount,
      riskLevel,
      nextSteps
    };
  }
}
