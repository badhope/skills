import { SkillDefinition } from './mcp/types'

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map()

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill)
    console.log(`✅ Registered skill: ${skill.name}`)
  }

  unregister(skillName: string): boolean {
    return this.skills.delete(skillName)
  }

  get(skillName: string): SkillDefinition | undefined {
    return this.skills.get(skillName)
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values())
  }

  search(query: string): SkillDefinition[] {
    const q = query.toLowerCase()
    return this.list().filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.keywords?.some((k: string) => k.toLowerCase().includes(q))
    )
  }

  getByCategory(category: string): SkillDefinition[] {
    return this.list().filter(s => s.category === category)
  }
}

export const registry = new SkillRegistry()

export async function initializeRegistry(): Promise<void> {
  console.log('🔧 Initializing Universal Agent Skills Registry...')
  
  const builtInSkills = ['code-review', 'bug-fixer', 'test-generator', 'explain-this']
  
  for (const skillName of builtInSkills) {
    try {
      const skillModule = await import(`../../skills/${skillName}/index.js`)
      if (skillModule.default) {
        registry.register(skillModule.default)
      }
    } catch (e) {
      console.debug(`Built-in skill ${skillName} not loaded yet`)
    }
  }
  
  console.log(`✅ Initialized ${registry.list().length} skills`)
}
