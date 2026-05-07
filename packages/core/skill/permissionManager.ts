import crypto from 'crypto';

export type Role = 'admin' | 'developer' | 'user' | 'guest';

export type Permission = 
  | 'skill:read'
  | 'skill:write'
  | 'skill:delete'
  | 'skill:execute'
  | 'tool:execute'
  | 'task:create'
  | 'task:read'
  | 'task:update'
  | 'task:delete'
  | 'memory:read'
  | 'memory:write'
  | 'version:manage'
  | 'config:read'
  | 'config:write';

export interface User {
  id: string;
  name: string;
  role: Role;
  permissions: Permission[];
}

export interface Session {
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface PermissionCheck {
  allowed: boolean;
  permission: Permission;
  message: string;
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'skill:read', 'skill:write', 'skill:delete', 'skill:execute',
    'tool:execute',
    'task:create', 'task:read', 'task:update', 'task:delete',
    'memory:read', 'memory:write',
    'version:manage',
    'config:read', 'config:write'
  ],
  developer: [
    'skill:read', 'skill:write', 'skill:execute',
    'tool:execute',
    'task:create', 'task:read', 'task:update',
    'memory:read', 'memory:write',
    'version:manage',
    'config:read'
  ],
  user: [
    'skill:read', 'skill:execute',
    'tool:execute',
    'task:create', 'task:read',
    'memory:read'
  ],
  guest: [
    'skill:read',
    'task:read'
  ]
};

export class PermissionManager {
  private users: Map<string, User> = new Map();
  private sessions: Map<string, Session> = new Map();
  private currentUser: User | null = null;
  private currentSessionId: string | null = null;
  private sessionTimeoutMinutes: number = 30;

  constructor() {
    this.initializeDefaultUsers();
    this.startSessionCleanup();
  }

  private initializeDefaultUsers(): void {
    this.users.set('admin', {
      id: 'admin',
      name: 'Admin User',
      role: 'admin',
      permissions: ROLE_PERMISSIONS.admin
    });
    
    this.users.set('developer', {
      id: 'developer',
      name: 'Developer User',
      role: 'developer',
      permissions: ROLE_PERMISSIONS.developer
    });
    
    this.users.set('user', {
      id: 'user',
      name: 'Regular User',
      role: 'user',
      permissions: ROLE_PERMISSIONS.user
    });
    
    this.users.set('guest', {
      id: 'guest',
      name: 'Guest User',
      role: 'guest',
      permissions: ROLE_PERMISSIONS.guest
    });
  }

  setCurrentUser(userId: string): boolean {
    const user = this.users.get(userId);
    if (user) {
      this.currentUser = user;
      return true;
    }
    return false;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  checkPermission(permission: Permission): PermissionCheck {
    if (!this.currentUser) {
      return {
        allowed: false,
        permission,
        message: 'No user logged in'
      };
    }

    if (this.currentUser.permissions.includes(permission)) {
      return {
        allowed: true,
        permission,
        message: 'Permission granted'
      };
    }

    return {
      allowed: false,
      permission,
      message: `User does not have permission: ${permission}`
    };
  }

  checkPermissions(permissions: Permission[]): PermissionCheck[] {
    return permissions.map(p => this.checkPermission(p));
  }

  hasPermission(permission: Permission): boolean {
    return this.checkPermission(permission).allowed;
  }

  hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(p));
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }

  removeUser(userId: string): boolean {
    return this.users.delete(userId);
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  grantPermission(userId: string, permission: Permission): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    
    if (!user.permissions.includes(permission)) {
      user.permissions.push(permission);
    }
    return true;
  }

  revokePermission(userId: string, permission: Permission): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    
    const index = user.permissions.indexOf(permission);
    if (index !== -1) {
      user.permissions.splice(index, 1);
      return true;
    }
    return false;
  }

  updateUserRole(userId: string, newRole: Role): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    
    user.role = newRole;
    user.permissions = [...ROLE_PERMISSIONS[newRole]];
    return true;
  }

  getPermissionsForRole(role: Role): Permission[] {
    return [...ROLE_PERMISSIONS[role]];
  }

  validateAccess(requiredPermission: Permission): void {
    const check = this.checkPermission(requiredPermission);
    if (!check.allowed) {
      throw new Error(`Access denied: ${check.message}`);
    }
  }

  validateAccessOrThrow(requiredPermission: Permission): void {
    const check = this.checkPermission(requiredPermission);
    if (!check.allowed) {
      throw new Error(`Access denied: ${check.message}`);
    }
  }

  login(userId: string, ipAddress?: string, userAgent?: string): string | null {
    const user = this.users.get(userId);
    if (!user) return null;

    const sessionId = `session-${Date.now()}-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.sessionTimeoutMinutes * 60 * 1000);

    const session: Session = {
      sessionId,
      userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt,
      ipAddress,
      userAgent
    };

    this.sessions.set(sessionId, session);
    this.currentUser = user;
    this.currentSessionId = sessionId;

    return sessionId;
  }

  logout(): void {
    if (this.currentSessionId) {
      this.sessions.delete(this.currentSessionId);
    }
    this.currentUser = null;
    this.currentSessionId = null;
  }

  setSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      return false;
    }

    session.lastActivity = new Date();
    session.expiresAt = new Date(Date.now() + this.sessionTimeoutMinutes * 60 * 1000);

    const user = this.users.get(session.userId);
    if (user) {
      this.currentUser = user;
      this.currentSessionId = sessionId;
      return true;
    }

    return false;
  }

  getCurrentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  invalidateSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  invalidateAllUserSessions(userId: string): number {
    let count = 0;
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
        count++;
      }
    }
    return count;
  }

  private startSessionCleanup(): void {
    setInterval(() => {
      const now = new Date();
      let cleanedCount = 0;

      for (const [sessionId, session] of this.sessions) {
        if (session.expiresAt < now) {
          this.sessions.delete(sessionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`[PermissionManager] 清理了 ${cleanedCount} 个过期会话`);
      }
    }, 60000).unref();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  setSessionTimeout(minutes: number): void {
    this.sessionTimeoutMinutes = minutes;
  }
}

export const globalPermissionManager = new PermissionManager();

export function requirePermission(permission: Permission): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(...args: any[]) {
      globalPermissionManager.validateAccess(permission);
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

export function requireAllPermissions(...permissions: Permission[]): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(...args: any[]) {
      permissions.forEach(p => globalPermissionManager.validateAccess(p));
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}