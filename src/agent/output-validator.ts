/**
 * AI 输出验证模块
 *
 * 提供结构化的输出验证机制，确保 AI 生成的内容符合预期格式和质量标准。
 * 支持代码、JSON、Markdown 和纯文本等多种输出类型的验证。
 */

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 改进建议列表（可选） */
  suggestions?: string[];
}

/**
 * 输出模式定义接口
 */
export interface OutputSchema {
  /** 输出内容类型 */
  type: 'code' | 'json' | 'markdown' | 'text';
  /** 必须包含的内容列表 */
  required?: string[];
  /** 必须匹配的正则表达式模式 */
  patterns?: RegExp[];
  /** 禁止匹配的正则表达式模式 */
  forbidden?: RegExp[];
  /** 最大长度限制 */
  maxLength?: number;
}

/**
 * 输出验证器类
 *
 * 管理多个验证模式，并根据模式验证 AI 输出内容。
 */
export class OutputValidator {
  private schemas: Map<string, OutputSchema> = new Map();

  /**
   * 注册验证模式
   * @param intent - 意图标识符
   * @param schema - 验证模式定义
   */
  registerSchema(intent: string, schema: OutputSchema): void {
    this.schemas.set(intent, schema);
  }

  /**
   * 验证输出内容
   * @param output - 要验证的输出内容
   * @param intent - 意图标识符，用于选择对应的验证模式
   * @returns 验证结果
   */
  validate(output: string, intent: string): ValidationResult {
    const schema = this.schemas.get(intent);
    if (!schema) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];
    const suggestions: string[] = [];

    // 1. 长度检查
    if (schema.maxLength && output.length > schema.maxLength) {
      errors.push(`输出过长（${output.length} > ${schema.maxLength}）`);
    }

    // 2. 必需内容检查
    if (schema.required) {
      for (const req of schema.required) {
        if (!output.includes(req)) {
          errors.push(`缺少必需内容: "${req}"`);
        }
      }
    }

    // 3. 必需模式检查
    if (schema.patterns) {
      for (const pattern of schema.patterns) {
        if (!pattern.test(output)) {
          errors.push(`不符合必需格式: ${pattern.source}`);
        }
      }
    }

    // 4. 禁止模式检查
    if (schema.forbidden) {
      for (const pattern of schema.forbidden) {
        if (pattern.test(output)) {
          errors.push(`包含禁止内容: ${pattern.source}`);
        }
      }
    }

    // 5. 类型特定验证
    switch (schema.type) {
      case 'code': {
        const codeValidation = this.validateCode(output);
        errors.push(...codeValidation.errors);
        suggestions.push(...codeValidation.suggestions);
        break;
      }
      case 'json': {
        const jsonValidation = this.validateJSON(output);
        errors.push(...jsonValidation.errors);
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 验证代码内容
   * @param code - 代码字符串
   * @returns 错误和建议列表
   */
  private validateCode(code: string): { errors: string[]; suggestions: string[] } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // 检查未闭合的花括号
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`花括号不匹配（开:${openBraces} 闭:${closeBraces}）`);
    }

    // 检查未闭合的圆括号
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`圆括号不匹配（开:${openParens} 闭:${closeParens}）`);
    }

    // 检查未闭合的方括号
    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push(`方括号不匹配（开:${openBrackets} 闭:${closeBrackets}）`);
    }

    // 检查明显的语法错误模式
    if (/function\s+\d/.test(code)) {
      errors.push('函数名不能以数字开头');
    }

    // 建议
    if (code.includes('console.log') && !code.includes('// TODO')) {
      suggestions.push('建议移除调试用的 console.log');
    }

    if (code.includes('debugger;')) {
      suggestions.push('建议移除 debugger 语句');
    }

    return { errors, suggestions };
  }

  /**
   * 验证 JSON 内容
   * @param json - JSON 字符串
   * @returns 错误列表
   */
  private validateJSON(json: string): { errors: string[] } {
    const errors: string[] = [];
    try {
      JSON.parse(json);
    } catch (e) {
      errors.push(`JSON 解析错误: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { errors };
  }
}

/**
 * 预定义的意图验证模式
 *
 * 为常见意图提供默认的验证规则。
 */
export const DEFAULT_SCHEMAS: Record<string, OutputSchema> = {
  'bug-hunter': {
    type: 'text',
    required: ['问题', '原因', '修复'],
    maxLength: 5000,
  },
  'fullstack': {
    type: 'code',
    patterns: [/function|class|const|let|var|import|export/],
    forbidden: [/eval\s*\(/, /Function\s*\(/],
    maxLength: 10000,
  },
  'code-review': {
    type: 'markdown',
    required: ['审查', '建议'],
    maxLength: 5000,
  },
  'refactor': {
    type: 'code',
    patterns: [/function|class/],
    maxLength: 10000,
  },
  'security': {
    type: 'markdown',
    required: ['漏洞', '风险', '建议'],
    maxLength: 5000,
  },
  'testing': {
    type: 'code',
    patterns: [/describe|it\(|test\(|expect/],
    maxLength: 8000,
  },
};
