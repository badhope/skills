interface ToolMetadata {
  name: string;
  version: string;
  description: string;
  category: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  returns: {
    type: string;
    description?: string;
  };
  permissions?: string[];
  tags: string[];
}

interface ToolRegistration {
  id: string;
  serverId: string;
  toolId: string;
  metadata: ToolMetadata;
  handler: (params: Record<string, any>) => Promise<any>;
  registeredAt: number;
  lastUsedAt?: number;
  usageCount: number;
}

class ToolRegistry {
  private tools: Map<string, ToolRegistration> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  registerTool(serverId: string, toolId: string, metadata: ToolMetadata, handler: (params: Record<string, any>) => Promise<any>): string {
    const id = `${serverId}/${toolId}`;
    
    if (this.tools.has(id)) {
      throw new Error(`Tool already registered: ${id}`);
    }

    const registration: ToolRegistration = {
      id,
      serverId,
      toolId,
      metadata,
      handler,
      registeredAt: Date.now(),
      usageCount: 0
    };

    this.tools.set(id, registration);
    
    if (!this.categories.has(metadata.category)) {
      this.categories.set(metadata.category, new Set());
    }
    this.categories.get(metadata.category)?.add(id);

    return id;
  }

  unregisterTool(id: string): boolean {
    const tool = this.tools.get(id);
    if (!tool) return false;

    this.categories.get(tool.metadata.category)?.delete(id);
    return this.tools.delete(id);
  }

  getTool(id: string): ToolRegistration | undefined {
    return this.tools.get(id);
  }

  findToolsByCategory(category: string): ToolRegistration[] {
    const toolIds = this.categories.get(category);
    if (!toolIds) return [];
    
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter((t): t is ToolRegistration => t !== undefined);
  }

  searchTools(keywords: string[]): ToolRegistration[] {
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    
    return Array.from(this.tools.values()).filter(tool => {
      const searchText = [
        tool.metadata.name,
        tool.metadata.description,
        ...tool.metadata.tags
      ].join(' ').toLowerCase();
      
      return lowerKeywords.some(k => searchText.includes(k));
    });
  }

  discoverTools(query?: {
    category?: string;
    keywords?: string[];
    permissions?: string[];
  }): ToolRegistration[] {
    let results = Array.from(this.tools.values());

    if (query?.category) {
      results = results.filter(t => t.metadata.category === query.category);
    }

    if (query?.keywords && query.keywords.length > 0) {
      results = this.searchTools(query.keywords);
    }

    if (query?.permissions && query.permissions.length > 0) {
      results = results.filter(t => {
        const toolPermissions = t.metadata.permissions || [];
        return query.permissions!.every(p => toolPermissions.includes(p));
      });
    }

    return results;
  }

  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  getStats(): {
    totalTools: number;
    totalCategories: number;
    usageByCategory: Record<string, number>;
  } {
    const usageByCategory: Record<string, number> = {};
    
    this.tools.forEach(tool => {
      const cat = tool.metadata.category;
      usageByCategory[cat] = (usageByCategory[cat] || 0) + tool.usageCount;
    });

    return {
      totalTools: this.tools.size,
      totalCategories: this.categories.size,
      usageByCategory
    };
  }

  async invokeTool(id: string, params: Record<string, any>): Promise<any> {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new Error(`Tool not found: ${id}`);
    }

    for (const param of tool.metadata.parameters) {
      if (param.required && !(param.name in params)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    tool.usageCount++;
    tool.lastUsedAt = Date.now();

    try {
      const result = await tool.handler(params);
      return {
        success: true,
        data: result,
        metadata: {
          toolId: id,
          version: tool.metadata.version
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          toolId: id,
          version: tool.metadata.version
        }
      };
    }
  }
}

const toolRegistry = new ToolRegistry();

export const tools = {
  register_tool: {
    description: '注册工具到注册表',
    parameters: {
      serverId: { type: 'string', required: true },
      toolId: { type: 'string', required: true },
      metadata: { type: 'object', required: true },
      handler: { type: 'function', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const { serverId, toolId, metadata, handler } = params;
      const id = toolRegistry.registerTool(serverId, toolId, metadata, handler);
      return { success: true, toolId: id };
    }
  },

  discover_tools: {
    description: '根据条件发现可用工具',
    parameters: {
      category: { type: 'string', required: false },
      keywords: { type: 'array', required: false },
      permissions: { type: 'array', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const tools = toolRegistry.discoverTools(params);
      return {
        success: true,
        tools: tools.map(t => ({
          id: t.id,
          name: t.metadata.name,
          description: t.metadata.description,
          category: t.metadata.category,
          version: t.metadata.version
        }))
      };
    }
  },

  get_tool_details: {
    description: '获取工具详细信息',
    parameters: {
      toolId: { type: 'string', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const tool = toolRegistry.getTool(params.toolId);
      if (!tool) {
        return { success: false, error: 'Tool not found' };
      }
      return {
        success: true,
        tool: {
          id: tool.id,
          metadata: tool.metadata,
          usageCount: tool.usageCount,
          registeredAt: tool.registeredAt
        }
      };
    }
  },

  invoke_tool: {
    description: '调用工具执行',
    parameters: {
      toolId: { type: 'string', required: true },
      params: { type: 'object', required: true }
    },
    execute: async (params: Record<string, any>) => {
      return toolRegistry.invokeTool(params.toolId, params.params);
    }
  },

  get_registry_stats: {
    description: '获取注册表统计信息',
    parameters: {},
    execute: async () => {
      return { success: true, stats: toolRegistry.getStats() };
    }
  },

  get_categories: {
    description: '获取所有工具类别',
    parameters: {},
    execute: async () => {
      return { success: true, categories: toolRegistry.getCategories() };
    }
  }
};

export const serverId = 'tool-registry';
export default { serverId, tools };