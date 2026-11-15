import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 4173;
const API_PORT = 8788;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "off" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      // Local API on in-memory Postgres with seed data (no Supabase needed).
      command: "pnpm --filter @coingist/api start:local",
      env: { PORT: String(API_PORT) },
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm build && pnpm start",
      env: {
        PORT: String(WEB_PORT),
        API_URL: `http://localhost:${API_PORT}`,
        SITE_URL: "https://coingist.test",
      },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
