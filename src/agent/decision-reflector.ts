/**
 * 决策反思器模块
 *
 * 提供 Agent 决策的记录、反思和改进建议能力，包括：
 * 1. 决策记录 - 记录每次决策的上下文、备选方案和选择理由
 * 2. 结果追踪 - 追踪决策的实际执行结果
 * 3. 任务反思 - 对任务执行过程进行综合反思
 * 4. 改进建议 - 基于历史决策生成改进建议
 */

// 从子模块导入类型
import type {
  Decision,
  Alternative,
  DecisionOutcome,
  Reflection,
  ImprovementSuggestion,
  ReflectionQuery,
  DecisionStats,
} from './decision-types.js';

// Re-export 所有类型
export type {
  Decision,
  Alternative,
  DecisionOutcome,
  Reflection,
  ImprovementSuggestion,
  ReflectionQuery,
  DecisionStats,
};

export class DecisionReflector {
  private decisions: Map<string, Decision> = new Map();
  private reflections: Map<string, Reflection> = new Map();
  private taskDecisions: Map<string, string[]> = new Map();

  async recordDecision(
    taskId: string,
    description: string,
    context: Record<string, any>,
    alternatives: Alternative[],
    chosenAlternativeId: string,
    rationale: string,
    confidence: number
  ): Promise<string> {
    const decision: Decision = {
      id: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      description,
      context,
      alternatives,
      chosenAlternative: chosenAlternativeId,
      rationale,
      confidence: Math.min(1, Math.max(0, confidence)),
      timestamp: new Date()
    };

    this.decisions.set(decision.id, decision);

    if (!this.taskDecisions.has(taskId)) {
      this.taskDecisions.set(taskId, []);
    }
    this.taskDecisions.get(taskId)!.push(decision.id);

    return decision.id;
  }

  async recordOutcome(decisionId: string, outcome: Omit<DecisionOutcome, 'timestamp'>): Promise<void> {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    decision.outcome = {
      ...outcome,
      timestamp: new Date()
    };
  }

  async reflectOnTask(
    taskId: string,
    taskDescription: string,
    executionSummary: string
  ): Promise<Reflection> {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    const taskDecisions = decisionIds
      .map(id => this.decisions.get(id))
      .filter((d): d is Decision => d !== undefined);

    const { successes, failures, improvements } = this.analyzeDecisions(taskDecisions);

    const overallRating = this.calculateOverallRating(taskDecisions, successes, failures);

    const reflection: Reflection = {
      id: `reflection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      taskDescription,
      executionSummary,
      decisions: taskDecisions,
      successes,
      failures,
      improvements,
      overallRating,
      timestamp: new Date()
    };

    this.reflections.set(reflection.id, reflection);

    return reflection;
  }

  private analyzeDecisions(decisions: Decision[]): {
    successes: string[];
    failures: string[];
    improvements: ImprovementSuggestion[];
  } {
    const successes: string[] = [];
    const failures: string[] = [];
    const improvements: ImprovementSuggestion[] = [];

    for (const decision of decisions) {
      if (decision.outcome) {
        if (decision.outcome.success) {
          successes.push(`成功: ${decision.description}`);
        } else {
          failures.push(`失败: ${decision.description} - ${decision.outcome.gapAnalysis}`);

          improvements.push({
            id: `imp-${decision.id}`,
            category: this.inferCategory(decision),
            priority: decision.outcome.success ? 'low' : 'high',
            description: `决策 "${decision.description}" 未达到预期结果`,
            recommendation: this.generateRecommendation(decision),
            estimatedImpact: this.estimateImpact(decision)
          });
        }
      }
    }

    return { successes, failures, improvements };
  }

  private inferCategory(decision: Decision): ImprovementSuggestion['category'] {
    const keywords = decision.description.toLowerCase();

    if (keywords.includes('tool') || keywords.includes('工具')) return 'tool';
    if (keywords.includes('skill') || keywords.includes('技能')) return 'skill';
    if (keywords.includes('workflow') || keywords.includes('流程')) return 'workflow';
    if (keywords.includes('process') || keywords.includes('过程')) return 'process';

    return 'other';
  }

  private generateRecommendation(decision: Decision): string {
    if (!decision.outcome) {
      return '监控决策执行结果以评估有效性';
    }

    const issues: string[] = [];

    if (decision.confidence < 0.7) {
      issues.push('提高决策前的信息收集质量');
    }

    if (decision.alternatives.length < 3) {
      issues.push('考虑更多备选方案');
    }

    if (decision.outcome.gapAnalysis) {
      issues.push(`解决: ${decision.outcome.gapAnalysis}`);
    }

    if (issues.length === 0) {
      return '决策执行良好，保持当前流程';
    }

    return `建议改进: ${issues.join('; ')}`;
  }

  private estimateImpact(decision: Decision): number {
    if (!decision.outcome) return 0.5;

    const confidenceFactor = decision.confidence;
    const outcomeFactor = decision.outcome.success ? 0.3 : 0.7;
    const gapSeverity = decision.outcome.gapAnalysis.length > 50 ? 0.2 : 0;

    return Math.min(1, confidenceFactor * outcomeFactor + gapSeverity);
  }

  private calculateOverallRating(
    decisions: Decision[],
    successes: string[],
    failures: string[]
  ): number {
    if (decisions.length === 0) return 0;

    const avgConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
    const successRatio = successes.length / (successes.length + failures.length || 1);
    const outcomeScore = decisions.reduce((sum, d) => {
      return sum + (d.outcome?.success ? 1 : 0.5);
    }, 0) / decisions.length;

    return Math.round(((avgConfidence * 0.3) + (successRatio * 0.4) + (outcomeScore * 0.3)) * 10) / 10;
  }

  async getReflection(reflectionId: string): Promise<Reflection | undefined> {
    return this.reflections.get(reflectionId);
  }

  async getReflections(query?: ReflectionQuery): Promise<Reflection[]> {
    let results = Array.from(this.reflections.values());

    if (query?.taskId) {
      results = results.filter(r => r.taskId === query.taskId);
    }

    if (query?.dateRange && query.dateRange.start && query.dateRange.end) {
      results = results.filter(r =>
        r.timestamp >= query.dateRange!.start &&
        r.timestamp <= query.dateRange!.end
      );
    }

    if (query?.successThreshold !== undefined) {
      results = results.filter(r => r.overallRating >= query.successThreshold!);
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getDecision(decisionId: string): Promise<Decision | undefined> {
    return this.decisions.get(decisionId);
  }

  async getDecisionsByTask(taskId: string): Promise<Decision[]> {
    const decisionIds = this.taskDecisions.get(taskId) || [];
    return decisionIds
      .map(id => this.decisions.get(id))
      .filter((d): d is Decision => d !== undefined);
  }

  async getStats(): Promise<DecisionStats> {
    const decisions = Array.from(this.decisions.values());
    const completed = decisions.filter(d => d.outcome !== undefined);
    const successful = completed.filter(d => d.outcome!.success);

    const categoryCounts: Record<string, number> = {};
    for (const decision of decisions) {
      const category = this.inferCategory(decision);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }

    const mostCommonCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    const improvementOpportunities = decisions.filter(d =>
      d.outcome?.success === false || d.confidence < 0.7
    ).length;

    return {
      totalDecisions: decisions.length,
      avgConfidence: decisions.length > 0
        ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
        : 0,
      successRate: completed.length > 0 ? successful.length / completed.length : 0,
      mostCommonCategories,
      improvementOpportunities
    };
  }

  async generateImprovementReport(): Promise<string> {
    const stats = await this.getStats();
    const reflections = await this.getReflections();

    const highPriorityImprovements: ImprovementSuggestion[] = [];
    for (const reflection of reflections) {
      highPriorityImprovements.push(
        ...reflection.improvements.filter(i => i.priority === 'high')
      );
    }

    highPriorityImprovements.sort((a, b) => b.estimatedImpact - a.estimatedImpact);

    let report = `# 决策改进报告\n\n`;
    report += `## 概览统计\n\n`;
    report += `- 总决策数: ${stats.totalDecisions}\n`;
    report += `- 平均置信度: ${stats.avgConfidence.toFixed(2)}\n`;
    report += `- 成功率: ${(stats.successRate * 100).toFixed(1)}%\n`;
    report += `- 改进机会: ${stats.improvementOpportunities}\n\n`;

    report += `## 高频决策类别\n\n`;
    for (const cat of stats.mostCommonCategories) {
      report += `- ${cat}\n`;
    }

    report += `\n## 高优先级改进建议\n\n`;
    for (const improvement of highPriorityImprovements.slice(0, 5)) {
      report += `### ${improvement.description}\n`;
      report += `- 类别: ${improvement.category}\n`;
      report += `- 建议: ${improvement.recommendation}\n`;
      report += `- 预估影响: ${(improvement.estimatedImpact * 100).toFixed(0)}%\n\n`;
    }

    return report;
  }

  async learnFromExperience(taskId: string): Promise<string[]> {
    const decisions = await this.getDecisionsByTask(taskId);
    const lessons: string[] = [];

    for (const decision of decisions) {
      if (decision.outcome) {
        if (decision.outcome.success) {
          lessons.push(`✅ 成功经验: ${decision.rationale}`);
        } else {
          lessons.push(`❌ 改进方向: ${decision.outcome.lessonsLearned.join('; ')}`);
        }
      }
    }

    return lessons;
  }

  async clear(): Promise<void> {
    this.decisions.clear();
    this.reflections.clear();
    this.taskDecisions.clear();
  }
}

export const decisionReflector = new DecisionReflector();
