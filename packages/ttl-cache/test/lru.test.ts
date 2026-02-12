import { describe, it, expect, vi } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache — LRU eviction', () => {
  it('evicts least recently used when maxSize exceeded', () => {
    const cache = new TtlCache<string, number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
    cache.dispose();
  });

  it('get() promotes entry to MRU', () => {
    const cache = new TtlCache<string, number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // promote 'a'
    cache.set('c', 3); // should evict 'b' (LRU)

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    cache.dispose();
  });

  it('set() on existing key promotes to MRU', () => {
    const cache = new TtlCache<string, number>({ maxSize: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // update and promote 'a'
    cache.set('c', 3); // should evict 'b'

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
    cache.dispose();
  });

  it('calls onEvict with reason "evicted"', () => {
    const onEvict = vi.fn();
    const cache = new TtlCache<string, number>({ maxSize: 1, onEvict });
    cache.set('a', 1);
    cache.set('b', 2);

    expect(onEvict).toHaveBeenCalledWith('a', 1, 'evicted');
    cache.dispose();
  });

  it('onEvict receives "manual" for delete()', () => {
    const onEvict = vi.fn();
    const cache = new TtlCache<string, number>({ onEvict });
    cache.set('a', 1);
    cache.delete('a');
    expect(onEvict).toHaveBeenCalledWith('a', 1, 'manual');
    cache.dispose();
  });

  it('onEvict receives "clear" for clear()', () => {
    const onEvict = vi.fn();
    const cache = new TtlCache<string, number>({ onEvict });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(onEvict).toHaveBeenCalledTimes(2);
    expect(onEvict).toHaveBeenCalledWith('a', 1, 'clear');
    expect(onEvict).toHaveBeenCalledWith('b', 2, 'clear');
    cache.dispose();
  });
});
