import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT,
  renderPrompt,
  TEXT_PLACEHOLDER,
  validatePrompt
} from './prompt';

describe('validatePrompt', () => {
  it('accepts a template that contains {text}', () => {
    expect(validatePrompt('翻译：{text}')).toBeUndefined();
  });

  it('rejects a template without {text}', () => {
    const error = validatePrompt('请把文本翻译成中文');
    expect(error).toBeDefined();
    expect(error).toContain('{text}');
  });
});

describe('renderPrompt', () => {
  it('replaces all placeholders, including repeated {text}', () => {
    const rendered = renderPrompt('A {text} B {sourceLanguage} C {targetLanguage} D {text}', {
      text: 'hello\nworld',
      sourceLanguage: 'ja'
    });
    expect(rendered).toBe('A hello\nworld B ja C 简体中文 D hello\nworld');
  });

  it('replaces {targetLanguage} with the fixed Chinese label', () => {
    expect(renderPrompt('{targetLanguage}', { text: 'x', sourceLanguage: 'en' })).toBe('简体中文');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(renderPrompt('hi {unknown} {text}', { text: 'x', sourceLanguage: 'en' })).toBe(
      'hi {unknown} x'
    );
  });
});

describe('DEFAULT_PROMPT', () => {
  it('is valid and contains the text placeholder', () => {
    expect(validatePrompt(DEFAULT_PROMPT)).toBeUndefined();
    expect(DEFAULT_PROMPT).toContain(TEXT_PLACEHOLDER);
  });
});
