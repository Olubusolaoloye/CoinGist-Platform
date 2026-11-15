/**
 * Publishes scheduled posts that are due. Run every minute from a cron
 * (e.g. a Netlify scheduled function or Cloudflare Cron Trigger):
 *   pnpm --filter @coingist/api job:publish-scheduled
 */
import { createPgDatabase, publishDueScheduled } from "@coingist/db";

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is required");

const db = createPgDatabase(url);
try {
  const published = await publishDueScheduled(db);
  console.log(JSON.stringify({ job: "publish-scheduled", published }));
} finally {
  await db.close();
}
