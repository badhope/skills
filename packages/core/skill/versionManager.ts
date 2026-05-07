import fs from 'fs/promises';
import path from 'path';
import { SkillDefinition, SkillMetadata } from './types';
import { SkillLoader } from './loader';

export interface SkillVersion {
  version: string;
  name: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  isActive: boolean;
  changelog: string;
  hash: string;
}

export interface VersionDiff {
  versionFrom: string;
  versionTo: string;
  changes: Change[];
}

export interface Change {
  type: 'added' | 'removed' | 'modified' | 'renamed';
  path: string;
  description: string;
}

export interface VersionHistory {
  versions: SkillVersion[];
  currentVersion: string;
  latestVersion: string;
}

export class SkillVersionManager {
  private versionsPath: string;
  private loader: SkillLoader;

  constructor(versionsPath: string = './.agent-skills/versions') {
    this.versionsPath = versionsPath;
    this.loader = new SkillLoader();
    this.initStorage().catch(console.error);
  }

  private async initStorage(): Promise<void> {
    try {
      await fs.mkdir(this.versionsPath, { recursive: true });
    } catch (e) {
      console.error('Failed to initialize versions storage:', e);
    }
  }

  async createVersion(skill: SkillDefinition, changelog: string = ''): Promise<SkillVersion> {
    const version: SkillVersion = {
      version: skill.metadata.version,
      name: skill.metadata.name,
      description: skill.metadata.description,
      created_at: new Date(),
      updated_at: new Date(),
      isActive: true,
      changelog,
      hash: this.calculateHash(skill.content)
    };

    const skillVersionsPath = path.join(this.versionsPath, skill.metadata.name);
    await fs.mkdir(skillVersionsPath, { recursive: true });

    const versionPath = path.join(skillVersionsPath, `${skill.metadata.version}.json`);
    const data = JSON.stringify(version, (key, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      return value;
    }, 2);

    await fs.writeFile(versionPath, data, 'utf8');

    const contentPath = path.join(skillVersionsPath, `${skill.metadata.version}.md`);
    await fs.writeFile(contentPath, skill.content, 'utf8');

    await this.updateActiveVersion(skill.metadata.name, skill.metadata.version);

    return version;
  }

  async getVersion(skillName: string, version: string): Promise<SkillDefinition | null> {
    const versionPath = path.join(this.versionsPath, skillName, `${version}.md`);
    
    try {
      const content = await fs.readFile(versionPath, 'utf8');
      return this.loader.parseSKILLmd(content, skillName);
    } catch (e) {
      return null;
    }
  }

  async getVersionInfo(skillName: string, version: string): Promise<SkillVersion | null> {
    const infoPath = path.join(this.versionsPath, skillName, `${version}.json`);
    
    try {
      const data = await fs.readFile(infoPath, 'utf8');
      return JSON.parse(data, (key, value) => {
        if (value && value.__type === 'Date') {
          return new Date(value.value);
        }
        return value;
      }) as SkillVersion;
    } catch (e) {
      return null;
    }
  }

  async getVersionHistory(skillName: string): Promise<VersionHistory> {
    const skillVersionsPath = path.join(this.versionsPath, skillName);
    const versions: SkillVersion[] = [];
    
    try {
      const files = await fs.readdir(skillVersionsPath);
      const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('active'));
      
      for (const file of jsonFiles) {
        const info = await this.getVersionInfo(skillName, file.replace('.json', ''));
        if (info) {
          versions.push(info);
        }
      }
      
      versions.sort((a, b) => this.compareVersions(b.version, a.version));
      
      const activeVersion = await this.getActiveVersion(skillName);
      
      return {
        versions,
        currentVersion: activeVersion || (versions[0]?.version || 'unknown'),
        latestVersion: versions[0]?.version || 'unknown'
      };
    } catch (e) {
      return { versions: [], currentVersion: 'unknown', latestVersion: 'unknown' };
    }
  }

  async upgrade(skillName: string, targetVersion: string): Promise<boolean> {
    const history = await this.getVersionHistory(skillName);
    const targetInfo = history.versions.find(v => v.version === targetVersion);
    
    if (!targetInfo) {
      return false;
    }

    const skill = await this.getVersion(skillName, targetVersion);
    if (!skill) {
      return false;
    }

    await this.updateActiveVersion(skillName, targetVersion);

    const oldVersions = history.versions.filter(v => v.version !== targetVersion);
    for (const v of oldVersions) {
      const versionPath = path.join(this.versionsPath, skillName, `${v.version}.json`);
      try {
        const data = await fs.readFile(versionPath, 'utf8');
        const info = JSON.parse(data) as SkillVersion;
        info.isActive = false;
        await fs.writeFile(versionPath, JSON.stringify(info, null, 2), 'utf8');
      } catch (e) {
        console.error(`Failed to update version ${v.version} status:`, e);
      }
    }

    return true;
  }

  async rollback(skillName: string, targetVersion: string): Promise<boolean> {
    return this.upgrade(skillName, targetVersion);
  }

  async getActiveVersion(skillName: string): Promise<string | null> {
    const activePath = path.join(this.versionsPath, skillName, 'active.json');
    
    try {
      const data = await fs.readFile(activePath, 'utf8');
      const info = JSON.parse(data);
      return info.version || null;
    } catch (e) {
      return null;
    }
  }

  private async updateActiveVersion(skillName: string, version: string): Promise<void> {
    const activePath = path.join(this.versionsPath, skillName, 'active.json');
    const data = JSON.stringify({ version, updatedAt: new Date().toISOString() }, null, 2);
    await fs.writeFile(activePath, data, 'utf8');
  }

  async compareVersions(skillName: string, version1: string, version2: string): Promise<VersionDiff> {
    const skill1 = await this.getVersion(skillName, version1);
    const skill2 = await this.getVersion(skillName, version2);

    const changes: Change[] = [];

    if (!skill1 || !skill2) {
      return { versionFrom: version1, versionTo: version2, changes };
    }

    if (skill1.metadata.description !== skill2.metadata.description) {
      changes.push({
        type: 'modified',
        path: 'metadata.description',
        description: 'Description changed'
      });
    }

    const oldInvokes = new Set(skill1.metadata.invokes);
    const newInvokes = new Set(skill2.metadata.invokes);
    
    for (const invoke of newInvokes) {
      if (!oldInvokes.has(invoke)) {
        changes.push({
          type: 'added',
          path: `metadata.invokes.${invoke}`,
          description: `Added invoke: ${invoke}`
        });
      }
    }
    
    for (const invoke of oldInvokes) {
      if (!newInvokes.has(invoke)) {
        changes.push({
          type: 'removed',
          path: `metadata.invokes.${invoke}`,
          description: `Removed invoke: ${invoke}`
        });
      }
    }

    const oldCapabilities = new Set(skill1.metadata.capabilities);
    const newCapabilities = new Set(skill2.metadata.capabilities);
    
    for (const cap of newCapabilities) {
      if (!oldCapabilities.has(cap)) {
        changes.push({
          type: 'added',
          path: `metadata.capabilities.${cap}`,
          description: `Added capability: ${cap}`
        });
      }
    }
    
    for (const cap of oldCapabilities) {
      if (!newCapabilities.has(cap)) {
        changes.push({
          type: 'removed',
          path: `metadata.capabilities.${cap}`,
          description: `Removed capability: ${cap}`
        });
      }
    }

    const workflowCount1 = skill1.workflows.length;
    const workflowCount2 = skill2.workflows.length;
    
    if (workflowCount1 !== workflowCount2) {
      changes.push({
        type: workflowCount2 > workflowCount1 ? 'added' : 'removed',
        path: 'workflows',
        description: `Workflow count changed from ${workflowCount1} to ${workflowCount2}`
      });
    }

    return {
      versionFrom: version1,
      versionTo: version2,
      changes
    };
  }

  async getAllSkillVersions(): Promise<Record<string, VersionHistory>> {
    const result: Record<string, VersionHistory> = {};
    
    try {
      const skillDirs = await fs.readdir(this.versionsPath);
      
      for (const dir of skillDirs) {
        const dirPath = path.join(this.versionsPath, dir);
        const stat = await fs.stat(dirPath);
        
        if (stat.isDirectory()) {
          result[dir] = await this.getVersionHistory(dir);
        }
      }
    } catch (e) {
      console.error('Failed to get all skill versions:', e);
    }
    
    return result;
  }

  async deleteVersion(skillName: string, version: string): Promise<boolean> {
    const versionPath = path.join(this.versionsPath, skillName, `${version}.json`);
    const contentPath = path.join(this.versionsPath, skillName, `${version}.md`);
    
    try {
      await fs.unlink(versionPath);
      await fs.unlink(contentPath);
      return true;
    } catch (e) {
      return false;
    }
  }

  async cleanupOldVersions(skillName: string, keepCount: number = 5): Promise<number> {
    const history = await this.getVersionHistory(skillName);
    const sortedVersions = [...history.versions].sort((a, b) => 
      this.compareVersions(b.version, a.version)
    );
    
    const versionsToDelete = sortedVersions.slice(keepCount);
    let deletedCount = 0;
    
    for (const version of versionsToDelete) {
      if (await this.deleteVersion(skillName, version.version)) {
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  private calculateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(p => parseInt(p) || 0);
    const parts2 = v2.split('.').map(p => parseInt(p) || 0);
    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }
}

export const globalVersionManager = new SkillVersionManager();