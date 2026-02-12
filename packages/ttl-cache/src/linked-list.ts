import type { CacheEntry } from './cache-entry.js';

/**
 * Lista duplamente encadeada para ordenação LRU.
 * Head = mais recentemente usado (MRU)
 * Tail = menos recentemente usado (LRU)
 * Todas as operações são O(1): adicionar, mover, remover.
 */
export class DoublyLinkedList<K, V> {
  head: CacheEntry<K, V> | null = null;
  tail: CacheEntry<K, V> | null = null;

  /** Adiciona uma entry ao início (MRU position) */
  addToFront(entry: CacheEntry<K, V>): void {
    entry.prev = null;
    entry.next = this.head;
    if (this.head) {
      this.head.prev = entry;
    }
    this.head = entry;
    if (!this.tail) {
      this.tail = entry;
    }
  }

  /** Move uma entry existente para a frente (promove para MRU) */
  moveToFront(entry: CacheEntry<K, V>): void {
    if (entry === this.head) return;
    this.remove(entry);
    this.addToFront(entry);
  }

  /** Remove uma entry de qualquer posição na lista */
  remove(entry: CacheEntry<K, V>): void {
    if (entry.prev) {
      entry.prev.next = entry.next;
    } else {
      this.head = entry.next;
    }
    if (entry.next) {
      entry.next.prev = entry.prev;
    } else {
      this.tail = entry.prev;
    }
    entry.prev = null;
    entry.next = null;
  }

  /** Remove e retorna o tail (LRU entry — a que será evictada) */
  removeTail(): CacheEntry<K, V> | null {
    if (!this.tail) return null;
    const entry = this.tail;
    this.remove(entry);
    return entry;
  }

  /** Limpa toda a lista */
  clear(): void {
    this.head = null;
    this.tail = null;
  }
}
