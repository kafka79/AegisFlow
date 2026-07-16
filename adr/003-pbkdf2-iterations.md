# ADR 003: PBKDF2 600,000 Iterations in Web Worker

**Status**: Accepted
**Date**: 2026-07-12

## Context

Password hashing must be slow to resist brute-force. OWASP 2026 recommends **PBKDF2-HMAC-SHA256 ≥ 600,000 iterations** (or Argon2id). Previous code used 100,000 iterations on main thread, causing 100-200ms jank on login.

## Decision

- **Algorithm**: PBKDF2-HMAC-SHA256 (Web Crypto API native, no WASM needed)
- **Iterations**: 600,000 (configurable via `CRYPTO_CONFIG.PBKDF2_ITERATIONS`)
- **Execution**: Dedicated **Web Worker** (off main thread)
- **Salt**: 32 bytes (256 bits) from `crypto.getRandomValues`
- **Output**: 32 bytes (256 bits) hex-encoded
- **No pre-hashing**: Raw password → PBKDF2 (avoids entropy reduction from SHA-256 pre-hash)

## Worker Architecture

```
Main Thread                    Web Worker
     │                              │
     ├─ postMessage({password, salt, iterations}) ───►│
     │                              │  importKey("PBKDF2")
     │                              │  deriveBits(600k)
     │◄─── postMessage({result}) ───┤
     │                              │
```

- Blob URL created once, revoked on `beforeunload`
- Message channel with `messageId` for request/response correlation
- Fallback: if Worker fails, main-thread compute with `setTimeout` yield

## Rate Limiting (Complementary Defense)

- 5 failed attempts per identifier (email/employeeId) → 15 min lockout
- Stored in memory (`Map`), resets on successful login
- Applied in `MockServer.authenticate()` before hash verification

## Token Design (HMAC-SHA256)

- **Versioned**: `{ v: 1, payload: {...}, sig: "hex" }` base64url-encoded
- **Payload**: `{ employeeId, role, expiresAt }` (keys sorted for deterministic sig)
- **TTL**: 2 hours (`SESSION_TTL_MS = 7200000`)
- **Key**: 32-byte HMAC key generated once per server instance, stored in IndexedDB `config` store
- **Rotation Path**: Key version in payload → support multiple active keys

## Consequences

**Positive**:
- Main thread stays responsive during login/register
- Iteration count configurable for future hardware
- No pre-hash entropy loss
- Rate limiting thwarts online guessing

**Negative**:
- Worker startup adds ~10ms cold start (mitigated by lazy init)
- Blob URL requires HTTPS in production (dev works on localhost)
- Safari Private Mode blocks `crypto.subtle` in Workers (needs fallback)

## Migration Path to Argon2id

When Web Crypto adds Argon2id (proposal stage):
1. Add `algorithm: "argon2id"` to `CRYPTO_CONFIG`
2. Worker detects support via `crypto.subtle.importKey("argon2id", ...)`
3. Fallback to PBKDF2 if unsupported
4. Re-hash on next successful login (progressive upgrade)
