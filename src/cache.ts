import { createHash } from 'node:crypto';

export class LruCache<V> {
  private readonly store = new Map<string, V>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('capacity must be a positive integer');
    }
  }

  get(key: string): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, value);
    while (this.store.size > this.capacity) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.store.delete(oldest);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export interface CacheKeyParts {
  provider: string;
  prompt: string;
  sourceLanguage: string;
  text: string;
}

export function makeCacheKey(parts: CacheKeyParts): string {
  const hash = (value: string): string => createHash('sha1').update(value).digest('hex');
  return [parts.provider, hash(parts.prompt), parts.sourceLanguage, hash(parts.text)].join('|');
}
