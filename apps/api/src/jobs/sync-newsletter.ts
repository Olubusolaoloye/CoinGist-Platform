/**
 * Retries newsletter signups that haven't reached the newsletter tool yet. Run every few
 * minutes from a cron:  pnpm --filter @coingist/api job:sync-newsletter
 */
import { createNewsletterRepository, createPgDatabase } from "@coingist/db";
import { loadEnv } from "../env.js";
import { newsletterProviderFromEnv } from "../newsletter/from-env.js";
import { syncPending } from "../newsletter/sync.js";

const env = loadEnv();
const db = createPgDatabase(env.DATABASE_URL);
try {
  const result = await syncPending(createNewsletterRepository(db), newsletterProviderFromEnv(env));
  console.log(JSON.stringify({ job: "sync-newsletter", ...result }));
} finally {
  await db.close();
}
