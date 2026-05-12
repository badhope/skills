import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProviderType } from '../types.js';
import { PROJECT_DIR, DEVFLOW_DIR } from '../utils/index.js';

export interface ManagerProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface Config {
  providers: Record<ProviderType, ManagerProviderConfig>;
  defaultProvider?: ProviderType;
  chat: {
    defaultTemperature: number;
    defaultMaxTokens: number;
    saveHistory: boolean;
    historyLimit: number;
  };
  memory: {
    enabled: boolean;           // 总开关：是否记录对话记忆
    autoRecall: boolean;        // chat ask 时是否自动召回记忆注入上下文
    ragEnabled: boolean;        // 是否启用 RAG 向量检索（烧钱！）
    graphEnabled: boolean;      // 是否启用记忆图谱
    knowledgeEnabled: boolean;  // 是否启用知识图谱自动提取
    maxMemories: number;        // 最大记忆条数
  };
  sandbox: {
    level: SandboxLevel;        // 沙盒权限级别
    allowDangerousOps: boolean; // 是否允许危险操作（如删除系统文件）
    confirmOnRisk: boolean;     // 遇到风险操作时是否询问用户
  };
}

export type SandboxLevel = 'minimal' | 'conservative' | 'balanced' | 'relaxed' | 'extreme';

export const SANDBOX_PERMISSIONS: Record<SandboxLevel, {
  description: string;
  allowDelete: boolean;
  allowSystemModify: boolean;
  allowNetwork: boolean;
  allowExec: boolean;
  maxFileSize: number;
  allowedPaths: string[];
  blockedPaths: string[];
}> = {
  minimal: {
    description: '极小权限 - 仅允许读取和执行只读操作',
    allowDelete: false,
    allowSystemModify: false,
    allowNetwork: false,
    allowExec: false,
    maxFileSize: 0,
    allowedPaths: [],
    blockedPaths: ['*'],
  },
  conservative: {
    description: '保守权限 - 允许基本文件操作，需要确认危险操作',
    allowDelete: false,
    allowSystemModify: false,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 1024 * 1024,
    allowedPaths: [PROJECT_DIR],
    blockedPaths: ['C:\\Windows', '/etc', '/usr', 'C:\\Program Files'],
  },
  balanced: {
    description: '平衡权限 - 允许常规开发操作，自动备份危险操作',
    allowDelete: true,
    allowSystemModify: false,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 10 * 1024 * 1024,
    allowedPaths: [PROJECT_DIR],
    blockedPaths: ['C:\\Windows', '/etc', '/bin', '/sbin'],
  },
  relaxed: {
    description: '宽松权限 - 允许更多操作，信任用户判断',
    allowDelete: true,
    allowSystemModify: true,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 50 * 1024 * 1024,
    allowedPaths: ['*'],
    blockedPaths: ['C:\\Windows\\System32'],
  },
  extreme: {
    description: '极端权限 - 几乎无限制，谨慎使用',
    allowDelete: true,
    allowSystemModify: true,
    allowNetwork: true,
    allowExec: true,
    maxFileSize: 1024 * 1024 * 1024,
    allowedPaths: ['*'],
    blockedPaths: [],
  },
};

const DEFAULT_CONFIG: Config = {
  providers: {
    openai: { timeout: 30000, maxRetries: 3 },
    anthropic: { timeout: 30000, maxRetries: 3 },
    google: { timeout: 30000, maxRetries: 3 },
    siliconflow: { timeout: 30000, maxRetries: 3 },
    aliyun: { timeout: 30000, maxRetries: 3 },
    zhipu: { timeout: 30000, maxRetries: 3 },
    baidu: { timeout: 30000, maxRetries: 3 },
    deepseek: { timeout: 30000, maxRetries: 3 },
    ollama: { timeout: 60000, maxRetries: 1 },
    lmstudio: { timeout: 60000, maxRetries: 1 },
  },
  defaultProvider: 'aliyun',
  chat: {
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
    saveHistory: true,
    historyLimit: 100,
  },
  memory: {
    enabled: true,
    autoRecall: true,
    ragEnabled: false,       // 默认关闭，需要用户主动开启
    graphEnabled: true,
    knowledgeEnabled: true,
    maxMemories: 10000,
  },
  sandbox: {
    level: 'balanced',        // 默认平衡模式
    allowDangerousOps: false,
    confirmOnRisk: true,
  },
};

export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private config: Config;
  private _initialized = false;

  constructor() {
    this.configDir = DEVFLOW_DIR;
    this.configFile = path.join(DEVFLOW_DIR, 'config.json');
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  async init(): Promise<void> {
    if (this._initialized) return;
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      const exists = await this.configExists();
      if (exists) {
        await this.load();
      } else {
        await this.save();
      }
      this._initialized = true;
    } catch (error) {
      console.error('初始化配置失败:', error);
    }
  }

  async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configFile);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configFile, 'utf-8');
      const loaded = JSON.parse(data);
      this.config = this.mergeConfig(DEFAULT_CONFIG, loaded);
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }

  async save(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  }

  getProviderConfig(provider: ProviderType): ManagerProviderConfig {
    return this.config.providers[provider] || {};
  }

  async setProviderConfig(provider: ProviderType, config: Partial<ManagerProviderConfig>): Promise<void> {
    this.config.providers[provider] = {
      ...this.config.providers[provider],
      ...config,
    };
    await this.save();
  }

  async setApiKey(provider: ProviderType, apiKey: string): Promise<void> {
    await this.setProviderConfig(provider, { apiKey });
  }

  getApiKey(provider: ProviderType): string | undefined {
    return this.config.providers[provider]?.apiKey;
  }

  async removeApiKey(provider: ProviderType): Promise<void> {
    const config = this.config.providers[provider];
    if (config) {
      delete config.apiKey;
      await this.save();
    }
  }

  getDefaultProvider(): ProviderType | undefined {
    return this.config.defaultProvider;
  }

  async setDefaultProvider(provider: ProviderType): Promise<void> {
    this.config.defaultProvider = provider;
    await this.save();
  }

  getChatConfig() {
    return this.config.chat;
  }

  async updateChatConfig(config: Partial<Config['chat']>): Promise<void> {
    this.config.chat = { ...this.config.chat, ...config };
    await this.save();
  }

  getMemoryConfig() {
    return this.config.memory;
  }

  async updateMemoryConfig(config: Partial<Config['memory']>): Promise<void> {
    this.config.memory = { ...this.config.memory, ...config };
    await this.save();
  }

  getSandboxConfig() {
    return this.config.sandbox;
  }

  async updateSandboxConfig(config: Partial<Config['sandbox']>): Promise<void> {
    this.config.sandbox = { ...this.config.sandbox, ...config };
    await this.save();
  }

  async setSandboxLevel(level: SandboxLevel): Promise<void> {
    const perms = SANDBOX_PERMISSIONS[level];
    this.config.sandbox = {
      level,
      allowDangerousOps: perms.allowSystemModify,
      confirmOnRisk: true,
    };
    await this.save();
  }

  getSandboxPermissions() {
    return SANDBOX_PERMISSIONS[this.config.sandbox.level];
  }

  checkSandboxPermission(action: 'delete' | 'modify' | 'network' | 'exec', path?: string): {
    allowed: boolean;
    requiresConfirmation: boolean;
    reason?: string;
  } {
    const perms = SANDBOX_PERMISSIONS[this.config.sandbox.level];

    switch (action) {
      case 'delete':
        return {
          allowed: perms.allowDelete,
          requiresConfirmation: !perms.allowDelete && this.config.sandbox.confirmOnRisk,
          reason: perms.allowDelete ? undefined : '当前权限级别禁止删除操作',
        };
      case 'modify':
        return {
          allowed: perms.allowSystemModify,
          requiresConfirmation: !perms.allowSystemModify && this.config.sandbox.confirmOnRisk,
          reason: perms.allowSystemModify ? undefined : '当前权限级别禁止修改系统文件',
        };
      case 'network':
        return {
          allowed: perms.allowNetwork,
          requiresConfirmation: !perms.allowNetwork && this.config.sandbox.confirmOnRisk,
          reason: perms.allowNetwork ? undefined : '当前权限级别禁止网络操作',
        };
      case 'exec':
        return {
          allowed: perms.allowExec,
          requiresConfirmation: !perms.allowExec && this.config.sandbox.confirmOnRisk,
          reason: perms.allowExec ? undefined : '当前权限级别禁止执行命令',
        };
    }
  }

  getConfigPath(): string {
    return this.configFile;
  }

  getAllConfig(): Config {
    return JSON.parse(JSON.stringify(this.config));
  }

  private mergeConfig(defaults: Config, loaded: Partial<Config>): Config {
    return {
      providers: { ...defaults.providers, ...loaded.providers },
      defaultProvider: loaded.defaultProvider || defaults.defaultProvider,
      chat: { ...defaults.chat, ...loaded.chat },
      memory: { ...defaults.memory, ...loaded.memory },
      sandbox: { ...defaults.sandbox, ...loaded.sandbox },
    };
  }
}

export const configManager = new ConfigManager();
