import { defineConfig, devices } from "@playwright/test";

const API = 8789;
const STUDIO = 5175;
const WEB = 4175;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL: `http://localhost:${STUDIO}`, trace: "off", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: "pnpm --filter @coingist/api start:local",
      env: { PORT: String(API) },
      url: `http://localhost:${API}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Studio's dev sign-in only runs on the dev server (the production build refuses it).
      command: `pnpm exec react-router dev --port ${STUDIO} --strictPort`,
      env: {
        STUDIO_AUTH: "dev",
        API_URL: `http://localhost:${API}`,
        SITE_URL: `http://localhost:${WEB}`,
        STUDIO_URL: `http://localhost:${STUDIO}`,
      },
      url: `http://localhost:${STUDIO}/login`,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: "pnpm --filter @coingist/web build && pnpm --filter @coingist/web start",
      env: { PORT: String(WEB), API_URL: `http://localhost:${API}`, SITE_URL: `http://localhost:${WEB}` },
      url: `http://localhost:${WEB}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
