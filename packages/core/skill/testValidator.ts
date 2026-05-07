export interface TestCase {
  id: string;
  name: string;
  description: string;
  input: string;
  expectedOutput: string | Record<string, any>;
  intent?: string;
  workflow?: string;
  expectedConfidence?: number;
  maxDuration?: number;
  tags?: string[];
}

export interface TestResult {
  testCase: TestCase;
  passed: boolean;
  actualOutput: any;
  executionTime: number;
  confidence?: number;
  error?: string;
  matchScore?: number;
}

export interface ValidationResult {
  agentId: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  avgExecutionTime: number;
  avgConfidence: number;
  overallScore: number;
  timestamp: Date;
}

export interface ValidationReport {
  agentId: string;
  agentName: string;
  validationResult: ValidationResult;
  summary: string;
  recommendations: string[];
  timestamp: Date;
}

export interface ValidationConfig {
  maxExecutionTime: number;
  confidenceThreshold: number;
  requiredPassRate: number;
  enableParallel: boolean;
  parallelLimit: number;
}

export class TestValidator {
  private config: ValidationConfig;

  constructor(config?: Partial<ValidationConfig>) {
    this.config = {
      maxExecutionTime: 300000,
      confidenceThreshold: 0.7,
      requiredPassRate: 0.8,
      enableParallel: true,
      parallelLimit: 5,
      ...config
    };
  }

  async validateAgent(
    agentId: string,
    agentName: string,
    testCases: TestCase[],
    executor: (input: string) => Promise<any>
  ): Promise<ValidationReport> {
    const results = await this.runTests(testCases, executor);
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed && !r.error).length;
    const skipped = results.filter(r => r.error).length;
    
    const avgExecutionTime = results.length > 0
      ? results.reduce((sum, r) => sum + r.executionTime, 0) / results.length
      : 0;
    
    const avgConfidence = results.filter(r => r.confidence !== undefined).length > 0
      ? results.filter(r => r.confidence !== undefined).reduce((sum, r) => sum + (r.confidence || 0), 0) / 
        results.filter(r => r.confidence !== undefined).length
      : 0;

    const validationResult: ValidationResult = {
      agentId,
      tests: results,
      passed,
      failed,
      skipped,
      avgExecutionTime,
      avgConfidence,
      overallScore: this.calculateOverallScore(results),
      timestamp: new Date()
    };

    return {
      agentId,
      agentName,
      validationResult,
      summary: this.generateSummary(validationResult),
      recommendations: this.generateRecommendations(validationResult, results),
      timestamp: new Date()
    };
  }

  async runTests(
    testCases: TestCase[],
    executor: (input: string) => Promise<any>
  ): Promise<TestResult[]> {
    if (this.config.enableParallel) {
      const batches: TestCase[][] = [];
      for (let i = 0; i < testCases.length; i += this.config.parallelLimit) {
        batches.push(testCases.slice(i, i + this.config.parallelLimit));
      }

      const results: TestResult[] = [];
      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(tc => this.runTest(tc, executor))
        );
        results.push(...batchResults);
      }
      return results;
    }

    return Promise.all(testCases.map(tc => this.runTest(tc, executor)));
  }

  async runTest(testCase: TestCase, executor: (input: string) => Promise<any>): Promise<TestResult> {
    const startTime = Date.now();
    const timeout = testCase.maxDuration || this.config.maxExecutionTime;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const actualOutput = await executor(testCase.input);
      clearTimeout(timeoutId);

      const executionTime = Date.now() - startTime;
      const passed = this.compareOutputs(testCase.expectedOutput, actualOutput);
      const matchScore = this.calculateMatchScore(testCase.expectedOutput, actualOutput);

      return {
        testCase,
        passed,
        actualOutput,
        executionTime,
        matchScore
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        testCase,
        passed: false,
        actualOutput: null,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  compareOutputs(expected: string | Record<string, any>, actual: any): boolean {
    if (typeof expected === 'string') {
      const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual);
      return actualStr.toLowerCase().includes(expected.toLowerCase());
    }

    if (typeof expected === 'object' && typeof actual === 'object') {
      return this.deepCompare(expected, actual);
    }

    return expected === actual;
  }

  deepCompare(obj1: Record<string, any>, obj2: Record<string, any>): boolean {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      
      const val1 = obj1[key];
      const val2 = obj2[key];

      if (typeof val1 === 'object' && typeof val2 === 'object') {
        if (!this.deepCompare(val1, val2)) return false;
      } else if (val1 !== val2) {
        return false;
      }
    }

    return true;
  }

  calculateMatchScore(expected: string | Record<string, any>, actual: any): number {
    if (typeof expected === 'string') {
      const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual);
      const expectedLower = expected.toLowerCase();
      const actualLower = actualStr.toLowerCase();
      
      let matches = 0;
      const expectedWords = expectedLower.split(/\s+/).filter(w => w.length > 3);
      
      for (const word of expectedWords) {
        if (actualLower.includes(word)) matches++;
      }
      
      return expectedWords.length > 0 ? matches / expectedWords.length : 0;
    }

    if (typeof expected === 'object' && typeof actual === 'object') {
      const expectedKeys = Object.keys(expected);
      let matches = 0;
      
      for (const key of expectedKeys) {
        if (key in actual) matches++;
      }
      
      return expectedKeys.length > 0 ? matches / expectedKeys.length : 0;
    }

    return expected === actual ? 1 : 0;
  }

  calculateOverallScore(results: TestResult[]): number {
    if (results.length === 0) return 0;

    const passedWeight = 0.5;
    const confidenceWeight = 0.3;
    const timeWeight = 0.2;

    const passRate = results.filter(r => r.passed).length / results.length;
    
    const avgConfidence = results.filter(r => r.confidence !== undefined).length > 0
      ? results.filter(r => r.confidence !== undefined).reduce((sum, r) => sum + (r.confidence || 0), 0) / 
        results.filter(r => r.confidence !== undefined).length
      : 0.5;

    const avgMatchScore = results.reduce((sum, r) => sum + (r.matchScore || 0), 0) / results.length;

    return Math.round(
      ((passRate * passedWeight) + (avgConfidence * confidenceWeight) + (avgMatchScore * timeWeight)) * 100
    ) / 100;
  }

  generateSummary(result: ValidationResult): string {
    const passRate = result.passed / (result.passed + result.failed);
    const status = passRate >= this.config.requiredPassRate ? 'PASS' : 'FAIL';
    
    return `Validation ${status}: ${result.passed}/${result.passed + result.failed} tests passed (${(passRate * 100).toFixed(1)}%)`;
  }

  generateRecommendations(result: ValidationResult, testResults: TestResult[]): string[] {
    const recommendations: string[] = [];

    const passRate = result.passed / (result.passed + result.failed);
    if (passRate < this.config.requiredPassRate) {
      recommendations.push(`提高测试通过率，当前 ${(passRate * 100).toFixed(1)}%，目标 ${(this.config.requiredPassRate * 100).toFixed(1)}%`);
    }

    if (result.avgConfidence < this.config.confidenceThreshold) {
      recommendations.push(`提高决策置信度，当前 ${(result.avgConfidence * 100).toFixed(1)}%，目标 ${(this.config.confidenceThreshold * 100).toFixed(1)}%`);
    }

    const slowTests = testResults.filter(r => r.executionTime > this.config.maxExecutionTime * 0.8);
    if (slowTests.length > 0) {
      recommendations.push(`${slowTests.length} 个测试用例执行较慢，建议优化性能`);
    }

    const failedTests = testResults.filter(r => !r.passed && !r.error);
    if (failedTests.length > 0) {
      recommendations.push(`${failedTests.length} 个测试用例失败，建议检查预期输出与实际输出的匹配`);
    }

    const erroredTests = testResults.filter(r => r.error);
    if (erroredTests.length > 0) {
      recommendations.push(`${erroredTests.length} 个测试用例出错，建议检查异常处理`);
    }

    return recommendations.length > 0 ? recommendations : ['验证通过，无需改进建议'];
  }

  generateValidationReport(report: ValidationReport): string {
    let output = `# 智能体验证报告\n\n`;
    output += `## 智能体信息\n\n`;
    output += `- ID: ${report.agentId}\n`;
    output += `- 名称: ${report.agentName}\n`;
    output += `- 验证时间: ${report.timestamp.toLocaleString()}\n\n`;

    output += `## 验证结果\n\n`;
    output += `- ${report.summary}\n`;
    output += `- 通过: ${report.validationResult.passed}\n`;
    output += `- 失败: ${report.validationResult.failed}\n`;
    output += `- 跳过: ${report.validationResult.skipped}\n`;
    output += `- 平均执行时间: ${report.validationResult.avgExecutionTime.toFixed(0)}ms\n`;
    output += `- 平均置信度: ${(report.validationResult.avgConfidence * 100).toFixed(1)}%\n`;
    output += `- 综合评分: ${(report.validationResult.overallScore * 100).toFixed(1)}%\n\n`;

    output += `## 改进建议\n\n`;
    for (const rec of report.recommendations) {
      output += `- ${rec}\n`;
    }

    output += `\n## 测试详情\n\n`;
    for (const result of report.validationResult.tests) {
      const status = result.passed ? '✅' : result.error ? '⚠️' : '❌';
      output += `${status} ${result.testCase.name}\n`;
      output += `   - 状态: ${result.passed ? '通过' : result.error ? '错误' : '失败'}\n`;
      output += `   - 耗时: ${result.executionTime.toFixed(0)}ms\n`;
      if (result.matchScore !== undefined) {
        output += `   - 匹配度: ${(result.matchScore * 100).toFixed(1)}%\n`;
      }
      if (result.error) {
        output += `   - 错误: ${result.error}\n`;
      }
    }

    return output;
  }

  validateAgentFolder(folderPath: string): Promise<{ valid: boolean; issues: string[] }> {
    return this.validateFolderStructure(folderPath);
  }

  private async validateFolderStructure(folderPath: string): Promise<{ valid: boolean; issues: string[] }> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const issues: string[] = [];

    const requiredFiles = [
      'agent.yaml',
      'system-prompt.md',
      'workflow/intent.yaml',
      'workflow/stages.yaml',
      'workflow/tools.yaml'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(folderPath, file);
      try {
        await fs.access(filePath);
      } catch {
        issues.push(`缺失必需文件: ${file}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  setConfig(config: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ValidationConfig {
    return { ...this.config };
  }
}

export const testValidator = new TestValidator();

export default TestValidator;
