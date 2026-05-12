# DevFlow Agent

**DevFlow Agent** — 可靠、诚实、可控的 AI 开发助手 CLI 工具。

## 三条铁律

1. **可靠性** — 每个 AI 建议必须可验证、可复现
2. **诚实性** — 明确区分 AI 推测和确认事实
3. **可控性** — 用户对所有操作保持完全控制

## 功能特性

- **10 个 AI 平台** — OpenAI、Anthropic、Google、DeepSeek、硅基流动、阿里云百炼、智谱AI、百度千帆、Ollama、LM Studio
- **智能模型查找** — 用户输入模型名，自动从平台 API 搜索匹配（支持 239+ 个阿里云模型）
- **自动切换** — 模型失败时自动尝试下一个（`--fallback`）
- **代码审查** — 规则引擎 + AI 深度审查，覆盖安全/Bug/性能/质量四个维度
- **13 个内置工具** — Shell、文件操作、HTTP、JSON、文本处理、哈希等，无需 AI 也可独立使用
- **管道链式调用** — `tools pipe "shell() | text() | json()"` 组合工具
- **会话历史** — 自动保存、搜索、导出聊天记录
- **交互式菜单** — 上下键选择，清晰美观的界面

## 安装

```bash
npm install -g @devflow/agent
```

要求 Node.js >= 18.0.0

## 快速开始

```bash
# 1. 配置 API Key
devflow config set-key aliyun sk-xxxxx
devflow config set-default aliyun

# 2. 开始聊天
devflow chat ask "你好，介绍一下你自己"

# 3. 指定模型（支持模糊匹配）
devflow chat ask "写一个冒泡排序" -m qwen-max
devflow chat ask "解释闭包" -m deepseek-v3

# 4. 启用自动切换（额度用完自动换模型）
devflow chat ask "你好" -m qwen-plus --fallback

# 5. 搜索平台可用模型
devflow chat search qwen
devflow chat remote-models --filter deepseek
```

## 命令参考

### `devflow chat` — AI 对话

```bash
devflow chat start              # 交互式多轮对话
devflow chat ask <问题>         # 单轮快速提问
devflow chat ask <问题> -m <模型> -p <平台>  # 指定模型和平台
devflow chat ask <问题> --fallback          # 自动切换模型
devflow chat ask <问题> --fallback-order "qwen-plus,qwen-max"  # 自定义切换顺序
devflow chat ask <问题> -s                   # 流式输出
devflow chat models -p aliyun --sort price   # 列出平台模型
devflow chat search <关键词> -p <平台>       # 搜索平台模型
devflow chat remote-models -p <平台>        # 列出所有远程模型
```

### `devflow ai` — AI 平台管理

```bash
devflow ai interactive          # 交互式菜单
devflow ai list                # 列出所有支持的平台
devflow ai status              # 查看配置状态
devflow ai model list          # 列出所有模型（按价格排序）
```

### `devflow config` — 配置管理

```bash
devflow config init             # 交互式配置向导
devflow config list             # 查看所有配置
devflow config set-key <平台> <API Key>  # 设置 API Key
devflow config remove-key <平台> --force   # 删除 API Key
devflow config set-default <平台>         # 设置默认平台
devflow config set-chat          # 设置聊天参数
devflow config test <平台>       # 测试平台连接
```

### `devflow review` — 代码审查

```bash
devflow review file <文件路径>                    # 审查单个文件
devflow review file <文件路径> --no-ai            # 仅规则检测（不用 AI）
devflow review file <文件路径> -c security,bugs   # 指定审查类别
devflow review dir <目录路径>                      # 审查整个目录
devflow review dir <目录路径> -i node_modules,dist # 忽略目录
```

审查规则：SEC001-004（安全）、BUG001-005（Bug）、PERF001-002（性能）、QUAL001-003（质量）

### `devflow tools` — 工具调用

```bash
devflow tools list                # 列出所有工具
devflow tools shell "git status" -s  # 执行 Shell（-s 静默）
devflow tools run <工具> <参数>     # 执行工具
devflow tools run read_file p=src/index.ts  # 支持短参数名
devflow tools pipe "shell(cmd=dir) | text(action=sort)"  # 管道链式调用
devflow tools schema             # 导出工具定义（JSON）
```

内置工具：`shell`、`read_file`、`write_file`、`search_files`、`list_dir`、`file_tree`、`file_info`、`sysinfo`、`http`、`json`、`text`、`hash`、`delete_file`

### `devflow files` — 文件操作

```bash
devflow files read <文件路径>              # 读取文件
devflow files write <文件路径> <内容>      # 写入文件
devflow files list <目录路径>              # 列出目录
devflow files tree <目录路径>              # 目录树
devflow files search <关键词> <目录路径>   # 搜索文件
devflow files info <文件路径>              # 文件信息
```

### `devflow history` — 历史记录

```bash
devflow history list              # 列出所有会话
devflow history view <会话ID>      # 查看会话详情
devflow history delete <会话ID> -f # 删除会话
devflow history clear --force      # 清空所有历史
devflow history export <会话ID>    # 导出会话
```

## 支持的 AI 平台

| 平台 | 类型 | API 格式 | 模型搜索 |
|------|------|---------|---------|
| OpenAI | 云端 | OpenAI | ✅ |
| Anthropic | 云端 | Anthropic | ✅ |
| Google Gemini | 云端 | Google | ✅ |
| DeepSeek | 云端 | OpenAI 兼容 | ✅ |
| 硅基流动 | 云端 | OpenAI 兼容 | ✅ |
| 阿里云百炼 | 云端 | OpenAI 兼容 | ✅ (239个模型) |
| 智谱AI | 云端 | OpenAI 兼容 | ✅ |
| 百度千帆 | 云端 | 自定义 | 内置列表 |
| Ollama | 本地 | Ollama | ✅ |
| LM Studio | 本地 | OpenAI 兼容 | ✅ |

## 项目结构

```
src/
├── cli.ts                    # CLI 入口
├── base.ts                   # Provider 基类（重试、模型搜索）
├── types.ts                  # 类型定义 + 平台/模型信息
├── commands/                 # CLI 命令
│   ├── ai.ts                # AI 平台管理
│   ├── chat.ts              # 聊天功能
│   ├── config.ts            # 配置管理
│   ├── review.ts            # 代码审查
│   ├── files.ts             # 文件操作
│   ├── history.ts           # 历史记录
│   └── tools.ts             # 工具调用
├── providers/                # AI 平台适配器
│   ├── openai.ts            # OpenAI（基准）
│   ├── anthropic.ts         # Anthropic Claude
│   ├── google.ts            # Google Gemini
│   ├── deepseek.ts          # DeepSeek
│   ├── siliconflow.ts       # 硅基流动
│   ├── aliyun.ts            # 阿里云百炼
│   ├── zhipu.ts             # 智谱AI
│   ├── baidu.ts             # 百度千帆
│   ├── ollama.ts            # Ollama（本地）
│   └── lmstudio.ts          # LM Studio（本地）
├── review/                   # 代码审查引擎
│   ├── analyzer.ts          # 分析器（规则 + AI）
│   └── types.ts             # 审查类型定义
├── history/                  # 会话历史
│   ├── manager.ts           # 历史管理器
│   └── storage.ts           # JSON 文件存储
├── files/                    # 文件操作
│   └── manager.ts           # 文件管理器
├── tools/                    # 工具系统
│   └── registry.ts          # 工具注册表（13个工具）
├── config/                   # 配置管理
│   └── manager.ts           # 配置管理器
└── ui/                       # 用户界面
    ├── logo.ts              # Logo + 打印工具
    └── menu.ts              # 交互式菜单
```

## License

MIT
