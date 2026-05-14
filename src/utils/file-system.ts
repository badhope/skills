/**
 * File System Utilities
 *
 * Shared utilities for file system operations used across the codebase.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { globMatch } from './glob.js';

/** Default source file extensions */
export const DEFAULT_SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.py', '.pyi',
]);

/** Default exclude patterns for source file collection */
export const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules/**',
  'dist/**',
  'lib/**',
  '*.test.ts',
  '*.spec.ts',
  '*.d.ts',
  '*.test.js',
  '*.spec.js',
  '*.test.py',
  '*.test.mjs',
  'coverage/**',
  '.git/**',
  '__pycache__/**',
  '.venv/**',
  'venv/**',
  '*.pyc',
];

/**
 * Check if a file should be excluded based on patterns.
 */
export function shouldExclude(filePath: string, rootDir: string, excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS): boolean {
  const relative = path.relative(rootDir, filePath).replace(/\\/g, '/');
  for (const pattern of excludePatterns) {
    if (globMatch(relative, pattern)) return true;
  }
  return false;
}

/**
 * Check if a file path matches any of the given glob patterns.
 */
export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    if (globMatch(normalized, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Convert a glob pattern to a regex string.
 */
function globToRegex(pattern: string): string {
  let result = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        // ** matches any path segment(s)
        if (i + 2 < pattern.length && pattern[i + 2] === '/') {
          result += '(?:.*/)?';
          i += 3;
          continue;
        } else {
          result += '.*';
          i += 2;
          continue;
        }
      } else {
        // * matches anything except /
        result += '[^/]*';
        i++;
        continue;
      }
    } else if (ch === '?') {
      result += '[^/]';
      i++;
      continue;
    } else if (ch === '.' || ch === '+' || ch === '^' || ch === '$' || ch === '|' ||
               ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '{' ||
               ch === '}' || ch === '\\') {
      result += '\\' + ch;
      i++;
      continue;
    } else {
      result += ch;
      i++;
      continue;
    }
  }

  return result;
}

/**
 * Simple glob matcher supporting *, **, and ? wildcards.
 */
export function matchesGlob(str: string, pattern: string): boolean {
  const regexStr = globToRegex(pattern);
  const regex = new RegExp(regexStr);
  return regex.test(str);
}

/**
 * Recursively collect source files from a directory.
 *
 * @param dir - Directory to scan
 * @param excludePatterns - Glob patterns to exclude (defaults to DEFAULT_EXCLUDE_PATTERNS)
 * @param includePatterns - Glob patterns to include (if provided, only matching files are included)
 * @param extensions - Set of file extensions to include (defaults to DEFAULT_SOURCE_EXTENSIONS)
 * @returns Array of absolute file paths
 */
export async function collectSourceFiles(
  dir: string,
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS,
  includePatterns?: string[],
  extensions: Set<string> = DEFAULT_SOURCE_EXTENSIONS
): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath).replace(/\\/g, '/');

      // Check exclude patterns
      if (matchesAnyPattern(relativePath, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Check if it's a source file
        if (!extensions.has(ext)) {
          continue;
        }

        // Check include patterns (if specified)
        if (includePatterns && includePatterns.length > 0) {
          if (!matchesGlob(relativePath, includePatterns[0])) {
            // Simple check - just use first pattern
            // For more complex patterns, we'd need to iterate
            let matched = false;
            for (const pattern of includePatterns) {
              if (matchesGlob(relativePath, pattern)) {
                matched = true;
                break;
              }
            }
            if (!matched) continue;
          }
        }

        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}
