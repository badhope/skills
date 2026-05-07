import fs from 'fs/promises'
import path from 'path'
import { SkillDefinition } from './mcp/types'

export async function loadSkillFromDirectory(
  skillPath: string
): Promise<SkillDefinition | null> {
  try {
    const indexPath = path.join(skillPath, 'index.ts')
    
    let skillModule: any
    
    try {
      await fs.access(indexPath)
      skillModule = await import(indexPath)
    } catch (e) {}
    
    if (!skillModule || !skillModule.default) {
      return null
    }
    
    return skillModule.default
  } catch (e) {
    console.error(`Failed to load skill from ${skillPath}:`, e)
    return null
  }
}
