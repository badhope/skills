/**
 * Code Indexer
 *
 * Builds and queries a searchable in-memory code index. Parses all files,
 * extracts symbols and chunks, builds an inverted index, and supports
 * text-based search with scoring and filtering.
 *
 * This is the main entry point that orchestrates the indexing process.
 * For types, scoring logic, and inverted index implementation, see the
 * indexer/ subdirectory.
 */

import * as path from 'path';
import { parseFiles } from '../parser/engine.js';
import { extractSymbols } from '../parser/symbols.js';
import type { CodeSymbol } from '../parser/symbols.js';
import { chunkFiles } from './semantic-chunker.js';
import { collectSourceFiles } from '../utils/file-system.js';
import { globMatch } from '../utils/glob.js';

import type { CodeIndex, IndexEntry, SearchOptions, IndexData } from './indexer/types.js';
import { INDEXABLE_KINDS } from './indexer/types.js';
import { InvertedIndex } from './indexer/inverted-index.js';
import { computeScore } from './indexer/scoring.js';

/** In-memory index storage */
const indexStore = new Map<string, IndexData>();

/**
 * Extract JSDoc or doc comment preceding a symbol from the source.
 */
function extractDocstring(node: any, source: string): string | undefined {
  // Look for a comment node immediately before this node
  const prev = node.previousNamedSibling;
  if (prev && (
    prev.type === 'comment' ||
    prev.type === 'block_comment' ||
    prev.type === 'line_comment'
  )) {
    const commentText = prev.text.trim();
    // Check it's a docstring (starts with /**, """, or # )
    if (
      commentText.startsWith('/**') ||
      commentText.startsWith('"""') ||
      commentText.startsWith("'''") ||
      commentText.startsWith('# ')
    ) {
      return commentText;
    }
  }

  // Also check the immediate previous sibling (which might be unnamed)
  const parent = node.parent;
  if (parent) {
    let prevUnnamed: any = null;
    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      if (child === node) break;
      prevUnnamed = child;
    }
    if (prevUnnamed && (
      prevUnnamed.type === 'comment' ||
      prevUnnamed.type === 'block_comment'
    )) {
      const commentText = prevUnnamed.text.trim();
      if (commentText.startsWith('/**')) {
        return commentText;
      }
    }
  }

  return undefined;
}

/**
 * Build a searchable code index for the given project directory.
 *
 * Parses all source files, extracts symbols and chunks, builds an
 * inverted index for fast lookup, and stores everything in memory.
 *
 * @param rootDir - Absolute path to the project root
 * @returns The built code index
 */
export async function buildCodeIndex(rootDir: string): Promise<CodeIndex> {
  // Step 1: Collect source files
  const filePaths = await collectSourceFiles(rootDir);

  if (filePaths.length === 0) {
    const emptyIndex: CodeIndex = {
      id: `idx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      rootDir,
      builtAt: Date.now(),
      fileCount: 0,
      symbolCount: 0,
    };
    indexStore.set(emptyIndex.id, {
      index: emptyIndex,
      entries: [],
      invertedIndex: new Map(),
      entriesByFile: new Map(),
    });
    return emptyIndex;
  }

  // Step 2: Parse all files
  const parseResults = await parseFiles(filePaths);

  // Step 3: Extract symbols and build entries
  const entries: IndexEntry[] = [];
  let symbolCount = 0;

  for (const [filePath, result] of parseResults) {
    const symbols = extractSymbols(result);
    const source = result.source;

    // Add file entry
    const fileName = path.basename(filePath);
    entries.push({
      type: 'file',
      name: fileName,
      filePath,
      score: 0,
    });

    // Add symbol entries
    for (const sym of symbols) {
      if (!INDEXABLE_KINDS.has(sym.kind)) continue;
      if (!sym.name || sym.name.startsWith('(')) continue;

      const docstring = extractDocstring(
        result.tree.rootNode.descendantForPosition({
          row: sym.startLine,
          column: 0,
        }),
        source
      );

      entries.push({
        type: 'symbol',
        name: sym.name,
        filePath,
        line: sym.startLine + 1, // convert to 1-based
        kind: sym.kind,
        signature: sym.signature,
        docstring,
        score: 0,
      });
      symbolCount++;
    }
  }

  // Step 4: Chunk files and add chunk entries
  const chunks = await chunkFiles(filePaths);
  for (const [filePath, fileChunks] of chunks) {
    for (const chunk of fileChunks) {
      if (chunk.type === 'import-section' || chunk.type === 'comment-section') continue;

      entries.push({
        type: 'chunk',
        name: chunk.name ?? `chunk-${chunk.startLine}`,
        filePath,
        line: chunk.startLine,
        kind: chunk.type,
        signature: chunk.signature,
        score: 0,
      });
    }
  }

  // Step 5: Build inverted index
  const invertedIndex = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = entry.name.toLowerCase();
    const indices = invertedIndex.get(key) ?? [];
    indices.push(i);
    invertedIndex.set(key, indices);
  }

  // Step 6: Build file-based index
  const entriesByFile = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const indices = entriesByFile.get(entry.filePath) ?? [];
    indices.push(i);
    entriesByFile.set(entry.filePath, indices);
  }

  // Step 7: Create and store the index
  const codeIndex: CodeIndex = {
    id: `idx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    rootDir,
    builtAt: Date.now(),
    fileCount: filePaths.length,
    symbolCount,
  };

  indexStore.set(codeIndex.id, {
    index: codeIndex,
    entries,
    invertedIndex,
    entriesByFile,
  });

  return codeIndex;
}

/**
 * Search the code index for entries matching a query.
 *
 * Uses text matching with scoring:
 * - Exact match > starts-with > contains
 * - Supports filtering by type, kind, and file pattern
 *
 * @param index - The code index to search
 * @param query - Search query string
 * @param options - Search options
 * @returns Array of matching entries sorted by relevance
 */
export function searchIndex(
  index: CodeIndex,
  query: string,
  options?: SearchOptions
): IndexEntry[] {
  const data = indexStore.get(index.id);
  if (!data) return [];

  const maxResults = options?.maxResults ?? 20;
  const typeFilter = options?.typeFilter;
  const kindFilter = options?.kindFilter;
  const filePathPattern = options?.filePathPattern;
  const lowerQuery = query.toLowerCase();

  // Gather candidate entries from inverted index
  const candidateIndices = new Set<number>();

  // Exact key lookup
  const exactMatches = data.invertedIndex.get(lowerQuery);
  if (exactMatches) {
    for (const idx of exactMatches) candidateIndices.add(idx);
  }

  // Prefix lookup
  for (const [key, indices] of data.invertedIndex) {
    if (key.startsWith(lowerQuery) && key !== lowerQuery) {
      for (const idx of indices) candidateIndices.add(idx);
    }
  }

  // Contains lookup
  for (const [key, indices] of data.invertedIndex) {
    if (key.includes(lowerQuery) && !key.startsWith(lowerQuery)) {
      for (const idx of indices) candidateIndices.add(idx);
    }
  }

  // Score and filter candidates
  const scored: IndexEntry[] = [];
  for (const idx of candidateIndices) {
    const entry = data.entries[idx];

    // Apply type filter
    if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(entry.type)) {
      continue;
    }

    // Apply kind filter
    if (kindFilter && kindFilter.length > 0) {
      if (!entry.kind || !kindFilter.includes(entry.kind)) {
        continue;
      }
    }

    // Apply file path pattern filter
    if (filePathPattern) {
      const relative = path.relative(index.rootDir, entry.filePath).replace(/\\/g, '/');
      if (!globMatch(relative, filePathPattern)) {
        continue;
      }
    }

    const score = computeScore(entry, query);
    if (score > 0) {
      scored.push({ ...entry, score });
    }
  }

  // Sort by score descending, then by file path and line
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    return (a.line ?? 0) - (b.line ?? 0);
  });

  return scored.slice(0, maxResults);
}

/**
 * Get the definition entry for a symbol from the index.
 *
 * Searches for an exact symbol match among symbol-type entries.
 *
 * @param index - The code index
 * @param symbolName - Name of the symbol to look up
 * @returns The definition entry, or null if not found
 */
export async function getDefinition(
  index: CodeIndex,
  symbolName: string
): Promise<IndexEntry | null> {
  const data = indexStore.get(index.id);
  if (!data) return null;

  const lowerName = symbolName.toLowerCase();

  // Look for exact match first
  const indices = data.invertedIndex.get(lowerName);
  if (!indices) return null;

  // Find the best definition entry (prefer symbols over chunks)
  let best: IndexEntry | null = null;
  for (const idx of indices) {
    const entry = data.entries[idx];
    if (entry.type !== 'symbol') continue;
    if (entry.name.toLowerCase() !== lowerName) continue;

    // Prefer entries with kind = function, class, interface, type, enum
    if (
      entry.kind === 'function' || entry.kind === 'class' ||
      entry.kind === 'interface' || entry.kind === 'type' ||
      entry.kind === 'enum'
    ) {
      return entry;
    }

    if (!best) best = entry;
  }

  return best;
}

/**
 * Get type information for a type name from the index.
 *
 * Searches for type-related entries (interface, type alias, enum, class).
 *
 * @param index - The code index
 * @param typeName - Name of the type to look up
 * @returns The type information entry, or null if not found
 */
export async function getTypeInfo(
  index: CodeIndex,
  typeName: string
): Promise<IndexEntry | null> {
  const data = indexStore.get(index.id);
  if (!data) return null;

  const lowerName = typeName.toLowerCase();
  const typeKinds = new Set(['interface', 'type', 'enum', 'class']);

  // Look for exact match first
  const indices = data.invertedIndex.get(lowerName);
  if (!indices) return null;

  for (const idx of indices) {
    const entry = data.entries[idx];
    if (entry.type !== 'symbol') continue;
    if (entry.name.toLowerCase() !== lowerName) continue;
    if (entry.kind && typeKinds.has(entry.kind)) {
      return entry;
    }
  }

  return null;
}
