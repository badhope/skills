import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface PluginInfo {
    name: string;
    version: string;
    enabled: boolean;
}

export interface MCPServiceInfo {
    name: string;
    description: string;
    enabled: boolean;
}

export class DevFlowClient {
    private cliPath: string | null = null;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('DevFlow');
    }

    async initialize(): Promise<void> {
        this.cliPath = this.findCliPath();
        if (!this.cliPath) {
            vscode.window.showWarningMessage(
                'DevFlow CLI not found. Please install or configure path in settings.'
            );
        } else {
            this.outputChannel.appendLine(`DevFlow CLI found at: ${this.cliPath}`);
        }
    }

    async runAgent(input: string, options?: { model?: string; planFirst?: boolean }): Promise<string> {
        const args = ['agent', 'run', input];
        if (options?.model) {
            args.push('--model', options.model);
        }
        if (options?.planFirst) {
            args.push('--plan');
        }
        return this.exec(args);
    }

    async generateRepoMap(): Promise<string> {
        return this.exec(['agent', 'repo-map']);
    }

    async listPlugins(): Promise<PluginInfo[]> {
        try {
            const output = await this.exec(['plugins', 'list']);
            return this.parsePluginList(output);
        } catch {
            return [];
        }
    }

    async listMCPServices(): Promise<MCPServiceInfo[]> {
        try {
            const output = await this.exec(['mcp', 'list']);
            return this.parseMCPList(output);
        } catch {
            return [];
        }
    }

    async enableMCP(name: string): Promise<void> {
        await this.exec(['mcp', 'enable', name]);
    }

    async disableMCP(name: string): Promise<void> {
        await this.exec(['mcp', 'disable', name]);
    }

    async gitCheckpoint(message?: string): Promise<string> {
        const args = ['git', 'checkpoint'];
        if (message) {
            args.push('--message', message);
        }
        return this.exec(args);
    }

    async gitUndo(): Promise<string> {
        return this.exec(['git', 'undo']);
    }

    async chat(message: string): Promise<string> {
        return this.exec(['chat', message]);
    }

    private exec(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.cliPath) {
                reject(new Error('DevFlow CLI not found'));
                return;
            }

            const config = vscode.workspace.getConfiguration('devflow');
            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            this.outputChannel.appendLine(`Executing: devflow ${args.join(' ')}`);

            const proc = cp.spawn(this.cliPath, args, {
                cwd,
                env: { ...processDELETE, NODE_ENV: 'production' }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
                this.outputChannel.append(data.toString());
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
                this.outputChannel.append(data.toString());
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr}`));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });
        });
    }

    private findCliPath(): string | null {
        const config = vscode.workspace.getConfiguration('devflow');
        const configPath = config.get<string>('cliPath');

        if (configPath && fs.existsSync(configPath)) {
            return configPath;
        }

        // Check common locations
        const commonPaths = [
            'devflow',
            '/usr/local/bin/devflow',
            '/usr/bin/devflow',
            path.join(processDELETE.HOME || '', '.local', 'bin', 'devflow'),
            path.join(processDELETE.HOME || '', 'node_modules', '.bin', 'devflow')
        ];

        for (const p of commonPaths) {
            try {
                if (fs.existsSync(p) || this.checkCommandExists(p)) {
                    return p;
                }
            } catch {
                // Continue checking other paths
            }
        }

        return null;
    }

    private checkCommandExists(cmd: string): boolean {
        try {
            const result = cp.execSync(`which ${cmd}`, { encoding: 'utf-8' });
            return !!result;
        } catch {
            return false;
        }
    }

    private parsePluginList(output: string): PluginInfo[] {
        const plugins: PluginInfo[] = [];
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const match = line.match(/^[\s-*]*([^\s]+)\s+v?([\d.]+)?/);
            if (match) {
                plugins.push({
                    name: match[1],
                    version: match[2] || 'unknown',
                    enabled: !line.includes('(disabled)')
                });
            }
        }

        return plugins;
    }

    private parseMCPList(output: string): MCPServiceInfo[] {
        const services: MCPServiceInfo[] = [];
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const match = line.match(/^[\s-*]*([^\s]+)/);
            if (match) {
                services.push({
                    name: match[1],
                    description: line.substring(line.indexOf(match[1]) + match[1].length).trim(),
                    enabled: !line.includes('(disabled)')
                });
            }
        }

        return services;
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
