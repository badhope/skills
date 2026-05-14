export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

export function fail(error: any): ApiResponse {
  const { code, message, details } = error instanceof Error ? {
    code: 'ERROR', message: error.message, details: undefined
  } : { code: 'ERROR', message: String(error), details: undefined };
  return { success: false, error: { code, message, details }, timestamp: new Date().toISOString() };
}
