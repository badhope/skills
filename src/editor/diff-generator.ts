/**
 * Unified diff generator for code edits
 *
 * Generates git-style unified diffs and applies SEARCH/REPLACE edits
 * to source strings. Supports single and multi-edit operations with
 * bottom-up processing to preserve line numbers.
 */

import type { EditTarget } from './edit-target.js';

/** A single edit operation combining a target with its replacement */
export interface EditOperation {
  /** The target location to edit */
  target: EditTarget;
  /** The replacement content */
  replacement: string;
  /** Human-readable description of the change */
  description?: string;
}

/** Result of generating a unified diff */
export interface DiffResult {
  /** File path */
  filePath: string;
  /** Unified diff string (git-style) */
  unifiedDiff: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Whether this represents a new file creation */
  isNewFile: boolean;
}

/**
 * Generate a unified diff for a single edit operation.
 *
 * Produces git-style unified diff output with headers, hunk markers,
 * and +/- line indicators.
 *
 * @param operation - The edit operation to diff
 * @returns DiffResult with unified diff string and statistics
 */
export function generateDiff(operation: EditOperation): DiffResult {
  const { target, replacement } = operation;
  const oldLines = target.content.split('\n');
  const newLines = replacement.split('\n');

  const deletions = oldLines.length;
  const additions = newLines.length;

  // Build unified diff
  const diffLines: string[] = [];

  // Diff header
  diffLines.push(`--- a/${target.filePath}`);
  diffLines.push(`+++ b/${target.filePath}`);

  // Hunk header: @@ -start,count +start,count @@
  // Unified diff uses 1-based line numbers
  const oldStart = target.startLine;
  const newStart = target.startLine;
  diffLines.push(
    `@@ -${oldStart},${deletions} +${newStart},${additions} @@`
  );

  // If there's a description, add it as a diff context note
  if (operation.description) {
    diffLines.push(`+ // ${operation.description}`);
  }

  // Removed lines (prefixed with -)
  for (const line of oldLines) {
    diffLines.push(`-${line}`);
  }

  // Added lines (prefixed with +)
  for (const line of newLines) {
    diffLines.push(`+${line}`);
  }

  const unifiedDiff = diffLines.join('\n') + '\n';

  return {
    filePath: target.filePath,
    unifiedDiff,
    additions,
    deletions,
    isNewFile: false,
  };
}

/**
 * Generate unified diffs for multiple edit operations.
 *
 * @param operations - Array of edit operations
 * @returns Array of DiffResult, one per operation
 */
export function generateMultiDiff(operations: EditOperation[]): DiffResult[] {
  return operations.map(op => generateDiff(op));
}

/**
 * Apply a single SEARCH/REPLACE edit to a source string.
 *
 * Validates that the search content matches the content at the target
 * location before applying the replacement.
 *
 * @param source - The original source text
 * @param operation - The edit operation to apply
 * @returns The modified source string
 * @throws Error if the target content does not match the source
 */
export function applyEdit(source: string, operation: EditOperation): string {
  const { target, replacement } = operation;
  const lines = source.split('\n');

  // Convert 1-based to 0-based
  const startIdx = target.startLine - 1;
  const endIdx = target.endLine; // slice end is exclusive, and endLine is inclusive

  // Validate bounds
  if (startIdx < 0 || endIdx > lines.length || startIdx >= endIdx) {
    throw new Error(
      `Invalid line range [${target.startLine}, ${target.endLine}] for file with ${lines.length} lines`
    );
  }

  // Extract the actual content at the target range
  const actualContent = lines.slice(startIdx, endIdx).join('\n');

  // Validate that the target content matches (with normalization)
  const normalizedActual = actualContent.trimEnd();
  const normalizedExpected = target.content.trimEnd();

  if (normalizedActual !== normalizedExpected) {
    throw new Error(
      `Content mismatch at lines ${target.startLine}-${target.endLine}.\n` +
      `Expected:\n${target.content}\n` +
      `Actual:\n${actualContent}`
    );
  }

  // Apply the replacement
  const replacementLines = replacement.split('\n');
  const newLines = [
    ...lines.slice(0, startIdx),
    ...replacementLines,
    ...lines.slice(endIdx),
  ];

  return newLines.join('\n');
}

/**
 * Apply multiple SEARCH/REPLACE edits to a source string.
 *
 * Processes edits from bottom to top to preserve line numbers.
 * Edits are sorted by startLine descending before application.
 *
 * @param source - The original source text
 * @param operations - Array of edit operations to apply
 * @returns The modified source string with all edits applied
 * @throws Error if any target content does not match
 */
export function applyMultipleEdits(source: string, operations: EditOperation[]): string {
  if (operations.length === 0) return source;

  // Sort operations by startLine descending (bottom-up)
  // This ensures earlier edits don't shift line numbers for later ones
  const sorted = [...operations].sort((a, b) => b.target.startLine - a.target.startLine);

  let result = source;
  for (const op of sorted) {
    result = applyEdit(result, op);
  }

  return result;
}
