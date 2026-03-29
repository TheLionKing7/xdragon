<p align="center">
  <img src="https://github.com/ollama/ollama/assets/3325447/0d0b44e2-8f4a-4e99-9b52-a5c1c741c8f7" alt="xDragon" width="200"/>
</p>

<h1 align="center">xDragon</h1>
<p align="center"><em>Sovereign Local Inference Engine for the Archon Nexus Ecosystem</em></p>

<p align="center">
  <img alt="Built on Ollama" src="https://img.shields.io/badge/built%20on-Ollama-black?style=flat-square"/>
  <img alt="Archon Integration" src="https://img.shields.io/badge/Archon-integrated-purple?style=flat-square"/>
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"/>
</p>

---

## Overview

**xDragon** is the local AI inference layer of the **Archon Nexus** sovereign intelligence platform. Built on [Ollama](https://ollama.com), xDragon extends the upstream runtime with Archon-specific orchestration hooks, task-type routing, and a memory-safe RAM management strategy — giving Archon and his Alpha S7 a private, cost-free compute substrate for every code, reasoning, and creative task.

When xDragon is online, Archon routes qualifying tasks directly to it — bypassing cloud providers entirely. When xDragon is offline or overloaded, Archon's five-tier AI provider chain automatically escalates to Lightning.ai, Cerebras, OpenRouter, DeepSeek, or Groq. **Zero downtime, zero manual intervention.**

---

## Table of Contents

1. [Role in the Archon Ecosystem](#role-in-the-archon-ecosystem)
2. [Architecture](#architecture)
3. [Task Routing](#task-routing)
4. [RAM Management Strategy](#ram-management-strategy)
5. [Daemon Integration](#daemon-integration)
6. [Memsight Integration](#memsight-integration)
7. [FiveClaw Integration](#fiveclaw-integration)
8. [Quick Start](#quick-start)
9. [Archon Configuration](#archon-configuration)
10. [API Compatibility](#api-compatibility)
11. [Model Recommendations](#model-recommendations)

---

## Role in the Archon Ecosystem

```
Archon Nexus Backend
        │
        ▼
  Provider Chain (ai.js)
  ┌─────────────────────────────────────────────────────┐
  │  0: Lightning.ai   (priority-0, self-hosted LitServe)│
  │  1: Cerebras       (priority-1, free tier)           │
  │  2: OpenRouter     (priority-2, fallback)            │
  │  3: DeepSeek       (priority-3)                      │
  │  4: Groq           (priority-4, last resort)         │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  xDragon Bridge (xdragon.js)
  ┌─────────────────────────────────────────────────────┐
  │  • Pings XDRAGON_BASE health endpoint               │
  │  • Routes code/creative/reasoning/math tasks locally │
  │  • keep_alive: 0  → model unloads after each call   │
  │  • Returns null on failure → provider chain retries │
  └─────────────────────────────────────────────────────┘
        │
        ▼
   xDragon (Ollama Runtime)
   - deepseek-coder:6.7b  (code tasks)
   - qwen2.5:7b           (creative tasks)
   - llama3.2:3b          (reasoning/math)
```

xDragon sits as a **parallel inference path** to the cloud provider chain. The Archon backend's `xdragon.js` bridge checks xDragon availability before each routable task, preferring local execution for:

- **Code generation & review** (AYO's primary tool)
- **Creative writing & narrative** (ARIA and MEI)
- **Logical reasoning & math** (KOFI's financial models)

Non-routable tasks (e.g., structured JSON extraction, sensitive compliance queries) go straight to cloud providers.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    xDragon Node                          │
│                                                          │
│  ┌─────────────┐   REST API   ┌──────────────────────┐  │
│  │ Ollama Core │◄────────────►│ Archon Backend       │  │
│  │ (Go runtime)│  :11434      │ backend/services/    │  │
│  └──────┬──────┘              │   xdragon.js         │  │
│         │                     └──────────────────────┘  │
│         ▼                                                │
│  ┌─────────────┐              ┌──────────────────────┐  │
│  │ Model Store │              │ Archon Local Daemon  │  │
│  │ (GGUF/MLX)  │              │ daemon/daemon.js     │  │
│  └─────────────┘              │ • ollama capability  │  │
│                               │ • exposes proxy      │  │
│                               └──────────────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Linked Memory Subsystem (optional)              │    │
│  │ Memsight → HINDSIGHT_API_LLM_PROVIDER=ollama   │    │
│  │ HINDSIGHT_API_LLM_BASE_URL=http://xdragon:11434 │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## Task Routing

The `xdragon.js` bridge in Archon evaluates each request's task type before routing:

| Task Type | Routes to xDragon | Default Model |
|-----------|:-----------------:|---------------|
| `code` | ✅ Yes | `deepseek-coder:6.7b` |
| `creative` | ✅ Yes | `qwen2.5:7b` |
| `reasoning` | ✅ Yes | `llama3.2:3b` |
| `math` | ✅ Yes | `llama3.2:3b` |
| `structured_json` | ❌ Cloud | — |
| `vision` | ❌ Cloud | — |
| `embedding` | ❌ Memsight | — |

If xDragon is unreachable (health check fails), all tasks fall through to the cloud provider chain automatically.

---

## RAM Management Strategy

xDragon uses **`keep_alive: 0`** on every API call — Ollama unloads the model from GPU/CPU RAM immediately after each inference. This is a deliberate design choice for the Archon use case:

**Why `keep_alive: 0`?**
- Alpha S7 agents are invoked on-demand (chat sessions, missions, cron jobs)
- Tasks arrive in bursts, not steady streams
- RAM is shared with Memsight, the Archon backend, and the daemon process
- Prevents xDragon from monopolizing memory between tasks

**Trade-off:** Cold-start latency on first call (~1–3 seconds for small models). Archon's task queue absorbs this via priority scheduling and parallel workers.

---

## Daemon Integration

The **Archon Local Daemon** (`daemon/daemon.js`) automatically registers xDragon as an available capability when the daemon connects to the backend via WebSocket. This means:

1. The Palace UI immediately reflects xDragon's availability in system status
2. AYO (DevOps agent) can invoke `ollama pull <model>` and `ollama run <model>` through daemon shell commands
3. Daemon exposes an xDragon proxy endpoint, allowing mission workflows to call local inference without network exposure
4. Palace's telemetry dashboard tracks xDragon health, last-used model, and token throughput

**Capability payload registered on daemon connect:**
```json
{
  "capabilities": ["filesystem", "shell", "git", "system_info", "ollama"],
  "xdragon": {
    "base_url": "http://localhost:11434",
    "status": "online"
  }
}
```

---

## Memsight Integration

[Memsight (Hindsight)](https://github.com/your-org/memsight) powers long-term memory for every Alpha S7 agent. When xDragon is running, Memsight can use it as its LLM backend — keeping memory operations **entirely offline**:

```env
# In Memsight .env
HINDSIGHT_API_LLM_PROVIDER=ollama
HINDSIGHT_API_LLM_BASE_URL=http://localhost:11434
HINDSIGHT_API_LLM_MODEL=llama3.2:3b
```

This means fact extraction, entity resolution, and mental model synthesis happen on-device, with no API cost. The embedding model (sentence-transformers) is always local regardless.

---

## FiveClaw Integration

[FiveClaw](https://github.com/your-org/FiveClaw) is an autonomous revenue agent registered in Archon as an MCP HTTP provider. FiveClaw's LLM backend can be pointed at xDragon:

```env
# In FiveClaw config
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen2.5:7b
```

AYO can restart, retrain, and monitor FiveClaw via daemon shell commands, keeping the entire revenue loop on local compute.

---

## Quick Start

### macOS / Linux

```shell
curl -fsSL https://ollama.com/install.sh | sh
```

### Windows

```shell
irm https://ollama.com/install.ps1 | iex
```

### Pull recommended Archon models

```shell
ollama pull deepseek-coder:6.7b   # Code tasks (AYO)
ollama pull qwen2.5:7b            # Creative tasks (ARIA, MEI)
ollama pull llama3.2:3b           # Reasoning/math (ARCHON, KOFI)
```

### Verify xDragon is reachable

```shell
curl http://localhost:11434/api/tags
```

---

## Archon Configuration

Set the following in your Archon backend `.env`:

```env
# Tell Archon where xDragon lives
XDRAGON_URL=http://localhost:11434/api/chat
XDRAGON_BASE=http://localhost:11434

# Model assignments (optional overrides)
XDRAGON_CODE_MODEL=deepseek-coder:6.7b
XDRAGON_CREATIVE_MODEL=qwen2.5:7b
XDRAGON_REASONING_MODEL=llama3.2:3b
```

When `XDRAGON_BASE` is set and returns 200 on health check, xDragon is active. Remove these vars to route all traffic to cloud providers.

---

## API Compatibility

xDragon is **100% compatible with the Ollama REST API**. Archon's bridge uses:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/tags` | Health check / list available models |
| `POST /api/chat` | Chat completions (streaming) |
| `POST /api/generate` | Raw generation |
| `POST /api/embed` | Embeddings (used by Memsight) |

The xDragon bridge also respects the **OpenAI-compatible** `/v1/chat/completions` endpoint for FiveClaw and other OpenAI-SDK consumers.

---

## Model Recommendations

| Use Case | Recommended Model | VRAM |
|----------|-------------------|------|
| Code generation (AYO) | `deepseek-coder:6.7b` | 4 GB |
| Creative writing (ARIA) | `qwen2.5:7b` | 5 GB |
| Reasoning / math (KOFI, ARCHON) | `llama3.2:3b` | 2 GB |
| Memory LLM (Memsight) | `llama3.2:3b` | 2 GB |
| Low-RAM mode (all tasks) | `llama3.2:1b` | 1 GB |
| Mac MLX acceleration | `llama3.2:3b` (MLX) | Unified |

With `keep_alive: 0`, only one model occupies RAM at a time — a 4 GB machine comfortably runs xDragon.

---

## Hyperspace Integration

[Hyperspace](https://hyper.space) is a decentralized P2P AI inference network (2,000,000+ nodes) built on libp2p. AYO runs a Hyperspace node on the same machine as xDragon — the node integrates automatically with your existing Ollama installation, contributing the same GPU compute to the P2P network and earning points.

```bash
# Install Hyperspace (auto-detects existing Ollama/xDragon)
curl -fsSL https://download.hyper.space/api/install | bash

# Start contributing compute
hyperspace start --profile full

# Pull best models for your VRAM (shares with xDragon model store)
hyperspace models pull --auto

# Check status
hyperspace status   # peers, tier, points, uptime
```

**xDragon + Hyperspace on the same machine:**
- Both use `llama-server` / Ollama — no duplicate model downloads
- xDragon handles Archon's private, latency-sensitive inference
- Hyperspace contributes idle GPU cycles to the P2P network
- `keep_alive: 0` (Archon's RAM strategy) means models unload between Archon tasks, freeing GPU for Hyperspace relay when Archon is idle

---

## License

MIT — same as upstream Ollama.

---

*xDragon is a component of the [Archon Nexus](https://github.com/your-org/Archon-Nexus) sovereign AI operating system.*

*"Local compute is sovereignty. Cloud compute is leverage. Use both."*

---

<!-- Original Ollama documentation follows for reference -->

# Ollama (Upstream)

Start building with open models.

## Download

### macOS

```shell
curl -fsSL https://ollama.com/install.sh | sh
```

or [download manually](https://ollama.com/download/Ollama.dmg)

### Windows

```shell
irm https://ollama.com/install.ps1 | iex
```

or [download manually](https://ollama.com/download/OllamaSetup.exe)

### Linux

```shell
curl -fsSL https://ollama.com/install.sh | sh
```

[Manual install instructions](https://docs.ollama.com/linux#manual-install)

### Docker

The official [Ollama Docker image](https://hub.docker.com/r/ollama/ollama) `ollama/ollama` is available on Docker Hub.

### Libraries

- [ollama-python](https://github.com/ollama/ollama-python)
- [ollama-js](https://github.com/ollama/ollama-js)

### Community

- [Discord](https://discord.gg/ollama)
- [𝕏 (Twitter)](https://x.com/ollama)
- [Reddit](https://reddit.com/r/ollama)

## Get started

```
ollama
```

You'll be prompted to run a model or connect Ollama to your existing agents or applications such as `claude`, `codex`, `openclaw` and more.

### Coding

To launch a specific integration:

```
ollama launch claude
```

Supported integrations include [Claude Code](https://docs.ollama.com/integrations/claude-code), [Codex](https://docs.ollama.com/integrations/codex), [Droid](https://docs.ollama.com/integrations/droid), and [OpenCode](https://docs.ollama.com/integrations/opencode).

### AI assistant

Use [OpenClaw](https://docs.ollama.com/integrations/openclaw) to turn Ollama into a personal AI assistant across WhatsApp, Telegram, Slack, Discord, and more:

```
ollama launch openclaw
```

### Chat with a model

Run and chat with [Gemma 3](https://ollama.com/library/gemma3):

```
ollama run gemma3
```

See [ollama.com/library](https://ollama.com/library) for the full list.

See the [quickstart guide](https://docs.ollama.com/quickstart) for more details.

## REST API

Ollama has a REST API for running and managing models.

```
curl http://localhost:11434/api/chat -d '{
  "model": "gemma3",
  "messages": [{
    "role": "user",
    "content": "Why is the sky blue?"
  }],
  "stream": false
}'
```

See the [API documentation](https://docs.ollama.com/api) for all endpoints.

### Python

```
pip install ollama
```

```python
from ollama import chat

response = chat(model='gemma3', messages=[
  {
    'role': 'user',
    'content': 'Why is the sky blue?',
  },
])
print(response.message.content)
```

### JavaScript

```
npm i ollama
```

```javascript
import ollama from "ollama";

const response = await ollama.chat({
  model: "gemma3",
  messages: [{ role: "user", content: "Why is the sky blue?" }],
});
console.log(response.message.content);
```



## Extension Points & Usage

### 1. Model Integration

- Add a new backend by implementing a converter in `convert/` (see `convert_openclaw.go`, `convert_nanoclaw.go`).
- Register the architecture string in `convert.go` (e.g., `"OpenClawForCausalLM"`).
- Ensure your model's `config.json` uses the correct architecture string.

### 2. API & Client

- The API is model-agnostic; new models are exposed automatically if registered.
- Use the REST API or Python/JS clients to interact with any registered model.

### 3. UI Playground

- The web UI playground allows creative experimentation with all models.
- Add new UI features in `app/ui/app/src/components/CreativePlayground.tsx`.
- The sidebar link is in `ChatSidebar.tsx`.

### 4. CLI Playground

- Use `ollama playground --model <MODEL> --prompt <PROMPT>` to test any model from the terminal.
- Extend CLI logic in `cmd/playground.go`.

### 5. Documentation

- Document new models and features in this README and in your model's own docs.

---

## Supported backends

- [llama.cpp](https://github.com/ggml-org/llama.cpp) project founded by Georgi Gerganov.

## Documentation

- [CLI reference](https://docs.ollama.com/cli)
- [REST API reference](https://docs.ollama.com/api)
- [Importing models](https://docs.ollama.com/import)
- [Modelfile reference](https://docs.ollama.com/modelfile)
- [Building from source](https://github.com/ollama/ollama/blob/main/docs/development.md)

## Community Integrations

> Want to add your project? Open a pull request.

### Chat Interfaces

#### Web

- [Open WebUI](https://github.com/open-webui/open-webui) - Extensible, self-hosted AI interface
- [Onyx](https://github.com/onyx-dot-app/onyx) - Connected AI workspace
- [LibreChat](https://github.com/danny-avila/LibreChat) - Enhanced ChatGPT clone with multi-provider support
- [Lobe Chat](https://github.com/lobehub/lobe-chat) - Modern chat framework with plugin ecosystem ([docs](https://lobehub.com/docs/self-hosting/examples/ollama))
- [NextChat](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) - Cross-platform ChatGPT UI ([docs](https://docs.nextchat.dev/models/ollama))
- [Perplexica](https://github.com/ItzCrazyKns/Perplexica) - AI-powered search engine, open-source Perplexity alternative
- [big-AGI](https://github.com/enricoros/big-AGI) - AI suite for professionals
- [Lollms WebUI](https://github.com/ParisNeo/lollms-webui) - Multi-model web interface
- [ChatOllama](https://github.com/sugarforever/chat-ollama) - Chatbot with knowledge bases
- [Bionic GPT](https://github.com/bionic-gpt/bionic-gpt) - On-premise AI platform
- [Chatbot UI](https://github.com/ivanfioravanti/chatbot-ollama) - ChatGPT-style web interface
- [Hollama](https://github.com/fmaclen/hollama) - Minimal web interface
- [Chatbox](https://github.com/Bin-Huang/Chatbox) - Desktop and web AI client
- [chat](https://github.com/swuecho/chat) - Chat web app for teams
- [Ollama RAG Chatbot](https://github.com/datvodinh/rag-chatbot.git) - Chat with multiple PDFs using RAG
- [Tkinter-based client](https://github.com/chyok/ollama-gui) - Python desktop client

#### Desktop

- [Dify.AI](https://github.com/langgenius/dify) - LLM app development platform
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) - All-in-one AI app for Mac, Windows, and Linux
- [Maid](https://github.com/Mobile-Artificial-Intelligence/maid) - Cross-platform mobile and desktop client
- [Witsy](https://github.com/nbonamy/witsy) - AI desktop app for Mac, Windows, and Linux
- [Cherry Studio](https://github.com/kangfenmao/cherry-studio) - Multi-provider desktop client
- [Ollama App](https://github.com/JHubi1/ollama-app) - Multi-platform client for desktop and mobile
- [PyGPT](https://github.com/szczyglis-dev/py-gpt) - AI desktop assistant for Linux, Windows, and Mac
- [Alpaca](https://github.com/Jeffser/Alpaca) - GTK4 client for Linux and macOS
- [SwiftChat](https://github.com/aws-samples/swift-chat) - Cross-platform including iOS, Android, and Apple Vision Pro
- [Enchanted](https://github.com/AugustDev/enchanted) - Native macOS and iOS client
- [RWKV-Runner](https://github.com/josStorer/RWKV-Runner) - Multi-model desktop runner
- [Ollama Grid Search](https://github.com/dezoito/ollama-grid-search) - Evaluate and compare models
- [macai](https://github.com/Renset/macai) - macOS client for Ollama and ChatGPT
- [AI Studio](https://github.com/MindWorkAI/AI-Studio) - Multi-provider desktop IDE
- [Reins](https://github.com/ibrahimcetin/reins) - Parameter tuning and reasoning model support
- [ConfiChat](https://github.com/1runeberg/confichat) - Privacy-focused with optional encryption
- [LLocal.in](https://github.com/kartikm7/llocal) - Electron desktop client
- [MindMac](https://mindmac.app) - AI chat client for Mac
- [Msty](https://msty.app) - Multi-model desktop client
- [BoltAI for Mac](https://boltai.com) - AI chat client for Mac
- [IntelliBar](https://intellibar.app/) - AI-powered assistant for macOS
- [Kerlig AI](https://www.kerlig.com/) - AI writing assistant for macOS
- [Hillnote](https://hillnote.com) - Markdown-first AI workspace
- [Perfect Memory AI](https://www.perfectmemory.ai/) - Productivity AI personalized by screen and meeting history

#### Mobile

- [Ollama Android Chat](https://github.com/sunshine0523/OllamaServer) - One-click Ollama on Android

> SwiftChat, Enchanted, Maid, Ollama App, Reins, and ConfiChat listed above also support mobile platforms.

### Code Editors & Development

- [Cline](https://github.com/cline/cline) - VS Code extension for multi-file/whole-repo coding
- [Continue](https://github.com/continuedev/continue) - Open-source AI code assistant for any IDE
- [Void](https://github.com/voideditor/void) - Open source AI code editor, Cursor alternative
- [Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot) - AI assistant for Obsidian
- [twinny](https://github.com/rjmacarthy/twinny) - Copilot and Copilot chat alternative
- [gptel Emacs client](https://github.com/karthink/gptel) - LLM client for Emacs
- [Ollama Copilot](https://github.com/bernardo-bruning/ollama-copilot) - Use Ollama as GitHub Copilot
- [Obsidian Local GPT](https://github.com/pfrankov/obsidian-local-gpt) - Local AI for Obsidian
- [Ellama Emacs client](https://github.com/s-kostyaev/ellama) - LLM tool for Emacs
- [orbiton](https://github.com/xyproto/orbiton) - Config-free text editor with Ollama tab completion
- [AI ST Completion](https://github.com/yaroslavyaroslav/OpenAI-sublime-text) - Sublime Text 4 AI assistant
- [VT Code](https://github.com/vinhnx/vtcode) - Rust-based terminal coding agent with Tree-sitter
- [QodeAssist](https://github.com/Palm1r/QodeAssist) - AI coding assistant for Qt Creator
- [AI Toolkit for VS Code](https://aka.ms/ai-tooklit/ollama-docs) - Microsoft-official VS Code extension
- [Open Interpreter](https://docs.openinterpreter.com/language-model-setup/local-models/ollama) - Natural language interface for computers

### Libraries & SDKs

- [LiteLLM](https://github.com/BerriAI/litellm) - Unified API for 100+ LLM providers
- [Semantic Kernel](https://github.com/microsoft/semantic-kernel/tree/main/python/semantic_kernel/connectors/ai/ollama) - Microsoft AI orchestration SDK
- [LangChain4j](https://github.com/langchain4j/langchain4j) - Java LangChain ([example](https://github.com/langchain4j/langchain4j-examples/tree/main/ollama-examples/src/main/java))
- [LangChainGo](https://github.com/tmc/langchaingo/) - Go LangChain ([example](https://github.com/tmc/langchaingo/tree/main/examples/ollama-completion-example))
- [Spring AI](https://github.com/spring-projects/spring-ai) - Spring framework AI support ([docs](https://docs.spring.io/spring-ai/reference/api/chat/ollama-chat.html))
- [LangChain](https://python.langchain.com/docs/integrations/chat/ollama/) and [LangChain.js](https://js.langchain.com/docs/integrations/chat/ollama/) with [example](https://js.langchain.com/docs/tutorials/local_rag/)
- [Ollama for Ruby](https://github.com/crmne/ruby_llm) - Ruby LLM library
- [any-llm](https://github.com/mozilla-ai/any-llm) - Unified LLM interface by Mozilla
- [OllamaSharp for .NET](https://github.com/awaescher/OllamaSharp) - .NET SDK
- [LangChainRust](https://github.com/Abraxas-365/langchain-rust) - Rust LangChain ([example](https://github.com/Abraxas-365/langchain-rust/blob/main/examples/llm_ollama.rs))
- [Agents-Flex for Java](https://github.com/agents-flex/agents-flex) - Java agent framework ([example](https://github.com/agents-flex/agents-flex/tree/main/agents-flex-llm/agents-flex-llm-ollama/src/test/java/com/agentsflex/llm/ollama))
- [Elixir LangChain](https://github.com/brainlid/langchain) - Elixir LangChain
- [Ollama-rs for Rust](https://github.com/pepperoni21/ollama-rs) - Rust SDK
- [LangChain for .NET](https://github.com/tryAGI/LangChain) - .NET LangChain ([example](https://github.com/tryAGI/LangChain/blob/main/examples/LangChain.Samples.OpenAI/Program.cs))
- [chromem-go](https://github.com/philippgille/chromem-go) - Go vector database with Ollama embeddings ([example](https://github.com/philippgille/chromem-go/tree/v0.5.0/examples/rag-wikipedia-ollama))
- [LangChainDart](https://github.com/davidmigloz/langchain_dart) - Dart LangChain
- [LlmTornado](https://github.com/lofcz/llmtornado) - Unified C# interface for multiple inference APIs
- [Ollama4j for Java](https://github.com/ollama4j/ollama4j) - Java SDK
- [Ollama for Laravel](https://github.com/cloudstudio/ollama-laravel) - Laravel integration
- [Ollama for Swift](https://github.com/mattt/ollama-swift) - Swift SDK
- [LlamaIndex](https://docs.llamaindex.ai/en/stable/examples/llm/ollama/) and [LlamaIndexTS](https://ts.llamaindex.ai/modules/llms/available_llms/ollama) - Data framework for LLM apps
- [Haystack](https://github.com/deepset-ai/haystack-integrations/blob/main/integrations/ollama.md) - AI pipeline framework
- [Firebase Genkit](https://firebase.google.com/docs/genkit/plugins/ollama) - Google AI framework
- [Ollama-hpp for C++](https://github.com/jmont-dev/ollama-hpp) - C++ SDK
- [PromptingTools.jl](https://github.com/svilupp/PromptingTools.jl) - Julia LLM toolkit ([example](https://svilupp.github.io/PromptingTools.jl/dev/examples/working_with_ollama))
- [Ollama for R - rollama](https://github.com/JBGruber/rollama) - R SDK
- [Portkey](https://portkey.ai/docs/welcome/integration-guides/ollama) - AI gateway
- [Testcontainers](https://testcontainers.com/modules/ollama/) - Container-based testing
- [LLPhant](https://github.com/theodo-group/LLPhant?tab=readme-ov-file#ollama) - PHP AI framework

### Frameworks & Agents

- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT/blob/master/docs/content/platform/ollama.md) - Autonomous AI agent platform
- [crewAI](https://github.com/crewAIInc/crewAI) - Multi-agent orchestration framework
- [Strands Agents](https://github.com/strands-agents/sdk-python) - Model-driven agent building by AWS
- [Cheshire Cat](https://github.com/cheshire-cat-ai/core) - AI assistant framework
- [any-agent](https://github.com/mozilla-ai/any-agent) - Unified agent framework interface by Mozilla
- [Stakpak](https://github.com/stakpak/agent) - Open source DevOps agent
- [Hexabot](https://github.com/hexastack/hexabot) - Conversational AI builder
- [Neuro SAN](https://github.com/cognizant-ai-lab/neuro-san-studio) - Multi-agent orchestration ([docs](https://github.com/cognizant-ai-lab/neuro-san-studio/blob/main/docs/user_guide.md#ollama))

### RAG & Knowledge Bases

- [RAGFlow](https://github.com/infiniflow/ragflow) - RAG engine based on deep document understanding
- [R2R](https://github.com/SciPhi-AI/R2R) - Open-source RAG engine
- [MaxKB](https://github.com/1Panel-dev/MaxKB/) - Ready-to-use RAG chatbot
- [Minima](https://github.com/dmayboroda/minima) - On-premises or fully local RAG
- [Chipper](https://github.com/TilmanGriesel/chipper) - AI interface with Haystack RAG
- [ARGO](https://github.com/xark-argo/argo) - RAG and deep research on Mac/Windows/Linux
- [Archyve](https://github.com/nickthecook/archyve) - RAG-enabling document library
- [Casibase](https://casibase.org) - AI knowledge base with RAG and SSO
- [BrainSoup](https://www.nurgo-software.com/products/brainsoup) - Native client with RAG and multi-agent automation

### Bots & Messaging

- [LangBot](https://github.com/RockChinQ/LangBot) - Multi-platform messaging bots with agents and RAG
- [AstrBot](https://github.com/Soulter/AstrBot/) - Multi-platform chatbot with RAG and plugins
- [Discord-Ollama Chat Bot](https://github.com/kevinthedang/discord-ollama) - TypeScript Discord bot
- [Ollama Telegram Bot](https://github.com/ruecat/ollama-telegram) - Telegram bot
- [LLM Telegram Bot](https://github.com/innightwolfsleep/llm_telegram_bot) - Telegram bot for roleplay

### Terminal & CLI

- [aichat](https://github.com/sigoden/aichat) - All-in-one LLM CLI with Shell Assistant, RAG, and AI tools
- [oterm](https://github.com/ggozad/oterm) - Terminal client for Ollama
- [gollama](https://github.com/sammcj/gollama) - Go-based model manager for Ollama
- [tlm](https://github.com/yusufcanb/tlm) - Local shell copilot
- [tenere](https://github.com/pythops/tenere) - TUI for LLMs
- [ParLlama](https://github.com/paulrobello/parllama) - TUI for Ollama
- [llm-ollama](https://github.com/taketwo/llm-ollama) - Plugin for [Datasette's LLM CLI](https://llm.datasette.io/en/stable/)
- [ShellOracle](https://github.com/djcopley/ShellOracle) - Shell command suggestions
- [LLM-X](https://github.com/mrdjohnson/llm-x) - Progressive web app for LLMs
- [cmdh](https://github.com/pgibler/cmdh) - Natural language to shell commands
- [VT](https://github.com/vinhnx/vt.ai) - Minimal multimodal AI chat app

### Productivity & Apps

- [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) - AI collaborative workspace, self-hostable Notion alternative
- [Screenpipe](https://github.com/mediar-ai/screenpipe) - 24/7 screen and mic recording with AI-powered search
- [Vibe](https://github.com/thewh1teagle/vibe) - Transcribe and analyze meetings
- [Page Assist](https://github.com/n4ze3m/page-assist) - Chrome extension for AI-powered browsing
- [NativeMind](https://github.com/NativeMindBrowser/NativeMindExtension) - Private, on-device browser AI assistant
- [Ollama Fortress](https://github.com/ParisNeo/ollama_proxy_server) - Security proxy for Ollama
- [1Panel](https://github.com/1Panel-dev/1Panel/) - Web-based Linux server management
- [Writeopia](https://github.com/Writeopia/Writeopia) - Text editor with Ollama integration
- [QA-Pilot](https://github.com/reid41/QA-Pilot) - GitHub code repository understanding
- [Raycast extension](https://github.com/MassimilianoPasquini97/raycast_ollama) - Ollama in Raycast
- [Painting Droid](https://github.com/mateuszmigas/painting-droid) - Painting app with AI integrations
- [Serene Pub](https://github.com/doolijb/serene-pub) - AI roleplaying app
- [Mayan EDMS](https://gitlab.com/mayan-edms/mayan-edms) - Document management with Ollama workflows
- [TagSpaces](https://www.tagspaces.org) - File management with [AI tagging](https://docs.tagspaces.org/ai/)

### Observability & Monitoring

- [Opik](https://www.comet.com/docs/opik/cookbook/ollama) - Debug, evaluate, and monitor LLM applications
- [OpenLIT](https://github.com/openlit/openlit) - OpenTelemetry-native monitoring for Ollama and GPUs
- [Lunary](https://lunary.ai/docs/integrations/ollama) - LLM observability with analytics and PII masking
- [Langfuse](https://langfuse.com/docs/integrations/ollama) - Open source LLM observability
- [HoneyHive](https://docs.honeyhive.ai/integrations/ollama) - AI observability and evaluation for agents
- [MLflow Tracing](https://mlflow.org/docs/latest/llms/tracing/index.html#automatic-tracing) - Open source LLM observability

### Database & Embeddings

- [pgai](https://github.com/timescale/pgai) - PostgreSQL as a vector database ([guide](https://github.com/timescale/pgai/blob/main/docs/vectorizer-quick-start.md))
- [MindsDB](https://github.com/mindsdb/mindsdb/blob/staging/mindsdb/integrations/handlers/ollama_handler/README.md) - Connect Ollama with 200+ data platforms
- [chromem-go](https://github.com/philippgille/chromem-go/blob/v0.5.0/embed_ollama.go) - Embeddable vector database for Go ([example](https://github.com/philippgille/chromem-go/tree/v0.5.0/examples/rag-wikipedia-ollama))
- [Kangaroo](https://github.com/dbkangaroo/kangaroo) - AI-powered SQL client

### Infrastructure & Deployment

#### Cloud

- [Google Cloud](https://cloud.google.com/run/docs/tutorials/gpu-gemma2-with-ollama)
- [Fly.io](https://fly.io/docs/python/do-more/add-ollama/)
- [Koyeb](https://www.koyeb.com/deploy/ollama)
- [Harbor](https://github.com/av/harbor) - Containerized LLM toolkit with Ollama as default backend

#### Package Managers

- [Pacman](https://archlinux.org/packages/extra/x86_64/ollama/)
- [Homebrew](https://formulae.brew.sh/formula/ollama)
- [Nix package](https://search.nixos.org/packages?show=ollama&from=0&size=50&sort=relevance&type=packages&query=ollama)
- [Helm Chart](https://artifacthub.io/packages/helm/ollama-helm/ollama)
- [Gentoo](https://github.com/gentoo/guru/tree/master/app-misc/ollama)
- [Flox](https://flox.dev/blog/ollama-part-one)
- [Guix channel](https://codeberg.org/tusharhero/ollama-guix)
