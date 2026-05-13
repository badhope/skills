/**
 * Symbol Importance Ranker
 *
 * Ranks code symbols by importance based on reference count,
 * export status, entry point membership, and symbol kind.
 */

import * as path from 'path';
import type { CodeSymbol } from './symbols.js';
import type { DependencyGraph } from './dependency-graph.js';

/** Importance ranking for a single symbol */
export interface SymbolImportance {
  /** The symbol being ranked */
  symbol: CodeSymbol;
  /** Computed importance score (higher = more important) */
  score: number;
  /** How many files reference this symbol */
  referenceCount: number;
  /** Whether this symbol is exported */
  isExported: boolean;
  /** Whether this symbol is in an entry point file */
  isEntry: boolean;
}

/** Default entry point file name patterns */
const DEFAULT_ENTRY_PATTERNS = [
  'index.ts',
  'index.js',
  'index.mts',
  'main.ts',
  'main.js',
  'app.ts',
  'app.js',
  'cli.ts',
  'cli.js',
  'server.ts',
  'server.js',
  'index.py',
  'main.py',
  'app.py',
  '__init__.py',
  '__main__.py',
];

/**
 * Check if a file path matches an entry point pattern.
 */
function isEntryPointFile(filePath: string, entryPoints: string[]): boolean {
  const basename = path.basename(filePath);

  // Check against explicit entry points
  for (const ep of entryPoints) {
    if (basename === ep || filePath.endsWith(path.sep + ep)) {
      return true;
    }
  }

  // Check against default patterns
  for (const pattern of DEFAULT_ENTRY_PATTERNS) {
    if (basename === pattern) {
      return true;
    }
  }

  return false;
}

/**
 * Build a set of exported symbol names for a given file.
 */
function getExportedNames(
  filePath: string,
  graph: DependencyGraph
): Set<string> {
  const dep = graph.files.get(filePath);
  if (!dep) return new Set();
  return new Set(dep.exports);
}

/**
 * Count how many files reference a given symbol name.
 *
 * Uses simple string matching against all source files' content.
 * This is a pragmatic approach that works well enough for ranking purposes.
 *
 * @param symbolName - The name of the symbol to search for
 * @param symbolFilePath - The file where the symbol is defined
 * @param allSources - Map of file path to source code content
 * @returns The number of other files that reference this symbol
 */
function countReferences(
  symbolName: string,
  symbolFilePath: string,
  allSources: Map<string, string>
): number {
  if (!symbolName || symbolName.length < 2) return 0;

  let count = 0;

  // Build a regex that matches the symbol name as a whole word
  // Escape special regex characters in the symbol name
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'g');

  for (const [filePath, source] of allSources) {
    // Don't count references in the same file (self-reference)
    if (filePath === symbolFilePath) continue;

    const matches = source.match(regex);
    if (matches && matches.length > 0) {
      count += 1;
    }
  }

  return count;
}

/**
 * Rank all symbols by importance.
 *
 * Score formula:
 *   referenceCount * 2 + (isExported ? 1 : 0) + (isEntry ? 1 : 0) + (isClass ? 0.5 : 0)
 *
 * @param allSymbols - Map of file path to extracted symbols
 * @param graph - The dependency graph
 * @param entryPoints - Optional explicit entry point file paths
 * @param allSources - Optional map of file path to source code (for reference counting)
 * @returns Array of SymbolImportance sorted by score descending
 */
export function rankSymbols(
  allSymbols: Map<string, CodeSymbol[]>,
  graph: DependencyGraph,
  entryPoints?: string[],
  allSources?: Map<string, string>
): SymbolImportance[] {
  const results: SymbolImportance[] = [];
  const entryList = entryPoints || [];

  // Build export name sets per file
  const exportSets = new Map<string, Set<string>>();
  for (const [filePath] of allSymbols) {
    exportSets.set(filePath, getExportedNames(filePath, graph));
  }

  for (const [filePath, symbols] of allSymbols) {
    const isEntry = isEntryPointFile(filePath, entryList);
    const exportedNames = exportSets.get(filePath) || new Set();

    for (const symbol of symbols) {
      // Skip import/export symbols themselves - they are not real code symbols
      if (symbol.kind === 'import' || symbol.kind === 'export' || symbol.kind === 'module') {
        continue;
      }

      const isExported = exportedNames.has(symbol.name);

      // Count references if source code is available
      let referenceCount = 0;
      if (allSources) {
        referenceCount = countReferences(symbol.name, filePath, allSources);
      } else {
        // Fall back to dependency-based counting:
        // count how many files import this file
        const dep = graph.files.get(filePath);
        if (dep) {
          referenceCount = dep.importedBy.length;
        }
      }

      // Compute score
      const score =
        referenceCount * 2 +
        (isExported ? 1 : 0) +
        (isEntry ? 1 : 0) +
        (symbol.kind === 'class' ? 0.5 : 0);

      results.push({
        symbol,
        score,
        referenceCount,
        isExported,
        isEntry,
      });
    }
  }

  // Sort by score descending, then by reference count descending
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.referenceCount - a.referenceCount;
  });

  return results;
}
