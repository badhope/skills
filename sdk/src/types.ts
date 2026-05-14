/**
 * @devflow/sdk - Public Type Definitions
 *
 * These types define the public API surface of the DevFlow SDK.
 */

/**
 * Options for configuring a DevFlow Agent instance.
 */
export interface AgentOptions {
  /** LLM model to use (e.g., 'claude-3-5-sonnet', 'gpt-4') */
  model?: string;
  /** Temperature for LLM generation (0-1, default: 0.3) */
  temperature?: number;
  /** Maximum tokens for LLM responses (default: 2048) */
  maxTokens?: number;
  /** Whether to plan before executing (default: true) */
  planFirst?: boolean;
  /** Whether to create automatic git checkpoints (default: true) */
  autoCheckpoint?: boolean;
  /** Callback for step progress updates */
  onStep?: (step: AgentStep) => void;
  /** Callback for output text updates */
  onOutput?: (text: string) => void;
}

/**
 * Represents a single step in agent execution.
 */
export interface AgentStep {
  /** Step identifier */
  id: number;
  /** Human-readable description of the step */
  description: string;
  /** Tool being used (if any) */
  tool?: string;
  /** Tool arguments (if any) */
  args?: Record<string, unknown>;
  /** Current status of the step */
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  /** Result output (if completed) */
  result?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Result of an agent execution.
 */
export interface AgentResult {
  /** Whether the task completed successfully */
  success: boolean;
  /** Final output text */
  output: string;
  /** All executed steps */
  steps: AgentStep[];
  /** List of files that were modified */
  changedFiles: string[];
  /** Total execution duration in milliseconds */
  duration: number;
  /** Task ID for reference */
  taskId?: string;
  /** Recognized intent */
  intent?: string;
}

/**
 * Result of parsing a source file.
 */
export interface ParseResult {
  /** Detected programming language */
  language: string;
  /** Extracted symbols from the code */
  symbols: Symbol[];
  /** Estimated token count */
  tokens: number;
  /** Source file path */
  filePath?: string;
}

/**
 * Represents a code symbol (function, class, etc.).
 */
export interface Symbol {
  /** Symbol name */
  name: string;
  /** Kind of symbol */
  kind: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'type' | 'enum';
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
  /** Optional signature (e.g., function parameters) */
  signature?: string;
  /** Parent symbol name (for nested symbols) */
  parent?: string;
}

/**
 * Options for performing a code edit.
 */
export interface EditOptions {
  /** Target file path */
  filePath: string;
  /** Content to search for */
  search: string;
  /** Content to replace with */
  replace: string;
  /** Optional description of the change */
  description?: string;
}

/**
 * Result of an edit operation.
 */
export interface EditResult {
  /** Whether the edit was successful */
  success: boolean;
  /** Generated unified diff */
  diff: string;
  /** Number of lines added */
  additions?: number;
  /** Number of lines deleted */
  deletions?: number;
}

/**
 * Information about a plugin.
 */
export interface PluginInfo {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Whether the plugin is currently enabled */
  enabled: boolean;
  /** Plugin author */
  author?: string;
}

/**
 * Information about an MCP (Model Context Protocol) server.
 */
export interface MCPInfo {
  /** Server name */
  name: string;
  /** Whether the server is enabled */
  enabled: boolean;
  /** Available tools from this server */
  tools: string[];
}

/**
 * Options for repo map generation.
 */
export interface RepoMapOptions {
  /** Maximum tokens for the map (default: 4096) */
  maxTokens?: number;
  /** Entry point files (auto-detected if not provided) */
  entryPoints?: string[];
  /** Glob patterns to include */
  includePatterns?: string[];
  /** Glob patterns to exclude */
  excludePatterns?: string[];
}

/**
 * Result of repo map generation.
 */
export interface RepoMapResult {
  /** The generated repo map text */
  map: string;
  /** Number of files included */
  fileCount: number;
  /** Number of symbols included */
  symbolCount: number;
  /** Estimated token count */
  tokenCount: number;
  /** Files that were skipped */
  skippedFiles: string[];
}

/**
 * Location of a symbol in source code.
 */
export interface SymbolLocation {
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
}

/**
 * Reference to a symbol in another file.
 */
export interface SymbolReference {
  /** File containing the reference */
  filePath: string;
  /** Line number of the reference */
  line: number;
}
