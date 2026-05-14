"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevFlowClient = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class DevFlowClient {
    cliPath = null;
    outputChannel;
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('DevFlow');
    }
    async initialize() {
        this.cliPath = this.findCliPath();
        if (!this.cliPath) {
            vscode.window.showWarningMessage('DevFlow CLI not found. Please install or configure path in settings.');
        }
        else {
            this.outputChannel.appendLine(`DevFlow CLI found at: ${this.cliPath}`);
        }
    }
    async runAgent(input, options) {
        const args = ['agent', 'run', input];
        if (options?.model) {
            args.push('--model', options.model);
        }
        if (options?.planFirst) {
            args.push('--plan');
        }
        return this.exec(args);
    }
    async generateRepoMap() {
        return this.exec(['agent', 'repo-map']);
    }
    async listPlugins() {
        try {
            const output = await this.exec(['plugins', 'list']);
            return this.parsePluginList(output);
        }
        catch {
            return [];
        }
    }
    async listMCPServices() {
        try {
            const output = await this.exec(['mcp', 'list']);
            return this.parseMCPList(output);
        }
        catch {
            return [];
        }
    }
    async enableMCP(name) {
        await this.exec(['mcp', 'enable', name]);
    }
    async disableMCP(name) {
        await this.exec(['mcp', 'disable', name]);
    }
    async gitCheckpoint(message) {
        const args = ['git', 'checkpoint'];
        if (message) {
            args.push('--message', message);
        }
        return this.exec(args);
    }
    async gitUndo() {
        return this.exec(['git', 'undo']);
    }
    async chat(message) {
        return this.exec(['chat', message]);
    }
    exec(args) {
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
                }
                else {
                    reject(new Error(`Command failed with code ${code}: ${stderr}`));
                }
            });
            proc.on('error', (err) => {
                reject(err);
            });
        });
    }
    findCliPath() {
        const config = vscode.workspace.getConfiguration('devflow');
        const configPath = config.get('cliPath');
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
            }
            catch {
                // Continue checking other paths
            }
        }
        return null;
    }
    checkCommandExists(cmd) {
        try {
            const result = cp.execSync(`which ${cmd}`, { encoding: 'utf-8' });
            return !!result;
        }
        catch {
            return false;
        }
    }
    parsePluginList(output) {
        const plugins = [];
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
    parseMCPList(output) {
        const services = [];
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
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.DevFlowClient = DevFlowClient;
//# sourceMappingURL=client.js.map