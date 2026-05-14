/**
 * 情绪状态系统模块
 *
 * 管理 Agent 的实时情绪状态，根据事件动态调整情绪。
 * 情绪会随时间衰减，避免长时间保持极端状态。
 */

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

// ==================== 情绪影响配置 ====================

interface EmotionEffect {
  emotion: Emotion;
  moodDelta: number;
  intensity: number;
}

const EFFECTS: Record<string, EmotionEffect> = {
  taskSuccess: { emotion: 'confident', moodDelta: 0.15, intensity: 0.7 },
  taskFailure: { emotion: 'frustrated', moodDelta: -0.25, intensity: 0.8 },
  userPraise: { emotion: 'excited', moodDelta: 0.3, intensity: 0.9 },
  userCorrection: { emotion: 'cautious', moodDelta: -0.15, intensity: 0.6 },
  longSession: { emotion: 'tired', moodDelta: -0.1, intensity: 0.5 },
  newChallenge: { emotion: 'curious', moodDelta: 0.1, intensity: 0.6 },
};

// 情绪优先级（数值越大优先级越高，同优先级取 intensity 更高的）
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

// ==================== EmotionalStateManager ====================

export class EmotionalStateManager {
  private state: EmotionalState;

  constructor() {
    this.state = {
      current: 'neutral',
      intensity: 0.3,
      history: [],
      mood: 0,
    };
  }

  /** 任务成功 → 自信/兴奋 */
  onTaskSuccess(description: string): void {
    this.applyEffect(EFFECTS.taskSuccess, description);
    // 连续成功可能升级为 excited
    const recentSuccesses = this.state.history
      .filter(e => e.emotion === 'confident')
      .length;
    if (recentSuccesses >= 3) {
      this.setEmotion('excited', 0.8, '连续多次成功，感到兴奋');
    }
  }

  /** 任务失败 → 挫败 */
  onTaskFailure(description: string): void {
    this.applyEffect(EFFECTS.taskFailure, description);
  }

  /** 用户表扬 → 兴奋 */
  onUserPraise(description: string): void {
    this.applyEffect(EFFECTS.userPraise, description);
  }

  /** 用户纠正 → 谨慎 */
  onUserCorrection(description: string): void {
    this.applyEffect(EFFECTS.userCorrection, description);
  }

  /** 长时间会话 → 疲劳 */
  onLongSession(): void {
    this.applyEffect(EFFECTS.longSession, '长时间工作，感到疲劳');
  }

  /** 新挑战 → 好奇 */
  onNewChallenge(description: string): void {
    this.applyEffect(EFFECTS.newChallenge, description);
  }

  getCurrentEmotion(): Emotion {
    return this.state.current;
  }

  getMoodScore(): number {
    return this.state.mood;
  }

  /** 获取情绪上下文，用于注入系统提示 */
  getEmotionalContext(): string {
    const s = this.state;
    if (s.current === 'neutral' && Math.abs(s.mood) < 0.1) {
      return '';
    }

    const parts: string[] = ['[当前情绪状态]'];

    const emotionDesc: Record<Emotion, string> = {
      focused: '专注',
      confident: '自信',
      cautious: '谨慎',
      curious: '好奇',
      frustrated: '有些挫败',
      excited: '兴奋',
      tired: '有些疲劳',
      neutral: '平静',
    };
    parts.push(`情绪: ${emotionDesc[s.current]} (强度: ${Math.round(s.intensity * 100)}%)`);

    if (s.mood > 0.2) {
      parts.push('整体心情: 积极');
    } else if (s.mood < -0.2) {
      parts.push('整体心情: 消极');
    }

    // 根据情绪给出行为建议
    const behaviorHints = this.getBehaviorHints();
    if (behaviorHints) {
      parts.push(behaviorHints);
    }

    return parts.join('\n');
  }

  /** 情绪衰减 - 情绪随时间淡化 */
  decay(): void {
    // intensity 衰减 5%
    this.state.intensity = Math.max(0.1, this.state.intensity * 0.95);

    // mood 向 0 收敛
    this.state.mood *= 0.95;

    // 如果 intensity 降到很低，回到 neutral
    if (this.state.intensity < 0.15 && this.state.current !== 'neutral') {
      this.state.current = 'neutral';
      this.state.intensity = 0.1;
    }

    // 保留最近 50 条历史
    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(-50);
    }
  }

  // ==================== 私有方法 ====================

  private applyEffect(effect: EmotionEffect, reason: string): void {
    // 记录历史
    this.state.history.push({
      emotion: effect.emotion,
      intensity: effect.intensity,
      timestamp: new Date().toISOString(),
      reason,
    });

    // 根据优先级决定是否切换情绪
    const currentPriority = EMOTION_PRIORITY[this.state.current];
    const newPriority = EMOTION_PRIORITY[effect.emotion];

    if (newPriority > currentPriority) {
      this.state.current = effect.emotion;
      this.state.intensity = effect.intensity;
    } else if (newPriority === currentPriority && effect.intensity > this.state.intensity) {
      this.state.current = effect.emotion;
      this.state.intensity = effect.intensity;
    } else {
      // 同方向情绪叠加强度（上限 1.0）
      this.state.intensity = Math.min(1.0, this.state.intensity + effect.intensity * 0.3);
    }

    // 更新心情值（范围 -1 到 1）
    this.state.mood = Math.max(-1, Math.min(1, this.state.mood + effect.moodDelta));
  }

  private setEmotion(emotion: Emotion, intensity: number, reason: string): void {
    this.state.current = emotion;
    this.state.intensity = Math.min(1.0, intensity);
    this.state.history.push({
      emotion,
      intensity,
      timestamp: new Date().toISOString(),
      reason,
    });
  }

  private getBehaviorHints(): string {
    const s = this.state;
    switch (s.current) {
      case 'frustrated':
        return '行为建议: 更加谨慎，仔细检查每一步，避免急躁';
      case 'excited':
        return '行为建议: 保持热情，但注意不要忽略细节';
      case 'tired':
        return '行为建议: 优先处理关键任务，适当简化非核心步骤';
      case 'cautious':
        return '行为建议: 多做验证，确保方案正确后再执行';
      case 'confident':
        return '行为建议: 可以适当提高效率，信任已有的判断';
      case 'curious':
        return '行为建议: 积极探索新方案，但保持理性评估';
      case 'focused':
        return '行为建议: 保持专注，减少不必要的分支';
      default:
        return '';
    }
  }
}
