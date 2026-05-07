# DevFlow Agent

**DevFlow Agent** — A reliable, honest, and controllable AI-powered development assistant CLI tool.

## 🌟 Core Philosophy

### Three Iron Laws (三条铁律)
1. **Reliability** — Every AI suggestion must be verifiable and reproducible
2. **Honesty** — Clearly distinguish between AI speculation and confirmed facts  
3. **Controllability** — Users maintain full control over all operations

## 🚀 Features

- **Intent Recognition Engine** — Dual recognition mechanism based on rules and AI enhancement
- **Session Management** — Real-time saving using WAL (Write-Ahead Logging) mechanism
- **Trust Manager** — Issue detection, transparent reporting, user confirmation
- **Change Control System** — Risk assessment, file backup, user approval workflow
- **Multi-Platform AI Integration** — Support for 10+ AI platforms

## 🛠️ Supported AI Platforms

| Platform | Type | Status |
|----------|------|--------|
| OpenAI | Cloud | ✅ |
| Anthropic | Cloud | ✅ |
| Google Gemini | Cloud | ✅ |
| 硅基流动 | Cloud | ✅ |
| 阿里云百炼 | Cloud | ✅ |
| 智谱AI | Cloud | ✅ |
| 百度千帆 | Cloud | ✅ |
| DeepSeek | Cloud | ✅ |
| Ollama | Local | ✅ |
| LM Studio | Local | ✅ |

## 📦 Installation

```bash
npm install -g @devflow/agent
```

## 🖥️ CLI Commands

```bash
# List all platforms
devflow ai list

# Check configuration status
devflow ai status

# List all available models
devflow ai model list

# Get model recommendations
devflow ai model suggest

# Get model details
devflow ai model info <model-name>
```

## ⚙️ Configuration

### Environment Variables

```bash
# OpenAI
export OPENAI_API_KEY=your-key

# Anthropic
export ANTHROPIC_API_KEY=your-key

# Google
export GOOGLE_API_KEY=your-key

# 阿里云
export DASHSCOPE_API_KEY=your-key

# 智谱AI
export ZHIPU_API_KEY=your-key

# 百度千帆
export QIANFAN_API_KEY=your-key
export QIANFAN_SECRET_KEY=your-key

# 硅基流动
export SILICONFLOW_API_KEY=your-key

# DeepSeek
export DEEPSEEK_API_KEY=your-key
```

## 📁 Project Structure

```
DevFlow-Agent/
├── src/                    # CLI core
│   ├── cli.ts              # CLI entry
│   ├── types.ts            # Type definitions
│   ├── base.ts             # Provider base class
│   └── commands/           # CLI commands
├── packages/               # Core packages
│   └── core/               # Core utilities
├── mcp/                    # MCP tools (90+)
├── skills/                 # Skill implementations
└── .agent-skills/          # Agent configuration
```

## 📜 License

This project is for **personal use only**. Commercial use is not permitted without prior authorization.

See [LICENSE](LICENSE) for more details.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📞 Contact

For commercial inquiries or licensing questions, please contact: contact@devflow.ai

---

**DevFlow Agent** — Building trust in AI-powered development