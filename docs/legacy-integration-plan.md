# DevFlow-Agent 旧代码整合方案

**日期**: 2024年  
**状态**: 准备执行  
**目标**: 清理旧代码，迁移有价值模块

---

## ✅ 审查完成：发现了大量有价值代码！

### 📊 有价值模块清单

#### 1. packages/core/shared/utils.ts ✅ 值得迁移

**包含功能**：
- `safeExecRaw()` / `safeExec()` - 安全的命令执行（带超时、错误处理）
- `fileExists()` - 文件存在检查
- `readJsonFile()` / `writeJsonFile()` - JSON 文件读写
- `validateParams()` - 参数验证（schema 驱动）
- `sanitizePath()` / `validatePath()` - 路径安全验证
- `formatError()` / `formatSuccess()` - 统一响应格式

**价值**：⭐⭐⭐⭐⭐
- 这些工具函数在 src/ 中没有完整实现
- 特别是参数验证和路径安全检查
- 可以直接迁移到 `src/utils/`

---

#### 2. packages/core/skill/errorHandler.ts ✅ 值得迁移

**包含功能**：
- `ErrorHandler` 类 - 完整的错误处理系统
- 错误分类（tool_timeout, validation_error, dependency_error 等）
- 自动恢复策略（retry, fallback, rollback, switch_tool）
- 错误日志记录和统计
- 安全的错误消息过滤（移除敏感信息）

**价值**：⭐⭐⭐⭐⭐
- 比 src/ 中的简单错误处理完善得多
- 包含重试、背压、恢复机制
- 可以迁移到 `src/agent/error-handler.ts`

---

#### 3. packages/core/skill/decisionReflector.ts ✅ 值得迁移

**包含功能**：
- `DecisionReflector` 类 - 决策追踪和反思系统
- 记录每个决策的上下文、备选方案、置信度
- 分析决策成功率
- 生成改进报告
- 从经验中学习

**价值**：⭐⭐⭐⭐
- 这是 Agent 自我反思的核心组件
- 可以增强 src/agent/core.ts 的反思能力
- 迁移到 `src/agent/decision-reflector.ts`

---

#### 4. packages/core/skill/humanInTheLoop.ts ✅ 值得迁移

**包含功能**：
- `HumanInTheLoopManager` 类 - 人机交互系统
- 多种确认类型（工具执行、技能调用、关键操作）
- 超时控制和取消机制
- 分支决策支持

**价值**：⭐⭐⭐⭐
- 可以增强用户交互能力
- 可以集成到 src/agent/core.ts 的确认流程
- 迁移到 `src/agent/human-in-the-loop.ts`

---

#### 5. packages/core/skill/concurrencyManager.ts ✅ 值得迁移

**包含功能**：
- `ConcurrencyManager` 类 - 并发控制系统
- 全局、技能、用户级别的并发限制
- 速率限制（rate limiting）
- 自动清理超时任务
- 统计数据

**价值**：⭐⭐⭐
- 可以用于控制工具调用的并发
- 可以防止资源耗尽
- 迁移到 `src/agent/concurrency-manager.ts`

---

### ❌ 可删除的旧模块

#### 1. packages/core/skill/orchestrator.ts ❌ 删除

**原因**：与 `src/agent/core.ts` 功能重复

#### 2. packages/core/skill/agentRunner.ts ❌ 删除

**原因**：与 `src/agent/core.ts` 功能重复

#### 3. packages/core/skill/workflowEngine.ts ❌ 删除

**原因**：独立的工作流引擎，未被使用

#### 4. packages/core/skill/toolExecutor.ts ❌ 删除

**原因**：与 `src/tools/registry.ts` 功能重复

#### 5. packages/core/skill/agentMemory.ts ❌ 删除

**原因**：与 `src/memory/manager.ts` 功能重复

#### 6. packages/core/skill/knowledgeGraph.ts ❌ 删除

**原因**：与 `src/memory/knowledgeGraph.ts` 功能重复

#### 7. packages/core/skill/memoryGraph.ts ❌ 删除

**原因**：与 `src/memory/memoryGraph.ts` 功能重复

#### 8. packages/core/skill/ragModule.ts ❌ 删除

**原因**：与 `src/memory/rag.ts` 功能重复

#### 9. packages/core/skill/permissionManager.ts ❌ 删除

**原因**：与 `src/config/sandbox.ts` 功能重复，但 sandbox 更完善

#### 10. packages/core/skill/skills/ ❌ 删除或归档

**包含**：base-skill, fullstack-engine, bug-hunter 等旧版技能

**原因**：这些是旧版技能系统，与当前的工具系统不兼容

---

### ❌ 完全删除的目录

#### 1. packages/cli/ ❌ 删除

**原因**：独立的 CLI 工具，与 `src/cli.ts` 重复

#### 2. mcp/ ❌ 删除（或归档）

**原因**：90+ 个 MCP 工具定义未被使用
- 如果以后可能用到 MCP 协议：可以保留 `packages/core/mcp/` 框架
- 如果确定不用：删除整个目录

#### 3. example-agents/ ❌ 删除

**原因**：示例配置，未被使用

#### 4. .agent-skills/ ❌ 删除

**原因**：旧版配置文件，未被使用

---

## 🎯 整合执行计划

### Phase 1: 迁移有价值代码

#### Step 1: 创建新目录

```bash
# 创建 utils 目录
mkdir -p src/utils

# 移动共享工具
mv packages/core/shared/utils.ts src/utils/
mv packages/core/shared/index.ts src/utils/

# 创建 agent 子模块
mv packages/core/skill/errorHandler.ts src/agent/error-handler.ts
mv packages/core/skill/decisionReflector.ts src/agent/decision-reflector.ts
mv packages/core/skill/humanInTheLoop.ts src/agent/human-in-the-loop.ts
mv packages/core/skill/concurrencyManager.ts src/agent/concurrency-manager.ts
```

#### Step 2: 更新 import 路径

需要修复迁移后的文件中的 import 引用：

```typescript
// error-handler.ts
import { TaskContext } from '../types.js';  // 需要改为正确的路径
```

#### Step 3: 集成到 src/agent/core.ts

在 `src/agent/core.ts` 中集成新模块：

```typescript
import { ErrorHandler } from './error-handler.js';
import { DecisionReflector } from './decision-reflector.js';
import { HumanInTheLoopManager } from './human-in-the-loop.js';
import { ConcurrencyManager } from './concurrency-manager.js';
```

---

### Phase 2: 删除废弃代码

#### Step 3: 删除 packages/core/skill/ 中的重复文件

```bash
# 删除重复文件
rm packages/core/skill/orchestrator.ts
rm packages/core/skill/agentRunner.ts
rm packages/core/skill/workflowEngine.ts
rm packages/core/skill/toolExecutor.ts
rm packages/core/skill/agentMemory.ts
rm packages/core/skill/knowledgeGraph.ts
rm packages/core/skill/memoryGraph.ts
rm packages/core/skill/ragModule.ts
rm packages/core/skill/permissionManager.ts
rm packages/core/skill/skills/
```

#### Step 4: 删除整个 packages/cli/

```bash
rm -rf packages/cli/
```

#### Step 5: 决定 mcp/ 目录

**选项 A**: 完全删除
```bash
rm -rf mcp/
```

**选项 B**: 只删除工具定义，保留框架
```bash
# 保留 MCP 框架（如果有用）
# mv packages/core/mcp/ somewhere-safe/

# 删除工具定义
rm -rf mcp/
```

#### Step 6: 删除示例和配置

```bash
rm -rf example-agents/
rm -rf .agent-skills/
```

---

### Phase 3: 更新配置文件

#### Step 7: 更新 tsconfig.json

```json
{
  "compilerOptions": {
    // 移除 @mcp/skills 相关路径映射
    "paths": {}
  },
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts"
  ]
}
```

#### Step 8: 清理 package.json

检查并移除 packages/ 相关的内容。

#### Step 9: 更新 .gitignore

确保不追踪旧文件。

---

## 📋 执行清单

### ✅ 迁移（5个模块）

- [ ] src/utils/index.ts
- [ ] src/agent/error-handler.ts
- [ ] src/agent/decision-reflector.ts
- [ ] src/agent/human-in-the-loop.ts
- [ ] src/agent/concurrency-manager.ts

### ✅ 集成到 core.ts

- [ ] 在 src/agent/core.ts 中导入并使用新模块
- [ ] 修复 import 路径
- [ ] 测试编译

### ✅ 删除（废弃模块）

- [ ] packages/core/skill/orchestrator.ts
- [ ] packages/core/skill/agentRunner.ts
- [ ] packages/core/skill/workflowEngine.ts
- [ ] packages/core/skill/toolExecutor.ts
- [ ] packages/core/skill/agentMemory.ts
- [ ] packages/core/skill/knowledgeGraph.ts
- [ ] packages/core/skill/memoryGraph.ts
- [ ] packages/core/skill/ragModule.ts
- [ ] packages/core/skill/permissionManager.ts
- [ ] packages/core/skill/skills/
- [ ] packages/cli/
- [ ] mcp/
- [ ] example-agents/
- [ ] .agent-skills/

### ✅ 更新配置

- [ ] tsconfig.json（移除旧路径）
- [ ] package.json（清理依赖）
- [ ] .gitignore（添加旧目录）

### ✅ 验证

- [ ] 编译项目（npm run build）
- [ ] 测试基本功能（devflow --version）
- [ ] 检查没有遗留的旧文件

---

## 🚀 快速执行脚本

### 迁移脚本（migration.sh）

```bash
#!/bin/bash
set -e

echo "🚀 开始迁移旧代码..."

# 1. 创建目录
echo "📁 创建目录..."
mkdir -p src/utils

# 2. 迁移工具函数
echo "📦 迁移 utils..."
mv packages/core/shared/utils.ts src/utils/
mv packages/core/shared/index.ts src/utils/ 2>/dev/null || true

# 3. 迁移 agent 模块
echo "📦 迁移 agent 模块..."
mv packages/core/skill/errorHandler.ts src/agent/error-handler.ts
mv packages/core/skill/decisionReflector.ts src/agent/decision-reflector.ts
mv packages/core/skill/humanInTheLoop.ts src/agent/human-in-the-loop.ts
mv packages/core/skill/concurrencyManager.ts src/agent/concurrency-manager.ts

# 4. 删除废弃文件
echo "🗑️ 删除废弃文件..."
rm -f packages/core/skill/orchestrator.ts
rm -f packages/core/skill/agentRunner.ts
rm -f packages/core/skill/workflowEngine.ts
rm -f packages/core/skill/toolExecutor.ts
rm -f packages/core/skill/agentMemory.ts
rm -f packages/core/skill/knowledgeGraph.ts
rm -f packages/core/skill/memoryGraph.ts
rm -f packages/core/skill/ragModule.ts
rm -f packages/core/skill/permissionManager.ts
rm -rf packages/core/skill/skills/

# 5. 删除整个目录
echo "🗑️ 删除废弃目录..."
rm -rf packages/cli/
rm -rf mcp/
rm -rf example-agents/
rm -rf .agent-skills/

# 6. 编译测试
echo "🔨 编译测试..."
npm run build

echo "✅ 迁移完成！"
```

---

## ⚠️ 注意事项

1. **备份**：执行前建议备份整个项目
2. **Git**：使用 git rm 而不是直接 rm，以便恢复
3. **测试**：每次迁移后编译测试
4. **MCP**：如果以后可能用 MCP 协议，考虑保留 packages/core/mcp/

---

## 🎯 预期结果

### 整合前
```
DevFlow-Agent/
├── packages/      (40+ 文件，废弃)
├── mcp/           (100+ 文件，废弃)
├── example-agents/ (废弃)
├── .agent-skills/  (废弃)
└── src/           (50+ 文件，活跃)
```

### 整合后
```
DevFlow-Agent/
├── src/
│   ├── utils/              (新增)
│   │   └── index.ts
│   ├── agent/
│   │   ├── core.ts
│   │   ├── error-handler.ts      (迁移)
│   │   ├── decision-reflector.ts (迁移)
│   │   ├── human-in-the-loop.ts  (迁移)
│   │   └── concurrency-manager.ts (迁移)
│   └── ...
└── (旧代码全部清理)
```

### 收益

1. ✅ **代码更干净**：删除 150+ 个废弃文件
2. ✅ **功能增强**：获得错误处理、决策反思、人机交互等高级功能
3. ✅ **维护更简单**：没有重复代码
4. ✅ **编译更快**：不需要处理旧目录

---

## ✅ 下一步

1. **确认**：是否同意此整合方案？
2. **执行**：运行上述迁移脚本
3. **验证**：编译并测试项目
4. **提交**：Git commit 清理结果

---

**准备就绪，等待你的确认后开始执行！**
