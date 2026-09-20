import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test TAHFIZH — halaman publik tanpa kredensial.
 * Jalankan: bunx playwright test
 * (Base URL diambil dari env BASE_URL, default http://localhost:3000)
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
