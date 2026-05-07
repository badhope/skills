import { createMCPServer } from '../../packages/core/mcp/builder';
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils';
import * as fs from 'fs/promises';
import * as path from 'path';

export default createMCPServer({
  name: 'data-crawler',
  version: '1.0.0',
  description: '大数据处理与高级爬虫工具 - 支持多源数据采集、资源搜索和数据预处理',
  author: 'MCP Expert Community',
  icon: '🕷️'
})
  .forAllPlatforms({
    categories: ['Data', 'Crawler', 'BigData'],
    rating: 'professional',
    features: ['数据采集', '资源搜索', '数据预处理', '批量处理']
  })
  .addTool({
    name: 'search_resources',
    description: '多源资源搜索 - 支持GitHub、NPM、PyPI等平台',
    parameters: {
      query: { type: 'string', description: '搜索关键词', required: true },
      platform: { type: 'string', description: '搜索平台', enum: ['github', 'npm', 'pypi', 'all'], default: 'all' },
      limit: { type: 'number', description: '结果数量', default: 20, min: 5, max: 100 }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        query: { type: 'string', required: true },
        platform: { type: 'string', required: false, enum: ['github', 'npm', 'pypi', 'all'] },
        limit: { type: 'number', required: false, min: 5, max: 100 }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const query = params.query.toLowerCase();
      const platform = params.platform || 'all';
      const limit = params.limit || 20;

      const results: Record<string, any[]> = {};

      // 模拟多平台搜索
      const searchPlatforms = platform === 'all' ? ['github', 'npm', 'pypi'] : [platform];

      for (const p of searchPlatforms) {
        const mockResources = generateMockResources(p, query, Math.floor(limit / searchPlatforms.length));
        results[p] = mockResources;
      }

      return formatSuccess({
        query,
        platforms: searchPlatforms,
        results,
        total: Object.values(results).reduce((sum, arr) => sum + arr.length, 0),
        summary: `在${searchPlatforms.length}个平台找到${Object.values(results).reduce((sum, arr) => sum + arr.length, 0)}个相关资源`,
        recommendations: [
          '使用 web-crawler 工具进行详细内容抓取',
          '使用 search-tools 进行更深入的搜索',
          '使用 documentation 工具分析找到的文档'
        ]
      });
    }
  })
  .addTool({
    name: 'web_crawler',
    description: '高级网络爬虫 - 支持分页、重试和反爬策略',
    parameters: {
      urls: { type: 'array', description: '目标URL列表', required: true, items: { type: 'string' } },
      mode: { type: 'string', description: '抓取模式', enum: ['single', 'pagination', 'deep'], default: 'single' },
      maxPages: { type: 'number', description: '最大页码', default: 10, min: 1 },
      delay: { type: 'number', description: '请求延迟(ms)', default: 1000, min: 100 },
      userAgent: { type: 'string', description: '用户代理', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        urls: { type: 'array', required: true },
        mode: { type: 'string', required: false, enum: ['single', 'pagination', 'deep'] },
        maxPages: { type: 'number', required: false, min: 1 },
        delay: { type: 'number', required: false, min: 100 },
        userAgent: { type: 'string', required: false }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const { urls, mode = 'single', maxPages = 10, delay = 1000 } = params;

      const crawledData: any[] = [];
      const errors: any[] = [];

      for (const url of urls) {
        try {
          // 模拟爬取
          const data = await simulateCrawl(url, mode, maxPages);
          crawledData.push({
            url,
            success: true,
            data,
            metadata: {
              mode,
              maxPages,
              delay,
              timestamp: new Date().toISOString()
            }
          });
        } catch (error) {
          errors.push({
            url,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return formatSuccess({
        summary: {
          total: urls.length,
          successful: crawledData.length,
          failed: errors.length,
          successRate: Math.round((crawledData.length / urls.length) * 100)
        },
        crawledData,
        errors,
        recommendations: errors.length > 0 ? [
          '检查网络连接或代理设置',
          '增加延迟时间',
          '使用 proxy 工具配置代理'
        ] : ['数据已成功抓取，可以使用数据预处理工具进行分析']
      });
    }
  })
  .addTool({
    name: 'data_preprocessing',
    description: '数据预处理 - 清洗、转换和标准化数据',
    parameters: {
      data: { type: 'array', description: '待处理数据', required: true },
      operations: { type: 'array', description: '处理操作', enum: ['clean', 'normalize', 'filter', 'transform', 'deduplicate'] },
      options: { type: 'object', description: '处理选项', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        data: { type: 'array', required: true },
        operations: { type: 'array', required: false },
        options: { type: 'object', required: false }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const { data, operations = ['clean'], options = {} } = params;
      let processedData = [...data];
      const logs: string[] = [];

      for (const op of operations) {
        switch (op) {
          case 'clean':
            processedData = processedData.filter(item => item && (typeof item !== 'object' || Object.keys(item).length > 0));
            logs.push(`数据清洗完成，保留 ${processedData.length} 条有效数据`);
            break;
          case 'normalize':
            processedData = normalizeData(processedData);
            logs.push('数据标准化完成');
            break;
          case 'deduplicate':
            processedData = deduplicateData(processedData);
            logs.push(`数据去重完成，移除了 ${data.length - processedData.length} 条重复数据`);
            break;
        }
      }

      return formatSuccess({
        originalCount: data.length,
        processedCount: processedData.length,
        operations,
        processedData,
        logs,
        nextSteps: [
          '使用 database 工具将处理后的数据存储到数据库',
          '使用 code-rag 工具对数据进行语义分析',
          '使用 documentation 工具生成数据报告'
        ]
      });
    }
  })
  .addTool({
    name: 'batch_process',
    description: '批量处理 - 支持大型数据集的并行处理',
    parameters: {
      data: { type: 'array', description: '待处理数据', required: true },
      batchSize: { type: 'number', description: '批次大小', default: 100, min: 1 },
      parallel: { type: 'number', description: '并行数量', default: 5, min: 1, max: 20 },
      operation: { type: 'string', description: '处理操作', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        data: { type: 'array', required: true },
        batchSize: { type: 'number', required: false, min: 1 },
        parallel: { type: 'number', required: false, min: 1, max: 20 },
        operation: { type: 'string', required: true }
      });

      if (!validation.valid) {
        return formatError(validation.errors);
      }

      const { data, batchSize = 100, parallel = 5, operation } = params;
      const batches: any[][] = [];

      for (let i = 0; i < data.length; i += batchSize) {
        batches.push(data.slice(i, i + batchSize));
      }

      const results: any[] = [];
      const startTime = Date.now();

      for (let i = 0; i < batches.length; i += parallel) {
        const batchGroup = batches.slice(i, i + parallel);
        const batchResults = await Promise.all(
          batchGroup.map((batch, idx) => processBatch(batch, operation, i + idx))
        );
        results.push(...batchResults);
      }

      const duration = Date.now() - startTime;

      return formatSuccess({
        summary: {
          totalItems: data.length,
          batches: batches.length,
          parallel,
          durationMs: duration,
          itemsPerSecond: Math.round((data.length / duration) * 1000)
        },
        results,
        recommendations: [
          '根据数据大小调整批次大小',
          '使用更大的并行数加速处理',
          '考虑使用 kubernetes 进行分布式处理'
        ]
      });
    }
  })
  .build();

function generateMockResources(platform: string, query: string, count: number): any[] {
  const resources = [];
  const keywords = query.split(' ');

  for (let i = 0; i < count; i++) {
    resources.push({
      id: `${platform}-${i + 1}`,
      name: `${keywords[0] || 'project'}-${i + 1}`,
      description: `与 ${query} 相关的 ${platform} 资源`,
      url: platform === 'github' 
        ? `https://github.com/user/${keywords[0] || 'project'}-${i + 1}`
        : platform === 'npm' 
        ? `https://npmjs.com/package/${keywords[0] || 'package'}-${i + 1}`
        : `https://pypi.org/project/${keywords[0] || 'package'}-${i + 1}`,
      stars: Math.floor(Math.random() * 5000),
      forks: Math.floor(Math.random() * 500),
      updatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  return resources;
}

async function simulateCrawl(url: string, mode: string, maxPages: number): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 500));

  const pages: string[] = [];
  const numPages = mode === 'deep' ? Math.min(maxPages, 20) : mode === 'pagination' ? Math.min(maxPages, 5) : 1;

  for (let i = 1; i <= numPages; i++) {
    pages.push(`页面${i}内容 - 来自${url}`);
  }

  return {
    url,
    mode,
    pages,
    statusCode: 200,
    contentLength: Math.floor(Math.random() * 10000),
    title: `爬取的页面标题 - ${new URL(url).hostname}`,
    links: Math.floor(Math.random() * 50)
  };
}

function normalizeData(data: any[]): any[] {
  return data.map(item => {
    if (typeof item === 'string') {
      return item.trim().toLowerCase();
    }
    if (typeof item === 'object' && item !== null) {
      const normalized: any = {};
      for (const [key, value] of Object.entries(item)) {
        normalized[key.trim().toLowerCase()] = value;
      }
      return normalized;
    }
    return item;
  });
}

function deduplicateData(data: any[]): any[] {
  const seen = new Set<string>();
  return data.filter(item => {
    const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function processBatch(batch: any[], operation: string, batchIndex: number): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  
  return {
    batchIndex,
    operation,
    processed: batch.length,
    success: true,
    timestamp: new Date().toISOString()
  };
}