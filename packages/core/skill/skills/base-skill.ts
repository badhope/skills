import { MessageBus, Message } from '../agentMessageBus';

export interface SkillContext {
  taskId: string;
  userInput: string;
  tools: string[];
  memory?: any;
  metadata?: Record<string, any>;
}

export interface SkillResult {
  success: boolean;
  outputs: any[];
  confidence: number;
  nextSkills?: string[];
  errors?: string[];
}

export abstract class BaseSkill {
  abstract readonly skillId: string;
  abstract readonly skillName: string;
  abstract readonly description: string;
  abstract readonly requiredTools: string[];
  abstract readonly recommendedTools: string[];

  protected messageBus: MessageBus;

  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }

  abstract execute(context: SkillContext): Promise<SkillResult>;

  async canExecute(context: SkillContext): Promise<boolean> {
    const availableTools = context.tools || [];
    const hasAllRequired = this.requiredTools.every(tool =>
      availableTools.includes(tool)
    );
    return hasAllRequired;
  }

  async sendMessage(message: Omit<Message, 'id' | 'timestamp'>): Promise<void> {
    await this.messageBus.send({
      id: `${this.skillId}-${Date.now()}`,
      timestamp: Date.now(),
      priority: 'medium',
      ...message
    });
  }

  log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.skillId}] [${level.toUpperCase()}] ${message}`);
  }
}
