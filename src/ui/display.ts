/**
 * display.ts - 富文本显示工具模块
 *
 * 提供所有命令共用的终端富文本显示工具，让输出看起来专业、美观、傻瓜式。
 * 依赖：chalk, cli-table3, boxen, wrap-ansi
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import boxen from 'boxen';
import wrapAnsi from 'wrap-ansi';

// ==================== 内部工具 ====================

/** ANSI 转义码正则，用于去除颜色码计算文本真实宽度 */
const ANSI_REGEX = /\x1B\[[0-9;]*m/g;

/**
 * 去除字符串中的 ANSI 颜色转义码
 * @param text 可能包含 ANSI 码的字符串
 * @returns 纯文本字符串
 */
function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

// ==================== 类型定义 ====================

/** printTable 的配置选项 */
export interface TableOptions {
  /** 表格标题 */
  title?: string;
  /** 表头列名 */
  head: string[];
  /** 表格行数据 */
  rows: Array<string[]>;
  /** 自定义样式 */
  style?: {
    /** 表头颜色，如 ['cyan', 'bold'] */
    head?: string[];
    /** 边框颜色，如 ['gray'] */
    border?: string[];
  };
}

/** printBox 的配置选项 */
export interface BoxOptions {
  /** 边框颜色 */
  borderColor?: string;
  /** 内边距 */
  padding?: number;
  /** 标题 */
  title?: string;
}

/** printKeyValue 的键值对条目 */
export interface KeyValuePair {
  key: string;
  value: string;
  /** 是否高亮显示 value */
  highlight?: boolean;
}

/** printSteps 的步骤条目 */
export interface StepItem {
  /** 步骤编号 */
  step: number;
  /** 步骤标题 */
  title: string;
  /** 步骤状态 */
  status: 'pending' | 'running' | 'done' | 'error';
  /** 步骤详情 */
  detail?: string;
}

/** printProgressBar 的配置选项 */
export interface ProgressBarOptions {
  /** 进度条宽度（字符数） */
  width?: number;
  /** 进度条前缀标签 */
  label?: string;
  /** 已完成部分字符 */
  completeChar?: string;
  /** 未完成部分字符 */
  incompleteChar?: string;
}

/** printBadge 支持的颜色 */
export type BadgeColor = 'green' | 'red' | 'yellow' | 'blue' | 'cyan' | 'gray';

/** printColumns 的配置选项 */
export interface ColumnsOptions {
  /** 列数 */
  columns?: number;
  /** 列间距 */
  padding?: number;
}

// ==================== 工具函数 ====================

/**
 * 获取终端宽度
 * @returns 终端列数，默认 80
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * 打印空行
 * @param count 空行数量，默认 1
 */
export function printEmptyLine(count: number = 1): void {
  console.log('\n'.repeat(count));
}

/**
 * 文本截断
 * 使用 wrap-ansi 的 width 选项截断超长文本
 * @param text 原始文本
 * @param maxWidth 最大宽度
 * @param suffix 截断后缀，默认 '...'
 * @returns 截断后的文本
 */
export function truncate(text: string, maxWidth: number, suffix: string = '...'): string {
  if (maxWidth <= 0) return '';
  // 如果文本本身就不超过宽度，直接返回
  const stripped = stripAnsi(text);
  if (stripped.length <= maxWidth) return text;
  // 预留后缀的宽度
  const availableWidth = maxWidth - suffix.length;
  if (availableWidth <= 0) return suffix.slice(0, maxWidth);
  // 使用 wrap-ansi 截断到指定宽度
  const truncated = wrapAnsi(text, availableWidth, { hard: true, trim: true });
  return truncated + suffix;
}

/**
 * 文本换行
 * 使用 wrap-ansi 将文本按指定宽度换行
 * @param text 原始文本
 * @param maxWidth 最大宽度
 * @returns 换行后的文本
 */
export function wrapText(text: string, maxWidth: number): string {
  return wrapAnsi(text, maxWidth, { hard: true, trim: false });
}

// ==================== 显示函数 ====================

/**
 * 表格渲染
 * 使用 cli-table3 渲染美观的表格，支持标题行和自定义样式
 * @param options 表格配置
 */
export function printTable(options: TableOptions): void {
  const { title, head, rows, style } = options;

  // 如果有标题，先打印标题
  if (title) {
    console.log(chalk.bold.cyan(`\n  ${title}`));
    console.log(chalk.gray(`  ${'─'.repeat(title.length * 2)}\n`));
  }

  // 自动计算列宽：取每列中最大宽度
  const colWidths = head.map((_, colIndex) => {
    let maxLen = stripAnsi(head[colIndex]).length;
    for (const row of rows) {
      const cellLen = stripAnsi(row[colIndex] || '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    }
    return maxLen + 4; // 额外留 4 字符内边距
  });

  // 构建 cli-table3 配置
  const tableStyle: Record<string, unknown> = {
    head: style?.head || ['cyan'],
    border: style?.border || ['gray'],
  };

  // @ts-ignore - cli-table3 类型定义不完整
  const table = new Table({
    head,
    style: tableStyle,
    wordWrap: true,
    wrapOnWordBoundary: false,
  } as any);

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

/**
 * 面板/盒子
 * 使用 boxen 将内容包裹在带边框的面板中
 * @param title 标题（显示在盒子内部顶部）
 * @param content 内容文本
 * @param options 盒子配置
 */
export function printBox(title: string, content: string, options?: BoxOptions): void {
  const borderColor = (options?.borderColor || 'cyan') as
    | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
    | 'gray' | 'grey' | 'blackBright' | 'redBright' | 'greenBright' | 'yellowBright'
    | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright';

  // 组合标题和内容
  let text = '';
  if (title) {
    text += chalk.bold(title) + '\n';
  }
  text += content;

  const boxenOptions = {
    borderColor,
    padding: options?.padding ?? 1,
    borderStyle: 'round' as const,
    title: options?.title,
  };

  console.log(boxen(text, boxenOptions));
}

/**
 * 键值对展示
 * 以对齐美观的方式展示键值对列表
 * @param pairs 键值对数组
 */
export function printKeyValue(pairs: KeyValuePair[]): void {
  // 计算 key 的最大宽度（去除 ANSI 颜色码）
  const maxKeyLen = Math.max(
    ...pairs.map((p) => stripAnsi(p.key).length)
  );

  for (const pair of pairs) {
    const keyStr = chalk.cyan(pair.key.padEnd(maxKeyLen));
    const valueStr = pair.highlight
      ? chalk.green(pair.value)
      : chalk.white(pair.value);
    console.log(`  ${keyStr}  ${valueStr}`);
  }
}

/**
 * 步骤展示
 * 以带状态图标的方式展示步骤列表
 * @param steps 步骤数组
 */
export function printSteps(steps: StepItem[]): void {
  // 定义颜色函数类型
  type ChalkFn = (text: string) => string;

  for (const step of steps) {
    let icon: string;
    let titleColor: ChalkFn;
    let detailColor: ChalkFn;

    switch (step.status) {
      case 'done':
        icon = chalk.green('\u2713');
        titleColor = chalk.green.bold;
        detailColor = chalk.gray;
        break;
      case 'running':
        icon = chalk.yellow('\u27F3');
        titleColor = chalk.yellow.bold;
        detailColor = chalk.yellow;
        break;
      case 'error':
        icon = chalk.red('\u2717');
        titleColor = chalk.red.bold;
        detailColor = chalk.red;
        break;
      case 'pending':
      default:
        icon = chalk.gray('\u25CB');
        titleColor = chalk.gray.bold;
        detailColor = chalk.gray;
        break;
    }

    const stepLabel = `  ${icon} `;
    const stepTitle = titleColor(`Step ${step.step}: ${step.title}`);
    let line = stepLabel + stepTitle;

    if (step.detail) {
      line += `\n      ${detailColor(step.detail)}`;
    }

    console.log(line);
  }
}

/**
 * 进度条
 * 在终端渲染一个可视化的进度条
 * @param current 当前进度值
 * @param total 总量
 * @param options 进度条配置
 */
export function printProgressBar(
  current: number,
  total: number,
  options?: ProgressBarOptions
): void {
  const width = options?.width ?? 40;
  const label = options?.label ?? '';
  const completeChar = options?.completeChar ?? '\u2588';
  const incompleteChar = options?.incompleteChar ?? '\u2591';

  // 计算百分比和已完成宽度
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const percent = Math.round(ratio * 100);
  const completedWidth = Math.round(ratio * width);
  const incompleteWidth = width - completedWidth;

  // 构建进度条字符串
  const bar =
    chalk.green(completeChar.repeat(completedWidth)) +
    chalk.gray(incompleteChar.repeat(incompleteWidth));

  // 组合标签、进度条和百分比
  const percentStr = chalk.white(`${percent}%`);
  const labelStr = label ? chalk.cyan(label + ' ') : '';

  console.log(`  ${labelStr}[${bar}] ${percentStr} (${current}/${total})`);
}

/**
 * 标签/徽章
 * 在文本周围加颜色背景，形成醒目的标签效果
 * @param text 标签文本
 * @param color 背景颜色
 * @returns 带颜色背景的标签字符串（不直接打印，返回字符串供调用方使用）
 */
export function printBadge(text: string, color: BadgeColor = 'cyan'): string {
  const colorMap: Record<BadgeColor, (text: string) => string> = {
    green: (t) => chalk.bgGreen.black(t),
    red: (t) => chalk.bgRed.white(t),
    yellow: (t) => chalk.bgYellow.black(t),
    blue: (t) => chalk.bgBlue.white(t),
    cyan: (t) => chalk.bgCyan.black(t),
    gray: (t) => chalk.bgGray.white(t),
  };

  const fn = colorMap[color] || colorMap.cyan;
  // 在文本两侧加空格，让徽章更美观
  return fn(` ${text} `);
}

/**
 * 代码块
 * 用灰色背景框包裹代码，可选显示语言标签
 * @param code 代码内容
 * @param language 可选语言标签
 */
export function printCode(code: string, language?: string): void {
  // 构建语言标签（如果有）
  const langLabel = language ? chalk.gray(` ${language} `) + '\n' : '';

  // 用灰色背景框包裹代码
  const boxed = boxen(code, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: 'gray',
    dimBorder: true,
    borderStyle: 'single',
  });

  console.log(langLabel + boxed);
}

/**
 * 多列布局
 * 将一组字符串项按指定列数排列输出
 * @param items 字符串项数组
 * @param options 列配置
 */
export function printColumns(items: string[], options?: ColumnsOptions): void {
  const columns = options?.columns ?? 2;
  const padding = options?.padding ?? 2;

  // 计算每列的宽度：按列分组后取最大宽度
  const colWidths: number[] = [];
  for (let col = 0; col < columns; col++) {
    let maxLen = 0;
    for (let i = col; i < items.length; i += columns) {
      const len = stripAnsi(items[i]).length;
      if (len > maxLen) maxLen = len;
    }
    colWidths.push(maxLen);
  }

  // 按行输出
  for (let i = 0; i < items.length; i += columns) {
    let line = '  ';
    for (let col = 0; col < columns; col++) {
      const idx = i + col;
      if (idx >= items.length) break;
      const item = items[idx];
      const width = colWidths[col];
      // 左对齐，右侧填充空格
      const stripped = stripAnsi(item);
      const padLen = width - stripped.length;
      line += item + ' '.repeat(Math.max(0, padLen + padding));
    }
    console.log(line.trimEnd());
  }
}
