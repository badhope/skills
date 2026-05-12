import { Command } from 'commander';
import chalk from 'chalk';
import { memoryManager } from '../memory/manager.js';
import { memoryGraph } from '../memory/memoryGraph.js';
import { knowledgeGraph } from '../memory/knowledgeGraph.js';
import { ragModule } from '../memory/rag.js';
import { MemoryReflector } from '../memory/reflector.js';
import { printHeader, printSection, printSuccess, printError, printInfo, createSpinner } from '../ui/logo.js';
import { configManager } from '../config/manager.js';

const reflector = new MemoryReflector(memoryManager);

const memoryCommand = new Command('memory')
  .alias('mem')
  .description('记忆管理（记住对话历史，智能召回）');

// 查看最近记忆
memoryCommand
  .command('recent')
  .alias('r')
  .description('查看最近的对话记忆')
  .option('-l, --limit <n>', '显示数量', '10')
  .action(async (options: { limit: string }) => {
    const limit = parseInt(options.limit, 10) || 10;
    const spinner = createSpinner('加载记忆...');
    const recent = await memoryManager.getRecent(limit);
    if (spinner) spinner.stop();

    if (recent.length === 0) {
      printInfo('暂无对话记忆');
      printInfo('使用 devflow chat ask 开始对话后，记忆会自动保存');
      return;
    }

    printHeader();
    printSection(`最近 ${recent.length} 条记忆`);

    recent.forEach((r, i) => {
      const input = r.input || '';
      const output = r.output || '';
      console.log(chalk.gray(`  ${i + 1}. ${r.time}  [${r.skill}]`));
      console.log(chalk.cyan(`   问: ${input.slice(0, 60)}${input.length > 60 ? '...' : ''}`));
      console.log(chalk.green(`   答: ${output.slice(0, 80)}${output.length > 80 ? '...' : ''}`));
      console.log();
    });
  });

// 搜索记忆
memoryCommand
  .command('search')
  .alias('find')
  .alias('s')
  .description('按关键词搜索记忆')
  .argument('<keyword>', '搜索关键词')
  .option('-l, --limit <n>', '显示数量', '10')
  .action(async (keyword: string, options: { limit: string }) => {
    const limit = parseInt(options.limit, 10) || 10;
    const spinner = createSpinner('搜索记忆...');
    const results = await memoryManager.recall(keyword, limit);
    if (spinner) spinner.stop();

    if (results.length === 0) {
      printError(`未找到包含 "${keyword}" 的记忆`);
      return;
    }

    printHeader();
    printSection(`搜索 "${keyword}" (${results.length} 条结果)`);

    results.forEach((r, i) => {
      const time = new Date(r.interaction.timestamp).toLocaleString('zh-CN');
      console.log(chalk.gray(`  ${i + 1}. ${time}  相关度: ${chalk.yellow(r.relevance.toFixed(2))}  [${r.interaction.skillUsed}]`));
      console.log(chalk.cyan(`   问: ${(r.interaction.input || '').slice(0, 60)}`));
      console.log(chalk.green(`   答: ${(r.interaction.output || '').slice(0, 80)}`));
      console.log();
    });
  });

// 记忆统计
memoryCommand
  .command('stats')
  .description('查看记忆统计')
  .action(async () => {
    const spinner = createSpinner('统计中...');
    const stats = await memoryManager.getStats();
    if (spinner) spinner.stop();

    printHeader();
    printSection('记忆统计');

    console.log(`  总交互数: ${chalk.bold(String(stats.totalInteractions))}`);
    console.log(`  任务数: ${chalk.bold(String(stats.uniqueTasks))}`);
    console.log(`  今日交互: ${chalk.bold(String(stats.interactionsToday || 0))}`);
    console.log(`  昨日交互: ${chalk.bold(String(stats.interactionsYesterday || 0))}`);
    console.log(`  索引词数: ${chalk.bold(String(stats.indexSize || 0))}`);

    if (stats.skillUsage && Object.keys(stats.skillUsage).length > 0) {
      console.log(chalk.gray('\n  技能使用频率:'));
      const sorted = Object.entries(stats.skillUsage).sort((a, b) => (b[1] as number) - (a[1] as number));
      sorted.forEach(([skill, count]) => {
        console.log(`    ${chalk.cyan(skill.padEnd(30))} ${count} 次`);
      });
    }

    if (stats.skillsUsed && Array.isArray(stats.skillsUsed) && stats.skillsUsed.length > 0) {
      console.log(chalk.gray('\n  使用过的技能:'));
      (stats.skillsUsed as string[]).forEach((s: string) => console.log(`    ${chalk.cyan(s)}`));
    }

    console.log();
  });

// 清空记忆
memoryCommand
  .command('clear')
  .description('清空所有记忆')
  .option('-f, --force', '强制清空，不询问确认', false)
  .action(async (options: { force: boolean }) => {
    if (!options.force && process.stdin.isTTY) {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: '确定要清空所有记忆吗？此操作不可恢复',
        default: false,
      }]);
      if (!confirm) return;
    }

    await memoryManager.clear();
    printSuccess('所有记忆已清空');
  });

// ==================== 记忆图谱 ====================

memoryCommand
  .command('graph')
  .alias('g')
  .description('记忆图谱管理')
  .addCommand(
    new Command('search')
      .description('搜索记忆图谱节点')
      .argument('<query>', '搜索关键词')
      .action(async (query: string) => {
        const results = await memoryGraph.search(query, 10);
        if (results.length === 0) { printInfo('未找到匹配节点'); return; }
        printSection(`图谱搜索 "${query}" (${results.length} 个节点)`);
        results.forEach(n => {
          const typeLabel: Record<string, string> = { fact: '📋事实', experience: '📖经历', preference: '⭐偏好', relation: '🔗关系' };
          console.log(`  ${typeLabel[n.node.type] || n.node.type} ${chalk.cyan(n.node.content.slice(0, 60))}  重要性: ${chalk.yellow(n.node.importance.toFixed(2))}`);
        });
        console.log();
      })
  )
  .addCommand(
    new Command('related')
      .description('查看节点的关联节点')
      .argument('<id>', '节点ID（前几位即可）')
      .option('-d, --depth <n>', '遍历深度', '2')
      .action(async (id: string, options: { depth: string }) => {
        const depth = parseInt(options.depth, 10) || 2;
        const allNodes = await memoryGraph.getAllNodes();
        const node = allNodes.find(n => n.id.startsWith(id));
        if (!node) { printError(`未找到节点: ${id}`); return; }
        const related = await memoryGraph.getRelated(node.id, depth);
        printSection(`与 "${node.content.slice(0, 40)}" 相关的节点 (${related.length} 个, 深度 ${depth})`);
        related.forEach(r => {
          console.log(`  ${chalk.gray('→')} ${chalk.cyan(r.content.slice(0, 50))}  [${r.type}]`);
        });
        console.log();
      })
  )
  .addCommand(
    new Command('stats')
      .description('记忆图谱统计')
      .action(async () => {
        const stats = await memoryGraph.getStats();
        printSection('记忆图谱统计');
        console.log(`  节点总数: ${chalk.bold(String(stats.totalNodes))}`);
        console.log(`  边总数: ${chalk.bold(String(stats.totalEdges))}`);
        if (stats.nodesByType) {
          console.log(chalk.gray('\n  节点类型分布:'));
          Object.entries(stats.nodesByType).forEach(([type, count]) => {
            console.log(`    ${type.padEnd(15)} ${count}`);
          });
        }
        console.log();
      })
  );

// ==================== 知识图谱 ====================

memoryCommand
  .command('knowledge')
  .alias('k')
  .description('知识图谱管理')
  .addCommand(
    new Command('extract')
      .description('从记忆中自动提取知识')
      .action(async () => {
        const spinner = createSpinner('从记忆中提取知识...');
        const records = await memoryManager.loadAllRecords();
        const result = await knowledgeGraph.extractFromMemory(records);
        if (spinner) spinner.stop();
        printSuccess(`提取完成: ${result.entitiesAdded} 个实体, ${result.relationshipsAdded} 个关系`);
      })
  )
  .addCommand(
    new Command('query')
      .description('查询知识图谱')
      .option('-t, --type <type>', '实体类型 (person/tech/project/concept/skill)')
      .action(async (options: { type?: string }) => {
        const entities = await knowledgeGraph.query(options.type as any);
        if (entities.length === 0) { printInfo('知识图谱为空，先运行 memory knowledge extract'); return; }
        printSection(`知识图谱 (${entities.length} 个实体)`);
        entities.forEach(e => {
          console.log(`  [${chalk.yellow(e.type)}] ${chalk.cyan(e.label)}`);
          if (e.attributes && Object.keys(e.attributes).length > 0) {
            Object.entries(e.attributes).forEach(([k, v]) => {
              console.log(`    ${chalk.gray(k)}: ${v}`);
            });
          }
        });
        console.log();
      })
  )
  .addCommand(
    new Command('path')
      .description('查找两个实体间的关系路径')
      .argument('<from>', '起始实体ID或标签')
      .argument('<to>', '目标实体ID或标签')
      .action(async (from: string, to: string) => {
        const allEntities = await knowledgeGraph.query();
        const fromEntity = allEntities.find(e => e.id.startsWith(from) || e.label.includes(from));
        const toEntity = allEntities.find(e => e.id.startsWith(to) || e.label.includes(to));
        if (!fromEntity) { printError(`未找到: ${from}`); return; }
        if (!toEntity) { printError(`未找到: ${to}`); return; }
        const paths = await knowledgeGraph.findPaths(fromEntity.id, toEntity.id, 3);
        if (paths.length === 0) { printInfo('未找到关联路径'); return; }
        printSection(`路径搜索: ${fromEntity.label} → ${toEntity.label} (${paths.length} 条路径)`);
        paths.forEach((p, i) => {
          console.log(`  路径 ${i + 1}: ${p.map(n => chalk.cyan(n.label)).join(' → ')}`);
        });
        console.log();
      })
  )
  .addCommand(
    new Command('stats')
      .description('知识图谱统计')
      .action(async () => {
        const stats = await knowledgeGraph.getStats();
        printSection('知识图谱统计');
        console.log(`  实体总数: ${chalk.bold(String(stats.entityCount))}`);
        console.log(`  关系总数: ${chalk.bold(String(stats.relationshipCount))}`);
        if (stats.entityByType) {
          console.log(chalk.gray('\n  实体类型分布:'));
          Object.entries(stats.entityByType).forEach(([type, count]) => {
            console.log(`    ${type.padEnd(15)} ${count}`);
          });
        }
        console.log();
      })
  );

// ==================== RAG 向量检索 ====================

memoryCommand
  .command('rag')
  .description('RAG 向量检索管理')
  .addCommand(
    new Command('init')
      .description('初始化 RAG（需要 API Key）')
    .option('-p, --provider <provider>', 'AI 平台', 'aliyun')
    .action(async (options: { provider: string }) => {
      await configManager.init();
      const providerConfig = configManager.getProviderConfig(options.provider as any);
      if (!providerConfig.apiKey) {
        printError(`请先配置 ${options.provider} 的 API Key`);
        return;
      }
      const spinner = createSpinner('初始化 RAG...');
      await ragModule.init(providerConfig.apiKey);
      if (spinner) spinner.stop();
      printSuccess('RAG 初始化完成');
    })
  )
  .addCommand(
    new Command('index')
      .description('将所有记忆索引到向量数据库')
    .action(async () => {
      await configManager.init();
      const providerConfig = configManager.getProviderConfig('aliyun' as any);
      if (!providerConfig.apiKey) { printError('请先配置 aliyun API Key'); return; }
      await ragModule.init(providerConfig.apiKey);

      const spinner = createSpinner('索引记忆到向量数据库...');
      const records = await memoryManager.loadAllRecords();
      let indexed = 0;
      for (const r of records) {
        const text = `用户: ${r.input || ''}\nAI: ${r.output || ''}`;
        const vector = await ragModule.embed(text);
        if (vector) {
          await ragModule.addDocument(r.id, text);
          indexed++;
        }
      }
      await ragModule.save();
      if (spinner) spinner.stop();
      printSuccess(`索引完成: ${indexed}/${records.length} 条记忆`);
    })
  )
  .addCommand(
    new Command('search')
      .description('语义搜索记忆')
    .argument('<query>', '搜索内容')
    .option('-k, --top <n>', '返回数量', '5')
    .action(async (query: string, options: { top: string }) => {
      const topK = parseInt(options.top, 10) || 5;
      // 自动初始化 RAG
      await configManager.init();
      const providerConfig = configManager.getProviderConfig('aliyun' as any);
      if (providerConfig.apiKey) {
        await ragModule.init(providerConfig.apiKey);
      }
      const results = await ragModule.search(query, topK);
      if (results.length === 0) { printInfo('未找到结果，请先运行 memory rag index'); return; }
      printSection(`语义搜索 "${query}"`);
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${chalk.gray(`相似度: ${r.score.toFixed(4)}`)}`);
        console.log(`     ${r.text.slice(0, 100)}`);
        console.log();
      });
    })
  )
  .addCommand(
    new Command('stats')
      .description('RAG 统计')
    .action(async () => {
      const stats = await ragModule.getStats();
      printSection('RAG 统计');
      console.log(`  文档总数: ${chalk.bold(String(stats.totalDocuments))}`);
      console.log(`  有效向量: ${chalk.bold(String(stats.validVectors))}`);
      console.log(`  空向量: ${chalk.bold(String(stats.nullVectors))}`);
      console.log(`  向量维度: ${chalk.bold(String(stats.dimensions))}`);
      console.log();
    })
  );

// ==================== 记忆反思 ====================

memoryCommand
  .command('reflect')
  .alias('think')
  .description('反思记忆，提炼高层次认知')
  .action(async () => {
    const spinner = createSpinner('正在反思记忆...');
    const report = await reflector.reflect();
    if (spinner) spinner.stop();

    printHeader();
    printSection(`记忆反思报告 (${new Date(report.createdAt).toLocaleString('zh-CN')})`);
    printInfo(`分析了 ${report.totalMemories} 条记忆，生成 ${report.insightsGenerated} 条洞察`);

    const insights = reflector.getInsights();
    if (insights.length === 0) {
      printInfo('暂无洞察（需要至少 3 条记忆）');
      return;
    }

    const typeLabels: Record<string, string> = {
      fact: '📋 事实', preference: '⭐ 偏好', pattern: '📊 模式', summary: '📝 摘要',
    };

    console.log();
    insights.slice(0, 15).forEach((insight, i) => {
      const label = typeLabels[insight.type] || insight.type;
      console.log(`  ${i + 1}. ${label} ${chalk.cyan(insight.content)}`);
      console.log(`     ${chalk.gray(`置信度: ${(insight.confidence * 100).toFixed(0)}% | 引用 ${insight.sourceIds.length} 条记忆`)}`);
      console.log();
    });
  });

export { memoryCommand };
