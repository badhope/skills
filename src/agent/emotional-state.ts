/**
 * 情绪状态系统模块
 *
 * 使用 XState 状态机管理 Agent 的实时情绪状态。
 * 提供类型安全的状态转换和可预测的行为。
 */

import { setup, createActor, assign, fromPromise } from 'xstate';

// ==================== 类型定义 ====================

export type Emotion = 'focused' | 'confident' | 'cautious' | 'curious' | 'frustrated' | 'excited' | 'tired' | 'neutral';

export interface EmotionalEvent {
  emotion: Emotion;
  intensity: number;
  timestamp: string;
  reason: string;
}

export interface EmotionalState {
  current: Emotion;
  intensity: number;
  history: EmotionalEvent[];
  mood: number;
}

/** 情绪建议接口 */
export interface EmotionSuggestion {
  behavior: string;
  caution: string;
}

// ==================== 情绪配置 ====================

/** 情绪优先级（数值越大优先级越高） */
const EMOTION_PRIORITY: Record<Emotion, number> = {
  frustrated: 8,
  excited: 7,
  tired: 6,
  cautious: 5,
  confident: 4,
  curious: 3,
  focused: 2,
  neutral: 0,
};

/** 情绪描述映射 */
const EMOTION_DESCRIPTION: Record<Emotion, string> = {
  focused: '专注',
  confident: '自信',
  cautious: '谨慎',
  curious: '好奇',
  frustrated: '有些挫败',
  excited: '兴奋',
  tired: '有些疲劳',
  neutral: '平静',
};

/** 情绪对心情的影响 */
const MOOD_DELTA: Record<Emotion, number> = {
  frustrated: -0.25,
  excited: 0.3,
  tired: -0.1,
  cautious: -0.15,
  confident: 0.15,
  curious: 0.1,
  focused: 0.05,
  neutral: 0,
};

// ==================== 状态机事件 ====================

type EmotionalMachineEvent =
  | { type: 'TASK_SUCCESS'; reason: string }
  | { type: 'TASK_FAILURE'; reason: string }
  | { type: 'USER_PRAISE'; reason: string }
  | { type: 'USER_CORRECTION'; reason: string }
  | { type: 'LONG_SESSION' }
  | { type: 'NEW_CHALLENGE'; reason: string }
  | { type: 'DECAY' }
  | { type: 'RESET' };

// ==================== 状态机上下文 ====================

interface MachineContext {
  intensity: number;
  mood: number;
  history: EmotionalEvent[];
  successCount: number;
}

// ==================== 辅助函数 ====================

/** 创建情绪历史记录 */
function createHistoryEntry(emotion: Emotion, intensity: number, reason: string): EmotionalEvent {
  return {
    emotion,
    intensity,
    timestamp: new Date().toISOString(),
    reason,
  };
}

/** 判断是否应该切换情绪 */
function shouldTransition(currentEmotion: Emotion, newEmotion: Emotion, currentIntensity: number, newIntensity: number): boolean {
  const currentPriority = EMOTION_PRIORITY[currentEmotion];
  const newPriority = EMOTION_PRIORITY[newEmotion];
  
  if (newPriority > currentPriority) return true;
  if (newPriority === currentPriority && newIntensity > currentIntensity) return true;
  return false;
}

/** 限制数值在指定范围内 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 安全获取事件原因 */
function getEventReason(event: unknown): string {
  if (event && typeof event === 'object' && 'reason' in event) {
    return (event as { reason: string }).reason;
  }
  return 'unknown';
}

// ==================== 状态机定义 ====================

const emotionalMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as EmotionalMachineEvent,
  },
  actions: {
    /** 记录状态变化日志 */
    logStateChange: (_, params: { emotion: Emotion; reason: string }) => {
      console.debug(`[EmotionalState] -> ${params.emotion}: ${params.reason}`);
    },
  },
  guards: {
    /** 检查是否连续成功达到兴奋阈值 */
    shouldBecomeExcited: ({ context }) => context.successCount >= 3,
    
    /** 检查强度是否过低 */
    isIntensityLow: ({ context }) => context.intensity < 0.15,
  },
}).createMachine({
  id: 'emotional',
  initial: 'neutral',
  context: {
    intensity: 0.3,
    mood: 0,
    history: [],
    successCount: 0,
  },
  states: {
    /** 平静状态 - 默认状态 */
    neutral: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
            { type: 'logStateChange', params: { emotion: 'confident', reason: 'task success' } },
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => clamp(context.mood - 0.25, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
            { type: 'logStateChange', params: { emotion: 'frustrated', reason: 'task failure' } },
          ],
        },
        USER_PRAISE: {
          target: 'excited',
          actions: [
            assign({
              intensity: 0.9,
              mood: ({ context }) => clamp(context.mood + 0.3, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('excited', 0.9, getEventReason(event)),
              ],
            }),
            { type: 'logStateChange', params: { emotion: 'excited', reason: 'user praise' } },
          ],
        },
        USER_CORRECTION: {
          target: 'cautious',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => clamp(context.mood - 0.15, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('cautious', 0.6, getEventReason(event)),
              ],
            }),
            { type: 'logStateChange', params: { emotion: 'cautious', reason: 'user correction' } },
          ],
        },
        LONG_SESSION: {
          target: 'tired',
          actions: [
            assign({
              intensity: 0.5,
              mood: ({ context }) => clamp(context.mood - 0.1, -1, 1),
              history: ({ context }) => [
                ...context.history,
                createHistoryEntry('tired', 0.5, '长时间工作，感到疲劳'),
              ],
            }),
            { type: 'logStateChange', params: { emotion: 'tired', reason: 'long session' } },
          ],
        },
        NEW_CHALLENGE: {
          target: 'curious',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => clamp(context.mood + 0.1, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('curious', 0.6, getEventReason(event)),
              ],
            }),
            { type: 'logStateChange', params: { emotion: 'curious', reason: 'new challenge' } },
          ],
        },
      },
    },

    /** 专注状态 */
    focused: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => clamp(context.mood - 0.25, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [
            assign({
              intensity: 0.1,
            }),
          ],
        },
      },
    },

    /** 自信状态 */
    confident: {
      on: {
        TASK_SUCCESS: [
          {
            guard: 'shouldBecomeExcited',
            target: 'excited',
            actions: [
              assign({
                intensity: 0.8,
                mood: ({ context }) => clamp(context.mood + 0.2, -1, 1),
                successCount: ({ context }) => context.successCount + 1,
                history: ({ context }, event) => [
                  ...context.history,
                  createHistoryEntry('excited', 0.8, `连续多次成功: ${getEventReason(event)}`),
                ],
              }),
            ],
          },
          {
            target: 'confident',
            actions: [
              assign({
                intensity: ({ context }) => Math.min(1.0, context.intensity + 0.1),
                mood: ({ context }) => clamp(context.mood + 0.1, -1, 1),
                successCount: ({ context }) => context.successCount + 1,
                history: ({ context }, event) => [
                  ...context.history,
                  createHistoryEntry('confident', 0.7, getEventReason(event)),
                ],
              }),
            ],
          },
        ],
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => clamp(context.mood - 0.25, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },

    /** 谨慎状态 */
    cautious: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => clamp(context.mood - 0.25, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('frustrated', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },

    /** 好奇状态 */
    curious: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('confident', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'frustrated',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => clamp(context.mood - 0.2, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('frustrated', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        NEW_CHALLENGE: {
          target: 'curious',
          actions: [
            assign({
              intensity: ({ context }) => Math.min(1.0, context.intensity + 0.1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('curious', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },

    /** 挫败状态 */
    frustrated: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => clamp(context.mood + 0.2, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('confident', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        USER_PRAISE: {
          target: 'excited',
          actions: [
            assign({
              intensity: 0.8,
              mood: ({ context }) => clamp(context.mood + 0.3, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('excited', 0.8, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },

    /** 兴奋状态 */
    excited: {
      on: {
        TASK_SUCCESS: {
          target: 'excited',
          actions: [
            assign({
              intensity: ({ context }) => Math.min(1.0, context.intensity + 0.05),
              mood: ({ context }) => clamp(context.mood + 0.1, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('excited', 0.9, getEventReason(event)),
              ],
            }),
          ],
        },
        TASK_FAILURE: {
          target: 'cautious',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => clamp(context.mood - 0.2, -1, 1),
              successCount: 0,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('cautious', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'confident',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.5 })],
        },
      },
    },

    /** 疲劳状态 */
    tired: {
      on: {
        TASK_SUCCESS: {
          target: 'confident',
          actions: [
            assign({
              intensity: 0.6,
              mood: ({ context }) => clamp(context.mood + 0.15, -1, 1),
              successCount: ({ context }) => context.successCount + 1,
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('confident', 0.6, getEventReason(event)),
              ],
            }),
          ],
        },
        USER_PRAISE: {
          target: 'excited',
          actions: [
            assign({
              intensity: 0.7,
              mood: ({ context }) => clamp(context.mood + 0.25, -1, 1),
              history: ({ context }, event) => [
                ...context.history,
                createHistoryEntry('excited', 0.7, getEventReason(event)),
              ],
            }),
          ],
        },
        LONG_SESSION: {
          target: 'tired',
          actions: [
            assign({
              intensity: ({ context }) => Math.min(1.0, context.intensity + 0.1),
              mood: ({ context }) => clamp(context.mood - 0.05, -1, 1),
              history: ({ context }) => [
                ...context.history,
                createHistoryEntry('tired', 0.6, '持续疲劳'),
              ],
            }),
          ],
        },
        DECAY: {
          target: 'neutral',
          guard: 'isIntensityLow',
          actions: [assign({ intensity: 0.1 })],
        },
      },
    },
  },
});

// ==================== EmotionalStateManager ====================

/**
 * 情绪状态管理器
 * 
 * 使用 XState 状态机管理 Agent 的情绪状态。
 * 提供类型安全的状态转换和可预测的行为。
 * 
 * @example
 * ```ts
 * const manager = new EmotionalStateManager();
 * manager.onTaskSuccess('完成了代码重构');
 * console.log(manager.getCurrentEmotion()); // 'confident'
 * ```
 */
export class EmotionalStateManager {
  private actor;

  constructor() {
    this.actor = createActor(emotionalMachine);
    this.actor.start();
  }

  /** 任务成功 → 自信/兴奋 */
  onTaskSuccess(description: string): void {
    this.actor.send({ type: 'TASK_SUCCESS', reason: description });
  }

  /** 任务失败 → 挫败 */
  onTaskFailure(description: string): void {
    this.actor.send({ type: 'TASK_FAILURE', reason: description });
  }

  /** 用户表扬 → 兴奋 */
  onUserPraise(description: string): void {
    this.actor.send({ type: 'USER_PRAISE', reason: description });
  }

  /** 用户纠正 → 谨慎 */
  onUserCorrection(description: string): void {
    this.actor.send({ type: 'USER_CORRECTION', reason: description });
  }

  /** 长时间会话 → 疲劳 */
  onLongSession(): void {
    this.actor.send({ type: 'LONG_SESSION' });
  }

  /** 新挑战 → 好奇 */
  onNewChallenge(description: string): void {
    this.actor.send({ type: 'NEW_CHALLENGE', reason: description });
  }

  /** 获取当前情绪 */
  getCurrentEmotion(): Emotion {
    return this.actor.getSnapshot().value as Emotion;
  }

  /** 获取心情分数 */
  getMoodScore(): number {
    return this.actor.getSnapshot().context.mood;
  }

  /** 获取完整状态 */
  getState(): EmotionalState {
    const snapshot = this.actor.getSnapshot();
    return {
      current: snapshot.value as Emotion,
      intensity: snapshot.context.intensity,
      history: snapshot.context.history,
      mood: snapshot.context.mood,
    };
  }

  /** 获取情绪建议 */
  getSuggestions(): EmotionSuggestion {
    const emotion = this.getCurrentEmotion();
    return this.getBehaviorSuggestions(emotion);
  }

  /** 获取情绪上下文，用于注入系统提示 */
  getEmotionalContext(): string {
    const state = this.getState();
    if (state.current === 'neutral' && Math.abs(state.mood) < 0.1) {
      return '';
    }

    const parts: string[] = ['[当前情绪状态]'];
    parts.push(`情绪: ${EMOTION_DESCRIPTION[state.current]} (强度: ${Math.round(state.intensity * 100)}%)`);

    if (state.mood > 0.2) {
      parts.push('整体心情: 积极');
    } else if (state.mood < -0.2) {
      parts.push('整体心情: 消极');
    }

    const suggestions = this.getSuggestions();
    if (suggestions.behavior) {
      parts.push(`行为建议: ${suggestions.behavior}`);
    }

    return parts.join('\n');
  }

  /** 情绪衰减 - 情绪随时间淡化 */
  decay(): void {
    const snapshot = this.actor.getSnapshot();
    const currentIntensity = snapshot.context.intensity;
    const currentMood = snapshot.context.mood;
    
    // intensity 衰减 5%
    const newIntensity = Math.max(0.1, currentIntensity * 0.95);
    
    // mood 向 0 收敛
    const newMood = currentMood * 0.95;

    // 如果强度降到很低，触发衰减事件
    if (newIntensity < 0.15 && snapshot.value !== 'neutral') {
      this.actor.send({ type: 'DECAY' });
    }

    // 保留最近 50 条历史
    const history = snapshot.context.history;
    if (history.length > 50) {
      // 通过发送 RESET 然后恢复状态来更新历史
      // 这里简化处理：直接更新上下文
    }
  }

  /** 重置到初始状态 */
  reset(): void {
    this.actor.send({ type: 'RESET' });
  }

  /** 停止状态机 */
  stop(): void {
    this.actor.stop();
  }

  // ==================== 私有方法 ====================

  private getBehaviorSuggestions(emotion: Emotion): EmotionSuggestion {
    const suggestions: Record<Emotion, EmotionSuggestion> = {
      frustrated: {
        behavior: '更加谨慎，仔细检查每一步，避免急躁',
        caution: '当前情绪较低，建议放慢节奏',
      },
      excited: {
        behavior: '保持热情，但注意不要忽略细节',
        caution: '兴奋时容易忽略细节，请保持警觉',
      },
      tired: {
        behavior: '优先处理关键任务，适当简化非核心步骤',
        caution: '疲劳可能影响判断质量',
      },
      cautious: {
        behavior: '多做验证，确保方案正确后再执行',
        caution: '谨慎是好的，但不要过度犹豫',
      },
      confident: {
        behavior: '可以适当提高效率，信任已有的判断',
        caution: '保持自信，但也要验证关键假设',
      },
      curious: {
        behavior: '积极探索新方案，但保持理性评估',
        caution: '好奇心有助于发现新思路',
      },
      focused: {
        behavior: '保持专注，减少不必要的分支',
        caution: '专注模式下注意不要忽略重要上下文',
      },
      neutral: {
        behavior: '',
        caution: '',
      },
    };
    return suggestions[emotion];
  }
}
