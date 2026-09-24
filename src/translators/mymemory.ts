import * as https from 'node:https';
import {
  MY_MEMORY_ENDPOINT,
  MY_MEMORY_MAX_BYTES,
  MY_MEMORY_TIMEOUT_MS,
  TARGET_LANGUAGE_CODE
} from '../constants';
import { TranslationError, TranslationRequest, Translator } from './types';

export function buildMyMemoryUrl(text: string, sourceLanguage: string, contactEmail: string): URL {
  const url = new URL(MY_MEMORY_ENDPOINT);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${sourceLanguage}|${TARGET_LANGUAGE_CODE}`);
  if (contactEmail) {
    url.searchParams.set('de', contactEmail);
  }
  return url;
}

export function assertWithinLimit(text: string): void {
  if (Buffer.byteLength(text, 'utf8') > MY_MEMORY_MAX_BYTES) {
    throw new TranslationError(
      `选区超过 MyMemory 单次请求 ${MY_MEMORY_MAX_BYTES} 字节的上限。请缩短选中的文本，或改用 LLM 提供方。`
    );
  }
}

export interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
    match?: number;
  };
  quotaFinished?: boolean;
  responseDetails?: string;
  responseStatus?: number | string;
}

export function parseMyMemoryResponse(data: MyMemoryResponse): string {
  if (data.quotaFinished) {
    throw new TranslationError('MyMemory 免费配额今日已用完。请明天再试，或配置 LLM 提供方。');
  }

  const status = Number(data.responseStatus);
  const translatedText = data.responseData?.translatedText?.trim();

  if (status !== 200 || !translatedText) {
    const details = data.responseDetails?.trim();
    throw new TranslationError(
      details ? `MyMemory 翻译失败：${details}` : 'MyMemory 未返回译文。'
    );
  }

  return translatedText;
}

export interface MyMemoryClientOptions {
  sourceLanguage: string;
  contactEmail: string;
  userAgent: string;
  timeoutMs?: number;
}

export class MyMemoryTranslator implements Translator {
  readonly label = 'MyMemory';

  constructor(private readonly options: MyMemoryClientOptions) {}

  async translate(request: TranslationRequest): Promise<string> {
    assertWithinLimit(request.text);

    const url = buildMyMemoryUrl(
      request.text,
      this.options.sourceLanguage,
      this.options.contactEmail
    );
    const data = await getJson<MyMemoryResponse>(url, {
      userAgent: this.options.userAgent,
      timeoutMs: this.options.timeoutMs
    });
    return parseMyMemoryResponse(data);
  }
}

function getJson<T>(url: URL, opts: { userAgent: string; timeoutMs?: number }): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': opts.userAgent } }, (response) => {
      const status = response.statusCode ?? 0;
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        if (status !== 200) {
          reject(
            new TranslationError(`MyMemory 服务返回错误：HTTP ${status}。请检查网络后重试。`)
          );
          return;
        }

        const body = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          reject(new TranslationError('MyMemory 响应解析失败。'));
        }
      });
    });

    request.setTimeout(opts.timeoutMs ?? MY_MEMORY_TIMEOUT_MS, () => {
      request.destroy(new Error('timeout'));
    });

    request.on('error', (error: Error) => {
      const message =
        error.message === 'timeout'
          ? 'MyMemory 请求超时。请检查网络后重试。'
          : 'MyMemory 请求失败。请检查网络后重试。';
      reject(new TranslationError(message));
    });
  });
}
