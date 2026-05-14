/**
 * @devflow/sdk - DevFlow Agent SDK
 *
 * Programmatic API for using DevFlow Agent in other applications.
 *
 * @example
 * ```typescript
 * import { runAgent, parseFile, generateRepoMap } from '@devflow/sdk';
 *
 * // Run agent
 * const result = await runAgent('Add error handling to the auth module');
 * console.log(result.output);
 *
 * // Parse a file
 * const parsed = await parseFile('./src/auth.ts');
 * console.log(parsed.symbols);
 *
 * // Generate repo map
 * const map = await generateRepoMap('./src');
 * console.log(map);
 * ```
 */

// Re-export all modules
export * from './agent.js';
export * from './parser.js';
export * from './editor.js';
export * from './plugins.js';
export * from './types.js';
