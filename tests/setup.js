// Test setup - runs before each test file
import { beforeEach, vi } from 'vitest';
import cryptoNode from 'crypto';

// Mock IndexedDB
const dbStores = {
  queue: new Map(),
  retry_queue: new Map(),
  sync_meta: new Map(),
  ack_queue: new Map(),
  server_state: new Map(),
  state: new Map(),
  audit_log: new Map(),
  employees: new Map(),
  attendance: new Map(),
  timeoff: new Map(),
  documents: new Map(),
  users: new Map(),
  config: new Map()
};
global.dbStores = dbStores;

global.indexedDB = {
  open: vi.fn((name, version) => {
    const db = {
      result: {
        createObjectStore: vi.fn(),
        transaction: vi.fn((storeNames, mode) => {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          const tx = {
            objectStore: vi.fn((storeName) => {
              const storeMap = dbStores[storeName] || new Map();
              return {
                add: vi.fn((item) => {
                  if (item.id === undefined) {
                    // Simple auto-increment
                    const ids = Array.from(storeMap.keys()).filter(k => typeof k === 'number');
                    item.id = ids.length > 0 ? Math.max(...ids) + 1 : 1;
                  }
                  storeMap.set(item.id, item);
                  setTimeout(() => tx.oncomplete?.(), 0);
                  const req = { result: item.id };
                  setTimeout(() => req.onsuccess?.({ target: req }), 0);
                  return req;
                }),
                put: vi.fn((item) => {
                  const key = storeName === "users"
                    ? item.employeeId
                    : (item.id ?? item.key ?? item.store ?? item.sequence);
                  storeMap.set(key, item);
                  setTimeout(() => tx.oncomplete?.(), 0);
                  const req = { result: key };
                  setTimeout(() => req.onsuccess?.({ target: req }), 0);
                  return req;
                }),
                get: vi.fn((key) => {
                  const req = { result: storeMap.get(key) };
                  setTimeout(() => tx.oncomplete?.(), 0);
                  setTimeout(() => req.onsuccess?.({ target: req }), 0);
                  return req;
                }),
                getAll: vi.fn(() => {
                  const req = { result: Array.from(storeMap.values()) };
                  setTimeout(() => tx.oncomplete?.(), 0);
                  setTimeout(() => req.onsuccess?.({ target: req }), 0);
                  return req;
                }),
                delete: vi.fn((key) => {
                  storeMap.delete(key);
                  setTimeout(() => tx.oncomplete?.(), 0);
                  const req = {};
                  setTimeout(() => req.onsuccess?.({ target: req }), 0);
                  return req;
                }),
                count: vi.fn(() => {
                  const req = { result: storeMap.size };
                  setTimeout(() => tx.oncomplete?.(), 0);
                  setTimeout(() => req.onsuccess?.({ target: req }), 0);
                  return req;
                }),
                createIndex: vi.fn(() => ({
                  getAll: vi.fn(() => {
                    const req = { result: Array.from(storeMap.values()) };
                    setTimeout(() => req.onsuccess?.({ target: req }), 0);
                    return req;
                  }),
                  openCursor: vi.fn(() => {
                    const values = Array.from(storeMap.values());
                    let currentIndex = 0;
                    const req = {};
                    const cursor = {
                      get value() {
                        return values[currentIndex];
                      },
                      continue: vi.fn(() => {
                        currentIndex++;
                        if (currentIndex < values.length) {
                          setTimeout(() => req.onsuccess?.({ target: { result: cursor } }), 0);
                        } else {
                          setTimeout(() => req.onsuccess?.({ target: { result: null } }), 0);
                        }
                      })
                    };
                    setTimeout(() => {
                      if (values.length > 0) {
                        req.onsuccess?.({ target: { result: cursor } });
                      } else {
                        req.onsuccess?.({ target: { result: null } });
                      }
                    }, 0);
                    return req;
                  })
                })),
                index: vi.fn(() => ({
                  getAll: vi.fn(() => {
                    const req = { result: Array.from(storeMap.values()) };
                    setTimeout(() => req.onsuccess?.({ target: req }), 0);
                    return req;
                  }),
                  openCursor: vi.fn(() => {
                    const values = Array.from(storeMap.values());
                    let currentIndex = 0;
                    const req = {};
                    const cursor = {
                      get value() {
                        return values[currentIndex];
                      },
                      continue: vi.fn(() => {
                        currentIndex++;
                        if (currentIndex < values.length) {
                          setTimeout(() => req.onsuccess?.({ target: { result: cursor } }), 0);
                        } else {
                          setTimeout(() => req.onsuccess?.({ target: { result: null } }), 0);
                        }
                      })
                    };
                    setTimeout(() => {
                      if (values.length > 0) {
                        req.onsuccess?.({ target: { result: cursor } });
                      } else {
                        req.onsuccess?.({ target: { result: null } });
                      }
                    }, 0);
                    return req;
                  })
                }))
              };
            }),
            oncomplete: null,
            onerror: null
          };
          return tx;
        }),
        objectStoreNames: { contains: vi.fn(() => true) }
      },
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null
    };
    setTimeout(() => db.onsuccess?.({ target: db }), 0);
    return db;
  })
};

// Mock IDBKeyRange
global.IDBKeyRange = {
  upperBound: vi.fn((value) => ({ upperBound: value, lowerBound: undefined, upperOpen: false })),
  lowerBound: vi.fn((value) => ({ lowerBound: value, upperBound: undefined, lowerOpen: false })),
  bound: vi.fn((lower, upper) => ({ lowerBound: lower, upperBound: upper, lowerOpen: false, upperOpen: false })),
  only: vi.fn((value) => ({ lowerBound: value, upperBound: value, lowerOpen: false, upperOpen: false }))
};

// Mock crypto.subtle
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      importKey: vi.fn().mockResolvedValue({}),
      deriveBits: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      sign: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      verify: vi.fn().mockResolvedValue(true),
      generateKey: vi.fn().mockResolvedValue({}),
      exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      encrypt: vi.fn().mockImplementation(async (algorithm, _key, data) => {
        const payload = {
          plaintext: Buffer.from(new Uint8Array(data)).toString('base64'),
          aad: Buffer.from(new Uint8Array(algorithm.additionalData || new Uint8Array())).toString('base64'),
          iv: Buffer.from(new Uint8Array(algorithm.iv || new Uint8Array())).toString('base64')
        };
        return new TextEncoder().encode(JSON.stringify(payload)).buffer;
      }),
      decrypt: vi.fn().mockImplementation(async (algorithm, _key, ciphertext) => {
        let payload;
        try {
          payload = JSON.parse(new TextDecoder().decode(ciphertext));
        } catch {
          throw new Error('Ciphertext authentication failed');
        }
        const aad = Buffer.from(new Uint8Array(algorithm.additionalData || new Uint8Array())).toString('base64');
        const iv = Buffer.from(new Uint8Array(algorithm.iv || new Uint8Array())).toString('base64');
        if (payload.aad !== aad) {
          throw new Error('Associated data mismatch');
        }
        if (payload.iv !== iv) {
          throw new Error('Ciphertext authentication failed');
        }
        return Uint8Array.from(Buffer.from(payload.plaintext, 'base64')).buffer;
      })
    },
    getRandomValues: vi.fn((arr) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    }),
    randomUUID: vi.fn(() => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }))
  },
  writable: true,
  configurable: true
});

// Mock localStorage
const storage = new Map();
global.localStorage = {
  getItem: vi.fn((key) => storage.get(key) || null),
  setItem: vi.fn((key, value) => storage.set(key, value)),
  removeItem: vi.fn((key) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  key: vi.fn((index) => Array.from(storage.keys())[index] ?? null),
  get length() {
    return storage.size;
  }
};

// Mock BroadcastChannel
global.BroadcastChannel = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  onmessage: null,
  close: vi.fn()
}));

// Mock Worker
global.Worker = vi.fn().mockImplementation(function() {
  const workerObj = {
    postMessage: vi.fn().mockImplementation(async function(data) {
      const { id, password, salt, iterations } = data;
      try {
        const result = cryptoNode
          .createHash('sha256')
          .update(`${password}:${salt}:${iterations || 600000}`)
          .digest('hex');
        setTimeout(() => {
          if (workerObj.onmessage) {
            workerObj.onmessage({ data: { id, success: true, result } });
          }
        }, 0);
      } catch (err) {
        setTimeout(() => {
          if (workerObj.onmessage) {
            workerObj.onmessage({ data: { id, success: false, error: err.message } });
          }
        }, 0);
      }
    }),
    onmessage: null,
    terminate: vi.fn()
  };
  return workerObj;
});

// Mock URL.createObjectURL/revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock');
global.URL.revokeObjectURL = vi.fn();

// Mock navigator
global.navigator = {
  onLine: true,
  connection: { downlink: 10 },
  serviceWorker: { ready: Promise.resolve({ sync: { register: vi.fn() } }) }
};

// Mock window
if (global.window) {
  Object.assign(global.window, {
    crypto: global.crypto,
    localStorage: global.localStorage,
    indexedDB: global.indexedDB,
    IDBKeyRange: global.IDBKeyRange,
    BroadcastChannel: global.BroadcastChannel,
    Worker: global.Worker,
    URL: global.URL,
    navigator: global.navigator,
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    escape: escape,
    unescape: unescape,
    JSON: JSON
  });
} else {
  global.window = {
    location: { hostname: 'localhost', protocol: 'http:', pathname: '/', search: '', hash: '' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    crypto: global.crypto,
    localStorage: global.localStorage,
    indexedDB: global.indexedDB,
    IDBKeyRange: global.IDBKeyRange,
    BroadcastChannel: global.BroadcastChannel,
    Worker: global.Worker,
    URL: global.URL,
    navigator: global.navigator,
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    escape: escape,
    unescape: unescape,
    JSON: JSON
  };
}

// Keep jsdom's real document when the test environment provides one.
if (!global.document?.body) {
  global.document = {
    createElement: vi.fn(() => ({
      innerHTML: '',
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      firstChild: null,
      className: '',
      classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() },
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      style: {},
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
      selectionStart: 0,
      selectionEnd: 0,
      value: '',
      tagName: 'DIV',
      parentElement: null,
      children: [],
      matches: vi.fn(() => false),
      closest: vi.fn(() => null),
      contains: vi.fn(() => false)
    })),
    getElementById: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => []),
    activeElement: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  storage.clear();
  if (typeof dbStores !== 'undefined') {
    for (const store of Object.values(dbStores)) {
      store.clear();
    }
  }
});
