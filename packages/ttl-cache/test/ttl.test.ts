import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache — TTL expiration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('entries expire after ttlMs (default 30s)', () => {
    const cache = new TtlCache<string, number>();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);

    vi.advanceTimersByTime(30_001);
    expect(cache.get('a')).toBeUndefined();
    cache.dispose();
  });

  it('respects custom ttlMs in constructor', () => {
    const cache = new TtlCache<string, number>({ ttlMs: 100 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);

    vi.advanceTimersByTime(101);
    expect(cache.get('a')).toBeUndefined();
    cache.dispose();
  });

  it('per-key ttlMs overrides default', () => {
    const cache = new TtlCache<string, number>({ ttlMs: 100 });
    cache.set('short', 1);
    cache.set('long', 2, { ttlMs: 500 });

    vi.advanceTimersByTime(150);
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe(2);
    cache.dispose();
  });

  it('has() returns false for expired entries', () => {
    const cache = new TtlCache<string, number>({ ttlMs: 50 });
    cache.set('a', 1);
    vi.advanceTimersByTime(51);
    expect(cache.has('a')).toBe(false);
    cache.dispose();
  });

  it('lazy cleanup removes expired entry on access', () => {
    const onEvict = vi.fn();
    const cache = new TtlCache<string, number>({ ttlMs: 50, onEvict });
    cache.set('a', 1);
    vi.advanceTimersByTime(51);
    cache.get('a'); // triggers lazy cleanup
    expect(onEvict).toHaveBeenCalledWith('a', 1, 'expired');
    cache.dispose();
  });

  it('periodic sweep cleans expired entries when enabled', () => {
    const onEvict = vi.fn();
    const cache = new TtlCache<string, number>({
      ttlMs: 50,
      onEvict,
      cleanupIntervalMs: 100,
    });
    cache.set('a', 1);
    cache.set('b', 2);

    vi.advanceTimersByTime(60); // entries expired but no access
    expect(cache.size).toBe(2); // not yet cleaned

    vi.advanceTimersByTime(50); // total 110ms, sweep fires
    expect(cache.size).toBe(0);
    expect(onEvict).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it('cleanup is disabled by default (no periodic sweep)', () => {
    const onEvict = vi.fn();
    const cache = new TtlCache<string, number>({ ttlMs: 50, onEvict });
    cache.set('a', 1);

    vi.advanceTimersByTime(999_999);
    // Without periodic sweep, entry is still in map until accessed
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBeUndefined(); // lazy cleanup
    expect(cache.size).toBe(0);
    cache.dispose();
  });
});
