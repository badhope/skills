export function formatError(message: string, error?: any): Record<string, any> {
  return {
    success: false,
    error: message,
    details: error?.message || String(error || '')
  };
}

export function formatSuccess(data: any): Record<string, any> {
  return {
    success: true,
    ...data
  };
}

export interface ValidationSchema {
  type: string;
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  enum?: string[];
  pattern?: RegExp | string;
  match?: RegExp | string;
}

export function validateParams<T extends Record<string, any>>(
  params: Record<string, any>,
  schema: Record<string, ValidationSchema>
): { valid: boolean; errors: string[]; data: T } {
  const errors: string[] = [];
  const data: Record<string, any> = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = params[key];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required parameter: ${key}`);
      continue;
    }

    if (value !== undefined && value !== null && value !== '') {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`Parameter ${key} should be ${rules.type}, got ${actualType}`);
        continue;
      }

      if (rules.type === 'number' && typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`Parameter ${key} must be >= ${rules.min}`);
          continue;
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`Parameter ${key} must be <= ${rules.max}`);
          continue;
        }
      }

      if (rules.type === 'string' && rules.enum && !rules.enum.includes(value)) {
        errors.push(`Parameter ${key} must be one of: ${rules.enum.join(', ')}`);
        continue;
      }

      data[key] = value;
    } else if (rules.default !== undefined) {
      data[key] = rules.default;
    }
  }

  return { valid: errors.length === 0, errors, data: data as T };
}
