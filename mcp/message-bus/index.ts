import crypto from 'crypto';

interface Message {
  id: string;
  topic: string;
  payload: any;
  sender: string;
  timestamp: number;
  priority: 'high' | 'medium' | 'low';
  expiresAt?: number;
}

interface Subscription {
  id: string;
  topic: string;
  handler: (message: Message) => void;
  filter?: (message: Message) => boolean;
}

class MessageBus {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private messageQueue: Message[] = [];
  private isProcessing = false;

  subscribe(topic: string, handler: (message: Message) => void, filter?: (message: Message) => boolean): string {
    const subscriptionId = `${topic}-${Date.now()}-${crypto.randomUUID()}`;
    
    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler,
      filter
    };

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    this.subscriptions.get(topic)?.push(subscription);

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): boolean {
    for (const [topic, subs] of this.subscriptions) {
      const index = subs.findIndex(s => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  publish(message: Omit<Message, 'id' | 'timestamp'>): string {
    const messageId = `${message.topic}-${Date.now()}-${crypto.randomUUID()}`;
    
    const fullMessage: Message = {
      ...message,
      id: messageId,
      timestamp: Date.now()
    };

    this.messageQueue.push(fullMessage);
    this.processQueue();

    return messageId;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const sorted = this.messageQueue.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const message = sorted.shift();
      if (!message) continue;

      if (message.expiresAt && message.expiresAt < Date.now()) {
        continue;
      }

      await this.dispatchMessage(message);
    }

    this.isProcessing = false;
  }

  private async dispatchMessage(message: Message): Promise<void> {
    const topicSubscriptions = this.subscriptions.get(message.topic) || [];
    
    for (const subscription of topicSubscriptions) {
      if (subscription.filter && !subscription.filter(message)) {
        continue;
      }
      
      try {
        subscription.handler(message);
      } catch (error) {
        console.error(`Error handling message ${message.id} for subscription ${subscription.id}:`, error);
      }
    }

    const wildcardSubscriptions = this.subscriptions.get('*') || [];
    for (const subscription of wildcardSubscriptions) {
      if (subscription.filter && !subscription.filter(message)) {
        continue;
      }
      
      try {
        subscription.handler(message);
      } catch (error) {
        console.error(`Error handling message ${message.id} for wildcard subscription ${subscription.id}:`, error);
      }
    }
  }

  getTopics(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  getSubscriptionCount(): number {
    return Array.from(this.subscriptions.values()).reduce((sum, subs) => sum + subs.length, 0);
  }

  clearQueue(): void {
    this.messageQueue = [];
  }
}

const messageBus = new MessageBus();

interface AgentState {
  agentId: string;
  state: Record<string, any>;
  timestamp: number;
  version: number;
}

class StateSyncManager {
  private states: Map<string, AgentState> = new Map();
  private stateHistory: Map<string, AgentState[]> = new Map();
  private maxHistorySize = 10;

  updateState(agentId: string, state: Record<string, any>): AgentState {
    const existing = this.states.get(agentId);
    const version = (existing?.version || 0) + 1;

    const newState: AgentState = {
      agentId,
      state,
      timestamp: Date.now(),
      version
    };

    this.states.set(agentId, newState);

    const history = this.stateHistory.get(agentId) || [];
    history.push(newState);
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    this.stateHistory.set(agentId, history);

    messageBus.publish({
      topic: `agent.${agentId}.stateChanged`,
      payload: newState,
      sender: 'state-manager',
      priority: 'high'
    });

    return newState;
  }

  getState(agentId: string): AgentState | undefined {
    return this.states.get(agentId);
  }

  getStateHistory(agentId: string): AgentState[] {
    return this.stateHistory.get(agentId) || [];
  }

  compareStates(agentId1: string, agentId2: string): { diff?: Record<string, any>; conflicts?: string[] } {
    const state1 = this.states.get(agentId1);
    const state2 = this.states.get(agentId2);

    if (!state1 || !state2) {
      return { conflicts: ['One or both agents not found'] };
    }

    const conflicts: string[] = [];
    const diff: Record<string, any> = {};

    const keys = new Set([...Object.keys(state1.state), ...Object.keys(state2.state)]);
    
    for (const key of keys) {
      const val1 = state1.state[key];
      const val2 = state2.state[key];
      
      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        diff[key] = { agent1: val1, agent2: val2 };
        if (key === 'taskStatus' || key === 'currentStep') {
          conflicts.push(`Conflict in ${key}: ${val1} vs ${val2}`);
        }
      }
    }

    return { diff, conflicts: conflicts.length > 0 ? conflicts : undefined };
  }

  resolveConflict(agentId1: string, agentId2: string, resolution: Record<string, any>): AgentState {
    const state1 = this.states.get(agentId1);
    const state2 = this.states.get(agentId2);

    if (!state1 || !state2) {
      throw new Error('One or both agents not found');
    }

    const mergedState = { ...state1.state, ...state2.state, ...resolution };

    return this.updateState(agentId1, mergedState);
  }
}

const stateSyncManager = new StateSyncManager();

export const tools = {
  subscribe: {
    description: '订阅消息主题',
    parameters: {
      topic: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const handler = (msg: Message) => {
        console.log(`Received message on ${params.topic}:`, msg);
      };
      const subscriptionId = messageBus.subscribe(params.topic, handler);
      return { success: true, subscriptionId };
    }
  },

  publish: {
    description: '发布消息到主题',
    parameters: {
      topic: { type: 'string', required: true },
      payload: { type: 'object', required: true },
      sender: { type: 'string', required: true },
      priority: { type: 'string', required: false, default: 'medium' }
    },
    execute: async (params: Record<string, any>) => {
      const messageId = messageBus.publish({
        topic: params.topic,
        payload: params.payload,
        sender: params.sender,
        priority: params.priority as 'high' | 'medium' | 'low' || 'medium'
      });
      return { success: true, messageId };
    }
  },

  unsubscribe: {
    description: '取消订阅',
    parameters: {
      subscriptionId: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const success = messageBus.unsubscribe(params.subscriptionId);
      return { success };
    }
  },

  get_topics: {
    description: '获取所有主题',
    parameters: {},
    execute: async () => {
      return { success: true, topics: messageBus.getTopics() };
    }
  },

  get_subscription_count: {
    description: '获取订阅数量',
    parameters: {},
    execute: async () => {
      return { success: true, count: messageBus.getSubscriptionCount() };
    }
  },

  update_agent_state: {
    description: '更新智能体状态',
    parameters: {
      agentId: { type: 'string', required: true },
      state: { type: 'object', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const newState = stateSyncManager.updateState(params.agentId, params.state);
      return { success: true, state: newState };
    }
  },

  get_agent_state: {
    description: '获取智能体状态',
    parameters: {
      agentId: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const state = stateSyncManager.getState(params.agentId);
      return { success: true, state };
    }
  },

  compare_agent_states: {
    description: '比较两个智能体状态',
    parameters: {
      agentId1: { type: 'string', required: true },
      agentId2: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const result = stateSyncManager.compareStates(params.agentId1, params.agentId2);
      return { success: true, ...result };
    }
  },

  resolve_conflict: {
    description: '解决智能体状态冲突',
    parameters: {
      agentId1: { type: 'string', required: true },
      agentId2: { type: 'string', required: true },
      resolution: { type: 'object', required: true }
    },
    execute: async (params: Record<string, any>) => {
      try {
        const resolved = stateSyncManager.resolveConflict(params.agentId1, params.agentId2, params.resolution);
        return { success: true, resolvedState: resolved };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  }
};

export const serverId = 'message-bus';
export default { serverId, tools };