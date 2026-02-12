import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache — Stale-While-Revalidate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns fresh value during fresh window', async () => {
    const cache = new TtlCache<string, string>();
    const loader = vi.fn().mockResolvedValue('value');

    const v1 = await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    expect(v1).toBe('value');
    expect(loader).toHaveBeenCalledTimes(1);

    // Still fresh (within ttlMs)
    vi.advanceTimersByTime(700);
    const v2 = await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    expect(v2).toBe('value');
    expect(loader).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it('returns stale value and refreshes in background (SWR after expiry)', async () => {
    const cache = new TtlCache<string, string>();
    let callCount = 0;
    const loader = vi.fn().mockImplementation(async () => {
      callCount++;
      return `value-${callCount}`;
    });

    // Initial load
    await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    expect(loader).toHaveBeenCalledTimes(1);

    // Move past TTL but within SWR window: now = 1050, expiresAt = 1000, staleUntil = 1200
    vi.advanceTimersByTime(1050);

    // Should return stale value immediately
    const stale = await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    expect(stale).toBe('value-1'); // stale value served

    // Let background refresh complete
    await vi.runAllTimersAsync();

    // Now should have refreshed value
    const fresh = await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    expect(fresh).toBe('value-2');
    expect(loader).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it('emits stale event during SWR window', async () => {
    const cache = new TtlCache<string, string>();
    const handler = vi.fn();
    cache.on('stale', handler);

    await cache.getOrSet('k', () => 'v', { ttlMs: 1000, swrMs: 200 });

    // Move past TTL into SWR window
    vi.advanceTimersByTime(1050);
    await cache.getOrSet('k', () => 'v2', { ttlMs: 1000, swrMs: 200 });

    expect(handler).toHaveBeenCalledWith('k', 'v');
    cache.dispose();
  });

  it('emits load event when loader completes', async () => {
    const cache = new TtlCache<string, string>();
    const handler = vi.fn();
    cache.on('load', handler);

    await cache.getOrSet('k', () => 'v', { ttlMs: 1000 });

    expect(handler).toHaveBeenCalledWith('k', 'v');
    cache.dispose();
  });

  it('swallows background refresh errors silently', async () => {
    const cache = new TtlCache<string, string>();
    let callCount = 0;
    const loader = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('refresh failed');
      return `value-${callCount}`;
    });

    await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });

    // Enter SWR window (after expiry)
    vi.advanceTimersByTime(1050);
    const stale = await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    expect(stale).toBe('value-1');

    // Background refresh throws — should not propagate
    await vi.runAllTimersAsync();

    // Value should be whatever remains — the stale entry may still be there
    // depending on whether refresh error removed it. With SWR, stale entry
    // stays until staleUntil.
    cache.dispose();
  });

  it('loads fresh after full expiration (past SWR window)', async () => {
    const cache = new TtlCache<string, string>();
    let callCount = 0;
    const loader = vi.fn().mockImplementation(async () => `v${++callCount}`);

    await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    // Move past both TTL and SWR window (expiresAt=1000, staleUntil=1200)
    vi.advanceTimersByTime(1300);

    const v = await cache.getOrSet('k', loader, { ttlMs: 1000, swrMs: 200 });
    expect(v).toBe('v2');
    expect(loader).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it('get() does NOT return stale values', async () => {
    const cache = new TtlCache<string, string>();

    await cache.getOrSet('k', () => 'v', { ttlMs: 1000, swrMs: 200 });

    // Move past TTL into SWR window
    vi.advanceTimersByTime(1050);

    // get() should return undefined for stale entry
    expect(cache.get('k')).toBeUndefined();
    cache.dispose();
  });
});
