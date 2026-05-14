/**
 * 符号提取器
 *
 * 从 tree-sitter 语法树中提取代码符号（函数、类、接口、变量等）。
 * 用于 Repo Map 生成和代码索引。
 */

import type { ParseResult } from './engine.js';

/** 符号类型 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'method'
  | 'property'
  | 'import'
  | 'export'
  | 'module'
  | 'namespace';

/** 代码符号 */
export interface CodeSymbol {
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  kind: SymbolKind;
  /** 所在文件 */
  filePath: string;
  /** 起始行号 (0-based) */
  startLine: number;
  /** 结束行号 (0-based) */
  endLine: number;
  /** 签名（函数参数、泛型等） */
  signature?: string;
  /** 父级符号名 */
  parent?: string;
  /** 在 AST 中的嵌套深度（0 = 顶层） */
  nestingLevel?: number;
}

/** TypeScript/JavaScript 节点类型到符号类型的映射 */
const NODE_TYPE_MAP: Record<string, SymbolKind> = {
  'function_declaration': 'function',
  'function_expression': 'function',
  'arrow_function': 'function',
  'generator_function_declaration': 'function',
  'method_definition': 'method',
  'method_signature': 'method',
  'class_declaration': 'class',
  'abstract_class_declaration': 'class',
  'interface_declaration': 'interface',
  'type_alias_declaration': 'type',
  'enum_declaration': 'enum',
  'variable_declaration': 'variable',
  'lexical_declaration': 'variable',
  'import_statement': 'import',
  'import_declaration': 'import',
  'export_statement': 'export',
  'module_declaration': 'module',
  'namespace_declaration': 'namespace',
  'program': 'module',
  // Python
  'function_definition': 'function',
  'class_definition': 'class',
  'import_from_statement': 'import',
};

/**
 * 从语法树中提取所有符号
 */
export function extractSymbols(result: ParseResult): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const { tree, filePath } = result;
  const rootNode = tree.rootNode;

  walkTree(rootNode, symbols, filePath, undefined);

  return symbols;
}

/**
 * 递归遍历语法树
 */
function walkTree(
  node: any,
  symbols: CodeSymbol[],
  filePath: string,
  parentName: string | undefined
): void {
  const kind = NODE_TYPE_MAP[node.type];

  if (kind) {
    const name = extractName(node);
    if (name) {
      const symbol: CodeSymbol = {
        name,
        kind,
        filePath,
        startLine: node.startPosition.row,
        endLine: node.endPosition.row,
        signature: extractSignature(node, kind),
        parent: parentName,
      };
      symbols.push(symbol);

      // 如果是类/命名空间，子符号的 parent 设为当前名称
      if (kind === 'class' || kind === 'namespace' || kind === 'module') {
        parentName = name;
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkTree(child, symbols, filePath, parentName);
    }
  }
}

/**
 * 提取符号名称
 */
function extractName(node: any): string | null {
  switch (node.type) {
    case 'function_declaration':
    case 'function_expression':
    case 'generator_function_declaration':
    case 'class_declaration':
    case 'abstract_class_declaration':
    case 'interface_declaration':
    case 'type_alias_declaration':
    case 'enum_declaration':
    case 'function_definition':
    case 'class_definition': {
      // 名称通常是第一个 identifier 子节点
      const nameNode = node.childForFieldName('name');
      return nameNode ? nameNode.text : null;
    }
    case 'method_definition':
    case 'method_signature': {
      const nameNode = node.childForFieldName('name');
      return nameNode ? nameNode.text : null;
    }
    case 'variable_declaration':
    case 'lexical_declaration': {
      // 取第一个声明器的名称
      const declarator = node.childForFieldName('declarators') || node.children.find((c: any) => c.type === 'variable_declarator');
      if (declarator) {
        const nameNode = declarator.childForFieldName('name');
        return nameNode ? nameNode.text : null;
      }
      return null;
    }
    case 'import_statement':
    case 'import_declaration':
    case 'import_from_statement': {
      // 提取导入的模块路径
      const sourceNode = node.childForFieldName('source') || node.children.find((c: any) => c.type === 'string');
      return sourceNode ? sourceNode.text.replace(/['"]/g, '') : null;
    }
    case 'export_statement': {
      // 提取导出的声明名称
      const declaration = node.childForFieldName('declaration');
      if (declaration) return extractName(declaration);
      return 'export';
    }
    default:
      return null;
  }
}

/**
 * 提取符号签名
 */
function extractSignature(node: any, kind: SymbolKind): string | undefined {
  if (kind === 'function' || kind === 'method') {
    // 提取参数列表
    const paramsNode = node.childForFieldName('parameters') || node.childForFieldName('params');
    if (paramsNode) {
      return paramsNode.text;
    }
  }
  if (kind === 'type') {
    // 提取类型参数
    const paramsNode = node.childForFieldName('parameters');
    if (paramsNode) {
      return paramsNode.text;
    }
  }
  return undefined;
}

/**
 * 获取文件中指定行范围的符号
 */
export function getSymbolsInRange(
  symbols: CodeSymbol[],
  startLine: number,
  endLine: number
): CodeSymbol[] {
  return symbols.filter(s => s.startLine >= startLine && s.endLine <= endLine);
}

/**
 * 按名称搜索符号
 */
export function findSymbolByName(
  symbols: CodeSymbol[],
  name: string
): CodeSymbol[] {
  const lower = name.toLowerCase();
  return symbols.filter(s => s.name.toLowerCase().includes(lower));
}
