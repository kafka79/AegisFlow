import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3010"
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:3010/health",
    reuseExistingServer: false,
    env: { PORT: "3010", HOST: "127.0.0.1", WORKFORCES_MEMORY_DB: "1" }
  }
});
