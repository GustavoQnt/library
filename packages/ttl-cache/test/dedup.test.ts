import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache — Request deduplication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('concurrent calls share the same promise (dedupe on by default)', async () => {
    const cache = new TtlCache<string, string>();
    let resolveLoader!: (v: string) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<string>((r) => { resolveLoader = r; }),
    );

    const p1 = cache.getOrSet('k', loader);
    const p2 = cache.getOrSet('k', loader);
    const p3 = cache.getOrSet('k', loader);

    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader('result');
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    cache.dispose();
  });

  it('dedupe can be disabled per call', async () => {
    const cache = new TtlCache<string, string>({ ttlMs: 100 });
    let callCount = 0;
    const loader = vi.fn().mockImplementation(async () => `v${++callCount}`);

    const p1 = cache.getOrSet('k', loader, { dedupe: false });
    const p2 = cache.getOrSet('k', loader, { dedupe: false });

    const [r1, r2] = await Promise.all([p1, p2]);
    // Both called the loader independently (no dedup)
    expect(loader).toHaveBeenCalledTimes(2);
    // Both get a value (second call overwrites in cache)
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    cache.dispose();
  });

  it('inflight map is cleaned after resolve', async () => {
    const cache = new TtlCache<string, string>();
    const loader = vi.fn().mockResolvedValue('v');

    await cache.getOrSet('k', loader);
    // Second call hits cache, no new loader call
    const v = await cache.getOrSet('k', loader);
    expect(v).toBe('v');
    expect(loader).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it('propagates errors to all waiters', async () => {
    const cache = new TtlCache<string, string>();
    const error = new Error('load failed');
    let rejectLoader!: (e: Error) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<string>((_, rej) => { rejectLoader = rej; }),
    );

    const p1 = cache.getOrSet('k', loader);
    const p2 = cache.getOrSet('k', loader);

    rejectLoader(error);

    await expect(p1).rejects.toThrow('load failed');
    await expect(p2).rejects.toThrow('load failed');
    expect(loader).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it('cleans inflight after rejection so retry works', async () => {
    const cache = new TtlCache<string, string>();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    await expect(cache.getOrSet('k', loader)).rejects.toThrow('fail');
    const v = await cache.getOrSet('k', loader);
    expect(v).toBe('ok');
    expect(loader).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it('AbortSignal cancels individual waiter without affecting others', async () => {
    const cache = new TtlCache<string, string>();
    let resolveLoader!: (v: string) => void;
    const loader = vi.fn().mockReturnValue(
      new Promise<string>((r) => { resolveLoader = r; }),
    );

    const ac = new AbortController();
    const p1 = cache.getOrSet('k', loader, { signal: ac.signal });
    const p2 = cache.getOrSet('k', loader); // no signal

    ac.abort();

    await expect(p1).rejects.toThrow();

    // p2 should still resolve when loader completes
    resolveLoader('result');
    expect(await p2).toBe('result');
    cache.dispose();
  });

  it('already-aborted signal rejects immediately', async () => {
    const cache = new TtlCache<string, string>();
    const ac = new AbortController();
    ac.abort();

    await expect(
      cache.getOrSet('k', () => 'v', { signal: ac.signal }),
    ).rejects.toThrow();
    cache.dispose();
  });
});
