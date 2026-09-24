import * as vscode from 'vscode';
import {
  DEFAULT_API_KEY_ENV_VAR,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_SECONDS
} from './constants';
import { DEFAULT_PROMPT } from './prompt';

export type ProviderChoice = 'auto' | 'llm' | 'mymemory';

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyEnvVar: string;
  prompt: string;
  timeoutMs: number;
}

export interface MyMemoryConfig {
  contactEmail: string;
}

export interface TranslatorConfig {
  provider: ProviderChoice;
  sourceLanguage: string;
  llm: LlmConfig;
  myMemory: MyMemoryConfig;
}

function getString(config: vscode.WorkspaceConfiguration, key: string, fallback: string): string {
  const value = config.get<string>(key);
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

export function loadConfig(): TranslatorConfig {
  const config = vscode.workspace.getConfiguration('selectionTranslator');

  const providerRaw = config.get<string>('provider') ?? 'auto';
  const provider: ProviderChoice =
    providerRaw === 'llm' || providerRaw === 'mymemory' ? providerRaw : 'auto';

  const baseUrl = getString(config, 'llm.baseUrl', DEFAULT_BASE_URL);
  const model = getString(config, 'llm.model', DEFAULT_MODEL);
  const apiKeySetting = (config.get<string>('llm.apiKey') ?? '').trim();
  const apiKeyEnvVar = getString(config, 'llm.apiKeyEnvVar', DEFAULT_API_KEY_ENV_VAR);
  const apiKey = apiKeySetting || (process.env[apiKeyEnvVar] ?? '').trim();
  const prompt = getString(config, 'llm.prompt', DEFAULT_PROMPT);

  const timeoutSeconds = config.get<number>('llm.timeoutSeconds');
  const timeoutMs =
    typeof timeoutSeconds === 'number' && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
      ? timeoutSeconds * 1000
      : DEFAULT_TIMEOUT_SECONDS * 1000;

  return {
    provider,
    sourceLanguage: getString(config, 'sourceLanguage', 'en'),
    llm: { baseUrl, model, apiKey, apiKeyEnvVar, prompt, timeoutMs },
    myMemory: { contactEmail: (config.get<string>('contactEmail') ?? '').trim() }
  };
}

export function isLlmConfigured(config: TranslatorConfig): boolean {
  if (config.llm.apiKey) {
    return true;
  }
  // 指向了非 OpenAI 默认地址（如 Ollama、自托管服务）也视为已配置
  return normalizeUrl(config.llm.baseUrl) !== normalizeUrl(DEFAULT_BASE_URL);
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase();
}
