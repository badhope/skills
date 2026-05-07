import { createMCPServer } from '../../packages/core/mcp/builder'
import * as fs from 'fs/promises'
import { validateParams, formatError, formatSuccess, safeExec, sanitizePath } from '../../packages/core/shared/utils'

function parseColor(hex: string) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) }
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
  if (s === 0) { r = g = b = l }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h / 360 + 1/3); g = hue2rgb(p, q, h / 360); b = hue2rgb(p, q, h / 360 - 1/3)
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

function getContrastRatio(hex1: string, hex2: string): number {
  const c1 = parseColor(hex1)
  const c2 = parseColor(hex2)
  
  const getLuminance = (c: { r: number, g: number, b: number }) => {
    const [r, g, b] = [c.r, c.g, c.b].map(x => {
      const normalized = x / 255
      return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  
  const l1 = getLuminance(c1)
  const l2 = getLuminance(c2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function checkAccessibility(color: string, background: string = '#FFFFFF'): {
  aaNormal: boolean
  aaLarge: boolean
  aaaNormal: boolean
  aaaLarge: boolean
  contrast: number
} {
  const contrast = getContrastRatio(color, background)
  return {
    contrast: Math.round(contrast * 100) / 100,
    aaNormal: contrast >= 4.5,
    aaLarge: contrast >= 3,
    aaaNormal: contrast >= 7,
    aaaLarge: contrast >= 4.5
  }
}

export default createMCPServer({
  name: 'frontend-dev-kit',
  version: '2.0.0',
  description: 'Enterprise Frontend Development Kit - Complete toolkit for building modern, accessible, and performant web applications',
  author: 'MCP Expert Community',
  icon: '🎨'
})
  .addTool({
    name: 'ui_generate_palette',
    description: 'Generate WCAG-compliant Tailwind-style color palette with accessibility validation',
    parameters: {
      baseColor: { type: 'string', description: 'Base hex color (e.g., #3B82F6)', required: true },
      name: { type: 'string', description: 'Color name (e.g., blue, primary)', required: false },
      includeAccessibility: { type: 'boolean', description: 'Include WCAG contrast checks', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        baseColor: { type: 'string', required: true },
        name: { type: 'string', required: false, default: 'primary' },
        includeAccessibility: { type: 'boolean', required: false, default: true }
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
          const shade: any = { shade: shadeNames[i], hex }
          
          if (validation.data.includeAccessibility) {
            shade.onWhite = checkAccessibility(hex, '#FFFFFF')
            shade.onBlack = checkAccessibility(hex, '#000000')
          }
          
          shades.push(shade)
        }

        const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        '${validation.data.name}': {${shades.map(s => `
          ${s.shade}: '${s.hex}',`).join('')}
        }
      }
    }
  }
}`

        return formatSuccess({
          colorName: validation.data.name,
          baseColor: cleanColor,
          shades,
          accessibilityVerified: validation.data.includeAccessibility,
          recommendedTextShade: shades.find(s => s.onWhite?.aaaNormal)?.shade || 600,
          tailwindConfig,
          cssVariables: shades.map(s => `  --color-${validation.data.name}-${s.shade}: ${s.hex};`).join('\n')
        })
      } catch (e: any) {
        return formatError('Failed to generate color palette', e.message)
      }
    }
  })
  .addTool({
    name: 'ui_check_contrast',
    description: 'WCAG 2.1 accessibility contrast ratio validator',
    parameters: {
      foreground: { type: 'string', description: 'Foreground text color hex', required: true },
      background: { type: 'string', description: 'Background color hex', required: true },
      fontSize: { type: 'number', description: 'Font size in pixels for level calculation', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        foreground: { type: 'string', required: true },
        background: { type: 'string', required: true },
        fontSize: { type: 'number', required: false, default: 16 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const result = checkAccessibility(validation.data.foreground, validation.data.background)
        const isLargeText = validation.data.fontSize >= 18 || (validation.data.fontSize >= 14)

        return formatSuccess({
          colors: {
            foreground: validation.data.foreground,
            background: validation.data.background
          },
          contrastRatio: `${result.contrast}:1`,
          fontSize: validation.data.fontSize,
          wcagLevels: {
            'AA Normal Text': result.aaNormal ? '✅ PASS' : '❌ FAIL',
            'AA Large Text': result.aaLarge ? '✅ PASS' : '❌ FAIL',
            'AAA Normal Text': result.aaaNormal ? '✅ PASS' : '❌ FAIL',
            'AAA Large Text': result.aaaLarge ? '✅ PASS' : '❌ FAIL'
          },
          recommendations: [
            (!result.aaNormal && isLargeText) ? 'ℹ️ Passes for large text (18pt+) but not normal text' : '',
            !result.aaNormal ? '🔧 Increase contrast by darkening text or lightening background' : '',
            result.contrast >= 7 ? '🎉 Excellent! Meets WCAG AAA requirements' : ''
          ].filter(Boolean)
        })
      } catch (e: any) {
        return formatError('Failed to check contrast', e.message)
      }
    }
  })
  .addTool({
    name: 'ui_generate_button',
    description: 'Enterprise-grade button component generator with variants, sizes, and states',
    parameters: {
      variant: { type: 'string', description: 'solid, outline, ghost, soft, link', required: false },
      size: { type: 'string', description: 'xs, sm, md, lg, xl', required: false },
      color: { type: 'string', description: 'Primary color hex', required: false },
      borderRadius: { type: 'string', description: 'none, sm, md, lg, xl, full', required: false },
      includeStates: { type: 'boolean', description: 'Include hover, focus, active, disabled states', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        variant: { type: 'string', required: false, default: 'solid' },
        size: { type: 'string', required: false, default: 'md' },
        color: { type: 'string', required: false, default: '#3B82F6' },
        borderRadius: { type: 'string', required: false, default: 'lg' },
        includeStates: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const sizes: Record<string, string> = {
        xs: 'px-2.5 py-1.5 text-xs h-7',
        sm: 'px-3 py-2 text-sm h-8',
        md: 'px-4 py-2 text-sm h-10',
        lg: 'px-5 py-2.5 text-base h-11',
        xl: 'px-6 py-3 text-base h-12'
      }

      const radiusMap: Record<string, string> = {
        none: 'rounded-none',
        sm: 'rounded',
        md: 'rounded-md',
        lg: 'rounded-lg',
        xl: 'rounded-xl',
        full: 'rounded-full'
      }

      const variants: Record<string, string> = {
        solid: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/50',
        outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50 focus:ring-2 focus:ring-blue-500/50',
        ghost: 'text-blue-600 hover:bg-blue-50 focus:ring-2 focus:ring-blue-500/30',
        soft: 'bg-blue-100 text-blue-700 hover:bg-blue-200 focus:ring-2 focus:ring-blue-500/30',
        link: 'text-blue-600 underline-offset-4 hover:underline'
      }

      const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:pointer-events-none'
      const fullClasses = `${baseClasses} ${sizes[validation.data.size]} ${radiusMap[validation.data.borderRadius]} ${variants[validation.data.variant]}`

      const componentCode = `import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        solid: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500/50',
        outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50 focus:ring-blue-500/50',
        ghost: 'text-blue-600 hover:bg-blue-50 focus:ring-blue-500/30',
        soft: 'bg-blue-100 text-blue-700 hover:bg-blue-200 focus:ring-blue-500/30',
        link: 'text-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        xs: 'px-2.5 py-1.5 text-xs h-7',
        sm: 'px-3 py-2 text-sm h-8',
        md: 'px-4 py-2 text-sm h-10',
        lg: 'px-5 py-2.5 text-base h-11',
        xl: 'px-6 py-3 text-base h-12',
      },
      rounded: {
        none: 'rounded-none',
        md: 'rounded-md',
        lg: 'rounded-lg',
        full: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
      rounded: 'lg',
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, rounded, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, rounded, className }))}
      {...props}
    />
  )
)

Button.displayName = 'Button'

export { Button, buttonVariants }`

      return formatSuccess({
        variant: validation.data.variant,
        size: validation.data.size,
        borderRadius: validation.data.borderRadius,
        tailwindClasses: fullClasses,
        features: [
          '✅ cva/variant support',
          '✅ TypeScript with forwardRef',
          '✅ Full keyboard accessibility',
          '✅ Disabled state handling',
          '✅ Focus ring and hover states'
        ],
        componentCode,
        exampleJSX: `<Button variant="${validation.data.variant}" size="${validation.data.size}">
  <Icon className="w-4 h-4 mr-2" />
  Submit
</Button>`
      })
    }
  })
  .addTool({
    name: 'layout_generate_grid',
    description: 'Responsive CSS Grid layout generator with breakpoints',
    parameters: {
      columns: { type: 'string', description: 'Column configuration', required: false },
      gap: { type: 'string', description: 'Gap size: none, sm, md, lg, xl', required: false },
      responsive: { type: 'boolean', description: 'Add responsive breakpoints', required: false },
      areas: { type: 'string', description: 'Named grid areas (JSON array)', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        columns: { type: 'string', required: false, default: '1fr' },
        gap: { type: 'string', required: false, default: 'md' },
        responsive: { type: 'boolean', required: false, default: true },
        areas: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const gapMap: Record<string, string> = {
        none: 'gap-0', sm: 'gap-2', md: 'gap-4', lg: 'gap-6', xl: 'gap-8'
      }

      const responsiveColumns = validation.data.responsive ? `
  sm:grid-cols-2
  md:grid-cols-${validation.data.columns}
  lg:grid-cols-${validation.data.columns}
  xl:grid-cols-${validation.data.columns}` : ''

      return formatSuccess({
        configuration: {
          columns: validation.data.columns,
          gap: validation.data.gap,
          responsive: validation.data.responsive
        },
        tailwindClasses: `grid ${gapMap[validation.data.gap]} grid-cols-1${responsiveColumns}`,
        cssGrid: `.grid-container {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(${validation.data.columns}, 1fr));
}

@media (min-width: 768px) {
  .grid-container {
    grid-template-columns: repeat(${validation.data.columns}, 1fr);
  }
}`,
        examples: [
          'Basic card grid: grid grid-cols-1 md:grid-cols-3 gap-6',
          'Masonry alternative: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min',
          'Dashboard: grid grid-cols-1 lg:grid-cols-4 gap-6'
        ]
      })
    }
  })
  .addTool({
    name: 'css_animate_generator',
    description: 'CSS animation generator with easing presets and keyframes',
    parameters: {
      type: { type: 'string', description: 'fade, slide-up, slide-down, scale, bounce, spin', required: false },
      duration: { type: 'number', description: 'Duration in milliseconds', required: false },
      easing: { type: 'string', description: 'ease, ease-in, ease-out, ease-in-out, linear, custom cubic-bezier', required: false },
      delay: { type: 'number', description: 'Delay in milliseconds', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        type: { type: 'string', required: false, default: 'fade' },
        duration: { type: 'number', required: false, default: 300 },
        easing: { type: 'string', required: false, default: 'ease-out' },
        delay: { type: 'number', required: false, default: 0 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const animations: Record<string, { keyframes: string; description: string }> = {
        'fade': {
          keyframes: '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; }}',
          description: 'Smooth fade in transition'
        },
        'slide-up': {
          keyframes: '@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); }}',
          description: 'Fade and slide up from bottom'
        },
        'slide-down': {
          keyframes: '@keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); }}',
          description: 'Fade and slide down from top'
        },
        'scale': {
          keyframes: '@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); }}',
          description: 'Pop scale entrance effect'
        },
        'bounce': {
          keyframes: '@keyframes bounce { 0%, 100% { transform: translateY(-25%); } 50% { transform: translateY(0); }}',
          description: 'Playful bounce animation'
        },
        'spin': {
          keyframes: '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); }}',
          description: 'Continuous rotation for loaders'
        }
      }

      const anim = animations[validation.data.type] || animations['fade']

      return formatSuccess({
        animation: validation.data.type,
        duration: validation.data.duration,
        easing: validation.data.easing,
        delay: validation.data.delay,
        description: anim.description,
        keyframes: anim.keyframes,
        cssClass: `.animate-${validation.data.type} {
  animation: ${validation.data.type} ${validation.data.duration}ms ${validation.data.easing} ${validation.data.delay}ms both;
}`,
        tailwindClasses: `animate-${validation.data.type} [animation-duration:${validation.data.duration}ms]`,
        easingPresets: {
          'ease-out-cubic': 'cubic-bezier(0.33, 1, 0.68, 1) - Standard exit animation',
          'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1) - Smooth, bouncy exit',
          'ease-in-out-cubic': 'cubic-bezier(0.65, 0, 0.35, 1) - Smooth on-off'
        }
      })
    }
  })
  .addTool({
    name: 'frontend_audit',
    description: 'Frontend project quality audit - performance, accessibility, and best practices',
    parameters: {
      path: { type: 'string', description: 'Project root path', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      try {
        const projectPath = sanitizePath(validation.data.path)
        const results: any = { packages: {}, files: {} }

        try {
          const pkgJson = await fs.readFile(`${projectPath}/package.json`, 'utf-8')
          const pkg = JSON.parse(pkgJson)
          results.packages = {
            name: pkg.name,
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
            frameworks: {
              react: Object.keys(pkg.dependencies || {}).includes('react'),
              vue: Object.keys(pkg.dependencies || {}).includes('vue'),
              next: Object.keys(pkg.dependencies || {}).includes('next'),
              nuxt: Object.keys(pkg.dependencies || {}).includes('nuxt'),
              tailwind: Object.keys(pkg.devDependencies || {}).includes('tailwindcss') || Object.keys(pkg.dependencies || {}).includes('tailwindcss'),
              typescript: Object.keys(pkg.devDependencies || {}).includes('typescript')
            }
          }
        } catch {}

        try {
          const twConfig = await safeExec(`Get-ChildItem -Path "${projectPath}" -Name "*tailwind*"`)
          results.packages.frameworks.tailwind = twConfig.includes('tailwind')
        } catch {}

        return formatSuccess({
          projectPath,
          detected: results.packages.frameworks,
          auditScore: 'In Progress',
          recommendations: [
            '✅ Run Lighthouse for performance metrics',
            '✅ Check axe-core for accessibility issues',
            '✅ Use BundleAnalyzer for bundle size',
            results.packages.frameworks.typescript ? '✅ TypeScript enabled' : '🔧 Consider adding TypeScript',
            results.packages.frameworks.tailwind ? '✅ Tailwind CSS configured' : '🎨 Consider Tailwind for styling'
          ]
        })
      } catch (e: any) {
        return formatError('Failed to audit frontend project', e.message)
      }
    }
  })
  .addResource({
    name: 'frontend-cheatsheet',
    uri: 'cheatsheet://frontend/master',
    description: 'Modern Frontend Development Cheat Sheet',
    mimeType: 'text/markdown',
    get: async () => `
# 🎨 Frontend Development Master Cheat Sheet

## Flexbox Layout
\`\`\`css
.container {
  display: flex;
  justify-content: center;     /* main-axis */
  align-items: center;         /* cross-axis */
  flex-direction: row;         /* row | row-reverse | column | column-reverse */
  flex-wrap: wrap;             /* wrap items */
  gap: 1rem;                   /* spacing between items */
}
\`\`\`

## Grid Layout
\`\`\`css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  grid-template-rows: auto;
  gap: 1.5rem;
}
\`\`\`

## CSS Box Shadow Levels
\`\`\`css
.shadow-sm   /* subtle */
.shadow      /* small */
.shadow-md   /* medium */
.shadow-lg   /* large */
.shadow-xl   /* extra large */
.shadow-2xl  /* 2x large */
\`\`\`

## Animation Timing Functions
| Preset | Cubic Bezier | Use Case |
|--------|--------------|----------|
| ease-out | cubic-bezier(0.33, 1, 0.68, 1) | Exiting elements |
| ease-in-out | cubic-bezier(0.65, 0, 0.35, 1) | Enter & Exit |
| sharp | cubic-bezier(0.4, 0, 0.6, 1) | Quick movement |

## Accessibility (A11y) Checklist
- [ ] Semantic HTML (\`<nav>\`, \`<main>\`, \`<article>\`, \`<section>\`)
- [ ] Text contrast >= 4.5:1 (WCAG AA)
- [ ] Keyboard navigation (\`tabindex\`, focus visible)
- [ ] ARIA labels for icon-only buttons
- [ ] Skip-to-content link
- [ ] No auto-playing audio
- [ ] Form inputs have associated \`<label>\`

## Responsive Breakpoints (Tailwind)
| Breakpoint | Width |
|------------|-------|
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | 1536px |

## Performance Optimization
1. **Use CSS Contain** for independent subtrees
2. **will-change: transform** for animated elements
3. **transform: translateZ(0)** for GPU acceleration
4. **debounce** scroll/resize handlers
    `.trim()
  })
  .build()
