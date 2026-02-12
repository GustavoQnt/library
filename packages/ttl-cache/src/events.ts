import type { CacheEvent, CacheEventHandler } from './types.js';

/**
 * Event emitter tipado e leve. Sem dependências externas.
 * Usado para emitir eventos de cache: hit, miss, set, evict, load, stale.
 */
export class CacheEventEmitter<K, V> {
  // Map de evento -> Set de handlers. Permite múltiplos listeners por evento.
  private listeners = new Map<CacheEvent, Set<CacheEventHandler<K, V>>>();

  /** Registra um handler para um evento */
  on(event: CacheEvent, handler: CacheEventHandler<K, V>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  /** Remove um handler de um evento */
  off(event: CacheEvent, handler: CacheEventHandler<K, V>): void {
    this.listeners.get(event)?.delete(handler);
  }

  /** Dispara um evento para todos os handlers registrados */
  emit(event: CacheEvent, key: K, value?: V): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(key, value);
    }
  }

  /** Remove todos os listeners */
  clear(): void {
    this.listeners.clear();
  }
}
