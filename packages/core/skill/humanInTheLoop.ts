import { TaskContext, WorkflowStep, TaskResult } from './types';

export interface ConfirmationRequest {
  id: string;
  taskId: string;
  type: ConfirmationType;
  message: string;
  options: ConfirmationOption[];
  timeout: number;
  timestamp: Date;
  context: Record<string, any>;
}

export type ConfirmationType = 
  | 'tool_execution'
  | 'skill_invocation'
  | 'parameter_change'
  | 'critical_action'
  | 'branch_decision'
  | 'retry_confirmation'
  | 'resource_allocation';

export interface ConfirmationOption {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
}

export interface ConfirmationResponse {
  requestId: string;
  optionId: string;
  timestamp: Date;
  confirmedBy?: string;
}

export interface PendingRequest {
  request: ConfirmationRequest;
  resolve: (response: ConfirmationResponse) => void;
  reject: (error: Error) => void;
}

export class HumanInTheLoopManager {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestIdCounter = 0;
  private defaultTimeout = 300000;

  requestConfirmation(
    taskId: string,
    type: ConfirmationType,
    message: string,
    options: ConfirmationOption[],
    context?: Record<string, any>,
    timeout?: number
  ): Promise<ConfirmationResponse> {
    return new Promise((resolve, reject) => {
      const requestId = `confirm-${Date.now()}-${++this.requestIdCounter}`;
      
      const request: ConfirmationRequest = {
        id: requestId,
        taskId,
        type,
        message,
        options: options.length > 0 ? options : [
          { id: 'confirm', label: '确认', isDefault: true },
          { id: 'cancel', label: '取消' }
        ],
        timeout: timeout || this.defaultTimeout,
        timestamp: new Date(),
        context: context || {}
      };

      const pending: PendingRequest = {
        request,
        resolve,
        reject
      };

      this.pendingRequests.set(requestId, pending);

      setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          pending.reject(new Error('Confirmation timeout'));
        }
      }, request.timeout);

      this.notifyListeners(request);
    });
  }

  provideResponse(requestId: string, optionId: string, confirmedBy?: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    
    if (!pending) {
      return false;
    }

    const response: ConfirmationResponse = {
      requestId,
      optionId,
      timestamp: new Date(),
      confirmedBy
    };

    this.pendingRequests.delete(requestId);
    pending.resolve(response);
    
    return true;
  }

  cancelRequest(requestId: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    
    if (!pending) {
      return false;
    }

    this.pendingRequests.delete(requestId);
    pending.reject(new Error('Request cancelled'));
    
    return true;
  }

  getPendingRequests(taskId?: string): ConfirmationRequest[] {
    const requests = Array.from(this.pendingRequests.values()).map(p => p.request);
    
    if (taskId) {
      return requests.filter(r => r.taskId === taskId);
    }
    
    return requests;
  }

  getPendingRequest(requestId: string): ConfirmationRequest | undefined {
    const pending = this.pendingRequests.get(requestId);
    return pending?.request;
  }

  async confirmToolExecution(
    taskId: string,
    toolName: string,
    parameters: Record<string, any>,
    context?: Record<string, any>
  ): Promise<boolean> {
    const message = `即将执行工具 "${toolName}"，参数：\n${JSON.stringify(parameters, null, 2)}`;
    
    const response = await this.requestConfirmation(
      taskId,
      'tool_execution',
      message,
      [
        { id: 'confirm', label: '执行', isDefault: true },
        { id: 'cancel', label: '取消' },
        { id: 'review', label: '查看详情' }
      ],
      { toolName, parameters, ...context },
      120000
    );

    return response.optionId === 'confirm';
  }

  async confirmSkillInvocation(
    taskId: string,
    skillName: string,
    parameters: Record<string, any>,
    context?: Record<string, any>
  ): Promise<boolean> {
    const message = `即将调用技能 "${skillName}"，参数：\n${JSON.stringify(parameters, null, 2)}`;
    
    const response = await this.requestConfirmation(
      taskId,
      'skill_invocation',
      message,
      [
        { id: 'confirm', label: '调用', isDefault: true },
        { id: 'cancel', label: '取消' }
      ],
      { skillName, parameters, ...context },
      60000
    );

    return response.optionId === 'confirm';
  }

  async confirmCriticalAction(
    taskId: string,
    action: string,
    description: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    const message = `⚠️ 关键操作确认：${action}\n\n${description}`;
    
    const response = await this.requestConfirmation(
      taskId,
      'critical_action',
      message,
      [
        { id: 'confirm', label: '确认执行', isDefault: false },
        { id: 'cancel', label: '取消', isDefault: true },
        { id: 'delay', label: '延迟执行' }
      ],
      { action, description, ...context },
      180000
    );

    return response.optionId === 'confirm';
  }

  async confirmBranchDecision(
    taskId: string,
    question: string,
    options: string[],
    context?: Record<string, any>
  ): Promise<string> {
    const message = `请选择分支路径：\n${question}`;
    
    const confirmationOptions = options.map((opt, index) => ({
      id: `option-${index}`,
      label: opt,
      isDefault: index === 0
    }));

    const response = await this.requestConfirmation(
      taskId,
      'branch_decision',
      message,
      confirmationOptions,
      { question, options, ...context },
      120000
    );

    const selectedIndex = parseInt(response.optionId.replace('option-', ''));
    return options[selectedIndex] || options[0];
  }

  private notifyListeners(request: ConfirmationRequest): void {
    console.log(`[HITL] New confirmation request: ${request.id} - ${request.type}`);
  }

  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }
}

export const globalHumanInTheLoopManager = new HumanInTheLoopManager();