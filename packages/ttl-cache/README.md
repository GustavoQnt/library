# @gustavoqnt/ttl-cache

[![npm version](https://img.shields.io/npm/v/%40gustavoqnt%2Fttl-cache?style=flat-square)](https://www.npmjs.com/package/@gustavoqnt/ttl-cache)
[![npm downloads](https://img.shields.io/npm/dm/%40gustavoqnt%2Fttl-cache?style=flat-square&color=blue)](https://www.npmjs.com/package/@gustavoqnt/ttl-cache)
[![CI](https://img.shields.io/github/actions/workflow/status/GustavoQnt/library/ci.yml?branch=main&style=flat-square)](https://github.com/GustavoQnt/library/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)

In-memory TTL cache with LRU eviction, stale-while-revalidate (SWR), and request deduplication. TypeScript-first, zero dependencies.

---

## Quick Start

```bash
npm install @gustavoqnt/ttl-cache
```

### Basic usage

```typescript
import { TtlCache } from '@gustavoqnt/ttl-cache';

const cache = new TtlCache<string, User>({
  ttlMs: 60_000,  // 1 minute (default: 30s)
  maxSize: 1_000, // LRU eviction when exceeded
});

cache.set('user:1', { id: 1, name: 'Alice' });
const user = cache.get('user:1'); // User | undefined
```

### Stale-While-Revalidate

```typescript
const user = await cache.getOrSet(
  'user:1',
  () => fetchUserFromDb(1),
  { ttlMs: 60_000, swrMs: 10_000 },
);
```

```
|--- fresh (60s) ---|--- stale/SWR (10s) ---|--- expired ---|
0                 60s                      70s
                   │                        │
                   └─ TTL expires           └─ fully expired
                      serve stale +            call loader,
                      background refresh       wait for result
```

### Request Deduplication

```typescript
// 3 concurrent calls = 1 loader execution
const [a, b, c] = await Promise.all([
  cache.getOrSet('user:1', () => fetchUser(1)),
  cache.getOrSet('user:1', () => fetchUser(1)),
  cache.getOrSet('user:1', () => fetchUser(1)),
]);
```

### AbortSignal Support

```typescript
const controller = new AbortController();

// Cancel this caller's wait without killing the loader for others
const user = await cache.getOrSet(
  'user:1',
  () => fetchUser(1),
  { signal: controller.signal },
);
```

---

## Comparison

| Feature | `@gustavoqnt/ttl-cache` | `lru-cache` | `node-cache` |
|---------|:---:|:---:|:---:|
| TTL | ✅ | ✅ | ✅ |
| LRU eviction | ✅ | ✅ | ❌ |
| Stale-while-revalidate | ✅ | ⚠️ partial | ❌ |
| Request dedup | ✅ | ❌ | ❌ |
| AbortSignal | ✅ | ❌ | ❌ |
| TypeScript-first | ✅ | ✅ | ⚠️ |
| Zero deps | ✅ | ✅ | ✅ |
| ESM + CJS | ✅ | ✅ | CJS only |

---

## API Reference

### `new TtlCache<K, V>(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttlMs` | `number` | `30000` | Default TTL in ms. |
| `maxSize` | `number` | `undefined` | Max entries. LRU eviction when exceeded. |
| `onEvict` | `(key, value, reason) => void` | — | Callback on eviction. Reason: `'expired'` \| `'evicted'` \| `'manual'` \| `'clear'` |
| `cleanupIntervalMs` | `number \| false` | `false` | Periodic sweep interval. Disabled by default — expiration is lazy + manual via `prune()`. |

### Sync Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value, options?)` | `void` | Set a value. Optional per-key `ttlMs`. |
| `get(key)` | `V \| undefined` | Get a value. Returns `undefined` if not fresh. Does **not** serve stale. |
| `peek(key)` | `V \| undefined` | Get without updating LRU order. Returns fresh or stale values. |
| `has(key)` | `boolean` | Check existence (fresh or stale — not fully expired). |
| `delete(key)` | `boolean` | Remove an entry. Returns `true` if found. |
| `clear()` | `void` | Remove all entries. |
| `size` | `number` | Current entry count (including stale). |
| `prune()` | `void` | Manually remove all fully expired entries. |

### Async Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getOrSet(key, loader, options?)` | `Promise<V>` | Get from cache or populate via loader. The only method that serves stale values (SWR). Deduplicates by default. |

#### `GetOrSetOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttlMs` | `number` | constructor `ttlMs` | TTL for this entry. |
| `swrMs` | `number` | `0` | SWR window **after** TTL expires. |
| `dedupe` | `boolean` | `true` | Deduplicate concurrent calls for the same key. |
| `signal` | `AbortSignal` | — | Cancel this caller's wait. Does not cancel the loader for other waiters. |

### Observability

| Method | Description |
|--------|-------------|
| `getStats()` | Returns `{ hits, misses, stale, loads, evictions, size }` |
| `on(event, handler)` | Subscribe to: `'hit'`, `'miss'`, `'set'`, `'evict'`, `'load'`, `'stale'` |
| `off(event, handler)` | Unsubscribe |

### Iteration

```typescript
for (const [key, value] of cache) { /* only fresh entries */ }
for (const key of cache.keys()) { /* ... */ }
for (const value of cache.values()) { /* ... */ }
for (const [key, value] of cache.entries()) { /* ... */ }
```

- Yields only **fresh** entries (not stale, not expired).
- Expired entries are lazily pruned during iteration.

### Cleanup

```typescript
cache.dispose(); // Clears periodic sweep timer (if enabled) and all event listeners
```

---

## Design Decisions

### Why `get()` doesn't return stale values

`get()` is predictable: it returns fresh data or `undefined`. SWR is an **async** concern — it involves background loaders and error handling. That's why SWR is exclusive to `getOrSet()`.

If you need to read a value without caring about freshness, use `peek()`.

### Why cleanup is disabled by default

Automatic timers in libraries are controversial — they can keep the process alive unexpectedly. By default, expiration is **lazy** (cleaned on access) and **manual** (via `prune()`).

If you want periodic cleanup, enable it explicitly:

```typescript
const cache = new TtlCache({
  cleanupIntervalMs: 60_000, // sweep every 60s
});
// Timer is unref()'d in Node.js — won't keep the process alive
```

### SWR window is **after** TTL

The mental model is intuitive:

```
|--- fresh (ttlMs) ---|--- stale/SWR (swrMs) ---|--- expired ---|
```

TTL expires → stale window opens → fully expired. This matches the HTTP `stale-while-revalidate` semantics.

---

## Use Cases

- **Database query caching** — Cache expensive queries with TTL and SWR for near-zero latency reads
- **API response caching** — Deduplicate concurrent requests to the same upstream endpoint
- **Configuration caching** — Long TTL + SWR for hot-reload without downtime
- **Rate limit friendly** — Dedup prevents thundering herd when multiple consumers request the same resource

---

## Performance

Local benchmarks (Node.js v22, indicative):

| Operation | Throughput | Notes |
|-----------|------------|-------|
| `set` 10k entries | 703 ops/s | ~1.4ms per batch |
| `get` 10k entries (100% hit) | 445 ops/s | ~2.2ms per batch |
| LRU eviction (20k→10k) | 244 ops/s | ~4.1ms per batch |
| **Dedup**: 100 concurrent `getOrSet` | 97 ops/s | 1 loader execution shared |
| **SWR**: serve stale immediately | 51 ops/s | No blocking on loader |

Run benchmarks yourself:
```bash
pnpm bench
```

See [BENCHMARK.md](./BENCHMARK.md) for detailed instructions.

---

## Gotchas

- **Memory**: No built-in memory-size limit — use `maxSize` to bound entry count
- **Dispose**: Always call `dispose()` if you enabled `cleanupIntervalMs`
- **SWR errors**: Background refresh errors are silently swallowed; the stale value stays until fully expired
- **Dedup errors**: If a loader throws, the error propagates to **all** concurrent waiters
- **AbortSignal**: Aborting cancels the **caller's wait**, not the loader execution (other waiters and the cache still benefit from the load)

---

## License

MIT

