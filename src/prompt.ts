import { TARGET_LANGUAGE_LABEL } from './constants';

export const TEXT_PLACEHOLDER = '{text}';
export const SOURCE_LANGUAGE_PLACEHOLDER = '{sourceLanguage}';
export const TARGET_LANGUAGE_PLACEHOLDER = '{targetLanguage}';

export const DEFAULT_PROMPT = [
  '你是一名专业翻译。请将下面的文本翻译成{targetLanguage}，直接输出译文，不要添加任何解释或注释。',
  '源语言提示：{sourceLanguage}',
  '',
  '待翻译文本：',
  '{text}'
].join('\n');

export interface PromptValues {
  text: string;
  sourceLanguage: string;
}

export function validatePrompt(template: string): string | undefined {
  if (!template.includes(TEXT_PLACEHOLDER)) {
    return '自定义提示词必须包含 {text} 占位符（用于插入选中的文本）。';
  }
  return undefined;
}

export function renderPrompt(template: string, values: PromptValues): string {
  return template
    .replaceAll(TEXT_PLACEHOLDER, values.text)
    .replaceAll(SOURCE_LANGUAGE_PLACEHOLDER, values.sourceLanguage)
    .replaceAll(TARGET_LANGUAGE_PLACEHOLDER, TARGET_LANGUAGE_LABEL);
}
