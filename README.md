# Selection Translator

VS Code 扩展：选中文字 → 翻译成中文 → 在侧边栏面板中查看，支持复制、替换选区、重试。

默认对接**任意 OpenAI 兼容的 LLM API**（提示词完全自定义）；未配置 LLM 时自动回落到免费的 **MyMemory** 接口。

## 功能

- 编辑器中右键选中文字 → 「翻译选中内容为中文」（命令面板同名命令）
- 译文显示在侧边栏常驻面板，鼠标移开不会消失
- 面板操作：复制译文、替换选区、重试（跳过缓存）
- LLM 提供方可配置：`baseUrl` / `model` / 提示词模板 / 超时时间，兼容 OpenAI、DeepSeek、Moonshot、Ollama、vLLM 等
- API key 支持环境变量（推荐）或设置项两种方式
- 会话内翻译缓存（LRU 最多 100 条），相同文本不重复请求
- MyMemory 免费接口作为后备：自动检测 500 字节限制、配额用尽提示

## 设置项

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `selectionTranslator.provider` | `auto` | `auto`（配置了 LLM 用 LLM，否则 MyMemory）/ `llm` / `mymemory` |
| `selectionTranslator.sourceLanguage` | `en` | 源语言。MyMemory 下用语言代码（`en`、`ja`…）；LLM 下作为提示词中的语言提示，可填「自动检测」 |
| `selectionTranslator.contactEmail` | 空 | 可选，MyMemory 的 `de` 参数，提高免费配额 |
| `selectionTranslator.llm.baseUrl` | `https://api.openai.com/v1` | OpenAI 兼容服务的 base URL |
| `selectionTranslator.llm.model` | `gpt-4o-mini` | 模型名 |
| `selectionTranslator.llm.apiKey` | 空 | 留空时从环境变量读取（见下） |
| `selectionTranslator.llm.apiKeyEnvVar` | `OPENAI_API_KEY` | 读取 API key 的环境变量名 |
| `selectionTranslator.llm.prompt` | 见下 | 自定义提示词模板 |
| `selectionTranslator.llm.timeoutSeconds` | `30` | LLM 请求超时（秒） |

### 提示词模板

默认模板：

```
你是一名专业翻译。请将下面的文本翻译成{targetLanguage}，直接输出译文，不要添加任何解释或注释。
源语言提示：{sourceLanguage}

待翻译文本：
{text}
```

可用占位符：

- `{text}` — 选中的文本（**必须保留**，否则无法翻译）
- `{sourceLanguage}` — `selectionTranslator.sourceLanguage` 的值
- `{targetLanguage}` — 固定为「简体中文」

### LLM 提供方示例

| 服务 | `llm.baseUrl` | `llm.model` | API key |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | 环境变量 `OPENAI_API_KEY` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 环境变量改为 `DEEPSEEK_API_KEY`（或填入设置项） |
| Ollama（本地） | `http://localhost:11434/v1` | `qwen2.5:7b` | 无需 |

### API key 安全

推荐把 key 放在环境变量中（通过 `llm.apiKeyEnvVar` 指定变量名）。直接填在 `llm.apiKey` 设置项里会**明文存储**在 `settings.json`，请注意保密。

## 已知限制

- 不支持 Azure OpenAI 的专用认证方式（`api-key` 请求头 + `api-version` 参数），标准 OpenAI 兼容服务不受影响
- MyMemory 免费接口单次请求上限 500 字节；超长选区请使用 LLM 提供方
- 缓存仅存在于当前会话，重启 VS Code 后清空

## 开发

```bash
npm install
npm run compile   # 编译
npm test          # 运行单元测试
```

按 `F5` 启动扩展开发宿主即可试用。

```bash
npm run package   # 打包 vsix 到 dist/
```
