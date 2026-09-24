import { describe, expect, it } from 'vitest';
import { LruCache, makeCacheKey } from './cache';

describe('LruCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts the least recently used entry when capacity is exceeded', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('refreshes recency on read', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('refreshes recency on update of an existing key', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);
    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
  });

  it('clears all entries', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('rejects invalid capacity', () => {
    expect(() => new LruCache<number>(0)).toThrow();
  });
});

describe('makeCacheKey', () => {
  const base = { provider: 'LLM · m', prompt: 'p {text}', sourceLanguage: 'en' };

  it('is deterministic', () => {
    expect(makeCacheKey({ ...base, text: 'hello' })).toBe(makeCacheKey({ ...base, text: 'hello' }));
  });

  it('differs per text', () => {
    expect(makeCacheKey({ ...base, text: 'hello' })).not.toBe(makeCacheKey({ ...base, text: 'hi' }));
  });

  it('differs per provider, prompt and source language', () => {
    expect(makeCacheKey({ ...base, text: 't' })).not.toBe(
      makeCacheKey({ ...base, provider: 'MyMemory', text: 't' })
    );
    expect(makeCacheKey({ ...base, text: 't' })).not.toBe(
      makeCacheKey({ ...base, prompt: 'other {text}', text: 't' })
    );
    expect(makeCacheKey({ ...base, text: 't' })).not.toBe(
      makeCacheKey({ ...base, sourceLanguage: 'ja', text: 't' })
    );
  });
});
