import { bench, describe } from 'vitest';
import { TtlCache } from '../src/index.js';

describe('TtlCache benchmarks', () => {
  // ─── Core Operations ───────────────────────────────────────

  bench('set 10k entries', () => {
    const cache = new TtlCache<number, number>({
      maxSize: 10_000,
      ttlMs: 60_000,
      cleanupIntervalMs: false, // sem timer
    });
    for (let i = 0; i < 10_000; i++) {
      cache.set(i, i);
    }
    // dispose() não necessário (sem timer)
  });

  bench('get 10k entries (all hits)', () => {
    const cache = new TtlCache<number, number>({
      maxSize: 10_000,
      ttlMs: 60_000,
      cleanupIntervalMs: false,
    });
    for (let i = 0; i < 10_000; i++) {
      cache.set(i, i);
    }
    for (let i = 0; i < 10_000; i++) {
      cache.get(i);
    }
  });

  bench('set + get mixed (10k ops)', () => {
    const cache = new TtlCache<number, number>({
      maxSize: 5_000,
      ttlMs: 60_000,
      cleanupIntervalMs: false,
    });
    for (let i = 0; i < 10_000; i++) {
      if (i % 2 === 0) {
        cache.set(i, i);
      } else {
        cache.get(i - 1);
      }
    }
  });

  bench('LRU eviction (set 20k into maxSize 10k)', () => {
    const cache = new TtlCache<number, number>({
      maxSize: 10_000,
      ttlMs: 60_000,
      cleanupIntervalMs: false,
    });
    for (let i = 0; i < 20_000; i++) {
      cache.set(i, i);
    }
  });

  // ─── Differential Features (SWR + Dedup) ───────────────────

  bench('getOrSet with dedup (100 concurrent)', async () => {
    const cache = new TtlCache<string, number>({
      ttlMs: 60_000,
      cleanupIntervalMs: false,
    });
    let loaderCalls = 0;
    const loader = async () => {
      loaderCalls++;
      // Simula I/O leve
      await new Promise((r) => setTimeout(r, 1));
      return 123;
    };

    // 100 chamadas concorrentes -> 1 loader execution
    await Promise.all(
      Array.from({ length: 100 }, () => cache.getOrSet('key', loader)),
    );

    // loaderCalls deveria ser 1 (dedup funcionou)
  });

  bench('getOrSet SWR (serve stale immediately)', async () => {
    const cache = new TtlCache<string, number>({
      ttlMs: 10, // 10ms TTL
      cleanupIntervalMs: false,
    });

    // Popula cache inicial
    await cache.getOrSet('key', async () => 42, { ttlMs: 10, swrMs: 5000 });

    // Espera TTL expirar (entra na janela SWR)
    await new Promise((r) => setTimeout(r, 15));

    // Bench: getOrSet deve retornar stale IMEDIATAMENTE (sem await do loader)
    const start = Date.now();
    const value = await cache.getOrSet(
      'key',
      async () => {
        // Loader lento (não deve bloquear o retorno)
        await new Promise((r) => setTimeout(r, 50));
        return 99;
      },
      { ttlMs: 10, swrMs: 5000 },
    );
    const elapsed = Date.now() - start;

    // value = 42 (stale), elapsed < 10ms (não esperou loader)
    // (em produção você teria assertion, aqui só medimos throughput)
  });

  // ─── Stress Test (opcional — pode ter RME alto) ────────────

  bench('set 100k entries', () => {
    const cache = new TtlCache<number, number>({
      maxSize: 100_000,
      ttlMs: 60_000,
      cleanupIntervalMs: false,
    });
    for (let i = 0; i < 100_000; i++) {
      cache.set(i, i);
    }
  });

  bench('get 100k entries (all hits)', () => {
    const cache = new TtlCache<number, number>({
      maxSize: 100_000,
      ttlMs: 60_000,
      cleanupIntervalMs: false,
    });
    // Populate
    for (let i = 0; i < 100_000; i++) {
      cache.set(i, i);
    }
    // Bench: get
    for (let i = 0; i < 100_000; i++) {
      cache.get(i);
    }
  });
});
