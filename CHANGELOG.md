# Changelog

## 0.1.0 (2026-09-24)

- 新增 OpenAI 兼容 LLM API 翻译提供方：`baseUrl` / `model` / 提示词 / 超时均可配置，API key 支持环境变量或设置项
- 翻译结果改为侧边栏常驻面板（Webview），支持复制译文、替换选区、重试、检查设置
- 新增会话内翻译缓存（LRU，最多 100 条），重试自动跳过缓存
- MyMemory 免费接口保留为后备（未配置 LLM 时自动使用），并修复：
  - 单次 500 字节限制预检，超限给出明确提示
  - HTTP 非 200 响应的错误处理
  - User-Agent 版本随扩展版本动态读取
- 提示词模板校验（必须包含 `{text}` 占位符）
- 工程化：模块化拆分、vitest 单元测试、新增 LICENSE / CHANGELOG / 图标
- 移除冗余的 activationEvents；engines 提升至 ^1.86.0

## 0.0.1

- 初始版本：通过 MyMemory 接口将选中文字翻译为中文，并在 hover 卡片中展示
