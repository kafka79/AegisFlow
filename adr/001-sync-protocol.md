# ADR 001: Offline-First Sync Protocol

**Status**: Accepted
**Date**: 2026-07-12

## Context

The HRMS must work offline (field employees, poor connectivity). Mutations queue locally and sync when online. Requirements:
- No data loss on concurrent edits
- Priority for user-blocking ops (check-in) over background (profile edit)
- Cross-tab sync coordination
- Exponential backoff on failure
- Per-mutation retry with dead-letter queue

## Decision

**Dual-queue architecture**:
```
IndexedDB (sync_db)
├── queue (objectStore)       → pending mutations, indexed by priority + timestamp
├── retry_queue (objectStore) → failed mutations with retryCount + nextRetryAt
└── sync_meta (objectStore)   → cursor, protocolVersion
```

**Mutation envelope**:
```typescript
{
  id: number,                 // auto-increment
  type: "PUT" | "DELETE",
  store: "employees" | "attendance" | "timeoff" | "users",
  data: T,                    // payload with vectorClock, lastModified, clientId
  timestamp: number,          // client wall time
  priority: number,           // 10=check-in, 5=attendance, 1=profile, 0=bulk
  protocolVersion: 1,
  retryCount: 0
}
```

**Sync flow**:
1. `getPendingTransactions(cursor, limit=100)` → sorted by `priority DESC, timestamp ASC`
2. Send batch to `MockServer.syncTransactions(token, batch)`
3. Server responds `{ conflicts, serverTimestamp }`
4. On success: `clearQueueIds(processedIds)`, advance cursor, broadcast `sync_complete` via BroadcastChannel
5. On failure: increment `retryCount`, move to `retry_queue` with exponential backoff (`5s * 2^retryCount`), max 5 retries

**Cross-tab coordination**:
- `BroadcastChannel("workforces_sync")`
- Tab A completes sync → posts `{ type: "sync_complete", cursor }`
- Tab B receives → updates local cursor, avoids duplicate sync
- Network online event → broadcasts `{ type: "sync_trigger" }`

**Background sync**:
- `setInterval` with exponential backoff (15s → 5m cap)
- Also triggers on `online` event and `sync_trigger` broadcast
- Respects `isSyncing` mutex (in-memory, per-tab)

**Quota handling**:
- `QuotaExceededError` → toast "Storage full", pause enqueue
- Future: LRU eviction of oldest synced mutations

## Consequences

**Positive**:
- User-blocking ops (check-in) jump queue via priority
- Failed mutations retry independently (don't block entire batch)
- Multi-tab: only one tab syncs, others update cursor
- Protocol version enables future schema migration

**Negative**:
- `isSyncing` mutex is per-tab (not distributed) — race if two tabs online simultaneously (mitigation: BroadcastChannel sync_trigger debounce)
- Cursor-based pagination assumes monotonic IDs (autoIncrement guarantees this)
- No bandwidth awareness (future: `navigator.connection?.downlink`)

## Migration Strategy

`SYNC_DB_VERSION = 2` adds `retry_queue` and `sync_meta` stores. `onupgradeneeded` creates them if missing. Existing `queue` data preserved.