import { describe, it, expect, vi } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache — Events', () => {
  it('emits "set" on set()', () => {
    const cache = new TtlCache<string, number>();
    const handler = vi.fn();
    cache.on('set', handler);

    cache.set('a', 1);
    expect(handler).toHaveBeenCalledWith('a', 1);
    cache.dispose();
  });

  it('emits "hit" on cache hit', () => {
    const cache = new TtlCache<string, number>();
    const handler = vi.fn();
    cache.on('hit', handler);

    cache.set('a', 1);
    cache.get('a');
    expect(handler).toHaveBeenCalledWith('a', 1);
    cache.dispose();
  });

  it('emits "miss" on cache miss', () => {
    const cache = new TtlCache<string, number>();
    const handler = vi.fn();
    cache.on('miss', handler);

    cache.get('nope');
    expect(handler).toHaveBeenCalledWith('nope', undefined);
    cache.dispose();
  });

  it('emits "evict" on eviction and delete', () => {
    const cache = new TtlCache<string, number>({ maxSize: 1 });
    const handler = vi.fn();
    cache.on('evict', handler);

    cache.set('a', 1);
    cache.set('b', 2); // evicts 'a'
    expect(handler).toHaveBeenCalledWith('a', 1);

    cache.delete('b');
    expect(handler).toHaveBeenCalledWith('b', 2);
    cache.dispose();
  });

  it('emits "load" when getOrSet loader completes', async () => {
    const cache = new TtlCache<string, number>();
    const handler = vi.fn();
    cache.on('load', handler);

    await cache.getOrSet('a', () => 42);
    expect(handler).toHaveBeenCalledWith('a', 42);
    cache.dispose();
  });

  it('off() removes a listener', () => {
    const cache = new TtlCache<string, number>();
    const handler = vi.fn();
    cache.on('set', handler);
    cache.off('set', handler);

    cache.set('a', 1);
    expect(handler).not.toHaveBeenCalled();
    cache.dispose();
  });

  it('multiple listeners on same event', () => {
    const cache = new TtlCache<string, number>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    cache.on('set', h1);
    cache.on('set', h2);

    cache.set('a', 1);
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    cache.dispose();
  });
});
