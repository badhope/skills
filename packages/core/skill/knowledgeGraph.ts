import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface Entity {
  id: string;
  type: string;
  label: string;
  attributes: Record<string, any>;
  description?: string;
}

export interface Relationship {
  id: string;
  from: string;
  to: string;
  type: string;
  weight: number;
  attributes?: Record<string, any>;
}

export interface GraphConfig {
  dataPath: string;
  autoSave: boolean;
}

export interface GraphQueryResult {
  entities: Entity[];
  relationships: Relationship[];
  paths?: Array<{ entities: string[]; relationships: string[] }>;
}

export class KnowledgeGraph {
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private entityIndex: Map<string, string[]> = new Map();
  private config: GraphConfig;

  constructor(config?: Partial<GraphConfig>) {
    this.config = {
      dataPath: './graph',
      autoSave: true,
      ...config
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.dataPath, { recursive: true });
    await this.loadGraphData();
  }

  private async loadGraphData(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.dataPath);
      
      for (const file of files) {
        const filePath = path.join(this.config.dataPath, file);
        
        if (file === 'entities.yaml') {
          const content = await fs.readFile(filePath, 'utf8');
          const data = yaml.load(content) as { entities: Entity[] };
          if (data?.entities) {
            for (const entity of data.entities) {
              this.addEntity(entity);
            }
          }
        }
        
        if (file === 'relationships.yaml') {
          const content = await fs.readFile(filePath, 'utf8');
          const data = yaml.load(content) as { relationships: Relationship[] };
          if (data?.relationships) {
            for (const rel of data.relationships) {
              this.addRelationship(rel);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load graph data: ${error}`);
    }
  }

  async saveGraphData(): Promise<void> {
    const entities = Array.from(this.entities.values());
    const relationships = Array.from(this.relationships.values());

    await fs.writeFile(
      path.join(this.config.dataPath, 'entities.yaml'),
      yaml.dump({ entities }, { sortKeys: true })
    );
    await fs.writeFile(
      path.join(this.config.dataPath, 'relationships.yaml'),
      yaml.dump({ relationships }, { sortKeys: true })
    );
  }

  addEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
    
    this.entityIndex.set(entity.type, [
      ...(this.entityIndex.get(entity.type) || []),
      entity.id
    ]);
  }

  addRelationship(relationship: Relationship): void {
    if (!this.entities.has(relationship.from)) {
      throw new Error(`Source entity not found: ${relationship.from}`);
    }
    if (!this.entities.has(relationship.to)) {
      throw new Error(`Target entity not found: ${relationship.to}`);
    }
    
    this.relationships.set(relationship.id, relationship);
  }

  getEntity(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  getEntitiesByType(type: string): Entity[] {
    const ids = this.entityIndex.get(type) || [];
    return ids.map(id => this.entities.get(id)).filter((e): e is Entity => e !== undefined);
  }

  getRelationships(entityId: string): Relationship[] {
    const rels: Relationship[] = [];
    for (const rel of this.relationships.values()) {
      if (rel.from === entityId || rel.to === entityId) {
        rels.push(rel);
      }
    }
    return rels;
  }

  getRelatedEntities(entityId: string, relationshipType?: string): Entity[] {
    const relatedIds = new Set<string>();
    
    for (const rel of this.relationships.values()) {
      if (relationshipType && rel.type !== relationshipType) continue;
      
      if (rel.from === entityId) {
        relatedIds.add(rel.to);
      } else if (rel.to === entityId) {
        relatedIds.add(rel.from);
      }
    }
    
    return Array.from(relatedIds)
      .map(id => this.entities.get(id))
      .filter((e): e is Entity => e !== undefined);
  }

  async query(
    entityType?: string,
    relationshipType?: string,
    filters?: Record<string, any>
  ): Promise<GraphQueryResult> {
    let entities = Array.from(this.entities.values());
    let relationships = Array.from(this.relationships.values());

    if (entityType) {
      entities = entities.filter(e => e.type === entityType);
    }

    if (relationshipType) {
      relationships = relationships.filter(r => r.type === relationshipType);
    }

    if (filters) {
      entities = entities.filter(e => {
        for (const [key, value] of Object.entries(filters)) {
          if (e.attributes[key] !== value) return false;
        }
        return true;
      });
    }

    return { entities, relationships };
  }

  async findPaths(startId: string, endId: string, maxDepth: number = 3): Promise<GraphQueryResult> {
    const paths: Array<{ entities: string[]; relationships: string[] }> = [];
    const visited = new Set<string>();
    
    const dfs = (currentId: string, pathEntities: string[], pathRels: string[], depth: number) => {
      if (depth > maxDepth) return;
      if (visited.has(currentId)) return;
      
      visited.add(currentId);
      
      if (currentId === endId) {
        paths.push({ entities: [...pathEntities, currentId], relationships: [...pathRels] });
        visited.delete(currentId);
        return;
      }
      
      for (const rel of this.getRelationships(currentId)) {
        const nextId = rel.from === currentId ? rel.to : rel.from;
        if (!pathEntities.includes(nextId)) {
          dfs(nextId, [...pathEntities, currentId], [...pathRels, rel.id], depth + 1);
        }
      }
      
      visited.delete(currentId);
    };
    
    dfs(startId, [], [], 0);
    
    return {
      entities: paths.flatMap(p => p.entities.map(id => this.entities.get(id)).filter(Boolean)) as Entity[],
      relationships: paths.flatMap(p => p.relationships.map(id => this.relationships.get(id)).filter(Boolean)) as Relationship[],
      paths
    };
  }

  async inferRelationships(entityId: string): Promise<Relationship[]> {
    const entity = this.entities.get(entityId);
    if (!entity) return [];

    const inferred: Relationship[] = [];
    const related = this.getRelatedEntities(entityId);

    for (let i = 0; i < related.length; i++) {
      for (let j = i + 1; j < related.length; j++) {
        const existingRel = Array.from(this.relationships.values()).find(
          r => (r.from === related[i].id && r.to === related[j].id) ||
               (r.from === related[j].id && r.to === related[i].id)
        );
        
        if (!existingRel) {
          inferred.push({
            id: `inferred-${related[i].id}-${related[j].id}`,
            from: related[i].id,
            to: related[j].id,
            type: 'related_to',
            weight: 0.5
          });
        }
      }
    }

    return inferred;
  }

  getEntityCount(): number {
    return this.entities.size;
  }

  getRelationshipCount(): number {
    return this.relationships.size;
  }

  async getStats(): Promise<{
    entityCount: number;
    relationshipCount: number;
    entityTypes: string[];
    relationshipTypes: string[];
  }> {
    const entityTypes = [...new Set(Array.from(this.entities.values()).map(e => e.type))];
    const relationshipTypes = [...new Set(Array.from(this.relationships.values()).map(r => r.type))];

    return {
      entityCount: this.entities.size,
      relationshipCount: this.relationships.size,
      entityTypes,
      relationshipTypes
    };
  }

  async clear(): Promise<void> {
    this.entities.clear();
    this.relationships.clear();
    this.entityIndex.clear();
    
    try {
      const files = await fs.readdir(this.config.dataPath);
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          await fs.unlink(path.join(this.config.dataPath, file));
        }
      }
    } catch (error) {
      console.warn(`Failed to clear graph data: ${error}`);
    }
  }

  setConfig(config: Partial<GraphConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): GraphConfig {
    return { ...this.config };
  }
}

export const knowledgeGraph = new KnowledgeGraph();

export default KnowledgeGraph;
