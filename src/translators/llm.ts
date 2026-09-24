import { renderPrompt, validatePrompt } from '../prompt';
import { TranslationError, TranslationRequest, Translator } from './types';

export interface LlmClientOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyEnvVar: string;
  prompt: string;
  timeoutMs: number;
}

export interface ChatCompletionsBody {
  model: string;
  temperature: number;
  stream: boolean;
  messages: Array<{ role: 'user'; content: string }>;
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  error?: { message?: unknown } | string;
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new TranslationError(`LLM baseUrl 格式不正确：${base}。示例：https://api.openai.com/v1`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TranslationError(`LLM baseUrl 必须使用 http(s) 协议：${base}`);
  }
  return `${base.replace(/\/+$/, '')}/chat/completions`;
}

export function buildChatCompletionsBody(model: string, prompt: string): ChatCompletionsBody {
  return {
    model,
    temperature: 0.3,
    stream: false,
    messages: [{ role: 'user', content: prompt }]
  };
}

export function extractTranslation(data: ChatCompletionsResponse | undefined | null): string {
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new TranslationError('LLM 没有返回译文内容。');
  }
  return text;
}

export function mapHttpError(status: number, bodyText: string): TranslationError {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(bodyText) as ChatCompletionsResponse;
    const error = parsed?.error;
    if (typeof error === 'string' && error) {
      detail = error;
    } else if (error && typeof error === 'object' && typeof error.message === 'string' && error.message) {
      detail = error.message;
    }
  } catch {
    // 非 JSON 响应体，保留 HTTP 状态码信息
  }
  return new TranslationError(`LLM 服务返回错误：${detail}`);
}

export class LlmTranslator implements Translator {
  readonly label: string;

  constructor(private readonly options: LlmClientOptions) {
    this.label = `LLM · ${options.model}`;
  }

  async translate(request: TranslationRequest): Promise<string> {
    const { baseUrl, model, apiKey, apiKeyEnvVar, prompt, timeoutMs } = this.options;

    const promptError = validatePrompt(prompt);
    if (promptError) {
      throw new TranslationError(promptError);
    }

    if (isOpenAiHost(baseUrl) && !apiKey) {
      throw new TranslationError(
        `未配置 LLM API key。请设置环境变量 ${apiKeyEnvVar}，或填写 selectionTranslator.llm.apiKey 设置。`
      );
    }

    const renderedPrompt = renderPrompt(prompt, {
      text: request.text,
      sourceLanguage: request.sourceLanguage
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(buildChatCompletionsUrl(baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(buildChatCompletionsBody(model, renderedPrompt)),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new TranslationError(
          `LLM 请求超时（${Math.round(timeoutMs / 1000)} 秒）。请重试，或调大 selectionTranslator.llm.timeoutSeconds。`
        );
      }
      throw new TranslationError('无法连接到 LLM 服务。请检查网络和 baseUrl 设置。');
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw mapHttpError(response.status, bodyText);
    }

    let data: ChatCompletionsResponse;
    try {
      data = (await response.json()) as ChatCompletionsResponse;
    } catch {
      throw new TranslationError('LLM 响应解析失败。请确认 baseUrl 指向 OpenAI 兼容的服务。');
    }

    return extractTranslation(data);
  }
}

function isOpenAiHost(baseUrl: string): boolean {
  try {
    return new URL(baseUrl.trim()).host.endsWith('openai.com');
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    ((error as { name: string }).name === 'TimeoutError' ||
      (error as { name: string }).name === 'AbortError')
  );
}
