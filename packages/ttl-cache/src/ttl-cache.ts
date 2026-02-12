import { CacheEntry } from './cache-entry.js';
import { CacheEventEmitter } from './events.js';
import { DoublyLinkedList } from './linked-list.js';
import type {
  CacheEvent,
  CacheEventHandler,
  CacheOptions,
  CacheStats,
  EvictReason,
  GetOrSetOptions,
  SetOptions,
} from './types.js';

const DEFAULT_TTL_MS = 30_000;

/**
 * Cache em memória com TTL, LRU, Stale-While-Revalidate (SWR) e deduplicação de requisições.
 *
 * Estrutura interna:
 * - map: O(1) lookup por chave
 * - list: Lista duplamente encadeada para ordenação LRU (MRU no head, LRU no tail)
 * - inflight: Map de promises em execução (para dedup de requests concorrentes)
 * - emitter: Event emitter tipado para observabilidade
 */
export class TtlCache<K, V> {
  // Map para O(1) lookup
  private readonly map = new Map<K, CacheEntry<K, V>>();
  // Lista duplamente encadeada para manutenção da ordem LRU
  private readonly list = new DoublyLinkedList<K, V>();
  // Event emitter para observabilidade
  private readonly emitter = new CacheEventEmitter<K, V>();
  // Map de promises em-voo para deduplicação de chamadas concorrentes ao mesmo loader
  private readonly inflight = new Map<K, Promise<V>>();

  private readonly defaultTtlMs: number;
  private readonly maxSize: number | undefined;
  private readonly onEvict: ((key: K, value: V, reason: EvictReason) => void) | undefined;
  // Timer do cleanup periódico (pode ser null ou undefined)
  private cleanupTimer: unknown = null;

  // Estatísticas de cache
  private stats = {
    hits: 0,
    misses: 0,
    stale: 0,      // Quantas vezes servimos stale
    loads: 0,      // Quantas vezes executamos o loader
    evictions: 0,  // Quantas entries foram removidas
  };

  constructor(options?: CacheOptions<K, V>) {
    this.defaultTtlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSize = options?.maxSize;
    this.onEvict = options?.onEvict;

    // Ativa cleanup periódico se especificado (default: desativado)
    const intervalMs = options?.cleanupIntervalMs;
    if (typeof intervalMs === 'number' && intervalMs > 0) {
      this.cleanupTimer = setInterval(() => this.sweep(), intervalMs);
      const timer = this.cleanupTimer;
      // Chama unref() no Node.js para que o timer não mantenha o processo vivo
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref: () => void }).unref();
      }
    }
  }

  // ─── Sync API ──────────────────────────────────────────────

  set(key: K, value: V, options?: SetOptions): void {
    const ttl = options?.ttlMs ?? this.defaultTtlMs;
    const now = Date.now();
    const expiresAt = now + ttl;
    const staleUntil = expiresAt; // No SWR on plain set

    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      existing.staleUntil = staleUntil;
      this.list.moveToFront(existing);
    } else {
      const entry = new CacheEntry(key, value, expiresAt, staleUntil);
      this.map.set(key, entry);
      this.list.addToFront(entry);
      this.enforceMaxSize();
    }

    this.emitter.emit('set', key, value);
  }

  /** Returns the value only if it's fresh (within TTL). Does not serve stale. */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.stats.misses++;
      this.emitter.emit('miss', key);
      return undefined;
    }

    const now = Date.now();

    // Only serve fresh entries via get()
    if (!entry.isFresh(now)) {
      // Clean up if fully expired
      if (entry.isExpired(now)) {
        this.removeEntry(entry, 'expired');
      }
      this.stats.misses++;
      this.emitter.emit('miss', key);
      return undefined;
    }

    this.list.moveToFront(entry);
    this.stats.hits++;
    this.emitter.emit('hit', key, entry.value);
    return entry.value;
  }

  /** Returns the value without updating LRU order. Returns `undefined` if expired. */
  peek(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (entry.isExpired(now)) {
      this.removeEntry(entry, 'expired');
      return undefined;
    }

    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    const now = Date.now();
    if (entry.isExpired(now)) {
      this.removeEntry(entry, 'expired');
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.removeEntry(entry, 'manual');
    return true;
  }

  clear(): void {
    for (const entry of this.map.values()) {
      this.onEvict?.(entry.key, entry.value, 'clear');
      this.emitter.emit('evict', entry.key, entry.value);
    }
    this.map.clear();
    this.list.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /** Remove manualmente todas as entries completamente expiradas. */
  prune(): void {
    this.sweep();
  }

  // ─── Async API ─────────────────────────────────────────────

  /**
   * Obtém um valor do cache ou popula via loader se ausente/expirado.
   *
   * Lógica de 3 estados:
   * 1. FRESH (dentro do TTL): retorna direto do cache
   * 2. STALE (passou TTL, dentro de SWR): retorna stale + revalidação em background
   * 3. EXPIRED (passou TTL + SWR): chama loader, aguarda resultado
   *
   * Suporta deduplicação (dedupe: true por padrão) — múltiplas chamadas concorrentes
   * para a mesma chave compartilham a mesma promise de loader.
   */
  async getOrSet(
    key: K,
    loader: () => V | Promise<V>,
    options?: GetOrSetOptions,
  ): Promise<V> {
    const signal = options?.signal;
    signal?.throwIfAborted();

    const entry = this.map.get(key);
    const now = Date.now();

    // 1. HIT FRESCO: retorna direto
    if (entry && entry.isFresh(now)) {
      this.list.moveToFront(entry);
      this.stats.hits++;
      this.emitter.emit('hit', key, entry.value);
      return entry.value;
    }

    // 2. HIT STALE (SWR): retorna stale imediatamente + revalidação em background
    if (entry && entry.isStale(now)) {
      this.list.moveToFront(entry);
      this.stats.stale++;
      this.emitter.emit('stale', key, entry.value);
      // Inicia revalidação em background (fire-and-forget)
      this.refreshInBackground(key, loader, options);
      return entry.value;
    }

    // 3. MISS/EXPIRED: precisa executar o loader
    if (entry) {
      this.removeEntry(entry, 'expired');
    }

    this.stats.misses++;
    this.emitter.emit('miss', key);

    // Deduplicação: reutiliza promise em-voo (default: true)
    const dedupe = options?.dedupe !== false;
    if (dedupe) {
      const existing = this.inflight.get(key);
      if (existing) return this.withAbort(existing, signal);
    }

    // Executa o loader
    const promise = this.executeLoader(key, loader, options);

    if (dedupe) {
      this.inflight.set(key, promise);
    }

    try {
      return await this.withAbort(promise, signal);
    } finally {
      if (dedupe) {
        this.inflight.delete(key);
      }
    }
  }

  // ─── Observability ─────────────────────────────────────────

  getStats(): CacheStats {
    return { ...this.stats, size: this.map.size };
  }

  on(event: CacheEvent, handler: CacheEventHandler<K, V>): void {
    this.emitter.on(event, handler);
  }

  off(event: CacheEvent, handler: CacheEventHandler<K, V>): void {
    this.emitter.off(event, handler);
  }

  // ─── Iteration (skips expired, prunes lazily) ──────────────

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    const now = Date.now();
    const expired: CacheEntry<K, V>[] = [];

    for (const entry of this.map.values()) {
      if (entry.isExpired(now)) {
        expired.push(entry);
      } else if (entry.isFresh(now)) {
        yield [entry.key, entry.value];
      }
      // Stale entries are not yielded by iterators — only getOrSet serves stale
    }

    // Lazy prune expired entries found during iteration
    for (const entry of expired) {
      this.removeEntry(entry, 'expired');
    }
  }

  *keys(): IterableIterator<K> {
    for (const [key] of this) {
      yield key;
    }
  }

  *values(): IterableIterator<V> {
    for (const [, value] of this) {
      yield value;
    }
  }

  *entries(): IterableIterator<[K, V]> {
    yield* this;
  }

  // ─── Cleanup ───────────────────────────────────────────────

  /** Limpa o timer de cleanup e todos os event listeners */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.emitter.clear();
  }

  // ─── Internal ──────────────────────────────────────────────

  /** Executa o loader, popula o cache com SWR, e retorna o valor */
  private async executeLoader(
    key: K,
    loader: () => V | Promise<V>,
    options?: GetOrSetOptions,
  ): Promise<V> {
    const value = await loader();
    // Popula cache com TTL + SWR baseado nas options
    this.setWithSwr(key, value, options);
    this.stats.loads++;
    this.emitter.emit('load', key, value);
    return value;
  }

  /**
   * Popula o cache com um valor e calcula expiresAt e staleUntil.
   * Se a chave já existe, atualiza o valor e promove para MRU.
   * Se não existe, cria nova entry e enforce maxSize (evicta LRU se necessário).
   */
  private setWithSwr(key: K, value: V, options?: GetOrSetOptions): void {
    const ttl = options?.ttlMs ?? this.defaultTtlMs;
    const swr = options?.swrMs ?? 0;
    const now = Date.now();
    const expiresAt = now + ttl;
    const staleUntil = expiresAt + swr; // SWR window começa APÓS TTL expirar

    const existing = this.map.get(key);
    if (existing) {
      // Atualiza valor e timestamps
      existing.value = value;
      existing.expiresAt = expiresAt;
      existing.staleUntil = staleUntil;
      this.list.moveToFront(existing);
    } else {
      // Cria nova entry
      const entry = new CacheEntry(key, value, expiresAt, staleUntil);
      this.map.set(key, entry);
      this.list.addToFront(entry);
      // Enforce maxSize: evicta LRU se necessário
      this.enforceMaxSize();
    }

    this.emitter.emit('set', key, value);
  }

  /**
   * Inicia uma revalidação em background (fire-and-forget).
   * Os erros são silenciosamente engolidos — o valor stale permanece até expirar.
   * Não inicia se já há uma revalidação em andamento para a mesma chave.
   */
  private refreshInBackground(
    key: K,
    loader: () => V | Promise<V>,
    options?: GetOrSetOptions,
  ): void {
    if (this.inflight.has(key)) return; // Já há uma revalidação em andamento

    const promise = this.executeLoader(key, loader, options);
    this.inflight.set(key, promise);

    promise
      .catch(() => {
        // Erros de background refresh são silenciosamente ignorados.
        // O valor stale continua no cache até expirar completamente.
      })
      .finally(() => {
        this.inflight.delete(key);
      });
  }

  /**
   * Enforce LRU eviction quando maxSize é ultrapassado.
   * Remove entries do tail (LRU) até ficar dentro do limit.
   */
  private enforceMaxSize(): void {
    if (this.maxSize == null) return;
    while (this.map.size > this.maxSize) {
      const evicted = this.list.removeTail();
      if (!evicted) break;
      this.map.delete(evicted.key);
      this.stats.evictions++;
      this.onEvict?.(evicted.key, evicted.value, 'evicted');
      this.emitter.emit('evict', evicted.key, evicted.value);
    }
  }

  private removeEntry(entry: CacheEntry<K, V>, reason: EvictReason): void {
    this.list.remove(entry);
    this.map.delete(entry.key);
    if (reason === 'expired' || reason === 'evicted') {
      this.stats.evictions++;
    }
    this.onEvict?.(entry.key, entry.value, reason);
    this.emitter.emit('evict', entry.key, entry.value);
  }

  private sweep(): void {
    const now = Date.now();
    for (const entry of this.map.values()) {
      if (entry.isExpired(now)) {
        this.removeEntry(entry, 'expired');
      }
    }
  }

  private withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
        (e: unknown) => { signal.removeEventListener('abort', onAbort); reject(e); },
      );
    });
  }
}
