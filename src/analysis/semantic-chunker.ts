/**
 * Semantic Code Chunker
 *
 * Splits source files into semantically meaningful chunks using tree-sitter
 * AST analysis. Each top-level declaration (function, class, interface, etc.)
 * becomes a chunk, with import statements grouped together and leading
 * comments attached to their following declarations.
 */

import * as fs from 'fs/promises';
import { parseFile } from '../parser/engine.js';
import { extractSymbols } from '../parser/symbols.js';
import type { CodeSymbol, SymbolKind } from '../parser/symbols.js';

/** A semantically meaningful chunk of code */
export interface CodeChunk {
  /** Unique ID (file:line-start) */
  id: string;
  /** Absolute file path */
  filePath: string;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** The actual code text */
  content: string;
  /** Chunk type */
  type: 'function' | 'class' | 'interface' | 'module' | 'block' | 'import-section' | 'comment-section' | 'other';
  /** Symbol name if applicable */
  name?: string;
  /** Function/class signature */
  signature?: string;
  /** Depth in the AST */
  nestingLevel: number;
  /** Estimated token count (~4 chars/token) */
  tokens: number;
  /** IDs of chunks this depends on (import references) */
  dependencies: string[];
}

/** Options for chunking */
export interface ChunkOptions {
  /** Maximum tokens per chunk (default: 512) */
  maxChunkTokens?: number;
  /** Minimum lines per chunk (default: 3) */
  minChunkLines?: number;
  /** Don't split inside functions/classes (default: true) */
  respectBoundaries?: boolean;
}

const DEFAULT_MAX_CHUNK_TOKENS = 512;
const DEFAULT_MIN_CHUNK_LINES = 3;
const CHARS_PER_TOKEN = 4;

/** Node types that represent top-level declarations */
const DECLARATION_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'generator_function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration',
  'variable_declaration',
  'export_statement',
  'export_default_declaration',
  'export_named_declaration',
  // Python
  'function_definition',
  'class_definition',
]);

/** Import node types */
const IMPORT_TYPES = new Set([
  'import_statement',
  'import_declaration',
  'import_from_statement',
]);

/** Comment node types */
const COMMENT_TYPES = new Set([
  'comment',
  'block_comment',
  'line_comment',
]);

/**
 * Map a tree-sitter node type to a CodeChunk type.
 */
function nodeTypeToChunkType(nodeType: string, symbolKind?: SymbolKind): CodeChunk['type'] {
  if (IMPORT_TYPES.has(nodeType)) return 'import-section';
  if (COMMENT_TYPES.has(nodeType)) return 'comment-section';
  if (symbolKind === 'function' || symbolKind === 'method') return 'function';
  if (symbolKind === 'class') return 'class';
  if (symbolKind === 'interface') return 'interface';
  if (symbolKind === 'module' || symbolKind === 'namespace') return 'module';
  if (DECLARATION_TYPES.has(nodeType)) return 'other';
  return 'other';
}

/**
 * Estimate token count using ~4 chars/token heuristic.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Extract lines from source text for a given 1-based line range.
 */
function extractLines(source: string, startLine: number, endLine: number): string {
  const lines = source.split('\n');
  const startIdx = Math.max(0, startLine - 1);
  const endIdx = Math.min(lines.length, endLine);
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Extract the leading JSDoc or comment block attached to a node.
 * Returns the start line of the comment block (1-based), or null.
 */
function findLeadingComment(node: any, source: string): { startLine: number; endLine: number } | null {
  const lines = source.split('\n');
  const nodeStartLine = node.startPosition.row; // 0-based

  // Look backwards from the node's start position for comments
  let prevSibling = node.previousNamedSibling;
  if (!prevSibling) {
    // Try the actual previous sibling (which might be a comment)
    const parent = node.parent;
    if (parent) {
      for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        if (child === node) break;
        if (child && COMMENT_TYPES.has(child.type)) {
          prevSibling = child;
        } else if (child && !COMMENT_TYPES.has(child.type)) {
          prevSibling = null;
        }
      }
    }
  }

  if (prevSibling && COMMENT_TYPES.has(prevSibling.type)) {
    const commentEndLine = prevSibling.endPosition.row;
    // Check there are only blank lines between comment and node
    const gap = nodeStartLine - commentEndLine - 1;
    if (gap <= 1) {
      return {
        startLine: prevSibling.startPosition.row + 1, // convert to 1-based
        endLine: prevSibling.endPosition.row + 1,
      };
    }
  }

  return null;
}

/**
 * Extract imported symbol names from an import node for dependency tracking.
 */
function extractImportedNames(node: any): string[] {
  const names: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    // import { Foo, Bar } from '...'
    if (child.type === 'import_specifier' || child.type === 'identifier') {
      const name = child.text;
      if (name && name !== 'from' && name !== 'type' && name !== 'import') {
        names.push(name);
      }
    }
    // import * as Foo from '...'
    if (child.type === 'namespace_import') {
      const nameNode = child.childForFieldName('name');
      if (nameNode) names.push(nameNode.text);
    }
    // import Foo from '...' (default import)
    if (child.type === 'import_clause') {
      for (let j = 0; j < child.childCount; j++) {
        const sub = child.child(j);
        if (sub && sub.type === 'identifier') {
          names.push(sub.text);
        }
      }
    }
  }
  return names;
}

/**
 * Try to split a large class chunk at method boundaries.
 */
function splitClassAtMethods(
  node: any,
  source: string,
  filePath: string,
  className: string,
  baseNestingLevel: number,
  maxTokens: number
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = source.split('\n');

  // Collect method nodes
  const methods: any[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && (
      child.type === 'method_definition' ||
      child.type === 'public_field_definition' ||
      child.type === 'property_definition' ||
      child.type === 'method_signature'
    )) {
      methods.push(child);
    }
  }

  if (methods.length <= 1) return [];

  // Group consecutive methods to fit within token budget
  let groupStart: any = methods[0];
  let groupEnd: any = methods[0];

  for (let i = 1; i < methods.length; i++) {
    const proposedEnd = methods[i];
    const content = extractLines(
      source,
      groupStart.startPosition.row + 1,
      proposedEnd.endPosition.row + 1
    );
    const tokens = estimateTokens(content);

    if (tokens > maxTokens && groupStart !== groupEnd) {
      // Emit current group
      const chunkContent = extractLines(
        source,
        groupStart.startPosition.row + 1,
        groupEnd.endPosition.row + 1
      );
      chunks.push({
        id: `${filePath}:${groupStart.startPosition.row + 1}`,
        filePath,
        startLine: groupStart.startPosition.row + 1,
        endLine: groupEnd.endPosition.row + 1,
        content: chunkContent,
        type: 'block',
        name: `${className}.${groupStart.childForFieldName('name')?.text ?? 'anonymous'}`,
        nestingLevel: baseNestingLevel + 1,
        tokens: estimateTokens(chunkContent),
        dependencies: [],
      });
      groupStart = proposedEnd;
      groupEnd = proposedEnd;
    } else {
      groupEnd = proposedEnd;
    }
  }

  // Emit final group
  const finalContent = extractLines(
    source,
    groupStart.startPosition.row + 1,
    groupEnd.endPosition.row + 1
  );
  chunks.push({
    id: `${filePath}:${groupStart.startPosition.row + 1}`,
    filePath,
    startLine: groupStart.startPosition.row + 1,
    endLine: groupEnd.endPosition.row + 1,
    content: finalContent,
    type: 'block',
    name: `${className}.${groupStart.childForFieldName('name')?.text ?? 'anonymous'}`,
    nestingLevel: baseNestingLevel + 1,
    tokens: estimateTokens(finalContent),
    dependencies: [],
  });

  return chunks;
}

/**
 * Split a single file into semantically meaningful chunks.
 *
 * @param filePath - Absolute path to the source file
 * @param options - Chunking options
 * @returns Array of code chunks
 */
export async function chunkFile(
  filePath: string,
  options?: ChunkOptions
): Promise<CodeChunk[]> {
  const maxTokens = options?.maxChunkTokens ?? DEFAULT_MAX_CHUNK_TOKENS;
  const minLines = options?.minChunkLines ?? DEFAULT_MIN_CHUNK_LINES;
  const respectBoundaries = options?.respectBoundaries ?? true;

  const parseResult = await parseFile(filePath);
  if (!parseResult) return [];

  const { tree, source } = parseResult;
  const rootNode = tree.rootNode;
  const symbols = extractSymbols(parseResult);
  const chunks: CodeChunk[] = [];

  // Build a map of symbol start lines for quick lookup
  const symbolByLine = new Map<number, CodeSymbol>();
  for (const sym of symbols) {
    symbolByLine.set(sym.startLine, sym);
  }

  // Collect import nodes at the top level
  const importNodes: any[] = [];
  // Collect top-level declaration nodes
  const declarationNodes: any[] = [];
  // Track which lines are covered by declarations/imports
  const coveredLines = new Set<number>();

  for (let i = 0; i < rootNode.childCount; i++) {
    const child = rootNode.child(i);
    if (!child) continue;

    if (IMPORT_TYPES.has(child.type)) {
      importNodes.push(child);
      for (let l = child.startPosition.row; l <= child.endPosition.row; l++) {
        coveredLines.add(l);
      }
    } else if (DECLARATION_TYPES.has(child.type)) {
      declarationNodes.push(child);
      for (let l = child.startPosition.row; l <= child.endPosition.row; l++) {
        coveredLines.add(l);
      }
    }
  }

  // 1. Create import-section chunk if there are imports
  if (importNodes.length > 0) {
    const firstImport = importNodes[0];
    const lastImport = importNodes[importNodes.length - 1];
    const startLine = firstImport.startPosition.row + 1; // 1-based
    const endLine = lastImport.endPosition.row + 1;
    const content = extractLines(source, startLine, endLine);
    const importedNames = importNodes.flatMap(extractImportedNames);

    chunks.push({
      id: `${filePath}:${startLine}`,
      filePath,
      startLine,
      endLine,
      content,
      type: 'import-section',
      nestingLevel: 0,
      tokens: estimateTokens(content),
      dependencies: importedNames.map(n => `${filePath}:${n}`),
    });
  }

  // 2. Create chunks for each declaration
  for (const node of declarationNodes) {
    const nodeStartLine = node.startPosition.row; // 0-based
    const nodeEndLine = node.endPosition.row; // 0-based

    // Find leading comment
    const leadingComment = findLeadingComment(node, source);
    let effectiveStartLine = nodeStartLine + 1; // 1-based
    if (leadingComment) {
      effectiveStartLine = leadingComment.startLine;
    }

    const effectiveEndLine = nodeEndLine + 1; // 1-based
    const content = extractLines(source, effectiveStartLine, effectiveEndLine);
    const tokenCount = estimateTokens(content);

    // Look up symbol info
    const sym = symbolByLine.get(nodeStartLine);
    const chunkType = nodeTypeToChunkType(node.type, sym?.kind);
    const chunkName = sym?.name;
    const signature = sym?.signature;

    // Check if chunk exceeds token budget
    if (tokenCount > maxTokens && respectBoundaries) {
      // Try to split classes at method boundaries
      if (node.type === 'class_declaration' || node.type === 'class_definition') {
        const subChunks = splitClassAtMethods(
          node, source, filePath, chunkName ?? 'anonymous', 1, maxTokens
        );
        if (subChunks.length > 0) {
          chunks.push(...subChunks);
          continue;
        }
      }
      // For oversized chunks that can't be split, keep as-is
    }

    // Skip chunks below minimum line threshold (unless they are imports or comments)
    const lineCount = effectiveEndLine - effectiveStartLine + 1;
    if (lineCount < minLines && chunkType !== 'import-section' && chunkType !== 'comment-section') {
      continue;
    }

    chunks.push({
      id: `${filePath}:${effectiveStartLine}`,
      filePath,
      startLine: effectiveStartLine,
      endLine: effectiveEndLine,
      content,
      type: chunkType,
      name: chunkName,
      signature,
      nestingLevel: 0,
      tokens: tokenCount,
      dependencies: [],
    });
  }

  // 3. Collect standalone comment blocks not attached to any declaration
  for (let i = 0; i < rootNode.childCount; i++) {
    const child = rootNode.child(i);
    if (!child || !COMMENT_TYPES.has(child.type)) continue;

    const startRow = child.startPosition.row;
    if (coveredLines.has(startRow)) continue;

    const startLine = startRow + 1; // 1-based
    const endLine = child.endPosition.row + 1;
    const content = extractLines(source, startLine, endLine);

    chunks.push({
      id: `${filePath}:${startLine}`,
      filePath,
      startLine,
      endLine,
      content,
      type: 'comment-section',
      nestingLevel: 0,
      tokens: estimateTokens(content),
      dependencies: [],
    });

    for (let l = startRow; l <= child.endPosition.row; l++) {
      coveredLines.add(l);
    }
  }

  // Sort chunks by start line
  chunks.sort((a, b) => a.startLine - b.startLine);

  return chunks;
}

/**
 * Chunk multiple files into semantically meaningful pieces.
 *
 * @param filePaths - Absolute paths to source files
 * @param options - Chunking options
 * @returns Map of file path to array of chunks
 */
export async function chunkFiles(
  filePaths: string[],
  options?: ChunkOptions
): Promise<Map<string, CodeChunk[]>> {
  const result = new Map<string, CodeChunk[]>();

  const batchSize = 10;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        const chunks = await chunkFile(fp, options);
        return [fp, chunks] as const;
      })
    );
    for (const [fp, fileChunks] of batchResults) {
      if (fileChunks.length > 0) {
        result.set(fp, fileChunks);
      }
    }
  }

  return result;
}

/**
 * Retrieve a chunk by its unique ID.
 *
 * @param chunks - Map of file paths to chunk arrays
 * @param id - Chunk ID in format "filePath:line-start"
 * @returns The matching chunk, or null
 */
export function getChunkById(
  chunks: Map<string, CodeChunk[]>,
  id: string
): CodeChunk | null {
  for (const fileChunks of chunks.values()) {
    for (const chunk of fileChunks) {
      if (chunk.id === id) return chunk;
    }
  }
  return null;
}

/**
 * Find chunks relevant to a text query using simple text matching.
 *
 * Scores chunks based on:
 * - Name exact match (highest)
 * - Name contains query
 * - Content contains query
 * - Type matches query keyword
 *
 * @param chunks - Map of file paths to chunk arrays
 * @param query - Search query string
 * @param maxResults - Maximum results to return (default: 10)
 * @returns Array of relevant chunks sorted by relevance
 */
export function findRelevantChunks(
  chunks: Map<string, CodeChunk[]>,
  query: string,
  maxResults: number = 10
): CodeChunk[] {
  const lowerQuery = query.toLowerCase();
  const scored: Array<{ chunk: CodeChunk; score: number }> = [];

  for (const fileChunks of chunks.values()) {
    for (const chunk of fileChunks) {
      let score = 0;

      // Exact name match
      if (chunk.name && chunk.name.toLowerCase() === lowerQuery) {
        score += 100;
      }
      // Name starts with query
      else if (chunk.name && chunk.name.toLowerCase().startsWith(lowerQuery)) {
        score += 80;
      }
      // Name contains query
      else if (chunk.name && chunk.name.toLowerCase().includes(lowerQuery)) {
        score += 60;
      }

      // Type keyword match (e.g. query "function" matches type 'function')
      if (chunk.type.toLowerCase().includes(lowerQuery)) {
        score += 40;
      }

      // Content contains query
      if (chunk.content.toLowerCase().includes(lowerQuery)) {
        score += 20;
        // Boost if the query appears multiple times
        const occurrences = chunk.content.toLowerCase().split(lowerQuery).length - 1;
        score += Math.min(occurrences * 5, 30);
      }

      if (score > 0) {
        scored.push({ chunk, score });
      }
    }
  }

  // Sort by score descending, then by file path and line
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.chunk.filePath !== b.chunk.filePath) {
      return a.chunk.filePath.localeCompare(b.chunk.filePath);
    }
    return a.chunk.startLine - b.chunk.startLine;
  });

  return scored.slice(0, maxResults).map(s => s.chunk);
}
