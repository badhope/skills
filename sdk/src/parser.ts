/**
 * DevFlow Agent SDK - Parser Module
 *
 * Provides programmatic access to the code parsing and analysis
 * capabilities of DevFlow Agent.
 */

import type { ParseResult, Symbol, RepoMapOptions, RepoMapResult } from './types.js';

/**
 * DevFlowParser - Code parsing and analysis.
 *
 * @example
 * ```typescript
 * const parser = new DevFlowParser();
 * const result = await parser.parseFile('./src/app.ts');
 * console.log(result.symbols);
 * ```
 */
export class DevFlowParser {
  private initialized = false;

  /**
   * Ensure tree-sitter languages are initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    const { initLanguages } = await import('../../dist/parser/languages.js');
    await initLanguages();
    this.initialized = true;
  }

  /**
   * Parse a source file and extract its structure.
   *
   * @param filePath - Path to the source file
   * @returns Parse result with symbols and metadata
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    await this.ensureInitialized();

    const { parseFile: coreParseFile } = await import('../../dist/parser/engine.js');
    const { extractSymbols } = await import('../../dist/parser/symbols.js');
    const { estimateTokens } = await import('../../dist/parser/token-budget.js');

    const result = await coreParseFile(filePath);
    if (!result) {
      return {
        language: 'unknown',
        symbols: [],
        tokens: 0,
        filePath,
      };
    }

    const rawSymbols = extractSymbols(result);
    const symbols = this.convertSymbols(rawSymbols, filePath);

    return {
      language: result.language.name,
      symbols,
      tokens: estimateTokens(result.source),
      filePath,
    };
  }

  /**
   * Parse source code string directly.
   *
   * @param source - Source code text
   * @param language - Language identifier or file extension
   * @returns Parse result with symbols
   */
  async parseSource(source: string, language: string): Promise<ParseResult> {
    await this.ensureInitialized();

    const { parseSource: coreParseSource } = await import('../../dist/parser/engine.js');
    const { extractSymbols } = await import('../../dist/parser/symbols.js');
    const { estimateTokens } = await import('../../dist/parser/token-budget.js');

    // Use language as a fake file path to get language detection
    const filePath = `file.${language}`;
    const result = coreParseSource(source, filePath);

    if (!result) {
      return {
        language,
        symbols: [],
        tokens: estimateTokens(source),
      };
    }

    const rawSymbols = extractSymbols(result);
    const symbols = this.convertSymbols(rawSymbols, filePath);

    return {
      language: result.language.name,
      symbols,
      tokens: estimateTokens(source),
    };
  }

  /**
   * Generate a repository map for context.
   *
   * This creates a compact representation of the codebase structure,
   * useful for providing context to LLMs.
   *
   * @param rootDir - Root directory of the project
   * @param options - Generation options
   * @returns Repo map result
   */
  async generateRepoMap(rootDir: string, options?: RepoMapOptions): Promise<RepoMapResult> {
    await this.ensureInitialized();

    const { generateRepoMap: coreGenerateRepoMap } = await import('../../dist/parser/repo-map.js');

    const result = await coreGenerateRepoMap(rootDir, options);

    return {
      map: result.map,
      fileCount: result.fileCount,
      symbolCount: result.symbolCount,
      tokenCount: result.tokenCount,
      skippedFiles: result.skippedFiles,
    };
  }

  /**
   * Extract symbols from source code (synchronous version).
   *
   * @param source - Source code text
   * @param language - Language identifier
   * @returns Array of symbols
   */
  extractSymbols(source: string, language: string): Symbol[] {
    // This is a simplified synchronous version
    // For full parsing, use parseSource() instead
    const symbols: Symbol[] = [];
    const lines = source.split('\n');

    // Simple regex-based extraction for common patterns
    const patterns: Record<string, RegExp> = {
      function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      class: /^(?:export\s+)?class\s+(\w+)/,
      interface: /^(?:export\s+)?interface\s+(\w+)/,
      type: /^(?:export\s+)?type\s+(\w+)/,
      enum: /^(?:export\s+)?enum\s+(\w+)/,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [kind, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          symbols.push({
            name: match[1],
            kind: kind as Symbol['kind'],
            startLine: i + 1,
            endLine: i + 1,
          });
        }
      }
    }

    return symbols;
  }

  /**
   * Get the language for a file path.
   *
   * @param filePath - File path to check
   * @returns Language name or null if unsupported
   */
  async getLanguage(filePath: string): Promise<string | null> {
    const { getLanguageByFilePath } = await import('../../dist/parser/languages.js');
    const lang = getLanguageByFilePath(filePath);
    return lang?.name ?? null;
  }

  private convertSymbols(rawSymbols: any[], filePath: string): Symbol[] {
    return rawSymbols
      .filter((s: any) => this.isValidSymbolKind(s.kind))
      .map((s: any) => ({
        name: s.name,
        kind: s.kind as Symbol['kind'],
        startLine: s.startLine + 1, // Convert 0-based to 1-based
        endLine: s.endLine + 1,
        signature: s.signature,
        parent: s.parent,
      }));
  }

  private isValidSymbolKind(kind: string): boolean {
    const validKinds = ['function', 'class', 'interface', 'method', 'variable', 'type', 'enum'];
    return validKinds.includes(kind);
  }
}

/**
 * Convenience function to parse a file.
 *
 * @param filePath - Path to the source file
 * @returns Parse result
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const parser = new DevFlowParser();
  return parser.parseFile(filePath);
}

/**
 * Convenience function to generate a repo map.
 *
 * @param rootDir - Root directory of the project
 * @returns Repo map string
 */
export async function generateRepoMap(rootDir: string): Promise<string> {
  const parser = new DevFlowParser();
  const result = await parser.generateRepoMap(rootDir);
  return result.map;
}
