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
      
      const isValid = await cryptoModule.verifyPassword('WrongPass', salt, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('AES-GCM Encryption / Decryption', () => {
    it('encrypts and decrypts data with associated data', async () => {
      const plaintext = 'Sensitive employee data: salary=150000';
      const associatedData = 'employee:ODIAD20260001';
      
      const { data: encrypted, keyId } = await cryptoModule.encryptData(plaintext, associatedData);
      expect(encrypted).toMatch(/^[0-9a-f]+$/);
      expect(keyId).toMatch(/^key_/);
      
      const decrypted = await cryptoModule.decryptData(encrypted, associatedData);
      expect(decrypted).toBe(plaintext);
    });

    it('rejects decryption with wrong associated data', async () => {
      const plaintext = 'Secret data';
      const { data: encrypted } = await cryptoModule.encryptData(plaintext, 'correct-aad');
      
      await expect(cryptoModule.decryptData(encrypted, 'wrong-aad')).rejects.toThrow();
    });

    it('rejects decryption with corrupted ciphertext', async () => {
      const plaintext = 'Secret data';
      const { data: encrypted } = await cryptoModule.encryptData(plaintext, '');
      
      // Flip a bit in the ciphertext
      const corrupted = encrypted.slice(0, 10) + 'f' + encrypted.slice(11);
      
      await expect(cryptoModule.decryptData(corrupted, '')).rejects.toThrow();
    });

    it('encrypts empty string', async () => {
      const { data: encrypted } = await cryptoModule.encryptData('', '');
      const decrypted = await cryptoModule.decryptData(encrypted, '');
      expect(decrypted).toBe('');
    });

    it('handles unicode correctly', async () => {
      const plaintext = 'Employee: 测试 👨‍💼 ₹1,50,000';
      const { data: encrypted } = await cryptoModule.encryptData(plaintext, 'context');
      const decrypted = await cryptoModule.decryptData(encrypted, 'context');
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Key Rotation', () => {
    it('rotates keys after interval', async () => {
      // First encryption creates initial key
      const { keyId: keyId1 } = await cryptoModule.encryptData('test1', '');
      expect(keyId1).toMatch(/^key_/);
      
      // Manually expire the key
      const keyStore = JSON.parse(localStorage.getItem('workforces_key_store') || '{}');
      if (keyStore.keys && keyStore.keys[0]) {
        keyStore.keys[0].createdAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
        localStorage.setItem('workforces_key_store', JSON.stringify(keyStore));
      }
      
      // Next encryption should rotate
      const { keyId: keyId2 } = await cryptoModule.encryptData('test2', '');
      expect(keyId2).not.toBe(keyId1);
    });

    it('can decrypt with old key after rotation', async () => {
      const { data: encrypted1, keyId: keyId1 } = await cryptoModule.encryptData('data with key 1', '');
      
      // Force rotation
      const keyStore = JSON.parse(localStorage.getItem('workforces_key_store') || '{}');
      if (keyStore.keys && keyStore.keys[0]) {
        keyStore.keys[0].createdAt = Date.now() - 25 * 60 * 60 * 1000;
        localStorage.setItem('workforces_key_store', JSON.stringify(keyStore));
      }
      
      const { keyId: keyId2 } = await cryptoModule.encryptData('data with key 2', '');
      expect(keyId2).not.toBe(keyId1);
      
      // Old data should still decrypt
      const decrypted = await cryptoModule.decryptData(encrypted1, '');
      expect(decrypted).toBe('data with key 1');
    });
  });

  describe('reEncryptWithCurrentKey', () => {
    it('re-encrypts old data with current key', async () => {
      const { data: encrypted1 } = await cryptoModule.encryptData('legacy data', 'aad');
      
      // Force rotation
      const keyStore = JSON.parse(localStorage.getItem('workforces_key_store') || '{}');
      if (keyStore.keys && keyStore.keys[0]) {
        keyStore.keys[0].createdAt = Date.now() - 25 * 60 * 60 * 1000;
        localStorage.setItem('workforces_key_store', JSON.stringify(keyStore));
      }
      
      const { data: reEncrypted } = await cryptoModule.reEncryptWithCurrentKey(encrypted1, 'aad');
      expect(reEncrypted).not.toBe(encrypted1);
      
      // Should decrypt correctly
      const decrypted = await cryptoModule.decryptData(reEncrypted, 'aad');
      expect(decrypted).toBe('legacy data');
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
      expect(cryptoModule.CRYPTO_CONFIG.PBKDF2_ITERATIONS).toBe(600000);
      expect(cryptoModule.CRYPTO_CONFIG.SALT_LENGTH).toBe(32);
      expect(cryptoModule.CRYPTO_CONFIG.SESSION_TTL_MS).toBe(7200000);
      expect(cryptoModule.CRYPTO_CONFIG.MAX_LOGIN_ATTEMPTS).toBe(5);
      expect(cryptoModule.CRYPTO_CONFIG.AES_ALGORITHM).toBe('AES-GCM');
      expect(cryptoModule.CRYPTO_CONFIG.AES_KEY_LENGTH).toBe(256);
      expect(cryptoModule.CRYPTO_CONFIG.AES_IV_LENGTH).toBe(12);
      expect(cryptoModule.CRYPTO_CONFIG.AES_TAG_LENGTH).toBe(128);
      expect(cryptoModule.CRYPTO_CONFIG.KEY_ROTATION_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
      expect(cryptoModule.CRYPTO_CONFIG.KEY_VERSION).toBe(2);
    });
  });
});