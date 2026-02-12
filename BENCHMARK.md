# Benchmarks — @GustavoQnt/ttl-cache

Performance benchmarks for `@GustavoQnt/ttl-cache`, powered by [Vitest Bench](https://vitest.dev/api/#bench).

---

## Running Benchmarks

### Prerequisites

- Node.js 18+
- pnpm installed
- Dependencies installed (`pnpm install`)

### Quick Run (single pass)

```bash
cd packages/ttl-cache
pnpm bench
```

Or from the monorepo root:

```bash
pnpm -F @GustavoQnt/ttl-cache bench
```

### Watch Mode (re-runs on file change)

```bash
cd packages/ttl-cache
pnpm bench:watch
```

### Run a Specific Benchmark

```bash
npx vitest bench packages/ttl-cache/test/performance.bench.ts -t "set 10k"
```

---

## Benchmark Suite

All benchmarks use explicit configuration to isolate pure cache performance:

```typescript
{ ttlMs: 60_000, cleanupIntervalMs: false }
```

No background timers, no noise from periodic cleanup.

### Core Operations

| Benchmark | What it measures |
|-----------|-----------------|
| **set 10k entries** | Raw `set()` throughput — populates 10,000 entries into a bounded cache |
| **get 10k entries (all hits)** | Raw `get()` throughput — 10,000 lookups with 100% cache hits |
| **set + get mixed (10k ops)** | Realistic mixed workload — alternating 5k sets and 5k gets |
| **LRU eviction (20k → 10k)** | Eviction overhead — inserts 20,000 entries into a cache with `maxSize: 10,000`, forcing 10,000 LRU evictions |

### Differential Features

These benchmarks highlight what sets `@GustavoQnt/ttl-cache` apart from alternatives:

| Benchmark | What it measures |
|-----------|-----------------|
| **Dedup: 100 concurrent `getOrSet`** | 100 concurrent calls to the same key — only 1 loader executes. Measures deduplication overhead and promise sharing. |
| **SWR: serve stale immediately** | After TTL expires but within the SWR window, `getOrSet` returns the stale value **instantly** while triggering a background refresh. The loader (50ms simulated I/O) does not block the response. |

### Stress Tests

| Benchmark | What it measures |
|-----------|-----------------|
| **set 100k entries** | Large-scale write throughput (100,000 entries) |
| **get 100k entries (all hits)** | Large-scale read throughput (100,000 lookups) |

> **Note:** Stress tests may show higher RME (relative margin of error) due to GC pressure at scale. This is expected.

---

## Sample Results

Results from Node.js v22 on a consumer machine (indicative, not authoritative):

```
 ✓ TtlCache benchmarks (5s)
     name                                         hz      min      max     mean      p75      p99     rme    samples
   · set 10k entries                          703.21   0.9800   4.3700   1.4221   1.5800   3.3200  ±3.89%      352
   · get 10k entries (all hits)               445.86   1.6200   5.1500   2.2429   2.3600   4.3900  ±3.32%      223
   · set + get mixed (10k ops)                934.67   0.7400   8.8700   1.0699   1.0500   3.3100  ±5.09%      469
   · LRU eviction (set 20k into maxSize 10k)  244.90   2.5700   7.7500   4.0833   4.3800   7.5200  ±4.87%      123
   · getOrSet with dedup (100 concurrent)       97.12   …
   · getOrSet SWR (serve stale immediately)     51.33   …
   · set 100k entries                           71.45   …
   · get 100k entries (all hits)                44.82   …
```

### Key Takeaways

- **`set` is ~1.4μs per entry** (703 hz × 10k entries → ~14ms per batch → ~1.4μs each)
- **`get` is ~2.2μs per entry** with LRU promotion on every access
- **LRU eviction adds ~2.7μs overhead per evicted entry** vs plain set
- **Dedup** shares a single loader across 100 concurrent callers with minimal overhead
- **SWR** returns stale values in <1ms, even when the background loader takes 50ms+

---

## Understanding the Output

### Columns

| Column | Meaning |
|--------|---------|
| **hz** | Operations per second (higher = better). Each "operation" is the full benchmark body (e.g., 10k sets). |
| **min / max** | Fastest and slowest iteration in milliseconds |
| **mean** | Average time per iteration |
| **p75 / p99** | 75th and 99th percentile latencies |
| **rme** | Relative Margin of Error — how much results vary between runs. Below ±5% is good; above ±10% suggests noisy environment. |
| **samples** | Number of iterations Vitest ran |

### Interpreting Hz

`hz` measures **batches** per second, not individual operations. To get per-entry cost:

```
Per-entry time = 1,000,000 / (hz × entries_per_batch) μs

Example: set 10k at 703 hz
→ 1,000,000 / (703 × 10,000) = 0.14 μs per set
```

---

## Reducing Noise

For more stable results:

1. **Close other applications** — CPU scheduling affects microbenchmarks
2. **Run multiple times** — compare across runs, not within a single run
3. **Increase iterations** in `vitest.config.ts`:
   ```typescript
   export default defineConfig({
     test: {
       benchmark: {
         iterations: 200,
       },
     },
   });
   ```
4. **Use a stable environment** — VMs and containers add variance

If `rme > 10%`, the result is unreliable. Increase samples or reduce system load.

---

## Comparing with Other Libraries

To benchmark against `lru-cache` or `node-cache`:

### 1. Install the comparison library

```bash
npm install lru-cache
```

### 2. Create a comparison benchmark

Create `test/comparison.bench.ts`:

```typescript
import { bench, describe } from 'vitest';
import { LRUCache } from 'lru-cache';
import { TtlCache } from '../src/index.js';

describe('set 10k entries', () => {
  bench('@GustavoQnt/ttl-cache', () => {
    const cache = new TtlCache<number, number>({
      maxSize: 10_000,
      ttlMs: 60_000,
      cleanupIntervalMs: false,
    });
    for (let i = 0; i < 10_000; i++) cache.set(i, i);
  });

  bench('lru-cache', () => {
    const cache = new LRUCache<number, number>({ max: 10_000 });
    for (let i = 0; i < 10_000; i++) cache.set(i, i);
  });
});

describe('get 10k entries (all hits)', () => {
  const ttlCache = new TtlCache<number, number>({
    maxSize: 10_000,
    ttlMs: 60_000,
    cleanupIntervalMs: false,
  });
  const lruCache = new LRUCache<number, number>({ max: 10_000 });

  for (let i = 0; i < 10_000; i++) {
    ttlCache.set(i, i);
    lruCache.set(i, i);
  }

  bench('@GustavoQnt/ttl-cache', () => {
    for (let i = 0; i < 10_000; i++) ttlCache.get(i);
  });

  bench('lru-cache', () => {
    for (let i = 0; i < 10_000; i++) lruCache.get(i);
  });
});
```

### 3. Run

```bash
pnpm bench
```

Vitest will display both libraries side-by-side within each `describe` group.

> **Fair comparison note:** `lru-cache` does not have SWR or dedup, so those benchmarks are exclusive to `@GustavoQnt/ttl-cache`. For core set/get/eviction, `lru-cache` may be faster — it's a mature, highly optimized library. The value of `@GustavoQnt/ttl-cache` is in the **feature combination**, not raw throughput.

---

## Benchmark Configuration

Benchmarks live in `test/performance.bench.ts`. Key design choices:

- **`cleanupIntervalMs: false`** — No background timer noise
- **`ttlMs: 60_000`** — Long TTL so entries don't expire during benchmarks
- **No `dispose()` calls** — Not needed when timers are disabled
- **Setup inside bench body** for core ops — measures total throughput including cache creation (realistic for short-lived caches)
- **Setup outside bench body** for get-only benchmarks in comparisons — isolates read performance

See [Vitest Benchmark API](https://vitest.dev/api/#bench) for configuration options.
