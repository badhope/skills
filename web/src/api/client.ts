// API Types
export interface Plugin {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface MCPService {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface Settings {
  model: string;
  autoCheckpoint: boolean;
  maxTokens: number;
  temperature: number;
  workspace: string;
}

// API Client
const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function runAgent(input: string): Promise<string> {
  const result = await fetchJSON<{ output: string }>(`${API_BASE}/agent/run`, {
    method: 'POST',
    body: JSON.stringify({ input }),
  });
  return result.output;
}

export async function generateRepoMap(): Promise<string> {
  const result = await fetchJSON<{ map: string }>(`${API_BASE}/repo-map`);
  return result.map;
}

export async function listPlugins(): Promise<Plugin[]> {
  return fetchJSON<Plugin[]>(`${API_BASE}/plugins`);
}

export async function togglePlugin(name: string, enabled: boolean): Promise<void> {
  await fetchJSON(`${API_BASE}/plugins/${name}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function listMCPServices(): Promise<MCPService[]> {
  return fetchJSON<MCPService[]>(`${API_BASE}/mcp`);
}

export async function toggleMCPService(name: string, enabled: boolean): Promise<void> {
  await fetchJSON(`${API_BASE}/mcp/${name}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function getSettings(): Promise<Settings> {
  return fetchJSON<Settings>(`${API_BASE}/settings`);
}

export async function updateSettings(settings: Partial<Settings>): Promise<void> {
  await fetchJSON(`${API_BASE}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
