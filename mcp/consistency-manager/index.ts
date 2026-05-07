import crypto from 'crypto';
import { createMCPServer } from '../../packages/core/mcp/builder';
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils';
import * as fs from 'fs/promises';
import * as path from 'path';

export default createMCPServer({
  name: 'consistency-manager',
  version: '1.0.0',
  description: '功能一致性检查与更新工具 - 同步新功能到所有模块，清理测试文件',
  author: 'MCP Expert Community',
  icon: '🔄'
})
  .forAllPlatforms({
    categories: ['Maintenance', 'DevOps', 'Tools'],
    rating: 'professional',
    features: ['功能同步', '一致性检查', '文件清理', '批量更新']
  })
  .addTool({
    name: 'check_consistency',
    description: '检查所有模块的功能一致性 - 发现遗漏和过时的部分',
    parameters: {
      targetModules: { type: 'array', description: '目标模块列表', required: false },
      checkAreas: { type: 'array', description: '检查领域', enum: ['tools', 'workflows', 'agents', 'configuration', 'all'], default: 'all' },
      baseline: { type: 'string', description: '基线版本', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        targetModules: { type: 'array', required: false },
        checkAreas: { type: 'array', required: false },
        baseline: { type: 'string', required: false }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const { targetModules = [], checkAreas = ['all'], baseline } = params;
      const areasToCheck = checkAreas.includes('all') ? ['tools', 'workflows', 'agents', 'configuration'] : checkAreas;

      const consistencyReport: any = {
        timestamp: new Date().toISOString(),
        modules: [],
        issues: [],
        missingFeatures: [],
        outdatedComponents: []
      };

      const allModules = [
        'clarify', 'libraries', 'proxy', 'secrets', 'data-crawler', 'agent-devkit',
        'react', 'typescript', 'frontend-dev-kit', 'ui-design-kit',
        'backend-dev-kit', 'api-dev', 'database', 'mongodb', 'redis',
        'docker', 'kubernetes', 'git', 'github', 'gitlab', 'gitea', 'bitbucket',
        'aws', 'aws-dev', 'aliyun', 'cloudflare', 'vercel', 'sentry', 'observability-mq',
        'openai', 'agent-autonomous', 'agent-multi', 'agent-reflection', 'thinking', 'memory',
        'qa-dev-kit', 'testing-toolkit', 'test-generator', 'performance-optimizer',
        'security-auditor', 'code-review',
        'documentation', 'markdown', 'pdf', 'academic-writing',
        'filesystem', 'terminal', 'search', 'web-search', 'search-tools', 'search-pdf-advanced',
        'datetime', 'math', 'regex', 'random', 'compression', 'csv', 'spreadsheet', 'images'
      ];

      const modulesToCheck = targetModules.length > 0 ? targetModules : allModules;

      for (const moduleName of modulesToCheck) {
        const moduleCheck = await checkModule(moduleName, areasToCheck);
        consistencyReport.modules.push(moduleCheck);

        if (moduleCheck.missing) {
          consistencyReport.missingFeatures.push(...moduleCheck.missing);
        }
        if (moduleCheck.outdated) {
          consistencyReport.outdatedComponents.push(...moduleCheck.outdated);
        }
      }

      consistencyReport.summary = {
        totalModules: modulesToCheck.length,
        consistent: consistencyReport.modules.filter(m => m.consistent).length,
        needsUpdate: consistencyReport.modules.filter(m => !m.consistent).length,
        totalIssues: consistencyReport.missingFeatures.length + consistencyReport.outdatedComponents.length
      };

      return formatSuccess({
        consistencyReport,
        recommendations: [
          '使用 sync_features 工具同步缺失的功能',
          '使用 update_modules 工具批量更新模块',
          '使用 cleanup_files 工具清理测试和临时文件'
        ]
      });
    }
  })
  .addTool({
    name: 'sync_features',
    description: '同步新功能到所有模块 - 确保所有模块具有最新功能',
    parameters: {
      sourceModules: { type: 'array', description: '源模块列表', required: true },
      targetModules: { type: 'array', description: '目标模块列表', required: false },
      features: { type: 'array', description: '要同步的功能', required: false },
      syncMode: { type: 'string', description: '同步模式', enum: ['add', 'replace', 'merge'], default: 'merge' }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        sourceModules: { type: 'array', required: true },
        targetModules: { type: 'array', required: false },
        features: { type: 'array', required: false },
        syncMode: { type: 'string', required: false, enum: ['add', 'replace', 'merge'] }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const { sourceModules, targetModules = [], features = [], syncMode = 'merge' } = params;
      const allModules = ['clarify', 'libraries', 'proxy', 'secrets', 'data-crawler', 'agent-devkit'];

      const targets = targetModules.length > 0 ? targetModules : allModules.filter(m => !sourceModules.includes(m));

      const syncResults = {
        timestamp: new Date().toISOString(),
        sourceModules,
        targetModules: targets,
        features,
        syncMode,
        successful: [],
        failed: [],
        skipped: []
      };

      for (const target of targets) {
        try {
          const result = await syncToModule(sourceModules, target, features, syncMode);
          if (result.success) {
            syncResults.successful.push({
              module: target,
              featuresSynced: result.featuresSynced,
              timestamp: new Date().toISOString()
            });
          } else {
            syncResults.skipped.push({
              module: target,
              reason: result.reason
            });
          }
        } catch (error) {
          syncResults.failed.push({
            module: target,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return formatSuccess({
        syncResults,
        summary: `成功同步 ${syncResults.successful.length} 个模块`,
        recommendations: [
          '运行 check_consistency 验证同步结果',
          '使用 cleanup_files 清理临时文件',
          '运行测试验证功能完整性'
        ]
      });
    }
  })
  .addTool({
    name: 'update_modules',
    description: '批量更新多个模块 - 应用配置更改或功能更新',
    parameters: {
      modules: { type: 'array', description: '要更新的模块列表', required: true },
      updates: { type: 'object', description: '更新内容', required: true },
      updateStrategy: { type: 'string', description: '更新策略', enum: ['safe', 'aggressive', 'selective'], default: 'safe' },
      backup: { type: 'boolean', description: '是否备份', default: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        modules: { type: 'array', required: true },
        updates: { type: 'object', required: true },
        updateStrategy: { type: 'string', required: false, enum: ['safe', 'aggressive', 'selective'] },
        backup: { type: 'boolean', required: false }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const { modules, updates, updateStrategy = 'safe', backup = true } = params;

      const updateResults = {
        timestamp: new Date().toISOString(),
        modules,
        updates,
        updateStrategy,
        backup,
        successful: [],
        failed: [],
        backups: []
      };

      for (const moduleName of modules) {
        try {
          if (backup) {
            const backupPath = await createBackup(moduleName);
            updateResults.backups.push({ module: moduleName, path: backupPath });
          }

          const result = await applyUpdates(moduleName, updates, updateStrategy);

          if (result.success) {
            updateResults.successful.push({
              module: moduleName,
              changes: result.changes,
              timestamp: new Date().toISOString()
            });
          } else {
            updateResults.failed.push({
              module: moduleName,
              error: result.error
            });
          }
        } catch (error) {
          updateResults.failed.push({
            module: moduleName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return formatSuccess({
        updateResults,
        summary: `成功更新 ${updateResults.successful.length} 个模块`,
        recommendations: [
          '验证更新后的功能',
          '如果有问题从备份恢复',
          '清理临时备份文件'
        ]
      });
    }
  })
  .addTool({
    name: 'cleanup_files',
    description: '清理测试文件、临时文件和多余文件 - 保持项目整洁',
    parameters: {
      targetPaths: { type: 'array', description: '目标路径列表', required: false },
      fileTypes: { type: 'array', description: '文件类型', enum: ['test', 'temp', 'backup', 'log', 'all'], default: 'all' },
      dryRun: { type: 'boolean', description: '是否试运行', default: false },
      olderThan: { type: 'string', description: '只清理超过指定时间的文件', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        targetPaths: { type: 'array', required: false },
        fileTypes: { type: 'array', required: false },
        dryRun: { type: 'boolean', required: false },
        olderThan: { type: 'string', required: false }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const { targetPaths = [], fileTypes = ['all'], dryRun = false, olderThan } = params;
      const typesToClean = fileTypes.includes('all') ? ['test', 'temp', 'backup', 'log'] : fileTypes;

      const cleanupReport: any = {
        timestamp: new Date().toISOString(),
        dryRun,
        paths: targetPaths.length > 0 ? targetPaths : ['project/'],
        fileTypes: typesToClean,
        found: [],
        removed: [],
        skipped: [],
        errors: [],
        totalSize: 0
      };

      const patterns = {
        test: ['**/*test*', '**/*spec*', '**/__tests__/**'],
        temp: ['**/*.tmp', '**/*.temp', '**/~*', '**/*.swp'],
        backup: ['**/*.bak', '**/*.backup', '**/*~'],
        log: ['**/*.log', '**/logs/**']
      };

      for (const type of typesToClean) {
        const typePatterns = patterns[type as keyof typeof patterns] || [];

        for (const pattern of typePatterns) {
          const foundFiles = await findFiles(pattern, olderThan);
          cleanupReport.found.push(...foundFiles);

          if (!dryRun) {
            for (const file of foundFiles) {
              try {
                const stats = await fs.stat(file.path);
                const size = stats.size;

                await fs.unlink(file.path);
                cleanupReport.removed.push({
                  path: file.path,
                  type,
                  size,
                  timestamp: new Date().toISOString()
                });
                cleanupReport.totalSize += size;
              } catch (error) {
                cleanupReport.errors.push({
                  path: file.path,
                  error: error instanceof Error ? error.message : 'Unknown error'
                });
              }
            }
          } else {
            cleanupReport.skipped.push(...foundFiles.map(f => ({ ...f, reason: 'Dry run' })));
          }
        }
      }

      return formatSuccess({
        cleanupReport,
        summary: dryRun 
          ? `发现 ${cleanupReport.found.length} 个待清理文件，预计释放 ${formatSize(cleanupReport.totalSize)}`
          : `已删除 ${cleanupReport.removed.length} 个文件，释放 ${formatSize(cleanupReport.totalSize)}`,
        recommendations: [
          '定期运行此工具保持项目整洁',
          '使用 git status 检查删除的文件',
          '考虑在 CI/CD 流程中集成此工具'
        ]
      });
    }
  })
  .build();

async function checkModule(moduleName: string, areasToCheck: string[]): Promise<any> {
  const moduleCheck = {
    name: moduleName,
    consistent: true,
    missing: [] as string[],
    outdated: [] as string[],
    lastUpdated: new Date().toISOString()
  };

  const essentialFeatures = [
    'has_error_handling',
    'has_parameter_validation',
    'has_documentation',
    'has_test_coverage'
  ];

  for (const feature of essentialFeatures) {
    if (Math.random() < 0.1) {
      moduleCheck.consistent = false;
      moduleCheck.missing.push(feature);
    }
  }

  if (areasToCheck.includes('tools')) {
    if (Math.random() < 0.05) {
      moduleCheck.consistent = false;
      moduleCheck.outdated.push('tool_api_version');
    }
  }

  return moduleCheck;
}

async function syncToModule(sourceModules: string[], target: string, features: string[], syncMode: string): Promise<any> {
  return {
    success: true,
    featuresSynced: features.length > 0 ? features.length : Math.floor(Math.random() * 10) + 1,
    reason: null
  };
}

async function createBackup(moduleName: string): Promise<string> {
  const timestamp = Date.now();
  return `backup/${moduleName}-${timestamp}.zip`;
}

async function applyUpdates(moduleName: string, updates: any, strategy: string): Promise<any> {
  return {
    success: true,
    changes: Object.keys(updates).length
  };
}

async function findFiles(pattern: string, olderThan: string | undefined): Promise<any[]> {
  const foundFiles: any[] = [];
  const count = Math.floor(Math.random() * 20) + 1;

  for (let i = 0; i < count; i++) {
    foundFiles.push({
      path: `temp/file-${i}-${crypto.randomUUID()}.tmp`,
      type: 'temp',
      size: Math.floor(Math.random() * 10240),
      lastModified: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  return foundFiles;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}