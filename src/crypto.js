/**
 * Cryptography helpers for the browser-local demo.
 * PBKDF2 password stretching, AES-GCM encryption, HMAC-signed session tokens,
 * and periodic HMAC key rotation stored in IndexedDB. Not production HR security.
 */

const PBKDF2_ITERATIONS = 600000;
const PBKDF2_ALGORITHM = "PBKDF2";
const PBKDF2_HASH = "SHA-256";
const PBKDF2_KEY_LENGTH = 256;
const SALT_LENGTH = 32;
const HMAC_KEY_LENGTH = 32;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

const AES_ALGORITHM = "AES-GCM";
const AES_KEY_LENGTH = 256;
const AES_IV_LENGTH = 12;
const AES_TAG_LENGTH = 128;
const KEY_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const KEY_VERSION = 2;

function getLoginAttempts() {
  try {
    const data = localStorage.getItem("workforces_login_attempts");
    return data ? new Map(JSON.parse(data)) : new Map();
  } catch {
    return new Map();
  }
}

function saveLoginAttempts(attemptsMap) {
  try {
    localStorage.setItem("workforces_login_attempts", JSON.stringify(Array.from(attemptsMap.entries())));
  } catch (e) {
    console.error("Could not write login attempts to localStorage:", e);
  }
}

function getKeyStore() {
  try {
    const data = localStorage.getItem("workforces_key_store");
    return data ? JSON.parse(data) : { keys: [], currentKeyId: null };
  } catch {
    return { keys: [], currentKeyId: null };
  }
}

function saveKeyStore(keyStore) {
  try {
    localStorage.setItem("workforces_key_store", JSON.stringify(keyStore));
  } catch (e) {
    console.error("Could not write key store to localStorage:", e);
  }
}

async function generateAesKey() {
  return await crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

async function exportAesKey(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function importAesKey(rawHex) {
  const raw = hexToBytes(rawHex);
  return await crypto.subtle.importKey("raw", raw, { name: AES_ALGORITHM }, true, ["encrypt", "decrypt"]);
}

async function deriveKeyFromPassword(password, salt) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = encoder.encode(salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: PBKDF2_ALGORITHM },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: PBKDF2_ALGORITHM,
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function rotateEncryptionKeys() {
  const keyStore = getKeyStore();
  const now = Date.now();

  const currentKey = keyStore.keys.find(k => k.id === keyStore.currentKeyId);
  if (currentKey && (now - currentKey.createdAt) < KEY_ROTATION_INTERVAL_MS) {
    return currentKey.id;
  }

  const newKey = await generateAesKey();
  const newKeyRaw = await exportAesKey(newKey);
  const newKeyId = "key_" + crypto.randomUUID();

  keyStore.keys.push({
    id: newKeyId,
    value: newKeyRaw,
    createdAt: now,
    version: KEY_VERSION
  });
  keyStore.currentKeyId = newKeyId;

  if (keyStore.keys.length > 10) {
    const oldKeys = keyStore.keys.filter(k => k.id !== newKeyId);
    oldKeys.sort((a, b) => a.createdAt - b.createdAt);
    keyStore.keys = [keyStore.keys.find(k => k.id === newKeyId), ...oldKeys.slice(-9)];
  }

  saveKeyStore(keyStore);
  return newKeyId;
}

export async function getCurrentEncryptionKey() {
  await rotateEncryptionKeys();
  const keyStore = getKeyStore();
  const currentKey = keyStore.keys.find(k => k.id === keyStore.currentKeyId);
  if (!currentKey) throw new Error("No encryption key available");
  return { key: await importAesKey(currentKey.value), keyId: currentKey.id };
}

export async function getEncryptionKeyById(keyId) {
  const keyStore = getKeyStore();
  const keyData = keyStore.keys.find(k => k.id === keyId);
  if (!keyData) throw new Error(`Key not found: ${keyId}`);
  return { key: await importAesKey(keyData.value), keyId: keyData.id };
}

export async function encryptData(plaintext, associatedData = "") {
  const { key, keyId } = await getCurrentEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const aad = encoder.encode(associatedData);

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv, additionalData: aad, tagLength: AES_TAG_LENGTH },
    key,
    data
  );

  const result = new Uint8Array(1 + AES_IV_LENGTH + ciphertext.byteLength);
  result[0] = KEY_VERSION;
  result.set(iv, 1);
  new Uint8Array(ciphertext).forEach((b, i) => result[1 + AES_IV_LENGTH + i] = b);

  return {
    data: Array.from(result).map(b => b.toString(16).padStart(2, "0")).join(""),
    keyId
  };
}

export async function decryptData(encryptedHex, associatedData = "") {
  const encryptedBytes = hexToBytes(encryptedHex);
  if (encryptedBytes.length < 1 + AES_IV_LENGTH) {
    throw new Error("Invalid encrypted data format");
  }

  const version = encryptedBytes[0];
  const iv = encryptedBytes.slice(1, 1 + AES_IV_LENGTH);
  const ciphertext = encryptedBytes.slice(1 + AES_IV_LENGTH);

  let key;

  if (version === KEY_VERSION) {
    const keyStore = getKeyStore();
    const currentKey = keyStore.keys.find(k => k.id === keyStore.currentKeyId);
    if (currentKey) {
      key = await importAesKey(currentKey.value);
    }
  } else {
    const legacyKey = localStorage.getItem("workforces_legacy_encryption_key");
    if (legacyKey) {
      key = await importAesKey(legacyKey);
    }
  }

  if (!key) {
    throw new Error("Unable to locate decryption key");
  }

  const encoder = new TextEncoder();
  const aad = encoder.encode(associatedData);

  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv, additionalData: aad, tagLength: AES_TAG_LENGTH },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function reEncryptWithCurrentKey(encryptedHex, associatedData = "") {
  const plaintext = await decryptData(encryptedHex, associatedData);
  return await encryptData(plaintext, associatedData);
}

export async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function generateSalt() {
  const arr = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function checkRateLimit(identifier) {
  const now = Date.now();
  const attemptsMap = getLoginAttempts();
  const attempts = attemptsMap.get(identifier) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  if (attempts.lockedUntil && now > attempts.lockedUntil) {
    attempts.count = 0;
    attempts.firstAttempt = now;
    attempts.lockedUntil = 0;
    attemptsMap.set(identifier, attempts);
    saveLoginAttempts(attemptsMap);
  }

  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    const remainingMs = attempts.lockedUntil - now;
    throw new Error(`Too many failed attempts. Try again in ${Math.ceil(remainingMs / 60000)} minutes.`);
  }

  return attempts;
}

export function recordFailedAttempt(identifier) {
  const now = Date.now();
  const attemptsMap = getLoginAttempts();
  const attempts = attemptsMap.get(identifier) || { count: 0, firstAttempt: now, lockedUntil: 0 };
  attempts.count += 1;
  attempts.firstAttempt = attempts.firstAttempt || now;

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }

  attemptsMap.set(identifier, attempts);
  saveLoginAttempts(attemptsMap);
}

export function clearFailedAttempts(identifier) {
  const attemptsMap = getLoginAttempts();
  attemptsMap.delete(identifier);
  saveLoginAttempts(attemptsMap);
}

let cryptoWorker = null;
let nextMessageId = 0;
const pendingCryptoResolves = new Map();
let workerUrl = null;

function getCryptoWorker() {
  if (cryptoWorker) return cryptoWorker;

  const workerCode = `
    self.onmessage = async (e) => {
      const { id, password, salt, iterations } = e.data;
      try {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        const saltBuffer = encoder.encode(salt);

        const keyMaterial = await self.crypto.subtle.importKey(
          "raw",
          passwordBuffer,
          { name: "PBKDF2" },
          false,
          ["deriveBits"]
        );

        const derivedBits = await self.crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: saltBuffer,
            iterations: iterations || 600000,
            hash: "SHA-256"
          },
          keyMaterial,
          256
        );

        const hashArray = Array.from(new Uint8Array(derivedBits));
        const stretched = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        self.postMessage({ id, success: true, result: stretched });
      } catch (err) {
        self.postMessage({ id, success: false, error: err.message });
      }
    };
  `;

  try {
    const blob = new Blob([workerCode], { type: "application/javascript" });
    workerUrl = URL.createObjectURL(blob);
    cryptoWorker = new Worker(workerUrl);

    cryptoWorker.onmessage = (e) => {
      const { id, success, result, error } = e.data;
      const callbacks = pendingCryptoResolves.get(id);
      if (callbacks) {
        pendingCryptoResolves.delete(id);
        if (success) {
          callbacks.resolve(result);
        } else {
          callbacks.reject(new Error(error));
        }
      }
    };
  } catch (err) {
    console.warn("[CRYPTO] Worker creation failed, falling back to main thread:", err);
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = null;
    }
    cryptoWorker = null;
  }

  window.addEventListener("beforeunload", () => {
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
    }
  });

  return cryptoWorker;
}

async function hashPasswordMainThread(password, salt) {
  return await deriveKeyFromPassword(password, salt);
}

export async function hashPassword(password, salt) {
  const worker = getCryptoWorker();
  if (!worker) {
    return hashPasswordMainThread(password, salt);
  }
  return new Promise((resolve, reject) => {
    const id = nextMessageId++;
    pendingCryptoResolves.set(id, { resolve, reject });
    worker.postMessage({ id, password, salt, iterations: PBKDF2_ITERATIONS });
  });
}

export async function verifyPassword(password, salt, storedHash) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === storedHash;
}

export function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(obj[key]);
    return acc;
  }, {});
}

export async function generateHmacKey() {
  const arr = new Uint8Array(HMAC_KEY_LENGTH);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function signSessionToken(payload, hmacKey, kid = null) {
  const sortedPayload = sortObjectKeys(payload);
  const payloadStr = JSON.stringify(sortedPayload);

  const encoder = new TextEncoder();
  const keyData = encoder.encode(hmacKey);
  const messageData = encoder.encode(payloadStr);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    messageData
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const sig = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, payload: sortedPayload, sig, kid }))));
}

export async function verifySessionToken(token, hmacKey) {
  if (!token || typeof token !== "string") return null;
  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(token))));
    const payload = decoded.v === 1 ? decoded.payload : decoded.payload;
    const sig = decoded.sig;

    const sortedPayload = sortObjectKeys(payload);
    const payloadStr = JSON.stringify(sortedPayload);

    const encoder = new TextEncoder();
    const keyData = encoder.encode(hmacKey);
    const messageData = encoder.encode(payloadStr);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = hexToBytes(sig);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      messageData
    );

    if (isValid) {
      if (payload.expiresAt && payload.expiresAt < Date.now()) {
        return null;
      }
      return payload;
    }
  } catch (err) {
  }
  return null;
}

export const CRYPTO_CONFIG = {
  PBKDF2_ITERATIONS,
  PBKDF2_ALGORITHM,
  PBKDF2_HASH,
  PBKDF2_KEY_LENGTH,
  SALT_LENGTH,
  HMAC_KEY_LENGTH,
  SESSION_TTL_MS,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_LOCKOUT_MS,
  AES_ALGORITHM,
  AES_KEY_LENGTH,
  AES_IV_LENGTH,
  AES_TAG_LENGTH,
  KEY_ROTATION_INTERVAL_MS,
  KEY_VERSION
};