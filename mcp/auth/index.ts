import crypto from 'crypto';

interface User {
  id: string;
  username: string;
  email: string;
  roles: string[];
  apiKeys: APIKey[];
  createdAt: number;
  lastLoginAt?: number;
}

interface APIKey {
  id: string;
  userId: string;
  key: string;
  name: string;
  permissions: string[];
  expiresAt?: number;
  createdAt: number;
  lastUsedAt?: number;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

const ROLES: Record<string, Role> = {
  admin: {
    id: 'admin',
    name: '管理员',
    description: '拥有所有权限',
    permissions: ['*']
  },
  developer: {
    id: 'developer',
    name: '开发者',
    description: '可以使用所有开发工具',
    permissions: ['tool:execute', 'code:generate', 'project:create', 'project:edit']
  },
  tester: {
    id: 'tester',
    name: '测试员',
    description: '可以运行测试和查看结果',
    permissions: ['tool:execute', 'test:run', 'report:view']
  },
  viewer: {
    id: 'viewer',
    name: '查看者',
    description: '只能查看内容',
    permissions: ['report:view', 'log:view']
  }
};

class AuthManager {
  private users: Map<string, User> = new Map();
  private apiKeys: Map<string, APIKey> = new Map();

  createUser(username: string, email: string, roles: string[]): User {
    const userId = `user-${Date.now()}-${crypto.randomUUID()}`;
    
    const user: User = {
      id: userId,
      username,
      email,
      roles,
      apiKeys: [],
      createdAt: Date.now()
    };

    this.users.set(userId, user);
    return user;
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  validateApiKey(apiKey: string): APIKey | undefined {
    for (const key of this.apiKeys.values()) {
      if (key.key === apiKey) {
        if (key.expiresAt && key.expiresAt < Date.now()) {
          return undefined;
        }
        key.lastUsedAt = Date.now();
        return key;
      }
    }
    return undefined;
  }

  generateApiKey(userId: string, name: string, permissions: string[]): APIKey {
    const key = `sk-${crypto.randomUUID()}`;
    
    const apiKey: APIKey = {
      id: `key-${Date.now()}`,
      userId,
      key,
      name,
      permissions,
      createdAt: Date.now()
    };

    this.apiKeys.set(key, apiKey);

    const user = this.users.get(userId);
    if (user) {
      user.apiKeys.push(apiKey);
    }

    return apiKey;
  }

  revokeApiKey(apiKey: string): boolean {
    const key = this.apiKeys.get(apiKey);
    if (!key) return false;

    this.apiKeys.delete(apiKey);

    const user = this.users.get(key.userId);
    if (user) {
      user.apiKeys = user.apiKeys.filter(k => k.key !== apiKey);
    }

    return true;
  }

  hasPermission(apiKey: APIKey, permission: string): boolean {
    if (apiKey.permissions.includes('*')) return true;
    return apiKey.permissions.includes(permission);
  }

  checkRolePermissions(roles: string[], requiredPermissions: string[]): boolean {
    for (const roleId of roles) {
      const role = ROLES[roleId];
      if (role) {
        if (role.permissions.includes('*')) return true;
        for (const required of requiredPermissions) {
          if (role.permissions.includes(required)) return true;
        }
      }
    }
    return false;
  }

  listUsers(): User[] {
    return Array.from(this.users.values());
  }

  listApiKeys(userId?: string): APIKey[] {
    if (userId) {
      return Array.from(this.apiKeys.values()).filter(k => k.userId === userId);
    }
    return Array.from(this.apiKeys.values());
  }
}

const authManager = new AuthManager();

export const tools = {
  create_user: {
    description: '创建用户',
    parameters: {
      username: { type: 'string', required: true },
      email: { type: 'string', required: true },
      roles: { type: 'array', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const user = authManager.createUser(params.username, params.email, params.roles);
      return { success: true, user };
    }
  },

  get_user: {
    description: '获取用户信息',
    parameters: {
      userId: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const user = authManager.getUser(params.userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      return { success: true, user };
    }
  },

  generate_api_key: {
    description: '生成API密钥',
    parameters: {
      userId: { type: 'string', required: true },
      name: { type: 'string', required: true },
      permissions: { type: 'array', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const apiKey = authManager.generateApiKey(params.userId, params.name, params.permissions);
      return { success: true, apiKey };
    }
  },

  validate_api_key: {
    description: '验证API密钥',
    parameters: {
      apiKey: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const key = authManager.validateApiKey(params.apiKey);
      if (!key) {
        return { success: false, error: 'Invalid or expired API key' };
      }
      return { success: true, apiKey: { id: key.id, name: key.name, permissions: key.permissions } };
    }
  },

  revoke_api_key: {
    description: '撤销API密钥',
    parameters: {
      apiKey: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const success = authManager.revokeApiKey(params.apiKey);
      return { success };
    }
  },

  check_permission: {
    description: '检查权限',
    parameters: {
      apiKey: { type: 'string', required: true },
      permission: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const key = authManager.validateApiKey(params.apiKey);
      if (!key) {
        return { success: false, error: 'Invalid API key' };
      }
      const hasPermission = authManager.hasPermission(key, params.permission);
      return { success: true, hasPermission };
    }
  },

  list_users: {
    description: '列出所有用户',
    parameters: {},
    execute: async () => {
      const users = authManager.listUsers();
      return { success: true, users };
    }
  },

  list_api_keys: {
    description: '列出API密钥',
    parameters: {
      userId: { type: 'string', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const keys = authManager.listApiKeys(params.userId);
      return { success: true, apiKeys: keys };
    }
  },

  get_roles: {
    description: '获取所有角色定义',
    parameters: {},
    execute: async () => {
      return { success: true, roles: ROLES };
    }
  }
};

export const serverId = 'auth';
export default { serverId, tools };