import { createMCPServer } from '../../packages/core/mcp/builder'

export default createMCPServer({
  name: 'colors',
  version: '1.0.0',
  description: '颜色转换、调色板生成、对比度检查、主题配色工具',
  author: 'MCP Expert Community',
  icon: '🎨'
})
  .addTool({
    name: 'color_hex_to_rgb',
    description: 'HEX转RGB',
    parameters: {
      hex: { type: 'string', description: 'HEX颜色，如#FFFFFF', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const h = params.hex.replace('#', '')
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return { success: true, rgb: `rgb(${r}, ${g}, ${b})`, rgbArray: [r, g, b] }
    }
  })
  .addTool({
    name: 'color_rgb_to_hex',
    description: 'RGB转HEX',
    parameters: {
      r: { type: 'number', description: 'Red 0-255', required: true },
      g: { type: 'number', description: 'Green 0-255', required: true },
      b: { type: 'number', description: 'Blue 0-255', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
      const hex = `#${toHex(params.r)}${toHex(params.g)}${toHex(params.b)}`.toUpperCase()
      return { success: true, hex }
    }
  })
  .addTool({
    name: 'color_palette',
    description: '生成和谐配色方案',
    parameters: {
      baseColor: { type: 'string', description: '基础色HEX', required: true },
      scheme: { type: 'string', description: 'complementary, triadic, analogous, monochromatic', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const scheme = params.scheme || 'complementary'
      const base = params.baseColor.replace('#', '')
      const r = parseInt(base.slice(0, 2), 16)
      const g = parseInt(base.slice(2, 4), 16)
      const b = parseInt(base.slice(4, 6), 16)
      const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
      const palettes: Record<string, string[]> = {
        complementary: [params.baseColor, `#${toHex(255 - r)}${toHex(255 - g)}${toHex(255 - b)}`],
        triadic: [params.baseColor, `#${toHex(g)}${toHex(b)}${toHex(r)}`, `#${toHex(b)}${toHex(r)}${toHex(g)}`],
        monochromatic: [0.25, 0.5, 0.75, 1, 1.25].map(m => `#${toHex(r * m)}${toHex(g * m)}${toHex(b * m)}`)
      }
      return { success: true, scheme, palette: palettes[scheme] || palettes.complementary, baseColor: params.baseColor }
    }
  })
  .addTool({
    name: 'color_contrast',
    description: '对比度检查，WCAG无障碍标准',
    parameters: {
      foreground: { type: 'string', description: '前景色HEX', required: true },
      background: { type: 'string', description: '背景色HEX', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const luminance = (hex: string) => {
        const h = hex.replace('#', '')
        const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        const srgb = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
        return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
      }
      const l1 = luminance(params.foreground)
      const l2 = luminance(params.background)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      const wcag = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'FAIL'
      return { success: true, ratio: ratio.toFixed(2), wcag, foreground: params.foreground, background: params.background, pass: ratio >= 4.5 }
    }
  })
  .addTool({
    name: 'color_tailwind',
    description: '匹配最接近的Tailwind颜色',
    parameters: {
      hex: { type: 'string', description: 'HEX颜色', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const tailwind: Record<string, string> = {
        'red-500': '#EF4444', 'blue-500': '#3B82F6', 'green-500': '#22C55E',
        'yellow-500': '#EAB308', 'purple-500': '#A855F7', 'pink-500': '#EC4899',
        'indigo-500': '#6366F1', 'gray-500': '#6B7280', 'slate-500': '#64748B',
        'orange-500': '#F97316', 'amber-500': '#F59E0B', 'emerald-500': '#10B981',
        'teal-500': '#14B8A6', 'cyan-500': '#06B6D4', 'sky-500': '#0EA5E9',
        'violet-500': '#8B5CF6', 'fuchsia-500': '#D946EF', 'rose-500': '#F43F5E'
      }
      const target = params.hex.replace('#', '').toUpperCase()
      const tr = parseInt(target.slice(0, 2), 16)
      const tg = parseInt(target.slice(2, 4), 16)
      const tb = parseInt(target.slice(4, 6), 16)
      let best = ''
      let minDist = Infinity
      for (const [name, color] of Object.entries(tailwind)) {
        const c = color.replace('#', '')
        const dist = Math.pow(tr - parseInt(c.slice(0, 2), 16), 2) +
                     Math.pow(tg - parseInt(c.slice(2, 4), 16), 2) +
                     Math.pow(tb - parseInt(c.slice(4, 6), 16), 2)
        if (dist < minDist) {
          minDist = dist
          best = name
        }
      }
      return { success: true, tailwind: best, matchedColor: tailwind[best] }
    }
  })
  .build()
