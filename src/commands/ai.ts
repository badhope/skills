import { Command } from 'commander';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType, type ModelInfo } from '../types.js';
import { BaseProvider } from '../base.js';

const aiCommand = new Command('ai')
  .description('AI模型管理');

aiCommand
  .command('list')
  .description('列出所有支持的AI平台和模型')
  .action(() => {
    console.log('\n📋 支持的AI平台和模型\n');
    console.log('─'.repeat(60));
    
    PROVIDER_TYPE_LIST.forEach(type => {
      const info = PROVIDER_INFO[type];
      const isConfigured = processDELETE[`${type.toUpperCase()}_API_KEY`] !== undefined;
      
      console.log(`\n${isConfigured ? '✓' : '○'} ${isConfigured ? '已配置' : '未配置'} ${info.displayName}`);
      console.log(`   ${info.description}`);
      console.log(`   默认模型: ${info.models[0]?.name || '无'}`);
      console.log(`   API端点: ${info.baseUrl}`);
      
      if (info.freeTier) {
        console.log(`   �_freeTier: ✓ 免费额度`);
      }
      
      if (info.requiresApiKey && !isConfigured) {
        console.log(`   ⚠️  需要配置API Key`);
      }
    });
    
    console.log('\n' + '─'.repeat(60) + '\n');
  });

const modelCommand = new Command('model')
  .description('模型管理');

modelCommand.command('list')
  .description('列出所有可用模型（按价格排序）')
  .action(() => {
    interface ModelDisplay {
      provider: ProviderType;
      providerName: string;
      id: string;
      name: string;
      inputPrice: number;
      outputPrice: number;
      currency: string;
      capabilities: string[];
    }

    const allModels: ModelDisplay[] = [];
    
    PROVIDER_TYPE_LIST.forEach(type => {
      const info = PROVIDER_INFO[type];
      info.models.forEach(model => {
        const capabilities: string[] = [];
        if (model.capabilities.chat) capabilities.push('聊天');
        if (model.capabilities.stream) capabilities.push('流式');
        if (model.capabilities.tools) capabilities.push('工具');
        if (model.capabilities.thinking) capabilities.push('思考');
        if (model.capabilities.vision) capabilities.push('视觉');
        
        allModels.push({
          provider: type,
          providerName: info.displayName,
          id: model.id,
          name: model.name,
          inputPrice: model.pricing.inputPerMillion,
          outputPrice: model.pricing.outputPerMillion,
          currency: model.pricing.currency,
          capabilities
        });
      });
    });

    allModels.sort((a, b) => a.inputPrice - b.inputPrice);

    console.log('\n📊 所有可用模型（按输入价格排序）\n');
    console.log('─'.repeat(80));
    console.log('平台'.padEnd(15) + '模型'.padEnd(25) + '输入$/M'.padEnd(12) + '输出$/M'.padEnd(12) + '能力');
    console.log('─'.repeat(80));
    
    allModels.forEach(model => {
      const inputStr = `$${model.inputPrice.toFixed(4)}`;
      const outputStr = `$${model.outputPrice.toFixed(4)}`;
      console.log(
        model.providerName.padEnd(15) +
        model.name.padEnd(25) +
        inputStr.padEnd(12) +
        outputStr.padEnd(12) +
        model.capabilities.join(', ')
      );
    });
    
    console.log('─'.repeat(80));
    console.log(`\n共 ${allModels.length} 个模型\n`);
  });

modelCommand.command('suggest')
  .description('根据任务推荐最佳模型')
  .argument('<task>', '任务描述')
  .action((task: string) => {
    interface TaskKeywords {
      keywords: string[];
      weight: number;
      preferredCapabilities: string[];
    }

    const taskProfiles: TaskKeywords[] = [
      {
        keywords: ['代码', '编程', '程序', '函数', '算法', 'debug', 'code', 'react', 'python', 'javascript'],
        weight: 15,
        preferredCapabilities: ['chat', 'tools', 'thinking']
      },
      {
        keywords: ['分析', '审查', 'review', 'audit', '检查', '优化'],
        weight: 12,
        preferredCapabilities: ['chat', 'thinking']
      },
      {
        keywords: ['写作', '文章', '文档', 'write', 'essay', '报告'],
        weight: 10,
        preferredCapabilities: ['chat']
      },
      {
        keywords: ['翻译', 'translate'],
        weight: 8,
        preferredCapabilities: ['chat']
      },
      {
        keywords: ['对话', '聊天', 'chat', '问题', '解释'],
        weight: 6,
        preferredCapabilities: ['chat']
      }
    ];

    const taskLower = task.toLowerCase();
    let bestMatch: { profile: TaskKeywords; score: number } | null = null;
    
    taskProfiles.forEach(profile => {
      let score = 0;
      profile.keywords.forEach(keyword => {
        if (taskLower.includes(keyword)) {
          score += profile.weight;
        }
      });
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { profile, score };
      }
    });

    interface ModelScore {
      provider: ProviderType;
      providerName: string;
      model: typeof PROVIDER_INFO[ProviderType]['models'][0];
      score: number;
      costScore: number;
    }

    const candidates: ModelScore[] = [];
    
    PROVIDER_TYPE_LIST.forEach(type => {
      const info = PROVIDER_INFO[type];
      const isConfigured = processDELETE[`${type.toUpperCase()}_API_KEY`] !== undefined;
      
      if (!isConfigured && info.requiresApiKey) {
        return;
      }
      
      info.models.forEach(model => {
        let score = 50;
        
        if (bestMatch) {
          const profile = bestMatch.profile;
          score += bestMatch.score;
          
          profile.preferredCapabilities.forEach(cap => {
            if (model.capabilities[cap as keyof typeof model.capabilities] as boolean) {
              score += 5;
            }
          });
        }
        
        const avgPrice = (model.pricing.inputPerMillion + model.pricing.outputPerMillion) / 2;
        const costScore = Math.max(0, 20 - avgPrice * 10);
        score += costScore;
        
        candidates.push({
          provider: type,
          providerName: info.displayName,
          model,
          score,
          costScore
        });
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 3);

    console.log(`\n🤔 分析任务: ${task}\n`);
    console.log('─'.repeat(60));
    console.log('\n🎯 推荐模型:\n');
    
    top.forEach((item, index) => {
      console.log(`${index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'} ${item.providerName} / ${item.model.name}`);
      console.log(`   📊 评分: ${item.score.toFixed(1)}`);
      console.log(`   💰 输入: $${item.model.pricing.inputPerMillion}/M | 输出: $${item.model.pricing.outputPerMillion}/M`);
      console.log(`   📏 上下文: ${(item.model.contextWindow / 1000).toFixed(0)}K tokens`);
      console.log(`   🔧 能力: ${Object.entries(item.model.capabilities).filter(([k, v]) => v).map(([k]) => k).join(', ')}`);
      console.log();
    });
    
    if (top.length > 0) {
      console.log(`✅ 最佳选择: ${top[0].providerName} / ${top[0].model.name}\n`);
    }
  });

modelCommand.command('info')
  .description('查看模型详细信息')
  .argument('<model>', '模型名称或ID')
  .action((modelQuery: string) => {
    let foundProviderName = '';
    let foundModel: ModelInfo | null = null;
    
    for (const type of PROVIDER_TYPE_LIST) {
      const info = PROVIDER_INFO[type];
      const model = info.models.find(m => 
        m.name.toLowerCase().includes(modelQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(modelQuery.toLowerCase())
      );
      
      if (model) {
        foundProviderName = info.displayName;
        foundModel = model;
        break;
      }
    }

    if (!foundModel) {
      console.log(`\n❌ 未找到模型: ${modelQuery}\n`);
      return;
    }

    const model = foundModel;

    console.log(`\n📋 模型信息: ${model.name}\n`);
    console.log('─'.repeat(60));
    console.log(`名称: ${model.name}`);
    console.log(`ID: ${model.id}`);
    console.log(`平台: ${foundProviderName}`);
    console.log('\n💰 定价:');
    console.log(`  输入: $${model.pricing.inputPerMillion} ${model.pricing.currency}/百万Token`);
    console.log(`  输出: $${model.pricing.outputPerMillion} ${model.pricing.currency}/百万Token`);
    console.log('\n📊 参数:');
    console.log(`  上下文窗口: ${model.contextWindow.toLocaleString()} tokens`);
    console.log(`  最大输出: ${model.maxOutput.toLocaleString()} tokens`);
    console.log('\n✨ 能力:');
    console.log(`  聊天: ${model.capabilities.chat ? '✓' : '✗'} | 流式: ${model.capabilities.stream ? '✓' : '✗'} | 嵌入: ${model.capabilities.embed ? '✓' : '✗'}`);
    console.log(`  工具: ${model.capabilities.tools ? '✓' : '✗'} | 思考: ${model.capabilities.thinking ? '✓' : '✗'} | 视觉: ${model.capabilities.vision ? '✓' : '✗'}`);
    console.log('─'.repeat(60) + '\n');
  });

aiCommand
  .command('status')
  .description('查看AI配置状态')
  .action(() => {
    console.log('\n🔍 AI配置状态\n');
    console.log('─'.repeat(60));
    
    PROVIDER_TYPE_LIST.forEach(type => {
      const info = PROVIDER_INFO[type];
      const envKey = `${type.toUpperCase()}_API_KEY`;
      const apiKey = processDELETE[envKey];
      const isConfigured = !!apiKey;
      
      const statusIcon = isConfigured ? '✓' : '○';
      const statusText = isConfigured ? '已配置' : '未配置';
      
      console.log(`\n${statusIcon} ${info.displayName} [${statusText}]`);
      console.log(`   环境变量: ${envKey}`);
      
      if (isConfigured) {
        console.log(`   API Key: ${apiKey?.substring(0, 8)}...${apiKey?.substring(apiKey.length - 4)}`);
      }
      
      console.log(`   模型数量: ${info.models.length}`);
      console.log(`   默认模型: ${info.models[0]?.name || '无'}`);
      
      if (info.freeTier) {
        console.log(`   �_freeTier: ✓ 支持免费额度`);
      }
    });
    
    console.log('\n' + '─'.repeat(60));
    
    const configuredCount = PROVIDER_TYPE_LIST.filter(type => 
      processDELETE[`${type.toUpperCase()}_API_KEY`]
    ).length;
    
    console.log(`\n📊 统计: ${configuredCount}/${PROVIDER_TYPE_LIST.length} 个平台已配置\n`);
  });

aiCommand.addCommand(modelCommand);

export { aiCommand };
