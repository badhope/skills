/**
 * Glob Pattern Utilities
 *
 * Shared utilities for glob pattern matching used across the codebase.
 * Supports simple glob patterns with *, **, and ? wildcards.
 */

/**
 * Convert a glob pattern to a RegExp string.
 *
 * Handles:
 * - `*` matches anything except /
 * - `**` matches anything including /
 * - `?` matches single character except /
 * - `.` is escaped for regex safety
 */
export function globToRegex(pattern: string): string {
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
 * Simple glob pattern matching (* matches anything except /, ** matches anything, ? matches single char)
 *
 * @param str - The string to test
 * @param pattern - Glob pattern to match against
 * @returns true if the string matches the pattern
 */
export function globMatch(str: string, pattern: string): boolean {
  const regexStr = globToRegex(pattern);
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(str);
}

/**
 * Check if a file path matches any of the given glob patterns.
 *
 * @param filePath - The file path to check
 * @param patterns - Array of glob patterns
 * @returns true if the file path matches any of the patterns
 */
export function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    if (globMatch(normalized, pattern)) {
      return true;
    }
  }

  return false;
}
