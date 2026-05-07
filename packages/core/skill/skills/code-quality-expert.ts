import { BaseSkill, SkillContext, SkillResult } from './base-skill';
import { MessageBus } from '../agentMessageBus';

export interface CodeIssue {
  type: 'style' | 'performance' | 'maintainability' | 'readability' | 'best-practice';
  severity: 'error' | 'warning' | 'info';
  line?: number;
  message: string;
  suggestion: string;
}

export interface CodeMetrics {
  linesOfCode: number;
  commentLines: number;
  blankLines: number;
  cyclomaticComplexity: number;
  maintainabilityIndex: number;
  technicalDebt: number;
}

export class CodeQualityExpertSkill extends BaseSkill {
  readonly skillId = 'code-quality-expert';
  readonly skillName = 'Code Quality Expert';
  readonly description = 'Review code for quality, best practices, and improvements';
  readonly requiredTools = ['code_review', 'code_lint'];
  readonly recommendedTools = ['code_format', 'testing'];

  constructor(messageBus: MessageBus) {
    super(messageBus);
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    this.log(`Starting code quality review for: ${context.userInput}`);

    const outputs = [];

    // Step 1: Initial review
    const reviewScope = this.defineReviewScope(context.userInput);
    outputs.push({ type: 'reviewScope', data: reviewScope });

    // Step 2: Analyze code metrics
    const metrics = this.analyzeCodeMetrics(reviewScope);
    outputs.push({ type: 'metrics', data: metrics });

    // Step 3: Identify issues
    const issues = await this.identifyIssues(reviewScope);
    outputs.push({ type: 'issues', data: issues });

    // Step 4: Generate recommendations
    const recommendations = this.generateRecommendations(issues, metrics);
    outputs.push({ type: 'recommendations', data: recommendations });

    // Step 5: Create final report
    const report = this.createQualityReport(metrics, issues, recommendations);
    outputs.push({ type: 'finalReport', data: report });

    const hasErrors = issues.some(i => i.severity === 'error');
    const qualityScore = this.calculateQualityScore(metrics, issues);

    this.log(`Code quality review completed. Quality score: ${qualityScore}/100`);

    return {
      success: qualityScore >= 70 && !hasErrors,
      outputs,
      confidence: 0.85,
      nextSkills: hasErrors ? ['testing-master'] : []
    };
  }

  private defineReviewScope(input: string): {
    target: string;
    focusAreas: string[];
    depth: 'quick' | 'standard' | 'comprehensive';
    excludePatterns: string[];
  } {
    const inputLower = input.toLowerCase();

    const focusAreas: string[] = [];
    if (inputLower.includes('performance')) {
      focusAreas.push('Performance');
    }
    if (inputLower.includes('security')) {
      focusAreas.push('Security');
    }
    if (inputLower.includes('readability') || inputLower.includes('clean')) {
      focusAreas.push('Readability');
    }
    if (inputLower.includes('maintainability') || inputLower.includes('refactor')) {
      focusAreas.push('Maintainability');
    }
    if (inputLower.includes('best practice') || inputLower.includes('standard')) {
      focusAreas.push('Best Practices');
    }
    if (focusAreas.length === 0) {
      focusAreas.push('General');
    }

    let depth: 'quick' | 'standard' | 'comprehensive' = 'standard';
    if (inputLower.includes('quick') || inputLower.includes('basic')) {
      depth = 'quick';
    } else if (inputLower.includes('comprehensive') || inputLower.includes('full')) {
      depth = 'comprehensive';
    }

    return {
      target: 'src/',
      focusAreas,
      depth,
      excludePatterns: ['node_modules/', 'dist/', 'build/', '*.test.ts', '*.spec.ts']
    };
  }

  private analyzeCodeMetrics(scope: any): CodeMetrics {
    // Simulate code metrics analysis
    const linesOfCode = scope.depth === 'comprehensive' ? 2500 :
                        scope.depth === 'standard' ? 1500 : 800;

    const commentLines = Math.round(linesOfCode * 0.12);
    const blankLines = Math.round(linesOfCode * 0.15);

    const cyclomaticComplexity = scope.depth === 'comprehensive' ? 45 :
                                  scope.depth === 'standard' ? 28 : 15;

    const maintainabilityIndex = 85 - (cyclomaticComplexity * 0.5) - (linesOfCode / 100);

    const technicalDebt = scope.depth === 'comprehensive' ? 480 :
                         scope.depth === 'standard' ? 240 : 90;

    return {
      linesOfCode,
      commentLines,
      blankLines,
      cyclomaticComplexity,
      maintainabilityIndex: Math.round(maintainabilityIndex),
      technicalDebt
    };
  }

  private async identifyIssues(scope: any): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];

    // Simulate issue detection based on scope
    if (scope.focusAreas.includes('Performance') || scope.focusAreas.includes('General')) {
      issues.push({
        type: 'performance',
        severity: 'warning',
        line: 42,
        message: 'Potential memory leak: Event listener not removed on cleanup',
        suggestion: 'Remove event listener in useEffect cleanup function or componentWillUnmount'
      });

      issues.push({
        type: 'performance',
        severity: 'warning',
        line: 87,
        message: 'Unnecessary re-render detected in ListComponent',
        suggestion: 'Use React.memo() or useMemo() to prevent unnecessary re-renders'
      });
    }

    if (scope.focusAreas.includes('Readability') || scope.focusAreas.includes('General')) {
      issues.push({
        type: 'readability',
        severity: 'info',
        line: 115,
        message: 'Function name could be more descriptive',
        suggestion: 'Rename "processData" to "processUserSubmissionData" for clarity'
      });

      issues.push({
        type: 'style',
        severity: 'info',
        line: 203,
        message: 'Inconsistent indentation detected',
        suggestion: 'Use consistent 2-space indentation throughout the file'
      });
    }

    if (scope.focusAreas.includes('Best Practices') || scope.focusAreas.includes('General')) {
      issues.push({
        type: 'best-practice',
        severity: 'warning',
        line: 156,
        message: 'Use of deprecated API: componentWillMount',
        suggestion: 'Replace with constructor or componentDidMount'
      });

      issues.push({
        type: 'best-practice',
        severity: 'info',
        line: 178,
        message: 'Magic number detected',
        suggestion: 'Extract constant with descriptive name (e.g., MAX_RETRY_COUNT = 3)'
      });
    }

    if (scope.focusAreas.includes('Maintainability') || scope.focusAreas.includes('General')) {
      issues.push({
        type: 'maintainability',
        severity: 'warning',
        line: 234,
        message: 'Function exceeds recommended length (87 lines)',
        suggestion: 'Break down into smaller, focused functions (recommended: < 50 lines)'
      });

      issues.push({
        type: 'maintainability',
        severity: 'error',
        line: 289,
        message: 'Deep nesting detected (6 levels)',
        suggestion: 'Extract nested logic into separate functions or use early returns'
      });
    }

    return issues;
  }

  private generateRecommendations(issues: CodeIssue[], metrics: CodeMetrics): string[] {
    const recommendations: string[] = [];

    // Group issues by type
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    if (errors.length > 0) {
      recommendations.push(`Fix ${errors.length} error-level issues first`);
    }

    if (warnings.length > 5) {
      recommendations.push(`Address ${warnings.length} warning-level issues to improve code quality`);
    }

    if (metrics.cyclomaticComplexity > 30) {
      recommendations.push('Consider refactoring high-complexity functions to improve testability');
    }

    if (metrics.maintainabilityIndex < 70) {
      recommendations.push('Improve maintainability by reducing complexity and adding documentation');
    }

    if (metrics.technicalDebt > 300) {
      recommendations.push('Schedule time to address technical debt to prevent future accumulation');
    }

    recommendations.push('Implement code quality gates in CI/CD to prevent regression');
    recommendations.push('Consider pair programming for complex features');

    return recommendations;
  }

  private calculateQualityScore(metrics: CodeMetrics, issues: CodeIssue[]): number {
    let score = 100;

    // Deduct for errors
    score -= issues.filter(i => i.severity === 'error').length * 15;

    // Deduct for warnings
    score -= issues.filter(i => i.severity === 'warning').length * 5;

    // Deduct for info
    score -= issues.filter(i => i.severity === 'info').length * 1;

    // Deduct for complexity
    if (metrics.cyclomaticComplexity > 30) {
      score -= 10;
    } else if (metrics.cyclomaticComplexity > 20) {
      score -= 5;
    }

    // Deduct for maintainability
    if (metrics.maintainabilityIndex < 70) {
      score -= 15;
    } else if (metrics.maintainabilityIndex < 80) {
      score -= 8;
    }

    // Deduct for technical debt
    if (metrics.technicalDebt > 300) {
      score -= 10;
    } else if (metrics.technicalDebt > 150) {
      score -= 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private createQualityReport(
    metrics: CodeMetrics,
    issues: CodeIssue[],
    recommendations: string[]
  ): {
    qualityScore: number;
    grade: string;
    summary: string;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    metricsSummary: string;
    prioritizedActions: string[];
  } {
    const qualityScore = this.calculateQualityScore(metrics, issues);

    let grade: string;
    if (qualityScore >= 90) grade = 'A';
    else if (qualityScore >= 80) grade = 'B';
    else if (qualityScore >= 70) grade = 'C';
    else if (qualityScore >= 60) grade = 'D';
    else grade = 'F';

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const infos = issues.filter(i => i.severity === 'info');

    return {
      qualityScore,
      grade,
      summary: `Code quality analysis complete. Overall grade: ${grade}. Found ${errors.length} errors, ${warnings.length} warnings, and ${infos.length} suggestions.`,
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: infos.length,
      metricsSummary: `LOC: ${metrics.linesOfCode} | Complexity: ${metrics.cyclomaticComplexity} | Maintainability: ${metrics.maintainabilityIndex}/100 | Tech Debt: ${metrics.technicalDebt}min`,
      prioritizedActions: recommendations.slice(0, 5)
    };
  }
}
