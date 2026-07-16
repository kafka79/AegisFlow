/**
 * Minimal localStorage polyfill for Node backend/tests.
 */
export function ensureLocalStorage() {
  if (typeof globalThis.localStorage !== "undefined") return;

  const memory = new Map();
  globalThis.localStorage = {
    get length() {
      return memory.size;
    },
    key(index) {
      return Array.from(memory.keys())[index] || null;
    },
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
    removeItem(key) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    }
  };
}

export function resetLocalStoragePolyfill() {
  if (globalThis.localStorage?.clear) {
    globalThis.localStorage.clear();
  }
}
