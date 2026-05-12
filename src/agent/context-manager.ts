import type { Message } from '../types.js';

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  importance?: number; // 0-1，用于智能截断
}

export class ContextManager {
  private messages: ContextMessage[] = [];
  private maxTokens: number;
  private currentTokens: number = 0;
  
  constructor(maxTokens: number = 8000) {
    this.maxTokens = maxTokens;
  }
  
  // 估算token数（简单估算：中文1字≈1token，英文1词≈1token）
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w)).length;
    return chineseChars + englishWords + Math.ceil(text.length / 4);
  }
  
  addMessage(message: Omit<ContextMessage, 'timestamp'>): void {
    const msg: ContextMessage = {
      ...message,
      timestamp: Date.now(),
    };
    
    const tokens = this.estimateTokens(msg.content);
    
    // 如果单条消息就超过限制，进行截断
    if (tokens > this.maxTokens * 0.5) {
      msg.content = this.truncateContent(msg.content, Math.floor(this.maxTokens * 0.5));
    }
    
    this.messages.push(msg);
    this.currentTokens += this.estimateTokens(msg.content);
    
    // 触发窗口管理
    this.enforceWindowLimit();
  }
  
  private truncateContent(content: string, maxTokens: number): string {
    // 保留开头和结尾，中间用省略号
    const halfTokens = Math.floor(maxTokens / 2);
    const chars = content.length;
    const ratio = halfTokens / this.estimateTokens(content);
    const halfChars = Math.floor(chars * ratio);
    
    if (halfChars < 100) return content.slice(0, maxTokens) + '...(已截断)';
    
    return content.slice(0, halfChars) + '\n...(中间内容已省略)...\n' + 
           content.slice(-halfChars);
  }
  
  private enforceWindowLimit(): void {
    while (this.currentTokens > this.maxTokens && this.messages.length > 2) {
      // 优先移除最旧的非系统消息
      const removableIndex = this.messages.findIndex((m, i) => 
        i > 0 && m.role !== 'system' && (m.importance || 0.5) < 0.8
      );
      
      const indexToRemove = removableIndex !== -1 ? removableIndex : 1;
      const removed = this.messages.splice(indexToRemove, 1)[0];
      this.currentTokens -= this.estimateTokens(removed.content);
    }
  }
  
  getContext(): Message[] {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }
  
  getTokenCount(): number {
    return this.currentTokens;
  }
  
  clear(): void {
    this.messages = [];
    this.currentTokens = 0;
  }
  
  // 添加工具执行结果，自动提取关键信息
  addToolResult(toolName: string, result: string, success: boolean): void {
    const importance = success ? 0.6 : 0.9; // 失败结果更重要
    const summary = result.length > 500 
      ? result.slice(0, 250) + '...(已截断)' + result.slice(-250)
      : result;
    
    this.addMessage({
      role: 'system',
      content: `[工具执行: ${toolName}]\n${summary}`,
      importance,
    });
  }
}
