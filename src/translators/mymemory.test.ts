import { describe, expect, it } from 'vitest';
import { MY_MEMORY_MAX_BYTES } from '../constants';
import {
  assertWithinLimit,
  buildMyMemoryUrl,
  MyMemoryResponse,
  parseMyMemoryResponse
} from './mymemory';

describe('buildMyMemoryUrl', () => {
  it('sets q, langpair and omits de when email is empty', () => {
    const url = buildMyMemoryUrl('hello world', 'en', '');
    expect(url.searchParams.get('q')).toBe('hello world');
    expect(url.searchParams.get('langpair')).toBe('en|zh-CN');
    expect(url.searchParams.get('de')).toBeNull();
  });

  it('sets de when contact email is provided', () => {
    const url = buildMyMemoryUrl('hello', 'ja', 'a@b.com');
    expect(url.searchParams.get('de')).toBe('a@b.com');
    expect(url.searchParams.get('langpair')).toBe('ja|zh-CN');
  });
});

describe('assertWithinLimit', () => {
  it('accepts text up to the byte limit', () => {
    expect(() => assertWithinLimit('a'.repeat(MY_MEMORY_MAX_BYTES))).not.toThrow();
  });

  it('rejects text above the byte limit (ASCII)', () => {
    expect(() => assertWithinLimit('a'.repeat(MY_MEMORY_MAX_BYTES + 1))).toThrow(/500 字节/);
  });

  it('counts UTF-8 bytes, not characters (Chinese text)', () => {
    // 166 CJK chars = 498 bytes (ok), 167 = 501 bytes (over)
    expect(() => assertWithinLimit('中'.repeat(166))).not.toThrow();
    expect(() => assertWithinLimit('中'.repeat(167))).toThrow(/500 字节/);
  });
});

describe('parseMyMemoryResponse', () => {
  it('returns the trimmed translated text on success', () => {
    const response: MyMemoryResponse = {
      responseStatus: 200,
      responseData: { translatedText: '  你好  ' }
    };
    expect(parseMyMemoryResponse(response)).toBe('你好');
  });

  it('reports quota exhaustion', () => {
    const response: MyMemoryResponse = { responseStatus: 200, quotaFinished: true };
    expect(() => parseMyMemoryResponse(response)).toThrow(/配额/);
  });

  it('surfaces responseDetails when the status is not 200', () => {
    const response: MyMemoryResponse = {
      responseStatus: 403,
      responseDetails: 'q parameter exceeds limit'
    };
    expect(() => parseMyMemoryResponse(response)).toThrow(/q parameter exceeds limit/);
  });

  it('reports a generic error when there is no details or text', () => {
    const response: MyMemoryResponse = { responseStatus: 400 };
    expect(() => parseMyMemoryResponse(response)).toThrow(/未返回译文/);
  });
});
