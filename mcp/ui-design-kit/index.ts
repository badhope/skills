import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatError, formatSuccess } from '../../packages/core/shared/utils'

function parseColor(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  }
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

function hslToRgb(h: number, s: number, l: number) {
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h / 360 + 1/3)
    g = hue2rgb(p, q, h / 360)
    b = hue2rgb(p, q, h / 360 - 1/3)
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  }
}

export default createMCPServer({
  name: 'ui-design-kit',
  version: '2.0.0',
  description: 'Enterprise UI Design System Toolkit - Professional color, typography, motion, and component systems',
  author: 'MCP Expert Community',
  icon: '🎨'
})
  .addTool({
    name: 'ui_generate_palette',
    description: 'Generate professional accessible color palettes with Tailwind 11-shade scale',
    parameters: {
      baseColor: { type: 'string', description: 'Base hex color (e.g., #3b82f6)', required: true },
      name: { type: 'string', description: 'Color name (e.g., primary, blue)', required: false },
      format: { type: 'string', description: 'Output: css, tailwind, json, figma', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        baseColor: { type: 'string', required: true },
        name: { type: 'string', required: false, default: 'primary' },
        format: { type: 'string', required: false, default: 'tailwind' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const cleanColor = validation.data.baseColor.startsWith('#') 
          ? validation.data.baseColor 
          : '#' + validation.data.baseColor
        
        const { r, g, b } = parseColor(cleanColor)
        const { h, s } = rgbToHsl(r, g, b)
        
        const shades = []
        const lightnessSteps = [0.97, 0.93, 0.86, 0.77, 0.66, 0.55, 0.45, 0.36, 0.27, 0.19, 0.11]
        const shadeNames = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
        
        for (let i = 0; i < 11; i++) {
          const { r: nr, g: ng, b: nb } = hslToRgb(h, Math.min(s, 0.85), lightnessSteps[i])
          const hex = '#' + [nr, ng, nb].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
          shades.push({
            shade: shadeNames[i],
            hex,
            rgb: `rgb(${nr}, ${ng}, ${nb})`,
            hsl: `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(lightnessSteps[i] * 100)}%)`
          })
        }

        const colorName = validation.data.name
        
        const cssVariables = shades.map(s => 
          `  --color-${colorName}-${s.shade}: ${s.hex};`
        ).join('\n')

        const tailwindConfig = `"${colorName}": {
  ${shades.map(s => `"${s.shade}": "${s.hex}"`).join(',\n  ')}
}`

        return formatSuccess({
          colorName,
          baseColor: cleanColor,
          format: validation.data.format,
          shades,
          tailwindConfig,
          cssVariables: `:root {\n${cssVariables}\n}`,
          figmaTokens: Object.fromEntries(shades.map(s => [s.shade, s.hex]))
        })
      } catch (e: any) {
        return formatError('Failed to generate color palette', e.message)
      }
    }
  })
  .addTool({
    name: 'ui_generate_gradient',
    description: 'Generate beautiful CSS gradients with easing and direction control',
    parameters: {
      type: { type: 'string', description: 'linear, radial, conic', required: false },
      colors: { type: 'string', description: 'Comma-separated hex colors', required: true },
      direction: { type: 'string', description: 'Direction: to right, 135deg, etc.', required: false },
      stops: { type: 'string', description: 'Custom color stop positions', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: false, default: 'linear' },
        colors: { type: 'string', required: true },
        direction: { type: 'string', required: false, default: 'to right' },
        stops: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const colorList = validation.data.colors.split(',').map((c: string) => c.trim())
        const stopsList = validation.data.stops 
          ? validation.data.stops.split(',').map((s: string) => s.trim())
          : []
        
        const gradientColors = colorList.map((color: string, i: number) => 
          color + (stopsList[i] ? ` ${stopsList[i]}` : '')
        ).join(', ')

        let css = ''
        if (validation.data.type === 'linear') {
          css = `background: linear-gradient(${validation.data.direction}, ${gradientColors});`
        } else if (validation.data.type === 'radial') {
          css = `background: radial-gradient(circle, ${gradientColors});`
        } else if (validation.data.type === 'conic') {
          css = `background: conic-gradient(from ${validation.data.direction}, ${gradientColors});`
        }

        return formatSuccess({
          type: validation.data.type,
          colors: colorList,
          direction: validation.data.direction,
          css,
          tailwindClass: `bg-gradient-to-${validation.data.direction.replace('to ', '')}`,
          preview: '🎨 Apply CSS to any element for preview'
        })
      } catch (e: any) {
        return formatError('Failed to generate gradient', e.message)
      }
    }
  })
  .addTool({
    name: 'ui_generate_animation',
    description: 'Production-ready CSS motion library with easing curves and presets',
    parameters: {
      type: { type: 'string', description: 'fade, slide-up, slide-down, scale, bounce, hover-lift', required: true },
      duration: { type: 'number', description: 'Duration in milliseconds', required: false },
      easing: { type: 'string', description: 'ease, ease-out-cubic, ease-out-expo', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: true },
        duration: { type: 'number', required: false, default: 300 },
        easing: { type: 'string', required: false, default: 'ease-out-cubic' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const easings: Record<string, string> = {
        'ease': 'ease',
        'ease-out': 'ease-out',
        'ease-in-out': 'ease-in-out',
        'ease-out-cubic': 'cubic-bezier(0.33, 1, 0.68, 1)',
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-out-cubic': 'cubic-bezier(0.65, 0, 0.35, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      }

      const animations: Record<string, { keyframes: string; description: string }> = {
        'fade': {
          keyframes: '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; }}',
          description: 'Smooth opacity entrance'
        },
        'slide-up': {
          keyframes: '@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); }}',
          description: 'Fade in from bottom'
        },
        'slide-down': {
          keyframes: '@keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); }}',
          description: 'Fade in from top'
        },
        'scale': {
          keyframes: '@keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); }}',
          description: 'Subtle pop entrance'
        },
        'bounce': {
          keyframes: '@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); }}',
          description: 'Playful bounce effect'
        }
      }

      const anim = animations[validation.data.type] || animations['fade']
      const easingValue = easings[validation.data.easing] || easings['ease-out-cubic']

      return formatSuccess({
        type: validation.data.type,
        duration: validation.data.duration,
        easing: validation.data.easing,
        easingCubic: easingValue,
        description: anim.description,
        keyframes: anim.keyframes,
        cssClass: `.animate-${validation.data.type} {
  animation: ${validation.data.type.includes('slide') ? 'slideUp' : validation.data.type === 'scale' ? 'scaleIn' : 'fadeIn'} ${validation.data.duration}ms ${easingValue} both;
}`,
        hoverLift: `.hover-lift {
  transition: transform ${validation.data.duration}ms ${easingValue}, box-shadow ${validation.data.duration}ms ease;
}
.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px -12px rgba(0, 0, 0, 0.12);
}`
      })
    }
  })
  .addTool({
    name: 'ui_generate_shadow',
    description: 'Elevation shadow system with realistic layered shadows',
    parameters: {
      level: { type: 'number', description: 'Elevation level 0-5', required: true },
      layered: { type: 'boolean', description: 'Multi-layered soft shadows', required: false },
      color: { type: 'string', description: 'Shadow tint color hex', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        level: { type: 'number', required: true },
        layered: { type: 'boolean', required: false, default: true },
        color: { type: 'string', required: false, default: '0, 0, 0' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      if (validation.data.level < 0 || validation.data.level > 5) {
        return formatError('Level must be between 0 and 5')
      }

      const l = validation.data.level
      const c = validation.data.color
      
      const umbraShadows = [
        '',
        `0 1px 2px rgba(${c}, 0.05)`,
        `0 1px 3px rgba(${c}, 0.1)`,
        `0 4px 6px rgba(${c}, 0.1)`,
        `0 10px 15px rgba(${c}, 0.1)`,
        `0 20px 25px rgba(${c}, 0.1)`
      ]
      
      const penumbraShadows = [
        '',
        '',
        `0 1px 2px rgba(${c}, 0.06)`,
        `0 2px 4px rgba(${c}, 0.07)`,
        `0 4px 6px rgba(${c}, 0.08)`,
        `0 8px 10px rgba(${c}, 0.09)`
      ]

      const shadow = validation.data.layered && penumbraShadows[l]
        ? `${umbraShadows[l]}, ${penumbraShadows[l]}`
        : umbraShadows[l]

      return formatSuccess({
        level: l,
        layered: validation.data.layered,
        boxShadow: shadow,
        css: `.elevation-${l} {
  box-shadow: ${shadow};
}`,
        tailwindMapping: ['shadow-none', 'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl'][l]
      })
    }
  })
  .addTool({
    name: 'ui_generate_typography',
    description: 'Complete typography scale system with modular ratios',
    parameters: {
      baseFontSize: { type: 'number', description: 'Base font size in pixels', required: false },
      ratio: { type: 'string', description: 'Modular ratio: minor-second, major-second, golden', required: false },
      lineHeight: { type: 'number', description: 'Base line height', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        baseFontSize: { type: 'number', required: false, default: 16 },
        ratio: { type: 'string', required: false, default: 'major-third' },
        lineHeight: { type: 'number', required: false, default: 1.5 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const ratios: Record<string, number> = {
        'minor-second': 1.067,
        'major-second': 1.125,
        'minor-third': 1.2,
        'major-third': 1.25,
        'perfect-fourth': 1.333,
        'augmented-fourth': 1.414,
        'perfect-fifth': 1.5,
        'golden': 1.618
      }

      const r = ratios[validation.data.ratio] || ratios['major-third']
      const base = validation.data.baseFontSize
      
      const sizes = [
        { name: 'xs', level: -2, lineHeightMultiplier: 1.25 },
        { name: 'sm', level: -1, lineHeightMultiplier: 1.375 },
        { name: 'base', level: 0, lineHeightMultiplier: 1.5 },
        { name: 'lg', level: 1, lineHeightMultiplier: 1.5 },
        { name: 'xl', level: 2, lineHeightMultiplier: 1.4 },
        { name: '2xl', level: 3, lineHeightMultiplier: 1.3 },
        { name: '3xl', level: 4, lineHeightMultiplier: 1.25 },
        { name: '4xl', level: 5, lineHeightMultiplier: 1.2 },
        { name: '5xl', level: 6, lineHeightMultiplier: 1.15 }
      ]

      const scale = sizes.map(s => ({
        name: s.name,
        fontSize: Math.round(base * Math.pow(r, s.level) * 100) / 100,
        lineHeight: Math.round(s.lineHeightMultiplier * 100) / 100
      }))

      return formatSuccess({
        baseFontSize: validation.data.baseFontSize,
        ratio: validation.data.ratio,
        ratioValue: r,
        scale,
        cssVariables: scale.map(s => 
          `  --font-size-${s.name}: ${s.fontSize}px;
  --line-height-${s.name}: ${s.lineHeight};`
        ).join('\n'),
        recommendations: [
          '✅ Use 5xl-3xl for hero headings',
          '✅ Use 2xl-xl for section headings',
          '✅ Use lg-base for body text',
          '✅ Use sm-xs for captions and labels'
        ]
      })
    }
  })
  .addTool({
    name: 'ui_generate_spacing',
    description: 'Consistent 4px-based spacing system with custom increments',
    parameters: {
      baseUnit: { type: 'number', description: 'Base unit in pixels', required: false },
      maxScale: { type: 'number', description: 'Maximum scale multiplier', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        baseUnit: { type: 'number', required: false, default: 4 },
        maxScale: { type: 'number', required: false, default: 16 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const unit = validation.data.baseUnit
      const max = Math.min(validation.data.maxScale, 24)
      
      const spacing: Record<string, string> = {}
      for (let i = 0; i <= max; i++) {
        spacing[i.toString()] = `${i * unit}px`
      }

      const semanticSpacing = {
        'xs': spacing[1],
        'sm': spacing[2],
        'md': spacing[4],
        'lg': spacing[6],
        'xl': spacing[8],
        '2xl': spacing[12],
        '3xl': spacing[16]
      }

      return formatSuccess({
        baseUnit: `${unit}px`,
        maxScale: max,
        incremental: spacing,
        semantic: semanticSpacing,
        usageGuide: {
          'xs': 'Icon padding, tight gaps',
          'sm': 'Button internal padding',
          'md': 'Card padding, element gaps',
          'lg': 'Section internal padding',
          'xl': 'Page gutters, section spacing',
          '2xl': 'Large layout spacing'
        },
        cssVariables: Object.entries(spacing).map(([k, v]) => 
          `  --spacing-${k}: ${v};`
        ).join('\n')
      })
    }
  })
  .addResource({
    name: 'design-system-playbook',
    uri: 'design://system/playbook',
    description: 'Enterprise Design System Playbook',
    mimeType: 'text/markdown',
    get: async () => `
# 🎨 Enterprise Design System Playbook

## Foundation Principles

### Color System
\`\`\`css
:root {
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-900: #1e3a8a;
}
\`\`\`

**Rules:**
- Text: Use 600 on white backgrounds (4.5:1 contrast)
- Backgrounds: 50, 100 for subtle surfaces
- Borders: 200 for default, 300 for emphasized

### Typography Scale (Major Third)
| Size | Font Size | Line Height | Usage |
|------|-----------|-------------|-------|
| xs | 12px | 16px | Captions, labels |
| sm | 14px | 20px | Secondary text |
| base | 16px | 24px | Body text |
| lg | 20px | 28px | Subheadings |
| xl | 25px | 32px | Section headings |
| 2xl | 31px | 36px | Page titles |
| 3xl | 39px | 44px | Hero headings |

### Spacing (4px base)
\`\`\`
0 = 0px
1 = 4px    (tight gaps)
2 = 8px    (button padding)
4 = 16px   (card padding)
6 = 24px   (section padding)
8 = 32px   (layout gaps)
\`\`\`

### Motion Guidelines
| Animation | Duration | Easing |
|-----------|----------|--------|
| Micro-interactions | 100-200ms | ease-out |
| Entrance/Exit | 200-350ms | ease-out-cubic |
| Large transitions | 350-500ms | ease-in-out |

**Easing Curves:**
- ease-out-cubic: cubic-bezier(0.33, 1, 0.68, 1)
- ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)
- spring: cubic-bezier(0.34, 1.56, 0.64, 1)

### Elevation System
| Level | Use Case | Shadow |
|-------|----------|--------|
| 0 | Flat surfaces | none |
| 1 | Buttons, inputs | subtle |
| 2 | Cards, dropdowns | small |
| 3 | Popovers | medium |
| 4 | Modals | large |
| 5 | Toasts, tooltips | x-large |
    `.trim()
  })
  .build()
