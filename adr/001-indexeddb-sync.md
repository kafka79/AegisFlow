# ADR 001: IndexedDB for Offline Mutation Queue

**Status**: Accepted
**Date**: 2026-07-12

## Context

The application must work offline-first. Users (employees checking in, HR approving leaves) need to perform mutations without network connectivity. Mutations must persist across browser sessions and survive crashes.

Options considered:
1. **localStorage** - Simple but synchronous, 5MB limit, no indexing/querying
2. **IndexedDB** - Async, large storage (hundreds of MB), supports indexes, transactions, cursors
3. **OPFS (Origin Private File System)** - Good for large blobs, but overkill for structured mutation logs
4. **SQLite WASM** - Full SQL but ~1MB bundle size, complexity not justified

## Decision

Use **IndexedDB** with three object stores:
- `queue` - Pending mutations (auto-increment ID, type, store, data, timestamp, priority, vectorClock, protocolVersion, retryCount)
- `retry_queue` - Failed mutations with `nextRetryAt` and `retryCount` (indexed for efficient polling)
- `sync_meta` - Cursor position, last sync timestamp

## Consequences

**Positive**:
- Survives browser restarts, crashes, tab closures
- Efficient range queries (cursor-based delta sync)
- Transactional integrity (all-or-nothing batch writes)
- No bundle size increase (native API)

**Negative**:
- Async API requires Promise wrapping boilerplate
- Safari private mode blocks IndexedDB (fallback to in-memory Map needed)
- Schema migrations require `onupgradeneeded` handling

## Implementation Notes

- Version 2 adds `retry_queue` and `sync_meta` stores
- `BroadcastChannel` coordinates cross-tab sync triggers
- `navigator.onLine` supplemented with failed fetch detection for captive portals