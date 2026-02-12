import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache — Iteration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Symbol.iterator yields all fresh entries', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    const entries = [...cache];
    expect(entries).toEqual([['a', 1], ['b', 2], ['c', 3]]);
    cache.dispose();
  });

  it('keys() yields keys', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    cache.set('b', 2);
    expect([...cache.keys()]).toEqual(['a', 'b']);
    cache.dispose();
  });

  it('values() yields values', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    cache.set('b', 2);
    expect([...cache.values()]).toEqual([1, 2]);
    cache.dispose();
  });

  it('entries() yields [key, value] pairs', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    expect([...cache.entries()]).toEqual([['a', 1]]);
    cache.dispose();
  });

  it('skips expired entries and prunes them lazily', () => {
    const onEvict = vi.fn();
    const cache = new TtlCache<string, number>({ ttlMs: 100, onEvict });
    cache.set('a', 1);
    cache.set('b', 2, { ttlMs: 500 });

    vi.advanceTimersByTime(150);
    const entries = [...cache];
    expect(entries).toEqual([['b', 2]]);

    // 'a' was pruned during iteration
    expect(onEvict).toHaveBeenCalledWith('a', 1, 'expired');
    expect(cache.size).toBe(1);
    cache.dispose();
  });

  it('does not yield stale entries (only fresh)', async () => {
    const cache = new TtlCache<string, string>();
    await cache.getOrSet('k', () => 'v', { ttlMs: 1000, swrMs: 200 });

    // Move past TTL into SWR window
    vi.advanceTimersByTime(1050);

    // Stale entries should NOT appear in iteration
    const entries = [...cache];
    expect(entries).toEqual([]);
    cache.dispose();
  });

  it('empty cache yields nothing', () => {
    const cache = new TtlCache<string, number>();
    expect([...cache]).toEqual([]);
    cache.dispose();
  });
});
