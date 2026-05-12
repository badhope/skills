export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  icon?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (...args: any[]) => Promise<any>;
}

export class MCPServerBuilder {
  private config: MCPServerConfig;
  private tools: MCPTool[] = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  addTool(tool: MCPTool): MCPServerBuilder {
    this.tools.push(tool);
    return this;
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  getConfig(): MCPServerConfig {
    return this.config;
  }

  toJSON() {
    return {
      name: this.config.name,
      version: this.config.version,
      description: this.config.description,
      author: this.config.author,
      icon: this.config.icon,
      tools: this.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    };
  }
}

export function createMCPServer(config: MCPServerConfig): MCPServerBuilder {
  return new MCPServerBuilder(config);
}
