// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Crypto Module', () => {
  let cryptoModule;
  
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    cryptoModule = await import('../src/crypto.js');
  });
  
  afterEach(() => {
    localStorage.clear();
    cryptoModule.terminateCryptoWorker?.();
  });

  describe('generateSalt', () => {
    it('generates 32-byte hex string', () => {
      const salt = cryptoModule.generateSalt();
      expect(salt).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique salts', () => {
      const salt1 = cryptoModule.generateSalt();
      const salt2 = cryptoModule.generateSalt();
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('generateHmacKey', () => {
    it('generates 32-byte hex string', async () => {
      const key = await cryptoModule.generateHmacKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('hashPassword / verifyPassword', () => {
    it('hashes and verifies password', async () => {
      const password = 'TestPass123!';
      const salt = cryptoModule.generateSalt();
      
      const hash = await cryptoModule.hashPassword(password, salt);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      
      const isValid = await cryptoModule.verifyPassword(password, salt, hash);
      expect(isValid).toBe(true);
    });

    it('rejects wrong password', async () => {
      const password = 'TestPass123!';
      const salt = cryptoModule.generateSalt();
      const hash = await cryptoModule.hashPassword(password, salt);
      console.log('hash:', hash);
      
      const wrongHash = await cryptoModule.hashPassword('WrongPass', salt);
      console.log('wrongHash:', wrongHash);
      
      const isValid = await cryptoModule.verifyPassword('WrongPass', salt, hash);
      console.log('isValid:', isValid);
      expect(isValid).toBe(false);
    });
  });

  describe('signSessionToken / verifySessionToken', () => {
    it('signs and verifies token', async () => {
      const payload = { employeeId: 'ODIAD20260001', role: 'HR', expiresAt: Date.now() + 7200000 };
      const hmacKey = await cryptoModule.generateHmacKey();
      
      const token = await cryptoModule.signSessionToken(payload, hmacKey);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      
      const verified = await cryptoModule.verifySessionToken(token, hmacKey);
      expect(verified).toEqual(payload);
    });

    it('rejects tampered token', async () => {
      const payload = { employeeId: 'ODIAD20260001', role: 'HR', expiresAt: Date.now() + 7200000 };
      const hmacKey = await cryptoModule.generateHmacKey();
      
      const token = await cryptoModule.signSessionToken(payload, hmacKey);
      const tampered = token.slice(0, -5) + 'xxxxx';
      
      const verified = await cryptoModule.verifySessionToken(tampered, hmacKey);
      expect(verified).toBeNull();
    });

    it('rejects expired token', async () => {
      const payload = { employeeId: 'ODIAD20260001', role: 'HR', expiresAt: Date.now() - 1000 };
      const hmacKey = await cryptoModule.generateHmacKey();
      
      const token = await cryptoModule.signSessionToken(payload, hmacKey);
      const verified = await cryptoModule.verifySessionToken(token, hmacKey);
      expect(verified).toBeNull();
    });
  });

  describe('Rate limiting', () => {
    it('tracks failed attempts', () => {
      const identifier = 'test@example.com';
      cryptoModule.checkRateLimit(identifier);
      cryptoModule.recordFailedAttempt(identifier);
      cryptoModule.recordFailedAttempt(identifier);
      
      const attempts = cryptoModule.checkRateLimit(identifier);
      expect(attempts.count).toBe(2);
    });

    it('locks after max attempts', () => {
      const identifier = 'lock@example.com';
      for (let i = 0; i < 5; i++) {
        cryptoModule.recordFailedAttempt(identifier);
      }
      
      expect(() => cryptoModule.checkRateLimit(identifier)).toThrow(/Too many failed attempts/);
    });

    it('clears on success', () => {
      const identifier = 'clear@example.com';
      cryptoModule.recordFailedAttempt(identifier);
      cryptoModule.recordFailedAttempt(identifier);
      cryptoModule.clearFailedAttempts(identifier);
      
      const attempts = cryptoModule.checkRateLimit(identifier);
      expect(attempts.count).toBe(0);
    });
  });

  describe('CRYPTO_CONFIG', () => {
    it('exports expected config', () => {
      expect(cryptoModule.CRYPTO_CONFIG.PBKDF2_ITERATIONS).toBe(100000);
      expect(cryptoModule.CRYPTO_CONFIG.SALT_LENGTH).toBe(32);
      expect(cryptoModule.CRYPTO_CONFIG.SESSION_TTL_MS).toBe(7200000);
      expect(cryptoModule.CRYPTO_CONFIG.MAX_LOGIN_ATTEMPTS).toBe(5);
      expect(cryptoModule.CRYPTO_CONFIG.PBKDF2_ALGORITHM).toBe('PBKDF2');
      expect(cryptoModule.CRYPTO_CONFIG.PBKDF2_HASH).toBe('SHA-256');
      expect(cryptoModule.CRYPTO_CONFIG.PBKDF2_KEY_LENGTH).toBe(256);
      expect(cryptoModule.CRYPTO_CONFIG.HMAC_KEY_LENGTH).toBe(32);
      expect(cryptoModule.CRYPTO_CONFIG.LOGIN_LOCKOUT_MS).toBe(900000);
    });
  });
});
