import { createMCPServer } from '../../packages/core/mcp/builder'

function factorial(n: number): number {
  if (n < 0) throw new Error('负数没有阶乘')
  if (n > 170) return Infinity
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  k = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i
  }
  return result
}

function permutation(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 0; i < k; i++) result *= (n - i)
  return result
}

function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    [a, b] = [b, a % b]
  }
  return a
}

function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b)
}

function isPrime(n: number): boolean {
  if (n < 2) return false
  if (n === 2) return true
  if (n % 2 === 0) return false
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false
  }
  return true
}

function fibonacci(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [0]
  const result = [0, 1]
  for (let i = 2; i < n; i++) {
    result.push(result[i - 1] + result[i - 2])
  }
  return result
}

function standardDeviation(numbers: number[]): number {
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length
  const squareDiffs = numbers.map(n => Math.pow(n - mean, 2))
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / numbers.length)
}

export default createMCPServer({
  name: 'math',
  version: '1.0.0',
  description: '数学计算工具集 - 阶乘、排列组合、最大公约数、质数判断、统计计算',
  author: 'MCP Expert Community',
  icon: '🧮'
})
  .addTool({
    name: 'math_factorial',
    description: '计算阶乘',
    parameters: {
      n: { type: 'number', description: '数字', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const n = Number(params.n)
      return { success: true, n, factorial: factorial(n) }
    }
  })
  .addTool({
    name: 'math_combination',
    description: '计算组合数 C(n,k)',
    parameters: {
      n: { type: 'number', description: '总数', required: true },
      k: { type: 'number', description: '选取数', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const n = Number(params.n)
      const k = Number(params.k)
      return { success: true, n, k, combination: combination(n, k), formula: `C(${n},${k})` }
    }
  })
  .addTool({
    name: 'math_permutation',
    description: '计算排列数 P(n,k)',
    parameters: {
      n: { type: 'number', description: '总数', required: true },
      k: { type: 'number', description: '选取数', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const n = Number(params.n)
      const k = Number(params.k)
      return { success: true, n, k, permutation: permutation(n, k), formula: `P(${n},${k})` }
    }
  })
  .addTool({
    name: 'math_gcd',
    description: '计算最大公约数',
    parameters: {
      a: { type: 'number', description: '数字A', required: true },
      b: { type: 'number', description: '数字B', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const a = Number(params.a)
      const b = Number(params.b)
      return { success: true, a, b, gcd: gcd(a, b) }
    }
  })
  .addTool({
    name: 'math_lcm',
    description: '计算最小公倍数',
    parameters: {
      a: { type: 'number', description: '数字A', required: true },
      b: { type: 'number', description: '数字B', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const a = Number(params.a)
      const b = Number(params.b)
      return { success: true, a, b, lcm: lcm(a, b) }
    }
  })
  .addTool({
    name: 'math_is_prime',
    description: '判断是否为质数',
    parameters: {
      n: { type: 'number', description: '数字', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const n = Number(params.n)
      return { success: true, n, isPrime: isPrime(n) }
    }
  })
  .addTool({
    name: 'math_fibonacci',
    description: '生成斐波那契数列',
    parameters: {
      n: { type: 'number', description: '项数', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const n = Number(params.n)
      return { success: true, n, sequence: fibonacci(n) }
    }
  })
  .addTool({
    name: 'math_statistics',
    description: '统计计算 - 平均值、中位数、标准差、方差',
    parameters: {
      numbers: { type: 'string', description: '逗号分隔的数字列表', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const numbers = String(params.numbers).split(',').map(Number).filter(n => !isNaN(n))
      const sorted = [...numbers].sort((a, b) => a - b)
      const sum = numbers.reduce((a, b) => a + b, 0)
      const mean = sum / numbers.length
      const mid = Math.floor(sorted.length / 2)
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length
      const stdDev = Math.sqrt(variance)
      return {
        success: true,
        count: numbers.length,
        sum,
        mean,
        median,
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        variance,
        standardDeviation: stdDev
      }
    }
  })
  .addTool({
    name: 'math_base_convert',
    description: '进制转换 - 2-36进制互转',
    parameters: {
      input: { type: 'string', description: '输入数值', required: true },
      fromBase: { type: 'number', description: '源进制(2-36)', required: false },
      toBase: { type: 'number', description: '目标进制(2-36)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const fromBase = Number(params.fromBase) || 10
      const toBase = Number(params.toBase) || 2
      const decimal = parseInt(String(params.input), fromBase)
      const result = decimal.toString(toBase).toUpperCase()
      return { success: true, input: params.input, fromBase, toBase, result, decimal }
    }
  })
  .build()
