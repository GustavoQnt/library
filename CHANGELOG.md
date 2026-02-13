# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-02-13

### Changed
- Updated root README branding and badges for `@gustavoqnt/ttl-cache`:
  - npm version
  - npm downloads
  - CI status
  - license
- Added automated traffic dashboard in root `README.md` (views + clones only).
- Added scheduled/manual GitHub Action to fetch traffic and persist history in `.github/traffic/history.json`.
- Added tracking start-date filter (`2026-02-12`) for dashboard totals.

## [0.1.0] - 2026-02-11

### Added
- Initial release of `@gustavoqnt/ttl-cache`
- TTL-based expiration with configurable default (30s)
- LRU eviction when `maxSize` is exceeded
- Stale-While-Revalidate (SWR) support via `getOrSet()` with `swrMs` option
- Request deduplication for concurrent `getOrSet()` calls (default: enabled)
- `AbortSignal` support to cancel individual waiters without affecting others
- Event system: `hit`, `miss`, `set`, `evict`, `load`, `stale`
- Statistics tracking: hits, misses, stale serves, loads, evictions
- Iterators: `keys()`, `values()`, `entries()`, `Symbol.iterator`
- `peek()` method to read without updating LRU order
- `prune()` method for manual cleanup of expired entries
- Lazy expiration check (on access) + optional periodic sweep (`cleanupIntervalMs`)
- Zero dependencies
- Full TypeScript support with strict types
- ESM + CJS dual build with proper exports
- Comprehensive test suite (53 tests)
- Performance benchmarks

### Features
- **Sync API**: `set()`, `get()`, `peek()`, `has()`, `delete()`, `clear()`, `prune()`
- **Async API**: `getOrSet()` with loader function
- **Observability**: `getStats()`, `on()`, `off()` for events
- **Cleanup**: `dispose()` to clear timers and listeners

### Design Decisions
- `get()` only returns fresh values (never stale) — SWR is exclusive to `getOrSet()`
- Cleanup interval disabled by default (`cleanupIntervalMs: false`)
- SWR window starts **after** TTL expires (intuitive timeline)
- Deduplication enabled by default (`dedupe: true`)
- Timer is `unref()`'d in Node.js (won't keep process alive)

[0.1.0]: https://github.com/GustavoQnt/library/releases/tag/ttl-cache-v0.1.0
[0.1.1]: https://github.com/GustavoQnt/library/releases/tag/ttl-cache-v0.1.1

