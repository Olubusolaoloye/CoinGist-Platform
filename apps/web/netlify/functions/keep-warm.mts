/**
 * DEMO ONLY: request the home page every 5 minutes so one server instance stays warm.
 * The demo builds its sample database on cold start (~10 s); real deploys use Supabase and
 * don't need this. Scheduled functions run on published deploys only.
 */
import type { Config } from "@netlify/functions";

export default async () => {
  const site = Netlify.env.get("SITE_URL");
  if (!site) return;
  const started = Date.now();
  const res = await fetch(site, { headers: { "user-agent": "coingist-keep-warm" } }).catch(() => null);
  console.log(`keep-warm ${res?.status ?? "failed"} in ${Date.now() - started} ms`);
};

// Every 5 minutes (UTC; time zone doesn't matter for an interval).
export const config: Config = { schedule: "*/5 * * * *" };
