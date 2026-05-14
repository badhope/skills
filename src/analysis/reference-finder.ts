/**
 * Reference Finder
 *
 * Finds all references to a symbol across the codebase using tree-sitter
 * AST analysis. Locates the definition first, then searches all files
 * for usages, classifying each reference by context (import, export,
 * definition, type-reference, or usage).
 */

import * as path from 'path';
import { parseFile, parseFiles } from '../parser/engine.js';
import { extractSymbols, findSymbolByName } from '../parser/symbols.js';
import type { CodeSymbol } from '../parser/symbols.js';
import { getLanguageByFilePath } from '../parser/languages.js';
import { globMatch } from '../utils/glob.js';
import { collectSourceFiles } from '../utils/file-system.js';

/** A single reference to a symbol */
export interface Reference {
  /** File path where the reference occurs */
  filePath: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (0-based) */
  column: number;
  /** The line content */
  context: string;
  /** Type of reference */
  type: 'usage' | 'import' | 'export' | 'definition' | 'type-reference';
}

/** Complete reference search result */
export interface ReferenceResult {
  /** The symbol name that was searched */
  symbolName: string;
  /** Location of the definition, if found */
  definition: { filePath: string; line: number } | null;
  /** All references found */
  references: Reference[];
  /** Number of files containing references */
  fileCount: number;
  /** Total number of references */
  referenceCount: number;
}

/** Options for reference finding */
export interface FindReferencesOptions {
  /** Include the definition in results (default: true) */
  includeDefinition?: boolean;
  /** Glob patterns to restrict which files to search */
  filePatterns?: string[];
}

/**
 * Classify a reference based on its AST context.
 *
 * Walks up the AST to determine if the reference is inside an import,
 * export, type annotation, or the definition itself.
 */
function classifyReference(
  node: any,
  symbolName: string,
  definitionLine: number,
  filePath: string,
  source: string
): Reference['type'] {
  const line = node.startPosition.row; // 0-based
  const lines = source.split('\n');
  const context = lines[line] ?? '';

  // Check if this is the definition line
  if (line === definitionLine) {
    return 'definition';
  }

  // Walk up the AST to find context
  let current: any = node;
  let depth = 0;
  const maxDepth = 10;

  while (current && depth < maxDepth) {
    const nodeType = current.type;

    // Import context
    if (
      nodeType === 'import_statement' ||
      nodeType === 'import_declaration' ||
      nodeType === 'import_from_statement' ||
      nodeType === 'import_specifier'
    ) {
      return 'import';
    }

    // Export context
    if (
      nodeType === 'export_statement' ||
      nodeType === 'export_default_declaration' ||
      nodeType === 'export_named_declaration' ||
      nodeType === 'export_specifier'
    ) {
      return 'export';
    }

    // Type annotation context
    if (
      nodeType === 'type_annotation' ||
      nodeType === 'predefined_type' ||
      nodeType === 'type_identifier' ||
      nodeType === 'generic_type' ||
      nodeType === 'union_type' ||
      nodeType === 'intersection_type' ||
      nodeType === 'punctuation' // inside type annotations
    ) {
      return 'type-reference';
    }

    // TS-specific type contexts
    if (
      nodeType === 'implements_clause' ||
      nodeType === 'extends_clause'
    ) {
      return 'type-reference';
    }

    // If we reach a function/class body, it's a usage
    if (
      nodeType === 'statement_block' ||
      nodeType === 'function_body' ||
      nodeType === 'block'
    ) {
      return 'usage';
    }

    current = current.parent;
    depth++;
  }

  // Default: check if the line looks like a type reference
  const trimmed = context.trim();
  if (
    trimmed.startsWith('import ') ||
    trimmed.startsWith('from ') ||
    trimmed.includes('import ')
  ) {
    return 'import';
  }

  if (
    trimmed.startsWith('export ') ||
    trimmed.startsWith('export{')
  ) {
    return 'export';
  }

  // Check for type annotation patterns
  if (trimmed.includes(': ') && !trimmed.includes('=>')) {
    const colonIdx = trimmed.indexOf(':');
    const afterColon = trimmed.substring(colonIdx + 1).trim();
    if (afterColon.startsWith(symbolName)) {
      return 'type-reference';
    }
  }

  return 'usage';
}

/**
 * Find all references to a symbol within a single file.
 *
 * @param symbolName - The symbol name to search for
 * @param filePath - Absolute path to the file
 * @returns Array of references found in this file
 */
export async function findReferencesInFile(
  symbolName: string,
  filePath: string
): Promise<Reference[]> {
  const parseResult = await parseFile(filePath);
  if (!parseResult) return [];

  const { tree, source } = parseResult;
  const rootNode = tree.rootNode;
  const references: Reference[] = [];
  const lines = source.split('\n');

  // Word-boundary regex to find the symbol
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'g');

  // Find all symbol definitions to know the definition line
  const symbols = extractSymbols(parseResult);
  const definitionSymbol = symbols.find(
    s => s.name === symbolName && (
      s.kind === 'function' || s.kind === 'class' || s.kind === 'interface' ||
      s.kind === 'type' || s.kind === 'enum' || s.kind === 'variable' ||
      s.kind === 'method' || s.kind === 'module' || s.kind === 'namespace'
    )
  );
  const definitionLine = definitionSymbol?.startLine ?? -1;

  // Search each line for the symbol name
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(line)) !== null) {
      const column = match.index;
      const line1Based = i + 1;

      // Try to find the AST node at this position
      const node = rootNode.descendantForPosition({
        row: i,
        column,
      });

      const refType = node
        ? classifyReference(node, symbolName, definitionLine, filePath, source)
        : 'usage';

      references.push({
        filePath,
        line: line1Based,
        column,
        context: line,
        type: refType,
      });
    }
  }

  return references;
}

/**
 * Find all references to a symbol across the codebase.
 *
 * First locates the definition using AST symbol extraction, then searches
 * all files for the symbol name using word-boundary regex. Each reference
 * is classified by its AST context.
 *
 * @param symbolName - The symbol name to search for
 * @param rootDir - Root directory of the project
 * @param options - Search options
 * @returns Complete reference result
 */
export async function findReferences(
  symbolName: string,
  rootDir: string,
  options?: FindReferencesOptions
): Promise<ReferenceResult> {
  const includeDefinition = options?.includeDefinition ?? true;
  const filePatterns = options?.filePatterns;

  // Step 1: Collect source files
  const allFiles = await collectSourceFiles(rootDir);

  // Apply file pattern filters if provided
  let filesToSearch = allFiles;
  if (filePatterns && filePatterns.length > 0) {
    filesToSearch = allFiles.filter(fp => {
      const relative = path.relative(rootDir, fp).replace(/\\/g, '/');
      return filePatterns.some(pattern => globMatch(relative, pattern));
    });
  }

  // Step 2: Parse all files and find the definition
  const parseResults = await parseFiles(filesToSearch);
  let definition: { filePath: string; line: number } | null = null;

  // Search for the definition across all parsed files
  for (const [filePath, result] of parseResults) {
    const symbols = extractSymbols(result);
    const matches = findSymbolByName(symbols, symbolName);

    for (const sym of matches) {
      if (
        sym.kind === 'function' || sym.kind === 'class' || sym.kind === 'interface' ||
        sym.kind === 'type' || sym.kind === 'enum' || sym.kind === 'variable' ||
        sym.kind === 'method' || sym.kind === 'module' || sym.kind === 'namespace'
      ) {
        // Prefer exact match over partial match
        if (sym.name === symbolName) {
          definition = {
            filePath,
            line: sym.startLine + 1, // convert to 1-based
          };
          break;
        }
      }
    }
    if (definition && definition.filePath === filePath) break;
  }

  // Step 3: Search all files for references
  const allReferences: Reference[] = [];
  const batchSize = 10;

  for (let i = 0; i < filesToSearch.length; i += batchSize) {
    const batch = filesToSearch.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        const refs = await findReferencesInFile(symbolName, fp);
        return refs;
      })
    );
    for (const refs of batchResults) {
      allReferences.push(...refs);
    }
  }

  // Step 4: Filter out definition if not requested
  const filteredReferences = includeDefinition
    ? allReferences
    : allReferences.filter(r => r.type !== 'definition');

  // Step 5: Sort by file path, then line number
  filteredReferences.sort((a, b) => {
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    return a.line - b.line;
  });

  // Step 6: Count unique files
  const uniqueFiles = new Set(filteredReferences.map(r => r.filePath));

  return {
    symbolName,
    definition,
    references: filteredReferences,
    fileCount: uniqueFiles.size,
    referenceCount: filteredReferences.length,
  };
}
