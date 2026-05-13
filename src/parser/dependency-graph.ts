/**
 * File Dependency Graph Builder
 *
 * Builds a file dependency graph from import/export statements
 * extracted from tree-sitter AST nodes. Supports TypeScript and Python.
 */

import * as path from 'path';
import type { ParseResult } from './engine.js';

/** Dependency information for a single file */
export interface FileDependency {
  /** Absolute file path */
  filePath: string;
  /** Imported module paths (resolved to absolute) */
  imports: string[];
  /** Files that import this file */
  importedBy: string[];
  /** Exported symbol names */
  exports: string[];
}

/** The full dependency graph across all analyzed files */
export interface DependencyGraph {
  /** Map of absolute file path to its dependency info */
  files: Map<string, FileDependency>;
  /** Get files that depend on the given file */
  getDependents(filePath: string): string[];
  /** Get files that the given file depends on */
  getDependencies(filePath: string): string[];
  /** Get all files transitively connected to the given file */
  getConnectedComponent(filePath: string): string[];
}

/**
 * Build a dependency graph from parsed file results.
 *
 * Walks AST import/export nodes to extract relationships and resolves
 * relative imports to absolute paths.
 *
 * @param filePaths - Absolute paths of all files in the project
 * @param parseResults - Map of file path to parse result
 * @returns The constructed dependency graph
 */
export function buildDependencyGraph(
  filePaths: string[],
  parseResults: Map<string, ParseResult>
): DependencyGraph {
  const files = new Map<string, FileDependency>();

  // Initialize all files with empty dependency info
  for (const fp of filePaths) {
    files.set(fp, {
      filePath: fp,
      imports: [],
      importedBy: [],
      exports: [],
    });
  }

  // Build a set of known file paths for resolution (both absolute and basename)
  const knownPaths = new Set(filePaths);
  const knownBasenames = new Map<string, string[]>();
  for (const fp of filePaths) {
    const base = path.basename(fp);
    const entries = knownBasenames.get(base) || [];
    entries.push(fp);
    knownBasenames.set(base, entries);
  }

  // Extract imports and exports from each parse result
  for (const [filePath, result] of parseResults) {
    const dep = files.get(filePath);
    if (!dep) continue;

    const rootNode = result.tree.rootNode;
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.py' || ext === '.pyi' || ext === '.pyw') {
      extractPythonImports(rootNode, filePath, dep, knownPaths, knownBasenames);
      extractPythonExports(rootNode, dep);
    } else {
      extractTSJSImports(rootNode, filePath, dep, knownPaths, knownBasenames);
      extractTSJSExports(rootNode, dep);
    }
  }

  // Build the reverse dependency (importedBy) edges
  for (const [filePath, dep] of files) {
    for (const importedPath of dep.imports) {
      const importedDep = files.get(importedPath);
      if (importedDep && !importedDep.importedBy.includes(filePath)) {
        importedDep.importedBy.push(filePath);
      }
    }
  }

  return createGraph(files);
}

/**
 * Extract imports from TypeScript/JavaScript AST nodes.
 */
function extractTSJSImports(
  rootNode: any,
  currentFilePath: string,
  dep: FileDependency,
  knownPaths: Set<string>,
  knownBasenames: Map<string, string[]>
): void {
  const dir = path.dirname(currentFilePath);

  walkTreeForType(rootNode, ['import_statement', 'import_declaration'], (node) => {
    const sourceNode =
      node.childForFieldName('source') ||
      node.children.find((c: any) => c.type === 'string');

    if (!sourceNode) return;

    const rawPath = sourceNode.text.replace(/['"]/g, '');
    const resolved = resolveImport(rawPath, currentFilePath, dir, knownPaths, knownBasenames);
    if (resolved && knownPaths.has(resolved) && !dep.imports.includes(resolved)) {
      dep.imports.push(resolved);
    }
  });
}

/**
 * Extract exports from TypeScript/JavaScript AST nodes.
 */
function extractTSJSExports(rootNode: any, dep: FileDependency): void {
  // export function/class/interface/type/enum declarations
  walkTreeForType(
    rootNode,
    [
      'export_statement',
      'export_default_declaration',
      'export_named_declaration',
    ],
    (node) => {
      // Check for named exports: export { foo, bar }
      if (node.type === 'export_named_declaration' || node.type === 'export_statement') {
        // Look for export_clause or specifiers
        const specifiers =
          node.childForFieldName('specifiers') ||
          node.children.find(
            (c: any) =>
              c.type === 'export_clause' ||
              c.type === 'export_specifier' ||
              c.type === 'specifiers'
          );

        if (specifiers) {
          extractNamesFromSpecifiers(specifiers, dep.exports);
        }

        // export declaration (export function foo() {})
        const declaration =
          node.childForFieldName('declaration') ||
          node.children.find(
            (c: any) =>
              c.type === 'function_declaration' ||
              c.type === 'class_declaration' ||
              c.type === 'interface_declaration' ||
              c.type === 'type_alias_declaration' ||
              c.type === 'enum_declaration' ||
              c.type === 'lexical_declaration' ||
              c.type === 'variable_declaration'
          );

        if (declaration) {
          const name = extractDeclarationName(declaration);
          if (name && !dep.exports.includes(name)) {
            dep.exports.push(name);
          }
        }
      }

      // export default
      if (node.type === 'export_default_declaration') {
        const declaration =
          node.childForFieldName('declaration') ||
          node.children.find(
            (c: any) =>
              c.type === 'function_declaration' ||
              c.type === 'class_declaration' ||
              c.type === 'identifier' ||
              c.type === 'arrow_function'
          );

        if (declaration) {
          if (declaration.type === 'identifier') {
            const name = declaration.text;
            if (name && !dep.exports.includes('default')) {
              dep.exports.push('default');
            }
          } else {
            const name = extractDeclarationName(declaration);
            if (name && !dep.exports.includes('default')) {
              dep.exports.push('default');
            }
          }
        }
      }
    }
  );
}

/**
 * Extract names from export specifier nodes.
 */
function extractNamesFromSpecifiers(node: any, exports: string[]): void {
  if (node.type === 'export_specifier' || node.type === 'identifier') {
    const name = node.text;
    if (name && name !== 'type' && name !== 'from' && !exports.includes(name)) {
      exports.push(name);
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      extractNamesFromSpecifiers(child, exports);
    }
  }
}

/**
 * Extract the name from a declaration node.
 */
function extractDeclarationName(node: any): string | null {
  const nameNode = node.childForFieldName('name') || node.childForFieldName('id');
  if (nameNode) return nameNode.text;

  // For variable declarations, get the first declarator name
  const declarator =
    node.childForFieldName('declarators') ||
    node.children.find((c: any) => c.type === 'variable_declarator');
  if (declarator) {
    const dName = declarator.childForFieldName('name') || declarator.childForFieldName('id');
    if (dName) return dName.text;
  }

  return null;
}

/**
 * Extract imports from Python AST nodes.
 */
function extractPythonImports(
  rootNode: any,
  currentFilePath: string,
  dep: FileDependency,
  knownPaths: Set<string>,
  knownBasenames: Map<string, string[]>
): void {
  const dir = path.dirname(currentFilePath);

  // import foo / import foo.bar
  walkTreeForType(rootNode, ['import_statement'], (node) => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === 'dotted_name' || child.type === 'aliased_import')) {
        const modulePath = child.text.replace(/\s+as\s+\w+$/, '').trim();
        const resolved = resolvePythonImport(modulePath, currentFilePath, dir, knownPaths, knownBasenames);
        if (resolved && knownPaths.has(resolved) && !dep.imports.includes(resolved)) {
          dep.imports.push(resolved);
        }
      }
    }
  });

  // from foo import bar
  walkTreeForType(rootNode, ['import_from_statement'], (node) => {
    const moduleNode =
      node.childForFieldName('module_name') ||
      node.children.find(
        (c: any) => c.type === 'dotted_name' || c.type === 'aliased_import' || c.type === 'identifier'
      );
    if (!moduleNode) return;

    const modulePath = moduleNode.text.trim();
    const resolved = resolvePythonImport(modulePath, currentFilePath, dir, knownPaths, knownBasenames);
    if (resolved && knownPaths.has(resolved) && !dep.imports.includes(resolved)) {
      dep.imports.push(resolved);
    }
  });
}

/**
 * Extract exports from Python AST nodes.
 *
 * In Python, top-level function and class definitions are implicitly exported.
 */
function extractPythonExports(rootNode: any, dep: FileDependency): void {
  walkTreeForType(
    rootNode,
    ['function_definition', 'class_definition'],
    (node) => {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        if (name && !dep.exports.includes(name)) {
          dep.exports.push(name);
        }
      }
    }
  );

  // Also check for __all__ assignments
  walkTreeForType(rootNode, ['assignment'], (node) => {
    const left = node.childForFieldName('left') || node.children.find((c: any) => c.type === 'identifier');
    if (left && left.text === '__all__') {
      const right = node.childForFieldName('right') || node.children.find((c: any) => c.type === 'list');
      if (right) {
        for (let i = 0; i < right.childCount; i++) {
          const child = right.child(i);
          if (child && child.type === 'string') {
            const name = child.text.replace(/['"]/g, '');
            if (name && !dep.exports.includes(name)) {
              dep.exports.push(name);
            }
          }
        }
      }
    }
  });
}

/**
 * Walk the AST tree looking for nodes of specific types and invoke a callback.
 */
function walkTreeForType(
  node: any,
  types: string[],
  callback: (node: any) => void
): void {
  if (types.includes(node.type)) {
    callback(node);
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkTreeForType(child, types, callback);
    }
  }
}

/**
 * Resolve a TypeScript/JavaScript import path to an absolute file path.
 */
function resolveImport(
  rawPath: string,
  currentFilePath: string,
  currentDir: string,
  knownPaths: Set<string>,
  knownBasenames: Map<string, string[]>
): string | null {
  // Skip non-relative imports (node_modules, bare specifiers)
  if (!rawPath.startsWith('.')) {
    return null;
  }

  // Try exact resolution first
  const absolute = path.resolve(currentDir, rawPath);

  // Direct file match
  if (knownPaths.has(absolute)) {
    return absolute;
  }

  // Try with common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
  for (const ext of extensions) {
    if (knownPaths.has(absolute + ext)) {
      return absolute + ext;
    }
  }

  // Try index files in directory
  for (const ext of extensions) {
    const indexPath = path.join(absolute, 'index' + ext);
    if (knownPaths.has(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Resolve a Python import path to an absolute file path.
 */
function resolvePythonImport(
  modulePath: string,
  currentFilePath: string,
  currentDir: string,
  knownPaths: Set<string>,
  knownBasenames: Map<string, string[]>
): string | null {
  // For relative imports (from . import foo / from ..bar import baz)
  if (modulePath.startsWith('.')) {
    const dotCount = (modulePath.match(/^\./) || [''])[0].length;
    let targetDir = currentDir;
    for (let i = 1; i < dotCount; i++) {
      targetDir = path.dirname(targetDir);
    }
    const rest = modulePath.replace(/^\.+/, '');
    if (!rest) return null;

    const parts = rest.split('.');
    const moduleName = parts[0];

    // Try as a file
    const asFile = path.join(targetDir, moduleName + '.py');
    if (knownPaths.has(asFile)) return asFile;

    // Try as a package
    const asPackage = path.join(targetDir, moduleName, '__init__.py');
    if (knownPaths.has(asPackage)) return asPackage;

    return null;
  }

  // For absolute module imports, try to find by basename in known paths
  const parts = modulePath.split('.');
  const moduleName = parts[0];

  // Try matching against known file basenames
  const candidates = knownBasenames.get(moduleName + '.py') || [];
  for (const candidate of candidates) {
    return candidate;
  }

  return null;
}

/**
 * Create the DependencyGraph object with helper methods.
 */
function createGraph(files: Map<string, FileDependency>): DependencyGraph {
  return {
    files,

    getDependents(filePath: string): string[] {
      const dep = files.get(filePath);
      return dep ? [...dep.importedBy] : [];
    },

    getDependencies(filePath: string): string[] {
      const dep = files.get(filePath);
      return dep ? [...dep.imports] : [];
    },

    getConnectedComponent(filePath: string): string[] {
      const visited = new Set<string>();
      const queue: string[] = [filePath];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const dep = files.get(current);
        if (!dep) continue;

        // Add all imports and importers
        for (const imp of dep.imports) {
          if (!visited.has(imp)) queue.push(imp);
        }
        for (const importer of dep.importedBy) {
          if (!visited.has(importer)) queue.push(importer);
        }
      }

      return Array.from(visited);
    },
  };
}
