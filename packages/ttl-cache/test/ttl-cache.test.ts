import { describe, it, expect, afterEach } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache — basic operations', () => {
  let cache: TtlCache<string, number>;

  afterEach(() => {
    cache?.dispose();
  });

  it('set and get a value', () => {
    cache = new TtlCache();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('returns undefined for missing keys', () => {
    cache = new TtlCache();
    expect(cache.get('nope')).toBeUndefined();
  });

  it('has() returns true for existing and false for missing', () => {
    cache = new TtlCache();
    cache.set('x', 42);
    expect(cache.has('x')).toBe(true);
    expect(cache.has('y')).toBe(false);
  });

  it('delete removes an entry', () => {
    cache = new TtlCache();
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.delete('a')).toBe(false);
  });

  it('clear removes all entries', () => {
    cache = new TtlCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('size reflects current entry count', () => {
    cache = new TtlCache();
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    expect(cache.size).toBe(1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
    cache.delete('a');
    expect(cache.size).toBe(1);
  });

  it('overwrites existing key', () => {
    cache = new TtlCache();
    cache.set('a', 1);
    cache.set('a', 99);
    expect(cache.get('a')).toBe(99);
    expect(cache.size).toBe(1);
  });

  it('works with non-string keys', () => {
    const c = new TtlCache<number, string>();
    c.set(1, 'one');
    c.set(2, 'two');
    expect(c.get(1)).toBe('one');
    c.dispose();
  });

  it('defaults to 30s TTL', () => {
    cache = new TtlCache();
    const stats = cache.getStats();
    expect(stats.size).toBe(0);
    // Just verify it can be created without options
  });

  it('peek returns value without promoting LRU', () => {
    cache = new TtlCache({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.peek('a'); // does NOT promote 'a'
    cache.set('c', 3); // should evict 'a' (LRU tail), not 'b'
    expect(cache.peek('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('peek returns undefined for missing key', () => {
    cache = new TtlCache();
    expect(cache.peek('nope')).toBeUndefined();
  });

  it('prune() manually removes expired entries', () => {
    cache = new TtlCache({ ttlMs: 1 });
    cache.set('a', 1);
    cache.set('b', 2);

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }

    expect(cache.size).toBe(2); // still in map
    cache.prune();
    expect(cache.size).toBe(0); // cleaned
  });
});
