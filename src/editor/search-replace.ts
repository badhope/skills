/**
 * Aider-style SEARCH/REPLACE block parser and executor
 *
 * Parses SEARCH/REPLACE blocks from LLM output and applies them to files.
 * Supports the standard Aider format with <<<<<<< SEARCH / ======= / >>>>>>> REPLACE
 * markers, as well as a simpler format for direct search/replace pairs.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { locateEditTarget } from './edit-target.js';
import type { EditTarget } from './edit-target.js';
import { applyEdit, applyMultipleEdits, generateDiff } from './diff-generator.js';
import type { EditOperation, DiffResult } from './diff-generator.js';

/** A single SEARCH/REPLACE block */
export interface SearchReplaceBlock {
  /** Optional file path (defaults to current file context) */
  filePath?: string;
  /** The exact content to search for */
  search: string;
  /** The replacement content */
  replace: string;
  /** If true, search is treated as a regex pattern */
  isRegex?: boolean;
}

/** Result of executing a SEARCH/REPLACE block */
export interface SearchReplaceResult {
  /** Whether the block was valid */
  success: boolean;
  /** File path that was targeted */
  filePath: string;
  /** Whether the edit was actually applied */
  applied: boolean;
  /** Error message if unsuccessful */
  error?: string;
  /** Unified diff of the change */
  diff?: string;
  /** Original content before the edit */
  originalContent?: string;
  /** New content after the edit */
  newContent?: string;
}

/** Markers for the Aider-style SEARCH/REPLACE format */
const SEARCH_MARKER = '<<<<<<< SEARCH';
const SPLIT_MARKER = '=======';
const REPLACE_MARKER = '>>>>>>> REPLACE';

/**
 * Parse Aider-style SEARCH/REPLACE blocks from LLM output text.
 *
 * Supports two formats:
 *
 * 1. Full Aider format with optional file path header:
 * ```
 * filePath.ts
 * <<<<<<< SEARCH
 * old content
 * =======
 * new content
 * >>>>>>> REPLACE
 * ```
 *
 * 2. Consecutive blocks without file path (uses default):
 * ```
 * <<<<<<< SEARCH
 * old content
 * =======
 * new content
 * >>>>>>> REPLACE
 * ```
 *
 * Also supports the legacy triple-angle format:
 * ```
 * <<<SEARCH>>>
 * old content
 * <<<REPLACE>>>
 * new content
 * <<<END>>>
 * ```
 *
 * @param text - The LLM output text containing SEARCH/REPLACE blocks
 * @returns Array of parsed SearchReplaceBlock objects
 */
export function parseSearchReplaceBlocks(text: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];

  // Try Aider-style format first
  const aiderBlocks = parseAiderFormat(text);
  if (aiderBlocks.length > 0) {
    return aiderBlocks;
  }

  // Try legacy format
  const legacyBlocks = parseLegacyFormat(text);
  if (legacyBlocks.length > 0) {
    return legacyBlocks;
  }

  return blocks;
}

/**
 * Parse the standard Aider SEARCH/REPLACE format.
 */
function parseAiderFormat(text: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Look for SEARCH marker
    if (lines[i].trim() === SEARCH_MARKER) {
      const searchStart = i + 1;
      let splitIdx = -1;
      let replaceIdx = -1;

      // Find SPLIT and REPLACE markers
      for (let j = searchStart; j < lines.length; j++) {
        if (lines[j].trim() === SPLIT_MARKER && splitIdx === -1) {
          splitIdx = j;
        } else if (lines[j].trim() === REPLACE_MARKER) {
          replaceIdx = j;
          break;
        }
      }

      if (splitIdx === -1 || replaceIdx === -1) {
        i++;
        continue;
      }

      const searchContent = lines.slice(searchStart, splitIdx).join('\n');
      const replaceContent = lines.slice(splitIdx + 1, replaceIdx).join('\n');

      // Check if there's a file path on the line before SEARCH marker
      let filePath: string | undefined;
      if (i > 0) {
        const prevLine = lines[i - 1].trim();
        // Heuristic: if the previous line looks like a file path
        if (prevLine && !prevLine.startsWith('#') && !prevLine.startsWith('```') &&
            (prevLine.includes('.') || prevLine.includes('/'))) {
          filePath = prevLine;
        }
      }

      blocks.push({
        filePath,
        search: searchContent,
        replace: replaceContent,
      });

      i = replaceIdx + 1;
    } else {
      i++;
    }
  }

  return blocks;
}

/**
 * Parse the legacy <<<SEARCH>>> / <<<REPLACE>>> / <<<END>>> format.
 */
function parseLegacyFormat(text: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const searchRegex = /<<<SEARCH>>>\n([\s\S]*?)<<<REPLACE>>>\n([\s\S]*?)<<<END>>>/g;
  let match: RegExpExecArray | null;

  while ((match = searchRegex.exec(text)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2],
    });
  }

  return blocks;
}

/**
 * Normalize whitespace for content matching.
 *
 * Removes leading/trailing blank lines and normalizes indentation
 * to handle cases where the LLM output has different indentation
 * than the actual file content.
 */
function normalizeContent(content: string): string {
  const lines = content.split('\n');

  // Remove leading and trailing blank lines
  let start = 0;
  while (start < lines.length && lines[start].trim() === '') start++;
  let end = lines.length;
  while (end > start && lines[end - 1].trim() === '') end--;

  const trimmed = lines.slice(start, end);

  if (trimmed.length === 0) return '';

  // Detect common indentation
  const nonEmpty = trimmed.filter(l => l.trim() !== '');
  if (nonEmpty.length === 0) return '';

  const indentSizes = nonEmpty.map(l => {
    const match = l.match(/^(\s*)/);
    return match ? match[1].length : 0;
  });
  const commonIndent = Math.min(...indentSizes);

  // Remove common indentation
  const normalized = trimmed.map(l => {
    if (l.trim() === '') return '';
    return l.substring(commonIndent);
  });

  return normalized.join('\n');
}

/**
 * Find the search content within the source and return an EditTarget.
 */
function findSearchTarget(
  filePath: string,
  source: string,
  search: string,
  isRegex?: boolean
): EditTarget | null {
  const lines = source.split('\n');

  if (isRegex) {
    // Regex search
    const pattern = new RegExp(search, 'm');
    const match = source.match(pattern);
    if (!match || match.index === undefined) return null;

    const prefix = source.substring(0, match.index);
    const startLine = (prefix.match(/\n/g) || []).length + 1;
    const matchedText = match[0];
    const endLine = startLine + (matchedText.match(/\n/g) || []).length;

    return {
      filePath,
      startLine,
      endLine,
      content: matchedText,
    };
  }

  // Exact match - try raw first
  const exactIndex = source.indexOf(search);
  if (exactIndex !== -1) {
    const prefix = source.substring(0, exactIndex);
    const startLine = (prefix.match(/\n/g) || []).length + 1;
    const searchLines = search.split('\n');
    const endLine = startLine + searchLines.length - 1;

    return {
      filePath,
      startLine,
      endLine,
      content: search,
    };
  }

  // Try normalized whitespace match
  const normalizedSearch = normalizeContent(search);
  if (!normalizedSearch) return null;

  const normalizedSearchLines = normalizedSearch.split('\n');

  for (let i = 0; i <= lines.length - normalizedSearchLines.length; i++) {
    const candidate = lines.slice(i, i + normalizedSearchLines.length);
    const normalizedCandidate = normalizeContent(candidate.join('\n'));

    if (normalizedCandidate === normalizedSearch) {
      return {
        filePath,
        startLine: i + 1,
        endLine: i + normalizedSearchLines.length,
        content: candidate.join('\n'),
      };
    }
  }

  return null;
}

/**
 * Execute a single SEARCH/REPLACE block against a file.
 *
 * @param block - The parsed SEARCH/REPLACE block
 * @param filePath - The file path to apply the edit to
 * @returns SearchReplaceResult with success/failure info and diff
 */
export async function executeSearchReplace(
  block: SearchReplaceBlock,
  filePath: string
): Promise<SearchReplaceResult> {
  const targetPath = block.filePath || filePath;

  let source: string;
  try {
    source = await fs.readFile(targetPath, 'utf8');
  } catch {
    return {
      success: false,
      filePath: targetPath,
      applied: false,
      error: `File not found: ${targetPath}`,
    };
  }

  // Find the search content in the file
  const target = findSearchTarget(targetPath, source, block.search, block.isRegex);
  if (!target) {
    return {
      success: false,
      filePath: targetPath,
      applied: false,
      error: `Search content not found in ${targetPath}`,
    };
  }

  // Create and apply the edit operation
  const operation: EditOperation = {
    target,
    replacement: block.replace,
    description: 'SEARCH/REPLACE edit',
  };

  try {
    const newContent = applyEdit(source, operation);
    const diffResult = generateDiff(operation);

    // Write the new content to the file
    await fs.writeFile(targetPath, newContent, 'utf8');

    return {
      success: true,
      filePath: targetPath,
      applied: true,
      diff: diffResult.unifiedDiff,
      originalContent: source,
      newContent,
    };
  } catch (err: any) {
    return {
      success: false,
      filePath: targetPath,
      applied: false,
      error: err.message || String(err),
    };
  }
}

/**
 * Execute multiple SEARCH/REPLACE blocks.
 *
 * Groups blocks by file path and applies all edits to each file
 * in a single pass (bottom-up to preserve line numbers).
 *
 * @param blocks - Array of SEARCH/REPLACE blocks to execute
 * @param baseDir - Optional base directory for resolving relative file paths
 * @returns Array of SearchReplaceResult, one per block
 */
export async function executeMultipleSearchReplace(
  blocks: SearchReplaceBlock[],
  baseDir?: string
): Promise<SearchReplaceResult[]> {
  // Group blocks by file path
  const fileGroups = new Map<string, SearchReplaceBlock[]>();
  for (const block of blocks) {
    const blockPath = block.filePath || '';
    const resolvedPath = baseDir && blockPath
      ? path.resolve(baseDir, blockPath)
      : blockPath;
    const key = resolvedPath || '__default__';

    if (!fileGroups.has(key)) {
      fileGroups.set(key, []);
    }
    fileGroups.get(key)!.push(block);
  }

  const results: SearchReplaceResult[] = [];

  for (const [fileKey, groupBlocks] of fileGroups) {
    const filePath = fileKey === '__default__' ? '' : fileKey;

    if (!filePath) {
      // No file path available - report error for each block
      for (const block of groupBlocks) {
        results.push({
          success: false,
          filePath: block.filePath || '',
          applied: false,
          error: 'No file path specified and no default file path provided',
        });
      }
      continue;
    }

    let source: string;
    try {
      source = await fs.readFile(filePath, 'utf8');
    } catch {
      for (const block of groupBlocks) {
        results.push({
          success: false,
          filePath,
          applied: false,
          error: `File not found: ${filePath}`,
        });
      }
      continue;
    }

    // Build all edit operations for this file
    const operations: EditOperation[] = [];
    let allFound = true;
    const blockTargets: Array<{ block: SearchReplaceBlock; target: EditTarget }> = [];

    for (const block of groupBlocks) {
      const target = findSearchTarget(filePath, source, block.search, block.isRegex);
      if (!target) {
        allFound = false;
        results.push({
          success: false,
          filePath,
          applied: false,
          error: `Search content not found in ${filePath}`,
        });
        continue;
      }
      blockTargets.push({ block, target });
      operations.push({
        target,
        replacement: block.replace,
        description: 'SEARCH/REPLACE edit',
      });
    }

    if (operations.length === 0) continue;

    try {
      const newContent = applyMultipleEdits(source, operations);
      const diffs = operations.map(op => generateDiff(op));
      const combinedDiff = diffs.map(d => d.unifiedDiff).join('\n');

      // Write the new content
      await fs.writeFile(filePath, newContent, 'utf8');

      // Report success for each block that had a valid target
      for (let idx = 0; idx < blockTargets.length; idx++) {
        results.push({
          success: true,
          filePath,
          applied: true,
          diff: diffs[idx]?.unifiedDiff,
          originalContent: source,
          newContent,
        });
      }
    } catch (err: any) {
      for (const { block } of blockTargets) {
        results.push({
          success: false,
          filePath,
          applied: false,
          error: err.message || String(err),
        });
      }
    }
  }

  return results;
}
