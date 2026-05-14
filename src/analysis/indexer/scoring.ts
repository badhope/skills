/**
 * Scoring logic for code index search results.
 */

import type { IndexEntry } from './types.js';

/**
 * Compute the relevance score for an entry against a query.
 * Higher scores indicate better matches.
 *
 * @param entry - The index entry to score
 * @param query - The search query
 * @returns Relevance score (higher is better)
 */
export function computeScore(entry: IndexEntry, query: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerName = entry.name.toLowerCase();

  let score = 0;

  // Exact name match (highest score)
  score += scoreExactMatch(lowerName, lowerQuery);

  // Name starts with query
  if (lowerName !== lowerQuery) {
    score += scorePrefixMatch(lowerName, lowerQuery);
  }

  // Name contains query
  if (!lowerName.startsWith(lowerQuery)) {
    score += scoreContainsMatch(lowerName, lowerQuery);
  }

  // Type/kind match
  score += scoreKindMatch(entry, lowerQuery);

  // Docstring contains query
  score += scoreDocstringMatch(entry, lowerQuery);

  // Signature contains query
  score += scoreSignatureMatch(entry, lowerQuery);

  // Prefer symbols over chunks over files
  if (entry.type === 'symbol') score += 10;
  else if (entry.type === 'chunk') score += 5;

  return score;
}

/**
 * Score an exact name match.
 */
export function scoreExactMatch(name: string, query: string): number {
  return name === query ? 100 : 0;
}

/**
 * Score a prefix match (name starts with query).
 */
export function scorePrefixMatch(name: string, query: string): number {
  return name.startsWith(query) ? 80 : 0;
}

/**
 * Score a contains match (name contains query but doesn't start with it).
 */
export function scoreContainsMatch(name: string, query: string): number {
  return name.includes(query) ? 60 : 0;
}

/**
 * Score a kind/type match.
 */
export function scoreKindMatch(entry: IndexEntry, query: string): number {
  return entry.kind && entry.kind.toLowerCase().includes(query) ? 40 : 0;
}

/**
 * Score a docstring match.
 */
export function scoreDocstringMatch(entry: IndexEntry, query: string): number {
  return entry.docstring && entry.docstring.toLowerCase().includes(query) ? 30 : 0;
}

/**
 * Score a signature match.
 */
export function scoreSignatureMatch(entry: IndexEntry, query: string): number {
  return entry.signature && entry.signature.toLowerCase().includes(query) ? 20 : 0;
}
