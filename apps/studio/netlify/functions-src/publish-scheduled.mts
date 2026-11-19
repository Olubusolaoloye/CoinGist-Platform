/** Publishes scheduled posts that are due, every minute. Scheduled functions run on published deploys only. */
import { publishDueScheduled } from "@coingist/db";
import { createPgDatabase } from "@coingist/db/pg";

export default async () => {
  const url = process.env["DATABASE_URL"];
  if (!url) return void console.log("publish-scheduled: DATABASE_URL not set");
  const db = createPgDatabase(url, { max: 1 });
  try {
    const published = await publishDueScheduled(db);
    console.log(JSON.stringify({ job: "publish-scheduled", published }));
  } finally {
    await db.close();
  }
};

export const config = { schedule: "* * * * *" };
