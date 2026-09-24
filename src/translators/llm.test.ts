import { describe, expect, it } from 'vitest';
import {
  buildChatCompletionsBody,
  buildChatCompletionsUrl,
  extractTranslation,
  mapHttpError
} from './llm';

describe('buildChatCompletionsUrl', () => {
  it('appends /chat/completions and strips trailing slashes', () => {
    expect(buildChatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
    expect(buildChatCompletionsUrl('http://localhost:11434/v1///')).toBe(
      'http://localhost:11434/v1/chat/completions'
    );
  });

  it('rejects non-URL and non-http(s) values', () => {
    expect(() => buildChatCompletionsUrl('not a url')).toThrow(/baseUrl/);
    expect(() => buildChatCompletionsUrl('ftp://example.com/v1')).toThrow(/http/);
  });
});

describe('buildChatCompletionsBody', () => {
  it('builds a non-streaming chat completion request', () => {
    const body = buildChatCompletionsBody('gpt-4o-mini', 'translate this');
    expect(body).toEqual({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      stream: false,
      messages: [{ role: 'user', content: 'translate this' }]
    });
  });
});

describe('extractTranslation', () => {
  it('returns the trimmed content of the first choice', () => {
    const data = { choices: [{ message: { content: '  你好  ' } }] };
    expect(extractTranslation(data)).toBe('你好');
  });

  it('throws when content is missing or not a string', () => {
    expect(() => extractTranslation(undefined)).toThrow(/没有返回译文/);
    expect(() => extractTranslation({ choices: [] })).toThrow(/没有返回译文/);
    expect(() => extractTranslation({ choices: [{ message: { content: null } }] })).toThrow(
      /没有返回译文/
    );
  });
});

describe('mapHttpError', () => {
  it('extracts error.message from an OpenAI-style JSON body', () => {
    const error = mapHttpError(401, JSON.stringify({ error: { message: 'Invalid API key' } }));
    expect(error.message).toContain('Invalid API key');
  });

  it('extracts a string error field', () => {
    const error = mapHttpError(500, JSON.stringify({ error: 'internal boom' }));
    expect(error.message).toContain('internal boom');
  });

  it('falls back to the HTTP status for non-JSON bodies', () => {
    const error = mapHttpError(502, '<html>Bad Gateway</html>');
    expect(error.message).toContain('HTTP 502');
  });
});
