# ADR 002: Vector Clocks for Conflict Resolution

**Status**: Accepted
**Date**: 2026-07-12

## Context

In offline-first systems, concurrent edits to the same record from different clients (or tabs) are inevitable. The previous implementation used naive merge strategy was shallow: `{ ...clientData, ...serverData }` — server wins on all overlapping fields. This loses data when:
- User A edits `name` offline
- User B edits `phone` offline
- Both sync → one field silently lost

## Decision

Use **vector clocks** for record-level causality plus **per-field logical clocks** (`fieldClocks`) for merge decisions:

- Each client generates unique `clientId` (stored in localStorage)
- Each mutation carries `vectorClock: { [clientId]: logicalTime }` and `fieldClocks: { [fieldName]: logicalTime }`
- Server and client share `src/merge.js` → `mergeFieldsWithFieldClocks()`
- On conflict: higher `fieldClocks[field]` wins; equal clocks use deterministic JSON tie-break, then increment the field clock

**Field-level merge algorithm** (implemented in `src/merge.js`):

```
for each field in union(clientKeys, serverKeys):
  skip meta keys (id, vectorClock, fieldClocks, lastModified, employeeId)
  if only client has field → client wins
  if only server has field → server wins
  if both have field and values differ:
    if clientFieldClock > serverFieldClock → client wins
    else if serverFieldClock > clientFieldClock → server wins
    else → deterministic JSON string tie-break
    fieldClocks[field] = max(client, server) + 1
  merged.vectorClock = merge(clientVectorClock, serverVectorClock)
```

## Consequences

**Positive**:
- No silent data loss on concurrent non-overlapping edits
- Same-field concurrent edits resolve deterministically
- Shared merge module keeps client queue and mock server consistent

**Negative**:
- Vector clock grows with number of clients (mitigation: GC old clients after 30 days inactivity)
- Still not a CRDT — nested objects and rich text need Yjs/Automerge-style structures
- Mock server shares the browser origin; multi-device needs a real backend

## Implementation Notes

- Client ID: `localStorage.getItem('sync_client_id') || crypto.randomUUID()`
- Logical clock incremented in `generateVectorClock()` per mutation
- Field clocks attached in `addFieldClocks()` inside `src/sync.js`
- Conflicts counted in `window.SyncTelemetry.conflictCount` and POSTed to `/api/telemetry`
- Manual demo: see README → **Multi-tab sync demo**

## Future Improvement

Migrate to **Dotted Version Vectors** or **CRDTs (Yjs/Automerge)** for rich text / complex nested objects when a real multi-device backend exists.
