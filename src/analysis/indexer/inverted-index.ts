/**
 * Inverted index implementation for fast code search.
 */

import type { IndexEntry } from './types.js';

/**
 * In-memory inverted index for looking up entries by name.
 * Maps lowercase names to arrays of entry indices.
 */
export class InvertedIndex {
  private index: Map<string, number[]> = new Map();

  /**
   * Add an entry to the inverted index.
   *
   * @param entry - The entry to add
   * @param entryIndex - The index of the entry in the main entries array
   */
  addEntry(entry: IndexEntry, entryIndex: number): void {
    const key = entry.name.toLowerCase();
    const indices = this.index.get(key) ?? [];
    indices.push(entryIndex);
    this.index.set(key, indices);
  }

  /**
   * Search the inverted index for entries matching a query.
   *
   * @param query - The search query (will be lowercased)
   * @returns Set of matching entry indices
   */
  search(query: string): Set<number> {
    const lowerQuery = query.toLowerCase();
    const matches = new Set<number>();

    // Exact key lookup
    const exactMatches = this.index.get(lowerQuery);
    if (exactMatches) {
      for (const idx of exactMatches) {
        matches.add(idx);
      }
    }

    // Prefix lookup
    for (const [key, indices] of this.index) {
      if (key.startsWith(lowerQuery) && key !== lowerQuery) {
        for (const idx of indices) {
          matches.add(idx);
        }
      }
    }

    // Contains lookup
    for (const [key, indices] of this.index) {
      if (key.includes(lowerQuery) && !key.startsWith(lowerQuery)) {
        for (const idx of indices) {
          matches.add(idx);
        }
      }
    }

    return matches;
  }

  /**
   * Get all indices for an exact name match.
   *
   * @param name - The name to look up
   * @returns Array of entry indices, or undefined if not found
   */
  getExact(name: string): number[] | undefined {
    return this.index.get(name.toLowerCase());
  }

  /**
   * Clear the inverted index.
   */
  clear(): void {
    this.index.clear();
  }

  /**
   * Get the number of unique keys in the index.
   */
  get size(): number {
    return this.index.size;
  }

  /**
   * Check if the index is empty.
   */
  get isEmpty(): boolean {
    return this.index.size === 0;
  }
}
