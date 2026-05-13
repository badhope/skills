/**
 * 代码解析模块 - 统一导出
 *
 * 基于 tree-sitter 的多语言代码解析引擎。
 */

export { initLanguages, getLanguageByExtension, getLanguageByFilePath, getRegisteredLanguages, getLanguage } from './languages.js';
export type { SupportedLanguage, LanguageInfo } from './languages.js';

export { parseSource, updateParse, parseFile, parseFiles } from './engine.js';
export type { ParseResult } from './engine.js';

export { extractSymbols, getSymbolsInRange, findSymbolByName } from './symbols.js';
export type { CodeSymbol, SymbolKind } from './symbols.js';

export { parseCache } from './cache.js';

// Dependency graph
export { buildDependencyGraph } from './dependency-graph.js';
export type { FileDependency, DependencyGraph } from './dependency-graph.js';

// Importance ranker
export { rankSymbols } from './importance-ranker.js';
export type { SymbolImportance } from './importance-ranker.js';

// Token budget
export { createTokenBudget, estimateTokens, formatSymbolEntry, formatFileMap } from './token-budget.js';
export type { TokenBudget } from './token-budget.js';

// Repo map generator
export { generateRepoMap } from './repo-map.js';
export type { RepoMapOptions, RepoMapResult } from './repo-map.js';
