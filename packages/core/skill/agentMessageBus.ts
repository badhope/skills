export interface Message {
  id: string;
  senderId: string;
  recipientId: string | 'broadcast';
  type: string;
  content: Record<string, any>;
  timestamp: number;
  metadata?: Record<string, any>;
  replyTo?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface MessageHandler {
  messageType: string;
  handler: (message: Message) => Promise<void>;
  filter?: (message: Message) => boolean;
}

export interface AgentSubscription {
  agentId: string;
  messageTypes: string[];
  handler: (message: Message) => Promise<void>;
}

export interface MessageBusStats {
  messagesProcessed: number;
  messagesReceived: number;
  messagesSent: number;
  activeAgents: number;
  subscriptions: number;
  errors: number;
}

export interface AgentStatus {
  agentId: string;
  status: 'online' | 'offline' | 'busy' | 'idle';
  lastHeartbeat: number;
  capabilities: string[];
  load: number;
}

export class AgentMessageBus {
  private subscriptions: Map<string, AgentSubscription[]> = new Map();
  private agents: Map<string, AgentStatus> = new Map();
  private messageQueue: Message[] = [];
  private processingQueue: boolean = false;
  private stats: MessageBusStats = {
    messagesProcessed: 0,
    messagesReceived: 0,
    messagesSent: 0,
    activeAgents: 0,
    subscriptions: 0,
    errors: 0
  };

  constructor(private maxQueueSize: number = 1000) {}

  registerAgent(agentId: string, capabilities: string[]): void {
    this.agents.set(agentId, {
      agentId,
      status: 'online',
      lastHeartbeat: Date.now(),
      capabilities,
      load: 0
    });
    this.stats.activeAgents = this.agents.size;
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.stats.activeAgents = this.agents.size;
    
    this.subscriptions.forEach((subs, _) => {
      this.subscriptions.set(
        _, 
        subs.filter(s => s.agentId !== agentId)
      );
    });
  }

  updateAgentStatus(agentId: string, status: AgentStatus['status']): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastHeartbeat = Date.now();
    }
  }

  updateAgentLoad(agentId: string, load: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.load = Math.min(100, Math.max(0, load));
    }
  }

  subscribe(agentId: string, messageTypes: string[], handler: (message: Message) => Promise<void>): void {
    for (const type of messageTypes) {
      if (!this.subscriptions.has(type)) {
        this.subscriptions.set(type, []);
      }
      
      const existing = this.subscriptions.get(type)?.find(s => s.agentId === agentId);
      if (!existing) {
        this.subscriptions.get(type)?.push({ agentId, messageTypes, handler });
        this.stats.subscriptions++;
      }
    }
  }

  unsubscribe(agentId: string, messageTypes?: string[]): void {
    if (messageTypes) {
      for (const type of messageTypes) {
        this.subscriptions.set(
          type,
          this.subscriptions.get(type)?.filter(s => s.agentId !== agentId) || []
        );
      }
    } else {
      this.subscriptions.forEach((subs, type) => {
        this.subscriptions.set(
          type,
          subs.filter(s => s.agentId !== agentId)
        );
      });
    }
  }

  async send(message: Message): Promise<void> {
    this.stats.messagesReceived++;
    
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift();
    }
    
    this.messageQueue.push(message);
    
    await this.processQueue();
  }

  async broadcast(message: Omit<Message, 'recipientId'>): Promise<void> {
    const broadcastMessage: Message = {
      ...message,
      recipientId: 'broadcast'
    };
    await this.send(broadcastMessage);
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    
    this.processingQueue = true;
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (!message) continue;
      
      try {
        await this.deliverMessage(message);
        this.stats.messagesProcessed++;
      } catch (error) {
        this.stats.errors++;
        console.error(`Failed to process message ${message.id}:`, error);
      }
    }
    
    this.processingQueue = false;
  }

  private async deliverMessage(message: Message): Promise<void> {
    const subscribers = this.subscriptions.get(message.type) || [];
    
    for (const subscriber of subscribers) {
      const agent = this.agents.get(subscriber.agentId);
      
      if (!agent || agent.status === 'offline') continue;
      
      if (message.recipientId === 'broadcast' || message.recipientId === subscriber.agentId) {
        try {
          await subscriber.handler(message);
          this.stats.messagesSent++;
        } catch (error) {
          this.stats.errors++;
        }
      }
    }
  }

  async request(
    senderId: string,
    recipientId: string,
    type: string,
    content: Record<string, any>,
    timeout: number = 5000
  ): Promise<Message | null> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.unsubscribe(senderId, [`response-${requestId}`]);
        resolve(null);
      }, timeout);

      const responseHandler = async (response: Message) => {
        clearTimeout(timeoutId);
        this.unsubscribe(senderId, [`response-${requestId}`]);
        resolve(response);
      };

      this.subscribe(senderId, [`response-${requestId}`], responseHandler);

      this.send({
        id: requestId,
        senderId,
        recipientId,
        type,
        content,
        timestamp: Date.now(),
        priority: 'medium'
      });
    });
  }

  async publishEvent(eventType: string, data: Record<string, any>): Promise<void> {
    await this.broadcast({
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId: 'system',
      type: `event.${eventType}`,
      content: data,
      timestamp: Date.now(),
      priority: 'low'
    });
  }

  getAgentStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId);
  }

  getAgentsByCapability(capability: string): string[] {
    const matching: string[] = [];
    this.agents.forEach((status, id) => {
      if (status.capabilities.includes(capability) && status.status === 'online') {
        matching.push(id);
      }
    });
    return matching;
  }

  getAvailableAgents(): AgentStatus[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'online');
  }

  getStats(): MessageBusStats {
    return { ...this.stats };
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  clearQueue(): void {
    this.messageQueue = [];
  }

  createMessage(
    senderId: string,
    recipientId: string | 'broadcast',
    type: string,
    content: Record<string, any>,
    priority: Message['priority'] = 'medium',
    replyTo?: string,
    metadata?: Record<string, any>
  ): Message {
    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      recipientId,
      type,
      content,
      timestamp: Date.now(),
      priority,
      replyTo,
      metadata
    };
  }
}

export const globalMessageBus = new AgentMessageBus();

export default AgentMessageBus;
