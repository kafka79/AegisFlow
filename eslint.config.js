export default [
  { ignores: ["dist/", "node_modules/", "*.html", "workforces-overrides.js"] },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2024,
        crypto: "readonly",
        indexedDB: "readonly",
        BroadcastChannel: "readonly",
        Worker: "readonly",
        URL: "readonly",
        Blob: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Promise: "readonly",
        Map: "readonly",
        Set: "readonly",
        JSON: "readonly",
        Date: "readonly",
        Math: "readonly",
        Object: "readonly",
        Array: "readonly",
        String: "readonly",
        Number: "readonly",
        Error: "readonly",
        CSS: "readonly",
        URLSearchParams: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error"
    }
  }
];
