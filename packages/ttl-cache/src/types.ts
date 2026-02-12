export interface CacheOptions<K, V> {
  /** Default TTL in milliseconds for all entries. Default: 30000 (30s). */
  ttlMs?: number;
  /** Maximum number of entries. Oldest (LRU) entries are evicted when exceeded. */
  maxSize?: number;
  /** Callback invoked when an entry is removed from the cache. */
  onEvict?: (key: K, value: V, reason: EvictReason) => void;
  /**
   * Interval in ms between periodic cleanup sweeps.
   * Default: `false` (disabled — expiration is lazy + manual via `prune()`).
   * If enabled, the timer is `unref()`'d in Node.js so it won't keep the process alive.
   */
  cleanupIntervalMs?: number | false;
}

export interface SetOptions {
  /** TTL in milliseconds for this specific entry. Overrides the default. */
  ttlMs?: number;
}

export interface GetOrSetOptions {
  /** TTL in milliseconds for the entry when populated by the loader. */
  ttlMs?: number;
  /**
   * Stale-while-revalidate window in ms.
   * After `ttlMs` expires, the stale value is still served for up to `swrMs`
   * while a background refresh runs.
   *
   * Timeline: `|--- fresh (ttlMs) ---|--- stale (swrMs) ---|--- expired ---|`
   */
  swrMs?: number;
  /** Whether to deduplicate concurrent calls for the same key. Default: `true`. */
  dedupe?: boolean;
  /** AbortSignal to cancel this caller's wait (does not cancel the loader for other waiters). */
  signal?: AbortSignal;
}

export type EvictReason = 'expired' | 'evicted' | 'manual' | 'clear';

export interface CacheStats {
  hits: number;
  misses: number;
  stale: number;
  loads: number;
  evictions: number;
  size: number;
}

export type CacheEvent = 'hit' | 'miss' | 'set' | 'evict' | 'load' | 'stale';

export type CacheEventHandler<K = unknown, V = unknown> = (
  key: K,
  value?: V,
) => void;
