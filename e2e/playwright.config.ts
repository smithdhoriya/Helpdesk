import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(dirname, "../server");
const clientDir = path.resolve(dirname, "../client");

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "bun run dev:test",
      cwd: serverDir,
      url: "http://localhost:4001/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bun run dev -- --port 5174 --mode test",
      cwd: clientDir,
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
