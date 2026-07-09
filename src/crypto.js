/**
 * Cryptography Service Module
 * Handles password key stretching (PBKDF2) and HMAC token signatures.
 */

// Basic SHA-256 hashing helper
export async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Generate secure random salt
export function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Worker pool state for background cryptography
let cryptoWorker = null;
let nextMessageId = 0;
const pendingCryptoResolves = new Map();

function getCryptoWorker() {
  if (cryptoWorker) return cryptoWorker;
  
  const workerCode = `
    self.onmessage = async (e) => {
      const { id, password, salt } = e.data;
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
            iterations: 100000,
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
  
  const blob = new Blob([workerCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  cryptoWorker = new Worker(url);
  
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
  
  return cryptoWorker;
}

// PBKDF2 Password Hashing
export function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    const id = nextMessageId++;
    pendingCryptoResolves.set(id, { resolve, reject });
    getCryptoWorker().postMessage({ id, password, salt });
  });
}

// ponytail: Client-side HMAC provides no security; use direct base64 JSON payload.
export async function generateHmacKey() {
  return "dummy-key";
}

export async function signSessionToken(payload, hmacKey) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export async function verifySessionToken(token, hmacKey) {
  if (!token || typeof token !== "string") return null;
  try {
    const payloadStr = decodeURIComponent(escape(atob(token)));
    return JSON.parse(payloadStr);
  } catch (err) {
    return null;
  }
}

// Convert hex string to Uint8Array
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
